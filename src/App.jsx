import { useState, useEffect, useRef, useCallback } from "react";
import { version } from "../package.json";

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MODES = {
  work:  { label: "Focus time",  duration: 25 * 60, color: "#e8533c" },
  short: { label: "Short break", duration:  5 * 60, color: "#3cb8a8" },
  long:  { label: "Long break",  duration: 15 * 60, color: "#6b7cde" },
};
const SESSIONS_BEFORE_LONG = 4;
const CIRCUMFERENCE = 2 * Math.PI * 90;
const STORAGE_KEY = "pomodoro-history";
const WEEKS_SHOWN = 18;

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmt = (s) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

const toDateKey = (ts) => new Date(ts).toISOString().slice(0, 10);
const today = () => toDateKey(Date.now());

// ── LOCALSTORAGE HELPERS ──────────────────────────────────────────────────────
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { history: {}, log: [] };
    return JSON.parse(raw);
  } catch (_) {
    return { history: {}, log: [] };
  }
}

function saveToStorage(history, log) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ history, log }));
  } catch (_) {}
}

// ── HEATMAP ───────────────────────────────────────────────────────────────────
function buildGrid(history) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - WEEKS_SHOWN * 7 + 1);
  start.setHours(0, 0, 0, 0);

  const startDow = start.getDay();
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);

  const cursor = new Date(start);
  while (cursor <= end) {
    const key = toDateKey(cursor.getTime());
    days.push({ key, count: history[key] || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = ["S","M","T","W","T","F","S"];
const CELL = 13, GAP = 3;

function getMonthLabels(weeks) {
  const labels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const first = week.find(d => d !== null);
    if (!first) return;
    const m = new Date(first.key + "T12:00:00").getMonth();
    if (m !== lastMonth) { labels.push({ wi, label: MONTH_LABELS[m] }); lastMonth = m; }
  });
  return labels;
}

function Heatmap({ history }) {
  const weeks = buildGrid(history);
  const monthLabels = getMonthLabels(weeks);
  const maxCount = Math.max(1, ...Object.values(history));

  const cellColor = (count) => {
    if (!count) return "#1e1e1e";
    const t = Math.min(count / Math.max(4, maxCount), 1);
    const l = Math.round(20 + t * 50);
    return `hsl(10, 72%, ${l}%)`;
  };

  const gridW = weeks.length * (CELL + GAP) - GAP;
  const gridH = 7 * (CELL + GAP) - GAP;

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <svg width={gridW + 28} height={gridH + 22} style={{ display: "block", minWidth: gridW + 28 }}>
        {monthLabels.map(({ wi, label }) => (
          <text key={wi} x={28 + wi * (CELL + GAP)} y={11}
            fill="#555" fontSize={9} fontFamily="DM Mono, monospace">{label}</text>
        ))}
        {[1, 3, 5].map(d => (
          <text key={d} x={0} y={22 + d * (CELL + GAP) + CELL * 0.75}
            fill="#444" fontSize={8} fontFamily="DM Mono, monospace">{DAY_LABELS[d]}</text>
        ))}
        {weeks.map((week, wi) =>
          week.map((day, di) => {
            if (!day) return null;
            const isToday = day.key === today();
            return (
              <rect key={day.key}
                x={28 + wi * (CELL + GAP)} y={16 + di * (CELL + GAP)}
                width={CELL} height={CELL} rx={3} ry={3}
                fill={cellColor(day.count)}
                stroke={isToday ? "#e8533c" : "none"}
                strokeWidth={isToday ? 1.5 : 0}
                opacity={day.count === 0 ? 0.5 : 1}
              >
                <title>{day.key}: {day.count} session{day.count !== 1 ? "s" : ""}</title>
              </rect>
            );
          })
        )}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, paddingLeft: 28 }}>
        <span style={{ fontSize: 9, color: "#444", fontFamily: "DM Mono,monospace", marginRight: 2 }}>Less</span>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            width: CELL, height: CELL, borderRadius: 3,
            background: i === 0 ? "#1e1e1e" : `hsl(10,72%,${20 + i * 14}%)`,
            opacity: i === 0 ? 0.5 : 1,
          }} />
        ))}
        <span style={{ fontSize: 9, color: "#444", fontFamily: "DM Mono,monospace", marginLeft: 2 }}>More</span>
      </div>
    </div>
  );
}

// ── RECENT LOG ────────────────────────────────────────────────────────────────
function RecentLog({ log }) {
  if (!log.length) return (
    <p style={{ fontSize: "0.7rem", color: "#444", fontFamily: "DM Mono,monospace", textAlign: "center", padding: "12px 0" }}>
      No sessions yet — complete a focus session to start your history.
    </p>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
      {[...log].reverse().slice(0, 30).map((entry, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", background: "#111", borderRadius: 8, border: "1px solid #222",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: entry.mode === "work" ? "#e8533c" : entry.mode === "short" ? "#3cb8a8" : "#6b7cde",
            }} />
            <span style={{ fontSize: "0.68rem", color: "#aaa", fontFamily: "DM Mono,monospace" }}>
              {entry.mode === "work" ? "Focus" : entry.mode === "short" ? "Short break" : "Long break"}
            </span>
          </div>
          <span style={{ fontSize: "0.65rem", color: "#555", fontFamily: "DM Mono,monospace" }}>
            {new Date(entry.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── TOGGLE ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled, accent }) {
  return (
    <div onClick={() => !disabled && onChange(!checked)} style={{
      width: 46, height: 27, borderRadius: 999, flexShrink: 0,
      cursor: disabled ? "not-allowed" : "pointer",
      background: checked ? accent : "#2a2a2a",
      position: "relative", transition: "background 0.25s",
      opacity: disabled ? 0.35 : 1,
    }}>
      <div style={{
        position: "absolute", top: 3, left: checked ? 22 : 3,
        width: 21, height: 21, borderRadius: "50%",
        background: checked ? "#fff" : "#666",
        transition: "left 0.22s cubic-bezier(.4,0,.2,1), background 0.22s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
      }} />
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState("work");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [totalFocusSecs, setTotalFocusSecs] = useState(0);
  const [wlEnabled, setWlEnabled] = useState(false);
  const [wlActive, setWlActive] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState({});
  const [log, setLog] = useState([]);
  const [tick, setTick] = useState(0);

  const startEpochRef = useRef(null);
  const elapsedRef    = useRef(0);
  const modeRef       = useRef("work");
  const runningRef    = useRef(false);
  const sessRef       = useRef(0);
  const focusRef      = useRef(0);
  const wlRef         = useRef(null);
  const wlEnabledRef  = useRef(false);
  const intervalRef   = useRef(null);
  const historyRef    = useRef({});
  const logRef        = useRef([]);

  modeRef.current    = mode;
  runningRef.current = running;
  elapsedRef.current = elapsed;
  wlEnabledRef.current = wlEnabled;
  historyRef.current = history;
  logRef.current     = log;

  const accent = MODES[mode].color;

  // ── LOAD from localStorage on mount ───────────────────────────────────────
 useEffect(() => {
  const data = loadFromStorage();
  setHistory(data.history);
  setLog(data.log);
  historyRef.current = data.history;
  logRef.current = data.log;

  // Restore today's session count from history
  const todayCount = data.history[today()] || 0;
  setSessionsToday(todayCount);
  sessRef.current = todayCount;

  // Restore total focus time from today's log entries
  const todayFocusSecs = data.log.filter(
    e => e.mode === "work" && toDateKey(e.ts) === today()
  ).length * MODES.work.duration;
  setTotalFocusSecs(todayFocusSecs);
  focusRef.current = todayFocusSecs;
}, []);

  // ── WAKE LOCK ─────────────────────────────────────────────────────────────
  const wlSupported = "wakeLock" in navigator;

  const acquireWL = useCallback(async () => {
    if (!wlSupported || wlRef.current) return;
    try {
      wlRef.current = await navigator.wakeLock.request("screen");
      wlRef.current.addEventListener("release", () => { wlRef.current = null; setWlActive(false); });
      setWlActive(true);
    } catch (_) { setWlActive(false); }
  }, [wlSupported]);

  const releaseWL = useCallback(async () => {
    if (wlRef.current) { await wlRef.current.release(); wlRef.current = null; }
    setWlActive(false);
  }, []);

  useEffect(() => {
    const handler = async () => {
      if (document.visibilityState === "visible") {
        if (runningRef.current && wlEnabledRef.current && !wlRef.current) await acquireWL();
        if (runningRef.current) setTick(t => t + 1);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [acquireWL]);

  // ── TIMER ─────────────────────────────────────────────────────────────────
  const secondsLeft = useCallback(() => {
    const total = MODES[modeRef.current].duration;
    if (!runningRef.current) return total - elapsedRef.current;
    const nowEl = elapsedRef.current + Math.floor((Date.now() - startEpochRef.current) / 1000);
    return Math.max(0, total - nowEl);
  }, []);

  // ── FINISH SESSION ────────────────────────────────────────────────────────
  const finishSession = useCallback(async () => {
    clearInterval(intervalRef.current);
    runningRef.current = false;
    setRunning(false);
    elapsedRef.current = 0;
    setElapsed(0);

    const finishedMode = modeRef.current;

    if (finishedMode === "work") {
      sessRef.current += 1;
      setSessionsToday(s => s + 1);
      focusRef.current += MODES.work.duration;
      setTotalFocusSecs(f => f + MODES.work.duration);

      const key = today();
      const newHistory = { ...historyRef.current, [key]: (historyRef.current[key] || 0) + 1 };
      const newLog = [...logRef.current, { ts: Date.now(), mode: "work" }];
      setHistory(newHistory);
      setLog(newLog);
      historyRef.current = newHistory;
      logRef.current = newLog;
      saveToStorage(newHistory, newLog);
    } else {
      const newLog = [...logRef.current, { ts: Date.now(), mode: finishedMode }];
      setLog(newLog);
      logRef.current = newLog;
      saveToStorage(historyRef.current, newLog);
    }

    await releaseWL();

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(
        finishedMode === "work" ? "🍅 Focus done! Take a break." : "⏰ Break over. Back to focus!",
        { icon: "🍅" }
      );
    }

    const next = finishedMode === "work"
      ? (sessRef.current % SESSIONS_BEFORE_LONG === 0 ? "long" : "short")
      : "work";
    modeRef.current = next;
    setMode(next);
    setTick(t => t + 1);
  }, [releaseWL]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setTick(t => t + 1);
      if (secondsLeft() <= 0) finishSession();
    }, 500);
    return () => clearInterval(intervalRef.current);
  }, [running, finishSession, secondsLeft]);

  // derived display
  const left = secondsLeft();
  const frac = left / MODES[mode].duration;
  const dashOffset = ((1 - frac) * CIRCUMFERENCE).toFixed(2);

  // ── CONTROLS ──────────────────────────────────────────────────────────────
  const handleStartPause = async () => {
    if (running) {
      elapsedRef.current += Math.floor((Date.now() - startEpochRef.current) / 1000);
      setElapsed(elapsedRef.current);
      runningRef.current = false;
      setRunning(false);
      clearInterval(intervalRef.current);
      await releaseWL();
    } else {
      startEpochRef.current = Date.now();
      runningRef.current = true;
      setRunning(true);
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
      if (wlEnabledRef.current) await acquireWL();
    }
  };

  const handleReset = async () => {
    clearInterval(intervalRef.current);
    runningRef.current = false; elapsedRef.current = 0;
    setRunning(false); setElapsed(0);
    await releaseWL();
    setTick(t => t + 1);
  };

  const handleSkip = async () => {
    clearInterval(intervalRef.current);
    runningRef.current = false; elapsedRef.current = 0;
    setRunning(false); setElapsed(0);
    await releaseWL();
    const next = mode === "work"
      ? (sessRef.current % SESSIONS_BEFORE_LONG === 0 ? "long" : "short")
      : "work";
    modeRef.current = next; setMode(next);
    setTick(t => t + 1);
  };

  const handleModeSwitch = async (m) => {
    clearInterval(intervalRef.current);
    runningRef.current = false; elapsedRef.current = 0;
    setRunning(false); setElapsed(0);
    await releaseWL();
    modeRef.current = m; setMode(m);
    setTick(t => t + 1);
  };

  const handleWlToggle = async (val) => {
    setWlEnabled(val); wlEnabledRef.current = val;
    if (val && running) await acquireWL();
    else if (!val) await releaseWL();
  };

  // dots
  const dots = Array.from({ length: SESSIONS_BEFORE_LONG }, (_, i) => i < (sessRef.current % SESSIONS_BEFORE_LONG));

  // stats
  const focusMins = Math.round(totalFocusSecs / 60);
  const focusLabel = focusMins >= 60 ? `${(focusMins / 60).toFixed(1)}h` : `${focusMins}m`;
  const totalSessions = Object.values(history).reduce((a, b) => a + b, 0);

  // wl badge
  const wlBadge = !wlSupported ? "N/A" : !wlEnabled ? "Off" : wlActive ? "Active" : "Standby";
  const wlSub = !wlSupported ? "Not supported in this browser"
    : !wlEnabled ? "Prevents the screen from locking while the timer runs"
    : wlActive ? "Screen will stay on while the timer is running"
    : running ? "Acquiring lock…" : "Will activate when the timer starts";

  // ── STYLES ────────────────────────────────────────────────────────────────
  const S = {
    app: {
      fontFamily: "'DM Mono', monospace",
      background: "#0d0d0d", color: "#f0ede8",
      minHeight: "100vh", display: "flex", justifyContent: "center",
      padding: "24px 16px",
    },
    inner: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 20 },
    card: {
      background: "#161616", border: "1px solid #2a2a2a", borderRadius: 16,
      padding: "40px 32px 36px", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 28, position: "relative", overflow: "hidden",
    },
    cardGlow: {
      position: "absolute", inset: 0, pointerEvents: "none",
      background: `radial-gradient(ellipse at 50% 0%, ${accent}14 0%, transparent 70%)`,
      transition: "background 0.4s",
    },
    tabs: {
      display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6,
      background: "#161616", border: "1px solid #2a2a2a", borderRadius: 16, padding: 6,
    },
    tabBtn: (m) => ({
      padding: "10px 6px", border: "none", borderRadius: 12, cursor: "pointer",
      fontFamily: "'DM Mono',monospace", fontSize: "0.7rem", letterSpacing: "0.05em",
      textTransform: "uppercase", transition: "all 0.2s",
      background: mode === m ? accent : "transparent",
      color: mode === m ? "#fff" : "#666",
      fontWeight: mode === m ? 500 : 400,
    }),
    btnPrimary: {
      background: accent, color: "#fff", border: "none", borderRadius: 12, cursor: "pointer",
      fontFamily: "'DM Mono',monospace", fontSize: "0.85rem", fontWeight: 500,
      letterSpacing: "0.08em", textTransform: "uppercase", padding: "14px 40px", minWidth: 140,
      boxShadow: `0 4px 20px ${accent}4d`, transition: "all 0.15s",
    },
    btnIcon: {
      background: "#2a2a2a", color: "#666", border: "none", borderRadius: 12, cursor: "pointer",
      width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    },
    statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    statBox: { background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px" },
    statLabel: { fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#666", marginBottom: 4 },
    statValue: { fontFamily: "'DM Mono',monospace", fontSize: "1.4rem", fontWeight: 700, color: "#f0ede8" },
    wlRow: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "#161616", borderRadius: 16, padding: "14px 18px", gap: 12,
      border: `1px solid ${wlEnabled && wlActive ? accent + "66" : "#2a2a2a"}`,
      transition: "border-color 0.3s",
    },
    badge: (on) => ({
      fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "2px 7px", borderRadius: 4, fontWeight: 500,
      background: on ? accent + "38" : "#2a2a2a",
      color: on ? accent : "#666", transition: "all 0.3s",
    }),
    warning: {
      background: "#1a150a", border: "1px solid #3a2a0a", borderRadius: 12,
      padding: "12px 16px", fontSize: "0.72rem", color: "#c9a23d", lineHeight: 1.6,
    },
    histCard: { background: "#161616", border: "1px solid #2a2a2a", borderRadius: 16, overflow: "hidden" },
    histHeader: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 18px", cursor: "pointer", userSelect: "none",
    },
  };

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <div style={S.inner}>

        {/* Header */}
        <header style={{ textAlign: "center" }}>
          <h1 style={{ fontFamily: "'DM Mono',monospace", fontSize: "clamp(1.6rem,5vw,2rem)", fontWeight: 800, letterSpacing: "-0.02em" }}>
            Pomodoro
          </h1>
          <div style={{ fontSize: "0.6rem", color: "#333", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
            v{version}
          </div>
        </header>

        {/* Mode tabs */}
        <div style={S.tabs}>
          {Object.keys(MODES).map(m => (
            <button key={m} style={S.tabBtn(m)} onClick={() => handleModeSwitch(m)}>
              {m === "work" ? "Focus" : m === "short" ? "Short Break" : "Long Break"}
            </button>
          ))}
        </div>

        {/* Clock card */}
        <div style={S.card}>
          <div style={S.cardGlow} />
          <div style={{ position: "relative", width: 200, height: 200, zIndex: 1 }}>
            <svg viewBox="0 0 200 200" width="200" height="200"
              style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
              <circle cx="100" cy="100" r="90" fill="none" stroke="#2a2a2a" strokeWidth="6" />
              <circle cx="100" cy="100" r="90" fill="none"
                stroke={accent} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.4s", filter: `drop-shadow(0 0 8px ${accent})` }}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "2.6rem", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1 }}>
                {fmt(left)}
              </div>
              <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#666" }}>
                {MODES[mode].label}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", zIndex: 1 }}>
            <button style={S.btnIcon} onClick={handleReset} title="Reset">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.1" />
              </svg>
            </button>
            <button style={S.btnPrimary} onClick={handleStartPause}>
              {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
            </button>
            <button style={S.btnIcon} onClick={handleSkip} title="Skip">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>
          </div>

          {/* Session dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", color: "#666", letterSpacing: "0.06em", textTransform: "uppercase", zIndex: 1 }}>
            <span>Sessions</span>
            <div style={{ display: "flex", gap: 5 }}>
              {dots.map((done, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: done ? accent : "#2a2a2a", transition: "background 0.3s" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={S.statsRow}>
          <div style={S.statBox}>
            <div style={S.statLabel}>Today</div>
            <div style={S.statValue}>{sessionsToday}</div>
          </div>
          <div style={S.statBox}>
            <div style={S.statLabel}>Focus time</div>
            <div style={S.statValue}>{focusLabel}</div>
          </div>
        </div>

        {/* Wake lock */}
        <div style={S.wlRow}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <div style={{ fontSize: "0.75rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "#f0ede8", display: "flex", alignItems: "center", gap: 7 }}>
              ☀️ Keep screen on
              <span style={S.badge(wlEnabled && wlActive)}>{wlBadge}</span>
            </div>
            <div style={{ fontSize: "0.63rem", color: "#666", lineHeight: 1.4 }}>{wlSub}</div>
          </div>
          <Toggle checked={wlEnabled} onChange={handleWlToggle} disabled={!wlSupported} accent={accent} />
        </div>

        {/* Warning */}
        {running && !wlEnabled && (
          <div style={S.warning}>
            ⚠ Screen lock is <strong>enabled</strong> — the timer may pause if the screen locks. Turn on "Keep screen on" above to prevent this.
          </div>
        )}

        {/* History */}
        <div style={S.histCard}>
          <div style={S.histHeader} onClick={() => setShowHistory(h => !h)}>
            <div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: "0.9rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
                History
              </div>
              <div style={{ fontSize: "0.62rem", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
                {totalSessions} total session{totalSessions !== 1 ? "s" : ""}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round"
              style={{ transform: showHistory ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {showHistory && (
            <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ fontSize: "0.62rem", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  Focus sessions — last {WEEKS_SHOWN} weeks
                </div>
                <Heatmap history={history} />
              </div>
              <div style={{ height: 1, background: "#222" }} />
              <div>
                <div style={{ fontSize: "0.62rem", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  Recent sessions
                </div>
                <RecentLog log={log} />
              </div>
            </div>
          )}
        </div>

      </div>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>
    </div>
  );
}
