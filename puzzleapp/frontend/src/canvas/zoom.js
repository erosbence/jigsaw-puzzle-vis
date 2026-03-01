// Zoom and magnifier functionality

// Zoom state
export const zoomState = {
  scale: 1.0,        // Current zoom level (1.0 = 100%)
  offsetX: 0,        // Pan offset X
  offsetY: 0,        // Pan offset Y
  minScale: 0.5,     // Minimum zoom (50%)
  maxScale: 3.0,     // Maximum zoom (300%)
  isPanning: false,  // Is user currently panning
  panStartX: 0,      // Pan start mouse X
  panStartY: 0,      // Pan start mouse Y
  panStartOffsetX: 0, // Pan start offset X
  panStartOffsetY: 0  // Pan start offset Y
};

// Apply zoom transformation to canvas
export function applyZoomTransform() {
  if (!window.translate || !window.scale) return;
  window.translate(zoomState.offsetX, zoomState.offsetY);
  window.scale(zoomState.scale);
}

// Reset zoom to default
export function resetZoom() {
  zoomState.scale = 1.0;
  zoomState.offsetX = 0;
  zoomState.offsetY = 0;

  // Clean up pan state to prevent "stuck" panning
  zoomState.isPanning = false;
  zoomState.panStartX = 0;
  zoomState.panStartY = 0;
  zoomState.panStartOffsetX = 0;
  zoomState.panStartOffsetY = 0;
}

// Zoom in
export function zoomIn(centerX, centerY) {
  const oldScale = zoomState.scale;
  zoomState.scale = Math.min(zoomState.maxScale, zoomState.scale * 1.2);
  
  // Adjust offset to zoom toward the center point
  if (centerX !== undefined && centerY !== undefined) {
    const scaleRatio = zoomState.scale / oldScale;
    zoomState.offsetX = centerX - (centerX - zoomState.offsetX) * scaleRatio;
    zoomState.offsetY = centerY - (centerY - zoomState.offsetY) * scaleRatio;
  }
}

// Zoom out
export function zoomOut(centerX, centerY) {
  const oldScale = zoomState.scale;
  zoomState.scale = Math.max(zoomState.minScale, zoomState.scale / 1.2);
  
  // Adjust offset to zoom from the center point
  if (centerX !== undefined && centerY !== undefined) {
    const scaleRatio = zoomState.scale / oldScale;
    zoomState.offsetX = centerX - (centerX - zoomState.offsetX) * scaleRatio;
    zoomState.offsetY = centerY - (centerY - zoomState.offsetY) * scaleRatio;
  }
}

// Handle mouse wheel zoom
export function handleMouseWheel(event, canvasWidth, canvasHeight) {
  // Prevent default scroll
  event.preventDefault();
  
  // Get mouse position relative to canvas
  const rect = event.target.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  
  // Zoom in or out
  if (event.deltaY < 0) {
    zoomIn(mouseX, mouseY);
  } else {
    zoomOut(mouseX, mouseY);
  }
  
  return false;
}

// Start panning
export function startPan(mouseX, mouseY) {
  zoomState.isPanning = true;
  zoomState.panStartX = mouseX;
  zoomState.panStartY = mouseY;
  zoomState.panStartOffsetX = zoomState.offsetX;
  zoomState.panStartOffsetY = zoomState.offsetY;
}

// Update panning
export function updatePan(mouseX, mouseY) {
  if (!zoomState.isPanning) return;
  
  const dx = mouseX - zoomState.panStartX;
  const dy = mouseY - zoomState.panStartY;
  
  zoomState.offsetX = zoomState.panStartOffsetX + dx;
  zoomState.offsetY = zoomState.panStartOffsetY + dy;
}

// Stop panning
export function stopPan() {
  zoomState.isPanning = false;
}

// Convert screen coordinates to world coordinates (considering zoom)
export function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - zoomState.offsetX) / zoomState.scale,
    y: (screenY - zoomState.offsetY) / zoomState.scale
  };
}

// Convert world coordinates to screen coordinates
export function worldToScreen(worldX, worldY) {
  return {
    x: worldX * zoomState.scale + zoomState.offsetX,
    y: worldY * zoomState.scale + zoomState.offsetY
  };
}
