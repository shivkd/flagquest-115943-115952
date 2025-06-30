import React, { useRef, useEffect, useState } from "react";
import "./App.css";

// --- Game constants ---
const GAME_WIDTH = 600;
const GAME_HEIGHT = 400;
const PLAYER_SIZE = 24;
const BOT_SIZE = 22;
const FLAG_SIZE = 16;
const PLAYER_SPEED = 2.3;
const BOT_SPEED = 1.65;
const NUM_BOTS = 3;
const ROUND_TIME = 120; // seconds

const TEAM = { PLAYER: "Player", BOT: "Bots" };

// Helper for collision
function rectsOverlap(r1, r2) {
  return (
    r1.x < r2.x + r2.size &&
    r1.x + r1.size > r2.x &&
    r1.y < r2.y + r2.size &&
    r1.y + r1.size > r2.y
  );
}

// --- Colors ---
const COLORS = {
  player: "#2196f3",
  bot: "#43a047",
  field: "#e9eef3",
  border: "#9e9e9e",
  flagPlayer: "#ff9800",
  flagBot: "#9c27b0",
  basePlayer: "#bbdefb",
  baseBot: "#c8e6c9",
  text: "#263238",
  accent: "#ff9800",
};

// --- Main App ---
function App() {
  // Game State
  const [score, setScore] = useState({ player: 0, bots: 0 });
  const [time, setTime] = useState(ROUND_TIME);
  const [isRunning, setIsRunning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [flagState, setFlagState] = useState({ holder: null, pos: { x: 0, y: 0 } });
  const [showSplash, setShowSplash] = useState(true);

  // Game Entities
  const [player, setPlayer] = useState({
    x: 60,
    y: GAME_HEIGHT / 2 - PLAYER_SIZE / 2,
    size: PLAYER_SIZE,
    dx: 0,
    dy: 0,
    color: COLORS.player,
    carryingFlag: false,
  });
  const [bots, setBots] = useState([]);
  const [botBases] = useState([
    { x: GAME_WIDTH - 70, y: 70 },
    { x: GAME_WIDTH - 70, y: GAME_HEIGHT - 90 },
    { x: GAME_WIDTH - 130, y: GAME_HEIGHT / 2 - 25 },
  ]);
  const playerBase = { x: 30, y: GAME_HEIGHT / 2 - 40, size: 60 };

  const gameCanvasRef = useRef();
  const animationRef = useRef();
  const keysRef = useRef({});
  const timerRef = useRef();
  const [lastFrameTime, setLastFrameTime] = useState(performance.now());

  // --- INIT (on New Game) ---
  useEffect(() => {
    if (!isRunning) return;
    // Reset state
    setScore({ player: 0, bots: 0 });
    setTime(ROUND_TIME);
    setWinner(null);
    resetEntities();
    setShowSplash(false);

    // Timer
    timerRef.current = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setWinner(
            score.player > score.bots
              ? "You Win!"
              : score.player < score.bots
              ? "Bots Win!"
              : "Draw!"
          );
          setIsRunning(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    animationRef.current = requestAnimationFrame(gameLoop);
    // Cleanup
    return () => {
      clearInterval(timerRef.current);
      cancelAnimationFrame(animationRef.current);
    };
    // eslint-disable-next-line
  }, [isRunning]);

  // --- Reset all entities and flag position ---
  function resetEntities() {
    setPlayer({
      x: 60,
      y: GAME_HEIGHT / 2 - PLAYER_SIZE / 2,
      size: PLAYER_SIZE,
      dx: 0,
      dy: 0,
      color: COLORS.player,
      carryingFlag: false,
    });
    let newBots = [];
    for (let i = 0; i < NUM_BOTS; ++i) {
      newBots.push({
        x: botBases[i].x,
        y: botBases[i].y,
        size: BOT_SIZE,
        dx: 0,
        dy: 0,
        color: COLORS.bot,
        carryingFlag: false,
        id: i,
      });
    }
    setBots(newBots);
    setFlagState({
      holder: null,
      pos: { x: GAME_WIDTH / 2 - FLAG_SIZE / 2, y: GAME_HEIGHT / 2 - FLAG_SIZE / 2 },
      team: Math.random() < 0.5 ? TEAM.PLAYER : TEAM.BOT,
    });
  }

  // --- KEYBOARD HANDLING ---
  useEffect(() => {
    function onKeyDown(e) {
      keysRef.current[e.key.toLowerCase()] = true;
    }
    function onKeyUp(e) {
      keysRef.current[e.key.toLowerCase()] = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // --- MAIN GAME LOOP ---
  function gameLoop(now) {
    // Move Player
    let move = { dx: 0, dy: 0 };
    if (keysRef.current["arrowup"] || keysRef.current["w"]) move.dy = -1;
    if (keysRef.current["arrowdown"] || keysRef.current["s"]) move.dy = 1;
    if (keysRef.current["arrowleft"] || keysRef.current["a"]) move.dx = -1;
    if (keysRef.current["arrowright"] || keysRef.current["d"]) move.dx = 1;
    let norm =
      move.dx !== 0 && move.dy !== 0
        ? 0.7071
        : move.dx !== 0 || move.dy !== 0
        ? 1
        : 0;
    let px = player.x + move.dx * PLAYER_SPEED * norm;
    let py = player.y + move.dy * PLAYER_SPEED * norm;
    px = Math.max(0, Math.min(GAME_WIDTH - PLAYER_SIZE, px));
    py = Math.max(0, Math.min(GAME_HEIGHT - PLAYER_SIZE, py));
    let playerUpdate = { ...player, x: px, y: py };

    // Handle Player-Flag Pickup
    let flagRect = {
      x: flagState.pos.x,
      y: flagState.pos.y,
      size: FLAG_SIZE,
    };
    let playerRect = {
      x: px,
      y: py,
      size: PLAYER_SIZE,
    };
    let flagHeld = flagState.holder;
    if (
      !flagHeld &&
      rectsOverlap(playerRect, flagRect) &&
      flagState.team === TEAM.BOT
    ) {
      // Player picks up bot team flag
      flagHeld = TEAM.PLAYER;
      playerUpdate.carryingFlag = true;
    }

    // Handle Player returns flag to base
    if (
      flagHeld === TEAM.PLAYER &&
      playerUpdate.carryingFlag &&
      px < playerBase.x + playerBase.size &&
      py + PLAYER_SIZE > playerBase.y &&
      py < playerBase.y + playerBase.size
    ) {
      // Score
      setScore((prev) => ({ ...prev, player: prev.player + 1 }));
      playerUpdate.carryingFlag = false;
      setFlagState({
        holder: null,
        pos: { x: GAME_WIDTH / 2 - FLAG_SIZE / 2, y: GAME_HEIGHT / 2 - FLAG_SIZE / 2 },
        team: TEAM.BOT,
      });
      // Reset bots also slightly
      setBots((bs) =>
        bs.map((bot, idx) => ({ ...bot, x: botBases[idx].x, y: botBases[idx].y, carryingFlag: false }))
      );
    }

    // --- AI Bots Logic
    let botFlagBaseRect = {
      x: GAME_WIDTH - 80,
      y: GAME_HEIGHT / 2 - 40,
      size: 60,
    };
    let botsUpdate = bots.map((bot, idx) => {
      let bx = bot.x,
        by = bot.y;
      let action = "seekFlag";

      // 1. If carrying flag, head to their base
      if (
        flagState.holder === bot.id ||
        (flagState.holder === TEAM.BOT && bot.carryingFlag)
      ) {
        action = "returnBase";
        if (
          bx + BOT_SIZE > botFlagBaseRect.x &&
          by > botFlagBaseRect.y &&
          by < botFlagBaseRect.y + botFlagBaseRect.size
        ) {
          // Scored!
          setScore((prev) => ({ ...prev, bots: prev.bots + 1 }));
          setFlagState({
            holder: null,
            pos: { x: GAME_WIDTH / 2 - FLAG_SIZE / 2, y: GAME_HEIGHT / 2 - FLAG_SIZE / 2 },
            team: TEAM.PLAYER,
          });
          return {
            ...bot,
            x: botBases[idx].x,
            y: botBases[idx].y,
            carryingFlag: false,
          };
        }
      }
      // 2. If flag available and is for their team, seek it
      else if (
        !flagState.holder &&
        flagState.team === TEAM.PLAYER &&
        Math.random() > 0.35
      ) {
        action = "seekFlag";
      }
      // 3. If player carrying flag, chase player
      else if (
        flagState.holder === TEAM.PLAYER ||
        player.carryingFlag
      ) {
        action = "chasePlayer";
      }
      // Move
      let target = null;
      if (action === "returnBase") {
        target = { x: botFlagBaseRect.x + 16, y: botFlagBaseRect.y + 24 };
      } else if (action === "chasePlayer") {
        target = { x: px, y: py };
      } else if (action === "seekFlag") {
        target = flagState.pos;
      } else {
        target = { x: botBases[idx].x, y: botBases[idx].y };
      }
      let dx = target.x - bx;
      let dy = target.y - by;
      let dist = Math.sqrt(dx * dx + dy * dy);
      let bdx = dist > 2 ? (dx / dist) * BOT_SPEED : 0;
      let bdy = dist > 2 ? (dy / dist) * BOT_SPEED : 0;
      let nbx = Math.max(0, Math.min(GAME_WIDTH - BOT_SIZE, bx + bdx));
      let nby = Math.max(0, Math.min(GAME_HEIGHT - BOT_SIZE, by + bdy));

      // Handle Bot picks up player flag
      let botRect = { x: nbx, y: nby, size: BOT_SIZE };
      if (
        !flagState.holder &&
        flagState.team === TEAM.PLAYER &&
        rectsOverlap(botRect, flagRect)
      ) {
        setFlagState((prev) => ({
          ...prev,
          holder: bot.id,
        }));
        return { ...bot, x: nbx, y: nby, carryingFlag: true };
      }
      // If bot has flag, update flag held state
      let carryingFlag = flagState.holder === bot.id;
      return { ...bot, x: nbx, y: nby, carryingFlag };
    });

    // --- Handle Bots tag player carrying flag (reset flag pos)
    botsUpdate.forEach((bot) => {
      let botRect = { x: bot.x, y: bot.y, size: BOT_SIZE };
      if (
        playerUpdate.carryingFlag &&
        rectsOverlap(botRect, playerRect)
      ) {
        // Drop flag in place
        setFlagState({
          holder: null,
          pos: {
            x: px,
            y: py,
          },
          team: TEAM.BOT,
        });
        playerUpdate.carryingFlag = false;
      }
    });

    setPlayer(playerUpdate);
    setBots(botsUpdate);

    // --- Flag Movement
    let flagUpdate = { ...flagState };
    if (flagHeld === TEAM.PLAYER && playerUpdate.carryingFlag) {
      // Attach flag to player
      flagUpdate.pos = { x: px + PLAYER_SIZE / 2 - FLAG_SIZE / 2, y: py - 8 };
      flagUpdate.holder = TEAM.PLAYER;
      flagUpdate.team = TEAM.BOT;
    } else if (
      typeof flagHeld === "number" &&
      botsUpdate[flagHeld] &&
      botsUpdate[flagHeld].carryingFlag
    ) {
      flagUpdate.pos = {
        x:
          botsUpdate[flagHeld].x +
          BOT_SIZE / 2 -
          FLAG_SIZE / 2,
        y: botsUpdate[flagHeld].y - 8,
      };
      flagUpdate.holder = flagHeld;
      flagUpdate.team = TEAM.PLAYER;
    }
    setFlagState(flagUpdate);

    // Check if time's up or not running
    if (isRunning) {
      animationRef.current = requestAnimationFrame(gameLoop);
    }
  }

  // --- CANVAS RENDER (draw) ---
  useEffect(() => {
    const ctx = gameCanvasRef.current.getContext("2d");
    // Clear
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // --- Field ---
    ctx.fillStyle = COLORS.field;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Midline
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(GAME_WIDTH / 2, 0);
    ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
    ctx.stroke();

    // --- Bases ---
    // Player base
    ctx.fillStyle = COLORS.basePlayer;
    ctx.fillRect(playerBase.x, playerBase.y, playerBase.size, playerBase.size);
    // Bots base
    ctx.fillStyle = COLORS.baseBot;
    ctx.fillRect(GAME_WIDTH - 80, GAME_HEIGHT / 2 - 40, 60, 60);

    // --- Flags ---
    if (!flagState.holder) {
      // Draw flag on ground
      ctx.fillStyle =
        flagState.team === TEAM.PLAYER
          ? COLORS.flagPlayer
          : COLORS.flagBot;
      ctx.beginPath();
      ctx.arc(
        flagState.pos.x + FLAG_SIZE / 2,
        flagState.pos.y + FLAG_SIZE / 2,
        FLAG_SIZE / 2,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }

    // --- Player ---
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(
      player.x + PLAYER_SIZE / 2,
      player.y + PLAYER_SIZE / 2,
      PLAYER_SIZE / 2,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("You", player.x - 2, player.y - 8);

    // --- Bots ---
    bots.forEach((bot, idx) => {
      ctx.fillStyle = COLORS.bot;
      ctx.beginPath();
      ctx.arc(
        bot.x + BOT_SIZE / 2,
        bot.y + BOT_SIZE / 2,
        BOT_SIZE / 2,
        0,
        2 * Math.PI
      );
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("Bot", bot.x - 2, bot.y - 8);
    });

    // --- Carried flags ---
    if (player.carryingFlag) {
      ctx.fillStyle = COLORS.flagBot;
      ctx.beginPath();
      ctx.arc(
        player.x + PLAYER_SIZE / 2,
        player.y + 2,
        FLAG_SIZE / 2,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }
    bots.forEach((bot) => {
      if (bot.carryingFlag) {
        ctx.fillStyle = COLORS.flagPlayer;
        ctx.beginPath();
        ctx.arc(
          bot.x + BOT_SIZE / 2,
          bot.y + 2,
          FLAG_SIZE / 2,
          0,
          2 * Math.PI
        );
        ctx.fill();
      }
    });
    // Simple aesthetics: outlines
    ctx.strokeStyle = "#BABABA88";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }, [player, bots, flagState, isRunning]);

  // --- TIMER AND GAME END ---
  useEffect(() => {
    if (time === 0 && !winner && !showSplash) {
      if (score.player > score.bots) setWinner("You Win!");
      else if (score.player < score.bots) setWinner("Bots Win!");
      else setWinner("Draw!");
      setIsRunning(false);
    }
    // eslint-disable-next-line
  }, [time, score, showSplash]);

  // --- UI BUTTONS ---
  function handleStart() {
    setIsRunning(true);
    setShowSplash(false);
    resetEntities();
    setScore({ player: 0, bots: 0 });
    setTime(ROUND_TIME);
    setWinner(null);
  }
  function handlePause() {
    setIsRunning(false);
    clearInterval(timerRef.current);
    cancelAnimationFrame(animationRef.current);
  }
  function handleResume() {
    setIsRunning(true);
    timerRef.current = setInterval(() => setTime(t => (t > 0 ? t - 1 : 0)), 1000);
    animationRef.current = requestAnimationFrame(gameLoop);
  }
  function handleRestart() {
    handleStart();
  }

  // --- UI THEME & COLORS SETUP ---
  useEffect(() => {
    // Set root CSS variables for the light theme
    document.documentElement.style.setProperty("--bg-primary", "#fff");
    document.documentElement.style.setProperty("--bg-secondary", "#f8f9fa");
    document.documentElement.style.setProperty("--text-primary", COLORS.text);
    document.documentElement.style.setProperty("--button-bg", COLORS.primary);
    document.documentElement.style.setProperty("--button-text", "#fff");
  }, []);

  // --- UI Render ---
  return (
      <div className="App" style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
        <header style={{ background: "var(--bg-secondary)", padding: "16px 0 24px 0" }}>
          <h1 style={{
            color: COLORS.primary,
            letterSpacing: "2px",
            fontWeight: 700,
            marginBottom: 0,
            fontSize: 28,
          }}>FlagQuest: 2D Capture the Flag</h1>
          <div
            style={{
              color: COLORS.text,
              fontSize: 16,
              fontWeight: 400,
              marginTop: 8,
              marginBottom: 2,
              letterSpacing: 0.1,
            }}
          >First to <span style={{ color: COLORS.accent, fontWeight: 600 }}>capture the flag</span> and return to base. Avoid AI bots!</div>
        </header>

        <div style={{ width: GAME_WIDTH, margin: "0 auto" }}>
          {/* Top Game State Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "12px 0 6px 0",
              background: "#f5f5f5",
              padding: "8px 18px",
              borderRadius: 11,
              border: `1px solid ${COLORS.border}`,
              fontSize: 17,
              fontWeight: 500,
              color: COLORS.text,
            }}
          >
            <span>
              <span style={{ color: COLORS.primary, fontWeight: 700 }}>You:</span>
              {" "}
              {score.player}
            </span>
            <span>
              <i className="material-icons" style={{
                fontSize: 20, verticalAlign: "middle", marginRight: 4, color: COLORS.accent
              }}>flag</i>
              <span style={{ fontWeight: 600 }}>
                {flagState.holder === TEAM.PLAYER
                  ? "You:"
                  : typeof flagState.holder === "number"
                    ? `Bot`
                    : "Free:"}
              </span>
              <span style={{
                marginLeft: 4,
                color: flagState.team === TEAM.PLAYER ? COLORS.flagPlayer : COLORS.flagBot,
                fontWeight: 600
              }}>
                {flagState.team === TEAM.PLAYER ? "Your Flag" : "Bot Flag"}
              </span>
            </span>
            <span style={{ color: COLORS.bot, fontWeight: 700 }}>
              Bots: {score.bots}
            </span>
          </div>

          {/* Game Canvas */}
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 430,
                marginBottom: 5,
                marginTop: 5,
              }}
            >
              <canvas
                ref={gameCanvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                style={{
                  boxShadow: "0 4px 24px 0 rgba(33,150,243,0.07)",
                  borderRadius: 16,
                  border: `2px solid ${COLORS.primary}`,
                  background: COLORS.field,
                  outline: "none",
                }}
                tabIndex={0}
              />
            </div>
            {/* Timer, instructions, and results */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              margin: "6px 0 6px 0",
              fontSize: 16,
              alignItems: "center",
              color: COLORS.text,
            }}>
              <span>
                <b>⏰</b>{" "}
                {`${Math.floor(time / 60)
                  .toString()
                  .padStart(2, "0")}:${(time % 60).toString().padStart(2, "0")}`}
              </span>
              <span style={{fontSize:15, color: "#989898"}}>
                {isRunning ? (
                  <span>
                    <b>Move</b>: [WASD] or [Arrow Keys] <span style={{marginLeft:8}}>| <b>Objective</b>: Bring the bot's flag to your base!
                  </span>
                ) : winner ? <b>Game Over!</b> : "Press Start to Play!"}
              </span>
              <span>
                <b>Round:</b> 1
              </span>
            </div>
          </section>
          {/* Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 18,
              margin: "18px 0 9px 0"
            }}
          >
            {(!isRunning && winner) ? (
              <div>
                <button className="game-btn" style={{
                  background: COLORS.primary,
                  color: "#fff"
                }} onClick={handleRestart}>Restart</button>
              </div>
            ) : !isRunning ? (
              <div>
                <button className="game-btn" style={{
                  background: COLORS.primary,
                  color: "#fff"
                }} onClick={handleStart}>Start</button>
              </div>
            ) : (
              <div style={{display: "flex", gap: 16}}>
                <button className="game-btn" style={{
                  background: COLORS.primary,
                  color: "#fff"
                }} onClick={handlePause}>Pause</button>
                <button className="game-btn" style={{
                  background: COLORS.secondary,
                  color: "#fff"
                }} onClick={handleResume}>Resume</button>
                <button className="game-btn" style={{
                  background: COLORS.accent,
                  color: "#fff"
                }} onClick={handleRestart}>Restart</button>
              </div>
            )}
          </div>
          {/* End/Winner Splash */}
          {winner && !isRunning && (
            <div
              style={{
                background: "#fffde7",
                color: COLORS.text,
                border: `1.5px solid ${COLORS.accent}`,
                borderRadius: 12,
                margin: "14px auto",
                padding: "16px 40px",
                width: 350,
                fontWeight: 600,
                fontSize: 25,
                boxShadow: "0 2px 14px 0 rgba(255,152,0,0.12)",
                letterSpacing: 1,
              }}
            >
              {winner}
            </div>
          )}
          {showSplash && (
            <div style={{
              background: "#fff",
              color: COLORS.text,
              border: `1.5px solid ${COLORS.primary}`,
              borderRadius: 15,
              margin: "18px auto",
              padding: "22px 40px 15px 40px",
              width: 370,
              boxShadow: "0 2px 16px 0 rgba(33,150,243,0.05)",
              fontWeight: 500,
              fontSize: 22
            }}>
              <div>
                <b>Welcome to FlagQuest!</b>
              </div>
              <p style={{
                color: "#444",
                fontSize: 15,
                marginTop: 10,
                marginBottom: 14,
              }}>
                Steal the bot's flag (orange), bring it to your base on the left, and avoid the bots! First to score more in two minutes wins.
              </p>
              <button
                onClick={handleStart}
                style={{
                  display: "block",
                  margin: "0 auto",
                  background: COLORS.primary,
                  color: "#fff",
                  padding: "12px 36px",
                  border: "none",
                  fontSize: 18,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600
                }}
                className="game-btn"
              >Start Game</button>
              <ul style={{ textAlign: "left", fontSize: 14, color: "#555", paddingLeft: 18, marginTop: 16 }}>
                <li>Move: <b>WASD</b> or <b>Arrow keys</b></li>
                <li>Grab orange flag, <b>return</b> to left base</li>
                <li>Avoid bots (they chase you!)</li>
                <li>First to score wins!</li>
              </ul>
            </div>
          )}
        </div>
        <footer style={{
          width: "100%",
          textAlign: "center",
          color: "#758da1",
          fontSize: 13,
          marginTop: 22,
          letterSpacing: "0.14em",
          paddingTop: 6
        }}>
          FlagQuest &copy; {new Date().getFullYear()} | Minimalistic 2D Game Demo
        </footer>
      </div>
  );
}

export default App;
