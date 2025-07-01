# FlagQuest Frontend

## Cartoonish Sci-Fi Capture-the-Flag Game

This frontend implements a 2D capture-the-flag game with an emphasis on a **cartoonish, sci-fi visual style** featuring vibrant colors, soft shadows, and a polished, professional-quality UI. Assets and sound hooks are integrated with room for future custom art and SFX.

---

## Features

- **Cartoonish Sci-Fi Aesthetic:** Custom color palette, rounded shapes, soft drop shadows, and playful UI cues
- **2D Polished Graphics:** Canvas rendering with visual effects, outlines, and glow/shadow effects; placeholder game tokens for characters, bots, and flags
- **Dynamic Sound Effects:** Sound hooks for events (flag pickup/drop, scoring, collisions, game win/loss); future support for music and SFX via `/assets` folder
- **Responsive Layout:** Game canvas centered, flexible controls below, scoreboard and status above
- **Accessible Controls:** Start, Pause, Restart buttons remain prominent and themed
- **Easy Integration for Custom Assets:** Current release uses placeholder art (shapes/icons); easily swap in spritesheets, backgrounds, or effects. SFX hooks documented in `App.js` for direct sound API or library integration

---

## Getting Started

In the project directory, you can run:

```bash
npm start
```

Runs the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view the game.

---

## Style Guide

### Color Palette (sci-fi cartoon-inspired)

- **Primary:** #46cbf9 (neon blue/cyan)
- **Secondary:** #9bff4a (vivid sci-fi green)
- **Accent:** #ffd44d (electric yellow)
- **Bot Enemy:** #ff7bfa (magenta)
- **Background:** #23264d (deep purple/blue gradient)
- **Panels:** #303865 (polished bluish-grey)
- **Shadows/Glow:** rgba(70,203,249,0.35), rgba(155,255,74,0.18)

Defined and referenced via CSS variables in `src/App.css`

### Fonts, Borders, and Polish

- **Font:** `Poppins, Segoe UI, Arial, sans-serif` (rounded, friendly)
- **Border Radius:** All panels/buttons have `16px` or `50%` (circles)
- **Shadow:** Soft drop-shadows/glow on canvas and UI
- **Buttons:** Large, playful, colored; gentle press effect

### Sound Integration

- Sound effects triggered on significant events (button click, flag pickup/scoring, level up, game over)
- **SFX Placeholder:** Sound hooks present—integrate custom sounds into `/src/assets/` or as external URLs for future production polish
- To add: Replace or extend `playSound` utility and place actual files in `/src/assets/sfx/` (see notes in `App.js`)

---

## Directory Structure & Asset Notes

- `/src/App.js` – Main game, rendering, sound effect triggers (documented for integration)
- `/src/App.css` – Theme, cartoon sci-fi palette, shadows, sizing, font
- `/src/assets/` – Placeholder for future game images, SFX, and sprites
- **[Placeholder Art]**: Current pieces use stylized shapes. Add/replace with character/bot/flag/background illustrations for advanced polish.

---

## Customization & Theming

Edit `/src/App.css` to adjust:

- --sci-primary, --sci-secondary, --sci-accent
- --bg-sci, --panel, --shadow-sci
- Font-family, border-radius, shadow

---

## Sound Effects

To enable SFX, see the `playSound` and sound hook areas in `/src/App.js`. Integrate `.mp3`, `.wav`, or `.ogg` using modern browser APIs or a sound library such as `howler.js` if more power/control is needed.

---

## Roadmap

- Integrate custom art assets, icons, and backgrounds
- Add actual SFX/music for all gameplay triggers
- Optional: Polish game win/lose overlays with full-screen effects

---

For details, see source comments in `App.js` and style entries in `App.css`.

