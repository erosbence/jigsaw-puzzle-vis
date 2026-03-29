// Session statistics tracking and calculation module

const STORAGE_KEY = 'fragmentvis_session_stats';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity = new session

// Session data structure
let sessionData = {
  sessionId: null,
  sessionStart: null,
  lastActivity: null,
  games: [] // Array of game records
};

// Game record structure:
// {
//   id: timestamp,
//   started: timestamp,
//   completed: timestamp | null,
//   duration: number | null (seconds),
//   size: "2x2" | "4x4" | "6x6",
//   pieces: number,
//   grabs: number,
//   rotationEnabled: boolean,
//   perfectMoves: boolean, // true if grabs === optimal
//   streak: number // current streak at time of completion
// }

// Initialize or load session
export function initSession() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const now = Date.now();

  if (stored) {
    try {
      const parsed = JSON.parse(stored);

      // 🔒 SECURITY: Validate data structure
      if (!isValidSessionData(parsed)) {
        console.warn('Invalid session data structure, creating new session');
        throw new Error('Invalid session data');
      }

      // Check if session expired (30 min inactivity)
      if (parsed.lastActivity && (now - parsed.lastActivity) < SESSION_TIMEOUT) {
        sessionData = parsed;
        sessionData.lastActivity = now;
        saveSession();
        return sessionData;
      }
    } catch (e) {
      console.warn('Failed to parse session data, creating new session', e);
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // Create new session
  sessionData = {
    sessionId: `session_${now}`,
    sessionStart: now,
    lastActivity: now,
    games: []
  };
  saveSession();
  return sessionData;
}

// Save session to localStorage
function saveSession() {
  sessionData.lastActivity = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  } catch (e) {
    console.error('Failed to save session data', e);
  }
}

// Record game start
export function recordGameStart(size, pieces, rotationEnabled) {
  const gameId = Date.now();
  const game = {
    id: gameId,
    started: gameId,
    completed: null,
    duration: null,
    size: size,
    pieces: pieces,
    grabs: 0,
    rotationEnabled: rotationEnabled || false,
    perfectMoves: false,
    streak: 0
  };
  
  sessionData.games.push(game);
  saveSession();
  return gameId;
}

// Update grab count for current game
export function recordGrab(gameId) {
  const game = sessionData.games.find(g => g.id === gameId);
  if (game && !game.completed) {
    game.grabs++;
    saveSession();
  }
}

// Record game completion
export function recordGameComplete(gameId) {
  const game = sessionData.games.find(g => g.id === gameId);
  if (!game || game.completed) return;
  
  const now = Date.now();
  game.completed = now;
  game.duration = (now - game.started) / 1000; // Convert to seconds
  
  // Calculate streak
  const completedGames = sessionData.games.filter(g => g.completed !== null);
  let currentStreak = 0;
  for (let i = completedGames.length - 1; i >= 0; i--) {
    if (completedGames[i].completed !== null) {
      currentStreak++;
    } else {
      break;
    }
  }
  game.streak = currentStreak;
  
  // Check if perfect moves (optimal grabs with realistic tolerance)
  // Perfect = near-optimal play with some room for repositioning
  // Tolerance increases with puzzle difficulty:
  // - 2×2 (4 pieces): +25% tolerance (1 extra grab allowed)
  // - 3×3 (9 pieces): +35% tolerance (3 extra grabs)
  // - 4×4 (16 pieces): +40% tolerance (6 extra grabs)
  // - 6×6 (36 pieces): +50% tolerance (18 extra grabs)
  // - 8×8 (64 pieces): +60% tolerance (38 extra grabs)
  let toleranceMultiplier = 1.0;
  if (game.pieces <= 4) {
    toleranceMultiplier = 1.25; // 2×2: very achievable
  } else if (game.pieces <= 9) {
    toleranceMultiplier = 1.35; // 3×3: achievable
  } else if (game.pieces <= 16) {
    toleranceMultiplier = 1.40; // 4×4: challenging but realistic
  } else if (game.pieces <= 36) {
    toleranceMultiplier = 1.50; // 6×6: difficult but possible
  } else {
    toleranceMultiplier = 1.60; // 8×8: very difficult
  }

  const theoreticalOptimal = game.pieces - 1;
  const realisticOptimal = Math.ceil(theoreticalOptimal * toleranceMultiplier);
  game.perfectMoves = game.grabs <= realisticOptimal;
  
  saveSession();
}

// Get current game (most recent unfinished)
export function getCurrentGame() {
  for (let i = sessionData.games.length - 1; i >= 0; i--) {
    if (!sessionData.games[i].completed) {
      return sessionData.games[i];
    }
  }
  return null;
}

// Calculate statistics
export function calculateStats() {
  const games = sessionData.games;
  const completedGames = games.filter(g => g.completed !== null);
  const startedGames = games.length;
  const successfulGames = completedGames.length;
  
  const stats = {
    // Basic counts
    started: startedGames,
    completed: successfulGames,
    successRate: startedGames > 0 ? (successfulGames / startedGames) * 100 : 0,
    
    // Time statistics (seconds)
    fastestTime: null,
    slowestTime: null,
    averageTime: null,
    medianTime: null,
    timeStdDev: null,
    timeQuartiles: { q1: null, q2: null, q3: null },
    
    // Grabs statistics
    minGrabs: null,
    maxGrabs: null,
    averageGrabs: null,
    medianGrabs: null,
    grabsStdDev: null,
    
    // Efficiency
    perfectGames: 0,
    averageEfficiency: null, // (optimal / actual) * 100
    
    // Streaks
    currentStreak: 0,
    longestStreak: 0,
    
    // Badges
    badges: [],
    
    // Difficulty breakdown
    byDifficulty: {}
  };
  
  if (completedGames.length === 0) {
    return stats;
  }
  
  // Time statistics
  const times = completedGames.map(g => g.duration).sort((a, b) => a - b);
  stats.fastestTime = times[0];
  stats.slowestTime = times[times.length - 1];
  stats.averageTime = times.reduce((sum, t) => sum + t, 0) / times.length;
  stats.medianTime = times[Math.floor(times.length / 2)];
  stats.timeStdDev = calculateStdDev(times);
  stats.timeQuartiles = calculateQuartiles(times);
  
  // Grabs statistics
  const grabs = completedGames.map(g => g.grabs).sort((a, b) => a - b);
  stats.minGrabs = grabs[0];
  stats.maxGrabs = grabs[grabs.length - 1];
  stats.averageGrabs = grabs.reduce((sum, g) => sum + g, 0) / grabs.length;
  stats.medianGrabs = grabs[Math.floor(grabs.length / 2)];
  stats.grabsStdDev = calculateStdDev(grabs);
  
  // Efficiency
  stats.perfectGames = completedGames.filter(g => g.perfectMoves).length;
  const efficiencies = completedGames.map(g => {
    const optimal = g.pieces - 1;
    return (optimal / Math.max(g.grabs, optimal)) * 100;
  });
  stats.averageEfficiency = efficiencies.reduce((sum, e) => sum + e, 0) / efficiencies.length;
  
  // Streaks
  stats.currentStreak = calculateCurrentStreak(games);
  stats.longestStreak = Math.max(...completedGames.map(g => g.streak), 0);
  
  // Badges
  stats.badges = calculateBadges(stats, completedGames);
  
  // Difficulty breakdown
  stats.byDifficulty = calculateDifficultyBreakdown(completedGames);
  
  return stats;
}

// Helper: Calculate standard deviation
function calculateStdDev(values) {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
  return Math.sqrt(variance);
}

// Helper: Calculate quartiles for box plot
function calculateQuartiles(sortedValues) {
  if (sortedValues.length === 0) return { q1: 0, q2: 0, q3: 0 };
  
  const q2 = sortedValues[Math.floor(sortedValues.length / 2)];
  const q1 = sortedValues[Math.floor(sortedValues.length / 4)];
  const q3 = sortedValues[Math.floor(sortedValues.length * 3 / 4)];
  
  return { q1, q2, q3 };
}

// Helper: Calculate current streak
function calculateCurrentStreak(games) {
  let streak = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].completed !== null) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Helper: Calculate difficulty breakdown
function calculateDifficultyBreakdown(completedGames) {
  const breakdown = {};
  
  for (const game of completedGames) {
    if (!breakdown[game.size]) {
      breakdown[game.size] = {
        count: 0,
        avgTime: 0,
        avgGrabs: 0,
        times: []
      };
    }
    
    breakdown[game.size].count++;
    breakdown[game.size].times.push(game.duration);
  }
  
  // Calculate averages
  for (const size in breakdown) {
    const data = breakdown[size];
    data.avgTime = data.times.reduce((sum, t) => sum + t, 0) / data.times.length;
    
    const games = completedGames.filter(g => g.size === size);
    data.avgGrabs = games.reduce((sum, g) => sum + g.grabs, 0) / games.length;
  }
  
  return breakdown;
}

// Helper: Calculate badges
function calculateBadges(stats, completedGames) {
  const badges = [];

  // 🏃 Speedrunner: Fastest time < 30 seconds
  if (stats.fastestTime && stats.fastestTime < 30) {
    badges.push({ id: 'speedrunner', icon: '🏃', name: 'speedrunner', threshold: '< 30s' });
  }

  // 🎯 Perfectionist badges (difficulty-specific)
  // Count perfect games by size
  const perfectBy2x2 = completedGames.filter(g => g.perfectMoves && g.size === '2x2').length;
  const perfectBy4x4 = completedGames.filter(g => g.perfectMoves && g.size === '4x4').length;
  const perfectBy6x6 = completedGames.filter(g => g.perfectMoves && g.size === '6x6').length;

  if (perfectBy2x2 >= 3) {
    badges.push({ id: 'perfectionist2x2', icon: '🎯', name: 'perfectionist2x2', threshold: '3+ perfect 2×2' });
  }

  if (perfectBy4x4 >= 3) {
    badges.push({ id: 'perfectionist4x4', icon: '🎯', name: 'perfectionist4x4', threshold: '3+ perfect 4×4' });
  }

  if (perfectBy6x6 >= 3) {
    badges.push({ id: 'perfectionist6x6', icon: '🎯', name: 'perfectionist6x6', threshold: '3+ perfect 6×6' });
  }

  // 🏆 Veterán: 10+ completed games
  if (stats.completed >= 10) {
    badges.push({ id: 'veteran', icon: '🏆', name: 'veteran', threshold: '10+ games' });
  }

  // 🔥 Hot Streak: 5+ streak
  if (stats.longestStreak >= 5) {
    badges.push({ id: 'hotstreak', icon: '🔥', name: 'hotStreak', threshold: '5+ streak' });
  }

  // ⚡ Hatékony: Average efficiency > 90%
  if (stats.averageEfficiency >= 90) {
    badges.push({ id: 'efficient', icon: '⚡', name: 'efficient', threshold: '> 90%' });
  }

  // 💎 Mester: All main badges (speedrunner, veteran, hotstreak, efficient) + at least one perfectionist
  const hasSpeedrunner = badges.some(b => b.id === 'speedrunner');
  const hasVeteran = badges.some(b => b.id === 'veteran');
  const hasHotstreak = badges.some(b => b.id === 'hotstreak');
  const hasEfficient = badges.some(b => b.id === 'efficient');
  const hasPerfectionist = badges.some(b => b.id.startsWith('perfectionist'));

  if (hasSpeedrunner && hasVeteran && hasHotstreak && hasEfficient && hasPerfectionist) {
    badges.push({ id: 'master', icon: '💎', name: 'master', threshold: 'All main badges + 1 perfectionist' });
  }

  return badges;
}

// Reset session (for testing or manual reset)
export function resetSession() {
  sessionData = {
    sessionId: `session_${Date.now()}`,
    sessionStart: Date.now(),
    lastActivity: Date.now(),
    games: []
  };
  saveSession();
}

// Export session data (for debugging)
export function getSessionData() {
  return sessionData;
}

// 🔒 SECURITY: Validate session data structure
function isValidSessionData(data) {
  // Check required fields
  if (!data || typeof data !== 'object') return false;
  if (typeof data.sessionId !== 'string') return false;
  if (typeof data.sessionStart !== 'number') return false;
  if (typeof data.lastActivity !== 'number') return false;
  if (!Array.isArray(data.games)) return false;

  // Validate reasonable ranges
  const now = Date.now();
  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
  if (data.sessionStart < oneYearAgo || data.sessionStart > now) return false;
  if (data.lastActivity < oneYearAgo || data.lastActivity > now) return false;

  // Validate games array (sample first few games)
  const samplesToCheck = Math.min(5, data.games.length);
  for (let i = 0; i < samplesToCheck; i++) {
    const game = data.games[i];
    if (!isValidGameData(game)) return false;
  }

  return true;
}

// 🔒 SECURITY: Validate game data structure
function isValidGameData(game) {
  if (!game || typeof game !== 'object') return false;

  // Required fields with type checking
  if (typeof game.id !== 'number') return false;
  if (typeof game.started !== 'number') return false;
  if (game.completed !== null && typeof game.completed !== 'number') return false;
  if (game.duration !== null && typeof game.duration !== 'number') return false;
  if (typeof game.size !== 'string') return false;
  if (typeof game.pieces !== 'number') return false;
  if (typeof game.grabs !== 'number') return false;
  if (typeof game.rotationEnabled !== 'boolean') return false;

  // Validate allowed sizes
  const allowedSizes = ['2x2', '3x3', '4x4', '5x5', '6x6', '8x8', '10x10'];
  if (!allowedSizes.includes(game.size)) return false;

  // Validate reasonable ranges
  if (game.pieces < 4 || game.pieces > 100) return false;
  if (game.grabs < 0 || game.grabs > 10000) return false;
  if (game.duration !== null && (game.duration < 0 || game.duration > 86400)) return false; // Max 24 hours

  return true;
}
