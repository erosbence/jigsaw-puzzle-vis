import numpy as np
import cv2

def sort_to_grid(contours):
    if not contours:
        return [], 0, 0, []

    boxes = [cv2.boundingRect(c) for c in contours]
    centers = [(x + w/2.0, y + h/2.0) for (x,y,w,h) in boxes]
    hs = [h for (_,_,_,h) in boxes]
    med_h = np.median(hs) if hs else 1.0
    row_tol = max(1.0, 0.5 * med_h)

    idxs = list(range(len(contours)))
    idxs.sort(key=lambda i: (centers[i][1], centers[i][0]))

    rows_list, cur = [], [idxs[0]]
    cur_y = centers[idxs[0]][1]
    for i in idxs[1:]:
        y = centers[i][1]
        if abs(y - cur_y) > row_tol:
            rows_list.append(cur); cur = [i]; cur_y = y
        else:
            cur.append(i)
    rows_list.append(cur)

    for r in range(len(rows_list)):
        rows_list[r].sort(key=lambda i: centers[i][0])

    lengths = [len(rlist) for rlist in rows_list]
    cols = max(set(lengths), key=lengths.count)
    rows = len(rows_list)

    cleaned = []
    for rlist in rows_list:
        if len(rlist) == cols:
            cleaned.append(rlist)
        elif len(rlist) > cols:
            xs = np.array([centers[i][0] for i in rlist])
            xs_lin = np.linspace(xs.min(), xs.max(), cols)
            chosen, remain = [], list(rlist)
            for target in xs_lin:
                best = min(remain, key=lambda j: abs(centers[j][0] - target))
                chosen.append(best); remain.remove(best)
            chosen.sort(key=lambda j: centers[j][0])
            cleaned.append(chosen)
        else:
            cleaned.append(rlist)

    mapping = []
    for r, rlist in enumerate(cleaned):
        for c, i in enumerate(rlist[:cols]):
            mapping.append((i, r, c))
    mapping.sort(key=lambda t: (t[1], t[2]))
    return mapping, rows, cols, boxes