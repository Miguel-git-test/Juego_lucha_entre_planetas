const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-button');
const restartBtn = document.getElementById('restart-button');
const playerPlanetsHud = document.getElementById('player-planets');
const aiPlanetsHud = document.getElementById('ai-planets');

const TEAMS = {
    NEUTRAL: { color: '#555555', glow: 'rgba(85, 85, 85, 0.4)', name: 'Neutral' },
    PLAYER: { color: '#00d2ff', glow: 'rgba(0, 210, 255, 0.6)', name: 'Player' },
    AI: { color: '#ff3c5c', glow: 'rgba(255, 60, 92, 0.6)', name: 'AI' }
};

let planets = [];
let units = [];
let particles = [];
let gameState = 'START'; // START, PLAYING, GAMEOVER
let selectedPlanet = null;
let mousePos = { x: 0, y: 0 };
let isDragging = false;
let stars = [];
let currentLevel = 0;
let unlockedLevels = [0]; // Indices of unlocked levels
let wonLevels = []; // Indices of won levels

// Load progress
const savedProgress = localStorage.getItem('planetaryConquestProgress');
if (savedProgress) {
    const data = JSON.parse(savedProgress);
    unlockedLevels = data.unlocked || [0];
    wonLevels = data.won || [];
}

function saveProgress() {
    localStorage.setItem('planetaryConquestProgress', JSON.stringify({
        unlocked: unlockedLevels,
        won: wonLevels
    }));
}

// Configuration
const CONFIG = {
    PLANET_MIN_RADIUS: 25,
    PLANET_MAX_RADIUS: 50,
    UNIT_SPEED: 1.5,
    PRODUCTION_RATE: 0.02, 
    ATTACK_PERCENTAGE: 1.0, 
    AI_DECISION_INTERVAL: 2000, 
};

const LEVELS = [
    { name: "Sector Alfa", planetCount: 4, aiProduction: 0.015, aiInitialUnits: 30, aiAggression: 3000 },
    { name: "Nébula Roja", planetCount: 6, aiProduction: 0.02, aiInitialUnits: 40, aiAggression: 2500 },
    { name: "Cinturón de Orión", planetCount: 8, aiProduction: 0.022, aiInitialUnits: 50, aiAggression: 2000 },
    { name: "Súper Nova", planetCount: 10, aiProduction: 0.025, aiInitialUnits: 60, aiAggression: 1800 },
    { name: "Agujero Negro", planetCount: 12, aiProduction: 0.028, aiInitialUnits: 75, aiAggression: 1500 },
    { name: "Centro Galáctico", planetCount: 15, aiProduction: 0.035, aiInitialUnits: 100, aiAggression: 1200 }
];

class Planet {
    constructor(x, y, radius, team) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.team = team;
        this.units = team === TEAMS.NEUTRAL ? Math.floor(Math.random() * 20) : 50;
        this.maxUnits = radius * 2;
        this.productionAccumulator = 0;
    }

    update() {
        if (this.team !== TEAMS.NEUTRAL) {
            const prodRate = this.team === TEAMS.AI ? LEVELS[currentLevel].aiProduction : CONFIG.PRODUCTION_RATE;
            this.productionAccumulator += prodRate * (this.radius / 30);
            if (this.productionAccumulator >= 1) {
                this.units += Math.floor(this.productionAccumulator);
                this.productionAccumulator %= 1;
            }
        }
    }

    draw() {
        // Outer Glow
        const gradient = ctx.createRadialGradient(this.x, this.y, this.radius * 0.8, this.x, this.y, this.radius * 2);
        gradient.addColorStop(0, this.team.glow);
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Planet Body
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0c';
        ctx.fill();
        ctx.strokeStyle = this.team.color;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Selection Highlight
        if (selectedPlanet === this) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Unit Count Text
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(12, this.radius * 0.4)}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.floor(this.units), this.x, this.y);
    }
}

class Unit {
    constructor(x, y, targetPlanet, team) {
        this.x = x;
        this.y = y;
        this.target = targetPlanet;
        this.team = team;
        this.radius = 2;
        this.angle = Math.atan2(targetPlanet.y - y, targetPlanet.x - x);
        this.velocity = {
            x: Math.cos(this.angle) * CONFIG.UNIT_SPEED,
            y: Math.sin(this.angle) * CONFIG.UNIT_SPEED
        };
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;

        // Check if reached target
        const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        if (dist < this.target.radius) {
            this.hitTarget();
            return true; // Mark for removal
        }
        return false;
    }

    hitTarget() {
        if (this.target.team === this.team) {
            this.target.units++;
        } else {
            this.target.units--;
            // Collision Particles
            createExplosion(this.x, this.y, this.team.color, 3);

            if (this.target.units < 0) {
                this.target.units = Math.abs(this.target.units);
                this.target.team = this.team;
                // Capture Particles
                createExplosion(this.target.x, this.target.y, this.team.color, 20);
            }
        }
    }

    draw() {
        ctx.fillStyle = this.team.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.team.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 3 + 1;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.life -= this.decay;
        return this.life <= 0;
    }

    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function initStars() {
    stars = [];
    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2,
            opacity: Math.random()
        });
    }
}

function drawStars() {
    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        ctx.globalAlpha = star.opacity;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.globalAlpha = 1.0;
}

function initGame(levelIdx = 0) {
    currentLevel = levelIdx;
    planets = [];
    units = [];
    particles = [];
    
    const levelData = LEVELS[currentLevel];
    const isPortrait = canvas.height > canvas.width;
    const padding = 60;

    // Home base players
    if (isPortrait) {
        planets.push(new Planet(canvas.width / 2, canvas.height - padding - 40, 45, TEAMS.PLAYER));
        planets.push(new Planet(canvas.width / 2, padding + 40, 45, TEAMS.AI));
    } else {
        planets.push(new Planet(padding + 40, canvas.height / 2, 50, TEAMS.PLAYER));
        planets.push(new Planet(canvas.width - padding - 40, canvas.height / 2, 50, TEAMS.AI));
    }

    // Set AI initial units for the level
    planets.find(p => p.team === TEAMS.AI).units = levelData.aiInitialUnits;

    // Distribute neutral planets based on level
    const planetCount = levelData.planetCount;
    for (let i = 0; i < planetCount; i++) {
        let x, y, r;
        let overlapping = true;
        let attempts = 0;

        while (overlapping && attempts < 150) {
            r = Math.random() * (CONFIG.PLANET_MAX_RADIUS - CONFIG.PLANET_MIN_RADIUS) + CONFIG.PLANET_MIN_RADIUS;
            x = Math.random() * (canvas.width - r * 4) + r * 2;
            y = Math.random() * (canvas.height - r * 4) + r * 2;
            overlapping = false;
            
            for (let p of planets) {
                const dist = Math.hypot(p.x - x, p.y - y);
                if (dist < (p.radius + r) * 2.2) {
                    overlapping = true;
                    break;
                }
            }
            attempts++;
        }
        if (!overlapping) planets.push(new Planet(x, y, r, TEAMS.NEUTRAL));
    }

    // Update AI Interval
    if (aiInterval) clearInterval(aiInterval);
    aiInterval = setInterval(handleAI, levelData.aiAggression);
}

let aiInterval = null;

function handleAI() {
    if (gameState !== 'PLAYING') return;
    
    const aiPlanets = planets.filter(p => p.team === TEAMS.AI);
    if (aiPlanets.length === 0) return;

    aiPlanets.forEach(p => {
        if (p.units > 20) {
            // Find best target (closest or weakest)
            let targets = planets.filter(t => t.team !== TEAMS.AI);
            if (targets.length === 0) return;
            
            targets.sort((a, b) => {
                const distA = Math.hypot(a.x - p.x, a.y - p.y);
                const distB = Math.hypot(b.x - p.x, b.y - p.y);
                return distA - distB;
            });

            sendUnits(p, targets[0]);
        }
    });
}

function sendUnits(from, to) {
    if (from === to) return;
    const count = Math.floor(from.units * CONFIG.ATTACK_PERCENTAGE);
    from.units -= count;
    
    for (let i = 0; i < count; i++) {
        // Add slight randomness to unit spawn time/position
        setTimeout(() => {
            if (gameState === 'PLAYING') {
                const offsetX = (Math.random() - 0.5) * from.radius;
                const offsetY = (Math.random() - 0.5) * from.radius;
                units.push(new Unit(from.x + offsetX, from.y + offsetY, to, from.team));
            }
        }, i * 50); // Direct streams
    }
}

function update() {
    if (gameState !== 'PLAYING') return;

    planets.forEach(p => p.update());
    
    for (let i = units.length - 1; i >= 0; i--) {
        if (units[i].update()) {
            units.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].update()) {
            particles.splice(i, 1);
        }
    }

    // Check Victory/Defeat
    const playerAlive = planets.some(p => p.team === TEAMS.PLAYER) || units.some(u => u.team === TEAMS.PLAYER);
    const aiAlive = planets.some(p => p.team === TEAMS.AI) || units.some(u => u.team === TEAMS.AI);

    playerPlanetsHud.innerText = planets.filter(p => p.team === TEAMS.PLAYER).length;
    aiPlanetsHud.innerText = planets.filter(p => p.team === TEAMS.AI).length;

    if (!playerAlive) endGame('DEFEAT');
    if (!aiAlive) endGame('VICTORY');
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawStars();

    // Draw drag line
    if (isDragging && selectedPlanet) {
        ctx.beginPath();
        ctx.moveTo(selectedPlanet.x, selectedPlanet.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    planets.forEach(p => p.draw());
    units.forEach(u => u.draw());
    particles.forEach(p => p.draw());

    requestAnimationFrame(() => {
        update();
        draw();
    });
}

function endGame(result) {
    gameState = 'GAMEOVER';
    gameOverScreen.classList.remove('hidden');
    const title = document.getElementById('game-over-title');
    const msg = document.getElementById('game-over-msg');
    const nextBtn = document.getElementById('next-level-button');
    
    if (result === 'VICTORY') {
        title.innerText = 'SISTEMA ASEGURADO';
        title.style.background = 'linear-gradient(to right, #00d2ff, #fff)';
        title.style.webkitBackgroundClip = 'text';
        title.style.backgroundClip = 'text';
        msg.innerText = `Has conquistado el nivel ${currentLevel + 1}. La galaxia está bajo tu mando.`;
        
        // Progress logic
        if (!wonLevels.includes(currentLevel)) {
            wonLevels.push(currentLevel);
        }
        if (currentLevel + 1 < LEVELS.length && !unlockedLevels.includes(currentLevel + 1)) {
            unlockedLevels.push(currentLevel + 1);
        }
        saveProgress();
        
        if (currentLevel + 1 < LEVELS.length) {
            nextBtn.classList.remove('hidden');
        } else {
            nextBtn.classList.add('hidden');
        }
    } else {
        title.innerText = 'MISIÓN FALLIDA';
        title.style.background = 'linear-gradient(to right, #ff3c5c, #fff)';
        title.style.webkitBackgroundClip = 'text';
        title.style.backgroundClip = 'text';
        msg.innerText = 'Tus fuerzas han sido diezmadas. La galaxia cae en el caos.';
        nextBtn.classList.add('hidden');
    }
}

// Input Handlers
function getGamePos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

canvas.addEventListener('mousedown', (e) => {
    if (gameState !== 'PLAYING') return;
    const pos = getGamePos(e);
    const tappedPlanet = planets.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < p.radius);
    
    if (tappedPlanet && tappedPlanet.team === TEAMS.PLAYER) {
        // Carry over persistent selection or start a new one
        if (selectedPlanet && selectedPlanet !== tappedPlanet) {
            // Already had one selected, but clicked another of mine?
            // Optional: Treat as source change or reinforcement? 
            // Standard: Just change selection
        }
        selectedPlanet = tappedPlanet;
        isDragging = true;
    } else if (tappedPlanet && selectedPlanet) {
        // Tapped a different planet while one was selected (Two-Tap)
        sendUnits(selectedPlanet, tappedPlanet);
        selectedPlanet = null;
        isDragging = false;
    } else {
        // Tapped background
        selectedPlanet = null;
        isDragging = false;
    }
});

window.addEventListener('mousemove', (e) => {
    mousePos = getGamePos(e);
});

window.addEventListener('mouseup', (e) => {
    if (!isDragging || !selectedPlanet) return;
    const pos = getGamePos(e);
    const target = planets.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < p.radius);
    
    // Distinguish between Drag-and-Drop and Toggle-Selection
    // If we released on a DIFFERENT planet, it's a drag attack.
    if (target && target !== selectedPlanet) {
        sendUnits(selectedPlanet, target);
        selectedPlanet = null;
    } 
    // If we released on the SAME planet, keep it selected for Two-Tap.
    
    isDragging = false;
});

// Touch support
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameState !== 'PLAYING') return;
    const pos = getGamePos(e);
    const tappedPlanet = planets.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < p.radius);

    if (tappedPlanet && tappedPlanet.team === TEAMS.PLAYER) {
        selectedPlanet = tappedPlanet;
        isDragging = true;
    } else if (tappedPlanet && selectedPlanet) {
        sendUnits(selectedPlanet, tappedPlanet);
        selectedPlanet = null;
        isDragging = false;
    } else {
        selectedPlanet = null;
        isDragging = false;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    mousePos = getGamePos(e);
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!isDragging || !selectedPlanet) return;
    const pos = getGamePos(e);
    const target = planets.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < p.radius);
    
    if (target && target !== selectedPlanet) {
        sendUnits(selectedPlanet, target);
        selectedPlanet = null;
    }
    
    isDragging = false;
}, { passive: false });

// UI Handlers
const levelSelectorScreen = document.getElementById('level-selector-screen');
const levelGrid = document.getElementById('level-grid');
const backToStartBtn = document.getElementById('back-to-start');
const nextLevelBtn = document.getElementById('next-level-button');
const menuBtn = document.getElementById('menu-button');

function updateLevelGrid() {
    levelGrid.innerHTML = '';
    LEVELS.forEach((level, index) => {
        const btn = document.createElement('div');
        btn.className = 'level-button';
        if (!unlockedLevels.includes(index)) {
            btn.classList.add('locked');
        } else {
            btn.innerText = index + 1;
            if (wonLevels.includes(index)) {
                btn.classList.add('won');
            }
            btn.addEventListener('click', () => {
                levelSelectorScreen.classList.add('hidden');
                gameState = 'PLAYING';
                initGame(index);
            });
        }
        levelGrid.appendChild(btn);
    });
}

startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    levelSelectorScreen.classList.remove('hidden');
    updateLevelGrid();
});

backToStartBtn.addEventListener('click', () => {
    levelSelectorScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});

restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    gameState = 'PLAYING';
    initGame(currentLevel);
});

nextLevelBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    gameState = 'PLAYING';
    initGame(currentLevel + 1);
});

menuBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    gameState = 'START';
});

// Resize
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initStars();
}

window.addEventListener('resize', resize);
resize();
draw();
