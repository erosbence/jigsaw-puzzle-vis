// Completion celebration module
// Shows confetti animation and complete puzzle image when puzzle is solved

let confettiParticles = [];
let confettiActive = false;
let celebrationStartTime = 0;
const CELEBRATION_DURATION = 3000; // 3 seconds
const CONFETTI_COUNT = 50; // Minimal confetti

class ConfettiParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = Math.random() * -8 - 2;
    this.gravity = 0.3;
    this.size = Math.random() * 8 + 4;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.2;
    this.color = this.randomColor();
    this.alpha = 1.0;
  }

  randomColor() {
    const colors = [
      [255, 107, 107], // Red
      [78, 205, 196],  // Teal
      [255, 195, 0],   // Yellow
      [199, 121, 208], // Purple
      [116, 185, 255], // Blue
      [162, 155, 254]  // Lavender
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  update() {
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    
    // Fade out in last 500ms
    const elapsed = Date.now() - celebrationStartTime;
    if (elapsed > CELEBRATION_DURATION - 500) {
      this.alpha = Math.max(0, 1 - (elapsed - (CELEBRATION_DURATION - 500)) / 500);
    }
  }

  draw(pg) {
    pg.push();
    pg.translate(this.x, this.y);
    pg.rotate(this.rotation);
    pg.noStroke();
    pg.fill(this.color[0], this.color[1], this.color[2], this.alpha * 255);
    pg.rect(-this.size / 2, -this.size / 2, this.size, this.size);
    pg.pop();
  }
}

export function startCelebration(canvasWidth, canvasHeight) {
  confettiActive = true;
  celebrationStartTime = Date.now();
  confettiParticles = [];

  // Create confetti particles from center
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  for (let i = 0; i < CONFETTI_COUNT; i++) {
    confettiParticles.push(new ConfettiParticle(centerX, centerY));
  }
}

export function updateAndDrawCelebration(pg) {
  if (!confettiActive) return false;

  const elapsed = Date.now() - celebrationStartTime;

  // Update and draw confetti
  for (const particle of confettiParticles) {
    particle.update();
    particle.draw(pg);
  }

  // Check if celebration should end
  if (elapsed >= CELEBRATION_DURATION) {
    confettiActive = false;
    confettiParticles = [];
    return false;
  }

  return true; // Still active
}

export function isCelebrationActive() {
  return confettiActive;
}

export function stopCelebration() {
  confettiActive = false;
  confettiParticles = [];
}
