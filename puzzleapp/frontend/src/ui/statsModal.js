// Statistics modal UI and chart rendering

import { calculateStats, getSessionData } from '../analytics/sessionStats.js';
import { t, applyTranslations } from './i18n.js';

let modal = null;

// Initialize modal
export function initStatsModal() {
  // Modal already exists
  if (modal) return;
  
  // Create modal HTML
  modal = document.createElement('div');
  modal.id = 'statsModal';
  modal.className = 'stats-modal';
  modal.style.display = 'none';
  
  modal.innerHTML = `
    <div class="stats-modal-overlay"></div>
    <div class="stats-modal-content">
      <div class="stats-modal-header">
        <h2 data-i18n="sessionStats">Session Statistics</h2>
        <button class="stats-modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="stats-modal-body">
        <!-- Data Storage Notice -->
        <div class="stats-notice">
          <div class="stats-notice-icon">ℹ️</div>
          <div class="stats-notice-content">
            <strong data-i18n="dataStorageNotice">Data Storage Notice</strong>
            <p data-i18n="dataStorageInfo">Your statistics are stored locally in your browser. They are not synced across devices and will be lost if you clear your browser data.</p>
          </div>
          <button class="stats-export-btn" id="exportStatsBtn" title="Export statistics as JSON">
            📥 <span data-i18n="exportStats">Export</span>
          </button>
          <button class="stats-reset-btn" id="resetStatsBtn" title="Reset all statistics">
            🔄 <span data-i18n="resetStats">Reset</span>
          </button>
        </div>

        <!-- Summary Cards -->
        <div class="stats-summary">
          <div class="stat-card">
            <div class="stat-icon">🎮</div>
            <div class="stat-value" id="stat-started">0</div>
            <div class="stat-label" data-i18n="gamesStarted">Games Started</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-value" id="stat-completed">0</div>
            <div class="stat-label" data-i18n="gamesCompleted">Games Completed</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">⚡</div>
            <div class="stat-value" id="stat-fastest">--</div>
            <div class="stat-label" data-i18n="fastestTime">Fastest Time</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🔥</div>
            <div class="stat-value" id="stat-streak">0</div>
            <div class="stat-label" data-i18n="currentStreak">Current Streak</div>
          </div>
        </div>
        
        <!-- Success Rate Bar -->
        <div class="stats-section">
          <h3 data-i18n="successRate">Success Rate</h3>
          <div class="success-rate-container">
            <div class="success-rate-bar">
              <div class="success-rate-fill" id="successRateFill" style="width: 0%">
                <span id="successRateText">0%</span>
              </div>
            </div>
            <div class="success-rate-legend">
              <span><span class="legend-color completed"></span> <span data-i18n="completed">Completed</span>: <span id="legendCompleted">0</span></span>
              <span><span class="legend-color incomplete"></span> <span data-i18n="incomplete">Incomplete</span>: <span id="legendIncomplete">0</span></span>
            </div>
          </div>
        </div>
        
        <!-- Time Timeline (Beeswarm) -->
        <div class="stats-section">
          <h3 data-i18n="timeTimeline">Game Timeline</h3>
          <div class="chart-container" style="position: relative;">
            <canvas id="timeTimeline" width="600" height="300"></canvas>
            <div id="timelineTooltip" class="timeline-tooltip" style="display: none;"></div>
          </div>
          <div class="stats-metrics">
            <span><strong data-i18n="average">Average</strong>: <span id="avgTime">--</span></span>
            <span><strong data-i18n="median">Median</strong>: <span id="medianTime">--</span></span>
            <span><strong data-i18n="fastest">Fastest</strong>: <span id="fastestTime">--</span></span>
          </div>
          <div class="timeline-legend">
            <span><span class="legend-dot" style="background: #3498db; width: 8px; height: 8px;"></span> 2×2</span>
            <span><span class="legend-dot" style="background: #f39c12; width: 16px; height: 16px;"></span> 4×4</span>
            <span><span class="legend-dot" style="background: #e74c3c; width: 20px; height: 20px;"></span> 6×6</span>
          </div>
        </div>
        
        <!-- Grabs Statistics -->
        <div class="stats-section">
          <h3 data-i18n="grabsStatistics">Grabs Statistics</h3>
          <div class="stats-metrics-grid">
            <div class="metric">
              <div class="metric-label" data-i18n="minimum">Minimum</div>
              <div class="metric-value" id="minGrabs">--</div>
            </div>
            <div class="metric">
              <div class="metric-label" data-i18n="average">Average</div>
              <div class="metric-value" id="avgGrabs">--</div>
            </div>
            <div class="metric">
              <div class="metric-label" data-i18n="median">Median</div>
              <div class="metric-value" id="medianGrabs">--</div>
            </div>
            <div class="metric">
              <div class="metric-label" data-i18n="efficiency">Efficiency</div>
              <div class="metric-value" id="efficiency">--</div>
            </div>
          </div>
        </div>
        
        <!-- Badges -->
        <div class="stats-section" id="badgesSection" style="display: none;">
          <h3 data-i18n="achievements">Achievements</h3>
          <div class="badges-container" id="badgesContainer"></div>
        </div>
        
        <!-- Difficulty Breakdown -->
        <div class="stats-section" id="difficultySection" style="display: none;">
          <h3 data-i18n="byDifficulty">By Difficulty</h3>
          <div class="difficulty-breakdown" id="difficultyBreakdown"></div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  const closeBtn = modal.querySelector('.stats-modal-close');
  const overlay = modal.querySelector('.stats-modal-overlay');
  
  closeBtn.addEventListener('click', hideStatsModal);
  overlay.addEventListener('click', hideStatsModal);

  // Export button
  const exportBtn = modal.querySelector('#exportStatsBtn');
  exportBtn.addEventListener('click', exportStats);

  // Reset button
  const resetBtn = modal.querySelector('#resetStatsBtn');
  resetBtn.addEventListener('click', resetStats);

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      hideStatsModal();
    }
  });

  // Apply translations to the newly created modal
  applyTranslations();
}

// Show modal with current statistics
export function showStatsModal() {
  if (!modal) initStatsModal();

  const stats = calculateStats();
  updateStatsDisplay(stats);

  modal.style.display = 'flex';

  // Apply translations again in case language was changed
  applyTranslations();
}

// Hide modal
export function hideStatsModal() {
  if (modal) {
    modal.style.display = 'none';
  }
}

// Update all statistics display
function updateStatsDisplay(stats) {
  // Summary cards
  document.getElementById('stat-started').textContent = stats.started;
  document.getElementById('stat-completed').textContent = stats.completed;
  document.getElementById('stat-fastest').textContent = stats.fastestTime ? formatTime(stats.fastestTime) : '--';
  document.getElementById('stat-streak').textContent = stats.currentStreak;
  
  // Success rate bar
  const successRate = stats.successRate;
  const fillElement = document.getElementById('successRateFill');
  fillElement.style.width = `${successRate}%`;
  document.getElementById('successRateText').textContent = `${Math.round(successRate)}%`;
  
  // Legend counts
  document.getElementById('legendCompleted').textContent = stats.completed;
  document.getElementById('legendIncomplete').textContent = stats.started - stats.completed;
  
  // Time statistics
  // Time statistics and timeline
  if (stats.completed > 0) {
    document.getElementById('avgTime').textContent = formatTime(stats.averageTime);
    document.getElementById('medianTime').textContent = formatTime(stats.medianTime);
    document.getElementById('fastestTime').textContent = formatTime(stats.fastestTime);

    // Draw timeline (beeswarm) - only if there are completed games
    try {
      drawTimeline(stats);
    } catch (err) {
      console.error('Error drawing timeline:', err);
      clearCanvas('timeTimeline');
    }
  } else {
    document.getElementById('avgTime').textContent = '--';
    document.getElementById('medianTime').textContent = '--';
    document.getElementById('fastestTime').textContent = '--';
    clearCanvas('timeTimeline');
  }
  
  // Grabs statistics
  if (stats.completed > 0) {
    document.getElementById('minGrabs').textContent = stats.minGrabs;
    document.getElementById('avgGrabs').textContent = Math.round(stats.averageGrabs);
    document.getElementById('medianGrabs').textContent = stats.medianGrabs;
    document.getElementById('efficiency').textContent = `${Math.round(stats.averageEfficiency)}%`;
  } else {
    document.getElementById('minGrabs').textContent = '--';
    document.getElementById('avgGrabs').textContent = '--';
    document.getElementById('medianGrabs').textContent = '--';
    document.getElementById('efficiency').textContent = '--';
  }
  
  // Badges
  if (stats.badges.length > 0) {
    document.getElementById('badgesSection').style.display = 'block';
    displayBadges(stats.badges);
  } else {
    document.getElementById('badgesSection').style.display = 'none';
  }
  
  // Difficulty breakdown
  if (Object.keys(stats.byDifficulty).length > 0) {
    document.getElementById('difficultySection').style.display = 'block';
    displayDifficultyBreakdown(stats.byDifficulty);
  } else {
    document.getElementById('difficultySection').style.display = 'none';
  }
}

// Format time in seconds to readable format
function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '--';
  
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

// Draw interactive timeline with beeswarm layout
function drawTimeline(stats) {
  const canvas = document.getElementById('timeTimeline');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Get all completed games sorted by completion time
  const sessionData = getSessionData();

  // Safety check
  if (!sessionData || !sessionData.games || !Array.isArray(sessionData.games)) {
    console.warn('No valid session data available');
    return;
  }

  const games = sessionData.games
    .filter(g => g && g.completed !== null && typeof g.completed === 'number')
    .sort((a, b) => a.completed - b.completed);

  if (games.length === 0) return;

  // Margins
  const margin = { top: 30, right: 40, bottom: 50, left: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // Time scale (Y axis - duration in seconds)
  const maxTime = Math.max(...games.map(g => g.duration));
  const minTime = 0;
  const timeRange = maxTime - minTime || 1; // Prevent division by zero
  const timeScale = (value) => {
    return margin.top + plotHeight - ((value - minTime) / timeRange) * plotHeight;
  };

  // Date scale (X axis)
  const minDate = games[0].completed;
  const maxDate = games[games.length - 1].completed;
  const dateRange = maxDate - minDate || 1;
  const dateScale = (timestamp) => {
    return margin.left + ((timestamp - minDate) / dateRange) * plotWidth;
  };

  // Size scale (based on pieces count)
  const sizeScale = (pieces) => {
    if (pieces <= 4) return 8;   // 2×2
    if (pieces <= 9) return 12;  // 3×3
    if (pieces <= 16) return 16; // 4×4
    if (pieces <= 25) return 18; // 5×5
    if (pieces <= 36) return 20; // 6×6
    return 24;                   // 8×8
  };

  // Color scale (based on difficulty)
  const colorScale = (size) => {
    const colors = {
      '2x2': '#3498db', // Blue
      '3x3': '#2ecc71', // Green
      '4x4': '#f39c12', // Orange
      '5x5': '#e67e22', // Dark orange
      '6x6': '#e74c3c', // Red
      '8x8': '#9b59b6'  // Purple
    };
    return colors[size] || '#95a5a6';
  };

  // Prepare points with beeswarm layout
  const points = games
    .filter(game => game && game.completed && game.duration !== undefined && game.pieces && game.size)
    .map((game, idx) => ({
      x: dateScale(game.completed),
      y: timeScale(game.duration),
      size: sizeScale(game.pieces),
      color: colorScale(game.size),
      game: game,
      index: idx
    }));

  // Safety check: no valid points
  if (points.length === 0) {
    console.warn('No valid points to draw');
    return;
  }

  // Beeswarm: Adjust Y positions to avoid overlap
  const minDistance = 18; // Minimum pixels between centers
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = (points[i].size + points[j].size) / 2 + 2;

      if (dist < minDist && Math.abs(dx) < minDistance) {
        // Push apart vertically
        const overlap = minDist - dist;
        const angle = Math.atan2(dy, dx);
        points[j].y -= Math.sin(angle) * overlap * 0.5;
        points[i].y += Math.sin(angle) * overlap * 0.5;
      }
    }
  }

  // Draw grid lines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = margin.top + (plotHeight / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
  }

  // Draw axes
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;

  // Y axis
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.stroke();

  // X axis
  ctx.beginPath();
  ctx.moveTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.stroke();

  // Y axis labels (time)
  ctx.fillStyle = '#333';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= gridLines; i++) {
    const value = maxTime * (1 - i / gridLines);
    const y = margin.top + (plotHeight / gridLines) * i;
    ctx.fillText(formatTime(value), margin.left - 10, y);
  }

  // X axis labels (dates)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const labelCount = Math.min(games.length, 5);
  if (labelCount > 0) {
    for (let i = 0; i < labelCount; i++) {
      // Handle edge case: single game
      const idx = labelCount === 1 ? 0 : Math.floor((games.length - 1) * (i / (labelCount - 1)));
      const game = games[idx];

      if (game && typeof game.completed === 'number') {
        const x = dateScale(game.completed);
        const date = new Date(game.completed);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        ctx.fillText(dateStr, x, height - margin.bottom + 10);
      }
    }
  }

  // Axis labels
  ctx.fillStyle = '#333';
  ctx.font = 'bold 12px sans-serif';

  // Y axis label
  ctx.save();
  ctx.translate(0, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(t('timeLabel') || 'Solution Time', 0, 0);
  ctx.restore();

  // X axis label
  ctx.textAlign = 'center';
  ctx.fillText(t('dateLabel') || 'Date', width / 2, height - 10);

  // Draw average line
  const avgY = timeScale(stats.averageTime);
  ctx.strokeStyle = '#3498db';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(margin.left, avgY);
  ctx.lineTo(width - margin.right, avgY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw points
  points.forEach(point => {
    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Point
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Store points for hover detection
  canvas._timelinePoints = points;

  // Add hover interaction
  if (!canvas._hasListener) {
    canvas._hasListener = true;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Find hovered point
      let hoveredPoint = null;
      for (const point of (canvas._timelinePoints || [])) {
        const dx = mx - point.x;
        const dy = my - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= point.size / 2 + 2) {
          hoveredPoint = point;
          break;
        }
      }

      const tooltip = document.getElementById('timelineTooltip');
      if (hoveredPoint && tooltip) {
        const game = hoveredPoint.game;
        const date = new Date(game.completed);
        const dateStr = date.toLocaleDateString();
        const timeStr = formatTime(game.duration);
        const efficiency = Math.round(((game.pieces - 1) / Math.max(game.grabs, game.pieces - 1)) * 100);

        tooltip.innerHTML = `
          <strong>${game.size}</strong> (${game.pieces} ${t('pieces') || 'pieces'})<br>
          ⏱️ ${timeStr}<br>
          🎯 ${game.grabs} ${t('grabs') || 'grabs'} (${efficiency}%)<br>
          📅 ${dateStr}
        `;

        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 10) + 'px';

        canvas.style.cursor = 'pointer';
      } else if (tooltip) {
        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    });

    canvas.addEventListener('mouseleave', () => {
      const tooltip = document.getElementById('timelineTooltip');
      if (tooltip) tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
    });
  }
}

// Clear canvas
function clearCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Display badges
function displayBadges(badges) {
  const container = document.getElementById('badgesContainer');
  container.innerHTML = '';
  
  badges.forEach(badge => {
    const badgeEl = document.createElement('div');
    badgeEl.className = 'badge';
    badgeEl.innerHTML = `
      <div class="badge-icon">${badge.icon}</div>
      <div class="badge-info">
        <div class="badge-name" data-i18n="${badge.name}">${badge.name}</div>
        <div class="badge-threshold">${badge.threshold}</div>
      </div>
    `;
    container.appendChild(badgeEl);
  });
}

// Display difficulty breakdown
function displayDifficultyBreakdown(breakdown) {
  const container = document.getElementById('difficultyBreakdown');
  container.innerHTML = '';

  const sizes = Object.keys(breakdown).sort((a, b) => {
    const [aRows] = a.split('x').map(Number);
    const [bRows] = b.split('x').map(Number);
    return aRows - bRows;
  });

  sizes.forEach(size => {
    const data = breakdown[size];
    const diffEl = document.createElement('div');
    diffEl.className = 'difficulty-item';

    // 🔒 SECURITY: Use textContent instead of innerHTML for user data
    const sizeDiv = document.createElement('div');
    sizeDiv.className = 'difficulty-size';
    sizeDiv.textContent = escapeHtml(size);

    const statsDiv = document.createElement('div');
    statsDiv.className = 'difficulty-stats';
    statsDiv.innerHTML = `
      <span><strong data-i18n="games">Games</strong>: ${escapeHtml(String(data.count))}</span>
      <span><strong data-i18n="avgTime">Avg Time</strong>: ${escapeHtml(formatTime(data.avgTime))}</span>
      <span><strong data-i18n="avgGrabs">Avg Grabs</strong>: ${escapeHtml(String(Math.round(data.avgGrabs)))}</span>
    `;

    diffEl.appendChild(sizeDiv);
    diffEl.appendChild(statsDiv);
    container.appendChild(diffEl);
  });
}

// 🔒 SECURITY: HTML escape function to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;'
  };
  return String(text).replace(/[&<>"'\/]/g, char => map[char]);
}

// Export statistics as JSON file
function exportStats() {
  try {
    const sessionData = localStorage.getItem('fragmentvis_session_stats');
    if (!sessionData) {
      alert(t('noStatsToExport') || 'No statistics to export.');
      return;
    }

    // Create downloadable JSON file
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(sessionData);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadAnchor.setAttribute("download", `fragmentvis-stats-${timestamp}.json`);

    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    console.log('Statistics exported successfully');
  } catch (error) {
    console.error('Failed to export statistics:', error);
    alert(t('exportFailed') || 'Failed to export statistics.');
  }
}

// Reset all statistics
function resetStats() {
  const confirmMsg = t('confirmResetStats') || 'Are you sure you want to delete all statistics? This action cannot be undone.';

  if (confirm(confirmMsg)) {
    try {
      localStorage.removeItem('fragmentvis_session_stats');
      alert(t('statsResetSuccess') || 'Statistics have been reset successfully. The page will reload.');
      location.reload();
    } catch (error) {
      console.error('Failed to reset statistics:', error);
      alert(t('resetFailed') || 'Failed to reset statistics.');
    }
  }
}
