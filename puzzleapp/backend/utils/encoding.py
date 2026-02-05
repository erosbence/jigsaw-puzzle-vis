import base64
import cv2

def encode_png_b64(img_bgra):
    ok, buf = cv2.imencode(".png", img_bgra)
    if not ok:
        return None
    return base64.b64encode(buf).decode("utf-8")