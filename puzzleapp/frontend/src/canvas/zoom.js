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

// Magnifier state
export const magnifierState = {
  enabled: false,    // Is magnifier tool enabled
  x: 0,              // Magnifier center X
  y: 0,              // Magnifier center Y
  radius: 100,       // Magnifier circle radius
  magnification: 2.5 // Magnification level (2.5x)
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

// Toggle magnifier
export function toggleMagnifier() {
  magnifierState.enabled = !magnifierState.enabled;
}

// Update magnifier position
export function updateMagnifierPosition(mouseX, mouseY) {
  magnifierState.x = mouseX;
  magnifierState.y = mouseY;
}

// Draw magnifier overlay
export function drawMagnifier(pg) {
  if (!magnifierState.enabled || !pg) return;
  
  const { x, y, radius, magnification } = magnifierState;
  
  // Save current drawing state
  window.push();
  
  // Reset transformations for overlay
  window.resetMatrix();
  
  // Create circular clipping mask for magnifier
  window.drawingContext.save();
  
  // Draw magnifier circle outline
  window.noFill();
  window.stroke(80, 80, 80);
  window.strokeWeight(3);
  window.circle(x, y, radius * 2);
  
  // Create circular clip path
  window.drawingContext.beginPath();
  window.drawingContext.arc(x, y, radius, 0, Math.PI * 2);
  window.drawingContext.clip();
  
  // Draw magnified content
  const sourceX = x / zoomState.scale - zoomState.offsetX / zoomState.scale;
  const sourceY = y / zoomState.scale - zoomState.offsetY / zoomState.scale;
  const sourceSize = (radius * 2) / magnification;
  
  // Draw the magnified portion
  window.image(
    pg,
    x - radius, y - radius, // destination position
    radius * 2, radius * 2,  // destination size
    sourceX - sourceSize / 2, sourceY - sourceSize / 2, // source position
    sourceSize, sourceSize   // source size
  );
  
  window.drawingContext.restore();
  
  // Draw magnifier handle (decorative)
  window.push();
  window.stroke(80, 80, 80);
  window.strokeWeight(3);
  window.noFill();
  const handleAngle = Math.PI / 4; // 45 degrees
  const handleLength = 30;
  const handleStartX = x + Math.cos(handleAngle) * radius;
  const handleStartY = y + Math.sin(handleAngle) * radius;
  const handleEndX = handleStartX + Math.cos(handleAngle) * handleLength;
  const handleEndY = handleStartY + Math.sin(handleAngle) * handleLength;
  window.line(handleStartX, handleStartY, handleEndX, handleEndY);
  
  // Draw handle end circle
  window.fill(80, 80, 80);
  window.noStroke();
  window.circle(handleEndX, handleEndY, 8);
  window.pop();
  
  // Draw crosshair in center
  window.push();
  window.stroke(255, 100, 100, 150);
  window.strokeWeight(1);
  const crossSize = 10;
  window.line(x - crossSize, y, x + crossSize, y);
  window.line(x, y - crossSize, x, y + crossSize);
  window.pop();
  
  // Draw magnification label
  window.push();
  window.fill(80, 80, 80);
  window.noStroke();
  window.textAlign(window.CENTER, window.CENTER);
  window.textSize(12);
  window.text(`${magnification}x`, x, y + radius + 18);
  window.pop();
  
  window.pop();
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
