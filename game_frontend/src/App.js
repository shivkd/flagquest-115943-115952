import React, { useRef, useEffect, useState } from "react";
import "./App.css";

/*
  Simple 2D CTF Game: Minimal UI, basic player/enemy visuals. 
  This file restores simple circle/oval-based character and bot design, 
  and ensures bullets spawn from player and fire in current/last direction moved.
*/

// ---- Constants ---- 
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

// Colors (fallbacks in case CSS not loaded)
function getCssVar(v, fallback) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(v) || fallback;
}
const CLR_PRI = getCssVar('--sci-primary', '#46cbf9').trim() || "#46cbf9";
const CLR_SEC = getCssVar('--sci-secondary', '#9bff4a').trim() || "#9bff4a";
const CLR_ACC = getCssVar('--sci-accent', '#ffd44d').trim() || "#ffd44d";
const CLR_BOT = getCssVar('--sci-magenta', '#ff7bfa').trim() || "#ff7bfa";

// ---- Utility helpers ----
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
  } while ((ox < 80 || ox + ow > w - 80) && maxTry > 0); 
  return { x: ox, y: oy, w: ow, h: oh };
}

// ---- Obstacle collision for circle (entity) ----
function isCircleRectColliding(cx, cy, cr, ox, oy, ow, oh) {
  const nx = clamp(cx, ox, ox + ow), ny = clamp(cy, oy, oy + oh);
  const dx = cx - nx, dy = cy - ny;
  return dx*dx + dy*dy < cr*cr;
}

// ---- Main Game State ----
function App() {
  // --- Core state
  const [player, setPlayer] = useState({
    x: 60,
    y: CANVAS_H / 2,
    dx: 0,
    dy: 0,
    score: 0,
    facing: 1,
    lastMoveDir: { x: 1, y: 0 }, // used for shooting when standing still
    canShoot: true,
    isShooting: false,
    shootAnim: 0,
    isJumping: false,
    jumpPhase: 0,
  });
  const [bots, setBots] = useState([]);
  const [flag, setFlag] = useState({ x: 0, y: 0, heldBy: null, home: true });
  const [dropBox, setDropBox] = useState(null);
  const [obstacles, setObstacles] = useState([]);
  const [level, setLevel] = useState(1);
  const [timer, setTimer] = useState(SESSION_TIME);
  const [running, setRunning] = useState(false);
  const [gamestate, setGamestate] = useState("ready"); // "ready" "running" "paused" "over"
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState("");
  const [showLevelCompleted, setShowLevelCompleted] = useState(false);
  const [showLevelFailed, setShowLevelFailed] = useState(false);
  const [bullets, setBullets] = useState([]);
  const [enemyHp, setEnemyHp] = useState({});

  // --- Controls, Refs
  const canvasRef = useRef(null);
  const keyState = useRef({});
  const shootCooldown = useRef(false);
  const lastDirectionRef = useRef({ x: 1, y: 0 }); // last movement direction (unit vec)

  const numBots = BASE_NUM_BOTS + Math.floor((level - 1) / 2);
  const numObstacles = BASE_NUM_OBSTACLES + Math.max(level - 1, 0);

  // --- On mount & level up: initialize field
  useEffect(() => {
    // Place flag in random area not in drop box/obstacle/player start
    const newFlag = { ...randomPos(CANVAS_W, CANVAS_H, 30), heldBy: null, home: true };
    setFlag(newFlag);
    // Player at left, reset shooting/jump state
    setPlayer({
      x: 60,
      y: CANVAS_H / 2,
      dx: 0,
      dy: 0,
      facing: 1,
      lastMoveDir: { x: 1, y: 0 },
      canShoot: true,
      isShooting: false,
      shootAnim: 0,
      isJumping: false,
      jumpPhase: 0,
      score: 0,
    });
    // AI bots
    const botsArr = Array.from({ length: numBots }, (_, i) => ({
      id: i + 1,
      x: CANVAS_W - 40 - (i * 33),
      y: 1.4 * CANVAS_H / 3 + (i * 27),
      dx: 0,
      dy: 0,
      score: 0,
    }));
    setBots(botsArr);
    // Set HP for each bot (3 for each)
    let newHp = {};
    for (let b of botsArr) newHp[b.id] = { hp: 3, hitAnim: 0 };
    setEnemyHp(newHp);

    setDropBox(null);
    // Obstacles (could expand logic, but not critical)
    setObstacles([]);
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

  // --- Keyboard controls ---
  useEffect(() => {
    function handleDown(e) {
      // Movement keys
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = true;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = true;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = true;
      if (e.key === "p" || e.key === "P") { if (running) handlePause(); }
      // Shoot (J, K, Z) or mouse
      if (["j", "J", "k", "K", "z", "Z"].includes(e.key)) { shootBullet(); }
    }
    function handleUp(e) {
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = false;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = false;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = false;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = false;
    }
    function handleMouseDown(e) {
      if (e.button === 0 && running) { shootBullet(); }
    }
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("mousedown", handleMouseDown);
    };
    // DO NOT add player to deps
    // eslint-disable-next-line
  }, [player.canShoot, running]);

  // --- Main game loop (player, bots, flag, bullets, collisions) ---
  useEffect(() => {
    let anim;
    let prevTimestamp = performance.now();

    function isMoveAllowed(nx, ny, rad, obsList) {
      // No obstacles in minimal version
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
      // Normalize for diagonal
      let currentMove = { x: 0, y: 0 };
      if (pvx !== 0 || pvy !== 0) {
        const mag = Math.sqrt(pvx * pvx + pvy * pvy) || 1;
        pvx = (pvx / mag) * PLAYER_SPEED;
        pvy = (pvy / mag) * PLAYER_SPEED;
        currentMove = { x: pvx / PLAYER_SPEED, y: pvy / PLAYER_SPEED }; // unit vector
        lastDirectionRef.current = currentMove;
      }
      // Facing left/right for bullet/visuals
      let lastFace = player.facing;
      if (pvx > 0) lastFace = 1;
      if (pvx < 0) lastFace = -1;
      // Try new position
      if (isMoveAllowed(px + pvx, py + pvy, PLAYER_SIZE / 2, obstacles)) {
        px = clamp(px + pvx, PLAYER_SIZE / 2, CANVAS_W - PLAYER_SIZE / 2);
        py = clamp(py + pvy, PLAYER_SIZE / 2, CANVAS_H - PLAYER_SIZE / 2);
      }

      // Store last movement direction on the player (for bullets)
      let newLastMoveDir = (pvx !== 0 || pvy !== 0)
        ? { x: pvx / PLAYER_SPEED, y: pvy / PLAYER_SPEED }
        : player.lastMoveDir;

      // --- Bots AI (crude homing on player) ---
      let botArr = bots.map((bot, i) => {
        let tgtX = px, tgtY = py;
        let speed = BASE_BOT_SPEED + 0.09 * (level - 1) + 0.12 * (i);
        let dx = tgtX - bot.x, dy = tgtY - bot.y;
        let mag = Math.sqrt(dx * dx + dy * dy) || 1;
        let vx = (dx / mag) * speed, vy = (dy / mag) * speed;
        let nx = clamp(bot.x + vx, BOT_SIZE / 2, CANVAS_W - BOT_SIZE / 2);
        let ny = clamp(bot.y + vy, BOT_SIZE / 2, CANVAS_H - BOT_SIZE / 2);
        return { ...bot, x: nx, y: ny };
      });

      // --- Bullets: move, check collision with bots, remove bullets on hit/out-of-bounds ---
      let newBullets = [];
      let newEnemyHp = { ...enemyHp };
      let botsToDefeat = new Set();
      for (let bullet of bullets) {
        let bx = bullet.x + bullet.vx, by = bullet.y + bullet.vy;
        let traveled = dist(bullet.origin.x, bullet.origin.y, bx, by);
        let dead = false;
        if (
          bx < 0 ||
          by < 0 ||
          bx > CANVAS_W ||
          by > CANVAS_H ||
          traveled > 520
        )
          dead = true;
        // Hit enemy bot?
        let hitBotIdx = -1;
        bots.forEach((b, i) => {
          if (
            dist(b.x, b.y, bx, by) < BOT_SIZE / 2 + 8 && !dead &&
            (newEnemyHp[b.id]?.hp > 0)
          ) {
            hitBotIdx = i;
          }
        });
        if (hitBotIdx !== -1) {
          let bot = bots[hitBotIdx];
          let hpEnt = newEnemyHp[bot.id] || { hp: 3, hitAnim: 0 };
          hpEnt.hp -= 1;
          hpEnt.hitAnim = 1.0;
          newEnemyHp[bot.id] = hpEnt;
          if (hpEnt.hp <= 0) botsToDefeat.add(bot.id);
          continue;
        }
        if (!dead) newBullets.push({ ...bullet, x: bx, y: by, age: bullet.age + 1 });
      }
      // Remove defeated bots
      let remainingBots = botArr.filter(b => !botsToDefeat.has(b.id));
      Object.keys(newEnemyHp).forEach(
        id => (newEnemyHp[id].hitAnim = Math.max(0, newEnemyHp[id].hitAnim - 0.12))
      );

      // --- Flag pickup/drop/score ---
      let newFlag = { ...flag };
      if (!flag.heldBy && dist(px, py, flag.x, flag.y) < (PLAYER_SIZE + FLAG_SIZE) / 2 + 2) {
        newFlag.heldBy = "player";
        newFlag.home = false;
        setDropBox(randomDropBox(CANVAS_W, CANVAS_H, 58));
      }

      let playerScored = false;
      if (
        flag.heldBy === "player" &&
        dropBox &&
        dist(px, py, dropBox.x, dropBox.y) < (PLAYER_SIZE + DROP_BOX_SIZE) / 2 + 4
      ) {
        playerScored = true;
      }

      let botCaught = false;
      for (let b of remainingBots) {
        if (dist(px, py, b.x, b.y) < (PLAYER_SIZE + BOT_SIZE) / 2 - 2)
          botCaught = true;
      }

      // --- Win/Lose logic ---
      let newPlayerScore = player.score;
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
        setGamestate("over");
        setWinner("bot");
        setShowLevelFailed(true);
        setMessage("You Failed! Press R to retry this level.");
        setDropBox(null);
        setRunning(false);
        setGamestate("failed");
      }

      if (newFlag.heldBy === "player") {
        newFlag.x = px;
        newFlag.y = py;
      }

      setPlayer(p => ({
        ...p,
        x: px,
        y: py,
        score: newPlayerScore,
        facing: lastFace,
        lastMoveDir: newLastMoveDir,
      }));
      setBots(remainingBots);
      setFlag(newFlag);
      setBullets(newBullets);
      setEnemyHp(newEnemyHp);

      if (gamestate === "running" && !playerScored && !botCaught)
        anim = requestAnimationFrame(gameTick);
    }
    if (gamestate === "running") anim = requestAnimationFrame(gameTick);
    return () => { if (anim) cancelAnimationFrame(anim); };
    // eslint-disable-next-line
  }, [gamestate, running, player, bots, flag, dropBox, obstacles, level, bullets, enemyHp]);

  // PUBLIC_INTERFACE
  function shootBullet() {
    // Gun cooldown (350ms)
    if (!player.canShoot || !running) return;
    let px = player.x, py = player.y;
    // DIRECTION:
    // If moving, shoot in that direction. If standing, shoot in last moved direction.
    let moveDir = player.lastMoveDir && (player.lastMoveDir.x !== 0 || player.lastMoveDir.y !== 0)
      ? player.lastMoveDir
      : lastDirectionRef.current || { x: 1, y: 0 }; // default to right
    // If not moving, use facing left/right for backward compatibility
    if (moveDir.x === 0 && moveDir.y === 0) moveDir = { x: player.facing, y: 0 };
    // Normalize
    let mag = Math.sqrt(moveDir.x * moveDir.x + moveDir.y * moveDir.y) || 1;
    let dir = { x: moveDir.x / mag, y: moveDir.y / mag };
    let vx = dir.x * 8.7, vy = dir.y * 8.7;
    // Bullet spawns at player center
    setBullets(bu => [
      ...bu,
      {
        x: px,
        y: py,
        vx,
        vy,
        origin: { x: px, y: py },
        age: 0,
      },
    ]);
    setPlayer(pl => ({
      ...pl,
      isShooting: true,
      shootAnim: 0,
      canShoot: false,
    }));
    shootCooldown.current = true;
    setTimeout(() => {
      shootCooldown.current = false;
      setPlayer(pl => ({ ...pl, canShoot: true }));
    }, 350);
  }

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
  const handleRestart = (autoStart = false, options = {}) => {
    setShowLevelCompleted(false);
    setShowLevelFailed(false);
    setWinner(null);
    setMessage("");
    keyState.current = {};
    if (options && options.restartAtCurrentLevel) {
      setTimer(SESSION_TIME);
      setGamestate(autoStart ? "running" : "ready");
      setRunning(!!autoStart);
    } else {
      setLevel(1);
      setTimer(SESSION_TIME);
      setGamestate(autoStart ? "running" : "ready");
      setRunning(!!autoStart);
    }
  };

  // --- Render UI info
  const pad = n => String(n).padStart(2, "0");
  const timerStr = `${pad(Math.floor(timer / 60))}:${pad(timer % 60)}`;
  let statusMsg = message;
  if (!statusMsg && (flag.heldBy === "player" && dropBox))
    statusMsg = "Deliver the flag to the drop-off box!";
  if (!statusMsg && gamestate === "paused")
    statusMsg = "Game paused.";

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
  const pointsForLevel = level;
  const userScore = player.score;
  const botTopScore = Math.max(0, ...bots.map(b => b.score));
  let btnLbl = gamestate === "ready" || gamestate === "paused" ? "Start" : "Resume";

  // ---- CANVAS RENDER LOGIC (minimal version ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Field background
    ctx.fillStyle = "#f9fbfc";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Obstacles (optional/minimal)
    // (skipped for basic visual clarity)

    // Drop box area (if exists)
    if (dropBox) {
      ctx.save();
      ctx.globalAlpha = 0.51;
      ctx.beginPath();
      ctx.arc(dropBox.x, dropBox.y, DROP_BOX_SIZE / 2, 0, 2 * Math.PI);
      ctx.fillStyle = "#7bffa6";
      ctx.shadowColor = "#9bff4a";
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.3;
      ctx.strokeStyle = "#50e968";
      ctx.stroke();
      ctx.font = "800 22px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#202";
      ctx.globalAlpha = 0.92;
      ctx.fillText("⬇️", dropBox.x, dropBox.y + 8);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Draw flag (free-standing)
    if (flag && !flag.heldBy) {
      ctx.save();
      ctx.translate(flag.x, flag.y);
      ctx.beginPath();
      ctx.arc(0, 0, FLAG_SIZE / 2, 0, 2 * Math.PI);
      ctx.fillStyle = CLR_ACC;
      ctx.fill();
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = "#ffe576";
      ctx.stroke();
      // Emoji flag as marker
      ctx.font = "bold 18px Arial";
      ctx.fillStyle = "#303865";
      ctx.globalAlpha = 0.97;
      ctx.fillText("🏳️", 0, 5);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Draw bullets (blaster shots, yellow dots)
    for (const bullet of bullets) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffd44d";
      ctx.shadowColor = "#ffe576";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Draw bots (simple: single magenta circle + eye, no fancy limbs/animations)
    for (const bot of bots) {
      ctx.save();
      ctx.translate(bot.x, bot.y);
      // Body
      ctx.beginPath();
      ctx.arc(0, 0, BOT_SIZE / 2, 0, 2 * Math.PI);
      let hpEnt = enemyHp[bot.id] || { hp: 3, hitAnim: 0 };
      if (hpEnt.hitAnim > 0.1) {
        ctx.globalAlpha = 0.55 + 0.4 * Math.abs(Math.cos(hpEnt.hitAnim * 21));
      }
      ctx.fillStyle = CLR_BOT;
      ctx.strokeStyle = "#b843ac";
      ctx.lineWidth = 2.2;
      ctx.shadowColor = "#ffabfd";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      // Eye
      ctx.beginPath();
      ctx.arc(0, -3, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -3, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#474da7";
      ctx.fill();
      // HP dots above head
      ctx.save();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-7 + i * 7, -18, 2.4, 0, 2 * Math.PI);
        ctx.fillStyle = (hpEnt.hp > i) ? "#fff" : "#808088";
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      ctx.restore();
    }

    // Draw Player (simple circle + color band)
    ctx.save();
    ctx.translate(player.x, player.y);

    // Shadow (simple ellipse, offset downward)
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(0, 16, 14, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1581ab29";
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 2, 0, 2 * Math.PI);
    ctx.fillStyle = CLR_PRI;
    ctx.shadowColor = "#6cf9ea";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = "#11bcef";
    ctx.stroke();

    // Face band (oval/helmet visor)
    ctx.beginPath();
    ctx.ellipse(0, -5, 8, 3, 0, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Small eyes
    ctx.save();
    ctx.beginPath();
    ctx.arc(-4, -5, 1.7, 0, Math.PI * 2);
    ctx.arc( 4, -5, 1.7, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();

    // Holding a flag?
    if (flag && flag.heldBy === "player") {
      ctx.save();
      ctx.translate(13, 8);
      ctx.beginPath();
      ctx.arc(0, 0, FLAG_SIZE / 2, 0, 2 * Math.PI);
      ctx.fillStyle = CLR_ACC;
      ctx.shadowColor = "#ffd44d";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffe576";
      ctx.stroke();
      ctx.font = "bold 15px Arial";
      ctx.fillStyle = "#303865";
      ctx.globalAlpha = 0.98;
      ctx.fillText("🏳️", 0, 4);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Name label (above, small)
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.font = "bold 14px Poppins, Arial";
    ctx.fillStyle = "#1976d2";
    ctx.textAlign = "center";
    ctx.fillText("You", 0, -17);
    ctx.restore();

    ctx.restore();
    // End of drawing
  }, [player, bots, flag, gamestate, winner, dropBox, obstacles, bullets, enemyHp, showLevelCompleted, showLevelFailed]);

  // --- Render: UI overlay info
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
                      setShowLevelCompleted(false);
                      setShowLevelFailed(false);
                      setLevel(lvl => lvl + 1);
                    }}
                  >
                    Continue
                  </button>
                  <button
                    className="game-btn"
                    tabIndex={0}
                    onClick={() => {
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
        {/* ---- Instructions Panel ---- */}
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
          <div style={{fontWeight: 700, color: "var(--accent, #ffd44d)", fontSize: "1.13em", marginBottom: 6, letterSpacing: "0.02em"}}>
            How to Play
          </div>
          <ul style={{margin: 0, paddingLeft: "1.1em", listStyle: "disc"}}>
            <li>
              <span style={{ color: "#9bff4a", fontWeight: 600 }}>Move</span>:&nbsp;
              <kbd>WASD</kbd> or <kbd>Arrow Keys</kbd>
            </li>
            <li>
              <span style={{ color: "#ffd44d", fontWeight: 600 }}>Shoot</span>:&nbsp;
              <kbd>J</kbd>&nbsp;/&nbsp;<kbd>K</kbd>&nbsp;/&nbsp;<kbd>Z</kbd> or <span style={{color:"#ffd44d"}}>Mouse Click</span>
            </li>
            <li>
              <span style={{ color: "#46cbf9", fontWeight: 600 }}>Grab</span> the flag (🏳️), deliver it to the <span style={{color:"#9bff4a"}}>Drop-Off Box</span> to win the level!
            </li>
            <li>
              <span style={{color: "#ff7bfa", fontWeight: 600}}>Watch out!</span> Avoid enemy bots. More bots as you level up.
            </li>
            <li style={{ fontSize: ".97em", color: "#c2eafd" }}>
              <span style={{color:"#ffd44d"}}>Extras:</span>
              <span style={{marginLeft:8}}><kbd>P</kbd> = Pause</span>
              <span style={{marginLeft:12}}><kbd>R</kbd> = Restart</span>
              <span style={{marginLeft:12, color:"#ccc"}}>Points/level and bots increase every round.</span>
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
          {/* Overlay logic */}
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
          {/* In normal play */}
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
          Controls: <kbd>WASD</kbd> or <kbd>Arrow Keys</kbd> to move.{" "}
          Grab the flag, deliver to drop-off box!
          <br />
          Avoid bots. More bots as you level up.
          <br />
          <span style={{color:'#aaa',fontSize:13}}>Level up for tougher competition.&nbsp;P: Pause &nbsp; R: Restart</span>
        </div>
        <div style={{ marginTop: "0.8rem", color: "#bbb", fontSize: 13 }}>
          Points per level: {pointsForLevel} &bull; Bots: {numBots}
        </div>
      </main>
    </div>
  )
}

export default App;
