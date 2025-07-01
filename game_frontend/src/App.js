import React, { useRef, useEffect, useState } from "react";
import "./App.css";

/*
  Simple 2D CTF Game: Minimal UI, basic player/enemy visuals. 
  This file restores simple circle/oval-based character and bot design, 
  and ensures bullets spawn from player and fire in current/last direction moved.
*/

/*
  Enhance core gameplay: 'R' reliably restarts, player running animation, bigger/cooler flag, shots trigger from player center and direction always.
*/

// ---- Constants ---- 
const CANVAS_W = 440;
const CANVAS_H = 320;

// Player, Bot, and Flag sizing - updated for bigger flag per request
const PLAYER_SIZE = 24;
const BOT_SIZE = 24;
const FLAG_SIZE = 30; // was 18; now visually bigger and more prominent!
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

  // X-TO-PLAY OVERLAY STATE
  const [showXToPlay, setShowXToPlay] = useState(true); // at launch, overlay is shown
  // -- will be dismissed after pressing X, then game starts

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

  // --- Keyboard controls + Reliable R-key Restart ---
  useEffect(() => {
    // Prevent default scroll for X and R keys, and handle restart robustly.
    function handleDown(e) {
      // --- Prevent page auto-scroll on X and R keys (and their uppercase) ---
      if (
        e.key === "x" ||
        e.key === "X" ||
        e.key === "r" ||
        e.key === "R"
      ) {
        // Only prevent scrolling for unmodified keys (avoid interfering with screen readers)
        if (
          !e.altKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.shiftKey
        ) {
          // Only preventDefault if focused outside input fields (so accessibility is preserved)
          const tag = e.target && e.target.tagName
            ? e.target.tagName.toLowerCase()
            : '';
          if (!["input", "textarea", "select"].includes(tag)) {
            e.preventDefault();
          }
        }
      }

      // --- PRESS X TO START THE GAME (when showXToPlay is true) ---
      if (showXToPlay && (e.key === "x" || e.key === "X")) {
        setShowXToPlay(false);
        // Actually start the game!
        handleStart();
        return;
      }
      if (showXToPlay) return; // Pause gameplay input before X

      // Movement keys
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = true;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = true;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = true;
      if (e.key === "p" || e.key === "P") { if (running) handlePause(); }
      // Shoot (J, K, Z) or mouse
      if (["j", "J", "k", "K", "z", "Z"].includes(e.key)) { shootBullet(); }
      // -- R to restart level/game always
      if (e.key === "r" || e.key === "R") {
        // Prevent repeated R from spamming
        // If in level completed/failed, restart at current. Otherwise restart whole game
        if (showLevelCompleted || showLevelFailed || gamestate === "failed" || gamestate === "postlevel") {
          robustRestart(true, { restartAtCurrentLevel: true });
        } else {
          robustRestart(true, { restartAtCurrentLevel: false });
        }
      }
    }
    function handleUp(e) {
      if (showXToPlay) return; // Block game input before X
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = false;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = false;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = false;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = false;
    }
    function handleMouseDown(e) {
      if (showXToPlay) return;
      if (e.button === 0 && running) { shootBullet(); }
    }
    window.addEventListener("keydown", handleDown, { passive: false });
    window.addEventListener("keyup", handleUp);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleDown, { passive: false });
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("mousedown", handleMouseDown);
    };
    // DO NOT add player to deps
    // eslint-disable-next-line
  }, [player.canShoot, running, showLevelCompleted, showLevelFailed, gamestate, showXToPlay]);

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

    // Always take the latest player position from state
    let px = player.x, py = player.y;

    // Discover player's intended shot direction:
    // If moving, shoot in that direction.
    // If not moving, shoot in the last moved direction.
    // If there was never any movement, shoot right.
    let moveVec = { x: 0, y: 0 };

    // Compute current movement vector from pressed keys for real-time direction
    if (keyState.current.up) moveVec.y -= 1;
    if (keyState.current.down) moveVec.y += 1;
    if (keyState.current.left) moveVec.x -= 1;
    if (keyState.current.right) moveVec.x += 1;

    let dir; // final firing direction: unit vector
    if (moveVec.x !== 0 || moveVec.y !== 0) {
      // If currently moving according to input, use that direction (normalized)
      const mag = Math.sqrt(moveVec.x * moveVec.x + moveVec.y * moveVec.y);
      dir = { x: moveVec.x / mag, y: moveVec.y / mag };
      // Update lastDirectionRef to this movement for the next still shot
      lastDirectionRef.current = dir;
    } else if (
      player.lastMoveDir &&
      (player.lastMoveDir.x !== 0 || player.lastMoveDir.y !== 0)
    ) {
      // If not moving, use most recent move direction
      const mag = Math.sqrt(player.lastMoveDir.x * player.lastMoveDir.x + player.lastMoveDir.y * player.lastMoveDir.y) || 1;
      dir = { x: player.lastMoveDir.x / mag, y: player.lastMoveDir.y / mag };
    } else if (
      lastDirectionRef.current &&
      (lastDirectionRef.current.x !== 0 || lastDirectionRef.current.y !== 0)
    ) {
      // If that fails (fresh game), fallback to lastDirectionRef (yields right at start)
      dir = { x: lastDirectionRef.current.x, y: lastDirectionRef.current.y };
    } else {
      // Absolute fallback: right
      dir = { x: 1, y: 0 };
    }

    // Always normalize result (robustness)
    const mag = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
    dir = { x: dir.x / mag, y: dir.y / mag };

    // Bullet velocity
    let vx = dir.x * 8.7, vy = dir.y * 8.7;

    // Bullet spawns at player's current actual center, always
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
    // Legacy: DELEGATED to robustRestart to avoid duplicated logic
    robustRestart(autoStart, options);
  };

  /**
   * PUBLIC_INTERFACE
   * Fully reset and re-initialize all relevant game state for robust level/game restart.
   * @param {boolean} autoStart - If true, immediately start running after restart.
   * @param {object} options - Options object: {restartAtCurrentLevel: bool}
   */
  function robustRestart(autoStart = false, options = {}) {
    // Reset overlay/level UI panels and in-progress dialogs
    setShowLevelCompleted(false);
    setShowLevelFailed(false);
    setWinner(null);
    setMessage("");
    // Clear control state
    keyState.current = {};

    // Defensive reset for all dynamic game state pieces.
    setBullets([]);
    setBots([]);
    setFlag({ x: 0, y: 0, heldBy: null, home: true });
    setDropBox(null);
    setObstacles([]);
    setEnemyHp({});
    setPlayer({
      x: 60,
      y: CANVAS_H / 2,
      dx: 0,
      dy: 0,
      score: 0,
      facing: 1,
      lastMoveDir: { x: 1, y: 0 },
      canShoot: true,
      isShooting: false,
      shootAnim: 0,
      isJumping: false,
      jumpPhase: 0,
    });
    setTimer(SESSION_TIME);

    if (options && options.restartAtCurrentLevel) {
      // Don't change level, but ensure field is re-initialized (useEffect on [level])
      setGamestate(autoStart ? "running" : "ready");
      setRunning(!!autoStart);
      if (!autoStart) setShowXToPlay(true);
      // Trigger field/init by setting level to current - 1 then back (forces re-mount for hard reset)
      setLevel(lvl => {
        // This short cycle triggers the useEffect([level]) even if level didn't get changed externally
        // If on first level, don't go below 1
        const previous = Math.max(lvl - 1, 1);
        const curr = lvl;
        if (previous !== curr) {
          setTimeout(() => setLevel(curr), 1);
          return previous;
        }
        // If at lvl 1, force an update via a dummy state if needed
        return curr;
      });
    } else {
      // Reset to base level 1
      setLevel(1);
      setGamestate(autoStart ? "running" : "ready");
      setRunning(!!autoStart);
      if (!autoStart) setShowXToPlay(true);
      // UseEffect([level]) will trigger new field/positions etc.
    }
  }

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
  // Remove Start button variable. No longer needed.
  //let btnLbl = gamestate === "ready" || gamestate === "paused" ? "Start" : "Resume";

  // ---- CANVAS RENDER LOGIC (with player running animation + bigger flag/shot origins) ----
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

    // Draw flag (free-standing or player-held, bigger/scifi-cooler)
    if (flag && !flag.heldBy) {
      ctx.save();
      ctx.translate(flag.x, flag.y);
      // Big shadow for sci-fi effect
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(0, FLAG_SIZE * 0.34, FLAG_SIZE * 0.51, FLAG_SIZE * 0.21, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ead730";
      ctx.shadowColor = "#ffe576";
      ctx.shadowBlur = 13;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
      // Cartoon flag staff
      ctx.save();
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = "#23264d";
      ctx.beginPath();
      ctx.moveTo(-FLAG_SIZE*0.34, -FLAG_SIZE/2+6);
      ctx.lineTo(-FLAG_SIZE*0.34, FLAG_SIZE*0.4);
      ctx.stroke();
      ctx.restore();
      
      // Sci-fi glowing main flag blob
      ctx.beginPath();
      ctx.arc(0, 0, FLAG_SIZE / 2, 0, 2 * Math.PI);
      ctx.fillStyle = CLR_ACC;
      ctx.shadowColor = "#ffe576";
      ctx.shadowBlur = 16;
      ctx.globalAlpha = 0.94;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.7;
      ctx.strokeStyle = "#ffe576";
      ctx.stroke();

      // Layer: stylized cartoon flag (emoji plus trail)
      ctx.save();
      ctx.font = "bold 25px Arial";
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.99;
      ctx.fillStyle = "#23264d";
      ctx.rotate(-0.08);
      ctx.fillText("🏳️", 4, 10);
      // Sparkle trail (cartoony)
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.moveTo(8, 3); ctx.lineTo(17, 7.6); ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#ffe3ab";
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.restore();
    }

    // Draw bullets (blaster shots, yellow dots) - (no change vs original)
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

    // --- Draw ENEMY BOTS (Complex robotic/cartoony style, distinct personality) ---
    for (const bot of bots) {
      ctx.save();
      ctx.translate(bot.x, bot.y);

      // --- Drop Shadow
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.ellipse(0, 13, 12, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#842c74";
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // -- Body: main chassis (squat dome with "jaw" underplate) --
      ctx.beginPath();
      ctx.ellipse(0, 0, BOT_SIZE / 2, BOT_SIZE / 2.25, 0, 0, Math.PI * 2);
      let hpEnt = enemyHp[bot.id] || { hp: 3, hitAnim: 0 };
      if (hpEnt.hitAnim > 0.1) {
        ctx.globalAlpha = 0.52 + 0.43 * Math.abs(Math.cos(hpEnt.hitAnim * 21));
      }
      ctx.fillStyle = "#f0b9fc";
      ctx.shadowColor = "#ffbcf6";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#b843ac";
      ctx.stroke();
      // Lower jaw plate
      ctx.beginPath();
      ctx.ellipse(0, 11, 11, 6, 0, Math.PI * 2, false);
      ctx.fillStyle = "#fdf5fe";
      ctx.globalAlpha = 0.70;
      ctx.fill();
      ctx.globalAlpha = 1;

      // -- Eye: Large robotic glass with glint
      ctx.beginPath();
      ctx.ellipse(0, -4, 7, 5, 0, 0, 2 * Math.PI);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#c6c9ff";
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.ellipse(0, -4, 4.1, 2.7, 0, 0, 2 * Math.PI);
      ctx.fillStyle = "#382454";
      ctx.fill();

      // Eye highlight
      ctx.beginPath();
      ctx.arc(-1.9, -6, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "#caf1ff";
      ctx.globalAlpha = 0.62;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Evil "eyebrows"
      ctx.save();
      ctx.strokeStyle = "#8d2ea1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, -8.2);
      ctx.quadraticCurveTo(0, -12, 5, -8.1);
      ctx.stroke();
      ctx.restore();

      // -- Unique details: ["antenna", body highlights, jawline bolts, jaw-grill]
      // Antenna
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, -BOT_SIZE/2 + 3, 2.38, 0, Math.PI*2);
      ctx.fillStyle = "#ffd44d";
      ctx.shadowColor = "#ffe899";
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(0, -BOT_SIZE/2 + 3); // ball
      ctx.lineTo(0, -BOT_SIZE/2 + 10);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#8267fb";
      ctx.stroke();
      ctx.restore();

      // Cheek bolts (cartoon robot)
      ctx.beginPath();
      ctx.arc(-8.2, 1, 1.33, 0, Math.PI * 2);
      ctx.arc(8.2, 1, 1.33, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd44d";
      ctx.globalAlpha = 0.74;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Jaw "grill" (vertical teeth lines)
      ctx.save();
      ctx.strokeStyle = "#bd8fdc";
      ctx.lineWidth = 1.1;
      for (let gx = -5; gx <= 5; gx += 2.5) {
        ctx.beginPath();
        ctx.moveTo(gx, 8);
        ctx.lineTo(gx, 14.2);
        ctx.stroke();
      }
      ctx.restore();

      // Side panels / body accents
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(-9.8, 0.1, 2.1, 2.7, -0.38, 0, Math.PI * 2);
      ctx.ellipse(9.8, -0.7, 2.1, 2.7, 0.38, 0, Math.PI * 2);
      ctx.fillStyle = "#ff99e7";
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // -- "Arms": Little claw arms (angle, body-side color)
      ctx.save();
      ctx.strokeStyle = "#dbbcf9";
      ctx.lineWidth = 3.3;
      ctx.beginPath();
      ctx.moveTo(-BOT_SIZE/2 + 2, 3);
      ctx.lineTo(-BOT_SIZE/2 - 5, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(BOT_SIZE/2 - 2, 3);
      ctx.lineTo(BOT_SIZE/2 + 5, 8);
      ctx.stroke();
      // Claw ends
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.arc(-BOT_SIZE/2 - 5, 8, 2, 0, Math.PI*2);
      ctx.arc(BOT_SIZE/2 + 5, 8, 2, 0, Math.PI*2);
      ctx.strokeStyle = "#ffebf9";
      ctx.stroke();
      ctx.restore();

      // -- Leg "tracks"/wheels
      ctx.save();
      ctx.fillStyle = "#d066e1";
      ctx.beginPath();
      ctx.ellipse(-5, BOT_SIZE/2 - 3, 3.1, 1.5, 0.15, 0, Math.PI*2);
      ctx.ellipse(5, BOT_SIZE/2 - 3, 3.1, 1.5, -0.15, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // HP dots above head (robotic "LEDs")
      ctx.save();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-7 + i * 7, -18, 2.4, 0, 2 * Math.PI);
        ctx.fillStyle = i < hpEnt.hp ? "#fff" : "#885e9b";
        ctx.globalAlpha = 0.88;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // Name label (above head, robot cartoon font style)
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.font = "700 13px Poppins, Arial";
      ctx.fillStyle = "#b722b1";
      ctx.textAlign = "center";
      ctx.fillText("BOT", 0, -23);
      ctx.restore();

      ctx.restore();
    }

    // --- Draw PLAYER (sci-fi android/hero-bot, running animation + arms/legs swing) ---
    ctx.save();
    ctx.translate(player.x, player.y);

    // Figure running state: if moving, animate, else idle
    const now = performance.now();
    const moving = Math.abs(player.dx) > 0.1 || Math.abs(player.dy) > 0.1 ||
      (keyState.current.up || keyState.current.down || keyState.current.left || keyState.current.right);
    // Use time-based animation so animation continues even when idle at last-move
    const runPhase = moving ? (now / 110) % (2 * Math.PI) : 0;
    // Set for use in animation
    const armSwing = moving ? Math.sin(runPhase) * 9.5 : 0;
    const legSwing = moving ? Math.sin(runPhase + Math.PI) * 9.5 : 0;

    // Drop Shadow, larger and softer
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.ellipse(0, 16, 14, 6.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#33acf72d";
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // -- Main Body (rounded pill + 3D chest panel) --
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, PLAYER_SIZE / 2, PLAYER_SIZE / 2.12, 0, 0, Math.PI * 2); // main torso
    ctx.fillStyle = CLR_PRI;
    ctx.shadowColor = "#94fdff";
    ctx.shadowBlur = 13;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.18;
    ctx.strokeStyle = "#17e1fe";
    ctx.stroke();
    // 3D chest/visor panel
    ctx.beginPath();
    ctx.ellipse(0, 2.6, 9, 6.0, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // -- Helmet "visor" (large faceplate, blue tint, shiny)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -6, 9, 5.5, 0, 0, 2 * Math.PI);
    ctx.fillStyle = "#e0fcff";
    ctx.globalAlpha = 0.26;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -6, 8, 4.7, 0.05, 0, 2 * Math.PI);
    ctx.fillStyle = "#b8ecfb";
    ctx.globalAlpha = 0.38;
    ctx.fill();
    // Shine
    ctx.beginPath();
    ctx.ellipse(-3.2, -8, 2.2, 0.85, -0.28, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.33;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // -- Eyes (anime/cartoony, glowing blue)
    ctx.save();
    ctx.beginPath();
    ctx.arc(-3.2, -7.1, 1.35, 0, Math.PI * 2);
    ctx.arc( 3.5, -7.0, 1.35, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.8;
    ctx.shadowColor = "#73ecff";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    // Pupils/irises
    ctx.beginPath();
    ctx.arc(-3.2, -7.2, 0.6, 0, Math.PI * 2);
    ctx.arc( 3.5, -7.1, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#249df7";
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    // Eyebrows (friendly curve)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-4.4, -9);
    ctx.quadraticCurveTo(-3.1, -10, -1.7, -8.8);
    ctx.moveTo(2, -9.2);
    ctx.quadraticCurveTo(3.8, -10.1, 5.6, -8.5);
    ctx.strokeStyle = "#36b6ea";
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // -- Antenna module (asym LED, adds charm)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, -PLAYER_SIZE/2 + 2.5, 2.2, 0, Math.PI*2);
    ctx.fillStyle = "#ffd44d";
    ctx.globalAlpha = 0.93;
    ctx.shadowColor = "#fff2ad";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, -PLAYER_SIZE/2 + 2.5);
    ctx.lineTo(0.8, -PLAYER_SIZE/2 + 8.5);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#17e1fe";
    ctx.stroke();
    ctx.restore();

    // -- ARMS: animate for running
    ctx.save();
    ctx.lineWidth = 5.2;
    ctx.strokeStyle = "#93eaff";
    ctx.beginPath();
    // Left Arm, swings back when right leg is forward and vice versa
    ctx.moveTo(-PLAYER_SIZE / 2 + 2, 0);
    ctx.lineTo(-PLAYER_SIZE / 2 - 7, 7 + armSwing);
    // Right Arm
    ctx.moveTo(PLAYER_SIZE / 2 - 2, 0);
    ctx.lineTo(PLAYER_SIZE / 2 + 7, 7 - armSwing);
    ctx.stroke();

    // Arm fingerprints (static, end of limb)
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = "#ffd44d";
    ctx.beginPath();
    ctx.moveTo(-PLAYER_SIZE / 2 - 6, 7 + armSwing);
    ctx.lineTo(-PLAYER_SIZE / 2 - 4, 8.9 + armSwing);
    ctx.moveTo(PLAYER_SIZE / 2 + 6, 7 - armSwing);
    ctx.lineTo(PLAYER_SIZE / 2 + 4, 8.9 - armSwing);
    ctx.stroke();
    ctx.restore();

    // -- LEGS (running: wheel bases "bounce" forward/back per leg swing)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-5.5, PLAYER_SIZE / 2 - 2.5 + legSwing * 0.13, 3.5, 1.7, 0.12, 0, Math.PI * 2);
    ctx.ellipse(5.5, PLAYER_SIZE / 2 - 2.5 - legSwing * 0.13, 3.5, 1.7, -0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#27eada";
    ctx.globalAlpha = 0.72;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // -- Cheek "LEDs"
    ctx.save();
    ctx.beginPath();
    ctx.arc(-8.2, 0, 1.33, 0, Math.PI * 2);
    ctx.arc(8.2, 0.8, 1.33, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd44d";
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // -- If holding a flag, draw the flag (bigger, sci-fi, cartoon)
    if (flag && flag.heldBy === "player") {
      ctx.save();
      // "Attach" to right hand when running (limb swings)
      const handX = 13 + armSwing * 0.18;
      const handY = 8 + armSwing * 0.20;
      ctx.translate(handX, handY);
      // Staff
      ctx.save();
      ctx.lineWidth = 3.1;
      ctx.strokeStyle = "#23264d";
      ctx.beginPath();
      ctx.moveTo(-FLAG_SIZE*0.34, -FLAG_SIZE/2+6);
      ctx.lineTo(-FLAG_SIZE*0.34, FLAG_SIZE*0.4);
      ctx.stroke();
      ctx.restore();
      // Main flag
      ctx.beginPath();
      ctx.arc(0, 0, FLAG_SIZE / 2, 0, 2 * Math.PI);
      ctx.fillStyle = CLR_ACC;
      ctx.shadowColor = "#ffd44d";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = "#ffe576";
      ctx.stroke();
      ctx.font = "bold 21px Arial";
      ctx.fillStyle = "#303865";
      ctx.globalAlpha = 0.98;
      ctx.fillText("🏳️", 0, 7);
      // Little sparkle accent
      ctx.globalAlpha = 0.60;
      ctx.beginPath();
      ctx.moveTo(8, 3);
      ctx.lineTo(18, 10.5);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = "#ffe799";
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Name label (above, in friendly accent blue)
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.font = "bold 14px Poppins, Arial";
    ctx.fillStyle = "#1799e7";
    ctx.textAlign = "center";
    ctx.fillText("YOU", 0, -20);
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
          {/* -- OVERLAY: PRESS X TO PLAY -- */}
          {showXToPlay && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(30,35,70,0.93)",
                zIndex: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                borderRadius: "18px",
                transition: "opacity 0.36s",
                cursor: "pointer"
              }}
              tabIndex={-1}
              aria-modal="true"
            >
              <div style={{
                color: "#fff",
                fontSize: "2.0rem",
                fontFamily: "'Poppins','Segoe UI',Arial,sans-serif",
                fontWeight: 700,
                textShadow: "0 4px 16px #23264d, 0 1px 0 #fff4",
                letterSpacing: "0.04em",
                marginBottom: 13,
                userSelect: "none"
              }}>
                Press <span style={{ color: "#ffd44d", fontSize: "2.3rem", padding: "0 0.2em" }}>X</span> to play
              </div>
              <div style={{
                color: "#ffd44d",
                marginTop: 5,
                fontFamily: "inherit",
                fontSize: "1.08em",
                opacity: 0.87,
                fontWeight: 500
              }}>
                (Keyboard required)
              </div>
              <div style={{
                color: "#7bffea", fontSize: 15, marginTop: 18, opacity: 0.7, letterSpacing: "0.01em"
              }}>
                Start anytime by pressing <kbd>X</kbd>
              </div>
            </div>
          )}
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
          {/* Main control buttons, but REMOVE the Start button */}
          {!showLevelCompleted && !showLevelFailed && (
            <>
              {/* No Start button - replaced by X-to-play overlay */}
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
