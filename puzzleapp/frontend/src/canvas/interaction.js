import { gridRectScaled } from "../ui/layout.js";
import { styleState, puzzleMeta, listPieces, listGroups, replaceGroups } from "./state.js";

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

export function groupAlphaHit(g, px, py) {
  const b = g.getBounds();
  if (px < b.x || py < b.y || px > b.x + b.w || py > b.y + b.h) return false;
  const arr = Array.from(g.members);
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].hit(px, py)) return true;
  return false;
}

export function averagePieceDiagonal() {
  const pieces = listPieces();
  if (!pieces.length) return 100;
  const ds = pieces.map(p => Math.hypot(p.sw, p.sh)).sort((a,b)=>a-b);
  return ds[Math.floor(ds.length/2)] || 100;
}

export function mergeWithSolvedNeighbors(piece) {
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
  pieces.forEach(p => p.solved = false);
  for (const p of pieces) groups.push(newGroupFactory(p));
  for (const g of groups) {
    const b = g.getBounds();
    const dx = Math.random() * Math.max(1, width - b.w) - (b.x);
    const dy = Math.random() * Math.max(1, height - b.h) - (b.y);
    g.move(dx, dy, clampPiece);
  }
  replaceGroups(groups);
}
