import React from "react";
import "./App.css";

// PUBLIC_INTERFACE
function App() {
  /** 
   * Main App component for FlagQuest minimal UI layout.
   * Includes: Header, status/scorebar, central game area placeholder, and control buttons 
   * Following a minimalistic, light-themed design.
   */
  return (
    <div className="App">
      <header>
        <h1 style={{
          margin: 0,
          padding: "1.5rem 0",
          fontSize: "2.2rem",
          letterSpacing: "0.018em",
          color: "var(--primary)",
          background: "var(--bg-secondary)"
        }}>
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
          padding: "1rem 0"
        }}
      >
        <div style={{ fontWeight: 500 }}>
          Score: <span style={{ color: "var(--primary)", fontWeight: 700 }}>0</span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Opponent: <span style={{ color: "var(--secondary)", fontWeight: 700 }}>0</span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Timer: <span style={{ color: "var(--accent)", fontWeight: 700 }}>00:00</span>
        </div>
        <div style={{ fontWeight: 500 }}>
          Flag: <span style={{ color: "var(--secondary)", fontWeight: 700 }}>Safe</span>
        </div>
      </section>

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "2.5rem",
          marginBottom: "2.5rem",
        }}
      >
        {/* Central Game Area Placeholder */}
        <div
          style={{
            width: "420px",
            height: "300px",
            background: "var(--bg-secondary)",
            border: "2.5px solid var(--border-color)",
            borderRadius: "18px",
            boxShadow: "0 5px 16px 2px #e9ecef55",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "2.3rem",
            maxWidth: "95vw"
          }}
          tabIndex={0}
          aria-label="Game Area"
        >
          <span style={{
            color: "var(--border-color)",
            fontSize: "1.16rem",
            fontWeight: 500
          }}>[ Game Area ]</span>
        </div>
        {/* Control Buttons */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem"
          }}
        >
          <button className="game-btn" tabIndex={0}>Start</button>
          <button className="game-btn" tabIndex={0}>Pause</button>
          <button className="game-btn" tabIndex={0}>Restart</button>
        </div>
      </main>
    </div>
  );
}

export default App;
