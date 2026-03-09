import { gridRectScaled } from "../ui/layout.js";
import { t } from "../ui/i18n.js";
import { styleState, puzzleMeta, listPieces, listWrongLinks, globalSnapshots, connectionsState, puzzleGrid, hoverPiece, getPieceInteractionMatrix, matrixHoverState, setMatrixHoverState, rgbMapProjection, setRGBMapProjection, setRGBButtonPositions, clearRGBButtonPositions, getMatrixGroupingEnabled, setMatrixGroupingButtonPos, clearMatrixGroupingButtonPos, matrixCurrentOrder, setMatrixCurrentOrder, matrixAnimationState, startMatrixAnimation, getMatrixAnimationProgress } from "./state.js";
import { averagePieceDiagonal } from "./interaction.js";

export function drawBackground(width, height) {
  background(245);
  if (puzzleMeta.maxX > puzzleMeta.minX && puzzleMeta.maxY > puzzleMeta.minY) {
    const { originX, originY, W, H } = gridRectScaled(width, height);
    push(); noFill(); stroke(225); strokeWeight(2);
    rect(originX + .5, originY + .5, W, H, 6); pop();
  }
}

export function drawConnections(width, height, pieces) {
  const allPieces = listPieces();
  const { originX, originY, W, H, s } = gridRectScaled(width, height);

  // Determine a default positions map using current displayed piece centers
  // so markers align with the current pieceScale (user-resized) view.
  const positionsDefault = {};
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined') continue;
    positionsDefault[pp.index] = { x: pp.x + pp.sw / 2, y: pp.y + pp.sh / 2 };
  }
  // Node positions are fixed to their target centers (solution positions)
  const nodePositions = {};
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined') continue;
    nodePositions[pp.index] = targetCenter(pp);
  }

  // draw a small marker for every node so the user sees clickable nodes
  push();
  noStroke();
  fill(200, 200, 200, 200);
  for (const idStr in nodePositions) {
    const pos = nodePositions[idStr];
    if (!pos) continue;
    circle(pos.x, pos.y, 6);
  }
  pop();

  // determine which global snapshot to use for distance measurements
  // prefer the selected piece's snapshot index if a piece is selected, otherwise use latest
  let globalIdx = undefined;
  if (connectionsState && typeof connectionsState.selected !== 'undefined' && connectionsState.selected != null) {
    const selIdxLocal = connectionsState.selected;
    const pLocal = allPieces[selIdxLocal];
    if (pLocal) {
      const snapList = pLocal.snapshots || [];
      const sIdx = Math.max(0, Math.min((connectionsState.snapshotIdx || 0), snapList.length - 1));
      globalIdx = snapList[sIdx];
    }
  }
  if (typeof globalIdx === 'undefined' && globalSnapshots && globalSnapshots.length) {
    globalIdx = globalSnapshots.length - 1;
  }

  const positions = (typeof globalIdx !== 'undefined' && globalSnapshots[globalIdx]) ? (globalSnapshots[globalIdx].positions || {}) : {};

  // build transformed snapshot positions mapped to current display (respecting pieceScale)
  const positionsTransformed = {};
  // helper: transform stored snapshot pos into current display coordinates
  function transformStoredPos(stored, currentPiece) {
    if (!stored || !currentPiece) return null;
    const storedSw = stored.sw || 1;
    const storedSh = stored.sh || 1;
    const storedMetaX = stored.metaX;
    const storedMetaY = stored.metaY;
    const storedTargetX = originX + (storedMetaX - puzzleMeta.minX) * s + storedSw / 2;
    const storedTargetY = originY + (storedMetaY - puzzleMeta.minY) * s + storedSh / 2;
    const dx = stored.x - storedTargetX;
    const dy = stored.y - storedTargetY;
    const curTarget = targetCenter(currentPiece);
    const curSw = currentPiece.sw || 1;
    const scale = curSw / (storedSw || curSw || 1);
    return { x: curTarget.x + dx * scale, y: curTarget.y + dy * scale };
  }
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined') continue;
    const stored = positions[pp.index];
    const tpos = transformStoredPos(stored, pp);
    if (tpos) positionsTransformed[pp.index] = tpos;
  }

  // determine base position map for distance measurement
  const basePosMap = (Object.keys(positionsTransformed).length) ? positionsTransformed : positionsDefault;

  // draw faint edges for all nodes (global view) based on the chosen snapshot or current positions
  const rows = (puzzleGrid && puzzleGrid.rows) || 0;
  const cols = (puzzleGrid && puzzleGrid.cols) || 0;
  push();
  strokeWeight(1);
  stroke(160, 160, 160, 90);
  // For each node, draw exactly node_n outgoing edges to its nearest neighbors
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined') continue;
    const aPos = basePosMap[pp.index];
    if (!aPos) continue;
    // compute n_sz for this node
    let node_n = 0;
    if (pp.r > 0) node_n++;
    if (pp.r < rows - 1) node_n++;
    if (pp.c > 0) node_n++;
    if (pp.c < cols - 1) node_n++;
    if (node_n <= 0) continue;
    const arr = [];
    for (const qq of allPieces) {
      if (!qq || typeof qq.index === 'undefined' || qq.index === pp.index) continue;
      const bPos = basePosMap[qq.index];
      if (!bPos) continue;
      const d = Math.hypot(aPos.x - bPos.x, aPos.y - bPos.y);
      arr.push({ q: qq, idx: qq.index, d });
    }
    arr.sort((x, y) => x.d - y.d);
    const neigh = arr.slice(0, node_n);
    for (const n of neigh) {
      const pa = nodePositions[pp.index];
      const pb = nodePositions[n.idx];
      if (!pa || !pb) continue;
      line(pa.x, pa.y, pb.x, pb.y);
    }
  }
  pop();

  // helper to compute target center distance for true neighbors
  // (gridRectScaled already called above)
  function targetCenter(pp) {
    const tx = originX + (pp.meta.x - puzzleMeta.minX) * s + (pp.sw || 0) / 2;
    const ty = originY + (pp.meta.y - puzzleMeta.minY) * s + (pp.sh || 0) / 2;
    return { x: tx, y: ty };
  }

  // For selected piece (if any), compute its neighbors using the same basePosMap
  const selIdx = (connectionsState && typeof connectionsState.selected !== 'undefined') ? connectionsState.selected : null;
  const p = (selIdx != null) ? allPieces[selIdx] : null;
  if (!p) return;
  const distArr = [];
  const displayA = basePosMap[selIdx];
  if (!displayA) return;
  for (const q of allPieces) {
    if (!q || typeof q.index === 'undefined' || q.index === selIdx) continue;
    const displayQ = basePosMap[q.index];
    if (!displayQ) continue;
    const d = Math.hypot(displayA.x - displayQ.x, displayA.y - displayQ.y);
    distArr.push({ q, idx: q.index, d, displayQ });
  }
  distArr.sort((a, b) => a.d - b.d);

  // pick n_sz nearest as candidate neighbors (based on displayed positions)
  // compute n_sz for the selected piece
  let n_sz = 0;
  if (p.r > 0) n_sz++;
  if (p.r < rows - 1) n_sz++;
  if (p.c > 0) n_sz++;
  if (p.c < cols - 1) n_sz++;
  if (n_sz <= 0) return;
  const candidates = distArr.slice(0, n_sz);

  // compute reference distances for true orthogonal neighbors
  const trueRefs = [];
  for (const c of candidates) {
    const q = c.q;
    const dr = Math.abs(q.r - p.r), dc = Math.abs(q.c - p.c);
    if (dr + dc === 1) {
      const ta = targetCenter(p), tb = targetCenter(q);
      trueRefs.push(Math.hypot(ta.x - tb.x, ta.y - tb.y));
    }
  }
  const avgTrueRef = trueRefs.length ? trueRefs.reduce((a, b) => a + b, 0) / trueRefs.length : Math.max(1, averagePieceDiagonal());

  // determine which candidate edges are correct (blue) based on current grouping
  const correct = [];
  const incorrect = [];
  for (const c of candidates) {
    const q = c.q;
    const isTrueNeighbor = (Math.abs(q.r - p.r) + Math.abs(q.c - p.c)) === 1;
    const d_cur = c.d; // distance between displayed centers
    let d_ref = avgTrueRef;
    if (isTrueNeighbor) {
      const ta = targetCenter(p), tb = targetCenter(q);
      d_ref = Math.hypot(ta.x - tb.x, ta.y - tb.y);
    }
    // Determine merge/connection state for coloring. Prefer historical (snapshot) info
    // when a global snapshot index is active — infer whether the pieces were
    // connected in that snapshot by inspecting stored snapshot positions.
    let mergedSnapshotState = null; // null = no snapshot info, true/false = inferred
    if (typeof globalIdx !== 'undefined' && globalSnapshots && globalSnapshots[globalIdx] && globalSnapshots[globalIdx].positions) {
      try {
        const spos = globalSnapshots[globalIdx].positions || {};
        const sa = spos[selIdx];
        const sb = spos[c.idx];
        if (sa && sb) {
          // Prefer explicit group id stored in snapshot when available.
          if (typeof sa.groupId !== 'undefined' && sa.groupId !== null && typeof sb.groupId !== 'undefined' && sb.groupId !== null) {
            mergedSnapshotState = (sa.groupId === sb.groupId);
          } else {
            const dxs = sb.x - sa.x;
            const dys = sb.y - sa.y;
            const dr_meta = (sb.metaY || 0) - (sa.metaY || 0);
            const dc_meta = (sb.metaX || 0) - (sa.metaX || 0);
            const isTrueNeighborSnap = Math.abs(dr_meta) + Math.abs(dc_meta) === 1;
            let snapMerged = false;
            if (isTrueNeighborSnap) {
              // require orientation to match expected neighbor direction
              let signOk = true;
              if (dc_meta === 1 && dxs < 0) signOk = false;
              if (dc_meta === -1 && dxs > 0) signOk = false;
              if (dr_meta === 1 && dys < 0) signOk = false;
              if (dr_meta === -1 && dys > 0) signOk = false;
              // compare distance to average stored diagonal to ensure pieces are adjacent
              const da = Math.hypot(sa.sw || 1, sa.sh || 1);
              const db = Math.hypot(sb.sw || 1, sb.sh || 1);
              const avgStoredDiag = Math.max(1, (da + db) / 2);
              const dist = Math.hypot(dxs, dys);
              if (signOk && dist <= avgStoredDiag * 1.2) snapMerged = true;
            }
            mergedSnapshotState = snapMerged;
          }
        }
      } catch (_) { mergedSnapshotState = null; }
    }

    const mergedLive = (p.group && q.group && p.group === q.group);
    // Color decision: if a snapshot index is active, use ONLY the snapshot
    // inference (historical view must not be affected by later live merges).
    // If no snapshot is active, fall back to live group membership.
    let isMergedForColor;
    if (typeof globalIdx !== 'undefined' && globalSnapshots && globalSnapshots[globalIdx] && globalSnapshots[globalIdx].positions) {
      isMergedForColor = (mergedSnapshotState === true);
    } else {
      isMergedForColor = mergedLive;
    }
    if (isMergedForColor && isTrueNeighbor) correct.push({ q: c.q, idx: c.idx, d_cur, d_ref });
    else incorrect.push({ q: c.q, idx: c.idx, d_cur, d_ref });
  }

  // show up to (n_sz - correct.length) incorrect edges; choose those with largest error
  const maxWrong = Math.max(0, n_sz - correct.length);
  incorrect.sort((a, b) => Math.abs(b.d_cur - b.d_ref) - Math.abs(a.d_cur - a.d_ref));
  const shownWrong = incorrect.slice(0, maxWrong);

  // draw edges: correct (blue), wrong (dark/light red depending on sign)
  push();
  strokeWeight(2);
  for (const e of correct) {
    const startPos = nodePositions[selIdx];
    const endPos = nodePositions[e.idx];
    if (!startPos || !endPos) continue;
    stroke(40, 120, 220, 220); // blue
    line(startPos.x, startPos.y, endPos.x, endPos.y);
  }
  for (const e of shownWrong) {
    const startPos = nodePositions[selIdx];
    const endPos = nodePositions[e.idx];
    if (!startPos || !endPos) continue;
    if (e.d_cur > e.d_ref) stroke(160, 20, 20, 220); // dark red (too far)
    else stroke(255, 140, 0, 200); // orange (too close)
    line(startPos.x, startPos.y, endPos.x, endPos.y);
  }
  pop();

  // draw center marker for selected piece (at the same base position map)
  push();
  noStroke();
  fill(255);
  const markerPos = nodePositions[selIdx];
  if (markerPos) circle(markerPos.x, markerPos.y, 8);
  pop();
}

export function drawWrongLinks(width, height) {
  // Átmenetileg ezt a vizut kivezetjük amíg alaposabban meg nem tervezzük
  // A funkció jelenleg no-op, a hívások így is biztonságosan lefutnak.
  return;
}

function seismicColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const blue = [0, 0, 140];
  const white = [255, 255, 255];
  const red = [180, 0, 0];
  if (clamped <= 0.5) {
    const k = clamped / 0.5;
    return [
      Math.round(blue[0] + (white[0] - blue[0]) * k),
      Math.round(blue[1] + (white[1] - blue[1]) * k),
      Math.round(blue[2] + (white[2] - blue[2]) * k)
    ];
  }
  const k = (clamped - 0.5) / 0.5;
  return [
    Math.round(white[0] + (red[0] - white[0]) * k),
    Math.round(white[1] + (red[1] - white[1]) * k),
    Math.round(white[2] + (red[2] - white[2]) * k)
  ];
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function drawHeatmap(width, height, rows, cols, pieces, elapsedMs) {
  if (!rows || !cols) return;
  const { originX, originY, W, H } = gridRectScaled(width, height);
  if (W <= 0 || H <= 0) return;

  const cellW = W / cols;
  const cellH = H / rows;
  const maxTime = Math.max(1, elapsedMs || 0);
  const lookup = new Map();
  for (const p of pieces || []) lookup.set(`${p.r},${p.c}`, p);

  const solvedTimes = (pieces || [])
    .map(p => p.solvedAt)
    .filter(v => typeof v === "number" && !isNaN(v) && isFinite(v) && v >= 0);
  const hasSolved = solvedTimes.length > 0;
  let minTime = 0;
  let maxSolved = 0;
  if (hasSolved) {
    minTime = Math.min(...solvedTimes);
    maxSolved = Math.max(...solvedTimes);
  }
  const legendMax = Math.max(maxSolved, 1);
  const legendMin = Math.min(minTime, legendMax);
  const legendRange = Math.max(1, legendMax - legendMin);

  stroke(210);
  strokeWeight(1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = lookup.get(`${r},${c}`);
      if (p && typeof p.solvedAt === "number") {
        const t = (p.solvedAt - legendMin) / legendRange;
        const [cr, cg, cb] = seismicColor(t);
        fill(cr, cg, cb);
      } else {
        fill(230);
      }
      rect(originX + c * cellW, originY + r * cellH, cellW, cellH);
    }
  }

    const legendW = Math.min(200, W * 0.35);
    const legendH = 10;

    const gapBelow = 12;          // távolság a diagram aljától
    const lx = originX + (W - legendW) / 2;
    const ly = originY + H + gapBelow;

    const steps = 40;

    noStroke();
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const [cr, cg, cb] = seismicColor(t);
      fill(cr, cg, cb);
      rect(lx + (legendW * i) / steps, ly, legendW / steps + 0.5, legendH);
    }

    stroke(200);
    noFill();
    rect(lx, ly, legendW, legendH);

    noStroke();
    fill(80);
    textSize(11);

    if (hasSolved) {
      textAlign(RIGHT, CENTER);
      text(`${t("earliest")}: ${formatClock(minTime)}`, lx - 8, ly + legendH / 2);

      textAlign(LEFT, CENTER);
      text(`${t("latest")}: ${formatClock(legendMax)}`, lx + legendW + 8, ly + legendH / 2);
    } else {
        const textGap = 6; // távolság a legend és a szöveg között

        textAlign(CENTER, TOP);
        text(
          `${t("noSolved")}`,
          lx + legendW / 2,
          ly + legendH + textGap
        );
    }
}

export function drawGrabPoints(width, height, pieces) {
  const { originX, originY, W, H, s } = gridRectScaled(width, height);
  if (W <= 0 || H <= 0) return;

  for (const p of pieces || []) {
    const tx = originX + (p.meta.x - puzzleMeta.minX) * s;
    const ty = originY + (p.meta.y - puzzleMeta.minY) * s;

    push();
    tint(255, 60);
    // Always draw piece at 0° orientation in grabs view (target position)
    image(p.img, tx, ty, p.sw, p.sh);
    noTint();
    noFill();
    stroke(210);
    rect(tx, ty, p.sw, p.sh);
    pop();

    const grabs = p.grabs || [];
    if (!grabs.length) continue;

    push();
    stroke(255, 255, 255, 180);
    strokeWeight(1);
    fill(220, 30, 30, 170);

    for (const g of grabs) {
      // Grab points are in local coordinates (0 to p.w/p.h)
      // Draw them directly on the unrotated piece image
      const gx = tx + (g.x / p.w) * p.sw;
      const gy = ty + (g.y / p.h) * p.sh;
      circle(gx, gy, 6);
    }
    pop();
  }
}

// Time-based color gradient: blue → green → yellow → red
function timeColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Blue (0,0,255) → Green (0,255,0) → Yellow (255,255,0) → Red (255,0,0)
  if (clamped < 0.33) {
    // Blue → Green
    const k = clamped / 0.33;
    return [0, Math.round(255 * k), Math.round(255 * (1 - k))];
  } else if (clamped < 0.66) {
    // Green → Yellow
    const k = (clamped - 0.33) / 0.33;
    return [Math.round(255 * k), 255, 0];
  } else {
    // Yellow → Red
    const k = (clamped - 0.66) / 0.34;
    return [255, Math.round(255 * (1 - k)), 0];
  }
}

export function drawMovementPaths(width, height, pieces) {
  if (!globalSnapshots || globalSnapshots.length < 2) {
    // Not enough data to draw paths
    push();
    fill(100);
    textAlign(CENTER, CENTER);
    textSize(16);
    text(t("noPathData") || "Not enough movement data yet. Play to see paths!", width / 2, height / 2);
    pop();
    return;
  }

  const { originX, originY, W, H, s } = gridRectScaled(width, height);
  const allPieces = listPieces();

  // Draw background grid outline
  if (puzzleMeta.maxX > puzzleMeta.minX && puzzleMeta.maxY > puzzleMeta.minY) {
    push();
    noFill();
    stroke(225);
    strokeWeight(2);
    rect(originX + 0.5, originY + 0.5, W, H, 6);
    pop();
  }

  // Helper: compute target center for a piece in current scale
  function targetCenter(pp) {
    const tx = originX + (pp.meta.x - puzzleMeta.minX) * s + (pp.sw || 0) / 2;
    const ty = originY + (pp.meta.y - puzzleMeta.minY) * s + (pp.sh || 0) / 2;
    return { x: tx, y: ty };
  }

  // Helper: transform stored snapshot position to current display coordinates
  function transformStoredPos(stored, currentPiece) {
    if (!stored || !currentPiece) return null;
    const storedSw = stored.sw || 1;
    const storedSh = stored.sh || 1;
    const storedMetaX = stored.metaX;
    const storedMetaY = stored.metaY;
    // Compute where the target center was in the snapshot's coordinate system
    const storedTargetX = originX + (storedMetaX - puzzleMeta.minX) * s + storedSw / 2;
    const storedTargetY = originY + (storedMetaY - puzzleMeta.minY) * s + storedSh / 2;
    // Compute offset from target in snapshot
    const dx = stored.x - storedTargetX;
    const dy = stored.y - storedTargetY;
    // Get current target center
    const curTarget = targetCenter(currentPiece);
    const curSw = currentPiece.sw || 1;
    // Scale factor between stored size and current size
    const scale = curSw / (storedSw || curSw || 1);
    // Apply scaled offset to current target
    return { x: curTarget.x + dx * scale, y: curTarget.y + dy * scale };
  }

  // Helper: draw a star shape
  function drawStar(cx, cy, r, color, alpha) {
    push();
    fill(color[0], color[1], color[2], alpha);
    noStroke();
    beginShape();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * PI) / 5 - PI / 2;
      const x = cx + r * cos(angle);
      const y = cy + r * sin(angle);
      vertex(x, y);
    }
    endShape(CLOSE);
    pop();
  }

  // For each piece, collect its movement history from snapshots
  for (const piece of allPieces) {
    if (!piece || typeof piece.index === 'undefined') continue;

    const path = [];
    for (let i = 0; i < globalSnapshots.length; i++) {
      const snap = globalSnapshots[i];
      const posData = snap.positions[piece.index];
      if (posData) {
        // Transform snapshot position to current scale
        const transformed = transformStoredPos(posData, piece);
        if (transformed) {
          path.push({
            x: transformed.x,
            y: transformed.y,
            time: i / Math.max(1, globalSnapshots.length - 1),
            snapshotIdx: i
          });
        }
      }
    }

    if (path.length < 2) continue; // Need at least 2 points to draw a path

    // Skip pieces that never moved - no meaningful path to visualize
    const firstPos = path[0];
    const lastPos = path[path.length - 1];
    const totalDist = Math.hypot(lastPos.x - firstPos.x, lastPos.y - firstPos.y);
    if (totalDist < 5) continue; // No meaningful movement (threshold: 5 pixels)

    // Identify "station" points - where the piece stayed still for multiple snapshots
    const stations = [];
    let i = 0;
    while (i < path.length) {
      const current = path[i];
      let j = i + 1;
      // Count how many consecutive snapshots have the same position (within threshold)
      while (j < path.length) {
        const dist = Math.hypot(path[j].x - current.x, path[j].y - current.y);
        if (dist < 10) { // Same position threshold (10 pixels) - increased to avoid marking slow drag as stations
          j++;
        } else {
          break;
        }
      }
      const stayDuration = j - i;
      if (stayDuration >= 3 || i === 0 || j >= path.length) {
        // This is a station: piece stayed here for >=450ms (3 snapshots @ 150ms interval) or start/end
        stations.push({
          x: current.x,
          y: current.y,
          time: current.time,
          isFirst: i === 0,
          isLast: j >= path.length
        });
      }
      i = Math.max(i + 1, j);
    }

    // Helper: Catmull-Rom spline interpolation
    function catmullRomPoint(p0, p1, p2, p3, t) {
      const t2 = t * t;
      const t3 = t2 * t;
      return {
        x: 0.5 * ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      };
    }

    // Draw the path as smooth curves with time-based colors
    push();
    noFill();
    for (let i = 0; i < path.length - 1; i++) {
      // Get 4 points for Catmull-Rom spline (handle edges)
      const p0 = i > 0 ? path[i - 1] : path[i];
      const p1 = path[i];
      const p2 = path[i + 1];
      const p3 = i + 2 < path.length ? path[i + 2] : path[i + 1];

      // Calculate weight based on ORIGINAL snapshot distance (slow movement = thicker)
      const snapshotDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      // Inverse relationship: small distance = slow movement = thick line
      let weight;
      if (snapshotDist < 5) {
        weight = 4; // Very slow/stationary
      } else if (snapshotDist < 20) {
        weight = 3; // Moderate speed
      } else if (snapshotDist < 50) {
        weight = 2.5; // Normal speed
      } else {
        weight = 2; // Fast movement
      }

      // Subdivide the curve into small segments for color gradient
      const segments = 15;
      for (let seg = 0; seg < segments; seg++) {
        const t1 = seg / segments;
        const t2 = (seg + 1) / segments;

        const pt1 = catmullRomPoint(p0, p1, p2, p3, t1);
        const pt2 = catmullRomPoint(p0, p1, p2, p3, t2);

        // Interpolate time between p1 and p2
        const time = p1.time + (p2.time - p1.time) * ((t1 + t2) / 2);
        const [r, g, b] = timeColor(time);

        stroke(r, g, b, 200);
        strokeWeight(weight);
        line(pt1.x, pt1.y, pt2.x, pt2.y);
      }
    }
    pop();

    // Draw station markers
    for (const station of stations) {
      const [r, g, b] = timeColor(station.time);

      if (station.isFirst) {
        // First station: square (blue) - larger size
        push();
        fill(0, 0, 255, 180);
        stroke(255, 255, 255, 200);
        strokeWeight(2);
        rectMode(CENTER);
        rect(station.x, station.y, 14, 14);
        pop();
      } else if (station.isLast) {
        // Last station: star (red) - larger size
        drawStar(station.x, station.y, 8, [255, 0, 0], 180);
        push();
        noFill();
        stroke(255, 255, 255, 200);
        strokeWeight(2);
        drawStar(station.x, station.y, 8, [255, 255, 255], 0); // outline only
        pop();
      } else {
        // Intermediate station: circle (time-colored) - larger size
        push();
        fill(r, g, b, 180);
        stroke(255, 255, 255, 200);
        strokeWeight(2);
        circle(station.x, station.y, 16);
        pop();
      }
    }
  }

  // Helper function to draw tooltip bubble
  function drawTooltip(x, y, label) {
    push();
    textSize(11);
    const tw = textWidth(label);
    const th = 16;
    const padding = 6;
    const boxW = tw + padding * 2;
    const boxH = th + padding * 2;

    // Background bubble
    fill(40, 40, 40, 230);
    noStroke();
    rect(x - boxW / 2, y - boxH, boxW, boxH, 4);

    // Text
    fill(255);
    textAlign(CENTER, TOP);
    text(label, x, y - boxH + padding);
    pop();
  }

  // Legend moved to HTML side panel (see index.html pathsLegend element)
  // SVG export generates its own legend in buildMovementPathsSvg (controls.js)
}

export function drawPiece(piece, st) {
  const sw = piece.sw, sh = piece.sh;
  const rot = piece.rotation || 0;
  const isHovered = hoverPiece === piece;

  push();
  // Apply rotation transform if piece has rotation
  if (rot !== 0) {
    translate(piece.x + sw / 2, piece.y + sh / 2);
    rotate(radians(rot));
    translate(-sw / 2, -sh / 2);
  } else {
    translate(piece.x, piece.y);
  }

  if (st.outline) {
    const r = Math.max(1, st.outlineW);
    push(); noStroke(); tint(0,0,0,200);
    for (let dx=-r; dx<=r; dx++)
      for (let dy=-r; dy<=r; dy++) {
        if (!dx && !dy) continue;
        const man = Math.abs(dx) + Math.abs(dy);
        if (man === r || (r > 1 && man >= r)) image(piece.img, dx, dy, sw, sh);
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
    image(piece.img, 0, 0, sw, sh);
    pop();
  } else {
    image(piece.img, 0, 0, sw, sh);
  }

  // Draw hover highlight border (for rotation preview)
  if (isHovered && piece.canRotate()) {
    push();
    noFill();
    stroke(60, 150, 255); // Bright blue
    strokeWeight(3);
    rect(0, 0, sw, sh);
    pop();
  }

  pop();
}

// ============================================================================
// ADJACENCY MATRIX VISUALIZATION
// ============================================================================

// Helper: Extract dominant color from a piece image (kept for backward compatibility)
function getDominantColor(piece) {
  const colors = getDominantColors(piece);
  return colors[0]; // Return the most dominant color
}

// Helper: Extract 3 dominant colors from a piece image using simplified k-means clustering
function getDominantColors(piece, k = 3) {
  if (!piece || !piece.img || !piece.img.pixels) {
    return [
      { r: 128, g: 128, b: 128 },
      { r: 100, g: 100, b: 100 },
      { r: 150, g: 150, b: 150 }
    ];
  }

  // Check if we already cached the colors for this piece
  if (piece._cachedDominantColors) {
    return piece._cachedDominantColors;
  }

  const pixels = piece.img.pixels;
  const len = pixels.length;

  // Collect all non-transparent pixels (with sampling for performance)
  const samples = [];
  for (let i = 0; i < len; i += 40) { // Sample every 10th pixel
    const alpha = pixels[i + 3];
    if (alpha > 10) {
      samples.push({
        r: pixels[i],
        g: pixels[i + 1],
        b: pixels[i + 2]
      });
    }
  }

  if (samples.length === 0) {
    return [
      { r: 128, g: 128, b: 128 },
      { r: 100, g: 100, b: 100 },
      { r: 150, g: 150, b: 150 }
    ];
  }

  // Initialize k centroids by picking random samples
  const centroids = [];
  const usedIndices = new Set();
  for (let i = 0; i < k && i < samples.length; i++) {
    let randomIdx;
    do {
      randomIdx = Math.floor(Math.random() * samples.length);
    } while (usedIndices.has(randomIdx));
    usedIndices.add(randomIdx);
    centroids.push({ ...samples[randomIdx] });
  }

  // If we don't have enough samples for k clusters, fill with variations
  while (centroids.length < k) {
    const base = centroids[0];
    centroids.push({
      r: Math.min(255, base.r + 30),
      g: Math.min(255, base.g + 30),
      b: Math.min(255, base.b + 30)
    });
  }

  // K-means iterations (simplified - just a few iterations for performance)
  const maxIterations = 5;
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each sample to nearest centroid
    const clusters = Array(k).fill(null).map(() => []);

    for (const sample of samples) {
      let minDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < k; c++) {
        const dist = Math.sqrt(
          Math.pow(sample.r - centroids[c].r, 2) +
          Math.pow(sample.g - centroids[c].g, 2) +
          Math.pow(sample.b - centroids[c].b, 2)
        );

        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }

      clusters[bestCluster].push(sample);
    }

    // Update centroids
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue;

      let sumR = 0, sumG = 0, sumB = 0;
      for (const sample of clusters[c]) {
        sumR += sample.r;
        sumG += sample.g;
        sumB += sample.b;
      }

      centroids[c] = {
        r: Math.round(sumR / clusters[c].length),
        g: Math.round(sumG / clusters[c].length),
        b: Math.round(sumB / clusters[c].length)
      };
    }
  }

  // Sort centroids by frequency (cluster size) - most common first
  const finalClusters = Array(k).fill(null).map(() => []);
  for (const sample of samples) {
    let minDist = Infinity;
    let bestCluster = 0;

    for (let c = 0; c < k; c++) {
      const dist = Math.sqrt(
        Math.pow(sample.r - centroids[c].r, 2) +
        Math.pow(sample.g - centroids[c].g, 2) +
        Math.pow(sample.b - centroids[c].b, 2)
      );

      if (dist < minDist) {
        minDist = dist;
        bestCluster = c;
      }
    }

    finalClusters[bestCluster].push(sample);
  }

  // Sort by cluster size (descending)
  const sortedCentroids = centroids
    .map((centroid, idx) => ({ centroid, size: finalClusters[idx].length }))
    .sort((a, b) => b.size - a.size)
    .map(item => item.centroid);

  // Cache the result so we don't need to recalculate on every redraw
  piece._cachedDominantColors = sortedCentroids;

  return sortedCentroids;
}

// Helper: Calculate color distance (Euclidean distance in RGB space)
function colorDistance(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Helper: Calculate distance between two color palettes (3 colors each)
function paletteDistance(palette1, palette2) {
  if (!palette1 || !palette2 || palette1.length !== 3 || palette2.length !== 3) {
    return Infinity;
  }

  // Use weighted distance: most dominant color has highest weight
  const weights = [0.5, 0.3, 0.2]; // Weight for 1st, 2nd, 3rd color
  let totalDist = 0;

  for (let i = 0; i < 3; i++) {
    totalDist += colorDistance(palette1[i], palette2[i]) * weights[i];
  }

  return totalDist;
}

// Helper: Count neighbors for a piece based on grid position
function countNeighbors(piece, rows, cols) {
  let count = 0;
  if (piece.r > 0) count++; // top
  if (piece.r < rows - 1) count++; // bottom
  if (piece.c > 0) count++; // left
  if (piece.c < cols - 1) count++; // right
  return count;
}

// Helper: Sort pieces by position type and color
function sortPiecesForMatrix(pieces, rows, cols, groupingEnabled = true) {
  if (!pieces || pieces.length === 0) return [];

  // First, categorize ALL pieces by corner/edge/center (always needed)
  const corners = [];
  const edges = [];
  const centers = [];

  for (const p of pieces) {
    const neighborCount = countNeighbors(p, rows, cols);
    if (neighborCount === 2) {
      corners.push(p);
    } else if (neighborCount === 3) {
      edges.push(p);
    } else if (neighborCount === 4) {
      centers.push(p);
    }
  }

  // Calculate dominant colors (3-color palettes) for sorting
  const withColors = (arr) => arr.map(p => ({
    piece: p,
    colors: getDominantColors(p, 3)
  }));

  // Sort by color similarity (greedy nearest neighbor using 3-color palettes)
  const sortByColorSimilarity = (arr) => {
    if (arr.length <= 1) return arr.map(x => x.piece);

    const sorted = [];
    const remaining = [...arr];

    // Start with first element
    sorted.push(remaining.shift());

    // Greedily pick nearest color palette
    while (remaining.length > 0) {
      const last = sorted[sorted.length - 1];
      let minDist = Infinity;
      let minIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const dist = paletteDistance(last.colors, remaining[i].colors);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }

      sorted.push(remaining[minIdx]);
      remaining.splice(minIdx, 1);
    }

    return sorted.map(x => x.piece);
  };

  let sortedPieces;

  if (!groupingEnabled) {
    // If grouping is disabled, sort ALL pieces by color only (mixed groups)
    const allWithColors = withColors(pieces);
    sortedPieces = sortByColorSimilarity(allWithColors);
  } else {
    // If grouping is enabled, sort each category separately then combine
    const cornersWithColor = withColors(corners);
    const edgesWithColor = withColors(edges);
    const centersWithColor = withColors(centers);

    const sortedCorners = sortByColorSimilarity(cornersWithColor);
    const sortedEdges = sortByColorSimilarity(edgesWithColor);
    const sortedCenters = sortByColorSimilarity(centersWithColor);

    // Combine: corners first, then edges, then centers
    sortedPieces = [...sortedCorners, ...sortedEdges, ...sortedCenters];
  }

  // Calculate group boundaries (indices where groups start/end in grouped mode)
  const boundaries = {
    cornerEnd: corners.length,
    edgeEnd: corners.length + edges.length,
    centerEnd: pieces.length
  };

  return { pieces: sortedPieces, boundaries };
}

export function drawAdjacencyMatrix(width, height, pieces) {
  // Clear button position when entering this view (will be set if we successfully draw)
  clearMatrixGroupingButtonPos();

  if (!pieces || pieces.length === 0) {
    push();
    fill(100);
    textAlign(CENTER, CENTER);
    textSize(16);
    text(t("noMatrixData") || "No piece data available", width / 2, height / 2);
    pop();
    return;
  }

  const rows = puzzleGrid.rows || 0;
  const cols = puzzleGrid.cols || 0;

  if (rows === 0 || cols === 0) {
    push();
    fill(100);
    textAlign(CENTER, CENTER);
    textSize(16);
    text(t("noMatrixData") || "Grid not initialized", width / 2, height / 2);
    pop();
    return;
  }

  // Get current grouping state
  const groupingEnabled = getMatrixGroupingEnabled();

  // Sort pieces for matrix display
  const sortResult = sortPiecesForMatrix(pieces, rows, cols, groupingEnabled);
  const sortedPieces = sortResult.pieces;
  const boundaries = sortResult.boundaries;
  const n = sortedPieces.length;

  // Check if order changed and start animation if needed
  const newOrder = sortedPieces.map(p => p.index);
  const oldOrder = matrixCurrentOrder.length > 0 ? matrixCurrentOrder : newOrder;

  // Detect if order actually changed
  const orderChanged = oldOrder.length !== newOrder.length || 
                       oldOrder.some((idx, i) => idx !== newOrder[i]);

  if (orderChanged && oldOrder.length === newOrder.length) {
    // Start animation from old to new order
    startMatrixAnimation(oldOrder, newOrder);
  }

  // Update current order
  setMatrixCurrentOrder(newOrder);

  // Get animation progress (0.0 = old positions, 1.0 = new positions)
  const animProgress = getMatrixAnimationProgress();
  const isAnimating = matrixAnimationState.animating;

  // If animating, trigger continuous redraw
  if (isAnimating) {
    setTimeout(() => redraw(), 16); // ~60fps
  }

  // Calculate matrix layout - align with puzzle grid frame
  const { originX, originY, W, H } = gridRectScaled(width, height);

  const marginRight = 40;
  const marginBottom = 80;
  const availableWidth = W; // Use puzzle frame width
  const availableHeight = height - originY - marginBottom;
  const availableSize = Math.min(availableWidth, availableHeight);
  const cellSize = Math.floor(availableSize / n);
  const matrixSize = cellSize * n;
  const startX = originX; // Align with puzzle grid frame left
  const startY = originY; // Align with puzzle grid frame top

  // Create mapping from piece index to current visual position (interpolated during animation)
  const pieceIndexToVisualRow = new Map();
  const pieceIndexToVisualCol = new Map();

  if (isAnimating && animProgress < 1.0) {
    // During animation: interpolate between old and new positions
    const oldIndexToPos = new Map();
    const newIndexToPos = new Map();

    matrixAnimationState.oldOrder.forEach((pieceIdx, pos) => {
      oldIndexToPos.set(pieceIdx, pos);
    });
    matrixAnimationState.newOrder.forEach((pieceIdx, pos) => {
      newIndexToPos.set(pieceIdx, pos);
    });

    // Easing function (ease-in-out cubic)
    const ease = (t) => {
      return t < 0.5 
        ? 4 * t * t * t 
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    const easedProgress = ease(animProgress);

    for (const pieceIdx of matrixAnimationState.newOrder) {
      const oldPos = oldIndexToPos.get(pieceIdx) ?? newIndexToPos.get(pieceIdx);
      const newPos = newIndexToPos.get(pieceIdx) ?? oldIndexToPos.get(pieceIdx);
      const currentPos = oldPos + (newPos - oldPos) * easedProgress;
      pieceIndexToVisualRow.set(pieceIdx, currentPos);
      pieceIndexToVisualCol.set(pieceIdx, currentPos);
    }
  } else {
    // No animation: use new order directly
    newOrder.forEach((pieceIdx, pos) => {
      pieceIndexToVisualRow.set(pieceIdx, pos);
      pieceIndexToVisualCol.set(pieceIdx, pos);
    });
  }

  // Helper function to get visual position (interpolated row/col during animation)
  const getVisualRow = (logicalRow) => {
    const piece = sortedPieces[logicalRow];
    return pieceIndexToVisualRow.get(piece.index) ?? logicalRow;
  };

  const getVisualCol = (logicalCol) => {
    const piece = sortedPieces[logicalCol];
    return pieceIndexToVisualCol.get(piece.index) ?? logicalCol;
  };

  // Draw matrix background with subtle group backgrounds
  push();
  noStroke();

  // Helper function to determine group for a piece based on its neighbor count
  const getGroup = (idx) => {
    const piece = sortedPieces[idx];
    if (!piece) return 'center';
    const neighborCount = countNeighbors(piece, rows, cols);
    if (neighborCount === 2) return 'corner';
    if (neighborCount === 3) return 'edge';
    return 'center';
  };

  // Draw subtle background rectangles for each group block
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const rowGroup = getGroup(row);
      const colGroup = getGroup(col);

      // Determine background tint based on group combination
      let bgColor;
      if (rowGroup === 'corner' && colGroup === 'corner') {
        bgColor = color(255, 250, 245); // Warm white for corners
      } else if (rowGroup === 'edge' && colGroup === 'edge') {
        bgColor = color(245, 255, 250); // Cool white for edges
      } else if (rowGroup === 'center' && colGroup === 'center') {
        bgColor = color(250, 245, 255); // Purple tint for centers
      } else {
        bgColor = color(252, 252, 252); // Very light gray for mixed
      }

      fill(bgColor);
      // Use visual positions for animation
      const visualRow = getVisualRow(row);
      const visualCol = getVisualCol(col);
      const x = startX + visualCol * cellSize;
      const y = startY + visualRow * cellSize;
      rect(x, y, cellSize, cellSize);
    }
  }
  pop();

  // Get interaction matrix data
  const interactionMatrix = getPieceInteractionMatrix();

  // Find max interaction count for normalization
  let maxInteractions = 0;
  for (const fromIdx in interactionMatrix) {
    for (const toIdx in interactionMatrix[fromIdx]) {
      maxInteractions = Math.max(maxInteractions, interactionMatrix[fromIdx][toIdx]);
    }
  }

  // Create index lookup for sorted pieces
  const pieceIndexToMatrixPos = {};
  for (let i = 0; i < sortedPieces.length; i++) {
    pieceIndexToMatrixPos[sortedPieces[i].index] = i;
  }

  // Draw matrix cells with color based on interaction count
  push();
  noStroke();
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const fromPiece = sortedPieces[row];
      const toPiece = sortedPieces[col];
      const fromIdx = fromPiece.index;
      const toIdx = toPiece.index;

      // Get interaction count
      let interactionCount = 0;
      if (interactionMatrix[fromIdx] && interactionMatrix[fromIdx][toIdx]) {
        interactionCount = interactionMatrix[fromIdx][toIdx];
      }

      // Calculate color intensity (white to blue gradient)
      let fillColor;
      if (interactionCount === 0) {
        fillColor = color(250, 250, 250); // Almost white for no interactions
      } else {
        const intensity = interactionCount / Math.max(1, maxInteractions);
        // Blue gradient: light blue -> dark blue
        const r = Math.round(255 - intensity * 200);
        const g = Math.round(255 - intensity * 180);
        const b = 255;
        fillColor = color(r, g, b);
      }

      fill(fillColor);
      // Use visual positions for animation
      const visualRow = getVisualRow(row);
      const visualCol = getVisualCol(col);
      const x = startX + visualCol * cellSize;
      const y = startY + visualRow * cellSize;
      rect(x, y, cellSize, cellSize);

      // Draw interaction count if > 0 (and cell is large enough)
      if (interactionCount > 0 && cellSize >= 20) {
        push();
        fill(0, 0, 0, 180);
        textSize(Math.max(8, Math.min(11, cellSize / 2.5)));
        textAlign(CENTER, CENTER);
        text(interactionCount, x + cellSize / 2, y + cellSize / 2);
        pop();
      }
    }
  }
  pop();

  // Draw grid lines with thicker lines at group boundaries (only when grouping enabled)
  push();

  for (let i = 0; i <= n; i++) {
    // Determine if this is a group boundary (only relevant when grouping is enabled)
    const isGroupBoundary = groupingEnabled && (i === 0 || i === n || i === boundaries.cornerEnd || i === boundaries.edgeEnd);

    if (isGroupBoundary) {
      stroke(160); // Light gray instead of dark (was 80)
      strokeWeight(2.5);
    } else if (i === 0 || i === n) {
      // Outer border - always visible but lighter
      stroke(160);
      strokeWeight(2.5);
    } else {
      stroke(200); // Light gray for internal grid
      strokeWeight(0.5);
    }

    // Vertical lines
    line(startX + i * cellSize, startY, startX + i * cellSize, startY + matrixSize);
    // Horizontal lines
    line(startX, startY + i * cellSize, startX + matrixSize, startY + i * cellSize);
  }
  pop();

  // Draw group labels on the sides with color bars (only when grouping is enabled)
  if (groupingEnabled) {
    const barWidth = 4;
    const barOffset = 70; // Distance from matrix edge to color bar
    const textOffset = 78; // Distance from matrix edge to text

    push();

    // Define group colors
    const cornerColor = color(255, 180, 100); // Orange
    const edgeColor = color(100, 200, 150);   // Green
    const centerColor = color(150, 120, 255);  // Purple

    // Row labels (left side) with color bars
    textSize(12);
    textAlign(RIGHT, CENTER);

    if (boundaries.cornerEnd > 0) {
      const cornerStart = startY;
      const cornerHeight = boundaries.cornerEnd * cellSize;
      const cornerMid = startY + cornerHeight / 2;

      fill(cornerColor);
      noStroke();
      rect(startX - barOffset, cornerStart, barWidth, cornerHeight);

      fill(100);
      text(t("matrixGroupCorners") || "Corners", startX - textOffset, cornerMid);
    }
    if (boundaries.edgeEnd > boundaries.cornerEnd) {
      const edgeStart = startY + boundaries.cornerEnd * cellSize;
      const edgeHeight = (boundaries.edgeEnd - boundaries.cornerEnd) * cellSize;
      const edgeMid = edgeStart + edgeHeight / 2;

      fill(edgeColor);
      noStroke();
      rect(startX - barOffset, edgeStart, barWidth, edgeHeight);

      fill(100);
      text(t("matrixGroupEdges") || "Edges", startX - textOffset, edgeMid);
    }
    if (boundaries.centerEnd > boundaries.edgeEnd) {
      const centerStart = startY + boundaries.edgeEnd * cellSize;
      const centerHeight = (boundaries.centerEnd - boundaries.edgeEnd) * cellSize;
      const centerMid = centerStart + centerHeight / 2;

      fill(centerColor);
      noStroke();
      rect(startX - barOffset, centerStart, barWidth, centerHeight);

      fill(100);
      text(t("matrixGroupCenters") || "Centers", startX - textOffset, centerMid);
    }

    // Column labels (top) with color bars
    const topBarOffset = 80; // Distance from matrix top to color bar
    const topTextOffset = 86; // Distance from matrix top to text

    textSize(12);
    textAlign(CENTER, BOTTOM);

    if (boundaries.cornerEnd > 0) {
      const cornerStart = startX;
      const cornerWidth = boundaries.cornerEnd * cellSize;
      const cornerMid = startX + cornerWidth / 2;

      fill(cornerColor);
      noStroke();
      rect(cornerStart, startY - topBarOffset, cornerWidth, barWidth);

      fill(100);
      text(t("matrixGroupCorners") || "Corners", cornerMid, startY - topTextOffset);
    }
    if (boundaries.edgeEnd > boundaries.cornerEnd) {
      const edgeStart = startX + boundaries.cornerEnd * cellSize;
      const edgeWidth = (boundaries.edgeEnd - boundaries.cornerEnd) * cellSize;
      const edgeMid = edgeStart + edgeWidth / 2;

      fill(edgeColor);
      noStroke();
      rect(edgeStart, startY - topBarOffset, edgeWidth, barWidth);

      fill(100);
      text(t("matrixGroupEdges") || "Edges", edgeMid, startY - topTextOffset);
    }
    if (boundaries.centerEnd > boundaries.edgeEnd) {
      const centerStart = startX + boundaries.edgeEnd * cellSize;
      const centerWidth = (boundaries.centerEnd - boundaries.edgeEnd) * cellSize;
      const centerMid = centerStart + centerWidth / 2;

      fill(centerColor);
      noStroke();
      rect(centerStart, startY - topBarOffset, centerWidth, barWidth);

      fill(100);
      text(t("matrixGroupCenters") || "Centers", centerMid, startY - topTextOffset);
    }

    pop();
  }

  // Draw row/column labels (piece indices) with 3-color palettes
  push();
  fill(80);
  const labelTextSize = Math.max(8, Math.min(12, cellSize / 3));
  textSize(labelTextSize);
  textAlign(CENTER, CENTER);

  const colorSquareSize = Math.max(6, Math.min(10, cellSize / 2.5));
  const squareGap = 1;
  const totalPaletteWidth = colorSquareSize * 3 + squareGap * 2;
  const totalPaletteHeight = colorSquareSize * 3 + squareGap * 2;
  const squareOffset = labelTextSize + 6;

  // Reset hover state
  let hoveredPiece = null;
  let hoveredIsRow = false;
  let hoveredX = 0;
  let hoveredY = 0;

  for (let i = 0; i < n; i++) {
    const piece = sortedPieces[i];
    const label = `${piece.index}`;
    const pieceColors = getDominantColors(piece, 3);

    // Use visual positions for animation
    const visualPos = getVisualCol(i); // same for both row and col

    // Column labels (top) with 3-color palette (vertical stack)
    const colLabelX = startX + visualPos * cellSize + cellSize / 2;
    const colLabelY = startY - 15;
    const colPaletteX = colLabelX - colorSquareSize / 2;
    const colPaletteStartY = colLabelY - squareOffset - totalPaletteHeight;

    // Draw 3 color squares for column (stacked vertically)
    for (let c = 0; c < 3; c++) {
      const squareY = colPaletteStartY + c * (colorSquareSize + squareGap);
      push();
      fill(pieceColors[c].r, pieceColors[c].g, pieceColors[c].b);
      stroke(100);
      strokeWeight(0.5);
      rect(colPaletteX, squareY, colorSquareSize, colorSquareSize);
      pop();
    }

    // Draw label
    text(label, colLabelX, colLabelY);

    // Check hover for column palette (any of the 3 squares)
    if (mouseX >= colPaletteX && mouseX <= colPaletteX + colorSquareSize &&
        mouseY >= colPaletteStartY && mouseY <= colPaletteStartY + totalPaletteHeight) {
      hoveredPiece = piece;
      hoveredIsRow = false;
      hoveredX = colLabelX;
      hoveredY = colPaletteStartY + totalPaletteHeight / 2;
    }

    // Row labels (left) with 3-color palette
    const rowLabelX = startX - 15;
    const rowLabelY = startY + visualPos * cellSize + cellSize / 2;
    const rowPaletteStartX = rowLabelX - squareOffset - totalPaletteWidth;
    const rowPaletteY = rowLabelY - colorSquareSize / 2;

    // Draw 3 color squares for row
    for (let c = 0; c < 3; c++) {
      const squareX = rowPaletteStartX + c * (colorSquareSize + squareGap);
      push();
      fill(pieceColors[c].r, pieceColors[c].g, pieceColors[c].b);
      stroke(100);
      strokeWeight(0.5);
      rect(squareX, rowPaletteY, colorSquareSize, colorSquareSize);
      pop();
    }

    // Draw label
    text(label, rowLabelX, rowLabelY);

    // Check hover for row palette (any of the 3 squares)
    if (mouseX >= rowPaletteStartX && mouseX <= rowPaletteStartX + totalPaletteWidth &&
        mouseY >= rowPaletteY && mouseY <= rowPaletteY + colorSquareSize) {
      hoveredPiece = piece;
      hoveredIsRow = true;
      hoveredX = rowLabelX;
      hoveredY = rowPaletteY + colorSquareSize / 2;
    }
  }
  pop();

  // Check if hovering over a matrix cell
  let cellRowIdx = null;
  let cellColIdx = null;
  if (mouseX >= startX && mouseX <= startX + matrixSize &&
      mouseY >= startY && mouseY <= startY + matrixSize) {
    cellColIdx = Math.floor((mouseX - startX) / cellSize);
    cellRowIdx = Math.floor((mouseY - startY) / cellSize);

    if (cellColIdx < 0 || cellColIdx >= n) cellColIdx = null;
    if (cellRowIdx < 0 || cellRowIdx >= n) cellRowIdx = null;
  }

  // Update hover state
  setMatrixHoverState(hoveredPiece, hoveredIsRow, hoveredX, hoveredY, cellRowIdx, cellColIdx);

  // Draw RGB color space map FIRST so it doesn't cover hover preview or buttons
  drawRGBColorMap(width, height, sortedPieces, matrixSize, startX, startY, hoveredPiece, hoveredIsRow);

  // Draw enlarged 3-color palette preview on hover (vertical layout with table)
  if (hoveredPiece) {
    const pieceColors = getDominantColors(hoveredPiece, 3);
    const previewSquareSize = Math.max(18, colorSquareSize * 2.5);
    const previewGap = 3;
    const rgbTextWidth = 100; // Width for RGB text column
    const rowHeight = previewSquareSize + previewGap;
    const previewWidth = previewSquareSize + 12 + rgbTextWidth; // square + gap + text
    const previewHeight = rowHeight * 3 - previewGap + 8; // 3 rows total + padding
    const padding = 15; // Minimum distance from canvas edges

    // Position preview near cursor but offset to not obscure
    let previewX = hoveredX + 25;
    let previewY = hoveredY - previewHeight / 2;

    // Keep preview within bounds with proper padding
    if (previewX + previewWidth > width - padding) {
      previewX = hoveredX - previewWidth - 25;
    }
    if (previewX < padding) {
      previewX = padding;
    }
    if (previewY < padding) {
      previewY = padding;
    }
    if (previewY + previewHeight > height - padding) {
      previewY = height - previewHeight - padding;
    }

    push();
    // Background box with shadow
    fill(0, 0, 0, 40);
    noStroke();
    rect(previewX + 3, previewY + 3, previewWidth, previewHeight, 4);

    fill(255, 255, 255, 250);
    stroke(100);
    strokeWeight(1);
    rect(previewX, previewY, previewWidth, previewHeight, 4);

    // Draw 3 rows: color square + RGB text
    for (let c = 0; c < 3; c++) {
      const squareY = previewY + c * rowHeight + 6;
      const squareX = previewX + 6;

      // Draw color square
      fill(pieceColors[c].r, pieceColors[c].g, pieceColors[c].b);
      stroke(60);
      strokeWeight(2);
      rect(squareX, squareY, previewSquareSize, previewSquareSize, 2);

      // Draw RGB text in table format (aligned)
      const textX = squareX + previewSquareSize + 10;
      const textY = squareY + previewSquareSize / 2;

      noStroke();
      fill(80);
      textSize(10);
      textAlign(LEFT, CENTER);

      const rgbText = `R: ${String(pieceColors[c].r).padStart(3, ' ')}  G: ${String(pieceColors[c].g).padStart(3, ' ')}  B: ${String(pieceColors[c].b).padStart(3, ' ')}`;
      text(rgbText, textX, textY);
    }
    pop();
  }

  // Draw color legend
  const legendW = 180;
  const legendH = 18;
  const legendX = width - legendW - 40;
  const legendY = height - 55;

  push();
  // Draw gradient bar
  for (let i = 0; i < legendW; i++) {
    const t = i / legendW;
    const r = Math.round(255 - t * 200);
    const g = Math.round(255 - t * 180);
    const b = 255;
    stroke(r, g, b);
    line(legendX + i, legendY, legendX + i, legendY + legendH);
  }
  // Border
  noFill();
  stroke(100);
  strokeWeight(1);
  rect(legendX, legendY, legendW, legendH);
  pop();

  // Legend labels
  push();
  fill(80);
  textSize(10);
  textAlign(LEFT, CENTER);
  text("0", legendX - 15, legendY + legendH / 2);
  textAlign(RIGHT, CENTER);
  text(maxInteractions > 0 ? maxInteractions : "Max", legendX + legendW + 30, legendY + legendH / 2);
  textAlign(CENTER, TOP);
  text(t("matrixInteractions") || "Interactions", legendX + legendW / 2, legendY + legendH + 4);
  pop();

  // Draw description
  push();
  fill(80);
  textSize(11);
  textAlign(LEFT, TOP);
  const descText = groupingEnabled 
    ? (t("matrixLegend") || "Rows & Columns: Piece order (corners → edges → centers, sorted by color)")
    : (t("matrixLegendNoGroups") || "Rows & Columns: Piece order (sorted by color only)");
  text(descText, 20, height - 35);
  pop();

  // Draw grouping toggle button
  const buttonW = 180;
  const buttonH = 30;
  const buttonX = 20;
  const buttonY = height - 70;
  const buttonText = groupingEnabled ? t("matrixGroupingEnabled") : t("matrixGroupingDisabled");

  push();
  // Check if mouse is over button
  const isHovered = mouseX >= buttonX && mouseX <= buttonX + buttonW &&
                     mouseY >= buttonY && mouseY <= buttonY + buttonH;

  // Button background
  if (isHovered) {
    fill(70, 130, 220);
    cursor('pointer');
  } else {
    fill(100, 150, 230);
  }
  stroke(60);
  strokeWeight(2);
  rect(buttonX, buttonY, buttonW, buttonH, 5);

  // Button text
  fill(255);
  noStroke();
  textSize(12);
  textAlign(CENTER, CENTER);
  text(buttonText, buttonX + buttonW / 2, buttonY + buttonH / 2);
  pop();

  // Store button position for click detection
  setMatrixGroupingButtonPos(buttonX, buttonY, buttonW, buttonH);
}

// Helper function: Draw RGB color space map showing all puzzle piece colors
function drawRGBColorMap(width, height, sortedPieces, matrixSize, matrixStartX, matrixStartY, hoveredPiece, hoveredIsRow) {
  // Calculate map dimensions - single larger map
  const mapSize = 200;
  const mapX = matrixStartX + matrixSize + 40;
  const mapY = matrixStartY + (matrixSize - mapSize) / 2;

  // Check if there's enough space
  if (mapX + mapSize > width - 20) {
    return; // Not enough space, skip drawing
  }

  // Collect all dominant colors from all pieces
  const allColors = [];
  for (const piece of sortedPieces) {
    const colors = getDominantColors(piece, 3);
    for (const c of colors) {
      allColors.push(c);
    }
  }

  if (allColors.length === 0) return;

  // Find RGB bounds (min/max values)
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;

  for (const c of allColors) {
    minR = Math.min(minR, c.r);
    maxR = Math.max(maxR, c.r);
    minG = Math.min(minG, c.g);
    maxG = Math.max(maxG, c.g);
    minB = Math.min(minB, c.b);
    maxB = Math.max(maxB, c.b);
  }

  // Add some padding to bounds
  const padR = Math.max(10, (maxR - minR) * 0.1);
  const padG = Math.max(10, (maxG - minG) * 0.1);
  const padB = Math.max(10, (maxB - minB) * 0.1);
  minR = Math.max(0, minR - padR);
  maxR = Math.min(255, maxR + padR);
  minG = Math.max(0, minG - padG);
  maxG = Math.min(255, maxG + padG);
  minB = Math.max(0, minB - padB);
  maxB = Math.min(255, maxB + padB);

  // Get colors to highlight based on hover state
  let highlightColors = [];
  let rowColors = [];
  let colColors = [];

  const hover = matrixHoverState;
  if (hover) {
    // Check if hovering over a cell
    if (hover.cellRow !== null && hover.cellCol !== null) {
      // Hovering over a cell - show both row and column colors
      rowColors = getDominantColors(sortedPieces[hover.cellRow], 3);
      colColors = getDominantColors(sortedPieces[hover.cellCol], 3);
    } else if (hover.piece) {
      // Hovering over row/col label - show just those 3 colors
      highlightColors = getDominantColors(hover.piece, 3);
    }
  }

  push();

  // Determine which projection to show
  const projections = [
    { name: t("colorProjectionRedGreen"), axis1: t("colorRed"), axis2: t("colorGreen"), 
      getX: (c) => map(c.r, minR, maxR, 10, mapSize - 10),
      getY: (c) => map(c.g, minG, maxG, mapSize - 10, 10) },
    { name: t("colorProjectionRedBlue"), axis1: t("colorRed"), axis2: t("colorBlue"),
      getX: (c) => map(c.r, minR, maxR, 10, mapSize - 10),
      getY: (c) => map(c.b, minB, maxB, mapSize - 10, 10) },
    { name: t("colorProjectionGreenBlue"), axis1: t("colorGreen"), axis2: t("colorBlue"),
      getX: (c) => map(c.g, minG, maxG, 10, mapSize - 10),
      getY: (c) => map(c.b, minB, maxB, mapSize - 10, 10) }
  ];

  const currentProj = projections[rgbMapProjection];

  // Draw main title with navigation
  fill(80);
  noStroke();
  textSize(11);
  textAlign(CENTER, BOTTOM);
  text(t("rgbColorSpace"), mapX + mapSize / 2, mapY - 35);

  // Draw navigation buttons - higher and larger
  const navY = mapY - 25;
  const buttonSize = 22;
  const leftButtonX = mapX + mapSize / 2 - 50;
  const rightButtonX = mapX + mapSize / 2 + 28;

  // Left arrow button
  fill(240);
  stroke(100);
  strokeWeight(1);
  rect(leftButtonX, navY, buttonSize, buttonSize, 4);

  // Check if hovering over left button
  const hoverLeft = mouseX >= leftButtonX && mouseX <= leftButtonX + buttonSize &&
                     mouseY >= navY && mouseY <= navY + buttonSize;
  if (hoverLeft) {
    fill(220);
    rect(leftButtonX, navY, buttonSize, buttonSize, 4);
  }

  fill(60);
  noStroke();
  textSize(14);
  textAlign(CENTER, CENTER);
  text("◀", leftButtonX + buttonSize / 2, navY + buttonSize / 2);

  // Projection name
  textSize(11);
  fill(100);
  text(currentProj.name, mapX + mapSize / 2, navY + buttonSize / 2 + 1);

  // Right arrow button
  fill(240);
  stroke(100);
  strokeWeight(1);
  rect(rightButtonX, navY, buttonSize, buttonSize, 4);

  // Check if hovering over right button
  const hoverRight = mouseX >= rightButtonX && mouseX <= rightButtonX + buttonSize &&
                      mouseY >= navY && mouseY <= navY + buttonSize;
  if (hoverRight) {
    fill(220);
    rect(rightButtonX, navY, buttonSize, buttonSize, 4);
  }

  fill(60);
  noStroke();
  textSize(14);
  textAlign(CENTER, CENTER);
  text("▶", rightButtonX + buttonSize / 2, navY + buttonSize / 2);

  // Store button positions for global click handler
  setRGBButtonPositions(leftButtonX, navY, rightButtonX, navY, buttonSize);

  // Background box
  fill(255);
  stroke(100);
  strokeWeight(1);
  rect(mapX, mapY, mapSize, mapSize, 4);

  // Axis labels
  textSize(9);
  fill(100);
  noStroke();
  textAlign(CENTER, TOP);
  text(currentProj.axis1 + " →", mapX + mapSize / 2, mapY + mapSize + 3);
  textAlign(RIGHT, CENTER);
  push();
  translate(mapX - 5, mapY + mapSize / 2);
  rotate(-PI / 2);
  text("← " + currentProj.axis2, 0, 0);
  pop();

  // Draw all color points
  noStroke();
  for (const c of allColors) {
    const px = mapX + currentProj.getX(c);
    const py = mapY + currentProj.getY(c);

    fill(c.r, c.g, c.b, 150);
    circle(px, py, 5);
  }

  // Draw highlighted colors on top
  if (highlightColors.length > 0) {
    // Single highlight (row or column label hover) - use circles
    for (const c of highlightColors) {
      const px = mapX + currentProj.getX(c);
      const py = mapY + currentProj.getY(c);

      // Glow
      fill(255, 255, 0, 80);
      noStroke();
      circle(px, py, 16);

      // Ring
      noFill();
      stroke(255, 200, 0);
      strokeWeight(2);
      circle(px, py, 12);

      // Center point
      fill(c.r, c.g, c.b);
      noStroke();
      circle(px, py, 6);
    }
  } else if (rowColors.length > 0 || colColors.length > 0) {
    // Cell hover - show both row (circles) and column (squares)

    // Draw row colors with circles
    for (const c of rowColors) {
      const px = mapX + currentProj.getX(c);
      const py = mapY + currentProj.getY(c);

      // Glow
      fill(255, 100, 100, 80);
      noStroke();
      circle(px, py, 16);

      // Ring
      noFill();
      stroke(255, 80, 80);
      strokeWeight(2);
      circle(px, py, 12);

      // Center
      fill(c.r, c.g, c.b);
      noStroke();
      circle(px, py, 6);
    }

    // Draw column colors with squares
    for (const c of colColors) {
      const px = mapX + currentProj.getX(c);
      const py = mapY + currentProj.getY(c);

      // Glow
      fill(100, 100, 255, 80);
      noStroke();
      rectMode(CENTER);
      rect(px, py, 16, 16);

      // Border
      noFill();
      stroke(80, 80, 255);
      strokeWeight(2);
      rect(px, py, 12, 12);

      // Center
      fill(c.r, c.g, c.b);
      noStroke();
      rect(px, py, 6, 6);
      rectMode(CORNER);
    }
  }

  // Draw legend for marker shapes
  const legendY = mapY + mapSize + 20;
  textSize(9);
  fill(100);
  textAlign(LEFT, TOP);

  // Row (circle) indicator
  fill(255, 80, 80, 100);
  noStroke();
  circle(mapX + 5, legendY + 5, 10);
  noFill();
  stroke(255, 80, 80);
  strokeWeight(1.5);
  circle(mapX + 5, legendY + 5, 10);

  fill(80);
  noStroke();
  text(t("colorMapRow"), mapX + 15, legendY + 1);

  // Column (square) indicator
  fill(100, 100, 255, 100);
  noStroke();
  rectMode(CENTER);
  rect(mapX + 65, legendY + 5, 10, 10);
  noFill();
  stroke(80, 80, 255);
  strokeWeight(1.5);
  rect(mapX + 65, legendY + 5, 10, 10);
  rectMode(CORNER);

  fill(80);
  noStroke();
  text(t("colorMapColumn"), mapX + 75, legendY + 1);

  pop();
}
