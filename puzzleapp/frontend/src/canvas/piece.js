import { styleState } from "./state.js";
import { targetTopLeft } from "./interaction.js";

export class PuzzlePiece {
  constructor(img, x, y, r, c, idx, meta) {
    this.img = img; this.x = x; this.y = y;
    this.w = img.width; this.h = img.height; img.loadPixels();
    this.group = null; this.r = r; this.c = c; this.index = idx; this.meta = meta; this.solved = false; this.solvedAt = null; this.grabs = [];
    this.rotation = 0; // Current animated rotation in degrees (-180 to 180)
    this.rotationTarget = 0; // Target rotation for smooth animation
  }
  get sw() { return Math.max(1, Math.round(this.w * styleState.pieceScale)); }
  get sh() { return Math.max(1, Math.round(this.h * styleState.pieceScale)); }

  // Rotation methods
  rotate(degrees) {
    // Set target rotation and normalize to 0-360 range (for 90° increments)
    this.rotationTarget = ((this.rotationTarget + degrees) % 360 + 360) % 360;
  }

  isCorrectOrientation() {
    return Math.abs(this.rotation) < 1; // Target is always 0 degrees
  }

  // Check if piece is currently animating
  isAnimating() {
    return Math.abs(this.rotation - this.rotationTarget) >= 1;
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
