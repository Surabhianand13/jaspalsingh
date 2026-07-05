"""
geometry.py - corner ordering, perspective correction, and calibration-anchor
interpolation for the OMR detector.

A "template" is calibrated once (by an admin clicking a handful of anchor
points on a clean reference sheet image) and reused across many photographed
submissions of the same physical sheet design. Anchors are stored in the
reference image's own raw pixel space; incoming photos are perspective-warped
onto that exact same coordinate frame (see perspective_transform), so anchor
positions apply unchanged to every submission.
"""

import numpy as np
import cv2


def order_points(pts):
    """Order 4 arbitrary points as top-left, top-right, bottom-right, bottom-left."""
    pts = np.array(pts, dtype="float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype="float32")


def perspective_transform(image, src_points, dst_points, output_size):
    """
    Warps `image` so that the quadrilateral `src_points` (detected in the photo)
    lands exactly on `dst_points` (the template's calibrated sheet corners, in
    the reference image's coordinate space), producing an image of `output_size`
    that matches the reference frame used for all calibrated bubble anchors.
    """
    src = order_points(src_points)
    dst = order_points(dst_points)
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(image, matrix, output_size)


def compute_skew_angle(src_points):
    """Rough skew estimate (degrees) from the detected quad's top edge."""
    ordered = order_points(src_points)
    tl, tr = ordered[0], ordered[1]
    dx, dy = float(tr[0] - tl[0]), float(tr[1] - tl[1])
    angle = np.degrees(np.arctan2(dy, dx))
    return abs(angle)


def build_question_positions(question_blocks, option_count):
    """
    Returns { "1": {"A": (x,y), "B": (x,y), ...}, "2": {...}, ... }

    Each block gives two calibrated anchors - the center of the first
    question's first option (top_left_anchor) and the last question's last
    option (bottom_right_anchor) in that block. Row spacing (between
    questions) and column spacing (between options) are each derived
    independently by linear interpolation, assuming an axis-aligned grid
    (true once the image has been perspective-corrected).
    """
    positions = {}
    for block in question_blocks:
        start_q = int(block["start_question"])
        end_q = int(block["end_question"])
        tl = block["top_left_anchor"]
        br = block["bottom_right_anchor"]
        option_order = block.get("option_order") or ["A", "B", "C", "D", "E"][:option_count]

        n_rows = end_q - start_q  # gaps, not count
        n_cols = len(option_order) - 1

        # Axis-aligned grid assumption (holds once the image is perspective-corrected):
        # rows move purely vertically, columns move purely horizontally. Treating the
        # anchor vector as a single diagonal step would double-count displacement, since
        # bottom_right = top_left + n_rows*row_step + n_cols*col_step, not one combined step.
        row_pitch = (br["y"] - tl["y"]) / n_rows if n_rows else 0
        col_pitch = (br["x"] - tl["x"]) / n_cols if n_cols else 0

        for q in range(start_q, end_q + 1):
            row_index = q - start_q
            base_y = tl["y"] + row_pitch * row_index
            opts = {}
            for col_index, opt in enumerate(option_order):
                opts[opt] = (tl["x"] + col_pitch * col_index, base_y)
            positions[str(q)] = opts
    return positions


def build_roll_number_positions(roll_number_grid):
    """
    Returns { 0: {"0": (x,y), "1": (x,y), ..., "9": (x,y)}, 1: {...}, ... }
    keyed by 0-indexed digit column.
    """
    tl = roll_number_grid["top_left_anchor"]   # digit 1, value 0
    br = roll_number_grid["bottom_right_anchor"]  # digit N, value 9
    digit_count = int(roll_number_grid["digit_count"])

    n_cols = digit_count - 1
    n_rows = 9  # values 0-9

    # Same axis-aligned assumption as build_question_positions: digits (columns) move
    # purely horizontally, values (rows) move purely vertically.
    col_pitch = (br["x"] - tl["x"]) / n_cols if n_cols else 0
    row_pitch = (br["y"] - tl["y"]) / n_rows if n_rows else 0

    positions = {}
    for digit_index in range(digit_count):
        base_x = tl["x"] + col_pitch * digit_index
        values = {}
        for value in range(10):
            values[str(value)] = (base_x, tl["y"] + row_pitch * value)
        positions[digit_index] = values
    return positions
