import React, { useRef, useEffect, useState, useCallback } from "react";
import "./App.css";

/**
 * FlagQuest App: Minimal core 2D capture-the-flag game.
 * - Main state: player, bots, flag, scores, timer, gamestate.
 * - Canvas rendering with keyboard controls and basic bot AI.
 * - UI: Scoreboard (top), game area (center), controls (bottom).
 */

// Constants for game
const CANVAS_W = 420;
const CANVAS_H = 300;
const PLAYER_SIZE = 26;
const BOT_SIZE = 26;
const FLAG_SIZE = 18;
const PLAYER_SPEED = 3.1; // px per tick
const BOT_SPEED = 2.15;
const FLAG_ZONE_RADIUS = 32;
const NUM_BOTS = 2;
const DROPOFF_BOX_SIZE = 30;

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

// PUBLIC_INTERFACE
function App() {
  // Game state
  const [player, setPlayer] = useState({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });
  // Assign unique IDs to each bot to reliably track "heldBy"
  const [bots, setBots] = useState(() =>
    Array.from({ length: NUM_BOTS }, (_, idx) => ({
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
  const [gamestate, setGamestate] = useState("ready"); // "ready", "running", "paused", "over"
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState(""); // End-of-game/score message

  // Level/progression state: structure for future expansion
  const [level, setLevel] = useState(1);
  /*
    // Future: When implementing level progression, you'll use this state.
    // Levels can control: number of bots, obstacles, timings, etc.
    // Example: setLevel(level+1); and handle advanced layouts.
  */

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

    // Main game loop (fixed timestep; updating state and drawing)
  useEffect(() => {
    let anim;
    let prevTimestamp = performance.now();

    function gameTick(timestamp) {
      if (gamestate !== "running") return;
      let delta = timestamp - prevTimestamp;
      prevTimestamp = timestamp;

      // PLAYER: apply controls
      let [px, py] = [player.x, player.y];
      let pvx = 0, pvy = 0;
      if (keyState.current.up) pvy -= PLAYER_SPEED;
      if (keyState.current.down) pvy += PLAYER_SPEED;
      if (keyState.current.left) pvx -= PLAYER_SPEED;
      if (keyState.current.right) pvx += PLAYER_SPEED;
      // Normalize so diagonals are not faster
      if (pvx !== 0 || pvy !== 0) {
        const m = Math.sqrt(pvx * pvx + pvy * pvy);
        pvx = (pvx / m) * PLAYER_SPEED;
        pvy = (pvy / m) * PLAYER_SPEED;
      }
      px = clamp(px + pvx, PLAYER_SIZE / 2, CANVAS_W - PLAYER_SIZE / 2);
      py = clamp(py + pvy, PLAYER_SIZE / 2, CANVAS_H - PLAYER_SIZE / 2);

      // Bots: move towards flag (if not holding), else toward home
      let newBots = bots.map((bot, i) => {
        let target =
          flag.heldBy === `bot:${bot.id}`
            ? { x: CANVAS_W - 36, y: CANVAS_H / 2 }
            : flag.heldBy === null
              ? flag
              : player;
        let dx = target.x - bot.x;
        let dy = target.y - bot.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let bvx = 0, bvy = 0;
        if (dist > 3) {
          bvx = (dx / dist) * BOT_SPEED;
          bvy = (dy / dist) * BOT_SPEED;
        }
        let bx = clamp(bot.x + bvx, BOT_SIZE / 2, CANVAS_W - BOT_SIZE / 2);
        let by = clamp(bot.y + bvy, BOT_SIZE / 2, CANVAS_H - BOT_SIZE / 2);
        return { ...bot, x: bx, y: by };
      });

      // Utility: Euclidean distance
      function dist(x1, y1, x2, y2) {
        return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
      }

      // Check flag pickup/drop for player (bots cannot pickup)
      let newFlag = { ...flag };
      let showDropoffNow = dropoffBox;

      // -- Player picks up flag --
      if (
        !flag.heldBy &&
        dist(px, py, flag.x, flag.y) < (PLAYER_SIZE + FLAG_SIZE) / 2 + 2
      ) {
        newFlag.heldBy = "player";
        newFlag.home = false;
        // Generate a drop-off box at random position (not too close to player start)
        setDropoffBox(randomDropoffBox(CANVAS_W, CANVAS_H));
        showDropoffNow = true;
      }

      // Collision detection: check if any AI bot catches player
      let gameOverByAICatch = false;
      newBots.forEach((bot, i) => {
        // Collision threshold: if distance < sum of radii - fudge (~1)
        if (dist(px, py, bot.x, bot.y) < (PLAYER_SIZE + BOT_SIZE) / 2 - 2) {
          gameOverByAICatch = true;
        }
      });

      // --- Detect drop-off for score/level end ---
      // Only enabled if player is carrying flag and dropoffBox is set
      let playerScored = false;
      if (
        newFlag.heldBy === "player" &&
        dropoffBox &&
        dist(px, py, dropoffBox.x, dropoffBox.y) < (PLAYER_SIZE + DROPOFF_BOX_SIZE) / 2 + 4
      ) {
        playerScored = true;
      }

      // Reset flag on score, increment player score, remove drop-off box
      let newPlayer = { ...player, x: px, y: py };
      let updatedBots = newBots;
      let newPlayerScore = player.score;
      let newBotScores = bots.map((b) => b.score);
      let postScoreMessage = "";

      if (playerScored) {
        newPlayerScore += 1;
        postScoreMessage = "Flag delivered! +1 point.";
        // Remove flag/dropoff, reset flag/bot/player position.
        newFlag = { ...randomPos(CANVAS_W, CANVAS_H), heldBy: null, home: true };
        updatedBots = bots.map((b, i) => ({
          ...b,
          x: CANVAS_W - 50 - i * 30,
          y: 2 * CANVAS_H / 3 - i * 30,
        }));
        newPlayer = { ...newPlayer, x: 60, y: CANVAS_H / 2 };
        setDropoffBox(null);
      } else {
        // Carry flag if held
        if (newFlag.heldBy === "player") {
          newFlag.x = px;
          newFlag.y = py;
        }
      }

      // End/game over/AI catch condition: first to 3 points or bot catches player
      let gameOver = false;
      let newWinner = null;
      let endMsg = "";
      if (gameOverByAICatch) {
        gameOver = true;
        newWinner = "bot";
        endMsg = "You were caught by a bot!";
      }
      if (newPlayerScore >= 3) {
        gameOver = true;
        newWinner = "player";
        endMsg = "You win! Great job!";
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
      } else if (playerScored && !gameOver) {
        setMessage(postScoreMessage);
        // For "level progression", you'll increment setLevel(level+1) and reset state here in the future.
        // Example:
        // setLevel(level + 1);
        // add obstacles, increase bots, etc. for next level
      } else {
        setMessage("");
      }

      // Update all state
      setPlayer((p) => ({ ...newPlayer, score: newPlayerScore }));
      setBots((prev) =>
        prev.map((b, i) => ({ ...updatedBots[i], score: newBotScores[i] }))
      );
      setFlag(newFlag);

      // Continue loop
      if (!gameOver) anim = requestAnimationFrame(gameTick);
    }

    if (gamestate === "running") {
      anim = requestAnimationFrame(gameTick);
    }
    return () => {
      if (anim) cancelAnimationFrame(anim);
    };
    // eslint-disable-next-line
  }, [gamestate, running, player, bots, flag, dropoffBox, level]);

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
      // Draw label
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

    // Player
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_SIZE / 2, 0, 2 * Math.PI, false);
    ctx.fillStyle = "#2196f3";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#135488";
    ctx.stroke();

    // Player name
    ctx.font = "bold 15px Arial";
    ctx.fillStyle = "#115";
    ctx.textAlign = "center";
    ctx.fillText("You", player.x, player.y - PLAYER_SIZE / 1.1);

    // Bots
    bots.forEach((bot, i) => {
      ctx.beginPath();
      ctx.arc(bot.x, bot.y, BOT_SIZE / 2, 0, 2 * Math.PI, false);
      ctx.fillStyle = "#f25266";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ab1549";
      ctx.stroke();

      ctx.font = "bold 13px Arial";
      ctx.fillStyle = "#711";
      ctx.textAlign = "center";
      ctx.fillText(`Bot${i + 1}`, bot.x, bot.y - BOT_SIZE / 1.18);
    });

    // Draw label: who is holding the flag?
    if (flag.heldBy === "player") {
      ctx.font = "900 15px Segoe UI, Arial";
      ctx.fillStyle = "#2196f3";
      ctx.fillText("🏳️", player.x, player.y + 5);
    }
    // Bots can no longer hold the flag, so don't display flag on bots.

    // UI overlays: if over, draw winner
    if (gamestate === "over" || winner) {
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
    }
    // eslint-disable-next-line
  }, [player, bots, flag, gamestate, winner, dropoffBox]);

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
  const handleRestart = (autoStart = false) => {
    setPlayer({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });
    setBots(
      Array.from({ length: NUM_BOTS }, (_, idx) => ({
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
    // Reset level to 1 (for future level progression, could preserve level on restart if going to next stage)
    setLevel(1);
    keyState.current = {};
    if (autoStart) {
      setGamestate("running");
      setRunning(true);
    } else {
      setGamestate("ready");
      setRunning(false);
    }
  };

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
      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "2rem",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
          padding: "1rem 0",
        }}
      >
        <div style={{ fontWeight: 500 }}>
          Score:{" "}
          <span style={{ color: "var(--primary)", fontWeight: 700 }}>
            {player.score}
          </span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Opponent:{" "}
          <span style={{ color: "var(--secondary)", fontWeight: 700 }}>
            {oppScore}
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
            {flagStatus}
          </span>
        </div>
      </section>
      {dropoffStatus && (
        <div
          style={{
            marginTop: ".8rem",
            textAlign: "center",
            color: "#43a047",
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.014em",
            minHeight: 25,
          }}
        >
          {dropoffStatus}
        </div>
      )}

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "2.5rem",
          marginBottom: "2.5rem",
        }}
      >
        {/* ---- Central Game Area (canvas) ---- */}
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
            maxWidth: "95vw",
            position: "relative",
            outline: "none",
          }}
          tabIndex={0}
          aria-label="Game Area"
          onFocus={() => {
            // Focus event can be used to allow for keyboard hotkeys
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
          }}
        >
          <button
            className="game-btn"
            tabIndex={0}
            onClick={handleStart}
            disabled={gamestate === "running"}
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
        <div style={{ marginTop: "1.3rem", color: "#888", fontSize: 14 }}>
          <span>
            Controls: <kbd>WASD</kbd> or <kbd>Arrow Keys</kbd> to move. Grab the flag, then find the drop-off box to score!<br />
            Opposing bots will compete for the flag!<br />
            {/* Future: Levels will include more obstacles & harder bots. */}
          </span>
        </div>
        <div style={{ marginTop: "0.7rem", color: "#bbb", fontSize: 13 }}>
          Level: {level}
        </div>
      </main>
    </div>
  );
}

export default App;
