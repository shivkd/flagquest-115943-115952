import React, { useRef, useEffect, useState } from "react";
import "./App.css";

/*
  ==============================
  CARTOON SCI-FI STYLE INTEGRATION
  ==============================
  - Uses vibrant palette, pronounced visual polish, glow/shadow, roundness.
  - All core palette colors are extracted from CSS variables (see App.css).
  - Placeholder assets: Game elements are drawn as stylized, rounded shapes (to be swapped with assets later).
  - Sound support: Use playSound helper to trigger SFX on important actions.
  - To integrate custom SFX, add files to /src/assets/sfx/ and update playSound mapping.
  - To integrate sprite art: Replace in-canvas drawing with drawing Image objects or Sprite components in future.
*/

/**
 * PUBLIC_INTERFACE
 * FlagQuest: Full feature 2D capture-the-flag game, minimal UI.
 * - Player (WASD/arrows), multiple bots (unique paths), flag, drop zone, obstacles (level/difficulty).
 * - Minimalistic scoreboard, timer (90s), game/level state, buttons (Start, Pause, Restart).
 * - Colors: primary (#2196f3), secondary (#43a047), accent (#ff9800).
 * - Responsive for small screens.
 */

/* ---- Constants, color palette from cartoon-sci-fi theme ---- */
const CANVAS_W = 440;
const CANVAS_H = 320;

const PLAYER_SIZE = 24;
const BOT_SIZE = 24;
const FLAG_SIZE = 18;
const PLAYER_SPEED = 3.2;
const BASE_BOT_SPEED = 2.1;
const FLAG_ZONE_RADIUS = 34;
const DROP_BOX_SIZE = 32;
const SESSION_TIME = 90;
const BASE_NUM_BOTS = 2;
const BASE_NUM_OBSTACLES = 0;
const MAX_LEVEL = 8;

// Pull cartoon sci-fi palette using CSS vars for consistent theming
function getCssVar(v, fallback) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(v) || fallback;
}
const CLR_PRI = getCssVar('--sci-primary', '#46cbf9').trim() || "#46cbf9";
const CLR_SEC = getCssVar('--sci-secondary', '#9bff4a').trim() || "#9bff4a";
const CLR_ACC = getCssVar('--sci-accent', '#ffd44d').trim() || "#ffd44d";
const CLR_BOT = getCssVar('--sci-magenta', '#ff7bfa').trim() || "#ff7bfa";
const CLR_BOT_DARK = "#d13ce6";

/* ---- Utility helpers ---- */



// Compute a direction vector (normalized)
function dirVec(dx, dy) {
  let mag = Math.sqrt(dx * dx + dy * dy);
  if (!mag) return { x: 1, y: 0 };
  return { x: dx / mag, y: dy / mag };
}


function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}
function randomPos(w, h, margin = 20) {
  return {
    x: Math.random() * (w - 2 * margin) + margin,
    y: Math.random() * (h - 2 * margin) + margin,
  };
}
function randomDropBox(w, h, margin = 55) {
  let pos;
  do {
    pos = randomPos(w, h, margin);
  } while (pos.x < w / 2.1);
  return pos;
}
function randomObstacleRect(w, h) {
  // Size: 40~70w x 15~28h
  const ow = 38 + Math.random() * 34;
  const oh = 16 + Math.random() * 13;
  const margin = 28;
  let ox, oy;
  let maxTry = 30;
  do {
    ox = margin + Math.random() * (w - ow - 2 * margin);
    oy = margin + Math.random() * (h - oh - 2 * margin);
    maxTry--;
    // Don't start too close to "home zones"
  } while ((ox < 80 || ox + ow > w - 80) && maxTry > 0); 
  return { x: ox, y: oy, w: ow, h: oh };
}

// ---- Obstacle collision for circle (entity) ----
function isCircleRectColliding(cx, cy, cr, ox, oy, ow, oh) {
  // clamp cx/cy to nearest rectangle edge, check inside circle
  const nx = clamp(cx, ox, ox + ow), ny = clamp(cy, oy, oy + oh);
  const dx = cx - nx, dy = cy - ny;
  return dx*dx + dy*dy < cr*cr;
}

/* ---- Main Game State, including shooting/bullet/enemy HP additions ---- */
function App() {
  // --- Core state
  const [player, setPlayer] = useState({
    x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0, isJumping: false,
    jumpPhase: 0, facing: 1, isShooting: false, shootAnim: 0, canShoot: true
  });
  const [bots, setBots] = useState([]);
  const [flag, setFlag] = useState({ x: 0, y: 0, heldBy: null, home: true });
  const [dropBox, setDropBox] = useState(null);
  const [obstacles, setObstacles] = useState([]);
  const [level, setLevel] = useState(1);
  const [difficulty, setDifficulty] = useState(1);
  const [timer, setTimer] = useState(SESSION_TIME);
  const [running, setRunning] = useState(false);
  const [gamestate, setGamestate] = useState("ready"); // "ready" "running" "paused" "over"
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState("");
  const [showLevelCompleted, setShowLevelCompleted] = useState(false);
  const [showLevelFailed, setShowLevelFailed] = useState(false);

  // Shooting mechanic state
  const [bullets, setBullets] = useState([]);
  // Track enemy HP: map bot.id to { hp: 3, hitAnim: 0 }
  const [enemyHp, setEnemyHp] = useState({});

  // --- Controls, Refs
  const canvasRef = useRef(null);
  const keyState = useRef({});
  const mouseState = useRef({ mouseAngle: 0, mousePos: null }); // For extensibility (future enhancements: aim at mouse)
  const shootCooldown = useRef(false);

  // --- Derived counts
  const numBots = BASE_NUM_BOTS + Math.floor((level - 1) / 2);
  const numObstacles = BASE_NUM_OBSTACLES + Math.max(level - 1, 0);

  // --- On mount & level up: initialize field
  useEffect(() => {
    // Place flag in random area not in drop box/obstacle/player start
    const newFlag = { ...randomPos(CANVAS_W, CANVAS_H, 30), heldBy: null, home: true };
    setFlag(newFlag);
    // Player at left, reset shooting/jump state
    setPlayer({
      x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0, isJumping: false,
      jumpPhase: 0, facing: 1, isShooting: false, shootAnim: 0, canShoot: true
    });
    // AI bots: staggered at right, new HP
    const botsArr = Array.from({ length: numBots }, (_, i) => ({
      id: i + 1,
      x: CANVAS_W - 40 - (i * 33),
      y: 1.4 * CANVAS_H / 3 + (i * 27),
      dx: 0, dy: 0, score: 0,
      params: {
        offset: (i * Math.PI) / numBots,
        swing: 18 + Math.random() * 11,
        pursuitBias: 0.4 + 0.3 * (i / Math.max(numBots - 1, 1)),
      },
      isJumping: false, jumpPhase: 0
    }));
    setBots(botsArr);

    // Set HP for each bot (3 for each)
    let newHp = {};
    for (let b of botsArr) newHp[b.id] = { hp: 3, hitAnim: 0 };
    setEnemyHp(newHp);

    setDropBox(null);
    const obsList = [];
    let added = 0, tryCount = 0;
    while (added < numObstacles && tryCount < 50) {
      const obs = randomObstacleRect(CANVAS_W, CANVAS_H);
      let overlaps = false;
      if (dist(obs.x, obs.y, 60, CANVAS_H / 2) < 75 ||
        dist(obs.x + obs.w, obs.y + obs.h, 60, CANVAS_H / 2) < 68)
        overlaps = true;
      if (!overlaps && dist(obs.x, obs.y, newFlag.x, newFlag.y) < 55)
        overlaps = true;
      if (!overlaps) {
        obsList.push(obs);
        added++;
      }
      tryCount++;
    }
    setObstacles(obsList);
    setBullets([]);
    setTimer(SESSION_TIME);
    setMessage("");
    setWinner(null);
    setGamestate("ready");
    setRunning(false);
    setShowLevelCompleted(false);
    setShowLevelFailed(false);
  // eslint-disable-next-line
  }, [level]);

  // --- Timer
  useEffect(() => {
    if (!running) return;
    if (timer <= 0) {
      setGamestate("over");
      setRunning(false);
      setMessage("Time's up!");
      setWinner("bot");
      setDropBox(null);
      return;
    }
    const t = setInterval(() => { setTimer(s => (s > 0 ? s - 1 : 0)); }, 1000);
    return () => clearInterval(t);
  }, [running, timer]);

  // --- Keyboard controls: listen while component active
  useEffect(() => {
    // --- Key/mouse controls: movement, jump/attack (space), shoot (J, K, mouse LMB)
    function handleDown(e) {
      // Movement
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = true;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = true;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = true;
      if (e.key === "p" || e.key === "P") { if(running) handlePause(); }
      // JUMP (space)
      if ((e.key === " " || e.key === "Spacebar") && !player.isJumping && running) {
        setPlayer(pl => ({ ...pl, isJumping: true, jumpPhase: 0 }));
      }
      // SHOOT (J or K or Z, future: mouse)
      if (["j","J","k","K","z","Z"].includes(e.key)) {
        shootBullet();
      }
    }
    function handleUp(e) {
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = false;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = false;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = false;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = false;
    }
    function handleMouseDown(e) {
      if (e.button === 0 && running) {
        shootBullet();
      }
    }
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  // eslint-disable-next-line
  }, [player.isJumping, running, player.canShoot]);
  // --- Game logic loop (player/bots/flag/obstacles/collisions/progress/bullets/jump/attack) ---
  useEffect(() => {
    let anim;
    let prevTimestamp = performance.now();

    function isMoveAllowed(nx, ny, rad, obsList) {
      for (let o of obsList) if (isCircleRectColliding(nx, ny, rad, o.x, o.y, o.w, o.h)) return false;
      if (nx < rad || ny < rad || nx > CANVAS_W - rad || ny > CANVAS_H - rad) return false;
      return true;
    }

    function gameTick(timestamp) {
      if (gamestate !== "running") return;
      const delta = timestamp - prevTimestamp;
      prevTimestamp = timestamp;

      // --- Handle Player Movement ---
      let [px, py] = [player.x, player.y];
      let pvx = 0, pvy = 0;
      if (keyState.current.up) pvy -= PLAYER_SPEED;
      if (keyState.current.down) pvy += PLAYER_SPEED;
      if (keyState.current.left) pvx -= PLAYER_SPEED;
      if (keyState.current.right) pvx += PLAYER_SPEED;
      if (pvx !== 0 || pvy !== 0) {
        const nm = Math.sqrt(pvx * pvx + pvy * pvy) || 1;
        pvx = (pvx / nm) * PLAYER_SPEED;
        pvy = (pvy / nm) * PLAYER_SPEED;
      }
      // Flip player facing
      let lastFace = player.facing;
      if (pvx > 0) lastFace = 1;
      if (pvx < 0) lastFace = -1;
      // Try new position, if not blocked
      if (isMoveAllowed(px + pvx, py + pvy, PLAYER_SIZE / 2, obstacles)) {
        px = clamp(px + pvx, PLAYER_SIZE / 2, CANVAS_W - PLAYER_SIZE / 2);
        py = clamp(py + pvy, PLAYER_SIZE / 2, CANVAS_H - PLAYER_SIZE / 2);
      }
      else {
        if (isMoveAllowed(px + pvx, py, PLAYER_SIZE / 2, obstacles)) px += pvx;
        else if (isMoveAllowed(px, py + pvy, PLAYER_SIZE / 2, obstacles)) py += pvy;
      }

      // --- Jump Animation Progress ---
      let plJumpPhase = player.jumpPhase, plIsJump = player.isJumping;
      if (plIsJump) {
        plJumpPhase += 0.14 * (delta / 16.7); // speed up or slow down as appropriate
        // When jump completes, reset
        if (plJumpPhase > Math.PI) {
          plIsJump = false;
          plJumpPhase = 0;
        }
      }

      // --- Shooting Animation/Cooldown Progress ---
      let plShootAnim = player.shootAnim;
      let plIsShoot = player.isShooting;
      let canShoot = player.canShoot;
      if (plIsShoot) {
        plShootAnim += Math.PI / 5;
        if (plShootAnim > Math.PI) {
          plIsShoot = false;
          plShootAnim = 0;
        }
      }

      // --- Bots AI & Jump Animation ---
      let botArr = bots.map((bot, i, allBots) => {
        let { params } = bot;
        let tgtX = player.x;
        let tgtY = player.y;
        let speed = BASE_BOT_SPEED + 0.09 * (level - 1) + 0.12 * (i);
        let bias = params.pursuitBias + .33 * (level - 1) / MAX_LEVEL;
        let angle = Math.atan2(tgtY - bot.y, tgtX - bot.x);
        angle += Math.sin(performance.now()/900 + params.offset * 3) * (0.08 + 0.03 * i);
        let swingDist = params.swing + 3.2 * level;
        let toAvoid = allBots.reduce((sum, ob) => ob !== bot && dist(bot.x, bot.y, ob.x, ob.y) < 22 ? sum + Math.sign(bot.x - ob.x) : sum, 0);
        if (toAvoid) angle += 0.11 * toAvoid;
        let wantX = bot.x + Math.cos(angle) * speed * bias + Math.cos(angle + 1.5) * speed * (1 - bias) * 0.49 + toAvoid;
        let wantY = bot.y + Math.sin(angle) * speed * bias + Math.sin(angle + 1.7) * speed * (1 - bias) * 0.51 + toAvoid;
        let ballRad = BOT_SIZE / 2;
        // Bots jump with a random chance (future: more intelligent)
        let bIsJump = bot.isJumping, bJumpPhase = bot.jumpPhase;
        if (!bIsJump && Math.random() < 0.018 && Math.abs(wantY - bot.y) > 4) bIsJump = true;
        if (bIsJump) {
          bJumpPhase += 0.10 * (delta / 16.7);
          if (bJumpPhase > Math.PI) { bIsJump = false; bJumpPhase = 0; }
        }
        // Move as usual
        if (isMoveAllowed(wantX, wantY, ballRad, obstacles)) {
          return { ...bot, x: clamp(wantX, ballRad, CANVAS_W - ballRad), y: clamp(wantY, ballRad, CANVAS_H - ballRad), isJumping: bIsJump, jumpPhase: bJumpPhase }
        } else if (isMoveAllowed(bot.x + speed, bot.y, ballRad, obstacles)) {
          return { ...bot, x: clamp(bot.x + speed, ballRad, CANVAS_W - ballRad), isJumping: bIsJump, jumpPhase: bJumpPhase }
        } else if (isMoveAllowed(bot.x, bot.y + speed, ballRad, obstacles)) {
          return { ...bot, y: clamp(bot.y + speed, ballRad, CANVAS_H - ballRad), isJumping: bIsJump, jumpPhase: bJumpPhase }
        }
        return { ...bot, isJumping: bIsJump, jumpPhase: bJumpPhase };
      });

      // --- Bullets: move, animate, handle collisions with bots ---
      let newBullets = [];
      let newEnemyHp = { ...enemyHp };
      let anyBotHit = false;
      let hpDelta = false;
      let botsToDefeat = new Set();

      for (let bullet of bullets) {
        // Move bullet along vx, vy
        let bx = bullet.x + bullet.vx, by = bullet.y + bullet.vy;
        // Out of range? (max 520px from fire origin)
        let traveled = dist(bullet.origin.x, bullet.origin.y, bx, by);
        let dead = false;
        if (bx < 0 || by < 0 || bx > CANVAS_W || by > CANVAS_H || traveled > 520) dead = true;
        // Check collision with bots if bullet still alive
        let hitBotIdx = -1;
        bots.forEach((b, i) => {
          if (dist(b.x, b.y, bx, by) < BOT_SIZE/2 + 8 && !dead && (newEnemyHp[b.id]?.hp > 0)) {
            hitBotIdx = i;
            anyBotHit = true;
          }
        });
        if (hitBotIdx !== -1) {
          let bot = bots[hitBotIdx];
          let hpEnt = newEnemyHp[bot.id] || { hp: 3, hitAnim: 0 };
          hpEnt.hp -= 1; // lose HP
          hpEnt.hitAnim = 1.0; // flash animation
          newEnemyHp[bot.id] = hpEnt;
          // If HP drops to 0, mark bot for defeat
          if (hpEnt.hp <= 0) botsToDefeat.add(bot.id);
          hpDelta = true;
          continue; // Bullet is destroyed on hit
        }
        if (!dead) newBullets.push({ ...bullet, x: bx, y: by, age: bullet.age + 1 });
      }

      // --- Enemy defeat removal ---
      let remainingBots = botArr.filter(b => !(botsToDefeat.has(b.id)));
      if (botsToDefeat.size) {
        // Spark "defeat" animation? (future: add visual effect), currently just remove
      }

      // --- Enemy hit animation timer decay ---
      for (let k in newEnemyHp) {
        if (newEnemyHp[k].hitAnim > 0) {
          newEnemyHp[k] = { ...newEnemyHp[k], hitAnim: Math.max(0, newEnemyHp[k].hitAnim - 0.12) };
        }
      }

      // --- Check player collision with flag, etc ---
      let newFlag = { ...flag };
      if (!flag.heldBy && dist(px, py, flag.x, flag.y) < (PLAYER_SIZE + FLAG_SIZE) / 2 + 2) {
        newFlag.heldBy = "player";
        newFlag.home = false;
        setDropBox(randomDropBox(CANVAS_W, CANVAS_H, 58));
      }

      // --- Bots catch player (game over) ---
      let botCaught = false;
      for (let b of remainingBots) {
        if (dist(px, py, b.x, b.y) < (PLAYER_SIZE + BOT_SIZE) / 2 - 2) botCaught = true;
      }

      // --- Drop box/score completion ---
      let playerScored = false;
      if (flag.heldBy === "player" && dropBox && dist(px, py, dropBox.x, dropBox.y) < (PLAYER_SIZE + DROP_BOX_SIZE)/2 + 4) {
        playerScored = true;
      }

      // --- Level/game state ---
      let newPlayerScore = player.score;
      let newWin = null;
      if (playerScored) {
        newPlayerScore += 1;
        setShowLevelCompleted(true);
        setMessage(`Level ${level} Completed! Press R to retry or advance.`);
        if (level >= MAX_LEVEL) {
          setGamestate("over");
          setWinner("player");
          setShowLevelCompleted(false);
          setMessage("Congratulations! You beat all levels!");
        }
        setDropBox(null);
        setRunning(false);
        setGamestate("postlevel");
      }
      if (botCaught) {
        newWin = "bot";
        setGamestate("over");
        setWinner("bot");
        setShowLevelFailed(true);
        setMessage("You Failed! Press R to retry this level.");
        setDropBox(null);
        setRunning(false);
        setGamestate("failed");
      }

      // Flag follows player if holding
      if (newFlag.heldBy === "player") {
        newFlag.x = px; newFlag.y = py;
      }

      // --- Apply state updates for animation/FX ---
      setPlayer(p => ({
        ...p, x: px, y: py, score: newPlayerScore,
        facing: lastFace,
        isJumping: plIsJump, jumpPhase: plJumpPhase,
        isShooting: plIsShoot, shootAnim: plShootAnim
      }));
      setBots(remainingBots);
      setFlag(newFlag);
      setBullets(newBullets);
      setEnemyHp(newEnemyHp);

      // Re-frame game if not won/lost
      if (!newWin && !playerScored && gamestate === "running")
        anim = requestAnimationFrame(gameTick);
    }
    if (gamestate === "running") anim = requestAnimationFrame(gameTick);
    return () => { if (anim) cancelAnimationFrame(anim); };
  // eslint-disable-next-line
  }, [gamestate, running, player, bots, flag, dropBox, obstacles, level, bullets, enemyHp]);

  // --- Bullet shooting API ---
  // PUBLIC_INTERFACE
  function shootBullet() {
    // Gun cooldown (350ms)
    if (!player.canShoot || !running) return;
    let px = player.x, py = player.y;
    // Facing: right or left, for extensibility could use mouse for aim
    let dir = { x: player.facing, y: 0 };
    // Future: aim via mouse angle in mouseState, for now just left/right
    let vx = dir.x * 8.7, vy = dir.y * 8.7;
    // Bullet spawns at gun tip
    let gunTipX = px + dir.x * (PLAYER_SIZE/2 + 11), gunTipY = py - 8;
    setBullets(bu => [...bu, {
      x: gunTipX, y: gunTipY,
      vx, vy,
      origin: { x: px, y: py },
      age: 0
    }]);
    setPlayer(pl => ({
      ...pl, isShooting: true, shootAnim: 0, canShoot: false
    }));
    // Cooldown
    shootCooldown.current = true;
    setTimeout(() => {
      shootCooldown.current = false;
      setPlayer(pl => ({ ...pl, canShoot: true }));
    }, 350);
  }

  // --- Rendering the canvas/game area
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Field background
    ctx.fillStyle = "#f9fbfc";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Player and bot home zones
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, CANVAS_H/2, FLAG_ZONE_RADIUS, Math.PI/2, Math.PI*1.5, false);
    ctx.fillStyle = "#e7f8ef";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CANVAS_W, CANVAS_H/2, FLAG_ZONE_RADIUS, Math.PI*1.5, Math.PI/2, false);
    ctx.fillStyle = "#f9e7e7";
    ctx.fill();
    ctx.restore();

    // Obstacles (rects, color secondary/accent)
    obstacles.forEach((o, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = i%2===0 ? "#87e7ce" : "#fffbea";
      ctx.globalAlpha = .83;
      ctx.shadowColor = "#43a04788";
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#43a047";
      ctx.stroke();
      ctx.restore();
    });

    // Drop box if active
    if (dropBox) {
      ctx.save();
      ctx.globalAlpha = 0.93;
      ctx.beginPath();
      ctx.rect(
        dropBox.x - DROP_BOX_SIZE / 2,
        dropBox.y - DROP_BOX_SIZE / 2,
        DROP_BOX_SIZE, DROP_BOX_SIZE
      );
      ctx.fillStyle = CLR_SEC;
      ctx.strokeStyle = "#217c43";
      ctx.shadowColor = "#43a04799";
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = "bold 14px Arial";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("Drop-Off", dropBox.x, dropBox.y - DROP_BOX_SIZE / 2 - 6);
      ctx.restore();
    }

    // Flag home zone (dashed)
    if (flag.home) {
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "#bbb";
      ctx.beginPath();
      ctx.arc(flag.x, flag.y, 22, 0, 2 * Math.PI, false);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // --- FLAG: More realistic, cartoon sci-fi, with folds, shadows and shiny pole/base
    /*
      POLISHED FLAG REDESIGN (Cartoon sci-fi):
      - Triangular banner with subtle curves (simulated fabric folds)
      - Highlights and shadow for dynamic "wrinkle"
      - Shiny, round metal pole + base for sci-fi feel
      - Placeholder; swap with sprite/image later for more realism
    */
    ctx.save();
    ctx.translate(flag.x, flag.y);
    ctx.rotate(-Math.PI / 14);

    // Flag pole (gradient for metal sci-fi shininess)
    let poleLength = FLAG_SIZE + 9;
    let poleGrad = ctx.createLinearGradient(0, 0, 0, poleLength);
    poleGrad.addColorStop(0, "#c7e4fa");
    poleGrad.addColorStop(0.32, "#68abec");
    poleGrad.addColorStop(1, "#5cc1ff");
    ctx.beginPath();
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = poleGrad;
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(-2.5, poleLength);
    ctx.stroke();

    // Pole base (shiny metallic base circle)
    ctx.beginPath();
    ctx.arc(-2.5, poleLength + 4, 5, 0, 2 * Math.PI);
    let baseGrad = ctx.createRadialGradient(-2.5, poleLength + 4, 1, -2.5, poleLength + 4, 5);
    baseGrad.addColorStop(0, "#fffbdc");
    baseGrad.addColorStop(1, "#78deff");
    ctx.fillStyle = baseGrad;
    ctx.globalAlpha = 0.93;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Flag shape with dynamic curved edge to mimic flutter/fold
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(FLAG_SIZE, -FLAG_SIZE / 2.2); // top point
    // Arc bottom edge for "flutter"
    ctx.quadraticCurveTo(
      FLAG_SIZE * 0.95,
      FLAG_SIZE * 0.46 + Math.sin(performance.now()/430) * 4,
      FLAG_SIZE * 0.7,
      FLAG_SIZE / 2.4
    );
    ctx.lineTo(0, FLAG_SIZE * 0.31);
    ctx.closePath();

    // Main fill (bright when held by player, accent otherwise, with soft highlight)
    let flagColor = flag.heldBy === "player" ? CLR_PRI : CLR_ACC;
    let flagGrad = ctx.createLinearGradient(0, 0, FLAG_SIZE * 1.1, 0);
    flagGrad.addColorStop(0, "#fffefd");
    flagGrad.addColorStop(0.11, flagColor);
    flagGrad.addColorStop(1, "#bbf4fa");

    ctx.fillStyle = flagGrad;
    ctx.globalAlpha = 0.95;
    ctx.shadowColor = "#55daffb0";
    ctx.shadowBlur = 7;
    ctx.fill();

    // Fabric folds: gentle darker/sparkly lines
    ctx.globalAlpha = 0.3;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(FLAG_SIZE * 0.57, -FLAG_SIZE * 0.14);
    ctx.quadraticCurveTo(
      FLAG_SIZE * 0.8,
      2 + Math.sin(performance.now()/350) * 5,
      FLAG_SIZE * 0.45,
      FLAG_SIZE * 0.19
    );
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#2af9e954";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(FLAG_SIZE * 0.9, -FLAG_SIZE * 0.2);
    ctx.bezierCurveTo(
      FLAG_SIZE * 0.94,
      2 + Math.cos(performance.now()/410) * 2,
      FLAG_SIZE * 0.84,
      FLAG_SIZE * 0.18,
      FLAG_SIZE * 0.66,
      FLAG_SIZE * 0.24
    );
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = "#2c9bfa3c";
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Glow around flag edge for sci-fi polish
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(FLAG_SIZE, -FLAG_SIZE / 2.2);
    ctx.quadraticCurveTo(
      FLAG_SIZE * 0.95,
      FLAG_SIZE * 0.46,
      FLAG_SIZE * 0.7,
      FLAG_SIZE / 2.4
    );
    ctx.lineTo(0, FLAG_SIZE * 0.31);
    ctx.closePath();
    ctx.shadowColor = flag.heldBy === "player" ? "#11e9ffaa" : "#ffd44dcc";
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();

    // Outline
    ctx.lineWidth = 1.56;
    ctx.strokeStyle = "#225";
    ctx.globalAlpha = 0.82;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    ctx.restore();

    // --- PLAYER: Cartoon-SciFi Robot, now with Jump, Gun/Attack Animation ---
    ctx.save();
    ctx.translate(player.x, player.y);

    // --- JUMP: vertical offset for body/limbs ---
    let jumpYOffset = player.isJumping
      ? -Math.abs(Math.sin(player.jumpPhase)) * 22
      : 0;

    // --- SHADOW: Player shadow (soft oval) ---
    ctx.save();
    ctx.globalAlpha = player.isJumping
      ? 0.21 + 0.15 * Math.abs(Math.cos(player.jumpPhase))
      : 0.39;
    let shadowWidth = player.isJumping
      ? 15 + 7 * Math.cos(player.jumpPhase)
      : 23;
    ctx.beginPath();
    ctx.ellipse(0, 32, shadowWidth, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1581ab29";
    ctx.filter = "blur(1.5px)";
    ctx.fill();
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();

    // --- Running/JUMPING phase for limbs/torso/face ---
    let moving =
      (keyState.current.up || keyState.current.down || keyState.current.left ||
        keyState.current.right) && gamestate === "running";
    let t = performance.now() / 430;
    let limbCycle = moving ? t * 3.6 : 0;
    let legSwing = moving ? Math.sin(limbCycle) * 18 : 0;
    let legKick = moving ? Math.cos(limbCycle) * 15 : 0;
    let armSwing = moving ? Math.cos(limbCycle) * 17 : 0;
    let bodyTilt = moving ? Math.sin(limbCycle) * 3 : 0;
    // If jumping, tilt/arms more vertical
    if (player.isJumping) {
      bodyTilt -= Math.sin(player.jumpPhase) * 6;
      armSwing += Math.sin(player.jumpPhase) * 7;
    }

    let outerGlow = moving ? "#18eaff" : "#6cf9ea";
    ctx.rotate(bodyTilt * Math.PI / 180);
    ctx.translate(0, jumpYOffset);

    // --- LEGS/JUMP: bounce higher while jumping
    let legs = [
      {
        x1: -7, y1: 15,
        kneeX: -8 + Math.sin(limbCycle) * 2,
        kneeY: 24 + Math.abs(Math.cos(limbCycle)) * 6,
        footX: -10, footY: 31 + Math.abs(Math.sin(limbCycle)) * 3 + (jumpYOffset / 1.9),
        swing: legSwing * 0.8
      },
      {
        x1: +7, y1: 15,
        kneeX: +8 - Math.sin(limbCycle) * 2,
        kneeY: 24 + Math.abs(Math.cos(limbCycle + Math.PI)) * 6,
        footX: +10, footY: 31 + Math.abs(Math.sin(limbCycle + Math.PI)) * 3 + (jumpYOffset / 1.9),
        swing: -legSwing * 0.7
      }
    ];
    legs.forEach((leg, i) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(leg.x1, leg.y1);
      ctx.lineTo(leg.kneeX, leg.kneeY + leg.swing / 6);
      ctx.lineWidth = 5.3;
      ctx.strokeStyle = "#b8efff";
      ctx.shadowColor = "#9ff";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(leg.kneeX, leg.kneeY + leg.swing / 6);
      ctx.lineTo(leg.footX, leg.footY + leg.swing / 3);
      ctx.lineWidth = 4.0;
      ctx.strokeStyle = "#1fc1ec";
      ctx.shadowColor = "#1cfaff";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Joints
      ctx.beginPath();
      ctx.arc(leg.kneeX, leg.kneeY + leg.swing / 6, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = "#e6edfc";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(leg.footX, leg.footY + leg.swing / 3, 3.3, 2.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = "#17f9ffbb";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    });

    // --- Torso ---
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 5, 11, 14, 0, 0, Math.PI * 2);
    let torsoGrad = ctx.createLinearGradient(-16, 6, 12, 26);
    torsoGrad.addColorStop(0.08, "#80eeff");
    torsoGrad.addColorStop(0.4, "#44bbec");
    torsoGrad.addColorStop(0.6, "#c3edfd");
    torsoGrad.addColorStop(0.96, "#70e6f9");
    ctx.fillStyle = torsoGrad;
    ctx.shadowColor = outerGlow;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#a5feff77";
    ctx.beginPath();
    ctx.ellipse(0, 11, 8, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Glow wire accent
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.bezierCurveTo(-1, 18, 1, 8, 7, 14.5);
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = "#fafe57";
    ctx.shadowColor = "#fe0";
    ctx.shadowBlur = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();

    // --- Arms: One equipped w/ gun and attack animation
    // Arm[0]=left, Arm[1]=right (right is gun hand). Player.facing controls mirror
    let flip = player.facing === -1 ? -1 : 1;

    // GUN ARM: fire/flash when attacking
    let shootAnim = player.shootAnim;
    let gunArmRaised = player.isShooting && shootAnim < Math.PI * 0.73;
    let muzzleFlash = player.isShooting && shootAnim > Math.PI * 0.1 && shootAnim < Math.PI * 0.63;

    // Left (non-gun) arm
    (() => {
      let ax = -10 * flip, ay = -2, shx = -17 * flip, shy = 6 + Math.sin(limbCycle) * 7, hx = -21 * flip, hy = 20 + Math.sin(limbCycle) * 8;
      ctx.save();
      ctx.scale(flip, 1);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ax * flip, ay);
      ctx.lineTo(shx * flip, shy);
      ctx.lineWidth = 4.8;
      ctx.strokeStyle = "#abdfff";
      ctx.shadowColor = "#87e6ffc8"; ctx.shadowBlur = 5.2; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(shx * flip, shy);
      ctx.lineTo(hx * flip, hy);
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = "#19eff2";
      ctx.shadowColor = "#7ef8fd"; ctx.shadowBlur = 3; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(shx * flip, shy, 2.2, 0, Math.PI * 2);
      ctx.arc(hx * flip, hy, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.93; ctx.shadowColor = "#c7fcff"; ctx.shadowBlur = 3; ctx.fill(); ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();
      // Wire accent
      ctx.save(); ctx.scale(flip, 1); ctx.globalAlpha = 0.46; ctx.beginPath();
      ctx.moveTo(ax * flip, ay + 2); ctx.bezierCurveTo(shx * flip, shy + 3, shx * flip - 3 * flip, (hy + shy) / 2, hx * flip - 2 * flip, hy + 2);
      ctx.lineWidth = 1.5; ctx.strokeStyle = "#2dfeff"; ctx.shadowColor = "#2afffa"; ctx.shadowBlur = 4; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
    })();

    // Right (gun) arm: draws up when shooting, shows gun and muzzle
    (() => {
      let shootLift = gunArmRaised ? -24 : 0;
      let bulletArmSwing = gunArmRaised ? -19 : Math.cos(limbCycle) * 17;
      let gunX = 17 * flip, gunY = 6 + shootLift / 2;
      let hx = 23 * flip, hy = shootLift + 14 + Math.sin(limbCycle)*8 * (gunArmRaised?0.1:1);
      ctx.save();
      ctx.scale(flip, 1);
      ctx.lineCap = "round";
      // Shoulder to elbow
      ctx.beginPath();
      ctx.moveTo(10 * flip, -2 + jumpYOffset / 9);
      ctx.lineTo(gunX, gunY);
      ctx.lineWidth = 4.7;
      ctx.strokeStyle = "#fcffba";
      ctx.shadowColor = "#c7eeff"; ctx.shadowBlur = 5.1; ctx.stroke(); ctx.shadowBlur = 0;
      // Elbow to hand
      ctx.beginPath();
      ctx.moveTo(gunX, gunY);
      ctx.lineTo(hx, hy);
      ctx.lineWidth = 4.3;
      ctx.strokeStyle = "#26c9ed";
      ctx.shadowColor = "#7ef8fd"; ctx.shadowBlur = 3; ctx.stroke(); ctx.shadowBlur = 0;
      // Arm joints
      ctx.beginPath();
      ctx.arc(gunX, gunY, 2.2, 0, Math.PI * 2);
      ctx.arc(hx, hy, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.93; ctx.shadowColor = "#c7fcff"; ctx.shadowBlur = 3; ctx.fill(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      // Gun body (simple cartoon pistol, emits flashes with shot)
      ctx.save();
      ctx.translate(hx, hy - 2);
      ctx.rotate((gunArmRaised ? -0.11 : 0));
      ctx.beginPath();
      ctx.rect(-2 * flip, -5, 12 * flip, 7);
      ctx.fillStyle = "#555"; ctx.globalAlpha = 0.94; ctx.shadowColor = "#aee3fc99";
      ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      // Accents on gun
      ctx.beginPath();
      ctx.rect(-2 * flip, -5, 12 * flip, 2);
      ctx.fillStyle = "#95f9ff"; ctx.globalAlpha = 0.68; ctx.shadowBlur = 0; ctx.fill(); ctx.globalAlpha = 1;
      // Muzzle flash effect if firing
      if (muzzleFlash) {
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.ellipse(13 * flip, -2, 10, 5.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#fffecd";
        ctx.shadowColor = "#f9ff47";
        ctx.shadowBlur = 21;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      ctx.restore();
      ctx.restore();

      // Wire accent
      ctx.save();
      ctx.scale(flip, 1);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(10 * flip, 0);
      ctx.bezierCurveTo(18 * flip, 10, 14 * flip, 17, hx - 2 * flip, hy + 6.5);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#25feffa0";
      ctx.shadowColor = "#2afffa";
      ctx.shadowBlur = 3;
      ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
    })();

    // --- HEAD (unchanged) ---
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -10, 11.6, 7.6, 0, Math.PI * 0.11, Math.PI * 0.89, false);
    ctx.fillStyle = "#97e7ffbb"; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, -12, 11, 0, Math.PI * 2);
    let gradHead = ctx.createRadialGradient(0, -12, 2, 0, -12, 11);
    gradHead.addColorStop(0, "#f6fdfe");
    gradHead.addColorStop(0.55, "#46cbf9");
    gradHead.addColorStop(1, "#49b7fd");
    ctx.fillStyle = gradHead;
    ctx.shadowColor = outerGlow; ctx.shadowBlur = 13; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, -23); ctx.lineTo(0, -3);
    ctx.moveTo(-6, -20); ctx.lineTo(-4, -6);
    ctx.moveTo(6, -20); ctx.lineTo(4, -6);
    ctx.strokeStyle = "#c2eaff77"; ctx.lineWidth = 1.05; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, -13.7, 7.7, 2.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#dffcfc";
    ctx.shadowColor = "#46e7ff"; ctx.shadowBlur = 11;
    ctx.globalAlpha = 0.82; ctx.fill(); ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();

    // Eyes (cyan-glow, animated blink shimmer)
    let blink = Math.abs(Math.sin(t*1.5));
    ctx.save();
    ctx.beginPath();
    ctx.arc(-3.7, -15.2, 2.3-blink, 0, Math.PI*2);
    ctx.arc(3.7, -15.2, 2.3-blink, 0, Math.PI*2);
    ctx.fillStyle="#fcfffd";
    ctx.shadowColor="#7affff";
    ctx.shadowBlur=7;
    ctx.globalAlpha=1-blink*0.33;
    ctx.fill(); ctx.globalAlpha=1; ctx.shadowBlur=0; ctx.restore();

    // Cyber mouth
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -7.3, 2.9, 1.3, 0, Math.PI * 0.18, Math.PI * 0.78, false);
    ctx.strokeStyle = "#26e9fa"; ctx.lineWidth = 1.13; ctx.globalAlpha = 0.75; ctx.stroke(); ctx.globalAlpha = 1; ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-6, -7.3); ctx.lineTo(-3.9, -7.7);
    ctx.moveTo(6, -7.3); ctx.lineTo(3.9, -7.7);
    ctx.strokeStyle = "#26c9ec55"; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.49; ctx.stroke(); ctx.globalAlpha = 1; ctx.restore();

    ctx.restore(); // end head

    // Outline
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 5, 12, 15, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#1b90c7"; ctx.lineWidth = 2.3; ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -12, 11, 0, Math.PI * 2);
    ctx.strokeStyle = "#18efff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();

    // Name
    ctx.font = "bold 15px Poppins, Arial";
    ctx.fillStyle = "#1976d2";
    ctx.textAlign = "center";
    ctx.fillText("You", 0, -25 + jumpYOffset);

    // Flag carried icon
    if (flag.heldBy === "player") {
      ctx.font = "900 18px Segoe UI, Arial";
      ctx.fillStyle = CLR_ACC;
      ctx.textAlign = "center";
      ctx.shadowColor = "#fff7";
      ctx.shadowBlur = 6;
      ctx.fillText("🏳️", 0, -2 + jumpYOffset);
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // --- Bullets (cartoon plasma): Animate as colored oval projectiles
    if (bullets && bullets.length > 0) {
      for (let bullet of bullets) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(bullet.x, bullet.y, 7.5, 3.1, 0, 0, Math.PI*2);
        let colGrad = ctx.createLinearGradient(bullet.x-8, bullet.y, bullet.x+8, bullet.y);
        colGrad.addColorStop(0, "#95e4ff"); // bright cyan
        colGrad.addColorStop(1, "#fffecd");
        ctx.fillStyle = colGrad;
        ctx.globalAlpha = 0.81;
        ctx.shadowColor = "#fffacd";
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // --- ENEMY BOTS: Layered, evil robot with animated run cycle + details ---
    /*
      Enemy bot: multi-segment limbs, angular armored plating, red sci-fi arc eyes, spark glows, wires, piston joints.
      Evil magenta/dark, metallic, cartoonish villain.
      Animates similar running cycle; eyes and mouth pulse.
    */
    bots.forEach((bot, i) => {
      if (!enemyHp[bot.id] || enemyHp[bot.id].hp <= 0) return; // Skip dead bots
      ctx.save();
      ctx.translate(bot.x, bot.y);

      // ENEMY JUMP: bounce on attack/hit
      let botYOffset = (bot.isJumping && bot.jumpPhase < Math.PI)
        ? -Math.abs(Math.sin(bot.jumpPhase)) * 19
        : 0;

      // Shadow
      ctx.save();
      ctx.globalAlpha = bot.isJumping ? 0.22 + 0.14 * Math.abs(Math.cos(bot.jumpPhase)) : 0.37;
      let botShadowWide = bot.isJumping ? 13 + 7 * Math.cos(bot.jumpPhase) : 18;
      ctx.beginPath();
      ctx.ellipse(0, 27, botShadowWide, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#7000ad29";
      ctx.filter = "blur(1.2px)";
      ctx.fill();
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.restore();

      let phase = (performance.now() / 450 + i * 77.3) * (moving ? 1.0 : 0.8);
      let aSwing = Math.cos(phase) * 17, lSwing = Math.sin(phase) * 16;
      ctx.translate(0, botYOffset);

      // HIT FLASH SPARK EFFECT
      let hitAlpha = 0;
      let hpObj = enemyHp[bot.id] || { hp: 3, hitAnim: 0 };
      if (hpObj.hitAnim > 0.22) {
        hitAlpha = Math.min(1, hpObj.hitAnim);
        ctx.save();
        ctx.globalAlpha = hitAlpha * 0.74;
        ctx.beginPath();
        ctx.arc(0, 1, 18 + 7 * Math.sin(phase), 0, Math.PI * 2);
        ctx.strokeStyle = "#ffd44d";
        ctx.lineWidth = 7;
        ctx.shadowColor = "#ffd44d";
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // --- Legs ---
      let legs = [
        { x1: -8, y1: 16, kx: -13, ky: 27 + lSwing * 0.32, fx: -14, fy: 36 + lSwing, swing: lSwing },
        { x1: +8, y1: 16, kx: +13, ky: 27 - lSwing * 0.22, fx: +14, fy: 36 - lSwing, swing: -lSwing }
      ];
      legs.forEach((leg, j) => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(leg.x1, leg.y1); ctx.lineTo(leg.kx, leg.ky - 2);
        ctx.lineWidth = 5.2; ctx.strokeStyle = "#de65ea";
        ctx.shadowColor = "#cf7ffabc"; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(leg.kx, leg.ky - 2); ctx.lineTo(leg.fx, leg.fy);
        ctx.lineWidth = 4.1; ctx.strokeStyle = "#bd04be";
        ctx.shadowColor = "#a700f6"; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(leg.kx, leg.ky - 2, 2.2, 0, Math.PI * 2);
        ctx.arc(leg.fx, leg.fy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fee6ed"; ctx.shadowColor = "#f0a3ff"; ctx.shadowBlur = 3; ctx.fill();
        ctx.globalAlpha = 0.8; ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
      });

      // Torso
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-10, 1); ctx.lineTo(0, 20); ctx.lineTo(10, 1); ctx.arc(0, 7, 13, Math.PI * 0.071, Math.PI * 0.94, false); ctx.closePath();
      let bodGrad = ctx.createLinearGradient(-10, 0, 10, 30);
      bodGrad.addColorStop(0, "#7d02ba"); bodGrad.addColorStop(0.43, "#ff7bfa");
      bodGrad.addColorStop(0.82, "#4e007a"); bodGrad.addColorStop(1, "#c14fd9");
      ctx.fillStyle = bodGrad;
      ctx.shadowColor = "#ff13fb"; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
      // Plating lines
      ctx.globalAlpha = 0.53; ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(8, 12);
      ctx.moveTo(-7, 16); ctx.lineTo(7, 8); ctx.strokeStyle = "#fffaff66"; ctx.lineWidth = 1.35; ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();

      // Glowing wire
      ctx.save();
      ctx.globalAlpha = 0.57; ctx.beginPath();
      ctx.moveTo(-7, 17); ctx.bezierCurveTo(-4, 15, 1, 29, +6, 18 + lSwing * 0.08);
      ctx.lineWidth = 1.7; ctx.strokeStyle = "#e44fff"; ctx.shadowColor = "#f84fff"; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();

      // Arms
      let arms = [
        { sx: -11, sy: 2, ex: -22, ey: 3 + aSwing * 0.53, hx: -26, hy: 14 + aSwing * 0.66 },
        { sx: 11, sy: 2, ex: 22, ey: 3 - aSwing * 0.57, hx: 26, hy: 14 - aSwing * 0.66 }
      ];
      arms.forEach((arm, k) => {
        ctx.save(); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(arm.sx, arm.sy); ctx.lineTo(arm.ex, arm.ey);
        ctx.lineWidth = 4.7; ctx.strokeStyle = "#ffabe8"; ctx.shadowColor = "#ffb3ee"; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(arm.ex, arm.ey); ctx.lineTo(arm.hx, arm.hy);
        ctx.lineWidth = 3.6; ctx.strokeStyle = "#bd04be"; ctx.shadowColor = "#f7e8ff"; ctx.shadowBlur = 4; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(arm.hx, arm.hy, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe8ff"; ctx.shadowColor = "#ff4efd"; ctx.shadowBlur = 3; ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
      });

      // Head
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-8, -12); ctx.lineTo(0, -23 - Math.sin(phase) * 2.7);
      ctx.lineTo(8, -12); ctx.lineTo(3, -4); ctx.lineTo(-3, -4); ctx.closePath();
      let grad = ctx.createRadialGradient(0, -17, 1, 0, -14, 10);
      grad.addColorStop(0, "#fff");
      grad.addColorStop(0.18, "#ff7bfa");
      grad.addColorStop(0.83, "#7d0155");
      grad.addColorStop(1, "#770a20");
      ctx.fillStyle = grad; ctx.shadowColor = "#ff12ed"; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
      // Eyes
      let eyeS = 2.3, pulse = (Math.sin(phase * 2.12) + 1.1) * 0.7;
      ctx.save(); ctx.beginPath();
      ctx.ellipse(-2.8, -15.8, eyeS, 2.6 - pulse, Math.PI * -.10, 0, Math.PI * 2);
      ctx.ellipse(2.8, -15.8, eyeS, 2.6 - pulse, Math.PI * +.10, 0, Math.PI * 2);
      ctx.fillStyle = "#fe3645";
      ctx.shadowColor = "#ff1254"; ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.88 + 0.09 * Math.sin(phase); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
      // Jaw
      ctx.save(); ctx.beginPath();
      ctx.moveTo(-3, -7); ctx.lineTo(-1, -5 + 0.4 * pulse);
      ctx.lineTo(1, -5 - 0.4 * pulse); ctx.lineTo(3, -7);
      ctx.lineWidth = 1.18; ctx.strokeStyle = "#ff9eec"; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1; ctx.restore();

      ctx.globalAlpha = 0.49;
      ctx.beginPath();
      ctx.moveTo(-4, -19); ctx.lineTo(4, -19);
      ctx.moveTo(-1, -21); ctx.lineTo(-1, -13);
      ctx.moveTo(1, -21); ctx.lineTo(1, -13);
      ctx.strokeStyle = "#ffeafd49"; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.restore(); // end head

      // --- ENEMY HP BAR (overhead) ---
      let hp = hpObj.hp || 0;
      let barW = 30, barH = 5, pad = 18 + botYOffset;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.rect(-barW / 2, -pad - 6, barW, barH);
      ctx.fillStyle = "#363";
      ctx.fill();
      ctx.beginPath();
      ctx.rect(-barW / 2, -pad - 6, barW * (hp / 3), barH);
      ctx.fillStyle = hp === 1 ? "#ff6226" : (hp === 2 ? "#ffd44d" : "#9bff4a");
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.restore();

      // --- ENEMY "SPARKS/DEFEAT": If hit ---
      if (hpObj.hitAnim > 0.21) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, hpObj.hitAnim / 1.2));
        ctx.beginPath();
        ctx.arc(0, -barW / 2, 15 + 9 * Math.sin(phase), 0, Math.PI * 2);
        ctx.strokeStyle = "#ffd44d";
        ctx.lineWidth = 3.2;
        ctx.shadowColor = "#ffd44d";
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
      }

      // Bot label
      ctx.font = "bold 12px Poppins, Arial";
      ctx.fillStyle = "#bb35f3";
      ctx.textAlign = "center";
      ctx.fillText(`Bot${i + 1}`, 0, -25 + botYOffset);

      ctx.restore();
    });

    // End overlay
    if (gamestate === "over" || winner) {
      ctx.save();
      ctx.globalAlpha = 0.80;
      ctx.fillStyle = "#fff";
      ctx.fillRect(
        CANVAS_W/2 - 120,
        CANVAS_H/2 - 55,
        240, 110
      );
      ctx.globalAlpha = 1;
      ctx.font = "bold 25px Segoe UI";
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.fillText(
        winner === "player" ? "You Win! 🎉" :
        winner === "bot" ? "Bots Win! 🤖" : "Game Over",
        CANVAS_W / 2,
        CANVAS_H / 2 + 8
      );
      ctx.font = "15px Arial";
      ctx.fillStyle = "#444";
      ctx.fillText("Press Restart to play again!", CANVAS_W/2, CANVAS_H/2 + 34);
      ctx.restore();
    }
    // eslint-disable-next-line
  }, [player, bots, flag, gamestate, winner, dropBox, obstacles]);

  // --- Button actions
  // PUBLIC_INTERFACE
  const handleStart = () => {
    setGamestate("running");
    setRunning(true);
    setWinner(null);
    setMessage("");
    setShowLevelCompleted(false);
    setShowLevelFailed(false);
    if (timer <= 0 || gamestate === "over") setTimer(SESSION_TIME);
  };

  // PUBLIC_INTERFACE
  const handlePause = () => {
    if (gamestate !== "running") return;
    setGamestate("paused");
    setRunning(false);
  };

  // PUBLIC_INTERFACE
  // add options: { restartAtCurrentLevel: boolean }
  const handleRestart = (autoStart = false, options = {}) => {
    setShowLevelCompleted(false);
    setShowLevelFailed(false);
    setWinner(null);
    setMessage("");
    keyState.current = {};
    if (options && options.restartAtCurrentLevel) {
      // Remain at current level, only reset game field and timer
      setTimer(SESSION_TIME);
      setGamestate(autoStart ? "running" : "ready");
      setRunning(!!autoStart);
    } else {
      // Reset to first level
      setLevel(1);    // resets/initializes everything (and obstacles)
      setTimer(SESSION_TIME);
      setGamestate(autoStart ? "running" : "ready");
      setRunning(!!autoStart);
    }
  };

  // --- Render: UI overlay info
  const pad = n => String(n).padStart(2, "0");
  const timerStr = `${pad(Math.floor(timer / 60))}:${pad(timer % 60)}`;

  let statusMsg = message;
  if (!statusMsg && (flag.heldBy === "player" && dropBox))
    statusMsg = "Deliver the flag to the drop-off box!";
  if (!statusMsg && gamestate === "paused")
    statusMsg = "Game paused.";

  // Show overlay for completed/failed state instead of just message bar
  let showLevelOverlay = showLevelCompleted || showLevelFailed;
  let levelOverlayMsg = "";
  let overlayColor = "";
  if (showLevelCompleted) {
    levelOverlayMsg = `Level ${level} Completed!`;
    overlayColor = "#197c2c";
  } else if (showLevelFailed) {
    levelOverlayMsg = "You Failed!";
    overlayColor = "#e74c3c";
  }

  // Level = points per win, difficulty scales by obstacles and bots
  const pointsForLevel = level;
  const userScore = player.score;
  const botTopScore = Math.max(0, ...bots.map(b => b.score));
  let btnLbl = gamestate === "ready" || gamestate === "paused" ? "Start" : "Resume";

  return (
    <div className="App">
      <header>
        <h1
          style={{
            margin: 0,
            padding: "1.6rem 0 1.1rem 0",
            fontSize: "2.2rem",
            letterSpacing: "0.018em",
            color: "var(--primary)",
            background: "var(--bg-secondary)",
          }}
        >
          FlagQuest
        </h1>
      </header>
      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "2rem",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
          padding: "1rem 0",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 500 }}>
          Score:{" "}
          <span style={{ color: "var(--primary)", fontWeight: 700 }}>
            {userScore}
          </span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Opponent:{" "}
          <span style={{ color: "var(--secondary)", fontWeight: 700 }}>
            {botTopScore}
          </span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Timer:{" "}
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>
            {timerStr}
          </span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Flag:{" "}
          <span style={{ color: "var(--secondary)", fontWeight: 700 }}>
            {flag.heldBy === "player" ? "You" : flag.home ? "Safe" : "Field"}
          </span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Level:{" "}
          <span style={{ color: CLR_ACC, fontWeight: 700 }}>
            {level}
          </span>
        </div>
      </section>
      {/* LEVEL/FALIURE OVERLAY */}
      {showLevelOverlay && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            margin: "auto",
            zIndex: 5,
            width: "100%",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              margin: "2.2rem auto -.5rem auto",
              maxWidth: 410,
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 4px 16px #e9ecef88",
              border: `2.5px solid ${showLevelCompleted ? "#197c2c" : "#e74c3c"}`,
              color: overlayColor,
              fontWeight: 700,
              fontSize: "1.58rem",
              minHeight: 46,
              padding: "1.1rem 0 .8rem 0",
              textAlign: "center",
              letterSpacing: "0.012em"
            }}
          >
            {levelOverlayMsg}
            <div style={{ fontWeight: 500, color: "#444", fontSize: 16, marginTop: 12 }}>
              {showLevelCompleted
                ? <span>Level complete! Advance or restart this level.</span>
                : <span>Try this level again.</span>}
            </div>
            <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: "1rem", pointerEvents: "auto" }}>
              {showLevelCompleted && (
                <>
                  <button
                    className="game-btn"
                    autoFocus
                    tabIndex={0}
                    onClick={() => {
                      // Advance to next level
                      setShowLevelCompleted(false);
                      setShowLevelFailed(false);
                      setLevel(lvl => lvl + 1);
                      // Future: trigger full-screen sparkle!
                    }}
                  >
                    Continue
                  </button>
                  <button
                    className="game-btn"
                    tabIndex={0}
                    onClick={() => {
                      // Restart at current level
                      handleRestart(false, { restartAtCurrentLevel: true });
                      setShowLevelCompleted(false);
                      setShowLevelFailed(false);
                    }}
                  >
                    Restart
                  </button>
                </>
              )}
              {showLevelFailed && (
                <button
                  className="game-btn"
                  autoFocus
                  tabIndex={0}
                  onClick={() => {
                    // Restart current level after failure
                    handleRestart(false, { restartAtCurrentLevel: true });
                    setShowLevelCompleted(false);
                    setShowLevelFailed(false);
                  }}
                >
                  Restart
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Status message, fallback */}
      {!showLevelOverlay && statusMsg && (
        <div
          style={{
            marginTop: ".82rem",
            textAlign: "center",
            color: statusMsg.startsWith("Level") ? "#197c2c" : "#43a047",
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.014em",
            minHeight: 25,
            marginBottom: ".2rem"
          }}
        >
          {statusMsg}
        </div>
      )}

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "2.2rem",
          marginBottom: "2.3rem",
        }}
      >
        {/* ---- Canvas ---- */}
        <div
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            background: "var(--bg-secondary)",
            border: "2.5px solid var(--border-color)",
            borderRadius: "18px",
            boxShadow: "0 5px 16px 2px #e9ecef55",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "2.3rem",
            maxWidth: "98vw",
            position: "relative",
            outline: "none"
          }}
          tabIndex={0}
          aria-label="Game Area"
        >
          <canvas
            ref={canvasRef}
            tabIndex={-1}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{
              background: "none",
              outline: "none",
              border: "none",
              width: "100%",
              height: "100%",
              display: "block",
              borderRadius: "15px",
            }}
            aria-label="Game Canvas"
          />
        </div>
        {/* ---- Control Buttons ---- */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap"
          }}
        >
          {/* Show appropriate action button(s) depending on game state */}
          {/* While overlay is up (level complete or failed), only show relevant action button */}
          {showLevelCompleted && !showLevelFailed && (
            <button
              className="game-btn"
              tabIndex={0}
              autoFocus
              aria-label="Advance to Next Level"
              onClick={() => {
                setShowLevelCompleted(false);
                setShowLevelFailed(false);
                setLevel(lvl => lvl + 1);
              }}
            >
              Advance
            </button>
          )}
          {showLevelFailed && !showLevelCompleted && (
            <button
              className="game-btn"
              tabIndex={0}
              autoFocus
              aria-label="Restart Level"
              onClick={() => {
                handleRestart(false, { restartAtCurrentLevel: true });
                setShowLevelCompleted(false);
                setShowLevelFailed(false);
              }}
            >
              Restart
            </button>
          )}
          {/* In normal play, show core controls */}
          {!showLevelCompleted && !showLevelFailed && (
            <>
              <button
                className="game-btn"
                tabIndex={0}
                onClick={handleStart}
                disabled={gamestate === "running"}
                aria-label="Start Game"
              >
                {btnLbl}
              </button>
              <button
                className="game-btn"
                tabIndex={0}
                onClick={handlePause}
                disabled={gamestate !== "running"}
                aria-label="Pause"
              >
                Pause
              </button>
              <button
                className="game-btn"
                tabIndex={0}
                onClick={() => { handleRestart(false, { restartAtCurrentLevel: true }); }}
                aria-label="Restart Game"
              >
                Restart
              </button>
            </>
          )}
        </div>
        <div style={{ marginTop: "1.1rem", color: "#888", fontSize: 14 }}>
          Controls: <kbd>WASD</kbd> or <kbd>Arrow Keys</kbd> to move.
          &nbsp; Grab the flag, deliver to drop-off box!
          <br />
          Avoid bots (each with unique strategy). More bots & obstacles as you level up.
          <br />
          <span style={{color:'#aaa',fontSize:13}}>Level up for tougher competition.&nbsp;P: Pause &nbsp; R: Restart</span>
        </div>
        <div style={{ marginTop: "0.8rem", color: "#bbb", fontSize: 13 }}>
          Points per level: {pointsForLevel} &bull; Obstacles: {numObstacles} &bull; Bots: {numBots}
        </div>
      </main>
    </div>
  )
}

export default App;
