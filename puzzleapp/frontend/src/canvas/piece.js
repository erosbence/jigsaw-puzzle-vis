import { styleState, puzzleMeta, puzzleGrid } from "./state.js";
import { targetTopLeft } from "./interaction.js";

export class PuzzlePiece {
  constructor(img, x, y, r, c, idx, meta) {
    this.img = img; this.x = x; this.y = y;
    this.w = img.width; this.h = img.height; img.loadPixels();
    this.group = null; this.r = r; this.c = c; this.index = idx; this.meta = meta; this.solved = false; this.solvedAt = null; this.grabs = [];
    this.rotation = 0; // Current animated rotation in degrees (-180 to 180)
    this.rotationTarget = 0; // Target rotation for smooth animation
    this.rotationCount = 0; // How many times the piece was rotated
  }
  get sw() { return Math.max(1, Math.round(this.w * styleState.pieceScale)); }
  get sh() { return Math.max(1, Math.round(this.h * styleState.pieceScale)); }

  // Rotation methods
  rotate(degrees) {
    // Set target rotation and normalize to 0-360 range (for 90° increments)
    this.rotationTarget = ((this.rotationTarget + degrees) % 360 + 360) % 360;
    this.rotationCount = (this.rotationCount || 0) + 1;
  }

  isCorrectOrientation() {
    return Math.abs(this.rotation) < 1; // Target is always 0 degrees
  }

  // Check if piece is currently animating
  isAnimating() {
    // Must normalize delta the same way updateRotationAnimation does,
    // because rotation (-180..180) and rotationTarget (0..360) use different ranges.
    let delta = this.rotationTarget - this.rotation;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return Math.abs(delta) >= 1;
  }

  // Animate rotation towards target
  updateRotationAnimation() {
    if (!this.isAnimating()) {
      this.rotation = this.rotationTarget;
      return;
    }
    // Calculate shortest angular distance
    let delta = this.rotationTarget - this.rotation;
    // Normalize delta to -180 to 180 range (shortest path)
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    // Smooth interpolation (lerp) along shortest path
    const t = 0.2; // Animation speed (0.2 = 20% per frame)
    this.rotation = this.rotation + delta * t;

    // Normalize rotation to -180 to 180 range
    if (this.rotation > 180) this.rotation -= 360;
    if (this.rotation < -180) this.rotation += 360;
  }

  canRotate() {
    // Can only rotate if not solved and piece is alone (not in a merged group)
    return !this.solved && (!this.group || this.group.members.size === 1);
  }

  // Position-based piece type classification
  getPieceType(rows, cols) {
    const onTop = this.r === 0, onBottom = this.r === rows - 1;
    const onLeft = this.c === 0, onRight = this.c === cols - 1;
    const flat = (onTop ? 1 : 0) + (onBottom ? 1 : 0) + (onLeft ? 1 : 0) + (onRight ? 1 : 0);
    if (flat >= 2) return "corner";
    if (flat === 1) return "edge";
    return "interior";
  }

  // Edge configuration from alpha channel: { top, right, bottom, left } each "flat"|"tab"|"blank"
  analyzeEdges(rows, cols) {
    if (this._edgeConfig) return this._edgeConfig;
    this._edgeConfig = {
      top:    this.r === 0            ? "flat" : this._detectEdge("top"),
      right:  this.c === cols - 1     ? "flat" : this._detectEdge("right"),
      bottom: this.r === rows - 1     ? "flat" : this._detectEdge("bottom"),
      left:   this.c === 0            ? "flat" : this._detectEdge("left")
    };
    return this._edgeConfig;
  }

  // Signature string like "FTBF"
  getEdgeSignature(rows, cols) {
    const e = this.analyzeEdges(rows, cols);
    const m = { flat: "F", tab: "T", blank: "B" };
    return m[e.top] + m[e.right] + m[e.bottom] + m[e.left];
  }

  // Detect tab vs blank on a non-flat edge by sampling alpha in the outer
  // band at the TRUE base-cell centre.  The grid metadata (puzzleMeta) and
  // the piece's original bounding box (this.meta) let us compute where the
  // base cell centre falls in the piece's local pixel coordinates, so the
  // sampling window is immune to shifts caused by orthogonal tab protrusions.
  //  – Tab: opaque at base-cell centre of the outer band  → ratio high → "tab"
  //  – Blank: transparent (socket opening) at the same spot → ratio low  → "blank"
  _detectEdge(side) {
    const px = this.img.pixels;
    const w = this.w, h = this.h;
    if (!px || !w || !h) return "blank";

    // --- Compute the base-cell centre in local pixel coords ---------------
    const gw = puzzleMeta.maxX - puzzleMeta.minX;
    const gh = puzzleMeta.maxY - puzzleMeta.minY;
    const cellW = gw / puzzleGrid.cols;
    const cellH = gh / puzzleGrid.rows;
    // Global centre of this piece's base cell
    const gcx = puzzleMeta.minX + (this.c + 0.5) * cellW;
    const gcy = puzzleMeta.minY + (this.r + 0.5) * cellH;
    // Convert to local image coordinates
    const lcx = gcx - this.meta.x;          // centre X in piece image
    const lcy = gcy - this.meta.y;          // centre Y in piece image

    const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
    // Sampling half-window: 10 % of the base cell dimension (narrow, centred)
    const hwX = Math.max(4, Math.round(cellW * 0.10));
    const hwY = Math.max(4, Math.round(cellH * 0.10));

    let opaque = 0, total = 0;

    if (side === "top") {
      const x0 = Math.max(0, Math.round(lcx - hwX));
      const x1 = Math.min(w, Math.round(lcx + hwX));
      for (let y = 0; y < band && y < h; y++)
        for (let x = x0; x < x1; x++) { if (px[4 * (y * w + x) + 3] > 10) opaque++; total++; }
    } else if (side === "bottom") {
      const x0 = Math.max(0, Math.round(lcx - hwX));
      const x1 = Math.min(w, Math.round(lcx + hwX));
      for (let y = Math.max(0, h - band); y < h; y++)
        for (let x = x0; x < x1; x++) { if (px[4 * (y * w + x) + 3] > 10) opaque++; total++; }
    } else if (side === "left") {
      const y0 = Math.max(0, Math.round(lcy - hwY));
      const y1 = Math.min(h, Math.round(lcy + hwY));
      for (let y = y0; y < y1; y++)
        for (let x = 0; x < band && x < w; x++) { if (px[4 * (y * w + x) + 3] > 10) opaque++; total++; }
    } else {
      const y0 = Math.max(0, Math.round(lcy - hwY));
      const y1 = Math.min(h, Math.round(lcy + hwY));
      for (let y = y0; y < y1; y++)
        for (let x = Math.max(0, w - band); x < w; x++) { if (px[4 * (y * w + x) + 3] > 10) opaque++; total++; }
    }

    return (total > 0 && opaque / total > 0.3) ? "tab" : "blank";
  }

  hit(px, py) {
    const rot = this.rotation || 0;

    // Fast bounding box check first (works for all cases)
    if (Math.abs(rot) < 0.5) {
      // No significant rotation, use simple rect check
      if (px < this.x || py < this.y || px >= this.x + this.sw || py >= this.y + this.sh) return false;
    } else {
      // Quick rotated bounding box check
      const cx = this.x + this.sw / 2;
      const cy = this.y + this.sh / 2;
      const dx = px - cx;
      const dy = py - cy;
      const maxDist = Math.sqrt(this.sw * this.sw + this.sh * this.sh) / 2;
      if (Math.hypot(dx, dy) > maxDist) return false;
    }

    // Detailed alpha check
    if (Math.abs(rot) < 0.5) {
      // No rotation path
      const u = (px - this.x) / this.sw, v = (py - this.y) / this.sh;
      const ix = Math.floor(u * this.w), iy = Math.floor(v * this.h);
      if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return false;
      const a = this.img.pixels[4 * (iy * this.w + ix) + 3];
      return a > 10;
    }

    // With rotation, apply inverse transform
    const cx = this.x + this.sw / 2;
    const cy = this.y + this.sh / 2;
    const dx = px - cx;
    const dy = py - cy;

    // Rotate back (inverse rotation)
    const angleRad = -(rot * Math.PI / 180);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const localX = dx * cosA - dy * sinA;
    const localY = dx * sinA + dy * cosA;

    // Check if within bounding box in local space
    const halfW = this.sw / 2;
    const halfH = this.sh / 2;
    if (localX < -halfW || localX >= halfW || localY < -halfH || localY >= halfH) return false;

    // Convert to texture coordinates
    const u = (localX + halfW) / this.sw;
    const v = (localY + halfH) / this.sh;
    const ix = Math.floor(u * this.w);
    const iy = Math.floor(v * this.h);

    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return false;
    const a = this.img.pixels[4 * (iy * this.w + ix) + 3];
    return a > 10;
  }
  draw(drawPiece) { drawPiece(this, styleState); }
  moveTo(x, y) { this.x = x; this.y = y; }
  moveToTarget() { const {x,y} = targetTopLeft(this); this.moveTo(x,y); }
}
