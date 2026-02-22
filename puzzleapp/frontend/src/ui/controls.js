import { styleState, resetScene, setPuzzleMeta, setPuzzleGrid, registerPiece, newGroup, listGroups, listPieces, puzzleGrid, timerState, puzzleMeta, bounds, addGlobalSnapshot, globalSnapshots, connectionsState, resetGlobalSnapshots } from "../canvas/state.js";
import { drawPiece } from "../canvas/draw.js";
import { PuzzlePiece } from "../canvas/piece.js";
import { Group } from "../canvas/group.js";
import { clampPiece, averagePieceDiagonal, mergeWithSolvedNeighbors, targetTopLeft } from "../canvas/interaction.js";
import { uploadPuzzle } from "../api/client.js";
import { initI18n, t, getLang, applyTranslations } from "./i18n.js";
import { gridRectScaled } from "./layout.js";

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

function canExportHeatmap() {
  if (styleState.analyticsView !== "heatmap" && styleState.analyticsView !== "grabs") return false;
  return (puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6);
}

function startGrabAt(piece, mx, my) {
  const u = (mx - piece.x) / piece.sw;
  const v = (my - piece.y) / piece.sh;
  const ix = Math.max(0, Math.min(piece.w - 1, Math.floor(u * piece.w)));
  const iy = Math.max(0, Math.min(piece.h - 1, Math.floor(v * piece.h)));
  activeGrab = { piece, x: ix, y: iy, start: timerState.elapsed };
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
      for (const np of pieces) {
        if (!np || np.group === g) continue;
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
  const ok = !!(selectedItemId && selectedSize);
  btn.disabled = !ok;
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

  styleState.analyticsView = "none";
  const analyticsView = document.getElementById('analyticsView');
  if (analyticsView) analyticsView.value = "none";
  const heatmapExport = document.getElementById('heatmapExport');
  if (heatmapExport) {
    heatmapExport.disabled = true;
    heatmapExport.textContent = t("heatmapExport");
  }
  redraw();
  resetTimer();
  startTimer();
  resetScene();
  window.__pieces = [];
  window.__groups = [];
  redraw();

  const loading = document.getElementById('startLoading');
  loading.style.display = 'block';
  try {
    const formData = await buildFormDataFromUrls(src.image, src.mask);
    await runPuzzleLoad(formData);
    setStartScreenVisible(false);
  } catch (err) {
    stopTimer();
    resetTimer();
    alert(t("errorPrefix") + err.message);
  } finally {
    loading.style.display = 'none';
  }
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
    } else {
      heatmapExport.textContent = t("heatmapExport");
    }
  }

  let idx = 0;
  for (const item of data.pieces) {
    const img = await new Promise((ok, err) => loadImage('data:image/png;base64,' + item.b64, ok, err));
    const p = new PuzzlePiece(img, 0, 0, item.r, item.c, idx++, { x:item.x, y:item.y, w:item.w, h:item.h });
    p.x = Math.random() * Math.max(1, width - p.sw);
    p.y = Math.random() * Math.max(1, height - p.sh);
    // initialize per-piece snapshot index list
    p.snapshots = [];
    registerPiece(p);
    const g = new Group(p);
    newGroup(g);
  }

  // create initial global snapshot and register per-piece snapshot indices
  resetGlobalSnapshots();
  const initSnap = addGlobalSnapshot(listPieces());
  for (const p of listPieces()) p.snapshots = [initSnap];

  window.__pieces = window.__pieces || [];
  window.__groups = listGroups();
  redraw();
}

export function wireControls() {
  initI18n();
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
  const analyticsView = document.getElementById('analyticsView');
  const analyticsDesc = document.getElementById('analyticsDesc');
  const updateAnalyticsDesc = () => {
    if (!analyticsDesc) return;
    if (styleState.analyticsView === "heatmap") analyticsDesc.textContent = t("analyticsDescHeatmap");
    else if (styleState.analyticsView === "grabs") analyticsDesc.textContent = t("analyticsDescGrabs");
    else if (styleState.analyticsView === "connections") analyticsDesc.textContent = t("analyticsDescConnections");
    else analyticsDesc.textContent = t("analyticsDescNone");
  };
  if (analyticsView) {
    styleState.analyticsView = analyticsView.value || "none";
    updateAnalyticsDesc();
    analyticsView.addEventListener('change', () => {
      styleState.analyticsView = analyticsView.value || "none";
      updateAnalyticsDesc();
      updateConnectionsUI();
      redraw();
    });
  }
  // Connections view controls
  const connectionsControls = document.getElementById('connectionsControls');
  const connectionsSelectedIdx = document.getElementById('connectionsSelectedIdx');
  const connectionsSlider = document.getElementById('connectionsSlider');
  function updateConnectionsUI() {
    if (!connectionsControls) return;
    const show = styleState.analyticsView === 'connections';
    connectionsControls.style.display = show ? '' : 'none';
    if (!show) return;
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
  if (connectionsSlider) {
    connectionsSlider.addEventListener('input', () => {
      connectionsState.snapshotIdx = parseInt(connectionsSlider.value, 10) || 0;
      redraw();
    });
  }
  // initialize connections UI visibility
  updateConnectionsUI();
  const heatmapExport = document.getElementById('heatmapExport');
  if (heatmapExport) {
    const updateExportState = () => {
      heatmapExport.disabled = !canExportHeatmap();
      if (styleState.analyticsView === "heatmap") {
        heatmapExport.textContent = t("exportHeatmapLabel");
      } else if (styleState.analyticsView === "grabs") {
        heatmapExport.textContent = t("exportGrabsLabel");
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
        setStartScreenVisible(true);
      });
      return;
    }
    stopTimer();
    resetTimer();
    setStartScreenVisible(true);
  });

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
  document.getElementById('startGame').addEventListener('click', startPuzzleFromGallery);

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTranslations();
      window.__grabTooltipLabels = { time: t("grabTimeLabel"), duration: t("grabDurationLabel") };
      const heatmapExport = document.getElementById('heatmapExport');
      if (heatmapExport) {
        if (styleState.analyticsView === "heatmap") {
          heatmapExport.textContent = t("exportHeatmapLabel");
        } else if (styleState.analyticsView === "grabs") {
          heatmapExport.textContent = t("exportGrabsLabel");
        } else {
          heatmapExport.textContent = t("heatmapExport");
        }
      }
      const analyticsDesc = document.getElementById('analyticsDesc');
      if (analyticsDesc) {
        if (styleState.analyticsView === "heatmap") analyticsDesc.textContent = t("analyticsDescHeatmap");
        else if (styleState.analyticsView === "grabs") analyticsDesc.textContent = t("analyticsDescGrabs");
        else analyticsDesc.textContent = t("analyticsDescNone");
      }
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
  document.getElementById('shadowToggle').addEventListener('change', () => { styleState.shadow  = document.getElementById('shadowToggle').checked; redraw(); });

  const ow = document.getElementById('outlineWidth');
  const oi = document.getElementById('shadowIntensity');
  const ps = document.getElementById('pieceScaleRange');

  ow.addEventListener('input', () => {
    styleState.outlineW = parseInt(ow.value,10);
    document.getElementById('outlineWidthLbl').textContent = `${styleState.outlineW}px`;
    redraw();
  });

  oi.addEventListener('input', () => {
    styleState.shadowI = parseInt(oi.value,10);
    document.getElementById('shadowIntensityLbl').textContent = `${styleState.shadowI}%`;
    redraw();
  });

  ps.addEventListener('input', () => {
    styleState.pieceScale = parseInt(ps.value,10) / 100;
    document.getElementById('pieceScaleLbl').textContent = `${Math.round(styleState.pieceScale*100)}%`;
    for (const p of window.__pieces) if (p.solved) p.moveToTarget(); else clampPiece(p);
    redraw();
  });

  document.getElementById('shuffle').addEventListener('click', () => {
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
      stopTimer(); resetTimer(); startTimer();
      redraw();
    }
  });

  document.getElementById('clear').addEventListener('click', () => {
    resetScene();
    window.__pieces = [];
    window.__groups = [];
    resetGlobalSnapshots();
    stopTimer();
    resetTimer();
    redraw();
  });

  // EgĂ©r-interakciĂłk a globĂˇlis p5 hook-okhoz
  window.__onMousePressed = () => {
    if (window.__modalOpen) return;
    const groups = window.__groups || [];
    const hitPiece = findPieceAt(mouseX, mouseY);
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
    if (hitPiece && styleState.analyticsView === "none") startGrabAt(hitPiece, mouseX, mouseY);
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      if (window.__groupAlphaHit(g, mouseX, mouseY)) {
        groups.push(groups.splice(gi, 1)[0]);
        window.__dragging = g;
        const c = g.getCenter();
        window.__dragDX = mouseX - c.cx;
        window.__dragDY = mouseY - c.cy;
        // if a whole group is grabbed, mark the member piece closest to the
        // pointer as the dragged piece for wrong-link detection
        try {
          let closest = null;
          let cd = Infinity;
          for (const m of g.members) {
            const dx = (m.x + m.sw/2) - mouseX;
            const dy = (m.y + m.sh/2) - mouseY;
            const d = Math.hypot(dx, dy);
            if (d < cd) { cd = d; closest = m; }
          }
          if (closest) window.__draggedPiece = closest;
        } catch (_) {}
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
    const c = g.getCenter();
    const targetCX = mouseX - window.__dragDX, targetCY = mouseY - window.__dragDY;
    g.move(targetCX - c.cx, targetCY - c.cy, window.__clampPiece);
    redraw();
  };

  window.__onMouseReleased = () => {
    if (window.__modalOpen) return;
    if (styleState.analyticsView === "none") finishGrab();
    const g = window.__dragging;
    if (!g) return;

    if (document.getElementById('snapToggle').checked) {
      const threshold = (parseInt(document.getElementById('snapPct').value,10) / 100) * 0.5 * (averagePieceDiagonal());
      for (const p of g.members) {
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
    if (isPuzzleSolved()) stopTimer();
    window.__dragging = null; redraw();
  };

  // P5 helper-eket a window-ra tesszĂĽk, hogy a main hozzĂˇfĂ©rjen
  window.__drawPiece = drawPiece;
}





