import numpy as np
import cv2
from puzzleapp.backend.utils.encoding import encode_png_b64
from puzzleapp.backend.services.mask_processing import ensure_gray, to_binary_mask
from puzzleapp.backend.services.contour_filter import filter_real_pieces
from puzzleapp.backend.services.grid_sort import sort_to_grid

def extract_pieces_with_meta(image, mask):
    mg = ensure_gray(mask)
    binm = to_binary_mask(mg, 128)

    cnts, _ = cv2.findContours(binm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnts = filter_real_pieces(cnts)

    mapping, rows, cols, boxes = sort_to_grid(cnts)
    if not mapping:
        return [], 0, 0, {}

    xs  = [boxes[i][0] for (i,_,_) in mapping]
    ys  = [boxes[i][1] for (i,_,_) in mapping]
    x2s = [boxes[i][0] + boxes[i][2] for (i,_,_) in mapping]
    y2s = [boxes[i][1] + boxes[i][3] for (i,_,_) in mapping]

    meta = {
        "minX": int(min(xs)), "minY": int(min(ys)),
        "maxX": int(max(x2s)), "maxY": int(max(y2s))
    }

    pieces = []
    for _, (i, r, c) in enumerate(mapping):
        x, y, w, h = boxes[i]
        loc_mask = np.zeros((h, w), dtype=np.uint8)
        cnt_local = cnts[i] - np.array([[x, y]])
        cv2.drawContours(loc_mask, [cnt_local], -1, 255, thickness=cv2.FILLED)

        crop = image[y:y+h, x:x+w]
        if crop.ndim == 2:
            crop = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGRA)
        elif crop.shape[2] == 3:
            crop = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
        crop[:, :, 3] = loc_mask

        b64 = encode_png_b64(crop)
        if not b64:
            continue
        pieces.append({
            "b64": b64, "r": int(r), "c": int(c),
            "x": int(x), "y": int(y), "w": int(w), "h": int(h)
        })

    return pieces, int(rows), int(cols), meta