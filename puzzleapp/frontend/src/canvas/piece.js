import { styleState } from "./state.js";
import { targetTopLeft } from "./interaction.js";

export class PuzzlePiece {
  constructor(img, x, y, r, c, idx, meta) {
    this.img = img; this.x = x; this.y = y;
    this.w = img.width; this.h = img.height; img.loadPixels();
    this.group = null; this.r = r; this.c = c; this.index = idx; this.meta = meta; this.solved = false; this.solvedAt = null; this.grabs = [];
  }
  get sw() { return Math.max(1, Math.round(this.w * styleState.pieceScale)); }
  get sh() { return Math.max(1, Math.round(this.h * styleState.pieceScale)); }
  hit(px, py) {
    if (px < this.x || py < this.y || px >= this.x + this.sw || py >= this.y + this.sh) return false;
    const u = (px - this.x) / this.sw, v = (py - this.y) / this.sh;
    const ix = Math.floor(u * this.w), iy = Math.floor(v * this.h);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return false;
    const a = this.img.pixels[4 * (iy * this.w + ix) + 3];
    return a > 10;
  }
  draw(drawPiece) { drawPiece(this, styleState); }
  moveTo(x, y) { this.x = x; this.y = y; }
  moveToTarget() { const {x,y} = targetTopLeft(this); this.moveTo(x,y); }
}
