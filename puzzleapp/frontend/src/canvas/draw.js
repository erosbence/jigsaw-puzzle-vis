import { gridRectScaled } from "../ui/layout.js";
import { styleState, puzzleMeta } from "./state.js";

export function drawBackground(width, height) {
  background(245);
  if (puzzleMeta.maxX > puzzleMeta.minX && puzzleMeta.maxY > puzzleMeta.minY) {
    const { originX, originY, W, H } = gridRectScaled(width, height);
    push(); noFill(); stroke(225); strokeWeight(2);
    rect(originX + .5, originY + .5, W, H, 6); pop();
  }
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
