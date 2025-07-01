import React, { useRef, useEffect, useState } from "react";
import "./App.css";

/**
 * PUBLIC_INTERFACE
 * FlagQuest: Full feature 2D capture-the-flag game, minimal UI.
 * - Player (WASD/arrows), multiple bots (unique paths), flag, drop zone, obstacles (level/difficulty).
 * - Minimalistic scoreboard, timer (90s), game/level state, buttons (Start, Pause, Restart).
 * - Colors: primary (#2196f3), secondary (#43a047), accent (#ff9800).
 * - Responsive for small screens.
 */

// ---- Constants, color theme ----
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

// Accent colors
const CLR_PRI = "#2196f3", CLR_SEC = "#43a047", CLR_ACC = "#ff9800";
const CLR_BOT = "#f25266";
const CLR_BOT_DARK = "#ab1549";

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
      // Add: allow R to restart at current level, overlays are dismissed
      if (e.key === "r" || e.key === "R") { 
        handleRestart(true, { restartAtCurrentLevel: true });
      }
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

    // Actual flag (triangle/mini flag)
    ctx.save();
    ctx.translate(flag.x, flag.y);
    ctx.rotate(-Math.PI/14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(FLAG_SIZE, -FLAG_SIZE / 2.2);
    ctx.lineTo(FLAG_SIZE, FLAG_SIZE / 2.2);
    ctx.closePath();
    ctx.fillStyle = flag.heldBy === "player" ? CLR_PRI : CLR_ACC;
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, FLAG_SIZE + 7);
    ctx.stroke();
    ctx.restore();

    // Player (circle)
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_SIZE / 2, 0, 2 * Math.PI, false);
    ctx.fillStyle = CLR_PRI;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#135488";
    ctx.stroke();
    // Name
    ctx.font = "bold 15px Arial";
    ctx.fillStyle = "#1976d2";
    ctx.textAlign = "center";
    ctx.fillText("You", player.x, player.y - PLAYER_SIZE / 1.1);

    // Flag carried icon
    if (flag.heldBy === "player") {
      ctx.font = "900 16px Segoe UI, Arial";
      ctx.fillStyle = CLR_ACC;
      ctx.fillText("🏳️", player.x, player.y + 5);
    }

    // Bots
    bots.forEach((bot, i) => {
      ctx.beginPath();
      ctx.arc(bot.x, bot.y, BOT_SIZE / 2, 0, 2 * Math.PI, false);
      ctx.fillStyle = CLR_BOT;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = CLR_BOT_DARK;
      ctx.stroke();

      ctx.font = "bold 13px Arial";
      ctx.fillStyle = "#711";
      ctx.textAlign = "center";
      ctx.fillText(`Bot${i + 1}`, bot.x, bot.y - BOT_SIZE / 1.18);
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
            <div style={{ fontWeight: 500, color: "#444", fontSize: 16, marginTop: 8 }}>
              {showLevelCompleted
                ? "Press 'R' to retry or advance."
                : "Press 'R' to try this level again."}
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
            onClick={() => handleRestart(false, { restartAtCurrentLevel: true })}
            aria-label="Restart Game"
          >
            Restart
          </button>
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
