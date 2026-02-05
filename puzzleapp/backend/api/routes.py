from flask import request, jsonify
from . import api_bp
from puzzleapp.backend.services.image_io import load_image_from_bytes
from puzzleapp.backend.services.piece_extract import extract_pieces_with_meta
import cv2

@api_bp.route("/upload", methods=["POST"])
def upload():
    if "image" not in request.files or "mask" not in request.files:
        return jsonify({"error": "Mindkét fájlt (image, mask) fel kell tölteni."}), 400

    img_bytes = request.files["image"].read()
    mask_bytes = request.files["mask"].read()

    try:
        image = load_image_from_bytes(img_bytes)
        mask = load_image_from_bytes(mask_bytes)
    except Exception as e:
        return jsonify({"error": f"Képbetöltési hiba: {e}"}), 400

    if mask.shape[:2] != image.shape[:2]:
        mask = cv2.resize(mask, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)

    pieces, rows, cols, meta = extract_pieces_with_meta(image, mask)
    if not pieces:
        return jsonify({"error": "Nem sikerült puzzle darabokat előállítani."}), 400

    return jsonify({"rows": rows, "cols": cols, "meta": meta, "pieces": pieces})
