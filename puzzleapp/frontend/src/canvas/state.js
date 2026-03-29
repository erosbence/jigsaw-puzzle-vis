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

// Paths view state – which piece(s) are selected for path display (max 2)
// selected: array of piece indices (0-2 elements)
export let pathsState = { selected: [], colormap: 'viridis' };

// Piece-to-piece interaction matrix for adjacency visualization
// Structure: { [fromIndex]: { [toIndex]: count } }
// Example: { 0: { 1: 3, 2: 1 }, 1: { 0: 2, 3: 5 } }
// Means: piece 0 was grabbed, then piece 1 was grabbed (3 times), piece 2 (1 time), etc.
export let pieceInteractionMatrix = {};

export const styleState = { outline: true, outlineW: 1, shadow: false, shadowI: 35, pieceScale: 0.40, analyticsView: "none" };

// Game settings
export const gameSettings = { rotationEnabled: false, rotationPercentage: 100 };

// Zoom settings
export const viewSettings = { 
  zoomEnabled: false,      // Is zoom mode active
  imageHintEnabled: false  // Show faded image overlay on grid
};

export function setImageHintEnabled(enabled) {
  viewSettings.imageHintEnabled = enabled;
}

// Completion celebration state
export const completionState = {
  isComplete: false,      // Is puzzle solved
  showingComplete: false  // Is showing complete image
};

export function setPuzzleComplete(complete) {
  completionState.isComplete = complete;
}

export function setShowingComplete(showing) {
  completionState.showingComplete = showing;
}

// Hover piece for rotation (mouse wheel control)
export let hoverPiece = null;
export function setHoverPiece(p) { hoverPiece = p; }

// Adjacency matrix hover state (for color preview and RGB map)
// piece: hovered piece (from label)
// isRow: true if row label, false if column label, null if cell
// cellRow, cellCol: if hovering over a cell, the row and column indices
export let matrixHoverState = { piece: null, isRow: null, x: 0, y: 0, cellRow: null, cellCol: null };
export function setMatrixHoverState(piece, isRow, x, y, cellRow = null, cellCol = null) {
  matrixHoverState = { piece, isRow, x, y, cellRow, cellCol };
}

// RGB color map projection state (which 2D projection to show: 0=RG, 1=RB, 2=GB)
export let rgbMapProjection = 0;
export function setRGBMapProjection(index) {
  rgbMapProjection = index % 3;
}
export function cycleRGBMapProjection() {
  rgbMapProjection = (rgbMapProjection + 1) % 3;
}

// RGB map button positions (set by drawRGBColorMap, checked in mousePressed)
export let rgbButtonPositions = { 
  leftX: 0, leftY: 0, 
  rightX: 0, rightY: 0, 
  size: 0,
  visible: false 
};
export function setRGBButtonPositions(leftX, leftY, rightX, rightY, size) {
  rgbButtonPositions = { leftX, leftY, rightX, rightY, size, visible: true };
}
export function clearRGBButtonPositions() {
  rgbButtonPositions.visible = false;
}

// Matrix grouping state (true = group by corner/edge/center, false = sort by color only)
export let matrixGroupingEnabled = true;
export let matrixCurrentOrder = []; // Current piece order (for animation)

export function setMatrixCurrentOrder(order) {
  matrixCurrentOrder = [...order];
}

export function toggleMatrixGrouping() {
  matrixGroupingEnabled = !matrixGroupingEnabled;
  // Animation will be triggered in drawAdjacencyMatrix when it detects the change
}
export function getMatrixGroupingEnabled() {
  return matrixGroupingEnabled;
}

// Matrix grouping button position (set by drawAdjacencyMatrix, checked in mousePressed)
export let matrixGroupingButtonPos = {
  x: 0, y: 0, w: 0, h: 0, visible: false
};
export function setMatrixGroupingButtonPos(x, y, w, h) {
  matrixGroupingButtonPos = { x, y, w, h, visible: true };
}
export function clearMatrixGroupingButtonPos() {
  matrixGroupingButtonPos.visible = false;
}

// Matrix animation state for smooth transitions when toggling grouping
export let matrixAnimationState = {
  animating: false,
  startTime: 0,
  duration: 800, // ms
  oldOrder: [], // Array of piece indices in old order
  newOrder: []  // Array of piece indices in new order
};
export function startMatrixAnimation(oldOrder, newOrder) {
  matrixAnimationState = {
    animating: true,
    startTime: Date.now(),
    duration: 800,
    oldOrder: [...oldOrder],
    newOrder: [...newOrder]
  };
}
export function stopMatrixAnimation() {
  matrixAnimationState.animating = false;
}
export function getMatrixAnimationProgress() {
  if (!matrixAnimationState.animating) return 1.0;
  const elapsed = Date.now() - matrixAnimationState.startTime;
  const progress = Math.min(1.0, elapsed / matrixAnimationState.duration);
  if (progress >= 1.0) {
    stopMatrixAnimation();
  }
  return progress;
}

export function resetScene() { 
  pieces = []; 
  groups = []; 
  puzzleGrid = { rows: 0, cols: 0 }; 
  completionState.isComplete = false;
  completionState.showingComplete = false;
}
export function setPuzzleMeta(meta) { puzzleMeta = meta; }
export function setPuzzleGrid(rows, cols) { puzzleGrid = { rows, cols }; }
export function setCanvasSize(w, h) { bounds.w = w; bounds.h = h; }

export function registerPiece(p) { pieces.push(p); }
export function newGroup(g) { groups.push(g); }
export function listGroups() { return groups; }
export function listPieces() { return pieces; }
export function replaceGroups(arr) { groups = arr; }

// Paths view helpers
export function togglePathsPiece(index) {
  const idx = pathsState.selected.indexOf(index);
  if (idx >= 0) {
    // Already selected – deselect
    pathsState.selected.splice(idx, 1);
  } else {
    // Add; if already 2 selected, remove the oldest
    if (pathsState.selected.length >= 2) pathsState.selected.shift();
    pathsState.selected.push(index);
  }
}
export function clearPathsSelection() {
  pathsState.selected = [];
}
// Átmenetileg ezt a vizut kivezetjük amíg alaposabban meg nem tervezzük
// A funkciók megmaradnak no-op formában, hogy a hívások ne dobjanak hibát.
export function registerWrongLink(a, b, t) { /* intentionally disabled */ }
export function listWrongLinks() { return []; }
export function clearWrongLinks() { /* intentionally disabled */ }

export function addGlobalSnapshot(piecesArr, layout) {
  // Adaptive throttle: skip recordings when snapshot count is very high
  if (globalSnapshots.length > 2000) {
    addGlobalSnapshot._skipCounter = (addGlobalSnapshot._skipCounter || 0) + 1;
    const skipRate = globalSnapshots.length > 4000 ? 4 : 2;
    if (addGlobalSnapshot._skipCounter % skipRate !== 0) {
      return globalSnapshots.length - 1; // return last valid index
    }
  }

  // Build a fast group→id lookup (avoids O(groups) indexOf per piece)
  const groupMap = new Map();
  for (let gi = 0; gi < groups.length; gi++) {
    groupMap.set(groups[gi], gi + 1);
  }

  const snapOriginX = (layout && layout.originX != null) ? layout.originX : null;
  const snapOriginY = (layout && layout.originY != null) ? layout.originY : null;
  const snapS      = (layout && layout.s      != null) ? layout.s      : null;

  const positions = {};
  for (const p of piecesArr || []) {
    if (!p || typeof p.index === 'undefined') continue;
    positions[p.index] = {
      x: p.x + (p.sw || 0) / 2,
      y: p.y + (p.sh || 0) / 2,
      sw: p.sw || 0,
      sh: p.sh || 0,
      metaX: (p.meta && p.meta.x) || 0,
      metaY: (p.meta && p.meta.y) || 0,
      groupId: (p.group && groupMap.get(p.group)) || null,
      snapOriginX,
      snapOriginY,
      snapS
    };
  }
  const idx = globalSnapshots.length;
  globalSnapshots.push({ t: Date.now(), positions });
  return idx;
}

export function resetGlobalSnapshots() { globalSnapshots = []; }

// Piece interaction matrix management
export function recordPieceInteraction(fromPieceIndex, toPieceIndex) {
  if (typeof fromPieceIndex === 'undefined' || typeof toPieceIndex === 'undefined') return;
  if (fromPieceIndex === toPieceIndex) return; // Don't record self-interactions

  if (!pieceInteractionMatrix[fromPieceIndex]) {
    pieceInteractionMatrix[fromPieceIndex] = {};
  }

  if (!pieceInteractionMatrix[fromPieceIndex][toPieceIndex]) {
    pieceInteractionMatrix[fromPieceIndex][toPieceIndex] = 0;
  }

  pieceInteractionMatrix[fromPieceIndex][toPieceIndex]++;
}

export function getPieceInteractionMatrix() {
  return pieceInteractionMatrix;
}

export function resetPieceInteractionMatrix() {
  pieceInteractionMatrix = {};
}

// expose helpers on window for modules that prefer a global hook
if (typeof window !== 'undefined') {
  // Átmenetileg ezt a vizut kivezetjük amíg alaposabban meg nem tervezzük
  // Globális hook-ok no-op implementációi, hogy a meglévő hívások ne szakadjanak meg.
  window.__registerWrongLink = registerWrongLink;
  window.__listWrongLinks = listWrongLinks;
  window.__clearWrongLinks = clearWrongLinks;
}
