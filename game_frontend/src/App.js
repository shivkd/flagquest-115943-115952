import React, { useRef, useEffect, useState, useCallback } from "react";
import "./App.css";

/**
 * FlagQuest App: Minimal 2D capture-the-flag game – original, pre-hazard movement logic restored.
 * - Handles player movement, bot AI, flag pickup, dropoff, basic scoring, game state.
 * - All hazard and experimental logic (bombs, cracks, lasers, stuns) temporarily removed.
 * - Ensures smooth, reliable controls for both player and bots.
 */

/********************
 * HAZARD CONSTANTS
 ********************/
const CANVAS_W = 640;
const CANVAS_H = 440;
const PLAYER_SIZE = 26;
const BOT_SIZE = 26;
const FLAG_SIZE = 18;
const PLAYER_SPEED = 3.1; // px/tick

const BOT_BASE_SPEED = 1.28;
const BOT_SPEED_PER_LEVEL = 0.42;
const BOT_SPEED_CAP = 4.5;
const FLAG_ZONE_RADIUS = 32;
const DROPOFF_BOX_SIZE = 30;

const BOT_INCREASE_RATE = 1;
const OBSTACLE_INCREASE_RATE = 1;
const BASE_NUM_BOTS = 2;
const OBSTACLE_SIZE = 28;

// Bomb and Laser Hazards
const BOMB_MIN_DELAY = 900; // ms until spawn or explosion
const BOMB_MAX_DELAY = 2400;
const BOMB_RADIUS = 34; // blast radius
const BOMB_WARNING_RADIUS = BOMB_RADIUS + 8;
const BOMB_EXPLODE_DURATION = 20; // frames for explosion
const LASER_WIDTH = 19;
const LASER_WARNING_TIME = 70; // frames before laser fires
const LASER_FIRE_TIME = 44; // frames laser active
const LASER_VARIANT_COLORS = ["#f25266", "#f5fd36", "#36ffd2"];
const LASER_WARNING_COLOR = "#ffe983";

// Utility helpers
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function randomBetween(a, b) {
  return Math.random() * (b - a) + a;
}
function randomPos(w, h, margin = 18) {
  return {
    x: Math.random() * (w - 2 * margin) + margin,
    y: Math.random() * (h - 2 * margin) + margin,
  };
}
function randomDropoffBox(w, h, margin = 40) {
  let pos;
  do {
    pos = randomPos(w, h, margin);
  } while (
    pos.x < CANVAS_W / 3
  );
  return pos;
}
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
      (pos.x < 80 && Math.abs(pos.y - CANVAS_H / 2) < 60) ||
      obs.some(
        (o) =>
          Math.abs(o.x - pos.x) < OBSTACLE_SIZE &&
          Math.abs(o.y - pos.y) < OBSTACLE_SIZE
      ) ||
      tries > 20
    );
    obs.push(pos);
  }
  return obs;
}

/**
 * PUBLIC_INTERFACE
 * Main game component. Adds hazard state and hazard management.
 */
function App() {
  // Game state
  const [level, setLevel] = useState(1);
  const [numBots, setNumBots] = useState(BASE_NUM_BOTS);
  const [obstacles, setObstacles] = useState(() =>
    randomObstacles((level - 1) * OBSTACLE_INCREASE_RATE)
  );
  const [player, setPlayer] = useState({
    x: 60,
    y: CANVAS_H / 2,
    dx: 0,
    dy: 0,
    score: 0,
  });
  const [bots, setBots] = useState(() =>
    Array.from({ length: BASE_NUM_BOTS }, (_, idx) => ({
      id: idx + 1,
      x: CANVAS_W - 50 - idx * 30,
      y: (2 * CANVAS_H) / 3 - idx * 30,
      dx: 0,
      dy: 0,
      score: 0,
    }))
  );
  const [flag, setFlag] = useState(() => ({
    ...randomPos(CANVAS_W, CANVAS_H),
    heldBy: null,
    home: true,
  }));
  const [dropoffBox, setDropoffBox] = useState(null);

  /****** Hazard environment (bombs & lasers) *****/
  const [bombs, setBombs] = useState([]);
  const [lasers, setLasers] = useState([]);
  // State for timing the next spawn (so hazard timing isn't frame-dependent)
  const bombNextTimerRef = useRef(0);
  const laserNextTimerRef = useRef(0);

  // Timer/game state
  const TIMER_DURATION = 90;
  const [timer, setTimer] = useState(TIMER_DURATION);
  const [running, setRunning] = useState(false);
  const [gamestate, setGamestate] = useState("ready"); // "ready", "running", "paused", "over", "levelcomplete"
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState("");
  const [levelCompleted, setLevelCompleted] = useState(false);

  const canvasRef = useRef(null);
  const keyState = useRef({});

  // Timer loop for game time
  useEffect(() => {
    if (!running) return;
    if (timer <= 0) {
      setGamestate("over");
      setRunning(false);
      setMessage(`Time's up! Your score: ${player.score}`);
      setWinner("player");
      setDropoffBox(null);
      return;
    }
    const t = setInterval(() => {
      setTimer((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [running, timer]);

  // Keyboard controls
  useEffect(() => {
    function handleDown(e) {
      if (["ArrowUp", "w", "W"].includes(e.key)) keyState.current.up = true;
      if (["ArrowDown", "s", "S"].includes(e.key)) keyState.current.down = true;
      if (["ArrowLeft", "a", "A"].includes(e.key)) keyState.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keyState.current.right = true;
      if (e.key === "r" || e.key === "R") {
        handleRestart(true);
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
    // eslint-disable-next-line
  }, []);

  // ----- CORE GAME LOOP: player and bot movement -----
  // The old logic set state (setPlayer, setBots, etc.) inside the animation frame
  // using values derived from stale state. This caused movement to be unsmooth or non-functional.
  // Instead, we now use useRef for storing and updating player, bots, and flag for smooth animation frame logic,
  // then flush those refs into state at each frame, so React state/props always reflect the latest world state.

  // Movement refs to allow animation smoothness and decouple calculation from React batching
  const playerRef = useRef(null);
  const botsRef = useRef(null);
  const flagRef = useRef(null);
  const dropoffBoxRef = useRef(null);
  // Hazard refs
  const bombsRef = useRef(null);
  const lasersRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { botsRef.current = bots; }, [bots]);
  useEffect(() => { flagRef.current = flag; }, [flag]);
  useEffect(() => { dropoffBoxRef.current = dropoffBox; }, [dropoffBox]);
  useEffect(() => { bombsRef.current = bombs; }, [bombs]);
  useEffect(() => { lasersRef.current = lasers; }, [lasers]);

  useEffect(() => {
    let anim;
    let lastTime = performance.now();

    // Smooth tick using refs for all stateful data, which are only written back every React render
    function checkCollisionWithObstacles(x, y, margin = 4) {
      return obstacles.some(
        (o) =>
          Math.abs(o.x - x) < OBSTACLE_SIZE / 2 + PLAYER_SIZE / 2 + margin &&
          Math.abs(o.y - y) < OBSTACLE_SIZE / 2 + PLAYER_SIZE / 2 + margin
      );
    }

    function dist(x1, y1, x2, y2) {
      return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    }

    /**
     * Main game loop. Adds bombs and lasers spawn/progression/collision starting from level >= 2.
     */
    function gameTick(now) {
      if (gamestate !== "running") return;

      let delta = Math.min(now - lastTime, 40);
      lastTime = now;

      // --- refs for state ---
      let p = playerRef.current ? { ...playerRef.current } : { ...player };
      let botsArr = botsRef.current ? botsRef.current.map((b) => ({ ...b })) : bots.map((b) => ({ ...b }));
      let flagVal = flagRef.current ? { ...flagRef.current } : { ...flag };
      let box = dropoffBoxRef.current ? { ...dropoffBoxRef.current } : dropoffBox;
      let bombsArr = bombsRef.current ? bombsRef.current.map((b) => ({...b})) : [];
      let lasersArr = lasersRef.current ? lasersRef.current.map(l => ({...l})) : [];

      // -----
      // Ensure playerScored is declared at function scope top for use in hazard gating and win logic
      // -----
      let playerScored = false;

      // ----- PLAYER PHYSICS (identical, unless stunned by hazards) -----
      let pvx = 0, pvy = 0;
      if (keyState.current.up) pvy -= PLAYER_SPEED;
      if (keyState.current.down) pvy += PLAYER_SPEED;
      if (keyState.current.left) pvx -= PLAYER_SPEED;
      if (keyState.current.right) pvx += PLAYER_SPEED;
      // No core movement block - hazard effects below!

      if (pvx !== 0 || pvy !== 0) {
        const m = Math.sqrt(pvx * pvx + pvy * pvy);
        if (m > 0) {
          pvx = (pvx / m) * PLAYER_SPEED;
          pvy = (pvy / m) * PLAYER_SPEED;
        }
      }
      let newPx = clamp(p.x + pvx, PLAYER_SIZE / 2, CANVAS_W - PLAYER_SIZE / 2);
      let newPy = clamp(p.y + pvy, PLAYER_SIZE / 2, CANVAS_H - PLAYER_SIZE / 2);
      if (!checkCollisionWithObstacles(newPx, newPy)) {
        p.x = newPx;
        p.y = newPy;
      }

      // ----- Calculate bot speed by level -----
      const currentBotSpeed = Math.min(
        BOT_BASE_SPEED + BOT_SPEED_PER_LEVEL * (level - 1),
        BOT_SPEED_CAP
      );

      // ----- Bots movement, similar as before -----
      let botsAfterMove = botsArr.map((bot, i) => {
        const botChaseAngleBase = Math.atan2(p.y - bot.y, p.x - bot.x);
        const indexSpread = ((i - (botsArr.length - 1) / 2) * Math.PI) / (botsArr.length * 3.3);
        const randomWobble = (Math.random() - 0.5) * 0.18;
        const chaseAngle = botChaseAngleBase + indexSpread + randomWobble;
        const biasDist = 2.5 + 2 * Math.abs(indexSpread) + Math.random() * 1.2;
        let dx = Math.cos(chaseAngle) * (Math.abs(p.x - bot.x) + biasDist);
        let dy = Math.sin(chaseAngle) * (Math.abs(p.y - bot.y) + biasDist);

        let distToTgt = Math.sqrt(dx * dx + dy * dy);
        let bvx = 0, bvy = 0;
        if (distToTgt > 3) {
          bvx = (dx / distToTgt) * currentBotSpeed;
          bvy = (dy / distToTgt) * currentBotSpeed;
          let maybeBx = clamp(bot.x + bvx, BOT_SIZE / 2, CANVAS_W - BOT_SIZE / 2);
          let maybeBy = clamp(bot.y + bvy, BOT_SIZE / 2, CANVAS_H - BOT_SIZE / 2);
          const separationThreshold = BOT_SIZE * 0.84;
          let willStack = botsArr.some(
            (other, j) =>
              other.id !== bot.id &&
              Math.abs(maybeBx - other.x) < separationThreshold &&
              Math.abs(maybeBy - other.y) < separationThreshold
          );
          if (
            !checkCollisionWithObstacles(maybeBx, maybeBy, 0) &&
            !willStack
          ) {
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
        return { ...bot };
      });

      // --------
      // HAZARD SPAWN/PROGRESSION -- Only from level >= 2!
      // --------
      // Bomb spawn: appears at intervals, explodes after delay, deals "damage"
      // Laser: strong horizontal or vertical beam (with warning), sweeps occasionally
      let bombsNext = bombsArr;
      let lasersNext = lasersArr;

      // Scales with difficulty
      const bombSpawnInterval = Math.max(120 + 700 / Math.max(1, level - 1), 80); // ms
      const bombLiveDuration = 1000 + 1350 / Math.max(1, level - 1); // ms till explosion
      const maxBombs = Math.max(1, Math.floor(level / 1.18));
      const laserSpawnIntervalFrames = 350 - 35 * Math.min(level-2,6); // in frames, faster for higher level
      const laserWarningFrames = Math.max(30, LASER_WARNING_TIME - 5 * (level-2));
      const maxLasers = Math.max(1, Math.floor((level-1)/2));

      // Use frame-counting for laser, timer for bomb (both robust for their spawn style and animation)
      // Bombs
      if (level >= 2 && !playerScored) {
        // Count time: only one spawn per timer expiry
        bombNextTimerRef.current -= delta;
        if (bombNextTimerRef.current <= 0 && bombsNext.length < maxBombs) {
          // spawn bomb at random safe spot (not overlapping player, bots, or flag)
          let spawn;
          let tries = 0;
          do {
            spawn = randomPos(CANVAS_W, CANVAS_H, 32);
            tries++;
          } while (
            tries < 16 &&
            (
              (Math.abs(spawn.x - p.x) < PLAYER_SIZE * 1.6 && Math.abs(spawn.y - p.y) < PLAYER_SIZE * 1.6) ||
              botsArr.some(bot => Math.abs(spawn.x - bot.x) < BOT_SIZE * 1.6 && Math.abs(spawn.y - bot.y) < BOT_SIZE * 1.6) ||
              (flagVal.heldBy == null && Math.abs(spawn.x - flagVal.x) < FLAG_SIZE * 2 && Math.abs(spawn.y - flagVal.y) < FLAG_SIZE * 2) ||
              checkCollisionWithObstacles(spawn.x, spawn.y, 16)
            )
          );
          // Bomb properties: x,y, spawnTime, willExplodeAt, exploded
          bombsNext = [
            ...bombsNext,
            {
              id: Math.random().toString(36).slice(2),
              x: spawn.x,
              y: spawn.y,
              created: performance.now(),
              liveUntil: performance.now() + bombLiveDuration,
              exploded: false,
              explosionProgress: 0,
            },
          ];
          bombNextTimerRef.current = randomBetween(bombSpawnInterval, bombSpawnInterval * 1.7);
        }
        // Progress bombs: explode after timer, remove after
        bombsNext = bombsNext.map(bomb => {
          if (!bomb.exploded && performance.now() >= bomb.liveUntil) {
            return { ...bomb, exploded: true, explosionProgress: 1 };
          }
          if (bomb.exploded && bomb.explosionProgress < BOMB_EXPLODE_DURATION) {
            return { ...bomb, explosionProgress: bomb.explosionProgress + 1 };
          }
          return bomb;
        });
        // Remove bombs whose animation has completed
        bombsNext = bombsNext.filter(bomb => !bomb.exploded || bomb.explosionProgress < BOMB_EXPLODE_DURATION);
      } else if (level < 2) {
        bombsNext = [];
        bombNextTimerRef.current = 0;
      }

      // Lasers: appear less frequently, sweep all at once
      if (level >= 2 && !playerScored) {
        laserNextTimerRef.current -= 1;
        if (laserNextTimerRef.current <= 0 && lasersNext.length < maxLasers) {
          // spawn horizontal or vertical laser (random)
          let isHorizontal = Math.random() > 0.5;
          let pos = isHorizontal
            ? randomBetween(70, CANVAS_H - 70)
            : randomBetween(70, CANVAS_W - 70);
          lasersNext = [
            ...lasersNext,
            {
              id: Math.random().toString(36).slice(2),
              isHorizontal,
              pos,
              warning: true,
              lifetime: 0, // frames
              color: LASER_VARIANT_COLORS[Math.floor(Math.random() * LASER_VARIANT_COLORS.length)],
            },
          ];
          laserNextTimerRef.current = randomBetween(
            laserSpawnIntervalFrames * 0.88,
            laserSpawnIntervalFrames * 1.22
          );
        }
        // Progress lasers: warning, fire, then disappear
        lasersNext = lasersNext.map(laser => {
          let nextLife = laser.lifetime + 1;
          if (laser.warning && nextLife >= laserWarningFrames) {
            return { ...laser, warning: false, lifetime: nextLife };
          }
          if (!laser.warning && nextLife >= laserWarningFrames + LASER_FIRE_TIME) {
            return null;
          }
          return { ...laser, lifetime: nextLife };
        }).filter(Boolean);
      } else if (level < 2) {
        lasersNext = [];
        laserNextTimerRef.current = 0;
      }

      // Collision checks/effects
      let bombDamage = false;
      for (const bomb of bombsNext) {
        // Only for "exploded" bomb, frame 1 of explosion
        if (
          bomb.exploded &&
          bomb.explosionProgress === 1 &&
          dist(p.x, p.y, bomb.x, bomb.y) < BOMB_RADIUS + PLAYER_SIZE / 2
        ) {
          bombDamage = true;
        }
        botsAfterMove.forEach((bot, idx) => {
          if (
            bomb.exploded &&
            bomb.explosionProgress === 1 &&
            dist(bot.x, bot.y, bomb.x, bomb.y) < BOMB_RADIUS + BOT_SIZE / 2
          ) {
            // Remove bot, respawn at far edge (simulate "damage")
            botsAfterMove[idx] = {
              ...bot,
              x: CANVAS_W - 30,
              y: randomBetween(40, CANVAS_H - 40),
            };
          }
        });
      }
      let laserDamage = false;
      for (const laser of lasersNext) {
        if (!laser.warning && laser.lifetime >= laserWarningFrames) {
          if (laser.isHorizontal) {
            // Check if player is in laser
            if (Math.abs(p.y - laser.pos) < LASER_WIDTH / 2 + PLAYER_SIZE / 2) {
              laserDamage = true;
            }
            botsAfterMove.forEach((bot, idx) => {
              if (Math.abs(bot.y - laser.pos) < LASER_WIDTH / 2 + BOT_SIZE / 2) {
                botsAfterMove[idx] = {
                  ...bot,
                  x: randomBetween(CANVAS_W / 3, CANVAS_W - 30),
                  y: 30 + Math.random() * (CANVAS_H - 60),
                };
              }
            });
          } else {
            if (Math.abs(p.x - laser.pos) < LASER_WIDTH / 2 + PLAYER_SIZE / 2) {
              laserDamage = true;
            }
            botsAfterMove.forEach((bot, idx) => {
              if (Math.abs(bot.x - laser.pos) < LASER_WIDTH / 2 + BOT_SIZE / 2) {
                botsAfterMove[idx] = {
                  ...bot,
                  x: 60,
                  y: randomBetween(30, CANVAS_H - 30),
                };
              }
            });
          }
        }
      }
      let gameOverByHazard = false;
      let hazardMsg = "";
      if (bombDamage) {
        gameOverByHazard = true;
        hazardMsg = "You were blown up by a bomb!";
      }
      if (laserDamage) {
        gameOverByHazard = true;
        hazardMsg = "You were vaporized by a laser!";
      }

      // ----- FLAG PICKUP LOGIC -----
      let flagNext = { ...flagVal };
      let dropoffCreated = false;
      if (
        !flagNext.heldBy &&
        dist(p.x, p.y, flagNext.x, flagNext.y) < (PLAYER_SIZE + FLAG_SIZE) / 2 + 2
      ) {
        flagNext.heldBy = "player";
        flagNext.home = false;
        box = randomDropoffBox(CANVAS_W, CANVAS_H);
        dropoffCreated = true;
      }

      // Bot catches player?
      let gameOverByAICatch = false;
      botsAfterMove.forEach((bot) => {
        if (dist(p.x, p.y, bot.x, bot.y) < (PLAYER_SIZE + BOT_SIZE) / 2 - 2) {
          gameOverByAICatch = true;
        }
      });

      // Player win condition (deliver flag to dropoff)
      if (
        flagNext.heldBy === "player" &&
        box &&
        dist(p.x, p.y, box.x, box.y) < (PLAYER_SIZE + DROPOFF_BOX_SIZE) / 2 + 4
      ) {
        playerScored = true;
      }

      let playerObj = { ...p };
      let botsOut = botsAfterMove.map((b) => ({ ...b }));
      let playerScoreNext = playerRef.current ? playerRef.current.score : player.score;
      let botScoresArr = botsRef.current ? botsRef.current.map((b) => b.score) : bots.map((b) => b.score);

      // Update scores
      if (playerScored) {
        playerScoreNext += level;
        box = null;
      } else {
        if (flagNext.heldBy === "player") {
          flagNext.x = p.x;
          flagNext.y = p.y;
        }
      }

      // Check win/lose/gameover/hazard loss
      let gameOver = false;
      let newWinner = null;
      let endMsg = "";
      if (gameOverByAICatch) {
        gameOver = true;
        newWinner = "bot";
        endMsg = "You were caught by a bot!";
      }
      if (gameOverByHazard) {
        gameOver = true;
        newWinner = "bot";
        endMsg = hazardMsg;
      }
      if (playerScored) {
        setLevelCompleted(true);
        setGamestate("levelcomplete");
        setRunning(false);
        setMessage(`Flag delivered! +${level} point${level > 1 ? "s" : ""}.`);
        setWinner("player");
        setPlayer({ ...playerObj, score: playerScoreNext });
        setBots((prev) => botsOut.map((b, i) => ({ ...b, score: botScoresArr[i] })));
        setFlag(flagNext);
        setDropoffBox(null);
        setBombs([]);
        setLasers([]);
        return;
      }
      if (Math.max(...botScoresArr) >= 3) {
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
        setBombs([]);
        setLasers([]);
      } else {
        setMessage("");
        setBombs(bombsNext);
        setLasers(lasersNext);
      }

      setPlayer((prev) => ({
        ...playerObj,
        score: playerScoreNext
      }));
      setBots((prev) => botsOut.map((b, i) => ({
        ...b,
        score: botScoresArr[i]
      })));
      setFlag(flagNext);
      if (dropoffCreated) {
        setDropoffBox(box);
      }

      // Continue animation loop if still running
      if (!gameOver && gamestate === "running") {
        anim = requestAnimationFrame(gameTick);
      }
    }

    if (gamestate === "running") {
      anim = requestAnimationFrame(gameTick);
    }
    return () => {
      if (anim) cancelAnimationFrame(anim);
    };
    // eslint-disable-next-line
  }, [gamestate, obstacles, level]);

  // --- DRAW: Now renders bombs and lasers along with core visuals ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = "#e3eaf7";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Bombs/Lasers (level >= 2 only)
    if (level >= 2) {
      // Draw bombs (show fuse, warning circle, explosion)
      bombs.forEach((bomb) => {
        ctx.save();
        if (!bomb.exploded) {
          // Fuse circle
          ctx.globalAlpha = 0.93;
          ctx.beginPath();
          ctx.arc(bomb.x, bomb.y, 16, 0, 2 * Math.PI);
          ctx.fillStyle = "#ffd57e";
          ctx.shadowColor = "#ff6b01";
          ctx.shadowBlur = 7;
          ctx.fill();
          ctx.shadowBlur = 0;
          // Pulsing warning outline
          ctx.lineWidth = 3.2 + Math.sin(performance.now() / 160) * 1.8;
          ctx.strokeStyle = "#ff9800";
          ctx.globalAlpha = 0.72 + 0.22 * Math.abs(Math.sin(performance.now() / 120 + bomb.x / 33));
          ctx.beginPath();
          ctx.arc(bomb.x, bomb.y, BOMB_WARNING_RADIUS, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(bomb.x, bomb.y, 6, 0, 2 * Math.PI);
          ctx.fillStyle = "#222";
          ctx.fill();
        } else {
          // Explosion animation
          ctx.globalAlpha =
            0.14 + 0.7 * (1 - bomb.explosionProgress / (BOMB_EXPLODE_DURATION - 1));
          ctx.beginPath();
          ctx.arc(bomb.x, bomb.y,
            BOMB_RADIUS + 12 * (1 - bomb.explosionProgress / BOMB_EXPLODE_DURATION),
            0, 2 * Math.PI
          );
          ctx.fillStyle = "#ffefbb";
          ctx.shadowColor = "#ff9800";
          ctx.shadowBlur = 13 + 20 * (1 - bomb.explosionProgress / BOMB_EXPLODE_DURATION);
          ctx.fill();
          ctx.beginPath();
          ctx.globalAlpha = 1;
          ctx.arc(bomb.x, bomb.y, BOMB_RADIUS, 0, 2 * Math.PI);
          ctx.strokeStyle = "#f25266";
          ctx.lineWidth = 5.6;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
        // Label - fade out on explode
        ctx.save();
        ctx.font = "bold 13px Segoe UI";
        ctx.fillStyle = "#ff9800";
        ctx.globalAlpha = bomb.exploded ? 0.4 : 1;
        ctx.textAlign = "center";
        ctx.fillText(bomb.exploded ? "BOOM!" : "💣", bomb.x, bomb.y + 5);
        ctx.restore();
      });
      // Draw lasers
      lasers.forEach((laser) => {
        ctx.save();
        ctx.globalAlpha = laser.warning
          ? 0.75 + 0.21 * Math.sin(performance.now() / 150)
          : 0.68 + 0.23 * Math.sin(performance.now() / 180);
        ctx.lineWidth = LASER_WIDTH;
        ctx.strokeStyle = laser.warning ? LASER_WARNING_COLOR : laser.color;
        ctx.shadowColor = laser.warning ? "#ffeccb" : laser.color + "77";
        ctx.shadowBlur = laser.warning ? 10 : 21;
        ctx.beginPath();
        if (laser.isHorizontal) {
          ctx.moveTo(6, laser.pos);
          ctx.lineTo(CANVAS_W - 6, laser.pos);
        } else {
          ctx.moveTo(laser.pos, 6);
          ctx.lineTo(laser.pos, CANVAS_H - 6);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Label
        if (laser.warning) {
          ctx.save();
          ctx.font = "bold 12.7px Segoe UI";
          ctx.fillStyle = "#ffe466";
          ctx.textAlign = "center";
          if (laser.isHorizontal) {
            ctx.fillText("LASER", CANVAS_W / 2, laser.pos - 13);
          } else {
            ctx.save();
            ctx.translate(laser.pos - 23, CANVAS_H / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText("LASER", 0, 0);
            ctx.restore();
          }
          ctx.restore();
        }
        ctx.restore();
      });
    }

    // Left zone (player base)
    ctx.beginPath();
    ctx.arc(0, CANVAS_H / 2, FLAG_ZONE_RADIUS, Math.PI / 2, Math.PI * 1.5, false);
    ctx.fillStyle = "#e7f8ef";
    ctx.fill();

    // Right zone (bot base)
    ctx.beginPath();
    ctx.arc(
      CANVAS_W,
      CANVAS_H / 2,
      FLAG_ZONE_RADIUS,
      Math.PI * 1.5,
      Math.PI / 2,
      false
    );
    ctx.fillStyle = "#f9e7e7";
    ctx.fill();

    // Obstacles
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

    // Drop-off box (if active)
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

    // Player: blue pentagon
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(-Math.PI / 7);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
      const x = (PLAYER_SIZE / 2) * Math.cos(angle);
      const y = (PLAYER_SIZE / 2) * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -PLAYER_SIZE / 2, 0, PLAYER_SIZE / 2);
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

    // Eyes
    ctx.beginPath();
    ctx.arc(0 - 7, -4, 2.4, 0, 2 * Math.PI);
    ctx.arc(0 + 7, -4, 2.4, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0 - 7, -4, 1, 0, 2 * Math.PI);
    ctx.arc(0 + 7, -4, 1, 0, 2 * Math.PI);
    ctx.fillStyle = "#135488";
    ctx.fill();

    ctx.font = "bold 15px Arial";
    ctx.fillStyle = "#115";
    ctx.textAlign = "center";
    ctx.fillText("You", 0, -PLAYER_SIZE / 1.1);
    ctx.restore();

    // Bots: Red diamonds
    bots.forEach((bot, i) => {
      ctx.save();
      ctx.translate(bot.x, bot.y);
      ctx.rotate(Math.PI / 5);
      // Body
      ctx.beginPath();
      ctx.moveTo(0, -BOT_SIZE / 2);
      ctx.lineTo(BOT_SIZE / 2, 0);
      ctx.lineTo(0, BOT_SIZE / 2);
      ctx.lineTo(-BOT_SIZE / 2, 0);
      ctx.closePath();
      const botGrad = ctx.createLinearGradient(
        0,
        -BOT_SIZE / 2,
        0,
        BOT_SIZE / 2
      );
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
      // Eye strip
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 1.8, 7, 2, 0, 0, 2 * Math.PI);
      ctx.fillStyle = "#222";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 1.8, 4.3, 1.06, 0, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffecfc";
      ctx.globalAlpha = 0.51;
      ctx.fill();
      ctx.restore();
      // Antenna
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -BOT_SIZE / 2);
      ctx.lineTo(0, -BOT_SIZE / 2 - 6);
      ctx.strokeStyle = "#ab1549";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -BOT_SIZE / 2 - 7.5, 2.2, 0, 2 * Math.PI);
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

    // Who is holding the flag?
    if (flag.heldBy === "player") {
      ctx.font = "900 15px Segoe UI, Arial";
      ctx.fillStyle = "#2196f3";
      ctx.fillText("🏳️", player.x, player.y + 5);
    }

    // Overlays: end-of-game, level complete
    if (gamestate === "over" || winner) {
      ctx.save();
      ctx.globalAlpha = 0.79;
      ctx.fillStyle = "#fff";
      ctx.fillRect(CANVAS_W / 2 - 120, CANVAS_H / 2 - 50, 240, 100);
      ctx.globalAlpha = 1;
      ctx.font = "bold 24px Segoe UI";
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.fillText(
        winner === "player"
          ? "You Win! 🎉"
          : winner === "bot"
          ? "Bots Win! 🤖"
          : "Game Over",
        CANVAS_W / 2,
        CANVAS_H / 2 + 6
      );
      ctx.font = "15px Arial";
      ctx.fillStyle = "#444";
      ctx.fillText(
        "Press Restart to play again!",
        CANVAS_W / 2,
        CANVAS_H / 2 + 32
      );
      ctx.restore();
    } else if (levelCompleted) {
      ctx.save();
      ctx.globalAlpha = 0.87;
      ctx.fillStyle = "#fff";
      ctx.fillRect(CANVAS_W / 2 - 130, CANVAS_H / 2 - 70, 260, 130);
      ctx.globalAlpha = 1;
      ctx.font = "bold 26px Segoe UI";
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.fillText(`Level ${level} Complete!`, CANVAS_W / 2, CANVAS_H / 2 - 6);
      ctx.font = "18px Arial";
      ctx.fillStyle = "#43a047";
      ctx.fillText(
        "Congratulations! Continue to next level.",
        CANVAS_W / 2,
        CANVAS_H / 2 + 27
      );
      ctx.restore();
    }
    // eslint-disable-next-line
  }, [player, bots, flag, gamestate, winner, dropoffBox, obstacles, levelCompleted]);

  // Button actions
  // Ref for panel to enable auto-focus/re-focus after overlays
  const panelRef = useRef(null);

  const handleStart = () => {
    setGamestate("running");
    setRunning(true);
    setWinner(null);
    setMessage("");
    if (timer <= 0 || gamestate === "over") setTimer(TIMER_DURATION);
    // Re-focus game area for input
    setTimeout(() => {
      if (panelRef.current) panelRef.current.focus();
    }, 80);
  };

  const handlePause = () => {
    if (gamestate !== "running") return;
    setGamestate("paused");
    setRunning(false);
  };

  // Pass autoStart=true for hotkey restart-and-autostart
  // PUBLIC_INTERFACE
  const handleRestart = useCallback(
    (autoStart = false) => {
      // Game should restart at the current level. 
      // Compute bots and obstacles scaling for the current level.
      const activeLevel = level;

      const numBotsForLevel = BASE_NUM_BOTS + (activeLevel - 1) * BOT_INCREASE_RATE;
      const obstaclesForLevel = randomObstacles((activeLevel - 1) * OBSTACLE_INCREASE_RATE);

      setNumBots(numBotsForLevel);
      setObstacles(obstaclesForLevel);

      setPlayer({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });

      setBots(
        Array.from({ length: numBotsForLevel }, (_, idx) => ({
          id: idx + 1,
          x: CANVAS_W - 50 - idx * 30,
          y: (2 * CANVAS_H) / 3 - idx * 30,
          dx: 0,
          dy: 0,
          score: 0,
        }))
      );
      setFlag({ ...randomPos(CANVAS_W, CANVAS_H), heldBy: null, home: true });
      setDropoffBox(null);
      setTimer(TIMER_DURATION);
      setWinner(null);
      setMessage("");
      setLevelCompleted(false);
      // DO NOT reset setLevel here - preserve the current level!
      setBombs([]); // clear hazards on restart
      setLasers([]);
      bombNextTimerRef.current = 0;
      laserNextTimerRef.current = 0;
      keyState.current = {};
      if (autoStart) {
        setGamestate("running");
        setRunning(true);
      } else {
        setGamestate("ready");
        setRunning(false);
      }
    },
    [level]
  );

  // Level-up: advance to next level
  const handleContinueLevel = useCallback(() => {
    const nextLevel = level + 1;
    const newNumBots = BASE_NUM_BOTS + (nextLevel - 1) * BOT_INCREASE_RATE;
    const newObstacles = randomObstacles((nextLevel - 1) * OBSTACLE_INCREASE_RATE);

    setLevel(nextLevel);
    setNumBots(newNumBots);
    setObstacles(newObstacles);

    setPlayer({ x: 60, y: CANVAS_H / 2, dx: 0, dy: 0, score: 0 });
    setBots(
      Array.from({ length: newNumBots }, (_, idx) => ({
        id: idx + 1,
        x: CANVAS_W - 50 - idx * 30,
        y: (2 * CANVAS_H) / 3 - idx * 30,
        dx: 0,
        dy: 0,
        score: 0,
      }))
    );
    setFlag({ ...randomPos(CANVAS_W, CANVAS_H), heldBy: null, home: true });
    setDropoffBox(null);
    setTimer(TIMER_DURATION);
    setWinner(null);
    setMessage("");
    setLevelCompleted(false);
    setGamestate("running");
    setRunning(true);
    setBombs([]); // clear hazards for new level
    setLasers([]);
    bombNextTimerRef.current = 0;
    laserNextTimerRef.current = 0;
    keyState.current = {};
    // Focus the panel ref after new level starts
    setTimeout(() => {
      if (panelRef.current) panelRef.current.focus();
    }, 100);
  }, [level]);

  // Auto-focus panel ref whenever entering running state after overlays
  useEffect(() => {
    if (gamestate === "running" && panelRef.current) {
      panelRef.current.focus();
    }
  }, [gamestate]);

  // Timer formatting
  const pad = (n) => String(n).padStart(2, "0");
  const timerStr = `${pad(Math.floor(timer / 60))}:${pad(timer % 60)}`;
  let timerColor = "#ffd57e";
  let timerBG = "var(--timer-bg)";
  if (timer <= 10) {
    timerColor = "#ff4469";
    timerBG = "#37090fc2";
  } else if (timer <= 20) {
    timerColor = "#ff9800";
    timerBG = "#422314bb";
  }

  let flagStatus = "Safe";
  if (flag.heldBy === "player") flagStatus = "You";
  let dropoffStatus = "";
  if (flag.heldBy === "player" && dropoffBox) {
    dropoffStatus = "Bring the flag to the drop-off box!";
  } else if (message) {
    dropoffStatus = message;
  }
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
      {/* Scoreboard */}
      <section>
        <div>
          Score:{" "}
          <span
            style={{ color: "var(--primary)", textShadow: "0 2px 8px #64baff88" }}
          >
            {player.score}
          </span>
        </div>
        <div>
          Opponent:{" "}
          <span
            style={{
              color: "var(--secondary)",
              textShadow: "0 2px 9px #36ff8967",
            }}
          >
            {oppScore}
          </span>
        </div>
        <div>
          Timer:{" "}
          <span
            style={{
              color: timerColor,
              background: timerBG,
              boxShadow:
                timer <= 10
                  ? "0 4px 14px 3px #ff445a38"
                  : "0 1.5px 10px 2px #ffb02127",
              borderRadius: "7.5px",
              padding: "4.5px 18px",
              fontFamily: "'Orbitron', 'Exo', monospace",
              letterSpacing: "0.08em",
              fontWeight: 800,
              fontSize: "1.19em",
              border:
                timer <= 10
                  ? "2.3px solid #ff4469"
                  : "1.3px solid var(--panel-outline)",
              transition: "background 0.2s, color 0.2s, border 0.15s",
            }}
          >
            {timerStr}
          </span>
        </div>
        <div>
          Flag:{" "}
          <span
            style={{
              color: "#ffd37d",
              filter: "drop-shadow(0 0 4px #ffb02193)",
            }}
          >
            {flagStatus}
          </span>
        </div>
      </section>
      {dropoffStatus && <div className="game-message">{dropoffStatus}</div>}

      <main>
        {/* Main Game Area */}
        <div
          className="game-canvas-panel"
          tabIndex={0}
          aria-label="Game Area"
          ref={panelRef}
          onFocus={e => {
            // Optionally, visually indicate focus
          }}
          style={{
            width: Math.max(440, CANVAS_W + 40),
            height: Math.max(320, CANVAS_H + 48),
            maxWidth: "99vw",
            maxHeight: "99vh",
            outline: gamestate === "running" ? "2.5px solid var(--accent)" : "none"
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
              marginTop: "20px",
            }}
            aria-label="Game Canvas"
          />
          {/* Overlays */}
          {(gamestate === "over" || winner) && (
            <div
              className={`game-overlay-panel ${
                winner === "player" ? "victory" : "defeat"
              }`}
              tabIndex={0}
            >
              <h2>
                {timer === 0
                  ? "Time's Up!"
                  : winner === "player"
                  ? "You Win! 🎉"
                  : winner === "bot"
                  ? "Bots Win! 🤖"
                  : "Game Over"}
              </h2>
              <div className="desc">
                {timer === 0 ? (
                  <>
                    Time's up!
                    <br />
                    Your score: <strong>{player.score}</strong>
                  </>
                ) : message ||
                  (winner === "player"
                    ? "Legendary moves! Next time, try with more bots!"
                    : winner === "bot"
                    ? "Bots outsmarted you this round!"
                    : "Try again!")}
              </div>
              <button
                className="game-btn continue-btn"
                onClick={() => handleRestart(false)}
                tabIndex={0}
                aria-label="Restart Game"
              >
                Restart
              </button>
            </div>
          )}
          {/* Level Complete Overlay */}
          {levelCompleted && (
            <div
              className="game-overlay-panel victory"
              tabIndex={0}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <h2 style={{ marginBottom: "11px" }}>
                Level {level} Complete!
              </h2>
              <div className="desc" style={{ marginBottom: "24px" }}>
                Congratulations! Continue to next level.
              </div>
              <button
                className="game-btn continue-btn"
                onClick={handleContinueLevel}
                tabIndex={0}
                aria-label="Continue to Next Level"
              >
                Continue
              </button>
            </div>
          )}
        </div>
        {/* Control Buttons */}
        <div
          style={{
            display: "flex",
            gap: "2.1rem",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: ".7rem",
          }}
        >
          <button
            className="game-btn"
            tabIndex={0}
            onClick={handleStart}
            disabled={gamestate === "running" || levelCompleted}
            aria-label="Start Game"
          >
            {gamestate === "ready" || gamestate === "paused"
              ? "Start"
              : "Resume"}
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
          Earn 3 points to clear the level. Levels get harder!<br />
          <span
            style={{
              color: "#ff9800",
              fontWeight: 700,
              letterSpacing: ".06em",
            }}
          >
            Score as many points as you can in 90 seconds!
          </span>
        </div>
        <div className="level-panel">
          Level: {level} &nbsp;|&nbsp; Bots: {numBots} &nbsp;|&nbsp; Obstacles:{" "}
          {obstacles.length}
        </div>
      </main>
    </div>
  );
}

export default App;
