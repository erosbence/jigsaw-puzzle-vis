import { gridRectScaled } from "../ui/layout.js";
import { styleState, puzzleMeta, listPieces, listGroups, replaceGroups, gameSettings } from "./state.js";

export function targetTopLeft(piece) {
  const { originX, originY, s } = gridRectScaled(width, height);
  const tx = originX + (piece.meta.x - puzzleMeta.minX) * s;
  const ty = originY + (piece.meta.y - puzzleMeta.minY) * s;
  return { x: Math.round(tx), y: Math.round(ty) };
}

export function clampPiece(p) {
  p.x = Math.max(0, Math.min(p.x, width - p.sw));
  p.y = Math.max(0, Math.min(p.y, height - p.sh));
}

export function clampPieceOutsideGrid(p) {
  // First clamp to canvas bounds
  clampPiece(p);

  // Get grid area
  const { originX, originY, W, H } = gridRectScaled(width, height);
  const margin = 30;

  const gridLeft = originX - margin;
  const gridRight = originX + W + margin;
  const gridTop = originY - margin;
  const gridBottom = originY + H + margin;

  // Check if piece overlaps with forbidden area
  const pieceRight = p.x + p.sw;
  const pieceBottom = p.y + p.sh;

  // If piece is inside forbidden area, push it to nearest edge
  if (p.x < gridRight && pieceRight > gridLeft && p.y < gridBottom && pieceBottom > gridTop) {
    // Calculate distances to each edge
    const distLeft = p.x - gridLeft;
    const distRight = gridRight - pieceRight;
    const distTop = p.y - gridTop;
    const distBottom = gridBottom - pieceBottom;

    // Find minimum distance (which edge is closest)
    const minDist = Math.min(
      distLeft >= 0 ? distLeft : Infinity,
      distRight >= 0 ? distRight : Infinity,
      distTop >= 0 ? distTop : Infinity,
      distBottom >= 0 ? distBottom : Infinity
    );

    // Push to nearest edge
    if (minDist === distLeft && distLeft >= 0) {
      p.x = Math.max(0, gridLeft - p.sw);
    } else if (minDist === distRight && distRight >= 0) {
      p.x = Math.min(width - p.sw, gridRight);
    } else if (minDist === distTop && distTop >= 0) {
      p.y = Math.max(0, gridTop - p.sh);
    } else if (minDist === distBottom && distBottom >= 0) {
      p.y = Math.min(height - p.sh, gridBottom);
    } else {
      // If all distances negative (piece fully inside), push to closest edge by absolute value
      const absDistLeft = Math.abs(gridLeft - p.sw);
      const absDistRight = Math.abs(gridRight - (width - p.sw));
      const absDistTop = Math.abs(gridTop - p.sh);
      const absDistBottom = Math.abs(gridBottom - (height - p.sh));

      const minAbsDist = Math.min(absDistLeft, absDistRight, absDistTop, absDistBottom);

      if (minAbsDist === absDistLeft) p.x = Math.max(0, gridLeft - p.sw);
      else if (minAbsDist === absDistRight) p.x = Math.min(width - p.sw, gridRight);
      else if (minAbsDist === absDistTop) p.y = Math.max(0, gridTop - p.sh);
      else p.y = Math.min(height - p.sh, gridBottom);
    }

    // Final clamp to canvas bounds
    clampPiece(p);
  }
}

export function groupAlphaHit(g, px, py) {
  const b = g.getBounds();
  if (px < b.x || py < b.y || px > b.x + b.w || py > b.y + b.h) return false;
  const arr = Array.from(g.members);
  // Check pieces in reverse order (top to bottom in z-order)
  // but skip pieces that are clearly outside click area for quick rejection
  for (let i = arr.length - 1; i >= 0; i--) {
    const piece = arr[i];
    // Quick bounding box pre-check before expensive hit test
    if (px < piece.x || py < piece.y || px >= piece.x + piece.sw || py >= piece.y + piece.sh) continue;
    if (piece.hit(px, py)) return true;
  }
  return false;
}

export function averagePieceDiagonal() {
  const pieces = listPieces();
  if (!pieces.length) return 100;
  const ds = pieces.map(p => Math.hypot(p.sw, p.sh)).sort((a,b)=>a-b);
  return ds[Math.floor(ds.length/2)] || 100;
}

export function mergeWithSolvedNeighbors(piece) {
  // Only merge if piece has correct orientation (when rotation is enabled)
  if (gameSettings.rotationEnabled && !piece.isCorrectOrientation()) {
    return;
  }

  const pieces = listPieces();
  const dirs = [{dr:0,dc:-1}, {dr:0,dc:1}, {dr:-1,dc:0}, {dr:1,dc:0}];
  for (const d of dirs) {
    const nr = piece.r + d.dr, nc = piece.c + d.dc;
    const np = pieces.find(pp => pp.r === nr && pp.c === nc);
    if (!np || !np.solved) continue;
    piece.moveToTarget(); np.moveToTarget();
    if (piece.group !== np.group) piece.group.merge(np.group);
  }
}

export function shufflePieces(newGroupFactory) {
  let groups = [];
  const pieces = listPieces();
  pieces.forEach(p => { p.solved = false; p.solvedAt = null; p.grabs = []; });

  // Apply random rotation if enabled
  if (gameSettings.rotationEnabled) {
    const rotations = [0, 90, 180, 270];
    pieces.forEach(p => {
      const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];
      p.rotation = randomRotation;
      p.rotationTarget = randomRotation;
    });
  }

  for (const p of pieces) groups.push(newGroupFactory(p));

  // Get target area to avoid
  const { originX, originY, W, H } = gridRectScaled(width, height);
  const margin = 30;

  for (const g of groups) {
    const b = g.getBounds();

    // Define forbidden area
    const gridLeft = originX - margin;
    const gridRight = originX + W + margin;
    const gridTop = originY - margin;
    const gridBottom = originY + H + margin;

    // Available areas
    const areas = [];

    if (gridLeft > b.w) {
      areas.push({ minX: 0, maxX: gridLeft - b.w, minY: 0, maxY: height - b.h });
    }
    if (width - gridRight > b.w) {
      areas.push({ minX: gridRight, maxX: width - b.w, minY: 0, maxY: height - b.h });
    }
    if (gridTop > b.h) {
      areas.push({ minX: 0, maxX: width - b.w, minY: 0, maxY: gridTop - b.h });
    }
    if (height - gridBottom > b.h) {
      areas.push({ minX: 0, maxX: width - b.w, minY: gridBottom, maxY: height - b.h });
    }

    // Pick random position
    let targetX, targetY;
    if (areas.length > 0) {
      const area = areas[Math.floor(Math.random() * areas.length)];
      targetX = area.minX + Math.random() * Math.max(1, area.maxX - area.minX);
      targetY = area.minY + Math.random() * Math.max(1, area.maxY - area.minY);
    } else {
      // Fallback if grid too large
      targetX = Math.random() * Math.max(1, width - b.w);
      targetY = Math.random() * Math.max(1, height - b.h);
    }

    const dx = targetX - b.x;
    const dy = targetY - b.y;
    g.move(dx, dy, clampPiece);
  }
  replaceGroups(groups);
}
