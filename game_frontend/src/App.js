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

// PUBLIC_INTERFACE
function playSound(eventType) {
  /**
   * Play a sound based on the event type.
   * Placeholder implementation: Loads a sound FX URL assigned for each event.
   * Integrate with 'howler.js' for advanced, or use Audio() for light build.
   * Future: Place custom SFX files in /src/assets/sfx/
   */
  const sfxMap = {
    "flag-pickup": "https://cdn.pixabay.com/audio/2022/10/16/audio_12ac80c89e.mp3", // placeholder
    "score": "https://cdn.pixabay.com/audio/2022/07/26/audio_124bfa8c79.mp3",
    "fail": "https://cdn.pixabay.com/audio/2022/07/26/audio_1264cc2f3e.mp3",
    "gameover": "https://cdn.pixabay.com/audio/2022/07/26/audio_1264cc2f3e.mp3",
    "advance": "https://cdn.pixabay.com/audio/2022/10/16/audio_12a4d3e613.mp3",
    "click": "https://cdn.pixabay.com/audio/2022/07/26/audio_1261a15e16.mp3",
  };
  const url = sfxMap[eventType] || sfxMap["click"];
  // eslint-disable-next-line
  if (typeof window !== "undefined") {
    try {
      const audio = new window.Audio(url);
      audio.volume = 0.25; // Friendly FX
      audio.play();
    } catch (e) {}
  }
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

// PUBLIC_INTERFACE
function App() {
  // --- Core state
  const [player, setPlayer] = useState({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });
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
  // New: for explicit level/fail overlay control
  const [showLevelCompleted, setShowLevelCompleted] = useState(false);
  const [showLevelFailed, setShowLevelFailed] = useState(false);

  // --- Controls, Refs
  const canvasRef = useRef(null);
  const keyState = useRef({});

  // --- Derived counts
  const numBots = BASE_NUM_BOTS + Math.floor((level - 1) / 2);
  const numObstacles = BASE_NUM_OBSTACLES + Math.max(level - 1, 0);

  // --- On mount & level up: initialize field
  useEffect(() => {
    // Place flag in random area not in drop box/obstacle/player start
    const newFlag = { ...randomPos(CANVAS_W, CANVAS_H, 30), heldBy: null, home: true };
    setFlag(newFlag);
    // Player at left
    setPlayer({ x: 60, y: CANVAS_H/2, dx: 0, dy: 0, score: 0 })
    // AI bots: staggered at right
    const botsArr = Array.from({ length: numBots }, (_, i) => ({
      id: i + 1,
      x: CANVAS_W - 40 - (i*33),
      y: 1.4*CANVAS_H/3 + (i*27),
      dx: 0,
      dy: 0,
      score: 0,
      // botParams for unique behavior
      params: { 
        offset: (i * Math.PI) / numBots,
        swing: 18 + Math.random() * 11,
        pursuitBias: 0.4 + 0.3 * (i / Math.max(numBots-1,1)),
      }
    }));
    setBots(botsArr);

    // Drop box: disabled until player picks flag
    setDropBox(null);

    // Random obstacles
    const obsList = [];
    let added = 0, tryCount = 0;
    while (added < numObstacles && tryCount < 50) {
      const obs = randomObstacleRect(CANVAS_W, CANVAS_H);
      // Avoid overlap with player start, bots, flag
      let overlaps = false;
      if (dist(obs.x, obs.y, 60, CANVAS_H/2) < 75 || 
          dist(obs.x+obs.w, obs.y+obs.h, 60, CANVAS_H/2) < 68)
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

    // Score, timer
    setTimer(SESSION_TIME);
    setMessage("");
    setWinner(null);
    setGamestate("ready");
    setRunning(false);
    setShowLevelCompleted(false);
    setShowLevelFailed(false);

  // We want to reset on level change (including initial mount)
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
    function handleDown(e) {
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = true;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = true;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = true;
      if (e.key === "p" || e.key === "P") { if(running) handlePause(); }
      // Removed: 'R' key handling for restart/continue by keyboard, now handled by buttons for level overlays
    }
    function handleUp(e) {
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = false;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = false;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = false;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = false;
    }
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
    // only once on mount
    // eslint-disable-next-line
  }, []);

  // --- Game logic loop (player/bots/flag/obstacles/collisions/progress)
  useEffect(() => {
    let anim;
    let prevTimestamp = performance.now();

    function isMoveAllowed(nx, ny, rad, obsList) {
      // test against all obstacles
      for (let o of obsList) if (isCircleRectColliding(nx, ny, rad, o.x, o.y, o.w, o.h)) return false;
      // always inside field
      if (nx < rad || ny < rad || nx > CANVAS_W-rad || ny > CANVAS_H-rad) return false;
      return true;
    }

    function gameTick(timestamp) {
      if (gamestate !== "running") return;
      const delta = timestamp - prevTimestamp;
      prevTimestamp = timestamp;

      // --- Player move (+ obstacle collision)
      let [px, py] = [player.x, player.y];
      let pvx = 0, pvy = 0;
      if (keyState.current.up) pvy -= PLAYER_SPEED;
      if (keyState.current.down) pvy += PLAYER_SPEED;
      if (keyState.current.left) pvx -= PLAYER_SPEED;
      if (keyState.current.right) pvx += PLAYER_SPEED;
      if (pvx !== 0 || pvy !== 0) {
        const nm = Math.sqrt(pvx*pvx + pvy*pvy) || 1;
        pvx = (pvx / nm) * PLAYER_SPEED;
        pvy = (pvy / nm) * PLAYER_SPEED;
      }
      // Try new position, if not blocked by obstacles
      if (isMoveAllowed(px + pvx, py + pvy, PLAYER_SIZE/2, obstacles)) {
        px = clamp(px + pvx, PLAYER_SIZE/2, CANVAS_W-PLAYER_SIZE/2);
        py = clamp(py + pvy, PLAYER_SIZE/2, CANVAS_H-PLAYER_SIZE/2);
      }
      else {
        // Try X or Y move only for easier sliding
        if (isMoveAllowed(px + pvx, py, PLAYER_SIZE/2, obstacles)) px += pvx;
        else if (isMoveAllowed(px, py + pvy, PLAYER_SIZE/2, obstacles)) py += pvy;
      }

      // ---- Bot AI: Always pursue the player (no flag targeting) ----
      let botArr = bots.map((bot, i, allBots) => {
        let { params } = bot;
        // Bots always target the player position for pursuit
        let tgtX = player.x;
        let tgtY = player.y;
        // Unique AI: Each bot swings in different "sine" or alternate path to avoid clustering
        // They bias towards acquisition, but with rotation based on their offset (using 'params')
        let speed = BASE_BOT_SPEED + 0.09 * (level-1) + 0.12*(i);
        let bias = params.pursuitBias + .33*(level-1)/MAX_LEVEL;
        let angle = Math.atan2(tgtY-bot.y, tgtX-bot.x);
        angle += Math.sin(performance.now()/900 + params.offset*3) * (0.08 + 0.03*i);
        let swingDist = params.swing + 3.2*level;
        // Try to avoid other bots: repulsion
        let toAvoid = allBots.reduce((sum, ob) => ob!==bot && dist(bot.x,bot.y,ob.x,ob.y)<22 ? sum+Math.sign(bot.x-ob.x) : sum, 0);
        if (toAvoid) angle += 0.11*toAvoid;
        let wantX = bot.x + Math.cos(angle)*speed*bias + Math.cos(angle+1.5)*speed*(1-bias)*0.49 + toAvoid;
        let wantY = bot.y + Math.sin(angle)*speed*bias + Math.sin(angle+1.7)*speed*(1-bias)*0.51 + toAvoid;
        // Try to avoid obstacles
        let ballRad = BOT_SIZE/2;
        if (isMoveAllowed(wantX, wantY, ballRad, obstacles)) {
          return { ...bot, x: clamp(wantX, ballRad, CANVAS_W-ballRad), y: clamp(wantY, ballRad, CANVAS_H-ballRad) }
        } else if (isMoveAllowed(bot.x + speed, bot.y, ballRad, obstacles)) {
          return { ...bot, x: clamp(bot.x + speed, ballRad, CANVAS_W-ballRad) }
        } else if (isMoveAllowed(bot.x, bot.y + speed, ballRad, obstacles)) {
          return { ...bot, y: clamp(bot.y + speed, ballRad, CANVAS_H-ballRad) }
        }
        return { ...bot };
      });

      // ---- Check for collisions/captures ----
      let newFlag = { ...flag };

      // Player can pick up flag if close and flag not held
      if (!flag.heldBy && dist(px, py, flag.x, flag.y) < (PLAYER_SIZE + FLAG_SIZE)/2 + 2) {
        newFlag.heldBy = "player";
        newFlag.home = false;
        setDropBox(randomDropBox(CANVAS_W, CANVAS_H, 58));
        playSound("flag-pickup"); // SFX: Flag acquired
      }

      // Bots catch player if close (game over)
      let botCaught = false;
      botArr.forEach(b => {
        if (dist(px, py, b.x, b.y) < (PLAYER_SIZE + BOT_SIZE)/2 - 2) {
          botCaught = true;
        }
      });

      // --- Drop box: scoring/level up ---
      let playerScored = false;
      if (flag.heldBy === "player" && dropBox && dist(px, py, dropBox.x, dropBox.y) < (PLAYER_SIZE + DROP_BOX_SIZE)/2 + 4) {
        playerScored = true;
      }

      // ---- Score, Level up, or Game Over ----
      let newPlayerScore = player.score, newLevel = level, newWin = null, endMsg = "";
      if (playerScored) {
        newPlayerScore += 1;
        setShowLevelCompleted(true);
        setMessage(`Level ${level} Completed! Press R to retry or advance.`);
        playSound("score"); // SFX: Player scores
        if (level >= MAX_LEVEL) {
          setGamestate("over");
          setWinner("player");
          setShowLevelCompleted(false);
          setMessage("Congratulations! You beat all levels!");
        } else {
          // Wait for player to press R, don't auto-advance.
        }
        setDropBox(null);
        // Pause timer/game on level success
        setRunning(false);
        setGamestate("postlevel"); // New gamestate for overlay
        // Do NOT auto-set-timer or auto-set-level; resume/restart drives it.
      }
      // Game over from bot catch
      if (botCaught) {
        newWin = "bot";
        setGamestate("over");
        setWinner("bot");
        setShowLevelFailed(true);
        setMessage("You Failed! Press R to retry this level.");
        setDropBox(null);
        setRunning(false);
        setGamestate("failed"); // New gamestate for failure/retry
        playSound("fail");
      }

      // Carry flag with player if holding
      if (newFlag.heldBy === "player") {
        newFlag.x = px;
        newFlag.y = py;
      }

      // Update all state
      setPlayer(p => ({...p, x: px, y: py, score: newPlayerScore}));
      setBots(botArr);
      setFlag(newFlag);

      // Timing loop for next frame
      if (!newWin && !playerScored && gamestate === "running")
        anim = requestAnimationFrame(gameTick);
    }
    if (gamestate === "running") anim = requestAnimationFrame(gameTick);
    return () => { if (anim) cancelAnimationFrame(anim); };
    // eslint-disable-next-line
  }, [gamestate, running, player, bots, flag, dropBox, obstacles, level]);

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

    // --- Player: robot-human cartoon hybrid (robotlimbs, glowing eyes, friendly face)
    /*
      PLAYER REDESIGN:
      Friendly humanoid robot: round blue head, metal arms and legs, sci-fi torso, cyan-glow round eyes.
      Placeholder only (swap with image/sprite for full polish).
    */
    ctx.save();
    ctx.translate(player.x, player.y);

    // Torso/Body
    ctx.beginPath();
    ctx.ellipse(0, 5, 10, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#72eaff";
    ctx.shadowColor = "#7fffd4";
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Head
    ctx.beginPath();
    ctx.arc(0, -10, 9.1, 0, Math.PI * 2);
    ctx.fillStyle = "#46cbf9";
    ctx.shadowColor = "#12fbff88";
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Glowing cyan eyes (cartoon, friendly, humanoid)
    ctx.beginPath();
    ctx.arc(-3.4, -12.3, 2.1, 0, Math.PI * 2);
    ctx.arc(3.4, -12.3, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = "#f4feff";
    ctx.shadowColor = "#87f0f9cc";
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mouth (smile, friendly)
    ctx.beginPath();
    ctx.arc(0, -7.7, 2.6, Math.PI * 0.16, Math.PI * 0.81, false);
    ctx.lineWidth = 1.15;
    ctx.strokeStyle = "#24d7fa";
    ctx.globalAlpha = 0.65;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Metal Arms
    ctx.save();
    // left arm
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(-18, 13);
    ctx.lineWidth = 4.3;
    ctx.strokeStyle = "#abdfff";
    ctx.shadowColor = "#87e6ff55";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // joint
    ctx.beginPath();
    ctx.arc(-18, 13, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = "#eee";
    ctx.fill();

    // right arm
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.lineTo(18, 13);
    ctx.lineWidth = 4.3;
    ctx.strokeStyle = "#abdfff";
    ctx.shadowColor = "#87e6ffc8";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // joint
    ctx.beginPath();
    ctx.arc(18, 13, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = "#eee";
    ctx.fill();
    ctx.restore();

    // Legs
    ctx.save();
    // left leg
    ctx.beginPath();
    ctx.moveTo(-5, 17);
    ctx.lineTo(-8, 28);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#93e4fc";
    ctx.shadowColor = "#87e6ff55";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // right leg
    ctx.beginPath();
    ctx.moveTo(5, 17);
    ctx.lineTo(8, 28);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#93e4fc";
    ctx.shadowColor = "#87e6ff99";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // feet (simple robotics joints)
    ctx.beginPath();
    ctx.arc(-8, 28, 2, 0, Math.PI * 2);
    ctx.arc(8, 28, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#dde1eb";
    ctx.fill();
    ctx.restore();

    // Outline for clarity
    ctx.save();
    ctx.globalAlpha = 0.70;
    ctx.beginPath();
    ctx.ellipse(0, 5, 10.8, 14, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#1a528c";
    ctx.lineWidth = 2.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -10, 9.5, 0, Math.PI * 2);
    ctx.strokeStyle = "#0a86be";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Name label
    ctx.font = "bold 15px Poppins, Arial";
    ctx.fillStyle = "#1976d2";
    ctx.textAlign = "center";
    ctx.fillText("You", 0, -22);

    // Flag carried icon
    if (flag.heldBy === "player") {
      ctx.font = "900 18px Segoe UI, Arial";
      ctx.fillStyle = CLR_ACC;
      ctx.textAlign = "center";
      ctx.shadowColor = "#fff7";
      ctx.shadowBlur = 6;
      ctx.fillText("🏳️", 0, -2);
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // --- ENEMY BOTS: Menacing, evil cartoon robots, sci-fi, angular silhouettes & red glowing angry eyes
    /*
      ENEMY BOT REDESIGN:
      - Angular head/body, sharp edges, elongated limbs
      - Deep magenta/dark colors, evil glowing red eyes
      - Placeholder only (swap with art/sprite later)
      - All visual styling is 2D cartoon-sci-fi evil
    */
    bots.forEach((bot, i) => {
      ctx.save();
      ctx.translate(bot.x, bot.y);

      // Body: angular torso
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(10, 19);
      ctx.lineTo(0, 24);
      ctx.lineTo(-10, 19);
      ctx.closePath();
      ctx.fillStyle = "rgba(193,30,226,0.94)";
      ctx.shadowColor = "#ff0050aa";
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Head: angular, sharp, angry helmet shape, glowing red
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-7, -14);
      ctx.lineTo(0, -25 - Math.sin(performance.now()/302 + i)*2.7);
      ctx.lineTo(7, -14);
      ctx.lineTo(2.8, -8);
      ctx.lineTo(-2.8, -8);
      ctx.closePath();
      ctx.fillStyle = "#a30026";
      ctx.shadowColor = "#f00";
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes: Angry red, glowing, slanted for menace
      ctx.beginPath();
      ctx.ellipse(-2.7, -14, 2, 2.6, Math.PI * -.08, 0, Math.PI*2);
      ctx.ellipse(2.7, -14, 2, 2.6, Math.PI * .07, 0, Math.PI*2);
      ctx.fillStyle = "#ff383c";
      ctx.shadowColor = "#ff7878";
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();

      // Mouth: jaggy, evil
      ctx.beginPath();
      ctx.moveTo(-2, -5);
      ctx.lineTo(-0.6, -3.8);
      ctx.lineTo(0, -3.7);
      ctx.lineTo(0.7, -3.8);
      ctx.lineTo(2, -5.3);
      ctx.strokeStyle = "#f61765";
      ctx.lineWidth = 1.05;
      ctx.globalAlpha = 0.81;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Arms: angular, sharp, metal
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-10, 3);
      ctx.lineTo(-20, 10 + Math.sin(performance.now()/220 + i*3)*6);
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = "#520018";
      ctx.shadowColor = "#ff82ef88";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(10, 3);
      ctx.lineTo(20, 10 + Math.cos(performance.now()/200 - i)*5);
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = "#520018";
      ctx.shadowColor = "#f8f8fa88";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Legs: mechanical, jagged
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-5, 23);
      ctx.lineTo(-9.5, 34 + Math.sin(performance.now()/290 - i*1.9)*3.5);
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = "#42001a";
      ctx.shadowColor = "#a70026aa";
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(5, 23);
      ctx.lineTo(9.5, 34 + Math.cos(performance.now()/251 + i*1.7)*3.5);
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = "#42001a";
      ctx.shadowColor = "#f52a00aa";
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Outline for clarity
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(10, 19);
      ctx.lineTo(0, 24);
      ctx.lineTo(-10, 19);
      ctx.closePath();
      ctx.strokeStyle = "#500042";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Name/label
      ctx.font = "bold 12px Poppins, Arial";
      ctx.fillStyle = "#680027";
      ctx.textAlign = "center";
      ctx.fillText(`Bot${i + 1}`, 0, -25);

      ctx.restore();

      // --- PLACEHOLDER NOTE: To integrate custom/external art assets (spritesheets, png, or SVG),
      // replace the above drawing routines with ctx.drawImage(sprite, ...) or advanced Sprite objects.
      // For production visual polish, import art to /src/assets and swap in here.
      // Keep silhouettes/clarity strong at all group sizes.
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
    playSound("click");
    if (timer <= 0 || gamestate === "over") setTimer(SESSION_TIME);
  };

  // PUBLIC_INTERFACE
  const handlePause = () => {
    if (gamestate !== "running") return;
    setGamestate("paused");
    setRunning(false);
    playSound("click");
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
                      playSound("advance");
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
                      playSound("click");
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
                    playSound("click");
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
                onClick={() => { handleStart(); playSound("click"); }}
                disabled={gamestate === "running"}
                aria-label="Start Game"
              >
                {btnLbl}
              </button>
              <button
                className="game-btn"
                tabIndex={0}
                onClick={() => { handlePause(); playSound("click"); }}
                disabled={gamestate !== "running"}
                aria-label="Pause"
              >
                Pause
              </button>
              <button
                className="game-btn"
                tabIndex={0}
                onClick={() => { handleRestart(false, { restartAtCurrentLevel: true }); playSound("click"); }}
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
