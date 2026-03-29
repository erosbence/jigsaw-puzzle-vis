import { gridRectScaled } from "../ui/layout.js";
import { t } from "../ui/i18n.js";
import { styleState, puzzleMeta, listPieces, listWrongLinks, globalSnapshots, connectionsState, puzzleGrid, hoverPiece, getPieceInteractionMatrix, matrixHoverState, setMatrixHoverState, rgbMapProjection, setRGBMapProjection, setRGBButtonPositions, clearRGBButtonPositions, getMatrixGroupingEnabled, setMatrixGroupingButtonPos, clearMatrixGroupingButtonPos, matrixCurrentOrder, setMatrixCurrentOrder, matrixAnimationState, startMatrixAnimation, getMatrixAnimationProgress, pathsState, togglePathsPiece } from "./state.js";
import { averagePieceDiagonal } from "./interaction.js";

export function drawBackground(width, height) {
  background(245);
  if (puzzleMeta.maxX > puzzleMeta.minX && puzzleMeta.maxY > puzzleMeta.minY) {
    const { originX, originY, W, H } = gridRectScaled(width, height);
    push(); noFill(); stroke(225); strokeWeight(2);
    rect(originX + .5, originY + .5, W, H, 6); pop();
  }
}

// Cached white silhouette of a piece (all opaque pixels → white, alpha preserved)
// Used for dashboard heatmaps: tint(r,g,b) on white → pure solid color in piece shape
function getWhiteSilhouette(piece) {
  if (piece._whiteSilhouette) return piece._whiteSilhouette;
  const src = piece.img;
  if (!src) return null;
  const g = createImage(src.width, src.height);
  g.copy(src, 0, 0, src.width, src.height, 0, 0, src.width, src.height);
  g.loadPixels();
  for (let i = 0; i < g.pixels.length; i += 4) {
    if (g.pixels[i + 3] > 0) {
      g.pixels[i] = 255;
      g.pixels[i + 1] = 255;
      g.pixels[i + 2] = 255;
    }
  }
  g.updatePixels();
  piece._whiteSilhouette = g;
  return g;
}

// Pre-tinted silhouette cache: avoids expensive tint()+image() every frame.
// The white silhouette is recolored once per unique (r,g,b) and cached on the
// piece object.  Opacity is applied at draw time via drawingContext.globalAlpha
// so that slider changes never invalidate this cache.
// Up to 4 entries per piece (3 dashboard panels + spare).
function getTintedSilhouette(piece, cr, cg, cb) {
  const sil = getWhiteSilhouette(piece);
  if (!sil) return null;

  const key = `${cr},${cg},${cb}`;
  if (!piece._tintedSilMap) piece._tintedSilMap = {};
  if (piece._tintedSilMap[key]) return piece._tintedSilMap[key];

  const img = createImage(sil.width, sil.height);
  img.copy(sil, 0, 0, sil.width, sil.height, 0, 0, sil.width, sil.height);
  img.loadPixels();
  for (let i = 0; i < img.pixels.length; i += 4) {
    if (img.pixels[i + 3] > 0) {
      img.pixels[i]     = cr;
      img.pixels[i + 1] = cg;
      img.pixels[i + 2] = cb;
    }
  }
  img.updatePixels();

  // Evict oldest entry when cache grows beyond 4 slots
  const keys = Object.keys(piece._tintedSilMap);
  if (keys.length >= 4) delete piece._tintedSilMap[keys[0]];

  piece._tintedSilMap[key] = img;
  return img;
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
    const curSw = currentPiece.sw || 1;
    const sStored  = (stored.snapS      != null) ? stored.snapS      : s * (storedSw / curSw);
    const oxStored = (stored.snapOriginX != null) ? stored.snapOriginX : originX;
    const oyStored = (stored.snapOriginY != null) ? stored.snapOriginY : originY;
    const storedTargetX = oxStored + (storedMetaX - puzzleMeta.minX) * sStored + storedSw / 2;
    const storedTargetY = oyStored + (storedMetaY - puzzleMeta.minY) * sStored + storedSh / 2;
    const dx = stored.x - storedTargetX;
    const dy = stored.y - storedTargetY;
    const curTarget = targetCenter(currentPiece);
    const scale = s / sStored;
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

// Perceptually uniform sequential colormaps
function viridisColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Viridis colormap approximation (purple → blue → teal → green → yellow)
  const colors = [
    [68, 1, 84],      // t=0.0 dark purple
    [59, 82, 139],    // t=0.25 blue
    [33, 145, 140],   // t=0.5 teal
    [94, 201, 98],    // t=0.75 green
    [253, 231, 37]    // t=1.0 yellow
  ];
  const idx = clamped * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[i];
  const c2 = colors[i + 1];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * f),
    Math.round(c1[1] + (c2[1] - c1[1]) * f),
    Math.round(c1[2] + (c2[2] - c1[2]) * f)
  ];
}

function plasmaColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Plasma colormap (dark blue → purple → pink → orange → yellow)
  const colors = [
    [13, 8, 135],     // t=0.0 dark blue
    [126, 3, 168],    // t=0.25 purple
    [204, 71, 120],   // t=0.5 pink
    [248, 149, 64],   // t=0.75 orange
    [252, 253, 191]   // t=1.0 pale yellow
  ];
  const idx = clamped * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[i];
  const c2 = colors[i + 1];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * f),
    Math.round(c1[1] + (c2[1] - c1[1]) * f),
    Math.round(c1[2] + (c2[2] - c1[2]) * f)
  ];
}

function infernoColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Inferno colormap (black → dark purple → red → orange → yellow)
  const colors = [
    [0, 0, 4],        // t=0.0 black
    [87, 16, 110],    // t=0.25 dark purple
    [188, 55, 84],    // t=0.5 red
    [249, 142, 9],    // t=0.75 orange
    [252, 255, 164]   // t=1.0 pale yellow
  ];
  const idx = clamped * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[i];
  const c2 = colors[i + 1];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * f),
    Math.round(c1[1] + (c2[1] - c1[1]) * f),
    Math.round(c1[2] + (c2[2] - c1[2]) * f)
  ];
}

function magmaColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Magma colormap (black → dark purple → magenta → orange → pale yellow)
  const colors = [
    [0, 0, 4],        // t=0.0 black
    [81, 18, 124],    // t=0.25 dark purple
    [183, 55, 121],   // t=0.5 magenta
    [251, 136, 97],   // t=0.75 orange/salmon
    [252, 253, 191]   // t=1.0 pale yellow
  ];
  const idx = clamped * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[i];
  const c2 = colors[i + 1];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * f),
    Math.round(c1[1] + (c2[1] - c1[1]) * f),
    Math.round(c1[2] + (c2[2] - c1[2]) * f)
  ];
}

function cividisColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Cividis colormap (dark blue → gray/green → yellow) - optimized for color vision deficiency
  const colors = [
    [0, 32, 77],      // t=0.0 dark blue
    [61, 92, 122],    // t=0.25 blue-gray
    [122, 134, 104],  // t=0.5 gray-green
    [194, 175, 88],   // t=0.75 olive/yellow-green
    [253, 231, 37]    // t=1.0 yellow
  ];
  const idx = clamped * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[i];
  const c2 = colors[i + 1];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * f),
    Math.round(c1[1] + (c2[1] - c1[1]) * f),
    Math.round(c1[2] + (c2[2] - c1[2]) * f)
  ];
}

// Helper function to get the appropriate colormap function
function getDashboardColorFunction(colormapName) {
  return getColormapFunction(colormapName);
}

function seismicColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Seismic diverging colormap (dark blue → blue → white → red → dark red)
  const colors = [
    [0, 0, 76],       // t=0.0 dark blue
    [0, 0, 255],      // t=0.25 blue
    [255, 255, 255],  // t=0.5 white
    [255, 0, 0],      // t=0.75 red
    [128, 0, 0]       // t=1.0 dark red
  ];
  const idx = clamped * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= colors.length - 1) return colors[colors.length - 1];
  const c1 = colors[i];
  const c2 = colors[i + 1];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * f),
    Math.round(c1[1] + (c2[1] - c1[1]) * f),
    Math.round(c1[2] + (c2[2] - c1[2]) * f)
  ];
}

// General purpose colormap resolver (used by paths and dashboard)
function getColormapFunction(name) {
  switch (name) {
    case 'viridis': return viridisColor;
    case 'plasma': return plasmaColor;
    case 'inferno': return infernoColor;
    case 'magma': return magmaColor;
    case 'cividis': return cividisColor;
    case 'seismic': return seismicColor;
    default: return viridisColor;
  }
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

// Time-based color gradient: uses the selected colormap from pathsState
function timeColor(t) {
  const fn = getColormapFunction(pathsState.colormap || 'viridis');
  return fn(t);
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
    const curSw = currentPiece.sw || 1;
    const sStored  = (stored.snapS      != null) ? stored.snapS      : s * (storedSw / curSw);
    const oxStored = (stored.snapOriginX != null) ? stored.snapOriginX : originX;
    const oyStored = (stored.snapOriginY != null) ? stored.snapOriginY : originY;
    // Compute where the target center was at snapshot time
    const storedTargetX = oxStored + (storedMetaX - puzzleMeta.minX) * sStored + storedSw / 2;
    const storedTargetY = oyStored + (storedMetaY - puzzleMeta.minY) * sStored + storedSh / 2;
    // Compute offset from target in snapshot and apply to current target
    const dx = stored.x - storedTargetX;
    const dy = stored.y - storedTargetY;
    const curTarget = targetCenter(currentPiece);
    const scale = s / sStored;
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

  // --- Draw piece shapes (colorless outlines) at their target positions ---
  // Helper: get or create cached grayscale version of a piece image
  function getGrayscaleImg(piece) {
    if (piece._grayscaleImg) return piece._grayscaleImg;
    const src = piece.img;
    if (!src) return null;
    const g = createImage(src.width, src.height);
    g.copy(src, 0, 0, src.width, src.height, 0, 0, src.width, src.height);
    g.filter(GRAY);
    piece._grayscaleImg = g;
    return g;
  }

  const pieceBounds = [];
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined' || !pp.img) continue;
    const tc = targetCenter(pp);
    const pw = pp.sw || 0;
    const ph = pp.sh || 0;
    const px = tc.x - pw / 2;
    const py = tc.y - ph / 2;

    const isSelected = pathsState.selected.includes(pp.index);
    const grayImg = getGrayscaleImg(pp);
    if (!grayImg) continue;

    push();
    if (isSelected) {
      tint(255, 220);
    } else {
      tint(255, 100);
    }
    image(grayImg, px, py, pw, ph);
    pop();

    // Draw highlight border for selected pieces
    if (isSelected) {
      push();
      noFill();
      stroke(50, 130, 240);
      strokeWeight(2);
      rect(px + 1, py + 1, pw - 2, ph - 2, 3);
      pop();
    }

    // Store bounds for click hit-testing
    pieceBounds.push({ index: pp.index, x: px, y: py, w: pw, h: ph });
  }

  // Expose piece bounds for click handler
  drawMovementPaths._pieceBounds = pieceBounds;
  drawMovementPaths._gridRect = { originX, originY, W, H, s };

  // --- Only draw paths for selected piece(s) ---
  const selectedSet = new Set(pathsState.selected);
  if (selectedSet.size === 0) {
    // No piece selected – show hint
    push();
    fill(120);
    textAlign(CENTER, CENTER);
    textSize(14);
    text(t("pathsClickHint") || "Click on a piece to see its movement path", width / 2, originY + H + 30);
    pop();
    return;
  }

  // For each SELECTED piece, collect its movement history from snapshots
  for (const piece of allPieces) {
    if (!piece || typeof piece.index === 'undefined') continue;
    if (!selectedSet.has(piece.index)) continue;

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

    // Pre-compute all curve segments for two-pass rendering (halo + color)
    const segments = 30; // Higher subdivision for smooth gradient
    const curvePoints = []; // { pt1, pt2, time }
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = i > 0 ? path[i - 1] : path[i];
      const p1 = path[i];
      const p2 = path[i + 1];
      const p3 = i + 2 < path.length ? path[i + 2] : path[i + 1];
      for (let seg = 0; seg < segments; seg++) {
        const t1 = seg / segments;
        const t2 = (seg + 1) / segments;
        const pt1 = catmullRomPoint(p0, p1, p2, p3, t1);
        const pt2 = catmullRomPoint(p0, p1, p2, p3, t2);
        const time = p1.time + (p2.time - p1.time) * ((t1 + t2) / 2);
        curvePoints.push({ pt1, pt2, time });
      }
    }

    // Pass 1: White halo for contrast
    push();
    noFill();
    stroke(255, 255, 255, 180);
    strokeWeight(5);
    for (const cp of curvePoints) {
      line(cp.pt1.x, cp.pt1.y, cp.pt2.x, cp.pt2.y);
    }
    pop();

    // Pass 2: Colored path with uniform weight and full opacity
    push();
    noFill();
    strokeWeight(2);
    for (const cp of curvePoints) {
      const [r, g, b] = timeColor(cp.time);
      stroke(r, g, b);
      line(cp.pt1.x, cp.pt1.y, cp.pt2.x, cp.pt2.y);
    }
    pop();

    // Pass 3: Directional arrowheads at regular intervals
    if (curvePoints.length > 0) {
      const arrowCount = Math.max(2, Math.floor(curvePoints.length / 20));
      const step = Math.floor(curvePoints.length / (arrowCount + 1));
      push();
      noStroke();
      for (let a = 1; a <= arrowCount; a++) {
        const idx = Math.min(a * step, curvePoints.length - 1);
        const cp = curvePoints[idx];
        const dx = cp.pt2.x - cp.pt1.x;
        const dy = cp.pt2.y - cp.pt1.y;
        const angle = Math.atan2(dy, dx);
        const [r, g, b] = timeColor(cp.time);
        fill(r, g, b);
        push();
        translate(cp.pt2.x, cp.pt2.y);
        rotate(angle);
        triangle(0, 0, -7, -3.5, -7, 3.5);
        pop();
      }
      pop();
    }

    // Draw station markers
    for (const station of stations) {
      if (station.isFirst) {
        // Start: filled dark circle with white border
        push();
        fill(40, 40, 80);
        stroke(255);
        strokeWeight(2);
        circle(station.x, station.y, 12);
        pop();
      } else if (station.isLast) {
        // End: star marker (kept as requested)
        const [r, g, b] = timeColor(station.time);
        drawStar(station.x, station.y, 8, [r, g, b], 255);
        push();
        noFill();
        stroke(255);
        strokeWeight(1.5);
        circle(station.x, station.y, 18);
        pop();
      } else {
        // Intermediate station: small muted dot
        push();
        fill(160, 160, 170, 200);
        stroke(255, 255, 255, 180);
        strokeWeight(1.5);
        circle(station.x, station.y, 8);
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

// Click handler for the paths view – detects which piece shape was clicked
export function handlePathsClick(mx, my) {
  const bounds = drawMovementPaths._pieceBounds;
  if (!bounds) return false;
  // Iterate in reverse so topmost (last drawn) piece wins
  for (let i = bounds.length - 1; i >= 0; i--) {
    const b = bounds[i];
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      togglePathsPiece(b.index);
      return true;
    }
  }
  return false;
}

// Helper: Get or create cached outline version of piece
// This pre-renders the piece with its outline into an offscreen buffer
// Dramatically improves performance by reducing 5 image() calls to just 1
function getOrCreateOutlineCache(piece, outlineWidth) {
  // Include size in cache key since sw/sh are dynamic (based on pieceScale)
  const sw = piece.sw, sh = piece.sh;
  const cacheKey = `_outlineCache_${outlineWidth}_${sw}_${sh}`;

  // Return cached version if available and size matches
  if (piece[cacheKey]) {
    return piece[cacheKey];
  }

  // Create offscreen graphics buffer
  const r = Math.ceil(outlineWidth);

  // Need extra padding for the outline offset
  const buffer = createGraphics(sw + r * 2, sh + r * 2);
  buffer.clear();

  // Draw outline (4-directional offset)
  buffer.push();
  buffer.noStroke();
  buffer.tint(0, 0, 0, 180);
  buffer.image(piece.img, r - r, r, sw, sh);  // left
  buffer.image(piece.img, r + r, r, sw, sh);  // right
  buffer.image(piece.img, r, r - r, sw, sh);  // top
  buffer.image(piece.img, r, r + r, sw, sh);  // bottom
  buffer.noTint();
  buffer.pop();

  // Draw the piece itself on top
  buffer.image(piece.img, r, r, sw, sh);

  // Cache and return
  piece[cacheKey] = buffer;
  return buffer;
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

  // Decide which image to use
  let imgToRender = piece.img;
  let offsetX = 0, offsetY = 0;
  let renderWidth = sw;
  let renderHeight = sh;

  if (st.outline) {
    // Use cached outline version (pre-rendered, much faster!)
    const cached = getOrCreateOutlineCache(piece, st.outlineW || 1);
    imgToRender = cached;
    const r = Math.ceil(st.outlineW || 1);
    offsetX = -r;
    offsetY = -r;
    // Cached image is larger (includes outline padding)
    renderWidth = sw + r * 2;
    renderHeight = sh + r * 2;
  }

  // Render with or without shadow (always specify explicit size)
  if (st.shadow) {
    const k = st.shadowI / 100;
    push();
    drawingContext.shadowColor = `rgba(0,0,0,${0.18 + 0.22 * k})`;
    drawingContext.shadowBlur = 6 + Math.round(10 * k);
    drawingContext.shadowOffsetX = 2 + Math.round(4 * k);
    drawingContext.shadowOffsetY = 2 + Math.round(4 * k);
    image(imgToRender, offsetX, offsetY, renderWidth, renderHeight);
    pop();
  } else {
    image(imgToRender, offsetX, offsetY, renderWidth, renderHeight);
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

  // Return cached result if inputs haven't changed (avoids O(n²) greedy sort every frame)
  const indicesKey = pieces.map(p => p.index).join(',');
  if (_matrixSortCache.result &&
      _matrixSortCache.pieceIndicesKey === indicesKey &&
      _matrixSortCache.rows === rows &&
      _matrixSortCache.cols === cols &&
      _matrixSortCache.groupingEnabled === groupingEnabled) {
    return _matrixSortCache.result;
  }

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

  const result = { pieces: sortedPieces, boundaries };

  // Store in cache so subsequent frames skip the O(n²) sort
  _matrixSortCache.result = result;
  _matrixSortCache.pieceIndicesKey = indicesKey;
  _matrixSortCache.rows = rows;
  _matrixSortCache.cols = cols;
  _matrixSortCache.groupingEnabled = groupingEnabled;

  return result;
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

  // For 10x10 puzzles, scale up the matrix by 1.5x for better visibility
  const scaleFactor = (rows === 10 && cols === 10) ? 1.5 : 1.0;
  const cellSize = Math.floor((availableSize / n) * scaleFactor);
  const matrixSize = cellSize * n;
  const startX = originX; // Align with puzzle grid frame left
  const startY = originY; // Align with puzzle grid frame top

  // Store layout for lightweight hover-zone detection (used by computeAdjacencyHoverKey)
  _adjLayout = { startX, startY, cellSize, n, matrixSize };

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

// ============================================================================
// DASHBOARD VIEW - 3-panel heatmap visualization
// ============================================================================

// Dashboard state
export const dashboardState = {
  overlayEnabled: false,
  overlayGrayscale: false,
  _grayscalePuzzleImage: null,
  selectedPiece: null, // {row, col} of selected cell
  colorOpacity: 0.85,  // 0.0–1.0: colored silhouette opacity (slider-controlled)
  colormap: 'viridis', // Selected colormap: viridis, plasma, inferno, magma, cividis
  shapeProfileExpanded: false, // Collapsible shape profile panel (collapsed by default)
  shapeProfileCustomH: null,   // null = auto height, number = user-dragged height in px
  shapeProfileSelectedType: null, // null | "corner" | "edge" | "interior" — drill-down popup
  shapeProfilePopupScrollY: 0, // scroll offset for drill-down popup content
};

// --- Shape profile resize drag state ---
const _spDrag = {
  active: false,     // mousedown happened on resize grip
  resizing: false,   // significant vertical movement detected (>5px)
  startMouseY: 0,
  startH: 0,
};

export function shapeProfileResizeHitTest(mx, my, width, height) {
  if (!dashboardState.shapeProfileExpanded) return false;
  const padding = 20;
  const toggleHeaderH = 28;
  const shapeProfileFullH = Math.max(110, Math.min(170, height * 0.22));
  const expandedH = dashboardState.shapeProfileCustomH || shapeProfileFullH;
  const shapeY = height - padding - expandedH;
  // Hit zone: 12px band centered on the panel top edge
  return mx >= padding && mx <= width - padding &&
         my >= shapeY - 6 && my <= shapeY + 6;
}

export function startShapeProfileResize(mouseY, canvasHeight) {
  const shapeProfileFullH = Math.max(110, Math.min(170, canvasHeight * 0.22));
  _spDrag.active = true;
  _spDrag.resizing = false;
  _spDrag.startMouseY = mouseY;
  _spDrag.startH = dashboardState.shapeProfileCustomH || shapeProfileFullH;
}

export function updateShapeProfileResize(mouseY, canvasHeight) {
  if (!_spDrag.active) return false;
  if (!_spDrag.resizing && Math.abs(mouseY - _spDrag.startMouseY) < 5) return false;
  _spDrag.resizing = true;
  const deltaY = _spDrag.startMouseY - mouseY; // drag up = increase height
  const newH = _spDrag.startH + deltaY;
  const minH = 90;
  const maxH = Math.max(minH, canvasHeight - 285); // ensure panels get >=200px
  dashboardState.shapeProfileCustomH = Math.max(minH, Math.min(maxH, newH));
  return true;
}

// Returns true if this was a click (toggle), false if it was a resize drag
export function stopShapeProfileResize() {
  const wasActive = _spDrag.active;
  const wasResizing = _spDrag.resizing;
  _spDrag.active = false;
  _spDrag.resizing = false;
  if (wasActive && !wasResizing) {
    // No significant movement — treat as click → toggle collapse
    toggleShapeProfile();
    return true;
  }
  return false;
}

export function isShapeProfileDragging() {
  return _spDrag.active;
}

// --- Incremental caches to avoid recomputing heavy analytics every frame ---

// Movement distance cache: only processes new snapshots incrementally
const _movementCache = {
  distances: null,       // Map<"r,c", totalDist>
  maxDistance: 1,
  lastSnapCount: 0,
  prevPositions: null,   // Map<pieceIndex, {x,y}>
};

// Off-grid analysis cache
const _offgridCache = {
  joinTime: null,        // Map<pieceIndex, timestamp>
  minTime: Infinity,
  maxTime: -Infinity,
  lastSnapCount: 0,
  targetCentersKey: '',  // detect display size changes
};

// Matrix sort cache: avoids O(n²) greedy nearest-neighbor sort every frame
const _matrixSortCache = {
  result: null,
  pieceIndicesKey: '',
  rows: -1,
  cols: -1,
  groupingEnabled: null,
};

// Adjacency matrix layout cache: used by computeAdjacencyHoverKey for
// lightweight diff-based redraw (avoids full O(n²) draw on every mouseMoved)
let _adjLayout = null; // { startX, startY, cellSize, n, matrixSize }

export function resetDashboardCaches() {
  _movementCache.distances = null;
  _movementCache.maxDistance = 1;
  _movementCache.lastSnapCount = 0;
  _movementCache.prevPositions = null;
  _offgridCache.joinTime = null;
  _offgridCache.minTime = Infinity;
  _offgridCache.maxTime = -Infinity;
  _offgridCache.lastSnapCount = 0;
  _offgridCache.targetCentersKey = '';
  _matrixSortCache.result = null;
  _matrixSortCache.pieceIndicesKey = '';
  _adjLayout = null;
  dashboardState._grayscalePuzzleImage = null;
  _shapeProfileCache.data = null;
  _shapeProfileCache.pieceCount = 0;
  _shapeProfileRowBounds = [];
  _shapeProfilePopupBounds = null;
  dashboardState.shapeProfileSelectedType = null;
  // Clear per-piece tinted silhouette caches and edge config
  for (const p of listPieces()) {
    if (p._tintedSilMap) p._tintedSilMap = null;
    if (p._edgeConfig) p._edgeConfig = null;
  }
}

/**
 * Lightweight hover-zone key for the adjacency matrix view.
 * Returns a short string that changes only when the mouse enters a
 * visually distinct zone (different cell, different label row/col,
 * button area, or "outside").  Used by mouseMoved to skip expensive
 * full redraws when the hover zone hasn't changed.
 */
export function computeAdjacencyHoverKey(mx, my) {
  if (!_adjLayout) return 'o';
  const { startX, startY, cellSize, n, matrixSize } = _adjLayout;

  // Matrix cell area
  if (mx >= startX && mx < startX + matrixSize &&
      my >= startY && my < startY + matrixSize) {
    const col = Math.floor((mx - startX) / cellSize);
    const row = Math.floor((my - startY) / cellSize);
    if (col >= 0 && col < n && row >= 0 && row < n) return `c${row},${col}`;
  }

  // Top label / palette area (column headers)
  if (mx >= startX && mx < startX + matrixSize && my < startY) {
    const col = Math.floor((mx - startX) / cellSize);
    if (col >= 0 && col < n) return `t${col}`;
  }

  // Left label / palette area (row headers)
  if (my >= startY && my < startY + matrixSize && mx < startX) {
    const row = Math.floor((my - startY) / cellSize);
    if (row >= 0 && row < n) return `l${row}`;
  }

  return 'o'; // outside any interactive zone
}

export function setDashboardOverlay(enabled) {
  dashboardState.overlayEnabled = enabled;
}

export function setDashboardOverlayGrayscale(val) {
  dashboardState.overlayGrayscale = val;
}

export function setDashboardColormap(colormap) {
  dashboardState.colormap = colormap;
}

export function setDashboardOpacity(val) {
  dashboardState.colorOpacity = Math.max(0, Math.min(1, val));
}

export function setDashboardSelectedPiece(row, col) {
  dashboardState.selectedPiece = row !== null && col !== null ? { row, col } : null;
}

// Handle dashboard click detection - returns {row, col} if click is on a cell, null otherwise
export function toggleShapeProfile() {
  dashboardState.shapeProfileExpanded = !dashboardState.shapeProfileExpanded;
  dashboardState.shapeProfileSelectedType = null; // close popup on collapse
}

export function toggleShapeProfileType(typeKey) {
  if (dashboardState.shapeProfileSelectedType === typeKey) {
    dashboardState.shapeProfileSelectedType = null;
  } else {
    dashboardState.shapeProfileSelectedType = typeKey;
  }
  dashboardState.shapeProfilePopupScrollY = 0; // reset scroll on open/close
}

export function handleShapeProfilePopupWheel(deltaY) {
  if (!dashboardState.shapeProfileSelectedType || !_shapeProfilePopupBounds) return false;
  const b = _shapeProfilePopupBounds;
  if (mouseX < b.x || mouseX > b.x + b.w || mouseY < b.y || mouseY > b.y + b.h) return false;
  const maxScroll = _shapeProfilePopupMaxScroll || 0;
  if (maxScroll <= 0) return false;
  dashboardState.shapeProfilePopupScrollY = Math.max(0, Math.min(maxScroll, dashboardState.shapeProfilePopupScrollY + deltaY * 0.5));
  return true;
}

export function handleDashboardClick(mouseX, mouseY, width, height, rows, cols) {
  if (!rows || !cols) return null;

  // Dashboard layout calculation (MUST MATCH drawDashboard exactly)
  const padding = 20;
  const gapBetween = 15;
  const availableWidth = width - padding * 2 - gapBetween * 2;
  const panelWidth = availableWidth / 3;
  const toggleHeaderH = 28;
  const shapeProfileFullH = Math.max(110, Math.min(170, height * 0.22));
  const expandedH = dashboardState.shapeProfileCustomH || shapeProfileFullH;
  const shapeProfileH = dashboardState.shapeProfileExpanded ? expandedH : toggleHeaderH;
  const panelHeight = height - padding * 2 - 60 - shapeProfileH;

  const leftX = padding;
  const centerX = leftX + panelWidth + gapBetween;
  const rightX = centerX + panelWidth + gapBetween;
  const panelY = padding + 35; // Leave space for titles

  // Check shape profile toggle header click
  const shapeY = height - padding - shapeProfileH;
  const toggleHitX = padding;
  const toggleHitW = width - padding * 2;
  if (!_spDrag.active &&
      mouseX >= toggleHitX && mouseX <= toggleHitX + toggleHitW &&
      mouseY >= shapeY && mouseY <= shapeY + toggleHeaderH) {
    toggleShapeProfile();
    return { _shapeToggle: true };
  }

  // Check shape profile row clicks (drill-down popup)
  if (dashboardState.shapeProfileExpanded && _shapeProfileRowBounds.length > 0) {
    // Check if clicking inside the popup → ignore (don't close), but handle ✕ button
    if (_shapeProfilePopupBounds &&
        mouseX >= _shapeProfilePopupBounds.x && mouseX <= _shapeProfilePopupBounds.x + _shapeProfilePopupBounds.w &&
        mouseY >= _shapeProfilePopupBounds.y && mouseY <= _shapeProfilePopupBounds.y + _shapeProfilePopupBounds.h) {
      // Check if click is on the ✕ close button (right side of the 28px header)
      const popupHeaderH = 28;
      const closeBtnX = _shapeProfilePopupBounds.x + _shapeProfilePopupBounds.w - 40;
      if (mouseX >= closeBtnX && mouseY <= _shapeProfilePopupBounds.y + popupHeaderH) {
        dashboardState.shapeProfileSelectedType = null;
        return { _shapePopupClose: true };
      }
      return { _shapePopupInside: true };
    }
    // Check if clicking on a category row
    for (const rb of _shapeProfileRowBounds) {
      if (mouseX >= rb.x && mouseX <= rb.x + rb.w &&
          mouseY >= rb.y && mouseY <= rb.y + rb.h) {
        toggleShapeProfileType(rb.key);
        return { _shapeTypeToggle: rb.key };
      }
    }
    // Click outside both rows and popup → close popup
    if (dashboardState.shapeProfileSelectedType !== null) {
      dashboardState.shapeProfileSelectedType = null;
      return { _shapePopupClose: true };
    }
  }

  // Check which panel was clicked
  let panelX = null;
  if (mouseX >= leftX && mouseX < leftX + panelWidth && mouseY >= panelY && mouseY < panelY + panelHeight) {
    panelX = leftX;
  } else if (mouseX >= centerX && mouseX < centerX + panelWidth && mouseY >= panelY && mouseY < panelY + panelHeight) {
    panelX = centerX;
  } else if (mouseX >= rightX && mouseX < rightX + panelWidth && mouseY >= panelY && mouseY < panelY + panelHeight) {
    panelX = rightX;
  } else {
    return null; // Click outside all panels
  }

  // Calculate cell position within the panel (MUST MATCH panel draw functions)
  // ALL panels use uniform reserves so matrices are identical in size
  const topReserve = 50;
  const legendReserve = 38;
  const matrixAreaH = panelHeight - topReserve - legendReserve;
  const cellSize = Math.min(panelWidth / cols, matrixAreaH / rows);
  const matrixW = cellSize * cols;
  const matrixH = cellSize * rows;
  const offsetX = panelX + (panelWidth - matrixW) / 2;
  const offsetY = panelY + topReserve + (matrixAreaH - matrixH) / 2;

  // Check if click is within the matrix bounds
  if (mouseX < offsetX || mouseX >= offsetX + matrixW ||
      mouseY < offsetY || mouseY >= offsetY + matrixH) {
    return null; // Click outside matrix
  }

  // Calculate row and column
  const col = Math.floor((mouseX - offsetX) / cellSize);
  const row = Math.floor((mouseY - offsetY) / cellSize);

  // Validate bounds
  if (row >= 0 && row < rows && col >= 0 && col < cols) {
    return { row, col };
  }

  return null;
}

// Module-level helper: get or create cached grayscale version of the full puzzle image
function getGrayscalePuzzleImage() {
  if (dashboardState._grayscalePuzzleImage) return dashboardState._grayscalePuzzleImage;
  const src = window.__currentPuzzleImage;
  if (!src) return null;
  const g = createImage(src.width, src.height);
  g.copy(src, 0, 0, src.width, src.height, 0, 0, src.width, src.height);
  g.filter(GRAY);
  dashboardState._grayscalePuzzleImage = g;
  return g;
}

// Main dashboard draw function
export function drawDashboard(width, height, rows, cols, pieces, elapsedMs) {
  if (!rows || !cols) {
    push();
    fill(100);
    textAlign(CENTER, CENTER);
    textSize(16);
    text(t("noMatrixData") || "No puzzle data", width / 2, height / 2);
    pop();
    return;
  }

  // Calculate layout - 3 columns with small gaps + collapsible shape profile below
  const padding = 20;
  const gapBetween = 15;
  const availableWidth = width - padding * 2 - gapBetween * 2;
  const panelWidth = availableWidth / 3;

  // Reserve bottom area: full panel when expanded (user-resizable), thin toggle header when collapsed
  const toggleHeaderH = 28;
  const shapeProfileFullH = Math.max(110, Math.min(170, height * 0.22));
  const expandedH = dashboardState.shapeProfileCustomH || shapeProfileFullH;
  const shapeProfileH = dashboardState.shapeProfileExpanded ? expandedH : toggleHeaderH;
  const panelHeight = height - padding * 2 - 60 - shapeProfileH;

  const leftX = padding;
  const centerX = leftX + panelWidth + gapBetween;
  const rightX = centerX + panelWidth + gapBetween;
  const panelY = padding + 35; // Leave space for titles

  // Piece lookup
  const lookup = new Map();
  for (const p of pieces || []) lookup.set(`${p.r},${p.c}`, p);

  // Draw titles
  push();
  fill(50);
  textSize(15);
  textAlign(CENTER, TOP);
  text(t("dashboardTimeTitle") || "Time Imprint", leftX + panelWidth / 2, padding);
  text(t("dashboardInteractionTitle") || "Interactions", centerX + panelWidth / 2, padding);
  text(t("dashboardMovementTitle") || "Movement", rightX + panelWidth / 2, padding);
  pop();

  // === LEFT PANEL: Time Imprint (reuse existing drawHeatmap logic) ===
  drawDashboardTimePanel(leftX, panelY, panelWidth, panelHeight, rows, cols, lookup, pieces, elapsedMs);

  // === CENTER PANEL: Interaction Heatmap ===
  drawDashboardInteractionPanel(centerX, panelY, panelWidth, panelHeight, rows, cols, lookup, pieces);

  // === RIGHT PANEL: Movement Distance ===
  drawDashboardMovementPanel(rightX, panelY, panelWidth, panelHeight, rows, cols, lookup, pieces);

  // === BOTTOM PANEL: Shape Profile (collapsible) ===
  const shapeY = height - padding - shapeProfileH;
  if (dashboardState.shapeProfileExpanded) {
    drawShapeProfilePanel(padding, shapeY, width - padding * 2, shapeProfileH, rows, cols, pieces);
  } else {
    // Draw collapsed toggle header only
    drawShapeProfileToggleHeader(padding, shapeY, width - padding * 2, toggleHeaderH);
  }
}

// Helper functions for each panel
function drawDashboardTimePanel(x, y, w, h, rows, cols, lookup, pieces, elapsedMs) {
  push();

  // Uniform reserves — all panels use identical values so matrices are the same size
  const topReserve = 50;
  const legendReserve = 38;
  const matrixAreaH = h - topReserve - legendReserve;
  const cellSize = Math.min(w / cols, matrixAreaH / rows);
  const matrixW = cellSize * cols;
  const matrixH = cellSize * rows;

  // Center the matrix within the reserved area
  const offsetX = x + (w - matrixW) / 2;
  const offsetY = y + topReserve + (matrixAreaH - matrixH) / 2;

  // Draw background image overlay if enabled
  if (dashboardState.overlayEnabled && window.__currentPuzzleImage) {
    push();
    tint(255, 115); // 115/255 ≈ 45% opacity
    const overlayImg = dashboardState.overlayGrayscale ? getGrayscalePuzzleImage() : window.__currentPuzzleImage;
    if (overlayImg) image(overlayImg, offsetX, offsetY, matrixW, matrixH);
    pop();
  }

  // Calculate time range from solved pieces
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

  // Draw heatmap cells as piece shapes
  const totalOrigW = puzzleMeta.maxX - puzzleMeta.minX;
  const totalOrigH = puzzleMeta.maxY - puzzleMeta.minY;
  const pieceScale = (totalOrigW > 0 && totalOrigH > 0)
    ? Math.min(matrixW / totalOrigW, matrixH / totalOrigH) : 0;
  const scaledW = totalOrigW * pieceScale;
  const scaledH = totalOrigH * pieceScale;
  const centX = offsetX + (matrixW - scaledW) / 2;
  const centY = offsetY + (matrixH - scaledH) / 2;

  let selBounds = null;
  const colorFunc = getDashboardColorFunction(dashboardState.colormap);
  drawingContext.globalAlpha = dashboardState.colorOpacity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = lookup.get(`${r},${c}`);

      let cr = 230, cg = 230, cb = 230;
      if (p && typeof p.solvedAt === "number") {
        const t = (p.solvedAt - legendMin) / legendRange;
        [cr, cg, cb] = colorFunc(t);
      }

      const tintedSil = p ? getTintedSilhouette(p, cr, cg, cb) : null;
      let cellX, cellY, cellW, cellH;
      if (tintedSil && pieceScale > 0) {
        cellX = centX + (p.meta.x - puzzleMeta.minX) * pieceScale;
        cellY = centY + (p.meta.y - puzzleMeta.minY) * pieceScale;
        cellW = p.w * pieceScale;
        cellH = p.h * pieceScale;
        image(tintedSil, cellX, cellY, cellW, cellH);
      } else {
        cellX = offsetX + c * cellSize;
        cellY = offsetY + r * cellSize;
        cellW = cellSize;
        cellH = cellSize;
        fill(cr, cg, cb);
        stroke(210);
        strokeWeight(1);
        rect(cellX, cellY, cellW, cellH);
      }

      const isSelected = dashboardState.selectedPiece && 
                         dashboardState.selectedPiece.row === r && 
                         dashboardState.selectedPiece.col === c;
      if (isSelected) selBounds = { x: cellX, y: cellY, w: cellW, h: cellH };
    }
  }
  drawingContext.globalAlpha = 1;

  // Draw selection highlight on top of all pieces
  if (selBounds) {
    push();
    noFill();
    stroke(50, 130, 240);
    strokeWeight(2);
    rect(selBounds.x + 1, selBounds.y + 1, selBounds.w - 2, selBounds.h - 2, 3);
    pop();
  }

  // Draw legend bar below the matrix
  const legendW = Math.min(matrixW * 0.7, 180);
  const legendH = 10;
  const gapBelow = 12;
  const lx = x + (w - legendW) / 2;
  const ly = offsetY + matrixH + gapBelow;
  const steps = 40;

  noStroke();
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const [cr, cg, cb] = colorFunc(t);
    fill(cr, cg, cb);
    rect(lx + (legendW * i) / steps, ly, legendW / steps + 0.5, legendH);
  }

  // Legend border
  stroke(200);
  noFill();
  rect(lx, ly, legendW, legendH);

  // Legend labels
  noStroke();
  fill(80);
  textSize(10);

  if (hasSolved) {
    textAlign(RIGHT, CENTER);
    text(`${formatClock(minTime)}`, lx - 5, ly + legendH / 2);

    textAlign(LEFT, CENTER);
    text(`${formatClock(legendMax)}`, lx + legendW + 5, ly + legendH / 2);
  } else {
    textAlign(CENTER, TOP);
    text(t("noSolved") || "No pieces placed", lx + legendW / 2, ly + legendH + 4);
  }

  pop();
}

function drawDashboardInteractionPanel(x, y, w, h, rows, cols, lookup, pieces) {
  push();

  // Uniform reserves — all panels use identical values so matrices are the same size
  // Top reserve also provides space for the stacked bar chart in this panel
  const topReserve = 50;
  const legendReserve = 38;
  const matrixAreaH = h - topReserve - legendReserve;
  const cellSize = Math.min(w / cols, matrixAreaH / rows);
  const matrixW = cellSize * cols;
  const matrixH = cellSize * rows;

  // Center the matrix within the reserved area
  const offsetX = x + (w - matrixW) / 2;
  const offsetY = y + topReserve + (matrixAreaH - matrixH) / 2;

  // Draw background image overlay if enabled
  if (dashboardState.overlayEnabled && window.__currentPuzzleImage) {
    push();
    tint(255, 115); // 115/255 ≈ 45% opacity
    const overlayImg = dashboardState.overlayGrayscale ? getGrayscalePuzzleImage() : window.__currentPuzzleImage;
    if (overlayImg) image(overlayImg, offsetX, offsetY, matrixW, matrixH);
    pop();
  }

  // Calculate interaction counts (grabs + rotations) for each piece
  const interactionCounts = new Map();
  let maxInteractions = 1;

  for (const p of pieces || []) {
    // Count grabs (how many times the piece was picked up)
    const grabs = (p.grabs || []).length;

    // Count rotations (how many times the piece was rotated)
    const rotations = p.rotationCount || 0;

    // Total interactions
    const total = grabs + rotations;

    interactionCounts.set(`${p.r},${p.c}`, total);
    if (total > maxInteractions) maxInteractions = total;
  }

  // --- 100% stacked bar chart for selected piece ---
  if (dashboardState.selectedPiece) {
    const selKey = `${dashboardState.selectedPiece.row},${dashboardState.selectedPiece.col}`;
    const selP = lookup.get(selKey);
    if (selP) {
      const selGrabs = (selP.grabs || []).length;
      const selRots = selP.rotationCount || 0;
      const selTotal = selGrabs + selRots;

      const barW = Math.min(w * 0.85, 220);
      const barH = 22;
      const barX = x + (w - barW) / 2;
      const gapAbove = offsetY - y;
      const legendRowH = 16;
      const barBlockH = barH + 6 + legendRowH;
      const barY = y + (gapAbove - barBlockH) / 2;

      if (selTotal > 0) {
        const grabsFrac = selGrabs / selTotal;
        const rotFrac  = 1 - grabsFrac;
        const moveW = barW * grabsFrac;

        // Moves segment
        push();
        noStroke();
        fill(80, 152, 220);
        if (selRots === 0) {
          rect(barX, barY, barW, barH, 6);
        } else {
          rect(barX, barY, moveW, barH, 6, 0, 0, 6);
        }

        // Rotations segment
        if (selRots > 0) {
          fill(245, 172, 66);
          if (selGrabs === 0) {
            rect(barX, barY, barW, barH, 6);
          } else {
            rect(barX + moveW, barY, barW - moveW, barH, 0, 6, 6, 0);
          }
        }
        pop();

        // Percentage labels inside bar segments
        push();
        noStroke();
        textSize(11);
        textStyle(BOLD);
        const pctMoves = `${Math.round(grabsFrac * 100)}%`;
        const pctRots  = `${Math.round(rotFrac * 100)}%`;
        const midBarY = barY + barH / 2;

        if (moveW > 36) {
          fill(255, 255, 255, 230);
          textAlign(CENTER, CENTER);
          text(pctMoves, barX + moveW / 2, midBarY);
        }
        if (barW - moveW > 36) {
          fill(255, 255, 255, 230);
          textAlign(CENTER, CENTER);
          text(pctRots, barX + moveW + (barW - moveW) / 2, midBarY);
        }
        textStyle(NORMAL);
        pop();

        // Subtle bottom border
        push();
        noFill();
        stroke(0, 0, 0, 18);
        strokeWeight(1);
        rect(barX, barY, barW, barH, 6);
        pop();

        // Legend row below bar — dark text with colored dots
        const lblY = barY + barH + 6;
        push();
        noStroke();
        textSize(10);
        textAlign(LEFT, CENTER);
        const dotR = 4;
        const movesLabel = `${t("dashboardBarMoves")}: ${selGrabs}`;
        const rotsLabel  = `${t("dashboardBarRotations")}: ${selRots}`;

        // Measure widths to center the whole legend row
        const movesLblW = textWidth(movesLabel);
        const rotsLblW  = textWidth(rotsLabel);
        const dotGap = 5;
        const segGap = 16;
        const totalLblW = (dotR * 2 + dotGap + movesLblW) + segGap + (dotR * 2 + dotGap + rotsLblW);
        let cx = x + (w - totalLblW) / 2;

        // Moves legend
        fill(80, 152, 220);
        circle(cx + dotR, lblY + legendRowH / 2, dotR * 2);
        fill(70);
        text(movesLabel, cx + dotR * 2 + dotGap, lblY + legendRowH / 2);
        cx += dotR * 2 + dotGap + movesLblW + segGap;

        // Rotations legend
        fill(245, 172, 66);
        circle(cx + dotR, lblY + legendRowH / 2, dotR * 2);
        fill(70);
        text(rotsLabel, cx + dotR * 2 + dotGap, lblY + legendRowH / 2);
        pop();
      } else {
        // No interactions yet
        push();
        const barY2 = y + (gapAbove - barH) / 2;
        noStroke();
        fill(230);
        rect(barX, barY2, barW, barH, 6);
        fill(140);
        textSize(10);
        textAlign(CENTER, CENTER);
        text(t("dashboardBarNoInteraction"), x + w / 2, barY2 + barH / 2);
        pop();
      }
    }
  }

  // Draw heatmap cells as piece shapes
  const totalOrigW = puzzleMeta.maxX - puzzleMeta.minX;
  const totalOrigH = puzzleMeta.maxY - puzzleMeta.minY;
  const pieceScale = (totalOrigW > 0 && totalOrigH > 0)
    ? Math.min(matrixW / totalOrigW, matrixH / totalOrigH) : 0;
  const scaledW = totalOrigW * pieceScale;
  const scaledH = totalOrigH * pieceScale;
  const centX = offsetX + (matrixW - scaledW) / 2;
  const centY = offsetY + (matrixH - scaledH) / 2;

  let selBounds = null;
  const colorFunc = getDashboardColorFunction(dashboardState.colormap);
  drawingContext.globalAlpha = dashboardState.colorOpacity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = lookup.get(`${r},${c}`);
      const count = interactionCounts.get(`${r},${c}`) || 0;

      const t = count / maxInteractions;
      const [cr, cg, cb] = colorFunc(t);

      const tintedSil = p ? getTintedSilhouette(p, cr, cg, cb) : null;
      let cellX, cellY, cellW, cellH;
      if (tintedSil && pieceScale > 0) {
        cellX = centX + (p.meta.x - puzzleMeta.minX) * pieceScale;
        cellY = centY + (p.meta.y - puzzleMeta.minY) * pieceScale;
        cellW = p.w * pieceScale;
        cellH = p.h * pieceScale;
        image(tintedSil, cellX, cellY, cellW, cellH);
      } else {
        cellX = offsetX + c * cellSize;
        cellY = offsetY + r * cellSize;
        cellW = cellSize;
        cellH = cellSize;
        fill(cr, cg, cb);
        stroke(210);
        strokeWeight(1);
        rect(cellX, cellY, cellW, cellH);
      }

      const isSelected = dashboardState.selectedPiece && 
                         dashboardState.selectedPiece.row === r && 
                         dashboardState.selectedPiece.col === c;
      if (isSelected) selBounds = { x: cellX, y: cellY, w: cellW, h: cellH };
    }
  }
  drawingContext.globalAlpha = 1;

  // Draw selection highlight on top of all pieces
  if (selBounds) {
    push();
    noFill();
    stroke(50, 130, 240);
    strokeWeight(2);
    rect(selBounds.x + 1, selBounds.y + 1, selBounds.w - 2, selBounds.h - 2, 3);
    pop();
  }

  // Draw legend bar below the matrix
  const legendW = Math.min(matrixW * 0.7, 180);
  const legendH = 10;
  const gapBelow = 12;
  const lx = x + (w - legendW) / 2;
  const ly = offsetY + matrixH + gapBelow;
  const steps = 40;

  noStroke();
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const [cr, cg, cb] = colorFunc(t);
    fill(cr, cg, cb);
    rect(lx + (legendW * i) / steps, ly, legendW / steps + 0.5, legendH);
  }

  // Legend border
  stroke(200);
  noFill();
  rect(lx, ly, legendW, legendH);

  // Legend labels
  noStroke();
  fill(80);
  textSize(10);
  textAlign(CENTER, TOP);
  text(`${t("dashboardInteractionLegend")} (max: ${maxInteractions})`,
       lx + legendW / 2, ly + legendH + 4);

  pop();
}

function drawDashboardMovementPanel(x, y, w, h, rows, cols, lookup, pieces) {
  push();

  // Uniform reserves — all panels use identical values so matrices are the same size
  const topReserve = 50;
  const legendReserve = 38;
  const matrixAreaH = h - topReserve - legendReserve;
  const cellSize = Math.min(w / cols, matrixAreaH / rows);
  const matrixW = cellSize * cols;
  const matrixH = cellSize * rows;

  // Center the matrix within the reserved area
  const offsetX = x + (w - matrixW) / 2;
  const offsetY = y + topReserve + (matrixAreaH - matrixH) / 2;

  // Draw background image overlay if enabled
  if (dashboardState.overlayEnabled && window.__currentPuzzleImage) {
    push();
    tint(255, 115); // 115/255 ≈ 45% opacity
    const overlayImg = dashboardState.overlayGrayscale ? getGrayscalePuzzleImage() : window.__currentPuzzleImage;
    if (overlayImg) image(overlayImg, offsetX, offsetY, matrixW, matrixH);
    pop();
  }

  // Calculate total distance traveled using incremental cache
  const currentSnapCount = globalSnapshots.length;
  if (currentSnapCount < _movementCache.lastSnapCount || !_movementCache.distances) {
    // Snapshots were reset or cache uninitialized — start fresh
    _movementCache.distances = new Map();
    _movementCache.prevPositions = new Map();
    _movementCache.maxDistance = 1;
    _movementCache.lastSnapCount = 0;
  }
  if (currentSnapCount > _movementCache.lastSnapCount) {
    // Only process NEW snapshots since last cache update
    for (let si = _movementCache.lastSnapCount; si < currentSnapCount; si++) {
      const snap = globalSnapshots[si];
      for (const piece of pieces || []) {
        if (!piece || typeof piece.index === 'undefined') continue;
        const posData = snap.positions[piece.index];
        if (!posData) continue;
        const prev = _movementCache.prevPositions.get(piece.index);
        if (prev) {
          const dist = Math.hypot(posData.x - prev.x, posData.y - prev.y);
          const key = `${piece.r},${piece.c}`;
          const existing = _movementCache.distances.get(key) || 0;
          const newDist = existing + dist;
          _movementCache.distances.set(key, newDist);
          if (newDist > _movementCache.maxDistance) _movementCache.maxDistance = newDist;
        }
        _movementCache.prevPositions.set(piece.index, { x: posData.x, y: posData.y });
      }
    }
    _movementCache.lastSnapCount = currentSnapCount;
  }
  const distances = _movementCache.distances;
  const maxDistance = _movementCache.maxDistance;

  // Draw heatmap cells as piece shapes
  const totalOrigW = puzzleMeta.maxX - puzzleMeta.minX;
  const totalOrigH = puzzleMeta.maxY - puzzleMeta.minY;
  const pieceScale = (totalOrigW > 0 && totalOrigH > 0)
    ? Math.min(matrixW / totalOrigW, matrixH / totalOrigH) : 0;
  const scaledW = totalOrigW * pieceScale;
  const scaledH = totalOrigH * pieceScale;
  const centX = offsetX + (matrixW - scaledW) / 2;
  const centY = offsetY + (matrixH - scaledH) / 2;

  let selBounds = null;
  const colorFunc = getDashboardColorFunction(dashboardState.colormap);
  drawingContext.globalAlpha = dashboardState.colorOpacity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = lookup.get(`${r},${c}`);
      const dist = distances.get(`${r},${c}`) || 0;

      const t = maxDistance > 0 ? dist / maxDistance : 0;
      const [cr, cg, cb] = colorFunc(t);

      const tintedSil = p ? getTintedSilhouette(p, cr, cg, cb) : null;
      let cellX, cellY, cellW, cellH;
      if (tintedSil && pieceScale > 0) {
        cellX = centX + (p.meta.x - puzzleMeta.minX) * pieceScale;
        cellY = centY + (p.meta.y - puzzleMeta.minY) * pieceScale;
        cellW = p.w * pieceScale;
        cellH = p.h * pieceScale;
        image(tintedSil, cellX, cellY, cellW, cellH);
      } else {
        cellX = offsetX + c * cellSize;
        cellY = offsetY + r * cellSize;
        cellW = cellSize;
        cellH = cellSize;
        fill(cr, cg, cb);
        stroke(210);
        strokeWeight(1);
        rect(cellX, cellY, cellW, cellH);
      }

      const isSelected = dashboardState.selectedPiece && 
                         dashboardState.selectedPiece.row === r && 
                         dashboardState.selectedPiece.col === c;
      if (isSelected) selBounds = { x: cellX, y: cellY, w: cellW, h: cellH };
    }
  }
  drawingContext.globalAlpha = 1;

  // Draw selection highlight on top of all pieces
  if (selBounds) {
    push();
    noFill();
    stroke(50, 130, 240);
    strokeWeight(2);
    rect(selBounds.x + 1, selBounds.y + 1, selBounds.w - 2, selBounds.h - 2, 3);
    pop();
  }

  // Draw legend bar below the matrix
  const legendW = Math.min(matrixW * 0.7, 180);
  const legendH = 10;
  const gapBelow = 12;
  const lx = x + (w - legendW) / 2;
  const ly = offsetY + matrixH + gapBelow;
  const steps = 40;

  noStroke();
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const [cr, cg, cb] = colorFunc(t);
    fill(cr, cg, cb);
    rect(lx + (legendW * i) / steps, ly, legendW / steps + 0.5, legendH);
  }

  // Legend border
  stroke(200);
  noFill();
  rect(lx, ly, legendW, legendH);

  // Legend labels
  noStroke();
  fill(80);
  textSize(10);
  textAlign(CENTER, TOP);
  text(`${t("dashboardMovementLegend")} (max: ${Math.round(maxDistance)})`,
       lx + legendW / 2, ly + legendH + 4);

  pop();
}

// ============================================================================
// SHAPE PROFILE PANEL (dashboard bottom section)
// ============================================================================

// Cached shape profile data to avoid recomputation every frame
const _shapeProfileCache = {
  data: null,       // { corner: {...}, edge: {...}, interior: {...} }
  pieceCount: 0,
  snapCount: 0,
};

// Row bounds for shape profile click detection
let _shapeProfileRowBounds = []; // [{key, x, y, w, h}, ...]
// Popup bounds for outside-click detection
let _shapeProfilePopupBounds = null; // {x, y, w, h} or null

function getShapeProfileData(rows, cols, pieces) {
  const snapCount = globalSnapshots.length;
  if (_shapeProfileCache.data &&
      _shapeProfileCache.pieceCount === pieces.length &&
      _shapeProfileCache.snapCount === snapCount) {
    return _shapeProfileCache.data;
  }

  const types = { corner: [], edge: [], interior: [] };
  for (const p of pieces) {
    const t = p.getPieceType(rows, cols);
    if (types[t]) types[t].push(p);
  }

  const distances = _movementCache.distances; // reuse movement panel cache

  function aggregate(arr) {
    if (!arr.length) return { count: 0, grabs: 0, time: 0, rotations: 0, movement: 0, signatures: {}, signatureDetails: {} };
    let totalGrabs = 0, totalTime = 0, totalRot = 0, totalDist = 0;
    const sigs = {};
    const sigDetails = {}; // per-signature: { count, totalGrabs, totalTime, totalRot, totalDist, pieces }
    for (const p of arr) {
      const g = (p.grabs || []).length;
      const r = p.rotationCount || 0;
      const st = (typeof p.solvedAt === "number" && p.solvedAt > 0) ? p.solvedAt : 0;
      const d = distances ? (distances.get(`${p.r},${p.c}`) || 0) : 0;
      totalGrabs += g;
      totalRot += r;
      totalTime += st;
      totalDist += d;
      const sig = p.getEdgeSignature(rows, cols);
      sigs[sig] = (sigs[sig] || 0) + 1;
      if (!sigDetails[sig]) sigDetails[sig] = { count: 0, totalGrabs: 0, totalTime: 0, totalRot: 0, totalDist: 0, pieces: [] };
      sigDetails[sig].count++;
      sigDetails[sig].totalGrabs += g;
      sigDetails[sig].totalTime += st;
      sigDetails[sig].totalRot += r;
      sigDetails[sig].totalDist += d;
      sigDetails[sig].pieces.push(p);
    }
    const n = arr.length;
    return {
      count: n,
      grabs: totalGrabs / n,
      time: totalTime / n,
      rotations: totalRot / n,
      movement: totalDist / n,
      signatures: sigs,
      signatureDetails: sigDetails,
      pieces: arr,
    };
  }

  const data = {
    corner:   aggregate(types.corner),
    edge:     aggregate(types.edge),
    interior: aggregate(types.interior),
  };

  // Compute overall averages for weakness detection
  const totalPieces = pieces.length || 1;
  const allGrabs = pieces.reduce((s, p) => s + (p.grabs || []).length, 0) / totalPieces;
  const allRot = pieces.reduce((s, p) => s + (p.rotationCount || 0), 0) / totalPieces;
  data._avgGrabs = allGrabs;
  data._avgRotations = allRot;

  _shapeProfileCache.data = data;
  _shapeProfileCache.pieceCount = pieces.length;
  _shapeProfileCache.snapCount = snapCount;
  return data;
}

// Draw collapsed toggle header for shape profile
function drawShapeProfileToggleHeader(x, y, w, h) {
  push();

  // Subtle separator line above
  stroke(210);
  strokeWeight(1);
  line(x, y - 4, x + w, y - 4);

  // Hover detection
  const hovering = mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h;

  // Background — subtle highlight on hover
  noStroke();
  fill(hovering ? 240 : 248);
  rect(x, y, w, h, 4);

  // Title with expand arrow
  fill(80);
  textSize(13);
  textStyle(BOLD);
  textAlign(LEFT, CENTER);
  text("▶  " + (t("shapeProfileTitle") || "Alak Profil"), x + 8, y + h / 2);
  textStyle(NORMAL);

  // Hint on right side
  fill(160);
  textSize(10);
  textAlign(RIGHT, CENTER);
  text("▼", x + w - 10, y + h / 2);

  pop();
}

function drawShapeProfilePanel(x, y, w, h, rows, cols, pieces) {
  push();

  // Resize grip handle — subtle but visible drag indicator above the panel
  const gripCX = x + w / 2;
  const hoverGrip = mouseX >= x && mouseX <= x + w && mouseY >= y - 8 && mouseY <= y + 6;

  // Soft background pill behind grip lines (makes them pop without being loud)
  noStroke();
  fill(hoverGrip ? 218 : 232, hoverGrip ? 230 : 232);
  rect(gripCX - 28, y - 10, 56, 12, 6);

  // 3 horizontal grip lines
  stroke(hoverGrip ? 120 : 170);
  strokeWeight(hoverGrip ? 2 : 1.5);
  line(gripCX - 18, y - 8, gripCX + 18, y - 8);
  line(gripCX - 18, y - 5, gripCX + 18, y - 5);
  line(gripCX - 18, y - 2, gripCX + 18, y - 2);

  // Clickable toggle header at the top (to collapse)
  const toggleH = 28;
  const hovering = mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + toggleH;
  noStroke();
  fill(hovering ? 240 : 248);
  rect(x, y, w, toggleH, 4, 4, 0, 0);

  // Title with collapse arrow
  fill(80);
  textSize(13);
  textStyle(BOLD);
  textAlign(LEFT, CENTER);
  text("▼  " + (t("shapeProfileTitle") || "Alak Profil"), x + 8, y + toggleH / 2);
  textStyle(NORMAL);

  // Collapse hint on right
  fill(160);
  textSize(10);
  textAlign(RIGHT, CENTER);
  text("▲", x + w - 10, y + toggleH / 2);

  const data = getShapeProfileData(rows, cols, pieces);
  const entries = [
    { key: "corner",   label: t("shapeCorner") || "Sarok",  color: [80, 152, 220],  data: data.corner },
    { key: "edge",     label: t("shapeEdge") || "Szél",     color: [76, 175, 80],   data: data.edge },
    { key: "interior", label: t("shapeInterior") || "Belső", color: [156, 39, 176],  data: data.interior },
  ];

  // Content area below toggle header
  const contentY = y + toggleH;
  const contentH = h - toggleH;
  const headerH = 22;

  const rowH = Math.max(28, Math.min(52, (contentH - headerH - 8) / 3));
  const startY = contentY + headerH;
  const silSize = rowH - 6;

  // Layout for metric bars
  const labelW = Math.max(80, w * 0.12);
  const warningW = 28; // space for ⚠ indicators + click arrow
  const barAreaX = x + silSize + 8 + labelW;
  const barAreaW = w - silSize - 8 - labelW - warningW - 10;
  const metricW = barAreaW / 4;
  const barH = Math.max(6, rowH * 0.28);
  const valLabelGap = 3; // gap between bar bottom and value text center
  const barUnitH = barH + valLabelGap + 10; // bar + gap + ~10px text

  // Normalization: compute max values across all categories
  let maxGrabs = 1, maxTime = 1, maxRot = 1, maxMove = 1;
  for (const e of entries) {
    if (e.data.grabs > maxGrabs) maxGrabs = e.data.grabs;
    if (e.data.time > maxTime) maxTime = e.data.time;
    if (e.data.rotations > maxRot) maxRot = e.data.rotations;
    if (e.data.movement > maxMove) maxMove = e.data.movement;
  }

  // Draw metric column headers
  push();
  noStroke();
  fill(110);
  textSize(10);
  textAlign(CENTER, CENTER);
  const metricLabels = [
    t("shapeMetricGrabs") || "Elkapás",
    t("shapeMetricRotations") || "Forgatás",
    t("shapeMetricTime") || "Idő",
    t("shapeMetricMovement") || "Mozgás"
  ];
  for (let m = 0; m < 4; m++) {
    text(metricLabels[m], barAreaX + m * metricW + metricW / 2, contentY + headerH / 2);
  }
  pop();

  // Reset row bounds for click detection
  _shapeProfileRowBounds = [];

  // Draw each row — Level 1: categories with metric bars
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const ry = startY + i * rowH;
    const isSelected = dashboardState.shapeProfileSelectedType === e.key;

    // Store row bounds for click detection (drill-down popup)
    _shapeProfileRowBounds.push({ key: e.key, x: x, y: ry, w: w, h: rowH });

    // Row hover highlight
    const rowHover = mouseX >= x && mouseX <= x + w && mouseY >= ry && mouseY <= ry + rowH;
    if (rowHover || isSelected) {
      noStroke();
      fill(isSelected ? 230 : 240, isSelected ? 238 : 245, 255);
      rect(x, ry, w, rowH);
    }

    // Piece silhouette thumbnail (pick first piece of this type)
    if (e.data.pieces && e.data.pieces.length > 0) {
      const rep = e.data.pieces[0];
      const sil = getWhiteSilhouette(rep);
      if (sil) {
        const aspect = rep.w / rep.h;
        let sw = silSize, sh = silSize;
        if (aspect > 1) sh = silSize / aspect; else sw = silSize * aspect;
        push();
        tint(e.color[0], e.color[1], e.color[2], 180);
        image(sil, x + 6 + (silSize - sw) / 2, ry + (rowH - sh) / 2, sw, sh);
        noTint();
        pop();
      }
    }

    // Label + count
    noStroke();
    fill(60);
    textSize(11);
    textStyle(BOLD);
    textAlign(LEFT, CENTER);
    text(`${e.label} (${e.data.count})`, x + silSize + 14, ry + rowH / 2);
    textStyle(NORMAL);

    // --- 4 metric bars ---
    const metrics = [
      { val: e.data.grabs,       max: maxGrabs,        color: [80, 152, 220] },
      { val: e.data.rotations,   max: maxRot,          color: [156, 39, 176] },
      { val: e.data.time / 1000, max: maxTime / 1000,  color: [245, 172, 66] },
      { val: e.data.movement,    max: maxMove,         color: [76, 175, 80] }
    ];
    // Center the bar+label unit vertically within the row
    const barY = ry + Math.max(2, Math.round((rowH - barUnitH) / 2));

    for (let m = 0; m < 4; m++) {
      const mx = barAreaX + m * metricW + 2;
      const mw = metricW - 4;
      const frac = metrics[m].max > 0 ? metrics[m].val / metrics[m].max : 0;
      const filledW = mw * Math.min(1, frac);
      const mc = metrics[m].color;

      // Bar background
      push();
      noStroke();
      fill(230);
      rect(mx, barY, mw, barH, 3);

      // Filled portion
      fill(mc[0], mc[1], mc[2], 200);
      if (filledW > 0) rect(mx, barY, filledW, barH, 3);
      pop();

      // Value label
      push();
      noStroke();
      fill(80);
      textSize(9);
      textAlign(CENTER, TOP);
      let valText;
      if (m === 2) valText = metrics[m].val.toFixed(1) + "s"; // time
      else if (m === 3) valText = Math.round(metrics[m].val).toString() + "px"; // movement
      else valText = metrics[m].val.toFixed(1);
      text(valText, mx + mw / 2, barY + barH + valLabelGap);
      pop();
    }

    // --- Weakness warning ---
   /* const avgGrabs = data._avgGrabs || 1;
    const avgRot = data._avgRotations || 1;
    const grabRatio = avgGrabs > 0 ? e.data.grabs / avgGrabs : 0;
    const rotRatio = avgRot > 0 ? e.data.rotations / avgRot : 0;
    const worstRatio = Math.max(grabRatio, rotRatio);

    if (worstRatio > 1.5 && e.data.count > 0) {
      push();
      noStroke();
      textSize(12);
      textAlign(LEFT, CENTER);
      const warnX = barAreaX + barAreaW + 4;
      if (worstRatio > 2.0) {
        fill(200, 40, 40);
        text("⚠⚠", warnX, ry + rowH / 2);
      } else {
        fill(220, 150, 30);
        text("⚠", warnX, ry + rowH / 2);
      }
      pop();
    }*/

    // Click hint arrow on the right (drill-down to Level 2)
    fill(isSelected ? 80 : 160);
    textSize(12);
    textAlign(RIGHT, CENTER);
    text(isSelected ? "▾" : "▸", x + w - 12, ry + rowH / 2);

    // Subtle bottom separator
    if (i < entries.length - 1) {
      stroke(230);
      strokeWeight(1);
      line(x + silSize + 10, ry + rowH - 1, x + w - 10, ry + rowH - 1);
    }
  }

  // --- Draw drill-down popup if a type is selected ---
  _shapeProfilePopupBounds = null;
  if (dashboardState.shapeProfileSelectedType) {
    const selEntry = entries.find(e => e.key === dashboardState.shapeProfileSelectedType);
    if (selEntry && selEntry.data.count > 0) {
      drawShapeProfilePopup(x, y, w, h, selEntry, data, rows, cols, startY, rowH, entries);
    }
  }

  pop();
}

let _shapeProfilePopupMaxScroll = 0; // max scroll range for popup content

// Draw the drill-down popup for a selected shape category
function drawShapeProfilePopup(panelX, panelY, panelW, panelH, entry, data, rows, cols, rowStartY, rowH, allEntries) {
  const sigDetails = entry.data.signatureDetails || {};
  const sigEntries = Object.entries(sigDetails).sort((a, b) => b[1].count - a[1].count);
  if (sigEntries.length === 0) return;

  // Popup dimensions
  const popupPadding = 12;
  const headerH = 28;
  const colHeaderH = 22;
  const sigRowH = 40;
  const descSectionH = 44; // description text + F/T/B legend
  const popupContentH = descSectionH + colHeaderH + sigEntries.length * sigRowH + 8;
  const popupW = Math.min(500, panelW * 0.75);
  const popupH = Math.min(headerH + popupPadding * 2 + popupContentH, height - 40);

  // Position: centered on the canvas
  const popupX = (width - popupW) / 2;
  const popupY = (height - popupH) / 2;

  // Store popup bounds for click-through detection
  _shapeProfilePopupBounds = { x: popupX, y: popupY, w: popupW, h: popupH };

  push();

  // Dark backdrop overlay
  noStroke();
  fill(0, 0, 0, 100);
  rect(0, 0, width, height);

  // Shadow
  noStroke();
  fill(0, 0, 0, 30);
  rect(popupX + 3, popupY + 3, popupW, popupH, 8);

  // Background
  fill(255, 255, 255, 250);
  stroke(180);
  strokeWeight(1);
  rect(popupX, popupY, popupW, popupH, 8);

  // Header bar
  noStroke();
  fill(entry.color[0], entry.color[1], entry.color[2], 30);
  rect(popupX, popupY, popupW, headerH, 8, 8, 0, 0);

  fill(entry.color[0], entry.color[1], entry.color[2]);
  textSize(12);
  textStyle(BOLD);
  textAlign(LEFT, CENTER);
  text(`${entry.label} (${entry.data.count})`, popupX + popupPadding, popupY + headerH / 2);
  textStyle(NORMAL);

  fill(140);
  textSize(10);
  textAlign(RIGHT, CENTER);
  text("✕", popupX + popupW - popupPadding, popupY + headerH / 2);

  // --- Description section: edge order + F/T/B legend ---
  const edgeBadgeColors = {
    F: [120, 180, 220],
    T: [100, 200, 120],
    B: [220, 140, 100]
  };
  const descStartY = popupY + headerH + popupPadding;
  noStroke();
  fill(100);
  textSize(10);
  textAlign(LEFT, CENTER);
  text(t("edgeLegendOrder") || "Edge order: Top \u2192 Right \u2192 Bottom \u2192 Left", popupX + popupPadding, descStartY + 8);
  const legY = descStartY + 26;
  const legItemW = (popupW - popupPadding * 2) / 3;
  const legItems = [
    { ch: "F", color: edgeBadgeColors.F, label: t("edgeFlat") || "Flat (border edge)" },
    { ch: "T", color: edgeBadgeColors.T, label: t("edgeTab") || "Tab (protrusion)" },
    { ch: "B", color: edgeBadgeColors.B, label: t("edgeBlank") || "Blank (indentation)" },
  ];
  textSize(9);
  for (let li = 0; li < legItems.length; li++) {
    const item = legItems[li];
    const lx = popupX + popupPadding + li * legItemW;
    noStroke();
    fill(item.color[0], item.color[1], item.color[2], 200);
    rect(lx, legY - 8, 16, 16, 3);
    fill(255);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    text(item.ch, lx + 8, legY);
    textStyle(NORMAL);
    fill(80);
    textAlign(LEFT, CENTER);
    text("= " + item.label, lx + 20, legY);
  }

  // --- Layout: left section = signature badges + count, right = 4 metric bars ---
  const badgeSectionW = 104; // 4 badges × 19px + count label space
  const barAreaX = popupX + popupPadding + badgeSectionW;
  const barAreaW = popupW - popupPadding * 2 - badgeSectionW;
  const metricW = barAreaW / 4;

  // Normalize max values across all signature groups
  let maxGrabs = 1, maxTime = 1, maxRot = 1, maxMove = 1;
  for (const [, detail] of sigEntries) {
    const n = detail.count || 1;
    if (detail.totalGrabs / n > maxGrabs) maxGrabs = detail.totalGrabs / n;
    if (detail.totalTime / n > maxTime) maxTime = detail.totalTime / n;
    if (detail.totalRot / n > maxRot) maxRot = detail.totalRot / n;
    if (detail.totalDist / n > maxMove) maxMove = detail.totalDist / n;
  }

  // Column headers
  let cy = popupY + headerH + popupPadding + descSectionH;
  const metricLabels = [
    t("shapeMetricGrabs") || "Grabs",
    t("shapeMetricRotations") || "Rotations",
    t("shapeMetricTime") || "Time",
    t("shapeMetricMovement") || "Movement"
  ];
  push();
  noStroke();
  fill(110);
  textSize(10);
  textAlign(CENTER, CENTER);
  for (let m = 0; m < 4; m++) {
    text(metricLabels[m], barAreaX + m * metricW + metricW / 2, cy + colHeaderH / 2);
  }
  pop();
  cy += colHeaderH;

  // Separator
  stroke(220);
  strokeWeight(1);
  line(popupX + popupPadding, cy, popupX + popupW - popupPadding, cy);
  cy += 4;

  // --- Signature rows with metric bars (scrollable) ---
  const barH = 8;
  const valLabelGap = 2;
  const barUnitH = barH + valLabelGap + 10;

  // Calculate scrollable area
  const scrollAreaTop = cy;
  const scrollAreaBottom = popupY + popupH - 4;
  const scrollAreaH = scrollAreaBottom - scrollAreaTop;
  const totalRowsH = sigEntries.length * sigRowH;
  const maxScroll = Math.max(0, totalRowsH - scrollAreaH);
  _shapeProfilePopupMaxScroll = maxScroll;

  // Clamp scroll offset
  const scrollY = Math.max(0, Math.min(maxScroll, dashboardState.shapeProfilePopupScrollY));
  dashboardState.shapeProfilePopupScrollY = scrollY;

  // Clip to scrollable content area
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(popupX, scrollAreaTop, popupW, scrollAreaH);
  drawingContext.clip();

  // Apply scroll offset
  cy -= scrollY;

  for (const [sig, detail] of sigEntries) {
    // Skip rows completely outside the visible area (optimization)
    if (cy + sigRowH < scrollAreaTop) { cy += sigRowH; continue; }
    if (cy > scrollAreaBottom) { cy += sigRowH; continue; }

    // Row hover highlight
    const rHover = mouseY >= scrollAreaTop && mouseY <= scrollAreaBottom &&
                   mouseX >= popupX + popupPadding && mouseX <= popupX + popupW - popupPadding &&
                   mouseY >= cy && mouseY <= cy + sigRowH;
    if (rHover) {
      noStroke();
      fill(245, 248, 255);
      rect(popupX + popupPadding - 4, cy, popupW - popupPadding * 2 + 8, sigRowH, 4);
    }

    // Signature badges (F/T/B per edge)
    let bx = popupX + popupPadding;
    for (let ci = 0; ci < sig.length && ci < 4; ci++) {
      const ch = sig[ci];
      const bc = edgeBadgeColors[ch] || [160, 160, 160];
      noStroke();
      fill(bc[0], bc[1], bc[2], 200);
      rect(bx, cy + (sigRowH - 16) / 2, 16, 16, 3);
      fill(255);
      textSize(9);
      textStyle(BOLD);
      textAlign(CENTER, CENTER);
      text(ch, bx + 8, cy + sigRowH / 2);
      textStyle(NORMAL);
      bx += 19;
    }

    // Count label
    noStroke();
    fill(100);
    textSize(10);
    textAlign(LEFT, CENTER);
    text(`×${detail.count}`, bx + 2, cy + sigRowH / 2);

    // Metric bars (averages per piece within this signature group)
    const n = detail.count || 1;
    const metrics = [
      { val: detail.totalGrabs / n,         max: maxGrabs,        color: [80, 152, 220] },
      { val: detail.totalRot / n,           max: maxRot,          color: [156, 39, 176] },
      { val: detail.totalTime / n / 1000,   max: maxTime / 1000,  color: [245, 172, 66] },
      { val: detail.totalDist / n,          max: maxMove,         color: [76, 175, 80] }
    ];

    const barY = cy + Math.round((sigRowH - barUnitH) / 2);

    for (let m = 0; m < 4; m++) {
      const mx = barAreaX + m * metricW + 2;
      const mw = metricW - 4;
      const frac = metrics[m].max > 0 ? metrics[m].val / metrics[m].max : 0;
      const filledW = mw * Math.min(1, frac);
      const mc = metrics[m].color;

      push();
      noStroke();
      fill(230);
      rect(mx, barY, mw, barH, 3);
      fill(mc[0], mc[1], mc[2], 200);
      if (filledW > 0) rect(mx, barY, filledW, barH, 3);
      pop();

      push();
      noStroke();
      fill(80);
      textSize(9);
      textAlign(CENTER, TOP);
      let valText;
      if (m === 2) valText = metrics[m].val.toFixed(1) + "s";
      else if (m === 3) valText = Math.round(metrics[m].val).toString() + "px";
      else valText = metrics[m].val.toFixed(1);
      text(valText, mx + mw / 2, barY + barH + valLabelGap);
      pop();
    }

    cy += sigRowH;
  }

  // Restore clipping
  drawingContext.restore();

  // Draw scrollbar if content overflows
  if (maxScroll > 0) {
    const sbW = 6;
    const sbX = popupX + popupW - sbW - 4;
    const sbTrackH = scrollAreaH;
    const sbThumbH = Math.max(20, sbTrackH * (scrollAreaH / totalRowsH));
    const sbThumbY = scrollAreaTop + (scrollY / maxScroll) * (sbTrackH - sbThumbH);

    noStroke();
    fill(0, 0, 0, 20);
    rect(sbX, scrollAreaTop, sbW, sbTrackH, 3);
    fill(0, 0, 0, 60);
    rect(sbX, sbThumbY, sbW, sbThumbH, 3);
  }

  pop();
}

// ============================================================================
// OFF-GRID ASSEMBLIES VIEW
// ============================================================================

// Selection state: solvedAt value of the selected placement group (null = no selection)
let offgridSelectedSolvedAt = null;

export function clearOffGridSelection() {
  offgridSelectedSolvedAt = null;
}

export function drawOffGridAssemblies(width, height, pieces) {
  const allPieces = listPieces();
  if (!allPieces.length || !globalSnapshots.length) {
    push();
    fill(100);
    textAlign(CENTER, CENTER);
    textSize(14);
    text(t("offgridNoData") || "No off-grid assemblies detected yet.", width / 2, height / 2);
    pop();
    drawOffGridAssemblies._pieceBounds = [];
    return;
  }

  const { originX, originY, W, H, s } = gridRectScaled(width, height);

  // Build a lookup: pieceIndex → piece object
  const pieceByIndex = new Map();
  for (const p of allPieces) {
    if (p && typeof p.index !== 'undefined') pieceByIndex.set(p.index, p);
  }

  // --- Analyze snapshots using incremental cache ---
  const currentSnapCount = globalSnapshots.length;
  const cacheKey = `${originX.toFixed(1)},${originY.toFixed(1)},${s.toFixed(4)}`;

  if (currentSnapCount < _offgridCache.lastSnapCount || !_offgridCache.joinTime
      || _offgridCache.targetCentersKey !== cacheKey) {
    // Snapshots were reset or display changed — start fresh
    _offgridCache.joinTime = new Map();
    _offgridCache.minTime = Infinity;
    _offgridCache.maxTime = -Infinity;
    _offgridCache.lastSnapCount = 0;
    _offgridCache.targetCentersKey = cacheKey;
  }

  // Target centers for "is piece at target?" check
  const targetCenters = new Map();
  for (const p of allPieces) {
    if (!p || typeof p.index === 'undefined') continue;
    const tx = originX + (p.meta.x - puzzleMeta.minX) * s + (p.sw || 0) / 2;
    const ty = originY + (p.meta.y - puzzleMeta.minY) * s + (p.sh || 0) / 2;
    targetCenters.set(p.index, { x: tx, y: ty });
  }

  const snapThreshold = Math.max(10, (allPieces[0] && allPieces[0].sw || 50) * 0.15);

  if (currentSnapCount > _offgridCache.lastSnapCount) {
    // Only process NEW snapshots
    for (let si = _offgridCache.lastSnapCount; si < currentSnapCount; si++) {
      const snap = globalSnapshots[si];
      const groupMembers = new Map();
      for (const [idxStr, posData] of Object.entries(snap.positions)) {
        const idx = parseInt(idxStr, 10);
        const gid = posData.groupId;
        if (gid == null) continue;
        if (!groupMembers.has(gid)) groupMembers.set(gid, []);
        groupMembers.get(gid).push(idx);
      }

      for (const [gid, members] of groupMembers) {
        if (members.length < 2) continue;
        let hasOffGridMember = false;
        for (const idx of members) {
          const posData = snap.positions[idx];
          const tgt = targetCenters.get(idx);
          if (!posData || !tgt) continue;
          const d = Math.hypot(posData.x - tgt.x, posData.y - tgt.y);
          if (d > snapThreshold) { hasOffGridMember = true; break; }
        }
        if (!hasOffGridMember) continue;
        for (const idx of members) {
          if (!_offgridCache.joinTime.has(idx)) {
            _offgridCache.joinTime.set(idx, snap.t);
            if (snap.t < _offgridCache.minTime) _offgridCache.minTime = snap.t;
            if (snap.t > _offgridCache.maxTime) _offgridCache.maxTime = snap.t;
          }
        }
      }
    }
    _offgridCache.lastSnapCount = currentSnapCount;
  }

  const offgridJoinTime = _offgridCache.joinTime;

  // --- Build placement groups: solvedAt → Set of piece indices ---
  const placementGroups = new Map();
  for (const pp of allPieces) {
    if (!pp || typeof pp.solvedAt !== 'number') continue;
    if (!placementGroups.has(pp.solvedAt)) placementGroups.set(pp.solvedAt, new Set());
    placementGroups.get(pp.solvedAt).add(pp.index);
  }

  // Set of piece indices placed as part of a multi-piece assembly (≥2 pieces with same solvedAt)
  const assemblyPlacedSet = new Set();
  for (const [, members] of placementGroups) {
    if (members.size >= 2) {
      for (const idx of members) assemblyPlacedSet.add(idx);
    }
  }

  // Set of selected piece indices (all pieces that share the selectedSolvedAt)
  const selectedSet = new Set();
  if (offgridSelectedSolvedAt !== null && placementGroups.has(offgridSelectedSolvedAt)) {
    for (const idx of placementGroups.get(offgridSelectedSolvedAt)) {
      selectedSet.add(idx);
    }
  }

  // --- Compute time range for coloring (from cache) ---
  const minTime = _offgridCache.minTime;
  const maxTime = _offgridCache.maxTime;
  const timeRange = maxTime > minTime ? maxTime - minTime : 1;

  // --- Draw background ---
  background(245);

  // Draw grid area outline
  push();
  noFill();
  stroke(200);
  strokeWeight(2);
  rect(originX + 0.5, originY + 0.5, W, H, 6);
  pop();

  // --- Draw title ---
  push();
  fill(50);
  textSize(16);
  textAlign(CENTER, TOP);
  text(t("offgridTitle") || "Off-grid Assemblies", width / 2, 12);
  textSize(11);
  fill(100);
  text(
    t("offgridClickHint") || "Click to select and inspect individual separate groups.",
    width / 2,
    34
  );
  pop();

  if (offgridJoinTime.size === 0 || assemblyPlacedSet.size === 0) {
    push();
    fill(120);
    textAlign(CENTER, CENTER);
    textSize(13);
    text(t("offgridNoData") || "No off-grid assemblies detected yet.", width / 2, height / 2);
    pop();
    drawOffGridAssemblies._pieceBounds = [];
    return;
  }

  // --- Draw piece silhouettes colored by off-grid join time ---
  const colorFunc = getDashboardColorFunction(dashboardState.colormap);
  const pieceBounds = [];

  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined' || !pp.img) continue;

    // Target position on grid
    const px = originX + (pp.meta.x - puzzleMeta.minX) * s;
    const py = originY + (pp.meta.y - puzzleMeta.minY) * s;
    const pw = pp.sw || 0;
    const ph = pp.sh || 0;

    const sil = getWhiteSilhouette(pp);
    if (!sil) continue;

    const isSelected = selectedSet.has(pp.index);
    const joinTime = offgridJoinTime.get(pp.index);
    // Only color if placed as part of a multi-piece assembly (not individually)
    const isAssemblyPiece = joinTime !== undefined && assemblyPlacedSet.has(pp.index);

    push();
    if (isSelected) {
      // Selected group → red fill
      tint(220, 50, 50, 240);
    } else if (isAssemblyPiece) {
      // Off-grid assembly placed as group — color by time
      const tn = (joinTime - minTime) / timeRange;
      const [cr, cg, cb] = colorFunc(tn);
      tint(cr, cg, cb, 230);
    } else {
      // Not part of an off-grid assembly placement — solid gray
      tint(180, 180, 180, 200);
    }
    image(sil, px, py, pw, ph);
    pop();

    // Store bounds for click hit-testing
    pieceBounds.push({ index: pp.index, solvedAt: pp.solvedAt, x: px, y: py, w: pw, h: ph, isAssembly: isAssemblyPiece });
  }

  // Expose piece bounds for click handler
  drawOffGridAssemblies._pieceBounds = pieceBounds;

  // --- Draw selection border around selected group pieces ---
  if (selectedSet.size > 0) {
    for (const b of pieceBounds) {
      if (!selectedSet.has(b.index)) continue;
      push();
      noFill();
      stroke(180, 30, 30);
      strokeWeight(2);
      rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 3);
      pop();
    }
  }

  // --- Draw legend bar ---
  const legendW = Math.min(W * 0.5, 200);
  const legendH = 12;
  const lx = (width - legendW) / 2;
  const ly = height - 50;
  const steps = 40;

  push();
  noStroke();
  for (let i = 0; i < steps; i++) {
    const tn = i / (steps - 1);
    const [cr, cg, cb] = colorFunc(tn);
    fill(cr, cg, cb);
    rect(lx + (legendW * i) / steps, ly, legendW / steps + 0.5, legendH);
  }

  // Legend border
  stroke(200);
  noFill();
  rect(lx, ly, legendW, legendH);

  // Legend labels
  noStroke();
  fill(80);
  textSize(10);
  textAlign(RIGHT, CENTER);
  text(t("offgridLegendEarly") || "Earlier", lx - 5, ly + legendH / 2);
  textAlign(LEFT, CENTER);
  text(t("offgridLegendLate") || "Later", lx + legendW + 5, ly + legendH / 2);
  pop();
}

export function handleOffGridClick(mx, my) {
  const bounds = drawOffGridAssemblies._pieceBounds;
  if (!bounds) return false;
  // Iterate in reverse so topmost (last drawn) piece wins
  for (let i = bounds.length - 1; i >= 0; i--) {
    const b = bounds[i];
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      if (typeof b.solvedAt !== 'number' || !b.isAssembly) continue;
      // Toggle: if clicking on same group → deselect; otherwise → select new group
      if (offgridSelectedSolvedAt === b.solvedAt) {
        offgridSelectedSolvedAt = null;
      } else {
        offgridSelectedSolvedAt = b.solvedAt;
      }
      return true;
    }
  }
  return false;
}
