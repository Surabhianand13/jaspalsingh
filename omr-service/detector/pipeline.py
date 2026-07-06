"""
pipeline.py - orchestrates a full /detect run: fetch -> find sheet boundary ->
perspective-correct -> sample bubbles -> classify -> return JSON-ready result.
"""

import base64
import cv2
import numpy as np
import requests

from .boundary import find_sheet_corners
from .geometry import (
    perspective_transform,
    compute_skew_angle,
    build_question_positions,
    build_roll_number_positions,
)
from .bubbles import sample_fill_ratio, classify

MAX_WORKING_DIM = 1600
HIGH_SKEW_DEGREES = 25
OUT_OF_BOUNDS_FAILURE_FRACTION = 0.15


def fetch_image(image_url):
    resp = requests.get(image_url, timeout=20)
    resp.raise_for_status()
    arr = np.frombuffer(resp.content, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image from the given URL.")
    return image


def _downscale(image, max_dim=MAX_WORKING_DIM):
    h, w = image.shape[:2]
    scale = min(1.0, max_dim / float(max(h, w)))
    if scale < 1.0:
        image = cv2.resize(image, (int(w * scale), int(h * scale)))
    return image


def run_detect(image_url, template, total_questions):
    image = _downscale(fetch_image(image_url))

    corners = find_sheet_corners(image)
    if corners is None:
        return {
            "success": False,
            "error": "sheet_boundary_not_found",
            "message": "Could not detect the sheet's 4 corners. Please retake the photo "
                       "with the full sheet visible against a plain, well-lit background.",
        }

    canonical_size = (int(template["canonical_width"]), int(template["canonical_height"]))
    corner_points = [(p["x"], p["y"]) for p in template["corner_points"]]
    skew_angle = compute_skew_angle(corners)

    warped = perspective_transform(image, corners, corner_points, canonical_size)
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    cw, ch = canonical_size

    option_count = template.get("option_count", 5)
    positions = build_question_positions(template["question_blocks"], option_count)

    answers = {}
    out_of_bounds = 0

    for q_str, opts in positions.items():
        if int(q_str) > total_questions:
            continue

        fill_ratios = {}
        in_bounds = True
        for opt, (x, y) in opts.items():
            if x < 0 or x >= cw or y < 0 or y >= ch:
                in_bounds = False
                break
            fill_ratios[opt] = sample_fill_ratio(gray, x, y)

        if not in_bounds:
            out_of_bounds += 1
            answers[q_str] = {"answer": None, "status": "out_of_bounds", "fill_ratios": {}}
            continue

        answer, status = classify(fill_ratios)
        answers[q_str] = {"answer": answer, "status": status, "fill_ratios": fill_ratios}

    if total_questions and out_of_bounds > total_questions * OUT_OF_BOUNDS_FAILURE_FRACTION:
        return {
            "success": False,
            "error": "incomplete_sheet_crop",
            "message": "Too many questions fell outside the detected sheet area - the photo "
                       "may be cropped or the sheet not fully visible.",
        }

    roll_number = None
    if template.get("roll_number_grid"):
        roll_positions = build_roll_number_positions(template["roll_number_grid"])
        digits = []
        all_confident = True
        for digit_index in sorted(roll_positions.keys()):
            fill_ratios = {v: sample_fill_ratio(gray, x, y) for v, (x, y) in roll_positions[digit_index].items()}
            value, status = classify(fill_ratios)
            digits.append(value if value is not None else "?")
            if status != "confident":
                all_confident = False
        roll_number = {"value": "".join(digits), "status": "confident" if all_confident else "ambiguous"}

    warnings = []
    if skew_angle > HIGH_SKEW_DEGREES:
        warnings.append("high_skew_detected")

    _, buf = cv2.imencode(".jpg", warped, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    rectified_b64 = base64.b64encode(buf).decode("utf-8")

    return {
        "success": True,
        "rectified_image_base64": rectified_b64,
        "skew_angle_deg": round(skew_angle, 1),
        "answers": answers,
        "roll_number": roll_number,
        "warnings": warnings,
    }


def run_calibration_preview(image_url, corner_points, question_blocks, option_count=5):
    """
    Draws the interpolated bubble-center grid + sheet corners directly onto the
    reference image, so an admin can visually confirm calibration before saving.
    """
    image = fetch_image(image_url)
    preview = image.copy()

    if question_blocks:
        positions = build_question_positions(question_blocks, option_count)
        for opts in positions.values():
            for (x, y) in opts.values():
                cv2.circle(preview, (int(x), int(y)), 6, (0, 0, 255), 2)

    if corner_points and len(corner_points) == 4:
        pts = np.array([[p["x"], p["y"]] for p in corner_points], dtype=np.int32)
        cv2.polylines(preview, [pts], True, (255, 0, 0), 3)

    _, buf = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    return base64.b64encode(buf).decode("utf-8")
