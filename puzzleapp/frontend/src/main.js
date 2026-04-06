import { wireControls } from "./ui/controls.js";
import { drawBackground, drawPiece, drawHeatmap, drawGrabPoints, drawConnections, drawMovementPaths, handlePathsClick, drawAdjacencyMatrix, drawDashboard, handleDashboardClick, setDashboardSelectedPiece, drawOffGridAssemblies, handleOffGridClick, drawConnDashboard, handleFirstConnClick, clearFirstConnSelection, computeAdjacencyHoverKey, computeSankeyHoverKey, shapeProfileResizeHitTest, startShapeProfileResize, updateShapeProfileResize, stopShapeProfileResize, isShapeProfileDragging, handleShapeProfilePopupWheel, connGrowthResizeHitTest, startConnGrowthResize, updateConnGrowthResize, stopConnGrowthResize, isConnGrowthDragging } from "./canvas/draw.js";
import { styleState, setCanvasSize, puzzleGrid, timerState, listPieces, setHoverPiece, hoverPiece, gameSettings, viewSettings, puzzleMeta, rgbButtonPositions, setRGBMapProjection, rgbMapProjection, matrixGroupingButtonPos, toggleMatrixGrouping, completionState } from "./canvas/state.js";
import { clampPiece, groupAlphaHit, targetTopLeft, shufflePieces } from "./canvas/interaction.js";
import { Group } from "./canvas/group.js";
import { gridRectScaled } from "./ui/layout.js";
import { 
  zoomState, applyZoomTransform, resetZoom, 
  handleMouseWheel, startPan, updatePan, stopPan, screenToWorld
} from "./canvas/zoom.js";
import { updateAndDrawCelebration, isCelebrationActive } from "./ui/completion.js";

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
    // Priority 0: Shape profile popup scroll (dashboard drill-down)
    if (styleState.analyticsView === "dashboard" && handleShapeProfilePopupWheel(e.deltaY)) {
      e.preventDefault();
      redraw();
      return;
    }

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
  const inAnalyticsView = styleState.analyticsView !== "none";

  // Offscreen buffer only needed in normal puzzle view (magnifier support)
  if (!inAnalyticsView) {
    const needsBufferRecreate = !window.__offscreenBuffer || 
                                 window.__offscreenBuffer.width !== width || 
                                 window.__offscreenBuffer.height !== height;

    if (needsBufferRecreate) {
      if (window.__offscreenBuffer) {
        window.__offscreenBuffer.remove();
        window.__offscreenBuffer = null;
      }
      window.__offscreenBuffer = createGraphics(width, height);
    }

    const pg = window.__offscreenBuffer;
    pg.clear();
  }

  // Update rotation animations only in normal view (pieces aren't rendered in analytics)
  let needsRedraw = false;
  if (!inAnalyticsView) {
    for (const piece of listPieces()) {
      if (piece.updateRotationAnimation && piece.isAnimating()) {
        piece.updateRotationAnimation();
        if (piece.isAnimating()) needsRedraw = true;
      }
    }
  }

  // Draw main canvas
  push();

  // Apply zoom transformation if enabled and not in analytics view
  if (viewSettings.zoomEnabled && styleState.analyticsView === "none") {
    translate(zoomState.offsetX, zoomState.offsetY);
    scale(zoomState.scale);
  }

  // Use white background for dashboard, gray for everything else
  if (styleState.analyticsView === "dashboard" || styleState.analyticsView === "connDashboard") {
    background(255); // White
  } else {
    drawBackground(width, height);
  }

  // Draw faded image hint overlay if enabled (only in normal view)
  if (viewSettings.imageHintEnabled && styleState.analyticsView === "none" && window.__currentPuzzleImage) {
    const { originX, originY, W, H } = gridRectScaled(width, height);
    push();
    tint(255, 255, 255, 60); // Very faded (opacity ~23%)
    image(window.__currentPuzzleImage, originX, originY, W, H);
    noTint();
    pop();
  }

  if (styleState.analyticsView === "dashboard") {
    drawDashboard(width, height, puzzleGrid.rows, puzzleGrid.cols, listPieces(), timerState.elapsed);
    pop();
    return;
  }
  if (styleState.analyticsView === "heatmap" && ((puzzleGrid.rows === 2 && puzzleGrid.cols === 2) || (puzzleGrid.rows === 4 && puzzleGrid.cols === 4) || (puzzleGrid.rows === 6 && puzzleGrid.cols === 6) || (puzzleGrid.rows === 10 && puzzleGrid.cols === 10))) {
    drawHeatmap(width, height, puzzleGrid.rows, puzzleGrid.cols, listPieces(), timerState.elapsed);
    pop();
    return;
  }
  if (styleState.analyticsView === "grabs") {
    drawGrabPoints(width, height, listPieces());
    pop();
    return;
  }
  if (styleState.analyticsView === "connections") {
    drawConnections(width, height, listPieces());
    pop();
    return;
  }
  if (styleState.analyticsView === "paths") {
    drawMovementPaths(width, height, listPieces());
    pop();
    return;
  }
  if (styleState.analyticsView === "adjacency") {
    drawAdjacencyMatrix(width, height, listPieces());
    pop();
    return;
  }
  if (styleState.analyticsView === "offgrid") {
    drawOffGridAssemblies(width, height, listPieces());
    pop();
    return;
  }
  if (styleState.analyticsView === "connDashboard") {
    drawConnDashboard(width, height, listPieces());
    pop();
    return;
  }

  // Draw pieces or complete image
  if (completionState.showingComplete && window.__currentPuzzleImage) {
    // Show complete puzzle image (centered in grid area)
    const { originX, originY, W, H } = gridRectScaled(width, height);
    image(window.__currentPuzzleImage, originX, originY, W, H);
  } else {
    // Draw individual pieces
    for (const g of (window.__groups || [])) g.draw(window.__drawPiece || drawPiece);
  }

  pop();

  // Draw confetti animation on top (not affected by zoom)
  if (isCelebrationActive()) {
    const stillActive = updateAndDrawCelebration(window);
    if (stillActive) {
      setTimeout(() => redraw(), 16); // Continue animation
    }
  }

  // Continue animation if needed
  if (needsRedraw) {
    setTimeout(() => redraw(), 16); // ~60fps
  }

  };

window.mousePressed = () => {
  // Check dashboard cell click (highest priority for dashboard view)
  if (styleState.analyticsView === "dashboard") {
    const { w, h } = canvasHostSize();

    // Check shape profile resize grip (drag to resize)
    if (shapeProfileResizeHitTest(mouseX, mouseY, w, h)) {
      startShapeProfileResize(mouseY, h);
      return;
    }

    const cell = handleDashboardClick(mouseX, mouseY, w, h, puzzleGrid.rows, puzzleGrid.cols);
    if (cell) {
      if (typeof cell.row === 'number' && typeof cell.col === 'number') {
        setDashboardSelectedPiece(cell.row, cell.col);
      }
      redraw();
      return; // Don't process other clicks
    }
  }

  // Check paths view piece click
  if (styleState.analyticsView === "paths") {
    if (handlePathsClick(mouseX, mouseY)) {
      redraw();
      return;
    }
  }

  // Check off-grid assemblies piece click
  if (styleState.analyticsView === "offgrid") {
    if (handleOffGridClick(mouseX, mouseY)) {
      redraw();
      return;
    }
  }

  // Check connDashboard panel clicks
  if (styleState.analyticsView === "connDashboard") {
    const connPadding = 20;
    const connGap = 15;
    const panelW = (width - connPadding * 2 - connGap) / 2;
    const rightX = connPadding + panelW + connGap;
    // Check growth curve resize grip first (right panel, between heatmap and curve)
    if (connGrowthResizeHitTest(mouseX, mouseY)) {
      const { h } = canvasHostSize();
      startConnGrowthResize(mouseY, h);
      return;
    }
    if (mouseX < rightX) {
      // Left panel — off-grid assemblies
      if (mouseX >= connPadding && handleOffGridClick(mouseX - connPadding, mouseY)) {
        redraw();
        return;
      }
    } else {
      // Right panel — first connection heatmap
      if (handleFirstConnClick(mouseX, mouseY)) {
        redraw();
        return;
      }
    }
  }

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
  // Handle connDashboard growth strip resize drag
  if (isConnGrowthDragging()) {
    cursor('ns-resize');
    const { h } = canvasHostSize();
    if (updateConnGrowthResize(mouseY, h)) {
      redraw();
    }
    return;
  }
  // Handle shape profile resize drag
  if (isShapeProfileDragging()) {
    cursor('ns-resize');
    const { h } = canvasHostSize();
    if (updateShapeProfileResize(mouseY, h)) {
      redraw();
    }
    return;
  }
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
  // Stop shape profile resize (returns true if it was a click → toggle)
  if (isShapeProfileDragging()) {
    stopShapeProfileResize();
    redraw();
    return;
  }
  // Stop connDashboard growth strip resize
  if (isConnGrowthDragging()) {
    stopConnGrowthResize();
    redraw();
    return;
  }
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
let _lastAdjHoverKey = null; // diff-based redraw for adjacency matrix view
let _lastGripHover = false;  // diff-based redraw for shape profile resize grip
let _lastConnGrowthGripHover = false; // diff-based redraw for connDashboard resize grip
let _lastSankeyHoverKey = 'o'; // diff-based redraw for Sankey hover tooltip

window.mouseMoved = () => {
  const now = Date.now();

  if (now - lastMouseMoveTime < MOUSE_MOVE_THROTTLE) return;
  lastMouseMoveTime = now;

  // Update hover piece for rotation (if rotation is enabled and not in analytics view)
  if (gameSettings.rotationEnabled && styleState.analyticsView === "none" && window.__findPieceAt) {
    const hitPiece = window.__findPieceAt(mouseX, mouseY);
    if (hitPiece !== hoverPiece) {
      setHoverPiece(hitPiece);
      redraw();
    }
  } else if (styleState.analyticsView === "adjacency") {
    // Diff-based redraw: only repaint when hover zone actually changes
    const key = computeAdjacencyHoverKey(mouseX, mouseY);
    if (key !== _lastAdjHoverKey) {
      _lastAdjHoverKey = key;
      redraw();
    }
  } else if (styleState.analyticsView === "dashboard") {
    // Diff-based redraw for resize grip hover highlight
    const { w, h } = canvasHostSize();
    const onGrip = shapeProfileResizeHitTest(mouseX, mouseY, w, h);
    cursor(onGrip ? 'ns-resize' : ARROW);
    if (onGrip !== _lastGripHover) {
      _lastGripHover = onGrip;
      redraw();
    }
  } else if (styleState.analyticsView === "connDashboard") {
    const onGrip = connGrowthResizeHitTest(mouseX, mouseY);
    cursor(onGrip ? 'ns-resize' : ARROW);
    const sankeyKey = computeSankeyHoverKey(mouseX, mouseY);
    const shouldRedraw = (onGrip !== _lastConnGrowthGripHover) || (sankeyKey !== _lastSankeyHoverKey);
    _lastConnGrowthGripHover = onGrip;
    _lastSankeyHoverKey = sankeyKey;
    if (shouldRedraw) redraw();
  }
  // paths view: no hover-dependent rendering → no redraw needed
};
