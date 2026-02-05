﻿import { styleState, resetScene, setPuzzleMeta, registerPiece, newGroup, listGroups } from "../canvas/state.js";
import { drawPiece, drawBackground } from "../canvas/draw.js";
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
      "5x5": { image: "/public/gallery/forest/5x5/image.png", mask: "/public/gallery/forest/5x5/mask.png" },
      "10x10": { image: "/public/gallery/forest/10x10/image.png", mask: "/public/gallery/forest/10x10/mask.png" }
    }
  },
  {
    id: "city",
    title: { hu: "Városi fények", en: "City lights" },
    preview: "/public/gallery/city/preview.png",
    sizes: {
      "2x2": { image: "/public/gallery/city/2x2/image.png", mask: "/public/gallery/city/2x2/mask.png" },
      "5x5": { image: "/public/gallery/city/5x5/image.png", mask: "/public/gallery/city/5x5/mask.png" }
    }
  }
];

let selectedItemId = null;
let selectedSize = null;

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

  document.getElementById('openGallery').addEventListener('click', () => {
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
        if (d < threshold) { p.moveTo(tgt.x, tgt.y); p.solved = true; }
      }
    }
    for (const p of g.members) if (p.solved) mergeWithSolvedNeighbors(p);
    window.__dragging = null; redraw();
  };

  // P5 helper-eket a window-ra tesszĂĽk, hogy a main hozzĂˇfĂ©rjen
  window.__drawPiece = drawPiece;
}





