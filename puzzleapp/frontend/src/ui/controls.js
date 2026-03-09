import { styleState, resetScene, setPuzzleMeta, setPuzzleGrid, registerPiece, newGroup, listGroups, listPieces, puzzleGrid, timerState, puzzleMeta, bounds, addGlobalSnapshot, globalSnapshots, connectionsState, resetGlobalSnapshots, gameSettings, setHoverPiece, viewSettings, recordPieceInteraction, resetPieceInteractionMatrix } from "../canvas/state.js";
import { drawPiece } from "../canvas/draw.js";
import { PuzzlePiece } from "../canvas/piece.js";
import { Group } from "../canvas/group.js";
import { clampPiece, clampPieceOutsideGrid, averagePieceDiagonal, mergeWithSolvedNeighbors, targetTopLeft } from "../canvas/interaction.js";
import { uploadPuzzle } from "../api/client.js";
import { initI18n, t, getLang, applyTranslations } from "./i18n.js";
import { gridRectScaled } from "./layout.js";
import { zoomState, resetZoom, zoomIn, zoomOut, screenToWorld } from "../canvas/zoom.js";
import { initSession, recordGameStart, recordGrab, recordGameComplete, getCurrentGame } from "../analytics/sessionStats.js";
import { initStatsModal, showStatsModal } from "./statsModal.js";

const galleryItems = [
  {
    id: "forest",
    title: { hu: "Erdei táj", en: "Forest landscape" },
    preview: "/public/gallery/forest/preview.png",
    sizes: {
      "2x2": { image: "/public/gallery/forest/2x2/image.png", mask: "/public/gallery/forest/2x2/mask.png" },
      "4x4": { image: "/public/gallery/forest/4x4/image.png", mask: "/public/gallery/forest/4x4/mask.png" },
      "6x6": { image: "/public/gallery/forest/6x6/image.png", mask: "/public/gallery/forest/6x6/mask.png" }
    }
  },
  {
    id: "city",
    title: { hu: "Városi fények", en: "City lights" },
    preview: "/public/gallery/city/preview.png",
    sizes: {
      "2x2": { image: "/public/gallery/city/2x2/image.png", mask: "/public/gallery/city/2x2/mask.png" },
      "6x6": { image: "/public/gallery/city/6x6/image.png", mask: "/public/gallery/city/6x6/mask.png" }
    }
  }
];

let selectedItemId = null;
let selectedSize = null;
let timerInterval = null;
let timerStart = 0;
let timerElapsed = 0;
let activeGrab = null;
let lastGrabbedPieceIndex = null; // Track last grabbed piece for interaction matrix
let dragTrackInterval = null; // Interval for tracking drag positions
let currentGameId = null; // Session tracking: current game ID
// When a modal is open we block interactions with the canvas
window.__modalOpen = false;

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

function rgbToHex(rgb) {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

function buildHeatmapSvg(rows, cols, pieces, elapsedMs) {
  const gridSize = 480;
  const margin = 24;
  const legendBarW = Math.min(240, gridSize * 0.6);
  const legendBarH = 12;
  const legendGap = 18;
  const width = gridSize + margin * 2;
  const height = gridSize + margin * 2 + legendGap + legendBarH + 16;
  const cellW = gridSize / cols;
  const cellH = gridSize / rows;
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

  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = lookup.get(`${r},${c}`);
      const x = margin + c * cellW;
      const y = margin + r * cellH;
      let fill = "#e6e6e6";
      if (p && typeof p.solvedAt === "number") {
        const t = (p.solvedAt - legendMin) / legendRange;
        fill = rgbToHex(seismicColor(t));
      }
      rects.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#d2d2d2" stroke-width="1" />`);
    }
  }

  const legendX = margin + (gridSize - legendBarW) / 2;
  const legendY = margin + gridSize + legendGap;
  const legendStops = [];
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = rgbToHex(seismicColor(t));
    const x = legendX + (legendBarW * i) / steps;
    legendStops.push(`<rect x="${x}" y="${legendY}" width="${legendBarW / steps + 0.5}" height="${legendBarH}" fill="${color}" />`);
  }

  const labelY = legendY + legendBarH / 2 + 1;
  let legendText = "";
  if (hasSolved) {
    const minLabel = `${t("heatmapLegendMin")}: ${formatDuration(minTime)}`;
    const maxLabel = `${t("heatmapLegendMax")}: ${formatDuration(legendMax)}`;
    legendText = `
      <text x="${legendX - 8}" y="${labelY}" text-anchor="end" dominant-baseline="middle" font-size="12" fill="#444">${minLabel}</text>
      <text x="${legendX + legendBarW + 8}" y="${labelY}" text-anchor="start" dominant-baseline="middle" font-size="12" fill="#444">${maxLabel}</text>
    `;
  } else {
    const emptyLabel = t("heatmapLegendEmpty");
    legendText = `<text x="${legendX}" y="${labelY}" text-anchor="start" dominant-baseline="middle" font-size="12" fill="#444">${emptyLabel}</text>`;
  }
  const legend = `
    ${legendStops.join("")}
    <rect x="${legendX}" y="${legendY}" width="${legendBarW}" height="${legendBarH}" fill="none" stroke="#c8c8c8" stroke-width="1" />
    ${legendText}
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  ${rects.join("")}
  ${legend}
</svg>`;
}

function downloadSvg(filename, svgText) {
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildGrabSvg(rows, cols, pieces) {
  const canvasW = bounds.w || 640;
  const canvasH = bounds.h || 640;
  const { originX, originY, W, H, s } = gridRectScaled(canvasW, canvasH);
  const width = canvasW;
  const height = canvasH;

  const times = [];
  for (const p of pieces || []) {
    for (const g of (p.grabs || [])) {
      if (typeof g.t === "number") times.push(g.t);
    }
  }
  const minT = times.length ? Math.min(...times) : 0;
  const maxT = times.length ? Math.max(...times) : 1;
  const rangeT = Math.max(1, maxT - minT);

  const rects = [];
  const dots = [];
  for (const p of pieces || []) {
    const px = originX + (p.meta.x - puzzleMeta.minX) * s;
    const py = originY + (p.meta.y - puzzleMeta.minY) * s;
    const pw = p.meta.w * s;
    const ph = p.meta.h * s;
    rects.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#d2d2d2" stroke-width="1" />`);
    for (const g of (p.grabs || [])) {
      const color = "#d81e1e";
      const radius = 5;
      const gx = px + (g.x / p.w) * pw;
      const gy = py + (g.y / p.h) * ph;
      dots.push(`<circle cx="${gx}" cy="${gy}" r="${radius}" fill="${color}" fill-opacity="0.7" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1" />`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  ${rects.join("")}
  ${dots.join("")}
</svg>`;
}

function buildConnectionsSvg(rows, cols, pieces) {
  const canvasW = bounds.w || 640;
  const canvasH = bounds.h || 640;
  const { originX, originY, W, H, s } = gridRectScaled(canvasW, canvasH);
  const width = canvasW;
  const height = canvasH;

  const allPieces = listPieces();

  // Helper: compute target center for a piece
  function targetCenter(pp) {
    const tx = originX + (pp.meta.x - puzzleMeta.minX) * s + (pp.sw || 0) / 2;
    const ty = originY + (pp.meta.y - puzzleMeta.minY) * s + (pp.sh || 0) / 2;
    return { x: tx, y: ty };
  }

  // Default positions using current piece centers
  const positionsDefault = {};
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined') continue;
    positionsDefault[pp.index] = { x: pp.x + pp.sw / 2, y: pp.y + pp.sh / 2 };
  }

  // Node positions fixed to target centers
  const nodePositions = {};
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined') continue;
    nodePositions[pp.index] = targetCenter(pp);
  }

  // Determine global snapshot to use
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

  // Transform snapshot positions to current display coordinates
  const positionsTransformed = {};
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

  const basePosMap = (Object.keys(positionsTransformed).length) ? positionsTransformed : positionsDefault;

  // Build SVG elements
  const bgLines = [];
  const selectedLines = [];
  const nodes = [];

  // Draw faint background edges for all nodes
  for (const pp of allPieces) {
    if (!pp || typeof pp.index === 'undefined') continue;
    const aPos = basePosMap[pp.index];
    if (!aPos) continue;
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
      bgLines.push(`<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#a0a0a0" stroke-opacity="0.35" stroke-width="1" />`);
    }
  }

  // Draw all node markers
  for (const idStr in nodePositions) {
    const pos = nodePositions[idStr];
    if (!pos) continue;
    nodes.push(`<circle cx="${pos.x}" cy="${pos.y}" r="3" fill="#c8c8c8" fill-opacity="0.8" />`);
  }

  // Draw selected piece connections if any
  const selIdx = (connectionsState && typeof connectionsState.selected !== 'undefined') ? connectionsState.selected : null;
  const p = (selIdx != null) ? allPieces[selIdx] : null;

  if (p) {
    const distArr = [];
    const displayA = basePosMap[selIdx];
    if (displayA) {
      for (const q of allPieces) {
        if (!q || typeof q.index === 'undefined' || q.index === selIdx) continue;
        const displayQ = basePosMap[q.index];
        if (!displayQ) continue;
        const d = Math.hypot(displayA.x - displayQ.x, displayA.y - displayQ.y);
        distArr.push({ q, idx: q.index, d, displayQ });
      }
      distArr.sort((a, b) => a.d - b.d);

      let n_sz = 0;
      if (p.r > 0) n_sz++;
      if (p.r < rows - 1) n_sz++;
      if (p.c > 0) n_sz++;
      if (p.c < cols - 1) n_sz++;

      if (n_sz > 0) {
        const candidates = distArr.slice(0, n_sz);

        // Compute average reference distance
        const trueRefs = [];
        for (const c of candidates) {
          const q = c.q;
          const dr = Math.abs(q.r - p.r), dc = Math.abs(q.c - p.c);
          if (dr + dc === 1) {
            const ta = targetCenter(p), tb = targetCenter(q);
            trueRefs.push(Math.hypot(ta.x - tb.x, ta.y - tb.y));
          }
        }
        const avgTrueRef = trueRefs.length ? trueRefs.reduce((a, b) => a + b, 0) / trueRefs.length : Math.max(1, 50); // fallback diagonal

        // Classify edges
        const correct = [];
        const incorrect = [];
        for (const c of candidates) {
          const q = c.q;
          const isTrueNeighbor = (Math.abs(q.r - p.r) + Math.abs(q.c - p.c)) === 1;
          const d_cur = c.d;
          let d_ref = avgTrueRef;
          if (isTrueNeighbor) {
            const ta = targetCenter(p), tb = targetCenter(q);
            d_ref = Math.hypot(ta.x - tb.x, ta.y - tb.y);
          }

          // Determine merge state
          let mergedSnapshotState = null;
          if (typeof globalIdx !== 'undefined' && globalSnapshots && globalSnapshots[globalIdx] && globalSnapshots[globalIdx].positions) {
            try {
              const spos = globalSnapshots[globalIdx].positions || {};
              const sa = spos[selIdx];
              const sb = spos[c.idx];
              if (sa && sb) {
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
                    let signOk = true;
                    if (dc_meta === 1 && dxs < 0) signOk = false;
                    if (dc_meta === -1 && dxs > 0) signOk = false;
                    if (dr_meta === 1 && dys < 0) signOk = false;
                    if (dr_meta === -1 && dys > 0) signOk = false;
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
          let isMergedForColor;
          if (typeof globalIdx !== 'undefined' && globalSnapshots && globalSnapshots[globalIdx] && globalSnapshots[globalIdx].positions) {
            isMergedForColor = (mergedSnapshotState === true);
          } else {
            isMergedForColor = mergedLive;
          }

          if (isMergedForColor && isTrueNeighbor) correct.push({ q: c.q, idx: c.idx, d_cur, d_ref });
          else incorrect.push({ q: c.q, idx: c.idx, d_cur, d_ref });
        }

        // Draw correct edges (blue)
        for (const e of correct) {
          const startPos = nodePositions[selIdx];
          const endPos = nodePositions[e.idx];
          if (!startPos || !endPos) continue;
          selectedLines.push(`<line x1="${startPos.x}" y1="${startPos.y}" x2="${endPos.x}" y2="${endPos.y}" stroke="#2878dc" stroke-opacity="0.86" stroke-width="2" />`);
        }

        // Draw wrong edges (dark red or orange)
        const maxWrong = Math.max(0, n_sz - correct.length);
        incorrect.sort((a, b) => Math.abs(b.d_cur - b.d_ref) - Math.abs(a.d_cur - a.d_ref));
        const shownWrong = incorrect.slice(0, maxWrong);
        for (const e of shownWrong) {
          const startPos = nodePositions[selIdx];
          const endPos = nodePositions[e.idx];
          if (!startPos || !endPos) continue;
          const color = e.d_cur > e.d_ref ? "#a01414" : "#FF8C00";
          const opacity = e.d_cur > e.d_ref ? "0.86" : "0.78";
          selectedLines.push(`<line x1="${startPos.x}" y1="${startPos.y}" x2="${endPos.x}" y2="${endPos.y}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2" />`);
        }
      }
    }

    // Draw selected piece marker
    const markerPos = nodePositions[selIdx];
    if (markerPos) {
      nodes.push(`<circle cx="${markerPos.x}" cy="${markerPos.y}" r="4" fill="#ffffff" stroke="#333333" stroke-width="1" />`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f5f5f5"/>
  ${bgLines.join("")}
  ${selectedLines.join("")}
  ${nodes.join("")}
</svg>`;
}

function buildMovementPathsSvg() {
  if (!globalSnapshots || globalSnapshots.length < 2) {
    return null; // Not enough data
  }

  const canvasW = bounds.w || 640;
  const canvasH = bounds.h || 640;
  const { originX, originY, W, H, s } = gridRectScaled(canvasW, canvasH);
  const width = canvasW;
  const height = canvasH;

  const allPieces = listPieces();

  // Helper: time-based color
  function timeColorSvg(t) {
    const clamped = Math.max(0, Math.min(1, t));
    if (clamped < 0.33) {
      const k = clamped / 0.33;
      return `rgb(0, ${Math.round(255 * k)}, ${Math.round(255 * (1 - k))})`;
    } else if (clamped < 0.66) {
      const k = (clamped - 0.33) / 0.33;
      return `rgb(${Math.round(255 * k)}, 255, 0)`;
    } else {
      const k = (clamped - 0.66) / 0.34;
      return `rgb(255, ${Math.round(255 * (1 - k))}, 0)`;
    }
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
    const storedTargetX = originX + (storedMetaX - puzzleMeta.minX) * s + storedSw / 2;
    const storedTargetY = originY + (storedMetaY - puzzleMeta.minY) * s + storedSh / 2;
    const dx = stored.x - storedTargetX;
    const dy = stored.y - storedTargetY;
    const curTarget = targetCenter(currentPiece);
    const curSw = currentPiece.sw || 1;
    const scale = curSw / (storedSw || curSw || 1);
    return { x: curTarget.x + dx * scale, y: curTarget.y + dy * scale };
  }

  // Helper: create SVG star path
  function starPath(cx, cy, r) {
    const points = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }

  const paths = [];
  const markers = [];

  // Draw grid outline
  if (puzzleMeta.maxX > puzzleMeta.minX && puzzleMeta.maxY > puzzleMeta.minY) {
    paths.push(`<rect x="${originX}" y="${originY}" width="${W}" height="${H}" fill="none" stroke="#e1e1e1" stroke-width="2" rx="6" />`);
  }

  // For each piece, collect movement history
  for (const piece of allPieces) {
    if (!piece || typeof piece.index === 'undefined') continue;

    const path = [];
    for (let i = 0; i < globalSnapshots.length; i++) {
      const snap = globalSnapshots[i];
      const posData = snap.positions[piece.index];
      if (posData) {
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

    if (path.length < 2) continue;

    // Identify station points
    const stations = [];
    let i = 0;
    while (i < path.length) {
      const current = path[i];
      let j = i + 1;
      while (j < path.length) {
        const dist = Math.hypot(path[j].x - current.x, path[j].y - current.y);
        if (dist < 10) {
          j++;
        } else {
          break;
        }
      }
      const stayDuration = j - i;
      if (stayDuration >= 3 || i === 0 || j >= path.length) {
        stations.push({
          x: current.x,
          y: current.y,
          time: current.time,
          isFirst: i === 0,
          isLast: j >= path.length,
          duration: stayDuration
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

    // Draw smooth curves with time-based colors
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
        const color = timeColorSvg(time);

        paths.push(`<line x1="${pt1.x}" y1="${pt1.y}" x2="${pt2.x}" y2="${pt2.y}" stroke="${color}" stroke-opacity="0.78" stroke-width="${weight}" stroke-linecap="round" />`);
      }
    }

    // Draw station markers
    for (const station of stations) {
      const color = timeColorSvg(station.time);

      if (station.isFirst) {
        // Square (blue) - darker stroke for visibility on white background
        markers.push(`<rect x="${station.x - 5}" y="${station.y - 5}" width="10" height="10" fill="rgb(0,0,255)" fill-opacity="0.9" stroke="rgb(0,0,150)" stroke-width="1.5" />`);
      } else if (station.isLast) {
        // Star (red) - darker stroke for visibility
        markers.push(`<polygon points="${starPath(station.x, station.y, 6)}" fill="rgb(255,0,0)" fill-opacity="0.9" stroke="rgb(150,0,0)" stroke-width="1.5" />`);
      } else {
        // Circle (time-colored) - darker stroke version of fill color
        markers.push(`<circle cx="${station.x}" cy="${station.y}" r="6" fill="${color}" fill-opacity="0.9" stroke="rgba(0,0,0,0.3)" stroke-width="1.2" />`);
      }
    }
  }

  // Legend
  const legendW = Math.min(200, width * 0.3);
  const legendH = 12;
  const legendX = width - legendW - 20;
  const legendY = 20;

  const legendStops = [];
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = timeColorSvg(t);
    const x = legendX + (legendW * i) / steps;
    legendStops.push(`<rect x="${x}" y="${legendY}" width="${legendW / steps + 0.5}" height="${legendH}" fill="${color}" />`);
  }

  const markerY = legendY + legendH + 24;
  const legend = `
    ${legendStops.join("")}
    <rect x="${legendX}" y="${legendY}" width="${legendW}" height="${legendH}" fill="none" stroke="#969696" stroke-width="1" />
    <text x="${legendX}" y="${legendY + legendH + 14}" text-anchor="start" font-size="11" fill="#505050">${t("pathStart") || "Start"}</text>
    <text x="${legendX + legendW}" y="${legendY + legendH + 14}" text-anchor="end" font-size="11" fill="#505050">${t("pathEnd") || "End"}</text>

    <text x="${legendX}" y="${markerY}" text-anchor="start" font-size="10" fill="#666">${t("pathMarkers") || "Markers"}:</text>
    <rect x="${legendX}" y="${markerY + 8}" width="8" height="8" fill="rgb(0,0,255)" fill-opacity="0.7" stroke="#ffffff" stroke-width="1" />
    <text x="${legendX + 14}" y="${markerY + 12}" text-anchor="start" dominant-baseline="middle" font-size="10" fill="#505050">${t("pathStartMarker") || "Start"}</text>

    <circle cx="${legendX + 6}" cy="${markerY + 24}" r="6" fill="rgb(0,255,0)" fill-opacity="0.7" stroke="#ffffff" stroke-width="1" />
    <text x="${legendX + 18}" y="${markerY + 24}" text-anchor="start" dominant-baseline="middle" font-size="10" fill="#505050">${t("pathStopMarker") || "Stop"}</text>

    <polygon points="${starPath(legendX + 4, markerY + 36, 5)}" fill="rgb(255,0,0)" fill-opacity="0.7" stroke="#ffffff" stroke-width="1" />
    <text x="${legendX + 14}" y="${markerY + 36}" text-anchor="start" dominant-baseline="middle" font-size="10" fill="#505050">${t("pathEndMarker") || "End"}</text>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f5f5f5"/>
  ${paths.join("")}
  ${markers.join("")}
  ${legend}
</svg>`;
}

function renderTimer() {
  const el = document.getElementById("timerDisplay");
  if (!el) return;
  el.textContent = formatDuration(timerElapsed);
  timerState.elapsed = timerElapsed;
}

function startTimer() {
  timerStart = Date.now();
  timerElapsed = 0;
  timerState.elapsed = 0;
  timerState.running = true;
  renderTimer();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerElapsed = Date.now() - timerStart;
    renderTimer();
    if (styleState.analyticsView === "heatmap" && ((puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6))) redraw();
  }, 1000);
}

function stopTimer() {
  if (!timerStart) return;
  timerElapsed = Date.now() - timerStart;
  timerStart = 0;
  timerState.elapsed = timerElapsed;
  timerState.running = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  renderTimer();
}

function resetTimer() {
  timerElapsed = 0;
  timerStart = 0;
  timerState.elapsed = 0;
  timerState.running = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  renderTimer();
}

function setTimerVisible(show) {
  const wrap = document.getElementById("timerWrap");
  if (wrap) wrap.classList.toggle("timer-hidden", !show);
}

function isPuzzleSolved() {
  const pieces = listPieces();
  return pieces.length > 0 && pieces.every(p => p.solved);
}

function updateAnalyticsDesc() {
  const analyticsDesc = document.getElementById('analyticsDesc');
  if (!analyticsDesc) return;
  if (styleState.analyticsView === "heatmap") analyticsDesc.textContent = t("analyticsDescHeatmap");
  else if (styleState.analyticsView === "grabs") analyticsDesc.textContent = t("analyticsDescGrabs");
  else if (styleState.analyticsView === "connections") analyticsDesc.textContent = t("analyticsDescConnections");
  else if (styleState.analyticsView === "paths") analyticsDesc.textContent = t("analyticsDescPaths");
  else if (styleState.analyticsView === "adjacency") analyticsDesc.textContent = t("analyticsDescAdjacency");
  else analyticsDesc.textContent = t("analyticsDescNone");
}

function updateConnectionsUI() {
  const connectionsControls = document.getElementById('connectionsControls');
  if (!connectionsControls) return;
  const show = styleState.analyticsView === 'connections';
  connectionsControls.style.display = show ? '' : 'none';
  if (!show) return;
  const connectionsSelectedIdx = document.getElementById('connectionsSelectedIdx');
  const connectionsSlider = document.getElementById('connectionsSlider');
  const sel = connectionsState.selected;
  if (sel == null) {
    if (connectionsSelectedIdx) connectionsSelectedIdx.textContent = '—';
    if (connectionsSlider) { connectionsSlider.max = 0; connectionsSlider.value = 0; }
    return;
  }
  const p = listPieces().find(x => x && x.index === sel);
  if (!p) {
    if (connectionsSelectedIdx) connectionsSelectedIdx.textContent = sel;
    if (connectionsSlider) { connectionsSlider.max = 0; connectionsSlider.value = 0; }
    return;
  }
  if (connectionsSelectedIdx) connectionsSelectedIdx.textContent = String(sel);
  const len = (p.snapshots && p.snapshots.length) || 0;
  if (connectionsSlider) {
    connectionsSlider.max = Math.max(0, len - 1);
    connectionsState.snapshotIdx = Math.min(connectionsState.snapshotIdx || 0, Math.max(0, len - 1));
    connectionsSlider.value = connectionsState.snapshotIdx || 0;
  }
}

function updatePathsUI() {
  const pathsLegend = document.getElementById('pathsLegend');
  if (!pathsLegend) return;
  const show = styleState.analyticsView === 'paths';
  pathsLegend.style.display = show ? '' : 'none';
}

function canExportHeatmap() {
  if (styleState.analyticsView === "connections") return true;
  if (styleState.analyticsView === "paths") return globalSnapshots && globalSnapshots.length >= 2;
  if (styleState.analyticsView !== "heatmap" && styleState.analyticsView !== "grabs") return false;
  return (puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6);
}

function startGrabAt(piece, mx, my) {
  const rot = piece.rotation || 0;

  let u, v;

  if (rot === 0) {
    // No rotation - simple case
    u = (mx - piece.x) / piece.sw;
    v = (my - piece.y) / piece.sh;
  } else {
    // Piece is rotated - transform click coordinates back to 0° orientation
    const centerX = piece.x + piece.sw / 2;
    const centerY = piece.y + piece.sh / 2;

    // Vector from piece center to click point
    const dx = mx - centerX;
    const dy = my - centerY;

    // Rotate backwards (inverse rotation)
    const angleRad = (-rot * Math.PI) / 180; // Negative to reverse rotation
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const unrotatedX = dx * cosA - dy * sinA;
    const unrotatedY = dx * sinA + dy * cosA;

    // Convert back to piece-relative coordinates (0 to 1)
    u = (unrotatedX + piece.sw / 2) / piece.sw;
    v = (unrotatedY + piece.sh / 2) / piece.sh;
  }

  const ix = Math.max(0, Math.min(piece.w - 1, Math.floor(u * piece.w)));
  const iy = Math.max(0, Math.min(piece.h - 1, Math.floor(v * piece.h)));
  activeGrab = { piece, x: ix, y: iy, start: timerState.elapsed };

  // Record piece-to-piece interaction for adjacency matrix
  if (lastGrabbedPieceIndex !== null && typeof piece.index !== 'undefined') {
    recordPieceInteraction(lastGrabbedPieceIndex, piece.index);
  }
  lastGrabbedPieceIndex = piece.index;

  // Track grab for statistics
  if (currentGameId) {
    recordGrab(currentGameId);
  }
}

function finishGrab() {
  if (!activeGrab) return;
  const dur = Math.max(0, timerState.elapsed - activeGrab.start);
  const piece = activeGrab.piece;
  piece.grabs = piece.grabs || [];
  piece.grabs.push({ x: activeGrab.x, y: activeGrab.y, t: activeGrab.start, dur });
  activeGrab = null;
}

function findPieceAt(mx, my) {
  const groups = window.__groups || [];
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    const arr = Array.from(g.members).sort((a, b) => b.index - a.index);
    for (const p of arr) {
      if (p.hit(mx, my)) return p;
    }
  }
  return null;
}

// Expose globally for hover detection
window.__findPieceAt = findPieceAt;

// When releasing a dragged group, try to snap/merge it with neighboring pieces/groups
function tryMergeGroupsOnRelease(g) {
  if (!g) return;
  const pieces = listPieces();
  const thresh = 0.35 * averagePieceDiagonal();
  let merged = true;
  let hadAnyMerge = false;
  // iterate until no more merges happen (to allow chain merges)
  while (merged) {
    merged = false;
    for (const p of Array.from(g.members)) {
      // Skip if piece doesn't have correct orientation (when rotation enabled)
      if (gameSettings.rotationEnabled && !p.isCorrectOrientation()) {
        continue;
      }

      for (const np of pieces) {
        if (!np || np.group === g) continue;

        // Skip neighbor if it doesn't have correct orientation (when rotation enabled)
        if (gameSettings.rotationEnabled && !np.isCorrectOrientation()) {
          continue;
        }

        // only consider orthogonal neighbors
        const dr = np.r - p.r, dc = np.c - p.c;
        if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
        const dx = (np.meta.x - p.meta.x) * styleState.pieceScale;
        const dy = (np.meta.y - p.meta.y) * styleState.pieceScale;
        const expectedX = p.x + dx;
        const expectedY = p.y + dy;
        const d = Math.hypot(np.x - expectedX, np.y - expectedY);
        if (d < thresh) {
          // move the other piece's whole group to align
          const otherGroup = np.group;
          const tx = expectedX - np.x;
          const ty = expectedY - np.y;
          if (otherGroup) otherGroup.move(tx, ty, window.__clampPiece);
          // merge groups: add members of otherGroup into g
          if (otherGroup && otherGroup !== g) {
            g.merge(otherGroup);
            // remove otherGroup from global groups array
            const arr = window.__groups || [];
            const idx = arr.indexOf(otherGroup);
            if (idx >= 0) arr.splice(idx, 1);
            window.__groups = arr;
            merged = true;
            break;
          }
        }
      }
      if (merged) break;
    }
  }

  // Detect and record wrong-attempt links: only check the single piece that was
  // actively drag-dropped (if any) and the single closest other piece to it.
  try {
    // stricter sensitivity: require pieces to be much closer before
    // we consider the placement a "wrong" attempt. Pieces have small
    // tabs/slots, so use a fraction of the diagonal to avoid false positives.
    const wrongThresh = 0.45 * averagePieceDiagonal();
    const globalDragged = window.__draggedPiece || null;
    let subject = null;
    // prefer the piece that was recorded as dragged, but fall back to the
    // member of the released group that is closest to the group's center
    if (globalDragged) {
      const draggedInGroup = Array.from(g.members).some(m => m && m.index === globalDragged.index);
      if (draggedInGroup) subject = globalDragged;
    }
    if (!subject) {
      try {
        const c = g.getCenter();
        let cd = Infinity;
        for (const m of g.members) {
          const dx = (m.x + m.sw/2) - c.cx;
          const dy = (m.y + m.sh/2) - c.cy;
          const d = Math.hypot(dx, dy);
          if (d < cd) { cd = d; subject = m; }
        }
      } catch (_) { subject = null; }
    }

    if (subject && pieces.length) {
      let closest = null;
      let closestD = Infinity;
      const ax = subject.x + subject.sw/2, ay = subject.y + subject.sh/2;
      for (const np of pieces) {
        if (!np || Array.from(g.members).some(m => m && m.index === np.index)) continue;
        const bx = np.x + np.sw/2, by = np.y + np.sh/2;
        const d = Math.hypot(ax - bx, ay - by);
        if (d < closestD) { closestD = d; closest = np; }
      }
      if (closest && closestD < wrongThresh) {
        // refine: require pieces to be aligned at an edge (tabs/slots)
        // compute a small edge tolerance and overlap requirement
        const avgDiag = averagePieceDiagonal();
        const edgeTol = 0.18 * avgDiag; // how close edges must be
        const minOverlap = 0.35 * Math.min(subject.sh, closest.sh);
        const subjectLeft = subject.x, subjectRight = subject.x + subject.sw;
        const subjectTop = subject.y, subjectBottom = subject.y + subject.sh;
        const otherLeft = closest.x, otherRight = closest.x + closest.sw;
        const otherTop = closest.y, otherBottom = closest.y + closest.sh;

        let isAttempt = false;
        // subject to the left of closest (right edge near left edge)
        const horizOverlap = Math.min(subjectBottom, otherBottom) - Math.max(subjectTop, otherTop);
        if (Math.abs(subjectRight - otherLeft) <= edgeTol && horizOverlap > minOverlap) isAttempt = true;
        // subject to the right of closest
        if (Math.abs(otherRight - subjectLeft) <= edgeTol && horizOverlap > minOverlap) isAttempt = true;
        // subject above closest
        const vertOverlap = Math.min(subjectRight, otherRight) - Math.max(subjectLeft, otherLeft);
        if (Math.abs(subjectBottom - otherTop) <= edgeTol && vertOverlap > minOverlap) isAttempt = true;
        // subject below closest
        if (Math.abs(otherBottom - subjectTop) <= edgeTol && vertOverlap > minOverlap) isAttempt = true;

        // as a fallback, if centers are extremely close, also treat as attempt
        if (!isAttempt && closestD < 0.22 * avgDiag) isAttempt = true;

        if (isAttempt) {
          // avoid duplicate entries
          const existing = (window.__listWrongLinks && window.__listWrongLinks()) || [];
          const found = existing.some(l => (l.a === subject.index && l.b === closest.index) || (l.a === closest.index && l.b === subject.index));
          if (!found) {
            if (window.__registerWrongLink) window.__registerWrongLink(subject.index, closest.index, timerState && timerState.elapsed ? timerState.elapsed : Date.now());
            try { console.log("wrong-link registered", subject.index, closest.index, Math.round(closestD)); } catch(_) {}
          }
        }
      }
    }
  } catch (_) {}
}

function setStartScreenVisible(show) {
  document.body.classList.toggle('game-started', !show);
}

function selectedItem() {
  return galleryItems.find(i => i.id === selectedItemId) || null;
}

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = "";
  for (const item of galleryItems) {
    const card = document.createElement('button');
    card.type = "button";
    card.className = "gallery-card";
    card.dataset.id = item.id;
    const lang = getLang();
    const title = item.title[lang] || item.title.hu;
    card.innerHTML = `
      <img src="${item.preview}" alt="${title}" />
      <div class="card-body">
        <div class="title">${title}</div>
        <div class="sizes">${t("available")}: ${Object.keys(item.sizes).join(", ")}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      selectedItemId = item.id;
      selectedSize = null;
      updateSelectionUI();
      renderSizeOptions();
      updateStartButton();
    });
    grid.appendChild(card);
  }
}

function renderSizeOptions() {
  const container = document.getElementById('sizeOptions');
  container.innerHTML = "";
  const item = selectedItem();
  if (!item) {
    container.textContent = t("selectImageFirst");
    return;
  }
  for (const sizeKey of Object.keys(item.sizes)) {
    const btn = document.createElement('button');
    btn.type = "button";
    btn.className = "size-btn";
    btn.textContent = sizeKey;
    btn.dataset.size = sizeKey;
    btn.addEventListener('click', () => {
      selectedSize = sizeKey;
      updateSelectionUI();
      updateStartButton();
    });
    container.appendChild(btn);
  }
}

function updateSelectionUI() {
  document.querySelectorAll('.gallery-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.id === selectedItemId);
  });
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.size === selectedSize);
  });
}

function updateStartButton() {
  const btn = document.getElementById('startGame');
  const sizeError = document.getElementById('sizeError');
  const ok = !!(selectedItemId && selectedSize);
  // Don't disable button - let click handler show error message
  // btn.disabled = !ok;
  btn.disabled = false;
  // Hide error message when size is selected
  if (selectedSize && sizeError) {
    sizeError.style.display = 'none';
  }
}

async function buildFormDataFromUrls(imageUrl, maskUrl) {
  const [imgRes, maskRes] = await Promise.all([fetch(imageUrl), fetch(maskUrl)]);
  if (!imgRes.ok || !maskRes.ok) {
    throw new Error(t("errImageLoad"));
  }
  const [imgBlob, maskBlob] = await Promise.all([imgRes.blob(), maskRes.blob()]);
  const formData = new FormData();
  formData.append("image", new File([imgBlob], "image.png", { type: imgBlob.type || "image/png" }));
  formData.append("mask", new File([maskBlob], "mask.png", { type: maskBlob.type || "image/png" }));
  return formData;
}

async function startPuzzleFromGallery() {
  const item = selectedItem();
  if (!item || !selectedSize) return;
  const src = item.sizes[selectedSize];
  if (!src) return;

  // Store image source for preview
  window.__currentPuzzleImageSrc = src.image;

  // Read rotation setting from checkbox
  const rotCheckbox = document.getElementById('rotationEnabled');
  if (rotCheckbox) gameSettings.rotationEnabled = rotCheckbox.checked;

  // Read rotation percentage from slider
  const rotPercentage = document.getElementById('rotationPercentage');
  if (rotPercentage) gameSettings.rotationPercentage = parseInt(rotPercentage.value, 10);

  // Stop any running intervals
  if (dragTrackInterval) {
    clearInterval(dragTrackInterval);
    dragTrackInterval = null;
  }

  styleState.analyticsView = "none";
  const analyticsView = document.getElementById('analyticsView');
  if (analyticsView) analyticsView.value = "none";
  const heatmapExport = document.getElementById('heatmapExport');
  if (heatmapExport) {
    heatmapExport.disabled = true;
    heatmapExport.textContent = t("heatmapExport");
  }

  updateAnalyticsDesc();
  updateConnectionsUI();
  updatePathsUI();

  // Update zoom UI availability (enable zoom controls since analytics = "none")
  const zoomToggleEl = document.getElementById('zoomToggle');
  const zoomInBtnEl = document.getElementById('zoomIn');
  const zoomOutBtnEl = document.getElementById('zoomOut');
  const zoomResetBtnEl = document.getElementById('zoomReset');
  if (zoomToggleEl) {
    zoomToggleEl.disabled = false;
    zoomToggleEl.title = "";
  }
  if (zoomInBtnEl) {
    zoomInBtnEl.disabled = false;
    zoomInBtnEl.title = "";
  }
  if (zoomOutBtnEl) {
    zoomOutBtnEl.disabled = false;
    zoomOutBtnEl.title = "";
  }
  if (zoomResetBtnEl) {
    zoomResetBtnEl.disabled = false;
    zoomResetBtnEl.title = "";
  }

  redraw();
  resetTimer();
  startTimer();
  resetScene();

  // Reset zoom and view settings for new game
  resetZoom();
  viewSettings.zoomEnabled = false;

  // Sync UI checkboxes
  const zoomCheckbox = document.getElementById('zoomToggle');
  if (zoomCheckbox) zoomCheckbox.checked = false;

  // Hide zoom controls since zoom is disabled
  const zoomControlsDiv = document.getElementById('zoomControls');
  if (zoomControlsDiv) zoomControlsDiv.style.display = 'none';

  window.__pieces = [];
  window.__groups = [];
  redraw();

  const loading = document.getElementById('startLoading');
  loading.style.display = 'block';
  try {
    const formData = await buildFormDataFromUrls(src.image, src.mask);
    await runPuzzleLoad(formData);

    // Track game start for statistics
    const pieces = listPieces();
    currentGameId = recordGameStart(selectedSize, pieces.length, gameSettings.rotationEnabled);

    setStartScreenVisible(false);
  } catch (err) {
    stopTimer();
    resetTimer();
    alert(t("errorPrefix") + err.message);
  } finally {
    loading.style.display = 'none';
  }
}

// Helper function to generate random position avoiding the target grid area
function randomPositionOutsideGrid(pieceWidth, pieceHeight, canvasWidth, canvasHeight) {
  const { originX, originY, W, H } = gridRectScaled(canvasWidth, canvasHeight);
  const margin = 30; // Minimum distance from grid area

  // Define forbidden area (target grid + margin)
  const gridLeft = originX - margin;
  const gridRight = originX + W + margin;
  const gridTop = originY - margin;
  const gridBottom = originY + H + margin;

  // Available areas: left, right, top, bottom
  const areas = [];

  // Left area
  if (gridLeft > pieceWidth) {
    areas.push({
      minX: 0,
      maxX: gridLeft - pieceWidth,
      minY: 0,
      maxY: canvasHeight - pieceHeight
    });
  }

  // Right area
  if (canvasWidth - gridRight > pieceWidth) {
    areas.push({
      minX: gridRight,
      maxX: canvasWidth - pieceWidth,
      minY: 0,
      maxY: canvasHeight - pieceHeight
    });
  }

  // Top area
  if (gridTop > pieceHeight) {
    areas.push({
      minX: 0,
      maxX: canvasWidth - pieceWidth,
      minY: 0,
      maxY: gridTop - pieceHeight
    });
  }

  // Bottom area
  if (canvasHeight - gridBottom > pieceHeight) {
    areas.push({
      minX: 0,
      maxX: canvasWidth - pieceWidth,
      minY: gridBottom,
      maxY: canvasHeight - pieceHeight
    });
  }

  // If no area available (grid too large), fallback to random position
  if (areas.length === 0) {
    return {
      x: Math.random() * Math.max(1, canvasWidth - pieceWidth),
      y: Math.random() * Math.max(1, canvasHeight - pieceHeight)
    };
  }

  // Pick random area and random position within it
  const area = areas[Math.floor(Math.random() * areas.length)];
  return {
    x: area.minX + Math.random() * Math.max(1, area.maxX - area.minX),
    y: area.minY + Math.random() * Math.max(1, area.maxY - area.minY)
  };
}

async function runPuzzleLoad(formData) {
  const data = await uploadPuzzle(formData);
  if (typeof data.rows !== 'number' || typeof data.cols !== 'number' || !data.meta || !Array.isArray(data.pieces) || !data.pieces.length) {
    throw new Error(t("errServerResponse"));
  }
  setPuzzleMeta(data.meta);
  setPuzzleGrid(data.rows, data.cols);
  const heatmapExport = document.getElementById('heatmapExport');
  if (heatmapExport) {
    heatmapExport.disabled = !canExportHeatmap();
    if (styleState.analyticsView === "heatmap") {
      heatmapExport.textContent = t("exportHeatmapLabel");
    } else if (styleState.analyticsView === "grabs") {
      heatmapExport.textContent = t("exportGrabsLabel");
    } else if (styleState.analyticsView === "connections") {
      heatmapExport.textContent = t("exportConnectionsLabel");
    } else if (styleState.analyticsView === "paths") {
      heatmapExport.textContent = t("exportPathsLabel");
    } else {
      heatmapExport.textContent = t("heatmapExport");
    }
  }

  let idx = 0;
  for (const item of data.pieces) {
    const img = await new Promise((ok, err) => loadImage('data:image/png;base64,' + item.b64, ok, err));
    const p = new PuzzlePiece(img, 0, 0, item.r, item.c, idx++, { x:item.x, y:item.y, w:item.w, h:item.h });
    const pos = randomPositionOutsideGrid(p.sw, p.sh, width, height);
    p.x = pos.x;
    p.y = pos.y;
    // Apply random rotation if enabled (0, 90, 180, 270 degrees only)
    if (gameSettings.rotationEnabled) {
      const rotations = [0, 90, 180, 270];
      const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];
      p.rotation = randomRotation;
      p.rotationTarget = randomRotation;
    }
    // initialize per-piece snapshot index list
    p.snapshots = [];
    registerPiece(p);
    const g = new Group(p);
    newGroup(g);
  }

  // Apply collision-free shuffle to initial placement
  // Import shufflePieces from interaction.js
  const { shufflePieces } = await import("../canvas/interaction.js");
  shufflePieces((p) => new Group(p));

  // create initial global snapshot and register per-piece snapshot indices
  resetGlobalSnapshots();
  resetPieceInteractionMatrix(); // Reset interaction matrix for new game
  lastGrabbedPieceIndex = null; // Reset last grabbed piece tracker
  const initSnap = addGlobalSnapshot(listPieces());
  for (const p of listPieces()) p.snapshots = [initSnap];

  window.__pieces = window.__pieces || [];
  window.__groups = listGroups();
  redraw();
}

export function wireControls() {
  initI18n();
  initSession(); // Initialize session tracking
  initStatsModal(); // Initialize statistics modal
  renderGallery();
  renderSizeOptions();
  updateStartButton();
  setStartScreenVisible(true);
  resetTimer();
  const tabSettings = document.getElementById('tabSettings');
  const tabAnalytics = document.getElementById('tabAnalytics');
  const settingsPanel = document.getElementById('settingsPanel');
  const analyticsPanel = document.getElementById('analyticsPanel');
  const sideTitle = document.getElementById('sideTitle');
  const setSidePanel = (name) => {
    const showSettings = name === 'settings';
    settingsPanel?.classList.toggle('active', showSettings);
    analyticsPanel?.classList.toggle('active', !showSettings);
    tabSettings?.classList.toggle('active', showSettings);
    tabAnalytics?.classList.toggle('active', !showSettings);
    if (sideTitle) sideTitle.textContent = t(showSettings ? "settingsTitle" : "analyticsTitle");
  };
  tabSettings?.addEventListener('click', () => setSidePanel('settings'));
  tabAnalytics?.addEventListener('click', () => setSidePanel('analytics'));
  setSidePanel('settings');
  const timerToggle = document.getElementById('timerToggle');
  if (timerToggle) {
    setTimerVisible(timerToggle.checked);
    timerToggle.addEventListener('change', () => setTimerVisible(timerToggle.checked));
  }

  // Rotation controls
  const rotationEnabled = document.getElementById('rotationEnabled');
  const rotationControls = document.getElementById('rotationControls');
  const rotationPercentage = document.getElementById('rotationPercentage');
  const rotationPercentageLbl = document.getElementById('rotationPercentageLbl');

  if (rotationEnabled && rotationControls) {
    rotationEnabled.addEventListener('change', () => {
      gameSettings.rotationEnabled = rotationEnabled.checked;
      rotationControls.style.display = rotationEnabled.checked ? 'block' : 'none';
    });
  }

  if (rotationPercentage && rotationPercentageLbl) {
    rotationPercentage.addEventListener('input', () => {
      const value = parseInt(rotationPercentage.value, 10);
      gameSettings.rotationPercentage = value;
      rotationPercentageLbl.textContent = `${value}%`;
    });
  }

  const analyticsView = document.getElementById('analyticsView');
  const analyticsDesc = document.getElementById('analyticsDesc');
  if (analyticsView) {
    styleState.analyticsView = analyticsView.value || "none";
    updateAnalyticsDesc();
    analyticsView.addEventListener('change', () => {
      styleState.analyticsView = analyticsView.value || "none";
      updateAnalyticsDesc();
      updateConnectionsUI();
      updatePathsUI();
      updateZoomAvailability();  // Update zoom UI based on analytics state
      // Clear hover piece when entering analytics view
      if (styleState.analyticsView !== "none") {
        setHoverPiece(null);
      }
      redraw();
    });
  }
  // Connections view controls
  const connectionsSlider = document.getElementById('connectionsSlider');
  if (connectionsSlider) {
    connectionsSlider.addEventListener('input', () => {
      connectionsState.snapshotIdx = parseInt(connectionsSlider.value, 10) || 0;
      redraw();
    });
  }
  // initialize connections UI visibility
  updateConnectionsUI();
  updatePathsUI();
  const heatmapExport = document.getElementById('heatmapExport');
  if (heatmapExport) {
    const updateExportState = () => {
      heatmapExport.disabled = !canExportHeatmap();
      if (styleState.analyticsView === "heatmap") {
        heatmapExport.textContent = t("exportHeatmapLabel");
      } else if (styleState.analyticsView === "grabs") {
        heatmapExport.textContent = t("exportGrabsLabel");
      } else if (styleState.analyticsView === "connections") {
        heatmapExport.textContent = t("exportConnectionsLabel");
      } else if (styleState.analyticsView === "paths") {
        heatmapExport.textContent = t("exportPathsLabel");
      } else {
        heatmapExport.textContent = t("heatmapExport");
      }
    };
    updateExportState();
    analyticsView?.addEventListener('change', updateExportState);
    heatmapExport.addEventListener('click', () => {
      if (!canExportHeatmap()) {
        alert(t("heatmapExportUnavailable"));
        return;
      }
      if (styleState.analyticsView === "grabs") {
        const svg = buildGrabSvg(puzzleGrid.rows, puzzleGrid.cols, listPieces());
        downloadSvg(`grabs-${puzzleGrid.rows}x${puzzleGrid.cols}.svg`, svg);
        return;
      }
      if (styleState.analyticsView === "connections") {
        const svg = buildConnectionsSvg(puzzleGrid.rows, puzzleGrid.cols, listPieces());
        downloadSvg(`connections-${puzzleGrid.rows}x${puzzleGrid.cols}.svg`, svg);
        return;
      }
      if (styleState.analyticsView === "paths") {
        const svg = buildMovementPathsSvg();
        if (!svg) {
          alert(t("noPathData") || "Not enough movement data to export.");
          return;
        }
        downloadSvg(`paths-${puzzleGrid.rows}x${puzzleGrid.cols}.svg`, svg);
        return;
      }
      const svg = buildHeatmapSvg(puzzleGrid.rows, puzzleGrid.cols, listPieces(), timerState.elapsed);
      downloadSvg(`heatmap-${puzzleGrid.rows}x${puzzleGrid.cols}.svg`, svg);
    });
  }

  document.getElementById('openGallery').addEventListener('click', () => {
    // if a game is active, confirm before leaving
    const hasPieces = (window.__pieces || []).length > 0 || timerState.running;
    if (hasPieces) {
      showConfirmLeave(() => {
        stopTimer();
        resetTimer();
        setHoverPiece(null);

        // Reset zoom and view settings when returning to gallery
        resetZoom();
        viewSettings.zoomEnabled = false;

        // Sync UI checkboxes
        const zoomCheckbox = document.getElementById('zoomToggle');
        if (zoomCheckbox) zoomCheckbox.checked = false;

        // Hide zoom controls since zoom is disabled
        const zoomControlsDiv = document.getElementById('zoomControls');
        if (zoomControlsDiv) zoomControlsDiv.style.display = 'none';

        setStartScreenVisible(true);
      });
      return;
    }
    stopTimer();
    resetTimer();
    setHoverPiece(null);

    // Reset zoom and view settings when returning to gallery
    resetZoom();
    viewSettings.zoomEnabled = false;

    // Sync UI checkboxes
    const zoomCheckbox = document.getElementById('zoomToggle');
    if (zoomCheckbox) zoomCheckbox.checked = false;

    // Hide zoom controls since zoom is disabled
    const zoomControlsDiv = document.getElementById('zoomControls');
    if (zoomControlsDiv) zoomControlsDiv.style.display = 'none';

    setStartScreenVisible(true);
  });

  // Preview image modal
  const previewModal = document.getElementById('previewModal');
  const previewImageElement = document.getElementById('previewImageElement');
  const previewButton = document.getElementById('previewImage');

  if (previewButton && previewModal && previewImageElement) {
    previewButton.addEventListener('click', () => {
      const pieces = listPieces();
      if (!pieces || pieces.length === 0) {
        alert(t("noActivePuzzle") || "No active puzzle to preview.");
        return;
      }

      const imgSrc = window.__currentPuzzleImageSrc;

      if (!imgSrc) {
        alert(t("previewUnavailable") || "Preview unavailable.");
        return;
      }

      previewImageElement.src = imgSrc;
      previewImageElement.alt = t("previewTitle") || "Puzzle preview";
      previewModal.removeAttribute('hidden');
      window.__modalOpen = true;
    });

    // Close on click anywhere on modal overlay
    previewModal.addEventListener('click', (e) => {
      if (e.target === previewModal) {
        previewModal.setAttribute('hidden', '');
        window.__modalOpen = false;
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !previewModal.hasAttribute('hidden')) {
        previewModal.setAttribute('hidden', '');
        window.__modalOpen = false;
      }
    });
  }

  // Confirm modal wiring
  const modal = document.getElementById('confirmLeaveModal');
  const modalCancel = document.getElementById('confirmLeaveCancel');
  const modalConfirm = document.getElementById('confirmLeaveConfirm');
  let lastFocused = null;
  function trapFocus(e) {
    if (!modal || modal.hasAttribute('hidden')) return;
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length-1];
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape') {
      hideConfirmLeave();
    }
  }

  function showConfirmLeave(onConfirm) {
    if (!modal) { if (typeof onConfirm === 'function') onConfirm(); return; }
    lastFocused = document.activeElement;
    modal.removeAttribute('hidden');
    modalConfirm._onConfirm = onConfirm;
    // focus first actionable button
    modalCancel.focus();
    // block background interactions
    window.__modalOpen = true;
    document.addEventListener('keydown', trapFocus);
  }

  function hideConfirmLeave() {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.removeEventListener('keydown', trapFocus);
    try { if (lastFocused) lastFocused.focus(); } catch(_) {}
    // unblock interactions
    window.__modalOpen = false;
  }

  if (modalCancel) modalCancel.addEventListener('click', () => hideConfirmLeave(true));
  if (modalConfirm) modalConfirm.addEventListener('click', () => {
    try { if (modalConfirm._onConfirm) modalConfirm._onConfirm(); } catch(_) {}
    // do not re-enable interactions when confirming leave; remain blocked until a new game starts
    hideConfirmLeave(false);
  });
  document.getElementById('startGame').addEventListener('click', () => {
    const sizeError = document.getElementById('sizeError');

    // Check if image is selected
    if (!selectedItemId) {
      if (sizeError) {
        sizeError.textContent = t('startHint'); // "Válassz képet a galériából, majd add meg a méretet."
        sizeError.style.display = 'block';
        setTimeout(() => {
          sizeError.style.display = 'none';
        }, 3000);
      }
      return;
    }

    // Check if size is selected
    if (!selectedSize) {
      if (sizeError) {
        sizeError.textContent = t('selectSizeFirst');
        sizeError.style.display = 'block';
        // Hide error after 3 seconds
        setTimeout(() => {
          sizeError.style.display = 'none';
        }, 3000);
      }
      return;
    }

    // Hide error if it was visible
    if (sizeError) {
      sizeError.style.display = 'none';
    }
    startPuzzleFromGallery();
  });

  // Statistics button
  const showStatsBtn = document.getElementById('showStats');
  if (showStatsBtn) {
    showStatsBtn.addEventListener('click', () => {
      showStatsModal();
    });
  }

  // About button
  const showAboutBtn = document.getElementById('showAbout');
  const aboutModal = document.getElementById('aboutModal');
  const aboutModalClose = document.getElementById('aboutModalClose');

  if (showAboutBtn && aboutModal) {
    showAboutBtn.addEventListener('click', () => {
      aboutModal.removeAttribute('hidden');
      updateAboutLanguage();
    });
  }

  if (aboutModalClose && aboutModal) {
    aboutModalClose.addEventListener('click', () => {
      aboutModal.setAttribute('hidden', '');
    });
  }

  // Close about modal on overlay click
  if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) {
        aboutModal.setAttribute('hidden', '');
      }
    });
  }

  // Helper function to update about modal language
  function updateAboutLanguage() {
    const currentLang = getLang();
    const sections = aboutModal.querySelectorAll('[data-lang-section]');
    sections.forEach(section => {
      const sectionLang = section.getAttribute('data-lang-section');
      section.style.display = sectionLang === currentLang ? 'block' : 'none';
    });
  }

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTranslations();
      updateAboutLanguage(); // Update about modal language
      window.__grabTooltipLabels = { time: t("grabTimeLabel"), duration: t("grabDurationLabel") };
      const heatmapExport = document.getElementById('heatmapExport');
      if (heatmapExport) {
        if (styleState.analyticsView === "heatmap") {
          heatmapExport.textContent = t("exportHeatmapLabel");
        } else if (styleState.analyticsView === "grabs") {
          heatmapExport.textContent = t("exportGrabsLabel");
        } else if (styleState.analyticsView === "connections") {
          heatmapExport.textContent = t("exportConnectionsLabel");
        } else if (styleState.analyticsView === "paths") {
          heatmapExport.textContent = t("exportPathsLabel");
        } else {
          heatmapExport.textContent = t("heatmapExport");
        }
      }
      updateAnalyticsDesc();
      renderGallery();
      renderSizeOptions();
      updateStartButton();
    });
  });

  document.getElementById('toggleAside').addEventListener('click', () => {
    document.body.classList.toggle('aside-open');
    document.body.classList.toggle('aside-collapsed');
  });

  document.getElementById('outlineToggle').addEventListener('change', () => { styleState.outline = document.getElementById('outlineToggle').checked; redraw(); });

  const ps = document.getElementById('pieceScaleRange');

  ps.addEventListener('input', () => {
    styleState.pieceScale = parseInt(ps.value,10) / 100;
    document.getElementById('pieceScaleLbl').textContent = `${Math.round(styleState.pieceScale*100)}%`;
    for (const p of window.__pieces) if (p.solved) p.moveToTarget(); else clampPieceOutsideGrid(p);
    redraw();
  });

  // Zoom controls
  const zoomToggle = document.getElementById('zoomToggle');
  const zoomControls = document.getElementById('zoomControls');
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const zoomResetBtn = document.getElementById('zoomReset');

  // Helper: Update zoom controls availability based on analytics view
  function updateZoomAvailability() {
    const analyticsActive = styleState.analyticsView !== "none";

    if (zoomToggle) {
      zoomToggle.disabled = analyticsActive;
      zoomToggle.title = analyticsActive ? t("zoomDisabledInAnalytics") : "";
    }

    if (zoomInBtn) {
      zoomInBtn.disabled = analyticsActive;
      zoomInBtn.title = analyticsActive ? t("zoomDisabledInAnalytics") : "";
    }

    if (zoomOutBtn) {
      zoomOutBtn.disabled = analyticsActive;
      zoomOutBtn.title = analyticsActive ? t("zoomDisabledInAnalytics") : "";
    }

    if (zoomResetBtn) {
      zoomResetBtn.disabled = analyticsActive;
      zoomResetBtn.title = analyticsActive ? t("zoomDisabledInAnalytics") : "";
    }
  }

  if (zoomToggle) {
    zoomToggle.addEventListener('change', () => {
      viewSettings.zoomEnabled = zoomToggle.checked;
      if (zoomControls) {
        zoomControls.style.display = zoomToggle.checked ? 'block' : 'none';
      }
      // Disable magnifier when zoom is enabled
      if (viewSettings.zoomEnabled && magnifierState.enabled) {
        magnifierState.enabled = false;
        viewSettings.magnifierEnabled = false;
        const magnifierInfo = document.getElementById('magnifierInfo');
        if (magnifierInfo) magnifierInfo.style.display = 'none';
      }
      // Reset zoom when disabled
      if (!viewSettings.zoomEnabled) {
        resetZoom();
      }
      redraw();
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      const centerX = (bounds.w || 640) / 2;
      const centerY = (bounds.h || 640) / 2;
      zoomIn(centerX, centerY);
      redraw();
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      const centerX = (bounds.w || 640) / 2;
      const centerY = (bounds.h || 640) / 2;
      zoomOut(centerX, centerY);
      redraw();
    });
  }

  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => {
      resetZoom();
      redraw();
    });
  }

  // Initialize zoom availability state after all elements are defined
  updateZoomAvailability();

  document.getElementById('shuffle').addEventListener('click', () => {
    // Stop any running intervals
    if (dragTrackInterval) {
      clearInterval(dragTrackInterval);
      dragTrackInterval = null;
    }

    const loading = document.getElementById('startLoading');
    if (loading) {
      // show a brief loading hint and run shuffle asynchronously so the UI can update
      loading.style.display = 'block';
      setTimeout(() => {
        // perform shuffle which creates fresh groups per piece
        window.__shuffle();
        // sync global view of groups
        window.__groups = listGroups();
        // reset global snapshots after shuffle
        resetGlobalSnapshots();
        const sidx = addGlobalSnapshot(listPieces());
        for (const p of listPieces()) p.snapshots = [sidx];
        // reset per-piece solved state and analytics
        for (const p of listPieces()) { p.solved = false; p.solvedAt = null; p.grabs = []; }
        // clear hover piece
        setHoverPiece(null);
        // restart timer / start over
        stopTimer(); resetTimer(); startTimer();
        redraw();
        loading.style.display = 'none';
      }, 10);
    } else {
      window.__shuffle();
      window.__groups = listGroups();
      // reset global snapshots after shuffle
      resetGlobalSnapshots();
      const sidx = addGlobalSnapshot(listPieces());
      for (const p of listPieces()) p.snapshots = [sidx];
      for (const p of listPieces()) { p.solved = false; p.solvedAt = null; p.grabs = []; }
      setHoverPiece(null);
      stopTimer(); resetTimer(); startTimer();
      redraw();
    }
  });

  document.getElementById('clear').addEventListener('click', () => {
    // Stop any running intervals
    if (dragTrackInterval) {
      clearInterval(dragTrackInterval);
      dragTrackInterval = null;
    }

    resetScene();
    window.__pieces = [];
    window.__groups = [];
    resetGlobalSnapshots();
    setHoverPiece(null);
    stopTimer();
    resetTimer();
    redraw();
  });

  // Note: Mouse wheel handling is now centralized in main.js with priority order:
  // Priority 1: Magnifier (blocks all)
  // Priority 2: Zoom (if enabled)
  // Priority 3: Rotation (if enabled and piece under mouse)
  // Priority 4: Default browser scroll

  // Egér-interakciók a globális p5 hook-okhoz
  window.__onMousePressed = () => {
    if (window.__modalOpen) return;

    const groups = window.__groups || [];

    // Convert screen to world coordinates if zoom is enabled
    let mx = mouseX;
    let my = mouseY;
    if (viewSettings.zoomEnabled) {
      const worldCoords = screenToWorld(mouseX, mouseY);
      mx = worldCoords.x;
      my = worldCoords.y;
    }

    const hitPiece = findPieceAt(mx, my);
    if (hitPiece) {
      // record which piece was under the pointer for later wrong-link detection
      window.__draggedPiece = hitPiece;
    } else {
      window.__draggedPiece = null;
    }

    // If connections view is active, allow selecting by clicking the fixed node (target center)
    if (styleState.analyticsView === 'connections') {
        try {
          // compute target centers and also current displayed centers as fallback
          const { originX, originY, W, H, s } = gridRectScaled(bounds.w || 640, bounds.h || 640);
          let found = null;
          const hitRadius = 20; // allow a slightly larger hit area for easier selection
          for (const p of listPieces()) {
            if (!p) continue;
            const tx = originX + (p.meta.x - puzzleMeta.minX) * s + (p.sw || 0) / 2;
            const ty = originY + (p.meta.y - puzzleMeta.minY) * s + (p.sh || 0) / 2;
            const d = Math.hypot(mouseX - tx, mouseY - ty);
            if (d < hitRadius) { found = p; break; }
            // fallback: allow clicking the currently displayed center (in case pieceScale changed)
            const dx = mouseX - (p.x + p.sw/2);
            const dy = mouseY - (p.y + p.sh/2);
            if (Math.hypot(dx, dy) < hitRadius) { found = p; break; }
          }
        if (found) {
          connectionsState.selected = found.index;
          connectionsState.snapshotIdx = (found.snapshots && found.snapshots.length - 1) || 0;
          updateConnectionsUI();
          redraw();
          return;
        }
      } catch (_) {}
      // don't start dragging when connections view is active
      return;
    }
    // start per-piece grab only when analytics view allows normal interaction
    if (hitPiece && styleState.analyticsView === "none") startGrabAt(hitPiece, mx, my);
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      if (window.__groupAlphaHit(g, mx, my)) {
        groups.push(groups.splice(gi, 1)[0]);
        window.__dragging = g;
        const c = g.getCenter();
        window.__dragDX = mx - c.cx;
        window.__dragDY = my - c.cy;
        // if a whole group is grabbed, mark the member piece closest to the
        // pointer as the dragged piece for wrong-link detection
        try {
          let closest = null;
          let cd = Infinity;
          for (const m of g.members) {
            const dx = (m.x + m.sw/2) - mx;
            const dy = (m.y + m.sh/2) - my;
            const d = Math.hypot(dx, dy);
            if (d < cd) { cd = d; closest = m; }
          }
          if (closest) window.__draggedPiece = closest;
        } catch (_) {}

        // Start tracking drag path - record position every 150ms
        if (dragTrackInterval) clearInterval(dragTrackInterval);
        dragTrackInterval = setInterval(() => {
          if (window.__dragging) {
            try {
              const snapIdx = addGlobalSnapshot(listPieces());
              for (const p of listPieces()) {
                if (!p) continue;
                p.snapshots = p.snapshots || [];
                p.snapshots.push(snapIdx);
              }
            } catch (_) {}
          }
        }, 150); // 150ms = ~7 snapshots/second for smooth professional curves

        redraw();
        return;
      }
    }
    window.__dragging = null;
  };

  window.__onMouseDragged = () => {
    if (window.__modalOpen) return;
    const g = window.__dragging;
    if (!g) return;

    // Convert screen to world coordinates if zoom is enabled
    let mx = mouseX;
    let my = mouseY;
    if (viewSettings.zoomEnabled) {
      const worldCoords = screenToWorld(mouseX, mouseY);
      mx = worldCoords.x;
      my = worldCoords.y;
    }

    const c = g.getCenter();
    const targetCX = mx - window.__dragDX, targetCY = my - window.__dragDY;
    g.move(targetCX - c.cx, targetCY - c.cy, window.__clampPiece);
    redraw();
  };

  window.__onMouseReleased = () => {
    if (window.__modalOpen) return;

    // Stop drag tracking interval
    if (dragTrackInterval) {
      clearInterval(dragTrackInterval);
      dragTrackInterval = null;
    }

    if (styleState.analyticsView === "none") finishGrab();
    const g = window.__dragging;
    if (!g) return;

    if (document.getElementById('snapToggle').checked) {
      const threshold = (parseInt(document.getElementById('snapPct').value,10) / 100) * 0.5 * (averagePieceDiagonal());
      for (const p of g.members) {
        // Only snap if correct orientation (when rotation enabled)
        if (gameSettings.rotationEnabled && !p.isCorrectOrientation()) {
          continue;
        }

        const tgt = window.__targetTopLeft(p);
        const d = Math.hypot((p.x - tgt.x), (p.y - tgt.y));
        if (d < threshold) {
          p.moveTo(tgt.x, tgt.y);
          if (!p.solved) p.solvedAt = timerState.elapsed;
          p.solved = true;
        }
      }
    }
    for (const p of g.members) if (p.solved) mergeWithSolvedNeighbors(p);
    // try merging with neighboring groups/pieces even if not placed in final target
    tryMergeGroupsOnRelease(g);

    // record a global snapshot after the release/move so connections can reference it
    try {
      const snapIdx = addGlobalSnapshot(listPieces());
      // register this snapshot for all pieces so any selected piece's slider
      // can step through the same global timeline (even if the piece itself
      // wasn't physically moved in this step)
      for (const p of listPieces()) {
        if (!p) continue;
        p.snapshots = p.snapshots || [];
        p.snapshots.push(snapIdx);
      }
    } catch (_) {}

    // Check if puzzle is completed
    if (isPuzzleSolved()) {
      stopTimer();
      // Track game completion for statistics
      if (currentGameId) {
        recordGameComplete(currentGameId);
        currentGameId = null; // Reset for next game
      }
    }

    window.__dragging = null; redraw();
  };

  // P5 helper-eket a window-ra tesszĂĽk, hogy a main hozzĂˇfĂ©rjen
  window.__drawPiece = drawPiece;
}





