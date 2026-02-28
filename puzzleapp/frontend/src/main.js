import { wireControls } from "./ui/controls.js";
import { drawBackground, drawPiece, drawHeatmap, drawGrabPoints, drawConnections, drawMovementPaths } from "./canvas/draw.js";
import { styleState, setCanvasSize, puzzleGrid, timerState, listPieces, setHoverPiece, gameSettings, viewSettings, puzzleMeta } from "./canvas/state.js";
import { clampPiece, groupAlphaHit, targetTopLeft, shufflePieces } from "./canvas/interaction.js";
import { Group } from "./canvas/group.js";
import { gridRectScaled } from "./ui/layout.js";
import { 
  zoomState, magnifierState, applyZoomTransform, resetZoom, 
  handleMouseWheel, startPan, updatePan, stopPan, 
  updateMagnifierPosition, drawMagnifier, screenToWorld
} from "./canvas/zoom.js";

function canvasHostSize() {
  const host = document.getElementById('canvasHost');
  return { w: host.clientWidth, h: host.clientHeight };
}

window.setup = function () {
  const { w, h } = canvasHostSize();
  setCanvasSize(w, h);
  const canvas = createCanvas(w, h).parent('canvasHost');
  pixelDensity(1); background(245); noLoop();

  // Globális horgok
  window.__clampPiece = (p) => { clampPiece(p); };
  window.__groupAlphaHit = (g, x, y) => groupAlphaHit(g, x, y);
  window.__targetTopLeft  = (p) => targetTopLeft(p);
  window.__shuffle = () => shufflePieces((p) => new Group(p));
  window.__pieces = []; window.__groups = [];
  window.__dragging = null; window.__dragDX = 0; window.__dragDY = 0;

  // Add mouse wheel listener for zoom
  canvas.elt.addEventListener('wheel', (e) => {
    if (viewSettings.zoomEnabled && !magnifierState.enabled) {
      handleMouseWheel(e, w, h);
      redraw();
    }
  }, { passive: false });

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
  // Create offscreen graphics buffer for magnifier
  if (!window.__offscreenBuffer) {
    window.__offscreenBuffer = createGraphics(width, height);
  }
  const pg = window.__offscreenBuffer;
  pg.clear();

  // Update rotation animations only for pieces that are animating
  let needsRedraw = false;
  for (const piece of listPieces()) {
    if (piece.updateRotationAnimation && piece.isAnimating()) {
      piece.updateRotationAnimation();
      if (piece.isAnimating()) needsRedraw = true;
    }
  }

  // Draw to offscreen buffer (for magnifier support)
  const drawToBuffer = (buffer) => {
    buffer.push();

    // Apply zoom transformation if enabled
    if (viewSettings.zoomEnabled && !magnifierState.enabled) {
      buffer.translate(zoomState.offsetX, zoomState.offsetY);
      buffer.scale(zoomState.scale);
    }

    buffer.background(245);

    // Draw grid background
    if (puzzleMeta.maxX > puzzleMeta.minX && puzzleMeta.maxY > puzzleMeta.minY) {
      const { originX, originY, W, H } = gridRectScaled(buffer.width, buffer.height);
      buffer.push(); 
      buffer.noFill(); 
      buffer.stroke(225); 
      buffer.strokeWeight(2);
      buffer.rect(originX + .5, originY + .5, W, H, 6); 
      buffer.pop();
    }

    // Draw analytics views or pieces
    if (styleState.analyticsView === "heatmap" && ((puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6))) {
      // Note: drawHeatmap needs to be updated to accept buffer parameter
      // For now, skip analytics in zoom mode
    } else if (styleState.analyticsView === "grabs") {
      // drawGrabPoints(buffer.width, buffer.height, listPieces());
    } else if (styleState.analyticsView === "connections") {
      // drawConnections(buffer.width, buffer.height, listPieces());
    } else if (styleState.analyticsView === "paths") {
      // drawMovementPaths(buffer.width, buffer.height, listPieces());
    } else {
      // Draw pieces normally
      for (const g of (window.__groups || [])) {
        for (const piece of Array.from(g.members)) {
          const s = styleState;
          buffer.push();

          // Position and rotation
          buffer.translate(piece.x + piece.sw / 2, piece.y + piece.sh / 2);
          buffer.rotate(((piece.rotation || 0) * Math.PI) / 180);
          buffer.translate(-piece.sw / 2, -piece.sh / 2);

          // Shadow
          if (s.shadow) {
            buffer.push();
            buffer.tint(0, 0, 0, s.shadowI);
            buffer.image(piece.img, 3, 3, piece.sw, piece.sh);
            buffer.pop();
          }

          // Main image
          buffer.image(piece.img, 0, 0, piece.sw, piece.sh);

          // Outline
          if (s.outline) {
            buffer.noFill();
            buffer.stroke(0, 0, 0, 120);
            buffer.strokeWeight(s.outlineW || 1);
            buffer.rect(0.5, 0.5, piece.sw - 1, piece.sh - 1);
          }

          buffer.pop();
        }
      }
    }

    buffer.pop();
  };

  // Draw main canvas
  push();

  // Apply zoom transformation if enabled and magnifier is off
  if (viewSettings.zoomEnabled && !magnifierState.enabled) {
    translate(zoomState.offsetX, zoomState.offsetY);
    scale(zoomState.scale);
  }

  drawBackground(width, height);

  if (styleState.analyticsView === "heatmap" && ((puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6))) {
    drawHeatmap(width, height, puzzleGrid.rows, puzzleGrid.cols, listPieces(), timerState.elapsed);
    pop();
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }
  if (styleState.analyticsView === "grabs") {
    drawGrabPoints(width, height, listPieces());
    pop();
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }
  if (styleState.analyticsView === "connections") {
    drawConnections(width, height, listPieces());
    pop();
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }
  if (styleState.analyticsView === "paths") {
    drawMovementPaths(width, height, listPieces());
    pop();
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }

  for (const g of (window.__groups || [])) g.draw(window.__drawPiece || drawPiece);

  pop();

  // Draw magnifier overlay (always on top, no zoom transform)
  if (magnifierState.enabled) {
    drawToBuffer(pg);
    drawMagnifier(pg);
  }

  // Continue animation if needed
  if (needsRedraw || magnifierState.enabled) {
    setTimeout(() => redraw(), 16); // ~60fps
  }
};

window.mousePressed = () => {
  // Handle pan start if zoom is enabled (and not magnifier) and not dragging a piece
  if (viewSettings.zoomEnabled && !magnifierState.enabled) {
    // Check if clicking on a piece - if not, start panning
    const hitPiece = window.__findPieceAt ? window.__findPieceAt(mouseX, mouseY) : null;
    if (!hitPiece) {
      startPan(mouseX, mouseY);
      return;
    }
  }
  window.__onMousePressed && window.__onMousePressed();
};

window.mouseDragged = () => {
  // Handle panning if zoom is enabled and panning is active
  if (zoomState.isPanning && viewSettings.zoomEnabled && !magnifierState.enabled) {
    updatePan(mouseX, mouseY);
    redraw();
    return;
  }
  window.__onMouseDragged && window.__onMouseDragged();
};

window.mouseReleased = () => {
  // Stop panning if zoom is enabled
  if (zoomState.isPanning) {
    stopPan();
    return;
  }
  window.__onMouseReleased && window.__onMouseReleased();
};
// Throttle mouseMoved to reduce CPU usage
let lastMouseMoveTime = 0;
const MOUSE_MOVE_THROTTLE = 100; // ms - increased for better 6x6 performance

window.mouseMoved = () => {
  const now = Date.now();

  // Update magnifier position if enabled
  if (magnifierState.enabled) {
    updateMagnifierPosition(mouseX, mouseY);
    redraw();
    return;
  }

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
