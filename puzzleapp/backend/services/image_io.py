import numpy as np
import cv2

def load_image_from_bytes(file_bytes):
    arr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Érvénytelen vagy sérült kép.")
    return img