export const bounds = { x: 0, y: 0, w: 0, h: 0 };

export let pieces = [];      // PuzzlePiece[]
export let groups = [];      // Group[]
export let puzzleMeta = { minX:0, minY:0, maxX:0, maxY:0 };

export const styleState = { outline: true, outlineW: 1, shadow: true, shadowI: 35, pieceScale: 0.70 };

export function resetScene() { pieces = []; groups = []; }
export function setPuzzleMeta(meta) { puzzleMeta = meta; }
export function setCanvasSize(w, h) { bounds.w = w; bounds.h = h; }

export function registerPiece(p) { pieces.push(p); }
export function newGroup(g) { groups.push(g); }
export function listGroups() { return groups; }
export function listPieces() { return pieces; }
export function replaceGroups(arr) { groups = arr; }
