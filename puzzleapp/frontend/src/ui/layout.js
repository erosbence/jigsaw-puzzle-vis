import { styleState, puzzleMeta } from "../canvas/state.js";

export const CANVAS_W = (() => {
  const b = () => document.getElementById('board');
  return () => b().clientWidth;
})();

export function gridRectScaled(width, height) {
  const s = styleState.pieceScale;
  const W = (puzzleMeta.maxX - puzzleMeta.minX) * s;
  const H = (puzzleMeta.maxY - puzzleMeta.minY) * s;
  const originX = Math.max(0, Math.floor((width - W) / 2));
  const originY = Math.max(0, Math.floor((height - H) / 2));
  return { originX, originY, W, H, s };
}