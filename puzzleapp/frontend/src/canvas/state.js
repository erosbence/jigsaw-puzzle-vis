export const bounds = { x: 0, y: 0, w: 0, h: 0 };

export let pieces = [];      // PuzzlePiece[]
export let groups = [];      // Group[]
export let puzzleMeta = { minX:0, minY:0, maxX:0, maxY:0 };
export let puzzleGrid = { rows: 0, cols: 0 };
export const timerState = { elapsed: 0, running: false };
export let wrongLinks = []; // {a: pieceIndex, b: pieceIndex, t: timeMs}

// Global snapshots of piece positions captured on release events
// Each snapshot: { t: number, positions: { [index]: { x, y } } }
export let globalSnapshots = [];

// Connections view state (which piece selected, which snapshot index for that piece)
export let connectionsState = { selected: null, snapshotIdx: 0 };

export const styleState = { outline: true, outlineW: 1, shadow: false, shadowI: 35, pieceScale: 0.40, analyticsView: "none" };

// Game settings
export const gameSettings = { rotationEnabled: false, rotationPercentage: 100 };

// Zoom settings
export const viewSettings = { 
  zoomEnabled: false      // Is zoom mode active
};

// Hover piece for rotation (mouse wheel control)
export let hoverPiece = null;
export function setHoverPiece(p) { hoverPiece = p; }

export function resetScene() { pieces = []; groups = []; puzzleGrid = { rows: 0, cols: 0 }; }
export function setPuzzleMeta(meta) { puzzleMeta = meta; }
export function setPuzzleGrid(rows, cols) { puzzleGrid = { rows, cols }; }
export function setCanvasSize(w, h) { bounds.w = w; bounds.h = h; }

export function registerPiece(p) { pieces.push(p); }
export function newGroup(g) { groups.push(g); }
export function listGroups() { return groups; }
export function listPieces() { return pieces; }
export function replaceGroups(arr) { groups = arr; }
// Átmenetileg ezt a vizut kivezetjük amíg alaposabban meg nem tervezzük
// A funkciók megmaradnak no-op formában, hogy a hívások ne dobjanak hibát.
export function registerWrongLink(a, b, t) { /* intentionally disabled */ }
export function listWrongLinks() { return []; }
export function clearWrongLinks() { /* intentionally disabled */ }

export function addGlobalSnapshot(piecesArr) {
  const positions = {};
  for (const p of piecesArr || []) {
    if (!p || typeof p.index === 'undefined') continue;
    // store center position plus piece display size and meta grid coord so we can normalize later
    positions[p.index] = {
      x: p.x + (p.sw || 0) / 2,
      y: p.y + (p.sh || 0) / 2,
      sw: p.sw || 0,
      sh: p.sh || 0,
      metaX: (p.meta && p.meta.x) || 0,
      metaY: (p.meta && p.meta.y) || 0,
      // include explicit group id mapping so historical snapshots can
      // accurately reflect group membership. group ids are derived from
      // the current `groups` array order at snapshot time.
      groupId: (p.group && (function(g){ try { const gi = groups.indexOf(g); return gi >= 0 ? gi + 1 : null; } catch(_) { return null; } })(p.group)) || null
    };
  }
  const idx = globalSnapshots.length;
  globalSnapshots.push({ t: Date.now(), positions });
  return idx;
}

export function resetGlobalSnapshots() { globalSnapshots = []; }

// expose helpers on window for modules that prefer a global hook
if (typeof window !== 'undefined') {
  // Átmenetileg ezt a vizut kivezetjük amíg alaposabban meg nem tervezzük
  // Globális hook-ok no-op implementációi, hogy a meglévő hívások ne szakadjanak meg.
  window.__registerWrongLink = registerWrongLink;
  window.__listWrongLinks = listWrongLinks;
  window.__clearWrongLinks = clearWrongLinks;
}
