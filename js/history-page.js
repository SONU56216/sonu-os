/* ============================================================
   SONU OS — history-page.js
   ============================================================ */

import { requireAuth, wireShellActions } from "./auth.js";
import { bootstrapShell } from "./app.js";
import { $, toLocalDateKey, formatDateLong } from "./utils.js";
import {
  buildMonthGrid, renderDayDetail, shiftMonth, formatMonthLabel,
} from "./history.js";
import { monthRange } from "./analytics.js";
import { watchTasksRange } from "./tasks.js";
import { watchUserProfile } from "./user.js";
import { db } from "./firebase.js";
import {
  collection, query, where, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

bootstrapShell({ activeNav: "history" });
wireShellActions();

const user = await requireAuth();
const uid = user.uid;

const preselected = sessionStorage.getItem("sonuos.history.selected");
const state = {
  month: preselected && /^\d{4}-\d{2}-\d{2}$/.test(preselected)
    ? preselected.slice(0, 7)
    : toLocalDateKey().slice(0, 7),
  selected: preselected && /^\d{4}-\d{2}-\d{2}$/.test(preselected)
    ? preselected
    : toLocalDateKey(),
  tasksByDate: new Map(),
  summaries: new Map(),
  weekStart: 1,
  unsubTasks: null,
  unsubRecords: null,
  unsubUser: null,
};
if (preselected) sessionStorage.removeItem("sonuos.history.selected");

state.unsubUser = watchUserProfile(uid, (u) => {
  state.weekStart = u?.weekStart ?? 1;
  render();
});

function loadMonth() {
  const { from, to } = monthRange(state.month);

  if (state.unsubTasks) state.unsubTasks();
  if (state.unsubRecords) state.unsubRecords();

  state.tasksByDate = new Map();
  state.summaries = new Map();

  state.unsubTasks = watchTasksRange(uid, from, to, (tasks) => {
    state.tasksByDate = new Map();
    for (const t of tasks) {
      if (!state.tasksByDate.has(t.date)) state.tasksByDate.set(t.date, []);
      state.tasksByDate.get(t.date).push(t);
    }
    render();
  });

  const q = query(
    collection(db, "users", uid, "dailyRecords"),
    where("date", ">=", from), where("date", "<=", to),
  );
  state.unsubRecords = onSnapshot(q, (snap) => {
    state.summaries = new Map();
    snap.forEach((d) => {
      const rec = d.data();
      if (rec?.date) state.summaries.set(rec.date, rec);
    });
    render();
  });
}

loadMonth();

function render() {
  $("#monthLabel").textContent = formatMonthLabel(state.month);

  const grid = buildMonthGrid(
    state.month,
    state.summaries,
    (dateKey) => { state.selected = dateKey; render(); },
    state.weekStart,
  );
  const calWrap = $("#cal");
  calWrap.replaceChildren(...grid.childNodes);

  const sel = state.selected;
  $("#detailTitle").textContent = formatDateLong(sel);
  const sum = state.summaries.get(sel) || null;
  $("#detailHint").textContent = sum && sum.totalPlannedTaskCount
    ? `${sum.completionPercentage}% complete`
    : (state.tasksByDate.get(sel)?.length ? "" : "No records");

  const detailWrap = $("#detailBody");
  detailWrap.replaceChildren(
    renderDayDetail(sel, state.tasksByDate.get(sel) || [], sum),
  );
}

$("#prevMonthBtn").addEventListener("click", () => {
  state.month = shiftMonth(state.month, -1);
  loadMonth();
});
$("#nextMonthBtn").addEventListener("click", () => {
  state.month = shiftMonth(state.month, +1);
  loadMonth();
});

window.addEventListener("beforeunload", () => {
  for (const u of [state.unsubTasks, state.unsubRecords, state.unsubUser]) {
    try { u && u(); } catch {}
  }
});