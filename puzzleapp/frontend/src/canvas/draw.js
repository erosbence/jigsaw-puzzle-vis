import { gridRectScaled } from "../ui/layout.js";
import { styleState, puzzleMeta, listPieces, listWrongLinks, globalSnapshots, connectionsState, puzzleGrid } from "./state.js";
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
    .filter(v => typeof v === "number");
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
  const lx = originX + W - legendW - 8;
  const ly = originY + H - legendH - 18;
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
    text(`Legkorabbi: ${formatClock(minTime)}`, lx - 8, ly + legendH / 2);
    textAlign(LEFT, CENTER);
    text(`Legkesobbi: ${formatClock(legendMax)}`, lx + legendW + 8, ly + legendH / 2);
  } else {
    textAlign(LEFT, CENTER);
    text("Nincs helyere illesztve egy elem sem", lx, ly + legendH / 2);
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
      const gx = tx + (g.x / p.w) * p.sw;
      const gy = ty + (g.y / p.h) * p.sh;
      circle(gx, gy, 6);
    }
    pop();
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
