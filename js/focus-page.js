/* ============================================================
   SONU OS — focus-page.js
   ============================================================ */

import { requireAuth, wireShellActions } from "./auth.js";
import { bootstrapShell } from "./app.js";
import { toast, confirmDialog, openModal } from "./ui.js";
import { el, toLocalDateKey, formatDuration } from "./utils.js";
import { FocusTimer, persistSession, loadPersistedSession, clearPersistedSession } from "./focus-timer.js";
import {
  recordFocusSession, listRecentFocusSessions, watchTasksForDate,
} from "./tasks.js";
import { watchUserProfile } from "./user.js";

bootstrapShell({ activeNav: "focus" });
wireShellActions();

const user = await requireAuth();
const uid = user.uid;

const today = toLocalDateKey();
let tasksToday = [];

let durations = { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 };
watchUserProfile(uid, (u) => {
  if (u?.focusDurations) {
    durations = { ...durations, ...u.focusDurations };
    timer.setDurations(durations);
  }
});

const timer = new FocusTimer(durations);

const taskSelect = document.getElementById("taskSelect");
watchTasksForDate(uid, today, (tasks) => {
  tasksToday = tasks;
  const current = taskSelect.value;
  taskSelect.replaceChildren(el("option", { value: "", text: "— none —" }));
  for (const t of tasks) {
    taskSelect.append(el("option", { value: t.id, text: `${t.startTime} ${t.title}` }));
  }
  if ([...taskSelect.options].some((o) => o.value === current)) taskSelect.value = current;
});

const RING_CIRCUMFERENCE = 2 * Math.PI * 98;

function updateRing() {
  const remaining = timer.remainingMs;
  const total = timer.totalMs || 1;
  const frac = remaining / total;
  const ring = document.getElementById("ringProgress");
  if (ring) {
    ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - frac));
  }
  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  const mmss = document.getElementById("mmss");
  if (mmss) mmss.textContent = `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  const label = document.getElementById("modeLabel");
  if (label) label.textContent = labelFor(timer.mode);
}

function labelFor(mode) {
  return mode === "focus" ? "Focus"
       : mode === "shortBreak" ? "Short break"
       : "Long break";
}

timer.on("tick", updateRing);
timer.on("mode", () => { updateRing(); persistSnapshot(); });
timer.on("state", () => { updateRing(); persistSnapshot(); });

function persistSnapshot() {
  if (timer.running) {
    persistSession({
      mode: timer.mode,
      remainingMs: timer.remainingMs,
      totalMs: timer.totalMs,
      startedAt: timer.startedAt?.getTime() || Date.now(),
      taskId: taskSelect.value || null,
      savedAt: Date.now(),
    });
  } else {
    clearPersistedSession();
  }
}
setInterval(() => { if (timer.running) persistSnapshot(); }, 5_000);

(async function maybeResume() {
  const snap = loadPersistedSession();
  if (!snap || !snap.savedAt) return;
  if (Date.now() - snap.savedAt > 6 * 60 * 60 * 1000) { clearPersistedSession(); return; }

  const ok = await new Promise((resolve) => {
    openModal({
      title: "Resume focus session?",
      body: `You have an unfinished ${labelFor(snap.mode).toLowerCase()} session from ` +
            `${new Date(snap.savedAt).toLocaleTimeString()}.`,
      actions: [
        { label: "Discard", class: "btn-ghost", onClick: () => resolve(false) },
        { label: "Resume", class: "btn-primary", onClick: () => resolve(true) },
      ],
    });
  });
  if (!ok) { clearPersistedSession(); return; }

  timer.setMode(snap.mode, { silent: true });
  timer.remainingMs = snap.remainingMs;
  timer.totalMs = snap.totalMs;
  timer.startedAt = new Date(snap.startedAt);
  if (snap.taskId) taskSelect.value = snap.taskId;
  updateRing();
  timer.start();
})();

timer.on("complete", async (payload) => {
  clearPersistedSession();
  try {
    await recordFocusSession(uid, {
      taskId: taskSelect.value || null,
      mode: payload.mode,
      plannedMinutes: payload.plannedMinutes,
      actualMinutes: payload.actualMinutes,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      completed: true,
    });
    toast(payload.mode === "focus" ? "Focus session complete" : "Break complete",
          `${payload.actualMinutes} min recorded.`,
          payload.mode === "focus" ? "success" : "");
    if (payload.mode !== "focus") await refreshFocusPanel();
  } catch (err) {
    toast("Could not record session", err.message, "error");
  }
});

document.getElementById("startBtn").addEventListener("click", () => timer.start());
document.getElementById("pauseBtn").addEventListener("click", () => timer.pause());
document.getElementById("resetBtn").addEventListener("click", () => {
  confirmDialog("Reset timer?", "The current session will be discarded.", "Reset")
    .then((ok) => { if (ok) { timer.reset(); clearPersistedSession(); } });
});

async function refreshFocusPanel() {
  const sessions = await listRecentFocusSessions(uid, 20);
  const todayKey = toLocalDateKey();

  const todaySessions = sessions.filter((s) => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
    return toLocalDateKey(d) === todayKey && s.mode === "focus";
  });

  const total = todaySessions.reduce((s, x) => s + (x.actualMinutes || 0), 0);
  document.getElementById("focusToday").textContent = formatDuration(total);
  document.getElementById("sessionsToday").textContent = String(todaySessions.length);

  const feed = document.getElementById("sessionsFeed");
  feed.replaceChildren();
  if (!sessions.length) {
    feed.append(el("div", { class: "empty" }, el("p", { text: "No focus sessions recorded yet." })));
    return;
  }
  for (const s of sessions.slice(0, 10)) {
    const when = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt || Date.now());
    feed.append(el("div", { class: `feed-item ${s.mode === "focus" ? "green" : ""}` },
      el("div", { class: "ico", text: s.mode === "focus" ? "◎" : "☕" }),
      el("div", {},
        el("div", { text: `${s.mode === "focus" ? "Focus" : "Break"} · ${s.actualMinutes} min` }),
        el("div", { class: "dim", style: "font-size:12px;", text: s.taskId ? "Attached to task" : "No task attached" }),
      ),
      el("div", { class: "when", text: when.toLocaleTimeString() }),
    ));
  }
}
refreshFocusPanel();
setInterval(refreshFocusPanel, 60_000);

updateRing();