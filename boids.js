// Ground Animal Herd Simulation (Goats/Sheep)
// Uses angle-based orientation and field of view

// Canvas dimensions
let width = 150;
let height = 150;

// Simulation parameters
const numAnimals = 60;
const visualRange = 120; // How far animals can see
const fieldOfView = 270 * (Math.PI / 180); // 270 degree FOV (can't see directly behind)

// Behavior parameters
const separationDistance = 35; // Personal space - animals repel within this distance
const separationForce = 0.15; // Strong repulsion force
const cohesionForce = 0.008; // Attraction to group center
const alignmentForce = 0.08; // Matching heading with neighbors
const forwardBias = 0.95; // Tendency to maintain current heading

// Movement parameters
const minSpeed = 0.5;
const maxSpeed = 4.5;
const maxTurnRate = 0.12; // Maximum angular velocity (radians per frame)
const speedDamping = 0.98; // Friction/drag
const defaultSpeed = 2.5;

var animals = [];

// Mouse/treat tracking
var mousePos = { x: null, y: null };
var treatMode = 'attract'; // 'attract' or 'avoid'
var treatActive = false; // Whether treat is currently active

// Initialize animals with position, heading, and speed
function initAnimals() {
  for (var i = 0; i < numAnimals; i += 1) {
    animals.push({
      x: Math.random() * width,
      y: Math.random() * height,
      heading: Math.random() * Math.PI * 2, // Random initial heading (0 to 2π)
      speed: defaultSpeed + (Math.random() - 0.5), // Slight speed variation
      angularVelocity: 0, // Current turning rate
      history: [],
    });
  }
}

// Calculate distance between two animals
function distance(animal1, animal2) {
  return Math.sqrt(
    (animal1.x - animal2.x) * (animal1.x - animal2.x) +
      (animal1.y - animal2.y) * (animal1.y - animal2.y)
  );
}

// Calculate angle from animal1 to animal2
function angleTo(animal1, animal2) {
  return Math.atan2(animal2.y - animal1.y, animal2.x - animal1.x);
}

// Normalize angle to -PI to PI range
function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Check if an angle is within the field of view
// relativeAngle is the angle difference between heading and target
function isInFieldOfView(relativeAngle) {
  const absAngle = Math.abs(relativeAngle);
  return absAngle <= fieldOfView / 2;
}

// Check if line of sight between two points is blocked by fences
function isLineOfSightBlocked(x1, y1, x2, y2) {
  const fenceMargin = 20; // Same as hardMargin in keepWithinBounds

  // Check intersection with each fence (boundary)
  // Left fence (x = fenceMargin)
  if (lineIntersectsVerticalLine(x1, y1, x2, y2, fenceMargin)) return true;

  // Right fence (x = width - fenceMargin)
  if (lineIntersectsVerticalLine(x1, y1, x2, y2, width - fenceMargin)) return true;

  // Top fence (y = fenceMargin)
  if (lineIntersectsHorizontalLine(x1, y1, x2, y2, fenceMargin)) return true;

  // Bottom fence (y = height - fenceMargin)
  if (lineIntersectsHorizontalLine(x1, y1, x2, y2, height - fenceMargin)) return true;

  return false;
}

// Check if line segment (x1,y1)-(x2,y2) intersects vertical line at x=lineX
function lineIntersectsVerticalLine(x1, y1, x2, y2, lineX) {
  // If both points are on the same side of the line, no intersection
  if ((x1 < lineX && x2 < lineX) || (x1 > lineX && x2 > lineX)) return false;

  // If line segment is vertical, check if it's on the fence
  if (x1 === x2) return x1 === lineX;

  // Calculate y coordinate where the line crosses lineX
  const t = (lineX - x1) / (x2 - x1);
  const y = y1 + t * (y2 - y1);

  // Check if intersection point is between the two points
  return t >= 0 && t <= 1 && y >= 0 && y <= height;
}

// Check if line segment (x1,y1)-(x2,y2) intersects horizontal line at y=lineY
function lineIntersectsHorizontalLine(x1, y1, x2, y2, lineY) {
  // If both points are on the same side of the line, no intersection
  if ((y1 < lineY && y2 < lineY) || (y1 > lineY && y2 > lineY)) return false;

  // If line segment is horizontal, check if it's on the fence
  if (y1 === y2) return y1 === lineY;

  // Calculate x coordinate where the line crosses lineY
  const t = (lineY - y1) / (y2 - y1);
  const x = x1 + t * (x2 - x1);

  // Check if intersection point is between the two points
  return t >= 0 && t <= 1 && x >= 0 && x <= width;
}

// Check if animal2 is visible to animal1 (within range and FOV)
function isVisible(animal1, animal2) {
  if (animal1 === animal2) return false;

  const dist = distance(animal1, animal2);
  if (dist > visualRange) return false;

  const angleToTarget = angleTo(animal1, animal2);
  const relativeAngle = normalizeAngle(angleToTarget - animal1.heading);

  if (!isInFieldOfView(relativeAngle)) return false;

  // Check if line of sight is blocked by a fence
  if (isLineOfSightBlocked(animal1.x, animal1.y, animal2.x, animal2.y)) return false;

  return true;
}

// Get all visible neighbors for an animal
function getVisibleNeighbors(animal) {
  return animals.filter(other => isVisible(animal, other));
}

// Resize canvas to fill window
function sizeCanvas() {
  const canvas = document.getElementById("boids");
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}

// Keep animals within bounds with smooth turning
// Allows touching the fence but prevents crossing
function keepWithinBounds(animal) {
  const softMargin = 100; // Start gentle turning at this distance
  const hardMargin = 20; // Hard boundary - cannot cross
  const turnForce = 0.05; // Gentler turn force

  let desiredHeading = null;

  // Soft boundary - gentle steering
  if (animal.x < softMargin) {
    desiredHeading = 0; // Head right
  } else if (animal.x > width - softMargin) {
    desiredHeading = Math.PI; // Head left
  }

  if (animal.y < softMargin) {
    const headDown = Math.PI / 2;
    desiredHeading = desiredHeading === null ? headDown : (desiredHeading + headDown) / 2;
  } else if (animal.y > height - softMargin) {
    const headUp = -Math.PI / 2;
    desiredHeading = desiredHeading === null ? headUp : (desiredHeading + headUp) / 2;
  }

  if (desiredHeading !== null) {
    const angleDiff = normalizeAngle(desiredHeading - animal.heading);
    animal.angularVelocity += angleDiff * turnForce;
  }

  // Hard boundary - prevent crossing (clamp position)
  if (animal.x < hardMargin) animal.x = hardMargin;
  if (animal.x > width - hardMargin) animal.x = width - hardMargin;
  if (animal.y < hardMargin) animal.y = hardMargin;
  if (animal.y > height - hardMargin) animal.y = height - hardMargin;
}

// Separation: Strongly repel from nearby animals
// Ground animals need more personal space
function separate(animal) {
  let repelX = 0;
  let repelY = 0;
  let repelCount = 0;

  for (let other of animals) {
    if (other === animal) continue;

    const dist = distance(animal, other);

    // Strong repulsion when too close, regardless of FOV (can sense nearby animals)
    if (dist < separationDistance && dist > 0) {
      const force = (separationDistance - dist) / separationDistance; // Stronger when closer
      const angle = angleTo(other, animal); // Angle away from other

      repelX += Math.cos(angle) * force;
      repelY += Math.sin(angle) * force;
      repelCount++;
    }
  }

  if (repelCount > 0) {
    // Average repulsion direction
    repelX /= repelCount;
    repelY /= repelCount;

    // Convert to desired heading change
    const desiredHeading = Math.atan2(repelY, repelX);
    const angleDiff = normalizeAngle(desiredHeading - animal.heading);

    animal.angularVelocity += angleDiff * separationForce;

    // Speed up when avoiding others (panic response)
    animal.speed += 0.3;
  }
}

// Cohesion: Move toward the center of visible neighbors
function moveTowardCenter(animal) {
  const neighbors = getVisibleNeighbors(animal);

  if (neighbors.length === 0) return;

  let centerX = 0;
  let centerY = 0;

  for (let other of neighbors) {
    centerX += other.x;
    centerY += other.y;
  }

  centerX /= neighbors.length;
  centerY /= neighbors.length;

  // Calculate desired heading toward center
  const desiredHeading = Math.atan2(centerY - animal.y, centerX - animal.x);
  const angleDiff = normalizeAngle(desiredHeading - animal.heading);

  animal.angularVelocity += angleDiff * cohesionForce;
}

// Alignment: Match heading with visible neighbors
function alignWithNeighbors(animal) {
  const neighbors = getVisibleNeighbors(animal);

  if (neighbors.length === 0) return;

  // Calculate average heading using vector addition (to handle angle wraparound)
  let avgHeadingX = 0;
  let avgHeadingY = 0;

  for (let other of neighbors) {
    avgHeadingX += Math.cos(other.heading);
    avgHeadingY += Math.sin(other.heading);
  }

  const avgHeading = Math.atan2(avgHeadingY, avgHeadingX);
  const angleDiff = normalizeAngle(avgHeading - animal.heading);

  animal.angularVelocity += angleDiff * alignmentForce;
}

// Apply forward bias - animals prefer to maintain their current heading
function applyForwardBias(animal) {
  // Dampen angular velocity to maintain heading
  animal.angularVelocity *= forwardBias;
}

// Treat behavior - attract or repel from mouse position
function treatBehavior(animal) {
  if (!treatActive || mousePos.x === null || mousePos.y === null) return;

  const treatRange = 200; // Distance within which treat affects animals
  const treatForce = 0.15; // Strength of treat attraction/repulsion

  const dx = mousePos.x - animal.x;
  const dy = mousePos.y - animal.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < treatRange && dist > 0) {
    let desiredHeading;

    if (treatMode === 'attract') {
      // Move toward the treat
      desiredHeading = Math.atan2(dy, dx);
      // Speed up when chasing treat
      animal.speed += 0.2;
    } else {
      // Avoid the "threat"
      desiredHeading = Math.atan2(-dy, -dx);
      // Speed up when fleeing
      animal.speed += 0.4;
    }

    const angleDiff = normalizeAngle(desiredHeading - animal.heading);
    const distanceFactor = 1 - (dist / treatRange); // Stronger effect when closer
    animal.angularVelocity += angleDiff * treatForce * distanceFactor;
  }
}

// Limit turn rate - animals can't turn instantly
function limitTurnRate(animal) {
  if (animal.angularVelocity > maxTurnRate) {
    animal.angularVelocity = maxTurnRate;
  } else if (animal.angularVelocity < -maxTurnRate) {
    animal.angularVelocity = -maxTurnRate;
  }
}

// Limit and manage speed
function manageSpeed(animal) {
  // Apply damping (friction)
  animal.speed *= speedDamping;

  // Ensure speed stays within limits
  if (animal.speed > maxSpeed) {
    animal.speed = maxSpeed;
  } else if (animal.speed < minSpeed) {
    animal.speed = minSpeed;
  }
}

const DRAW_TRAIL = false;
const DRAW_FOV = false; // Set to true to visualize field of view

// Update UI to show current mode
function updateUI() {
  const modeIndicator = document.getElementById('mode-indicator');
  if (modeIndicator) {
    if (treatMode === 'attract') {
      modeIndicator.textContent = '🍃 ATTRACT MODE';
      modeIndicator.className = 'attract-mode';
    } else {
      modeIndicator.textContent = '⚠️ AVOID MODE';
      modeIndicator.className = 'avoid-mode';
    }
  }

  const modeText = treatMode === 'attract' ? '🍃 ATTRACT MODE' : '⚠️ AVOID MODE';
  document.title = `Goat Herd Simulation - ${modeText}`;
}

function drawAnimal(ctx, animal) {
  ctx.save();

  // Draw field of view (debug visualization)
  if (DRAW_FOV) {
    ctx.strokeStyle = "#55ff5522";
    ctx.beginPath();
    ctx.arc(animal.x, animal.y, visualRange,
            animal.heading - fieldOfView/2,
            animal.heading + fieldOfView/2);
    ctx.lineTo(animal.x, animal.y);
    ctx.closePath();
    ctx.stroke();
  }

  // Draw the animal body (goat/sheep shape)
  ctx.translate(animal.x, animal.y);
  ctx.rotate(animal.heading);

  // Body (rounded rectangle for sheep/goat)
  ctx.fillStyle = "#e8d5b7"; // Tan/cream color for goat
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = "#d4c5a9";
  ctx.beginPath();
  ctx.ellipse(14, 0, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (simple lines)
  ctx.strokeStyle = "#8b7355";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, 5);
  ctx.lineTo(-6, 12);
  ctx.moveTo(-2, 5);
  ctx.lineTo(-2, 12);
  ctx.moveTo(2, 5);
  ctx.lineTo(2, 12);
  ctx.moveTo(6, 5);
  ctx.lineTo(6, 12);
  ctx.stroke();

  // Eye (shows direction)
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(16, -2, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Draw trail
  if (DRAW_TRAIL && animal.history.length > 1) {
    ctx.strokeStyle = "#e8d5b744";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(animal.history[0][0], animal.history[0][1]);
    for (const point of animal.history) {
      ctx.lineTo(point[0], point[1]);
    }
    ctx.stroke();
  }
}

// Main animation loop
function animationLoop() {
  // Update each animal
  for (let animal of animals) {
    // Reset angular velocity each frame
    animal.angularVelocity = 0;

    // Apply behavior rules (order matters!)
    separate(animal); // Highest priority - avoid collisions
    treatBehavior(animal); // Treat attraction/avoidance
    alignWithNeighbors(animal); // Match neighbors' heading
    moveTowardCenter(animal); // Stay with the group
    keepWithinBounds(animal); // Stay on screen
    applyForwardBias(animal); // Prefer moving straight

    // Apply constraints
    limitTurnRate(animal);
    manageSpeed(animal);

    // Update heading based on angular velocity
    animal.heading += animal.angularVelocity;
    animal.heading = normalizeAngle(animal.heading);

    // Update position based on heading and speed
    animal.x += Math.cos(animal.heading) * animal.speed;
    animal.y += Math.sin(animal.heading) * animal.speed;

    // Update history for trail
    animal.history.push([animal.x, animal.y]);
    animal.history = animal.history.slice(-50);
  }

  // Clear canvas and redraw
  const ctx = document.getElementById("boids").getContext("2d");
  ctx.clearRect(0, 0, width, height);

  // Draw treat indicator if active
  if (treatActive && mousePos.x !== null && mousePos.y !== null) {
    ctx.save();

    // Draw range circle
    ctx.strokeStyle = treatMode === 'attract' ? '#4CAF5040' : '#F4433640';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mousePos.x, mousePos.y, 200, 0, Math.PI * 2);
    ctx.stroke();

    // Draw treat/threat indicator
    if (treatMode === 'attract') {
      // Draw a green leaf/treat
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2E7D32';
      ctx.beginPath();
      ctx.arc(mousePos.x - 3, mousePos.y - 3, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Draw a red warning triangle
      ctx.fillStyle = '#F44336';
      ctx.beginPath();
      ctx.moveTo(mousePos.x, mousePos.y - 10);
      ctx.lineTo(mousePos.x - 8, mousePos.y + 8);
      ctx.lineTo(mousePos.x + 8, mousePos.y + 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('!', mousePos.x, mousePos.y + 4);
    }

    ctx.restore();
  }

  for (let animal of animals) {
    drawAnimal(ctx, animal);
  }

  // Schedule next frame
  window.requestAnimationFrame(animationLoop);
}

// Initialize on page load
window.onload = () => {
  const canvas = document.getElementById("boids");

  window.addEventListener("resize", sizeCanvas, false);
  sizeCanvas();
  initAnimals();

  // Mouse tracking for treat feature
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
    treatActive = true;
  });

  canvas.addEventListener("mouseleave", () => {
    treatActive = false;
    mousePos.x = null;
    mousePos.y = null;
  });

  // Toggle treat mode with spacebar
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      treatMode = treatMode === 'attract' ? 'avoid' : 'attract';
      console.log(`Treat mode: ${treatMode}`);
      updateUI();
    }
  });

  updateUI();
  window.requestAnimationFrame(animationLoop);
};
