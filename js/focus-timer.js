/* ============================================================
   SONU OS — focus-timer.js
   Pure timer engine.
   ============================================================ */

export class FocusTimer {
  constructor(durations = { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 }) {
    this.durations = { ...durations };
    this.mode = "focus";
    this.running = false;
    this.remainingMs = this.durations.focus * 60_000;
    this.totalMs = this.remainingMs;
    this.startedAt = null;
    this.tickHandle = null;
    this.completedFocusCount = 0;
    this.listeners = new Map();
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }
  _emit(event, payload) {
    for (const cb of this.listeners.get(event) || []) {
      try { cb(payload); } catch {}
    }
  }

  setDurations(d) {
    this.durations = { ...this.durations, ...d };
    if (!this.running) {
      this.remainingMs = this.durations[this.mode] * 60_000;
      this.totalMs = this.remainingMs;
      this._emit("state", this.snapshot());
    }
  }

  setMode(mode, { silent = false } = {}) {
    if (!["focus", "shortBreak", "longBreak"].includes(mode)) return;
    this.mode = mode;
    this.remainingMs = this.durations[mode] * 60_000;
    this.totalMs = this.remainingMs;
    if (!silent) this._emit("mode", { mode });
    this._emit("state", this.snapshot());
  }

  start() {
    if (this.running) return;
    if (this.remainingMs <= 0) this.remainingMs = this.durations[this.mode] * 60_000;
    this.running = true;
    this.startedAt = this.startedAt || new Date();
    const started = performance.now();
    const startRemaining = this.remainingMs;

    const loop = () => {
      if (!this.running) return;
      const elapsed = performance.now() - started;
      this.remainingMs = Math.max(0, startRemaining - elapsed);
      this._emit("tick", {
        remainingMs: this.remainingMs,
        totalMs: this.totalMs,
        mode: this.mode,
      });
      if (this.remainingMs <= 0) { this._finish(); return; }
      this.tickHandle = requestAnimationFrame(loop);
    };
    this.tickHandle = requestAnimationFrame(loop);
    this._emit("state", this.snapshot());
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    if (this.tickHandle) cancelAnimationFrame(this.tickHandle);
    this.tickHandle = null;
    this._emit("state", this.snapshot());
  }

  reset() {
    this.pause();
    this.startedAt = null;
    this.remainingMs = this.durations[this.mode] * 60_000;
    this.totalMs = this.remainingMs;
    this._emit("state", this.snapshot());
  }

  snapshot() {
    return { running: this.running, mode: this.mode, remainingMs: this.remainingMs, totalMs: this.totalMs };
  }

  _finish() {
    if (this.tickHandle) cancelAnimationFrame(this.tickHandle);
    this.tickHandle = null;
    this.running = false;

    const planned = this.durations[this.mode];
    const endedAt = new Date();
    const startedAt = this.startedAt || new Date(endedAt.getTime() - planned * 60_000);
    const actualMinutes = Math.round(planned);

    const payload = { mode: this.mode, plannedMinutes: planned, actualMinutes, startedAt, endedAt };
    this.startedAt = null;
    this.remainingMs = this.durations[this.mode] * 60_000;
    this.totalMs = this.remainingMs;

    if (this.mode === "focus") {
      this.completedFocusCount += 1;
      const next = (this.completedFocusCount % this.durations.longEvery === 0) ? "longBreak" : "shortBreak";
      this.setMode(next, { silent: true });
    } else {
      this.setMode("focus", { silent: true });
    }

    this._emit("complete", payload);
    this._emit("state", this.snapshot());
  }
}

/* ---------- Session-state persistence ---------- */

const SS_KEY = "sonuos.focus.session";

export function persistSession(snap) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify(snap)); } catch {}
}
export function loadPersistedSession() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearPersistedSession() {
  try { sessionStorage.removeItem(SS_KEY); } catch {}
}