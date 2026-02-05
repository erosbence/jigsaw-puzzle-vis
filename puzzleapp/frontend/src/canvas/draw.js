import { gridRectScaled } from "../ui/layout.js";
import { styleState, puzzleMeta } from "./state.js";

export function drawBackground(width, height) {
  background(245);
  if (puzzleMeta.maxX > puzzleMeta.minX && puzzleMeta.maxY > puzzleMeta.minY) {
    const { originX, originY, W, H } = gridRectScaled(width, height);
    push(); noFill(); stroke(225); strokeWeight(2);
    rect(originX + .5, originY + .5, W, H, 6); pop();
  }
}

export function drawPiece(piece, st) {
  const sw = piece.sw, sh = piece.sh;

  if (st.outline) {
    const r = Math.max(1, st.outlineW);
    push(); noStroke(); tint(0,0,0,200);
    for (let dx=-r; dx<=r; dx++)
      for (let dy=-r; dy<=r; dy++) {
        if (!dx && !dy) continue;
        const man = Math.abs(dx) + Math.abs(dy);
        if (man === r || (r > 1 && man >= r)) image(piece.img, piece.x+dx, piece.y+dy, sw, sh);
      }
    noTint(); pop();
  }

  if (st.shadow) {
    const k = st.shadowI / 100;
    push();
    drawingContext.shadowColor = `rgba(0,0,0,${0.18 + 0.22 * k})`;
    drawingContext.shadowBlur = 6 + Math.round(10 * k);
    drawingContext.shadowOffsetX = 2 + Math.round(4 * k);
    drawingContext.shadowOffsetY = 2 + Math.round(4 * k);
    image(piece.img, piece.x, piece.y, sw, sh);
    pop();
  } else {
    image(piece.img, piece.x, piece.y, sw, sh);
  }
}