import { wireControls } from "./ui/controls.js";
import { drawBackground, drawPiece, drawHeatmap, drawGrabPoints, drawConnections, drawMovementPaths } from "./canvas/draw.js";
import { styleState, setCanvasSize, puzzleGrid, timerState, listPieces, setHoverPiece, gameSettings } from "./canvas/state.js";
import { clampPiece, groupAlphaHit, targetTopLeft, shufflePieces } from "./canvas/interaction.js";
import { Group } from "./canvas/group.js";

function canvasHostSize() {
  const host = document.getElementById('canvasHost');
  return { w: host.clientWidth, h: host.clientHeight };
}

window.setup = function () {
  const { w, h } = canvasHostSize();
  setCanvasSize(w, h);
  createCanvas(w, h).parent('canvasHost');
  pixelDensity(1); background(245); noLoop();

  // Globális horgok
  window.__clampPiece = (p) => { clampPiece(p); };
  window.__groupAlphaHit = (g, x, y) => groupAlphaHit(g, x, y);
  window.__targetTopLeft  = (p) => targetTopLeft(p);
  window.__shuffle = () => shufflePieces((p) => new Group(p));
  window.__pieces = []; window.__groups = [];
  window.__dragging = null; window.__dragDX = 0; window.__dragDY = 0;

  wireControls();

  const resizeCanvasToHost = () => {
    const { w: nw, h: nh } = canvasHostSize();
    setCanvasSize(nw, nh);
    resizeCanvas(nw, nh);
    redraw();
  };

  const ro = new ResizeObserver(() => resizeCanvasToHost());
  ro.observe(document.getElementById('canvasHost'));

  window.addEventListener('resize', resizeCanvasToHost);
};

window.draw = function () {
  // Update rotation animations only for pieces that are animating
  let needsRedraw = false;
  for (const piece of listPieces()) {
    if (piece.updateRotationAnimation && piece.isAnimating()) {
      piece.updateRotationAnimation();
      if (piece.isAnimating()) needsRedraw = true;
    }
  }

  drawBackground(width, height);
  if (styleState.analyticsView === "heatmap" && ((puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6))) {
    drawHeatmap(width, height, puzzleGrid.rows, puzzleGrid.cols, listPieces(), timerState.elapsed);
    if (needsRedraw) setTimeout(() => redraw(), 16); // ~60fps
    return;
  }
  if (styleState.analyticsView === "grabs") {
    drawGrabPoints(width, height, listPieces());
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }
  if (styleState.analyticsView === "connections") {
    drawConnections(width, height, listPieces());
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }
  if (styleState.analyticsView === "paths") {
    drawMovementPaths(width, height, listPieces());
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }
  for (const g of (window.__groups || [])) g.draw(window.__drawPiece || drawPiece);

  // Continue animation if needed - use setTimeout to ensure continuous animation
  if (needsRedraw) {
    setTimeout(() => redraw(), 16); // ~60fps (1000ms / 60 = 16.67ms)
  }
};

window.mousePressed = () => window.__onMousePressed && window.__onMousePressed();
window.mouseDragged = () => window.__onMouseDragged && window.__onMouseDragged();
window.mouseReleased = () => window.__onMouseReleased && window.__onMouseReleased();
// Throttle mouseMoved to reduce CPU usage
let lastMouseMoveTime = 0;
const MOUSE_MOVE_THROTTLE = 100; // ms - increased for better 6x6 performance

window.mouseMoved = () => {
  const now = Date.now();
  if (now - lastMouseMoveTime < MOUSE_MOVE_THROTTLE) return;
  lastMouseMoveTime = now;

  // Update hover piece for rotation (if rotation is enabled and not in analytics view)
  if (gameSettings.rotationEnabled && styleState.analyticsView === "none" && window.__findPieceAt) {
    const hitPiece = window.__findPieceAt(mouseX, mouseY);
    setHoverPiece(hitPiece);
    redraw();
  } else if (styleState.analyticsView === "paths") {
    // Redraw when mouse moves in paths view to show hover effects
    redraw();
  }
};
