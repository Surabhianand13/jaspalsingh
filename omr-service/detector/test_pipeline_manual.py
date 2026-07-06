"""
Manual synthetic test (not part of any test suite / CI - this repo has none).
Generates a fake OMR sheet in memory, "photographs" it with a slight rotation
and perspective skew, and runs it through the real detection pipeline to
confirm the whole boundary -> perspective-correct -> sample -> classify chain
produces the expected answers. Run directly with:
    python3 detector/test_pipeline_manual.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import numpy as np

from detector.boundary import find_sheet_corners
from detector.geometry import perspective_transform, build_question_positions, compute_skew_angle
from detector.bubbles import sample_fill_ratio, classify

SHEET_W, SHEET_H = 1000, 1400
MARGIN = 60
N_QUESTIONS = 12  # small synthetic sheet: 2 blocks of 6 questions x 5 options
OPTIONS = ["A", "B", "C", "D", "E"]

KNOWN_ANSWERS = {str(q): OPTIONS[q % 5] for q in range(1, N_QUESTIONS + 1)}
BLANK_QUESTIONS = {5, 11}  # leave these unmarked to test blank detection


def build_reference_sheet():
    """A clean, unrotated synthetic sheet: white background, black border,
    two 6-question blocks of 5 option-bubbles each, with the correct answer
    bubble filled in (per KNOWN_ANSWERS) so the "photo" already has marks."""
    img = np.full((SHEET_H, SHEET_W, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (MARGIN, MARGIN), (SHEET_W - MARGIN, SHEET_H - MARGIN), (0, 0, 0), 3)

    question_blocks = []
    # find_sheet_corners() locks onto the outermost high-contrast boundary in a
    # photo, which is the physical PAPER edge against the background - not any
    # printed border line inset from it. corner_points must therefore calibrate
    # to the sheet's true outer edge (here, the full canvas), matching how a
    # real admin would click the actual paper corners, not a printed box.
    corner_points = [
        {"x": 0, "y": 0}, {"x": SHEET_W, "y": 0},
        {"x": SHEET_W, "y": SHEET_H}, {"x": 0, "y": SHEET_H},
    ]

    block_defs = [(1, 6, 200), (7, 12, 600)]  # (start_q, end_q, block_x_offset)
    row_pitch = 150
    col_pitch = 60
    top_y = 250

    for start_q, end_q, x_off in block_defs:
        tl = {"x": MARGIN + x_off, "y": top_y}
        br = {"x": MARGIN + x_off + col_pitch * (len(OPTIONS) - 1), "y": top_y + row_pitch * (end_q - start_q)}
        question_blocks.append({
            "start_question": start_q, "end_question": end_q,
            "top_left_anchor": tl, "bottom_right_anchor": br,
            "option_order": OPTIONS,
        })

    positions = build_question_positions(question_blocks, 5)
    for q_str, opts in positions.items():
        q = int(q_str)
        cv2.putText(img, q_str, (int(opts["A"][0]) - 40, int(opts["A"][1]) + 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
        for opt, (x, y) in opts.items():
            cv2.circle(img, (int(x), int(y)), 15, (0, 0, 0), 2)
            if q in BLANK_QUESTIONS:
                continue
            if opt == KNOWN_ANSWERS[q_str]:
                cv2.circle(img, (int(x), int(y)), 11, (0, 0, 0), -1)  # filled bubble

    return img, question_blocks, corner_points


def photograph(img):
    """Simulate a phone photo: rotate slightly, add a perspective skew, and
    paste onto a larger dark background (like a desk/table around the sheet)."""
    h, w = img.shape[:2]
    pad = 250
    canvas = np.full((h + pad * 2, w + pad * 2, 3), 40, dtype=np.uint8)
    canvas[pad:pad + h, pad:pad + w] = img

    center = (canvas.shape[1] // 2, canvas.shape[0] // 2)
    rot_matrix = cv2.getRotationMatrix2D(center, 6, 1.0)  # 6 degree rotation
    rotated = cv2.warpAffine(canvas, rot_matrix, (canvas.shape[1], canvas.shape[0]), borderValue=(40, 40, 40))
    return rotated


def main():
    reference_img, question_blocks, corner_points = build_reference_sheet()
    photo = photograph(reference_img)

    corners = find_sheet_corners(photo)
    assert corners is not None, "FAILED: could not find sheet boundary in synthetic photo"
    print("Detected corners:", corners)
    print("Skew angle: %.1f deg" % compute_skew_angle(corners))

    dst_points = [(p["x"], p["y"]) for p in corner_points]
    warped = perspective_transform(photo, corners, dst_points, (SHEET_W, SHEET_H))
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    positions = build_question_positions(question_blocks, 5)
    correct, wrong, blank_correct, blank_wrong = 0, 0, 0, 0

    for q_str, opts in positions.items():
        q = int(q_str)
        fill_ratios = {opt: sample_fill_ratio(gray, x, y) for opt, (x, y) in opts.items()}
        answer, status = classify(fill_ratios)

        if q in BLANK_QUESTIONS:
            if status == "blank":
                blank_correct += 1
            else:
                blank_wrong += 1
                print(f"  Q{q}: expected BLANK, got {answer} ({status}) - ratios={fill_ratios}")
        else:
            expected = KNOWN_ANSWERS[q_str]
            if answer == expected:
                correct += 1
            else:
                wrong += 1
                print(f"  Q{q}: expected {expected}, got {answer} ({status}) - ratios={fill_ratios}")

    total_marked = N_QUESTIONS - len(BLANK_QUESTIONS)
    print(f"\nMarked questions: {correct}/{total_marked} correct")
    print(f"Blank questions:  {blank_correct}/{len(BLANK_QUESTIONS)} correctly detected as blank")

    assert correct == total_marked, "Some marked answers were misdetected"
    assert blank_correct == len(BLANK_QUESTIONS), "Some blank questions were misdetected"
    print("\nPASSED: full pipeline correctly recovered all answers after rotation + perspective placement.")


if __name__ == "__main__":
    main()
