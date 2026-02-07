﻿import { styleState, resetScene, setPuzzleMeta, setPuzzleGrid, registerPiece, newGroup, listGroups, listPieces, puzzleGrid, timerState } from "../canvas/state.js";
import { drawPiece } from "../canvas/draw.js";
import { PuzzlePiece } from "../canvas/piece.js";
import { Group } from "../canvas/group.js";
import { clampPiece, averagePieceDiagonal, mergeWithSolvedNeighbors } from "../canvas/interaction.js";
import { uploadPuzzle } from "../api/client.js";
import { initI18n, t, getLang, applyTranslations } from "./i18n.js";

const galleryItems = [
  {
    id: "forest",
    title: { hu: "Erdei táj", en: "Forest landscape" },
    preview: "/public/gallery/forest/preview.png",
    sizes: {
      "2x2": { image: "/public/gallery/forest/2x2/image.png", mask: "/public/gallery/forest/2x2/mask.png" },
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
    if (styleState.heatmap && puzzleGrid.rows === 2 && puzzleGrid.cols === 2) redraw();
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
  return styleState.heatmap && ((puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6));
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
  if (heatmapExport) heatmapExport.disabled = !canExportHeatmap();

  let idx = 0;
  for (const item of data.pieces) {
    const img = await new Promise((ok, err) => loadImage('data:image/png;base64,' + item.b64, ok, err));
    const p = new PuzzlePiece(img, 0, 0, item.r, item.c, idx++, { x:item.x, y:item.y, w:item.w, h:item.h });
    p.x = Math.random() * Math.max(1, width - p.sw);
    p.y = Math.random() * Math.max(1, height - p.sh);
    registerPiece(p);
    const g = new Group(p);
    newGroup(g);
  }

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
  const heatmapToggle = document.getElementById('heatmapToggle');
  if (heatmapToggle) {
    styleState.heatmap = heatmapToggle.checked;
    heatmapToggle.addEventListener('change', () => {
      styleState.heatmap = heatmapToggle.checked;
      redraw();
    });
  }
  const heatmapExport = document.getElementById('heatmapExport');
  if (heatmapExport) {
    const updateExportState = () => {
      heatmapExport.disabled = !canExportHeatmap();
    };
    updateExportState();
    heatmapToggle?.addEventListener('change', updateExportState);
    heatmapExport.addEventListener('click', () => {
      if (!canExportHeatmap()) {
        alert(t("heatmapExportUnavailable"));
        return;
      }
      const svg = buildHeatmapSvg(puzzleGrid.rows, puzzleGrid.cols, listPieces(), timerState.elapsed);
      downloadSvg(`heatmap-${puzzleGrid.rows}x${puzzleGrid.cols}.svg`, svg);
    });
  }

  document.getElementById('openGallery').addEventListener('click', () => {
    stopTimer();
    resetTimer();
    setStartScreenVisible(true);
  });
  document.getElementById('startGame').addEventListener('click', startPuzzleFromGallery);

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTranslations();
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
    window.__shuffle();
  });

  document.getElementById('clear').addEventListener('click', () => {
    resetScene();
    window.__pieces = [];
    window.__groups = [];
    stopTimer();
    resetTimer();
    redraw();
  });

  // EgĂ©r-interakciĂłk a globĂˇlis p5 hook-okhoz
  window.__onMousePressed = () => {
    const groups = window.__groups || [];
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      if (window.__groupAlphaHit(g, mouseX, mouseY)) {
        groups.push(groups.splice(gi, 1)[0]);
        window.__dragging = g;
        const c = g.getCenter();
        window.__dragDX = mouseX - c.cx;
        window.__dragDY = mouseY - c.cy;
        redraw();
        return;
      }
    }
    window.__dragging = null;
  };

  window.__onMouseDragged = () => {
    const g = window.__dragging;
    if (!g) return;
    const c = g.getCenter();
    const targetCX = mouseX - window.__dragDX, targetCY = mouseY - window.__dragDY;
    g.move(targetCX - c.cx, targetCY - c.cy, window.__clampPiece);
    redraw();
  };

  window.__onMouseReleased = () => {
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
    if (isPuzzleSolved()) stopTimer();
    window.__dragging = null; redraw();
  };

  // P5 helper-eket a window-ra tesszĂĽk, hogy a main hozzĂˇfĂ©rjen
  window.__drawPiece = drawPiece;
}






