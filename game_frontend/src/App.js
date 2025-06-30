import React, { useRef, useEffect, useState, useCallback } from "react";
import "./App.css";

/**
 * FlagQuest App: Minimal core 2D capture-the-flag game.
 * - Main state: player, bots, flag, scores, timer, gamestate.
 * - Canvas rendering with keyboard controls and basic bot AI.
 * - UI: Scoreboard (top), game area (center), controls (bottom).
 */

/*
 * Constants for game parameters and visuals
 * - Custom constants for scalable bot speed and new visuals
 */

const CANVAS_W = 640;   // Increased canvas width for a more immersive play area
const CANVAS_H = 440;   // Increased canvas height for a more immersive play area
const PLAYER_SIZE = 26;
const BOT_SIZE = 26;
const FLAG_SIZE = 18;
const PLAYER_SPEED = 3.1; // px per tick

// --- Bot speed scaling constants ---
const BOT_BASE_SPEED = 1.28; // Start bots much slower than before
const BOT_SPEED_PER_LEVEL = 0.42; // Speed boost per level (scales up, capped)
const BOT_SPEED_CAP = 4.5; // Max bot speed

const FLAG_ZONE_RADIUS = 32;
const DROPOFF_BOX_SIZE = 30;

// Level progression settings
const BOT_INCREASE_RATE = 1;           // +1 bot per level
const OBSTACLE_INCREASE_RATE = 1;      // +1 obstacle per level
const BASE_NUM_BOTS = 2;
const OBSTACLE_SIZE = 28;

// Utility: clamp position to inside field
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Helper for random position, used for flag/bots/drop-off placement
function randomPos(w, h, margin = 18) {
  return {
    x: Math.random() * (w - 2 * margin) + margin,
    y: Math.random() * (h - 2 * margin) + margin,
  };
}

// Returns a random drop-off box position, away from the player's start zone and flag spawn region
function randomDropoffBox(w, h, margin = 40) {
  let pos;
  do {
    pos = randomPos(w, h, margin);
  } while (
    pos.x < CANVAS_W / 3 // Don't allow drop-off too close to player starting side
  );
  return pos;
}

/**
 * OBSTACLE: Returns an array of randomly placed obstacles (rectangles)
 * Each object has {x, y} for center; obstacles do not overlap the player start, flag, drop-off, or each other.
 */
function randomObstacles(numObstacles = 0) {
  if (numObstacles === 0) return [];
  let obs = [];
  for (let i = 0; i < numObstacles; i++) {
    let pos;
    let tries = 0;
    do {
      pos = randomPos(CANVAS_W, CANVAS_H, 38);
      tries++;
    } while (
      // Avoid center start and prior obstacles (roughly)
      (pos.x < 80 && Math.abs(pos.y - CANVAS_H/2) < 60) ||
      obs.some(o => Math.abs(o.x - pos.x) < OBSTACLE_SIZE && Math.abs(o.y - pos.y) < OBSTACLE_SIZE) ||
      tries > 20
    );
    obs.push(pos);
  }
  return obs;
}

// PUBLIC_INTERFACE
function App() {
  // Game state
  const [level, setLevel] = useState(1); // Level/progression
  const [numBots, setNumBots] = useState(BASE_NUM_BOTS);
  const [obstacles, setObstacles] = useState(() => randomObstacles((level-1)*OBSTACLE_INCREASE_RATE));
  const [player, setPlayer] = useState({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });
  // Assign unique IDs to each bot to reliably track "heldBy"
  const [bots, setBots] = useState(() =>
    Array.from({ length: BASE_NUM_BOTS }, (_, idx) => ({
      id: idx + 1,
      x: CANVAS_W - 50 - idx * 30,
      y: 2 * CANVAS_H / 3 - idx * 30,
      dx: 0,
      dy: 0,
      score: 0,
    }))
  );
  const [flag, setFlag] = useState(() =>
    ({ ...randomPos(CANVAS_W, CANVAS_H), heldBy: null, home: true })
  );
  // Drop-off box appears after player picks up flag
  const [dropoffBox, setDropoffBox] = useState(null);

  const [timer, setTimer] = useState(120); // seconds
  const [running, setRunning] = useState(false);
  const [gamestate, setGamestate] = useState("ready"); // "ready", "running", "paused", "over", "levelcomplete"
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState(""); // End-of-game/score message

  // Level completed screen state
  const [levelCompleted, setLevelCompleted] = useState(false);

  const canvasRef = useRef(null);
  // Controls: which keys currently pressed (WASD/Arrows)
  const keyState = useRef({});

  // Timer loop for game time
  useEffect(() => {
    if (!running) return;
    if (timer <= 0) {
      setGamestate("over");
      setRunning(false);
      return;
    }
    const t = setInterval(() => {
      setTimer((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [running, timer]);

  // Keyboard controls: WASD, Arrow keys, and 'r' for restart/autostart
  useEffect(() => {
    function handleDown(e) {
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = true;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = true;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = true;

      // Handle 'r' to restart and immediately start game
      if (e.key === "r" || e.key === "R") {
        handleRestart(true); // pass true to trigger autostart
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
    // NB: intentionally left [] for proper hotkey listening.
    // eslint-disable-next-line
  }, []);

    // Main game loop (more optimal: only re-subscribe on essential state changes)
  useEffect(() => {
    let anim;
    let lastTime = performance.now();

    // Using refs to hold latest state to avoid heavy dependency lists and stutter
    const stateRef = {
      player: { ...player },
      bots: [...bots],
      flag: { ...flag },
      dropoffBox,
      gamestate,
      level,
      obstacles: [...obstacles],
      winner,
    };

    function checkCollisionWithObstacles(x, y, margin = 4) {
      return stateRef.obstacles.some(
        (o) =>
          Math.abs(o.x - x) < OBSTACLE_SIZE / 2 + PLAYER_SIZE / 2 + margin &&
          Math.abs(o.y - y) < OBSTACLE_SIZE / 2 + PLAYER_SIZE / 2 + margin
      );
    }

    function dist(x1, y1, x2, y2) {
      return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    }

    function gameTick(now) {
      if (stateRef.gamestate !== "running") return;
      let delta = Math.min(now - lastTime, 40); // Clamp to avoid spiral of death
      lastTime = now;

      // PLAYER: apply controls
      let [px, py] = [stateRef.player.x, stateRef.player.y];
      let pvx = 0,
        pvy = 0;
      if (keyState.current.up) pvy -= PLAYER_SPEED;
      if (keyState.current.down) pvy += PLAYER_SPEED;
      if (keyState.current.left) pvx -= PLAYER_SPEED;
      if (keyState.current.right) pvx += PLAYER_SPEED;
      if (pvx !== 0 || pvy !== 0) {
        const m = Math.sqrt(pvx * pvx + pvy * pvy);
        pvx = (pvx / m) * PLAYER_SPEED;
        pvy = (pvy / m) * PLAYER_SPEED;
      }
      let newPx = clamp(px + pvx, PLAYER_SIZE / 2, CANVAS_W - PLAYER_SIZE / 2);
      let newPy = clamp(py + pvy, PLAYER_SIZE / 2, CANVAS_H - PLAYER_SIZE / 2);
      if (!checkCollisionWithObstacles(newPx, newPy)) {
        px = newPx;
        py = newPy;
      }

      // --- Calculate bot speed for this level ---
      const currentBotSpeed = Math.min(
        BOT_BASE_SPEED + BOT_SPEED_PER_LEVEL * (stateRef.level - 1),
        BOT_SPEED_CAP
      );

      // --- Bots: Move toward the PLAYER (attack/chase only) ---
      let newBotsArr = stateRef.bots.map((bot) => {
        let target = { x: px, y: py };
        let dx = target.x - bot.x;
        let dy = target.y - bot.y;
        let distToTgt = Math.sqrt(dx * dx + dy * dy);
        let bvx = 0,
          bvy = 0;
        if (distToTgt > 3) {
          bvx = (dx / distToTgt) * currentBotSpeed;
          bvy = (dy / distToTgt) * currentBotSpeed;
          let maybeBx = clamp(bot.x + bvx, BOT_SIZE / 2, CANVAS_W - BOT_SIZE / 2);
          let maybeBy = clamp(bot.y + bvy, BOT_SIZE / 2, CANVAS_H - BOT_SIZE / 2);
          if (!checkCollisionWithObstacles(maybeBx, maybeBy, 0)) {
            return { ...bot, x: maybeBx, y: maybeBy };
          } else if (!checkCollisionWithObstacles(bot.x + bvx, bot.y, 0)) {
            return {
              ...bot,
              x: clamp(bot.x + bvx, BOT_SIZE / 2, CANVAS_W - BOT_SIZE / 2),
            };
          } else if (!checkCollisionWithObstacles(bot.x, bot.y + bvy, 0)) {
            return {
              ...bot,
              y: clamp(bot.y + bvy, BOT_SIZE / 2, CANVAS_H - BOT_SIZE / 2),
            };
          }
        }
        return bot;
      });

      // --- FLAG PICKUP LOGIC ---
      let newFlag = { ...stateRef.flag };
      let showDropoffNow = stateRef.dropoffBox;

      if (
        !stateRef.flag.heldBy &&
        dist(px, py, stateRef.flag.x, stateRef.flag.y) <
          (PLAYER_SIZE + FLAG_SIZE) / 2 + 2
      ) {
        newFlag.heldBy = "player";
        newFlag.home = false;
        setDropoffBox(randomDropoffBox(CANVAS_W, CANVAS_H));
        showDropoffNow = true;
      }

      // Collision detection
      let gameOverByAICatch = false;
      newBotsArr.forEach((bot) => {
        if (dist(px, py, bot.x, bot.y) < (PLAYER_SIZE + BOT_SIZE) / 2 - 2) {
          gameOverByAICatch = true;
        }
      });

      // Player win condition
      let playerScored = false;
      if (
        newFlag.heldBy === "player" &&
        stateRef.dropoffBox &&
        dist(px, py, stateRef.dropoffBox.x, stateRef.dropoffBox.y) <
          (PLAYER_SIZE + DROPOFF_BOX_SIZE) / 2 + 4
      ) {
        playerScored = true;
      }

      // Update player
      let newPlayer = { ...stateRef.player, x: px, y: py };
      let updatedBots = newBotsArr;
      let newPlayerScore = stateRef.player.score;
      let newBotScores = stateRef.bots.map((b) => b.score);

      if (playerScored) {
        newPlayerScore += 1;
        setDropoffBox(null);
      } else {
        if (newFlag.heldBy === "player") {
          newFlag.x = px;
          newFlag.y = py;
        }
      }

      let gameOver = false;
      let newWinner = null;
      let endMsg = "";
      if (gameOverByAICatch) {
        gameOver = true;
        newWinner = "bot";
        endMsg = "You were caught by a bot!";
      }
      // Level completion triggers
      if (playerScored) {
        setLevelCompleted(true);
        setGamestate("levelcomplete");
        setRunning(false);
        setMessage("Flag delivered! +1 point.");
        setWinner("player");
        return;
      }
      if (Math.max(...newBotScores) >= 3) {
        gameOver = true;
        newWinner = "bot";
        endMsg = "Bots win! Try again!";
      }
      if (gameOver) {
        setGamestate("over");
        setRunning(false);
        setWinner(newWinner);
        setMessage(endMsg);
        setDropoffBox(null);
      } else {
        setMessage("");
      }

      setPlayer((p) => ({ ...newPlayer, score: newPlayerScore }));
      setBots((prev) =>
        prev.map((b, i) => ({ ...updatedBots[i], score: newBotScores[i] }))
      );
      setFlag(newFlag);

      if (!gameOver) anim = requestAnimationFrame(gameTick);
    }

    if (gamestate === "running") {
      anim = requestAnimationFrame(gameTick);
    }
    return () => {
      if (anim) cancelAnimationFrame(anim);
    };
    // eslint-disable-next-line
  }, [gamestate]);

  // Draw canvas game area
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Clear
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background field
    ctx.fillStyle = "#e3eaf7";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Left zone (player's base)
    ctx.beginPath();
    ctx.arc(0, CANVAS_H / 2, FLAG_ZONE_RADIUS, Math.PI / 2, Math.PI * 1.5, false);
    ctx.fillStyle = "#e7f8ef";
    ctx.fill();

    // Right zone (bot base)
    ctx.beginPath();
    ctx.arc(CANVAS_W, CANVAS_H / 2, FLAG_ZONE_RADIUS, Math.PI * 1.5, Math.PI / 2, false);
    ctx.fillStyle = "#f9e7e7";
    ctx.fill();

    // --- Draw Obstacles ---
    obstacles.forEach((o) => {
      ctx.save();
      ctx.globalAlpha = 0.86;
      ctx.beginPath();
      ctx.rect(
        o.x - OBSTACLE_SIZE / 2,
        o.y - OBSTACLE_SIZE / 2,
        OBSTACLE_SIZE,
        OBSTACLE_SIZE
      );
      ctx.fillStyle = "#b38816";
      ctx.shadowColor = "#91710355";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = "#85641d";
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    });

    // Drop-off box (draw only if active)
    if (dropoffBox) {
      ctx.save();
      ctx.globalAlpha = 0.91;
      ctx.beginPath();
      ctx.rect(
        dropoffBox.x - DROPOFF_BOX_SIZE / 2,
        dropoffBox.y - DROPOFF_BOX_SIZE / 2,
        DROPOFF_BOX_SIZE,
        DROPOFF_BOX_SIZE
      );
      ctx.fillStyle = "#43a047";
      ctx.strokeStyle = "#197c2c";
      ctx.shadowColor = "#43a04766";
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = "bold 14px Arial";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("Drop-Off", dropoffBox.x, dropoffBox.y - DROPOFF_BOX_SIZE / 2 - 5);
      ctx.restore();
    }

    // Flag
    if (flag.home) {
      ctx.strokeStyle = "#bbb";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(flag.x, flag.y, 23, 0, 2 * Math.PI, false);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Draw flag
    ctx.save();
    ctx.translate(flag.x, flag.y);
    ctx.rotate(-Math.PI / 14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(FLAG_SIZE, -FLAG_SIZE / 2.2);
    ctx.lineTo(FLAG_SIZE, FLAG_SIZE / 2.2);
    ctx.closePath();
    ctx.fillStyle =
      flag.heldBy === "player"
        ? "#2196f3"
        : flag.heldBy && typeof flag.heldBy === "object"
        ? "#f25266"
        : "#ff9800";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, FLAG_SIZE + 7);
    ctx.stroke();
    ctx.restore();

    // --- Player: Draw as pentagon with blue gradient, "hero badge" look ---
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(-Math.PI/7); // for visual polish
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
      const x = (PLAYER_SIZE/2) * Math.cos(angle);
      const y = (PLAYER_SIZE/2) * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -PLAYER_SIZE/2, 0, PLAYER_SIZE/2);
    grad.addColorStop(0, "#64baff");
    grad.addColorStop(1, "#2196f3");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#51d5ff44";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.7;
    ctx.strokeStyle = "#135488";
    ctx.stroke();

    // Draw player's "eyes"
    ctx.beginPath();
    ctx.arc(0 - 7, -4, 2.4, 0, 2*Math.PI);
    ctx.arc(0 + 7, -4, 2.4, 0, 2*Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0 - 7, -4, 1, 0, 2*Math.PI); // dot pupils
    ctx.arc(0 + 7, -4, 1, 0, 2*Math.PI);
    ctx.fillStyle = "#135488";
    ctx.fill();

    // Player name
    ctx.font = "bold 15px Arial";
    ctx.fillStyle = "#115";
    ctx.textAlign = "center";
    ctx.fillText("You", 0, -PLAYER_SIZE / 1.1);
    ctx.restore();

    // --- Bots: Draw as 'diamond robot heads' with a red-accent look and robot eyes ---
    bots.forEach((bot, i) => {
      ctx.save();
      ctx.translate(bot.x, bot.y);
      ctx.rotate(Math.PI/5); // visual variety

      // Diamond body
      ctx.beginPath();
      ctx.moveTo(0, -BOT_SIZE/2); // top
      ctx.lineTo(BOT_SIZE/2, 0);  // right
      ctx.lineTo(0, BOT_SIZE/2);  // bottom
      ctx.lineTo(-BOT_SIZE/2, 0); // left
      ctx.closePath();
      const botGrad = ctx.createLinearGradient(0, -BOT_SIZE/2, 0, BOT_SIZE/2);
      botGrad.addColorStop(0, "#fde1e1");
      botGrad.addColorStop(1, "#f25266");
      ctx.fillStyle = botGrad;
      ctx.shadowColor = "#e94d77cc";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#ab1549";
      ctx.stroke();

      // Robot "eye strip"
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 1.8, 7, 2, 0, 0, 2*Math.PI);
      ctx.fillStyle = "#222";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 1.8, 4.3, 1.06, 0, 0, 2*Math.PI);
      ctx.fillStyle = "#ffecfc";
      ctx.globalAlpha = 0.51;
      ctx.fill();
      ctx.restore();

      // Antenna
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -BOT_SIZE/2);
      ctx.lineTo(0, -BOT_SIZE/2 - 6);
      ctx.strokeStyle = "#ab1549";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -BOT_SIZE/2 - 7.5, 2.2, 0, 2*Math.PI);
      ctx.fillStyle = "#ffb021";
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.restore();

      // Bot label
      ctx.font = "bold 13px Arial";
      ctx.fillStyle = "#711";
      ctx.textAlign = "center";
      ctx.fillText(`Bot${i + 1}`, 0, -BOT_SIZE / 1.15);
      ctx.restore();
    });

    // Draw label: who is holding the flag?
    if (flag.heldBy === "player") {
      ctx.font = "900 15px Segoe UI, Arial";
      ctx.fillStyle = "#2196f3";
      ctx.fillText("🏳️", player.x, player.y + 5);
    }
    // Bots can no longer hold the flag, so don't display flag on bots.

    // UI overlays: if over, draw winner
    if (
      gamestate === "over" || winner
    ) {
      ctx.save();
      ctx.globalAlpha = 0.79;
      ctx.fillStyle = "#fff";
      ctx.fillRect(
        CANVAS_W / 2 - 120,
        CANVAS_H / 2 - 50,
        240,
        100
      );
      ctx.globalAlpha = 1;
      ctx.font = "bold 24px Segoe UI";
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.fillText(
        winner === "player" ? "You Win! 🎉" : winner === "bot" ? "Bots Win! 🤖" : "Game Over",
        CANVAS_W / 2,
        CANVAS_H / 2 + 6
      );
      ctx.font = "15px Arial";
      ctx.fillStyle = "#444";
      ctx.fillText("Press Restart to play again!", CANVAS_W / 2, CANVAS_H / 2 + 32);
      ctx.restore();
    } else if (levelCompleted) {
      // Draw "Level Completed" overlay with Continue button
      ctx.save();
      ctx.globalAlpha = 0.87;
      ctx.fillStyle = "#fff";
      ctx.fillRect(CANVAS_W/2-130, CANVAS_H/2-70, 260, 130);
      ctx.globalAlpha = 1;
      ctx.font = "bold 26px Segoe UI";
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.fillText(`Level ${level} Complete!`, CANVAS_W/2, CANVAS_H/2 - 6);
      ctx.font = "18px Arial";
      ctx.fillStyle = "#43a047";
      ctx.fillText("Congratulations! Continue to next level.", CANVAS_W/2, CANVAS_H/2 + 27);
      ctx.restore();
    }
    // eslint-disable-next-line
  }, [player, bots, flag, gamestate, winner, dropoffBox, obstacles, levelCompleted]);

  // Button actions
  const handleStart = () => {
    setGamestate("running");
    setRunning(true);
    setWinner(null);
    setMessage("");
    if (timer <= 0 || gamestate === "over") setTimer(120);
  };

  const handlePause = () => {
    if (gamestate !== "running") return;
    setGamestate("paused");
    setRunning(false);
  };

  // Pass autoStart=true for hotkey restart-and-autostart
  const handleRestart = useCallback((autoStart = false) => {
    // Always reset obstacles for first level, and bots
    setObstacles(randomObstacles(0));
    setNumBots(BASE_NUM_BOTS);
    setPlayer({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });
    setBots(
      Array.from({ length: BASE_NUM_BOTS }, (_, idx) => ({
        id: idx + 1,
        x: CANVAS_W - 50 - idx * 30,
        y: 2 * CANVAS_H / 3 - idx * 30,
        dx: 0,
        dy: 0,
        score: 0,
      }))
    );
    setFlag({ ...randomPos(CANVAS_W, CANVAS_H), heldBy: null, home: true });
    setDropoffBox(null);
    setTimer(120);
    setWinner(null);
    setMessage("");
    setLevelCompleted(false);
    setLevel(1);
    keyState.current = {};
    if (autoStart) {
      setGamestate("running");
      setRunning(true);
    } else {
      setGamestate("ready");
      setRunning(false);
    }
  }, []);

  // Handle continue to next level after level-completed UI
  const handleContinueLevel = useCallback(() => {
    // Infinite progression: No max level cap
    const nextLevel = level + 1;
    const newNumBots = BASE_NUM_BOTS + (nextLevel-1) * BOT_INCREASE_RATE;
    const newObstacles = randomObstacles((nextLevel-1) * OBSTACLE_INCREASE_RATE);

    setLevel(nextLevel);
    setNumBots(newNumBots);
    setObstacles(newObstacles);

    setPlayer({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });
    setBots(
      Array.from({ length: newNumBots }, (_, idx) => ({
        id: idx + 1,
        x: CANVAS_W - 50 - idx * 30,
        y: 2 * CANVAS_H / 3 - idx * 30,
        dx: 0,
        dy: 0,
        score: 0,
      }))
    );
    setFlag({ ...randomPos(CANVAS_W, CANVAS_H), heldBy: null, home: true });
    setDropoffBox(null);
    setTimer(120);
    setWinner(null);
    setMessage("");
    setLevelCompleted(false);
    setGamestate("running");
    setRunning(true);
    keyState.current = {};
  }, [level]);

  // Format timer mm:ss
  const pad = (n) => String(n).padStart(2, "0");
  const timerStr = `${pad(Math.floor(timer / 60))}:${pad(timer % 60)}`;

  // Who has flag
  let flagStatus = "Safe";
  if (flag.heldBy === "player") flagStatus = "You";
  // Bots can no longer hold the flag, so no "Opponent" state.

  // Display drop-off box status in UI
  let dropoffStatus = "";
  if (flag.heldBy === "player" && dropoffBox) {
    dropoffStatus = "Bring the flag to the drop-off box!";
  } else if (message) {
    dropoffStatus = message;
  }

  // First bot with highest score for display
  const oppScore = Math.max(...bots.map((b) => b.score));
  return (
    <div className="App">
      <header>
        <h1
          style={{
            margin: 0,
            padding: "1.5rem 0",
            fontSize: "2.2rem",
            letterSpacing: "0.018em",
            color: "var(--primary)",
            background: "var(--bg-secondary)",
          }}
        >
          FlagQuest
        </h1>
      </header>
      {/* --- AAA Scoreboard --- */}
      <section>
        <div>
          Score:{" "}
          <span style={{ color: "var(--primary)", textShadow: "0 2px 8px #64baff88" }}>
            {player.score}
          </span>
        </div>
        <div>
          Opponent:{" "}
          <span style={{ color: "var(--secondary)", textShadow: "0 2px 9px #36ff8967" }}>
            {oppScore}
          </span>
        </div>
        <div>
          Timer:{" "}
          <span style={{
            color: "#ffd57e",
            background: "var(--timer-bg)",
            boxShadow: "0 1.5px 10px 2px #ffb02127",
            borderRadius: "7.5px",
            padding: "4.5px 18px",
            fontFamily: "'Orbitron', 'Exo', monospace",
            letterSpacing: "0.08em",
            fontWeight: 800,
            fontSize: "1.09em",
            border: "1.3px solid var(--panel-outline)"
          }}>
            {timerStr}
          </span>
        </div>
        <div>
          Flag:{" "}
          <span style={{ color: "#ffd37d", filter: "drop-shadow(0 0 4px #ffb02193)" }}>
            {flagStatus}
          </span>
        </div>
      </section>
      {dropoffStatus && (
        <div className="game-message">
          {dropoffStatus}
        </div>
      )}

      <main>
        {/* ---- Central Game Area (canvas with AAA panel) ---- */}
        <div
          className="game-canvas-panel"
          tabIndex={0}
          aria-label="Game Area"
          onFocus={() => {
            // Allow for keyboard hotkeys if needed
          }}
          style={{
            width: Math.max(440, CANVAS_W + 40),
            height: Math.max(320, CANVAS_H + 48),
            maxWidth: "99vw",
            maxHeight: "99vh"
          }}
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
              width: `${CANVAS_W}px`,
              height: `${CANVAS_H}px`,
              display: "block",
              borderRadius: "15px",
              boxShadow: "0 0 0 2px var(--accent), 0 2.5px 38px #2b314259",
              zIndex: 6,
              marginTop: "20px"
            }}
            aria-label="Game Canvas"
          />

          {/* Overlay Victory/Defeat or Level Complete */}
          {(gamestate === "over" || winner) && (
            <div className={`game-overlay-panel ${winner === "player" ? "victory" : "defeat"}`} tabIndex={0}>
              <h2>
                {winner === "player" ? "You Win! 🎉" : winner === "bot" ? "Bots Win! 🤖" : "Game Over"}
              </h2>
              <div className="desc">
                {message || (winner === "player"
                  ? "Legendary moves! Next time, try with more bots!"
                  : winner === "bot" ? "Bots outsmarted you this round!" : "Try again!")}
              </div>
              <button className="game-btn continue-btn"
                onClick={() => handleRestart(false)}
                tabIndex={0}
                aria-label="Restart Game"
              >Restart</button>
            </div>
          )}
          {/* Level Complete Overlay */}
          {levelCompleted && (
            <div className="game-overlay-panel victory" tabIndex={0} style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"}}>
              <h2 style={{marginBottom: "11px"}}>Level {level} Complete!</h2>
              <div className="desc" style={{marginBottom: "24px"}}>
                Congratulations! Continue to next level.
              </div>
              <button
                className="game-btn continue-btn"
                onClick={handleContinueLevel}
                tabIndex={0}
                aria-label="Continue to Next Level"
              >Continue</button>
            </div>
          )}
        </div>
        {/* ---- Control Buttons ---- */}
        <div style={{
          display: "flex",
          gap: "2.1rem",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: ".7rem"
        }}>
          <button
            className="game-btn"
            tabIndex={0}
            onClick={handleStart}
            disabled={gamestate === "running" || levelCompleted}
            aria-label="Start Game"
          >
            {gamestate === "ready" || gamestate === "paused" ? "Start" : "Resume"}
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
            onClick={() => handleRestart(false)}
            aria-label="Restart Game"
          >
            Restart
          </button>
        </div>
        {/* Controls and Level info below */}
        <div className="controls-panel">
          Controls:&nbsp;
          <kbd>WASD</kbd> or <kbd>Arrow Keys</kbd> to move.<br />
          Grab the flag, then find the drop-off box to score!<br />
          Opposing bots will compete for the flag.<br />
          Earn 3 points to clear the level. Levels get harder!
        </div>
        <div className="level-panel">
          Level: {level} &nbsp;|&nbsp; Bots: {numBots} &nbsp;|&nbsp; Obstacles: {obstacles.length}
        </div>
      </main>
    </div>
  );
}

export default App;
