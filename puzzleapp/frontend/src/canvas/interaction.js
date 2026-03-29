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
    const rot = piece.rotation || 0;
    if (Math.abs(rot % 180) > 1 && Math.abs(piece.sw - piece.sh) > 2) {
      // Rotated non-square piece: use circular check to avoid rejecting valid hits
      const cx = piece.x + piece.sw / 2;
      const cy = piece.y + piece.sh / 2;
      const maxDist = Math.sqrt(piece.sw * piece.sw + piece.sh * piece.sh) / 2;
      if (Math.hypot(px - cx, py - cy) > maxDist) continue;
    } else {
      // Quick bounding box pre-check before expensive hit test
      if (px < piece.x || py < piece.y || px >= piece.x + piece.sw || py >= piece.y + piece.sh) continue;
    }
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
    const percentage = gameSettings.rotationPercentage / 100;
    pieces.forEach(p => {
      // Only rotate if random value is within the percentage threshold
      if (Math.random() < percentage) {
        const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];
        p.rotation = randomRotation;
        p.rotationTarget = randomRotation;
      } else {
        // Keep default orientation (0 degrees)
        p.rotation = 0;
        p.rotationTarget = 0;
      }
    });
  }

  for (const p of pieces) groups.push(newGroupFactory(p));

  // === AUTO-SCALING LOOP: Reduce scale until all pieces fit ===
  let currentScale = styleState.pieceScale;
  let placementSuccessful = false;
  const minScale = 0.1;
  const scaleDecrement = 0.05; // Reduce by 5% each iteration

  while (!placementSuccessful && currentScale >= minScale) {
    // Update global scale
    styleState.pieceScale = currentScale;

    // Try to place all pieces with collision detection
    const result = tryPlaceAllPieces(groups);

    if (result.success) {
      placementSuccessful = true;
    } else {
      // Too many collisions, reduce scale and retry
      currentScale -= scaleDecrement;
    }
  }

  // Update UI to reflect final scale
  const pieceScaleRange = typeof document !== 'undefined' ? document.getElementById('pieceScaleRange') : null;
  const pieceScaleLbl = typeof document !== 'undefined' ? document.getElementById('pieceScaleLbl') : null;
  if (pieceScaleRange) pieceScaleRange.value = Math.round(styleState.pieceScale * 100);
  if (pieceScaleLbl) pieceScaleLbl.textContent = `${Math.round(styleState.pieceScale * 100)}%`;

  replaceGroups(groups);
}

// Helper function: Try to place all pieces randomly with collision detection
function tryPlaceAllPieces(groups) {
  const { originX, originY, W, H } = gridRectScaled(width, height);

  // No overlap allowed with grid zone - 30px buffer to prevent edge bleeding
  const bufferZone = 30;
  const margin = bufferZone; // Positive margin creates safe zone around grid
  const spacing = 10;

  const gridLeft = originX - margin;
  const gridRight = originX + W + margin;
  const gridTop = originY - margin;
  const gridBottom = originY + H + margin;

  // Available placement areas (outside grid zone, no overlap allowed)
  // For 2x2 puzzles (4 pieces), only use side areas to prevent top/bottom overlap
  const useSidesOnly = groups.length <= 4;

  const areas = [];
  if (gridLeft > 0) {
    areas.push({ minX: 0, maxX: gridLeft, minY: 0, maxY: height });
  }
  if (width - gridRight > 0) {
    areas.push({ minX: gridRight, maxX: width, minY: 0, maxY: height });
  }
  if (!useSidesOnly && gridTop > 0) {
    areas.push({ minX: 0, maxX: width, minY: 0, maxY: gridTop });
  }
  if (!useSidesOnly && height - gridBottom > 0) {
    areas.push({ minX: 0, maxX: width, minY: gridBottom, maxY: height });
  }

  const placedBounds = [];
  let successfulPlacements = 0;
  const maxAttemptsPerPiece = 200;

  for (const g of groups) {
    // Save original position
    const originalBounds = g.getBounds();
    const originalPositions = new Map();
    for (const p of g.members) {
      originalPositions.set(p, { x: p.x, y: p.y });
    }

    // Calculate effective bounds (with rotation)
    const piece = Array.from(g.members)[0];
    let effectiveW = originalBounds.w;
    let effectiveH = originalBounds.h;

    if (gameSettings.rotationEnabled && piece && Math.abs(piece.rotation) > 1) {
      const diagonal = Math.sqrt(originalBounds.w * originalBounds.w + originalBounds.h * originalBounds.h);
      effectiveW = diagonal;
      effectiveH = diagonal;
    }

    let foundPosition = false;

    for (let attempt = 0; attempt < maxAttemptsPerPiece && !foundPosition; attempt++) {
      // Reset to original position
      for (const p of g.members) {
        const orig = originalPositions.get(p);
        p.x = orig.x;
        p.y = orig.y;
      }

      // Pick random position in random area
      if (areas.length === 0) break;
      const area = areas[Math.floor(Math.random() * areas.length)];

      const candidateX = area.minX + Math.random() * Math.max(1, area.maxX - area.minX - effectiveW);
      const candidateY = area.minY + Math.random() * Math.max(1, area.maxY - area.minY - effectiveH);

      // Calculate move
      let dx, dy;
      if (gameSettings.rotationEnabled && effectiveW !== originalBounds.w) {
        const offsetX = (effectiveW - originalBounds.w) / 2;
        const offsetY = (effectiveH - originalBounds.h) / 2;
        dx = (candidateX + offsetX) - originalBounds.x;
        dy = (candidateY + offsetY) - originalBounds.y;
      } else {
        dx = candidateX - originalBounds.x;
        dy = candidateY - originalBounds.y;
      }

      // Move piece
      g.move(dx, dy, clampPiece);

      // Check collision
      const testBounds = g.getBounds();
      let checkX = testBounds.x;
      let checkY = testBounds.y;
      let checkW = testBounds.w;
      let checkH = testBounds.h;

      if (gameSettings.rotationEnabled && effectiveW !== testBounds.w) {
        const offsetX = (effectiveW - testBounds.w) / 2;
        const offsetY = (effectiveH - testBounds.h) / 2;
        checkX = testBounds.x - offsetX;
        checkY = testBounds.y - offsetY;
        checkW = effectiveW;
        checkH = effectiveH;
      }

      const hasCollision = placedBounds.some(placed => {
        return !(checkX + checkW + spacing < placed.x ||
                 checkX > placed.x + placed.w + spacing ||
                 checkY + checkH + spacing < placed.y ||
                 checkY > placed.y + placed.h + spacing);
      });

      if (!hasCollision) {
        foundPosition = true;
        successfulPlacements++;
        placedBounds.push({ x: checkX, y: checkY, w: checkW, h: checkH });
      }
    }
  }

  // Success if at least 80% of pieces were placed successfully
  const successRate = successfulPlacements / groups.length;
  return { success: successRate >= 0.8, successRate };
}
