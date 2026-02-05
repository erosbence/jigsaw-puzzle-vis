import cv2

def to_binary_mask(mask_gray, thresh=128):
    _, binm = cv2.threshold(mask_gray, thresh, 255, cv2.THRESH_BINARY)
    # auto invert, ha a fehér kevesebb mint a fele
    if cv2.countNonZero(binm) < (binm.size // 2):
        binm = cv2.bitwise_not(binm)
    return binm

def ensure_gray(mask):
    return cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY) if mask.ndim == 3 else mask.copy()