import { wireControls } from "./ui/controls.js";
import { drawBackground, drawPiece, drawHeatmap, drawGrabPoints, drawConnections, drawMovementPaths, drawAdjacencyMatrix } from "./canvas/draw.js";
import { styleState, setCanvasSize, puzzleGrid, timerState, listPieces, setHoverPiece, gameSettings, viewSettings, puzzleMeta, rgbButtonPositions, setRGBMapProjection, rgbMapProjection, matrixGroupingButtonPos, toggleMatrixGrouping } from "./canvas/state.js";
import { clampPiece, groupAlphaHit, targetTopLeft, shufflePieces } from "./canvas/interaction.js";
import { Group } from "./canvas/group.js";
import { gridRectScaled } from "./ui/layout.js";
import { 
  zoomState, applyZoomTransform, resetZoom, 
  handleMouseWheel, startPan, updatePan, stopPan, screenToWorld
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

  // Centralized wheel event handler with priority order
  // Priority: Magnifier > Zoom > Rotation > Default scroll
  let lastWheelTime = 0;
  const wheelThrottle = 200; // ms

  canvas.elt.addEventListener('wheel', (e) => {
    // Priority 1: Zoom (if enabled and not in analytics view)
    if (viewSettings.zoomEnabled && styleState.analyticsView === "none") {
      e.preventDefault();
      handleMouseWheel(e, w, h);
      redraw();
      return;
    }

    // Priority 2: Rotation (if enabled, not in analytics view, and piece under mouse)
    if (gameSettings.rotationEnabled && styleState.analyticsView === "none") {
      const now = Date.now();
      if (now - lastWheelTime < wheelThrottle) {
        e.preventDefault();
        return;
      }

      const hitPiece = window.__findPieceAt ? window.__findPieceAt(mouseX, mouseY) : null;
      if (hitPiece && hitPiece.canRotate()) {
        e.preventDefault();
        lastWheelTime = now;

        // Scroll up = rotate counter-clockwise (-90°), scroll down = clockwise (+90°)
        const direction = e.deltaY > 0 ? 90 : -90;
        hitPiece.rotate(direction);

        redraw();
        return;
      }
    }

    // Priority 4: Default browser scroll (no preventDefault, let it through)
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
  // Fix: Recreate buffer if size changed (prevent memory leak)
  const needsBufferRecreate = !window.__offscreenBuffer || 
                               window.__offscreenBuffer.width !== width || 
                               window.__offscreenBuffer.height !== height;

  if (needsBufferRecreate) {
    // Cleanup old buffer to prevent memory leak
    if (window.__offscreenBuffer) {
      window.__offscreenBuffer.remove();
      window.__offscreenBuffer = null;
    }
    // Create new buffer with current canvas size
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

  // Apply zoom transformation if enabled and not in analytics view
  if (viewSettings.zoomEnabled && styleState.analyticsView === "none") {
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
  if (styleState.analyticsView === "adjacency") {
    drawAdjacencyMatrix(width, height, listPieces());
    pop();
    if (needsRedraw) setTimeout(() => redraw(), 16);
    return;
  }

  for (const g of (window.__groups || [])) g.draw(window.__drawPiece || drawPiece);

  pop();

  // Continue animation if needed
  if (needsRedraw) {
    setTimeout(() => redraw(), 16); // ~60fps
  }
};

window.mousePressed = () => {
  // Check matrix grouping button FIRST (for adjacency matrix view)
  if (matrixGroupingButtonPos.visible) {
    const { x, y, w, h } = matrixGroupingButtonPos;
    if (mouseX >= x && mouseX <= x + w &&
        mouseY >= y && mouseY <= y + h) {
      toggleMatrixGrouping();
      redraw();
      return; // Don't process other clicks
    }
  }

  // Check RGB map buttons (second priority)
  if (rgbButtonPositions.visible) {
    const { leftX, leftY, rightX, rightY, size } = rgbButtonPositions;

    // Check left button
    if (mouseX >= leftX && mouseX <= leftX + size &&
        mouseY >= leftY && mouseY <= leftY + size) {
      setRGBMapProjection(rgbMapProjection - 1 + 3); // Backwards
      redraw();
      return; // Don't process other clicks
    }

    // Check right button
    if (mouseX >= rightX && mouseX <= rightX + size &&
        mouseY >= rightY && mouseY <= rightY + size) {
      setRGBMapProjection(rgbMapProjection + 1); // Forward
      redraw();
      return; // Don't process other clicks
    }
  }

  // Handle pan start if zoom is enabled and not dragging a piece
  if (viewSettings.zoomEnabled) {
    // Convert screen coordinates to world coordinates for accurate hit detection
    const worldCoords = screenToWorld(mouseX, mouseY);
    const hitPiece = window.__findPieceAt ? window.__findPieceAt(worldCoords.x, worldCoords.y) : null;

    if (!hitPiece) {
      // No piece under cursor - start panning
      startPan(mouseX, mouseY);
      return;
    }
    // Piece found - fall through to let piece drag handle it
  }
  window.__onMousePressed && window.__onMousePressed();
};

window.mouseDragged = () => {
  // Handle panning if zoom is enabled and panning is active
  // Note: isPanning flag ensures we don't interfere with piece dragging
  if (zoomState.isPanning && viewSettings.zoomEnabled) {
    updatePan(mouseX, mouseY);
    redraw();
    return;
  }
  window.__onMouseDragged && window.__onMouseDragged();
};

window.mouseReleased = () => {
  // Stop panning if zoom is enabled
  // Note: Only stop pan if we were actually panning (not piece dragging)
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
  } else if (styleState.analyticsView === "adjacency") {
    // Redraw when mouse moves in adjacency matrix to show color preview
    redraw();
  }
};
