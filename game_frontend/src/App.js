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

    // --- defeat animation state for player robot ---
  const [robotDefeatAnim, setRobotDefeatAnim] = useState(false);
  const [robotDefeatAnimFrame, setRobotDefeatAnimFrame] = useState(0);

  // --- defeat animation trigger when level is completed ---
  useEffect(() => {
    if (showLevelCompleted) {
      setRobotDefeatAnim(true);
      setRobotDefeatAnimFrame(0);
    } else if (!showLevelCompleted) {
      setRobotDefeatAnim(false);
      setRobotDefeatAnimFrame(0);
    }
  }, [showLevelCompleted]);

// --- Rendering the canvas/game area
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Field background
    ctx.fillStyle = "#f9fbfc";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // ... <unchanged up to player rendering code> ...

    // --- PLAYER: defeat animation for player robot when level completed ---
    if (robotDefeatAnim && showLevelCompleted) {
      const DEFEAT_FRAMES = 56;
      let frame = robotDefeatAnimFrame;
      ctx.save();
      ctx.translate(player.x, player.y);

      let t = frame / DEFEAT_FRAMES;
      let scatter = Math.min(16, frame * 1.25);
      let spinHead = -Math.PI/8 + Math.PI * t * 0.18;
      let fade = 1 - t * 0.94;

      // Shadow
      ctx.globalAlpha = 0.33 * (1 - t*0.7);
      ctx.beginPath();
      ctx.ellipse(0, 32, 23 + scatter*0.5, 7 + scatter*0.2, 0, 0, 2 * Math.PI);
      ctx.fillStyle = "#1581ab19";
      ctx.filter = "blur(2px)";
      ctx.fill();
      ctx.filter = "none";
      ctx.globalAlpha = 1;

      // Legs - popping off
      [
        { ox: -7-scatter, oy: 20+scatter, rot: -0.4 },
        { ox:  +7+scatter, oy: 20+scatter, rot: +0.38 }
      ].forEach((l, i) => {
        ctx.save();
        ctx.translate(l.ox, l.oy);
        ctx.rotate(l.rot * t * 2.5 + Math.sin(frame*0.6+i)*0.2);
        ctx.beginPath();
        ctx.ellipse(0, 10, 3 + 2*t, 10 + scatter*0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(146,235,255,0.82)";
        ctx.shadowColor = "#bbf5ff";
        ctx.shadowBlur = 7;
        ctx.globalAlpha = fade*0.76 * (1-t*0.5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      });
      // Torso - pops downward, flickers
      ctx.save();
      ctx.translate(0, 5 + scatter*0.6*Math.sin(frame*0.13));
      ctx.rotate(Math.sin(frame*0.046)*0.10);
      ctx.beginPath();
      ctx.ellipse(0, 11, 11, 14, 0, 0, 2 * Math.PI);
      let torsoGrad = ctx.createLinearGradient(-16, 6, 12, 26);
      torsoGrad.addColorStop(0.08, "#80eeff");
      torsoGrad.addColorStop(0.43, "#60ccfd");
      torsoGrad.addColorStop(0.7, "#dbfffd");
      torsoGrad.addColorStop(1, "#b1e7ff");
      ctx.fillStyle = torsoGrad;
      ctx.shadowColor = t > 0.16 && frame%6<3 ? "#fffaf3" : "#18eaff";
      ctx.shadowBlur = 14 + t*11;
      ctx.globalAlpha = 0.91 - t * 0.5;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
      // Head - flies off, blinks out, sparks
      ctx.save();
      ctx.translate(0, -12 - scatter*1.1);
      ctx.rotate(spinHead);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, 2 * Math.PI);
      ctx.fillStyle = "#97e7ffbb";
      ctx.globalAlpha = 0.5 * fade;
      ctx.fill();
      ctx.globalAlpha = fade;
      let gradHead = ctx.createRadialGradient(0, 0, 3, 0, 0, 11);
      gradHead.addColorStop(0, "#f6fdfe");
      gradHead.addColorStop(0.45, "#46cbf9");
      gradHead.addColorStop(1, "#49b7fd");
      ctx.fillStyle = gradHead;
      ctx.shadowColor = "#faedff";
      ctx.shadowBlur = (frame%8<4)?17:6;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Face blink
      ctx.save();
      ctx.beginPath();
      ctx.arc(-4, -3, 2.3-Math.sin(frame*0.186+t*3)*1.8, 0, Math.PI*2);
      ctx.arc( 4, -3, 2.3-Math.sin(frame*0.3+t*5.3)*1.9, 0, Math.PI*2);
      ctx.fillStyle = !showLevelCompleted ? "#f7fffc" : "#e8636a";
      ctx.shadowColor=showLevelCompleted?"#ffa4ac":"#e1faf7";
      ctx.shadowBlur=showLevelCompleted?10:4;
      ctx.globalAlpha=fade*0.62;
      ctx.fill();
      ctx.shadowBlur=0; ctx.globalAlpha=1; ctx.restore();

      // Sparks flying out (polished - cartoonish bolts)
      for(let i=0;i<8;++i){
        let ang= (i/8)*2*Math.PI + frame*0.03+i*0.41, len=18+8*Math.sin(frame+i);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(len*Math.sin(ang)*t*1.2, -len*Math.cos(ang)*t*1.2);
        ctx.lineWidth = 2.7+1.6*Math.abs(Math.cos(frame*0.12+i*0.77));
        ctx.strokeStyle = ["#ffd44d","#fffecd","#fe4e76","#fe3645"][i%4];
        ctx.shadowColor = "#ffd44dcc";
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.4 + Math.random()*0.6;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1; ctx.restore();
      }
      ctx.restore();

      // Arms fly away
      [{ dx: -21-scatter, dy: -7+scatter, rot: -0.66 }, { dx: 21+scatter, dy: -7+scatter, rot: +0.70 }].forEach((a) => {
        ctx.save();
        ctx.translate(a.dx, a.dy);
        ctx.rotate(a.rot * t * 1.2);
        ctx.beginPath();
        ctx.ellipse(0, 7, 7, 3 + scatter*0.1, 0, 0, 2*Math.PI);
        ctx.fillStyle = "#b8ffff";
        ctx.globalAlpha = 0.7-fade*0.12;
        ctx.shadowColor = "#25feff";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      });

      // Name label, faded out
      ctx.save();
      ctx.globalAlpha = fade * 0.8;
      ctx.font = "bold 15px Poppins, Arial";
      ctx.fillStyle = "#1976d2";
      ctx.textAlign = "center";
      ctx.fillText("You", 0, -25 + t*29);
      ctx.restore();

      ctx.restore();

      // Advance frame for defeat animation every render tick
      setTimeout(() => {
        if (robotDefeatAnim) {
          setRobotDefeatAnimFrame(f => f + 1);
        }
      }, 16);
    }
    else {
      // ----- NORMAL PLAYER RENDER FLOW (Unchanged) -----
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
      if (player.isJumping) {
        bodyTilt -= Math.sin(player.jumpPhase) * 6;
        armSwing += Math.sin(player.jumpPhase) * 7;
      }

      let outerGlow = moving ? "#18eaff" : "#6cf9ea";
      ctx.rotate(bodyTilt * Math.PI / 180);
      ctx.translate(0, jumpYOffset);

      // ... <rest of normal player render unchanged> ...
    }
    // ... <rest of useEffect unchanged> ...
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
        {/* ---- Game Instructions (NEW, always shown) ---- */}
        <div
          className="instructions-panel"
          style={{
            width: `${CANVAS_W}px`,
            maxWidth: "97vw",
            margin: "0 auto 0.95rem auto",
            padding: "1.04em 1.1em 0.9em 1.1em",
            background: "var(--surface, #2d334b)",
            borderRadius: 15,
            boxShadow: "0 4px 18px 0px #164cef17",
            border: "2.2px solid var(--panel, #303865)",
            color: "var(--text-primary, #f0f6ff)",
            textAlign: "left",
            fontSize: "1.03rem",
            lineHeight: 1.62,
            position: "relative"
          }}
        >
          <div style={{fontWeight: 700, color: "var(--accent, #ffd44d)", fontSize: "1.13em", marginBottom: 6, letterSpacing: "0.02em", textShadow: "0 1.6px 2px #101 22"}}>
            How to Play
          </div>
          <ul style={{margin: 0, paddingLeft: "1.1em", listStyle: "disc"}}>
            <li>
              <span style={{ color: "#9bff4a", fontWeight: 600 }}>Move</span>:&nbsp;
              <kbd>WASD</kbd> or <kbd>Arrow Keys</kbd>
            </li>
            <li>
              <span style={{ color: "#ffd44d", fontWeight: 600 }}>Jump</span>:&nbsp;
              <kbd>Space</kbd>
            </li>
            <li>
              <span style={{ color: "#ff3645", fontWeight: 600 }}>Shoot</span>:&nbsp;
              <kbd>J</kbd>&nbsp;/&nbsp;<kbd>K</kbd>&nbsp;/&nbsp;<kbd>Z</kbd> or <span style={{color:"#ffd44d"}}>Mouse Click</span>
            </li>
            <li>
              <span style={{ color: "#46cbf9", fontWeight: 600 }}>Grab</span> the flag (🏳️), deliver it to the <span style={{color:"#9bff4a"}}>Drop-Off Box</span> to win the level!
            </li>
            <li>
              <span style={{color: "#ff7bfa", fontWeight: 600}}>Watch out!</span> Avoid enemy bots. More bots & obstacles as you level up.
            </li>
            <li style={{ fontSize: ".97em", color: "#c2eafd" }}>
              <span style={{color:"#ffd44d"}}>Extras:</span>
              <span style={{marginLeft:8}}><kbd>P</kbd> = Pause</span>
              <span style={{marginLeft:12}}><kbd>R</kbd> = Restart</span>
              <span style={{marginLeft:12, color:"#ccc"}}>Points/level, bots and obstacles increase every round.</span>
            </li>
          </ul>
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
