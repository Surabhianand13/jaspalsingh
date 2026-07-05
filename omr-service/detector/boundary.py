"""
boundary.py - locate the OMR sheet's outer rectangular boundary in a
photographed image, with no printed alignment/fiducial markers to rely on
(both real sheet designs reviewed have none). This mirrors the standard
"document scanner" technique: find edges, take the largest 4-point-
approximable contour, treat it as the sheet.
"""

import cv2
import numpy as np


def find_sheet_corners(image, min_area_fraction=0.35):
    """Returns a list of 4 (x, y) points for the sheet's outer boundary, or None."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 150)
    edged = cv2.dilate(edged, None, iterations=2)
    edged = cv2.erode(edged, None, iterations=1)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    image_area = image.shape[0] * image.shape[1]
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area_fraction * image_area:
            continue
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) == 4:
            return approx.reshape(4, 2).astype(float).tolist()

    return None
