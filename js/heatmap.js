/* ============================================================
   SONU OS — heatmap.js
   ============================================================ */

import { db } from "./firebase.js";
import {
  collection, getDocs, onSnapshot, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addDays, toLocalDateKey, el } from "./utils.js";

const WEEKDAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_LABELS   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export async function renderHeatmap(uid, container, opts = {}) {
  if (!container) return { refresh: () => {} };

  const today = toLocalDateKey();
  const start = addDays(today, -364);

  const startDow = new Date(start + "T00:00:00").getDay();
  const alignedStart = addDays(start, -startDow);

  container.replaceChildren();
  const cells = new Map();

  let cursor = alignedStart;
  const end = today;
  while (cursor <= end) {
    const isFuture = cursor > today;
    const cell = el("div", {
      class: "cell" + (isFuture ? " future" : (cursor === today ? " today" : "")),
      dataset: { date: cursor, level: "0" },
      tabindex: isFuture ? "-1" : "0",
      role: "gridcell",
      "aria-label": cursor,
    });
    if (!isFuture) {
      cell.addEventListener("click", () => opts.onDayClick?.(cursor));
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onDayClick?.(cursor); }
      });
    }
    cells.set(cursor, cell);
    container.append(cell);
    cursor = addDays(cursor, 1);
  }

  const records = await loadDailyRecords(uid, start, end);
  applyRecords(cells, records, today);

  const unsub = onSnapshot(
    collection(db, "users", uid, "dailyRecords"),
    (snap) => {
      const fresh = new Map();
      snap.forEach((d) => {
        const data = d.data();
        if (data?.date) fresh.set(data.date, data);
      });
      applyRecords(cells, fresh, today);
    },
    () => {},
  );

  return {
    refresh: async () => {
      const r = await loadDailyRecords(uid, start, end);
      applyRecords(cells, r, today);
    },
    destroy: () => { try { unsub(); } catch {} },
  };
}

async function loadDailyRecords(uid, fromDate, toDate) {
  const q = query(
    collection(db, "users", uid, "dailyRecords"),
    where("date", ">=", fromDate),
    where("date", "<=", toDate),
  );
  const snap = await getDocs(q);
  const map = new Map();
  snap.forEach((d) => {
    const data = d.data();
    if (data?.date) map.set(data.date, data);
  });
  return map;
}

function applyRecords(cells, records, today) {
  for (const [date, cell] of cells) {
    if (date > today) {
      cell.dataset.level = "0";
      cell.classList.add("future");
      continue;
    }
    const rec = records.get(date);
    const { level, missed } = classify(rec, date);
    cell.dataset.level = String(level);
    cell.classList.toggle("missed", missed);
    cell.setAttribute("aria-label", describe(date, rec));
    const existingTip = cell.querySelector("title");
    if (existingTip) existingTip.remove();
    cell.append(el("title", { text: describe(date, rec) }));
  }
}

function classify(rec, date) {
  if (!rec || !rec.totalPlannedTaskCount) return { level: 0, missed: false };
  const pct = rec.completionPercentage || 0;
  const done = rec.completedTaskCount || 0;
  if (done === 0) return { level: 0, missed: rec.totalPlannedTaskCount > 0 };
  if (pct <= 25) return { level: 1, missed: false };
  if (pct <= 50) return { level: 2, missed: false };
  if (pct <= 75) return { level: 3, missed: false };
  return { level: 4, missed: false };
}

function describe(dateKey, rec) {
  if (!rec || !rec.totalPlannedTaskCount) return `${dateKey}: no recorded activity`;
  const { completedTaskCount = 0, totalPlannedTaskCount = 0,
          completionPercentage = 0, totalFocusMinutes = 0 } = rec;
  return `${dateKey}: ${completedTaskCount}/${totalPlannedTaskCount} tasks (${completionPercentage}%) · ${totalFocusMinutes} min focused`;
}

export { WEEKDAY_LABELS, MONTH_LABELS };