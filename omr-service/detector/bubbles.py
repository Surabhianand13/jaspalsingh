"""
bubbles.py - darkness sampling and confident/ambiguous/blank classification
for a single bubble grid position (used for both answer options A-E and
roll-number digit bubbles 0-9 - it's the same problem either way: which one
of N candidate circles is filled in).
"""

FILL_THRESHOLD = 0.35    # darkness ratio below which a bubble counts as unmarked
MARGIN_THRESHOLD = 0.15  # required gap between darkest and 2nd-darkest to call it confident


def sample_fill_ratio(gray_image, x, y, radius=12):
    """Mean darkness (0=white, 1=black) in a small square ROI centered at (x, y)."""
    h, w = gray_image.shape[:2]
    x0, x1 = max(0, int(x - radius)), min(w, int(x + radius))
    y0, y1 = max(0, int(y - radius)), min(h, int(y + radius))
    if x1 <= x0 or y1 <= y0:
        return 0.0
    roi = gray_image[y0:y1, x0:x1]
    return float(1.0 - (roi.mean() / 255.0))


def classify(fill_ratios):
    """
    fill_ratios: { option_key: darkness_ratio }
    Returns (chosen_key_or_None, status) where status is one of
    'confident' | 'blank' | 'ambiguous'.
    """
    if not fill_ratios:
        return None, "blank"

    ranked = sorted(fill_ratios.items(), key=lambda kv: kv[1], reverse=True)
    darkest_key, darkest_val = ranked[0]
    second_val = ranked[1][1] if len(ranked) > 1 else 0.0

    if darkest_val < FILL_THRESHOLD:
        return None, "blank"
    if (darkest_val - second_val) < MARGIN_THRESHOLD:
        return None, "ambiguous"
    return darkest_key, "confident"
