import numpy as np
import cv2

def filter_real_pieces(contours, solidity_min=0.70, rel_min=0.55, rel_max=1.60):
    if not contours:
        return []

    areas = np.array([cv2.contourArea(c) for c in contours], dtype=np.float64)
    med_area = np.median(areas)
    keep = []

    for c, a in zip(contours, areas):
        if a < 1:
            continue
        hull = cv2.convexHull(c)
        ha = cv2.contourArea(hull)
        solidity = (a / ha) if ha > 0 else 0.0
        if (rel_min * med_area) <= a <= (rel_max * med_area) and solidity >= solidity_min:
            keep.append(c)

    if len(keep) < max(4, len(contours)//2):
        keep = contours
    return keep