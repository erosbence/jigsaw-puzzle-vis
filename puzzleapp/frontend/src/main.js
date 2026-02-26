import { wireControls } from "./ui/controls.js";
import { drawBackground, drawPiece, drawHeatmap, drawGrabPoints, drawConnections, drawMovementPaths } from "./canvas/draw.js";
import { styleState, setCanvasSize, puzzleGrid, timerState, listPieces } from "./canvas/state.js";
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
  drawBackground(width, height);
  if (styleState.analyticsView === "heatmap" && ((puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6))) {
    drawHeatmap(width, height, puzzleGrid.rows, puzzleGrid.cols, listPieces(), timerState.elapsed);
    return;
  }
  if (styleState.analyticsView === "grabs") {
    drawGrabPoints(width, height, listPieces());
    return;
  }
  if (styleState.analyticsView === "connections") {
    drawConnections(width, height, listPieces());
    return;
  }
  if (styleState.analyticsView === "paths") {
    drawMovementPaths(width, height, listPieces());
    return;
  }
  for (const g of (window.__groups || [])) g.draw(window.__drawPiece || drawPiece);
};

window.mousePressed = () => window.__onMousePressed && window.__onMousePressed();
window.mouseDragged = () => window.__onMouseDragged && window.__onMouseDragged();
window.mouseReleased = () => window.__onMouseReleased && window.__onMouseReleased();
window.mouseMoved = () => {
  // Redraw when mouse moves in paths view to show hover effects
  if (styleState.analyticsView === "paths") {
    redraw();
  }
};
