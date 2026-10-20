/* ============================================================
   SONU OS — history.js
   Month calendar builder + day detail rendering.
   Pure DOM/data helpers; the page controller wires Firestore.
   ============================================================ */

import { el, toLocalDateKey, parseDateKey, formatDateLong,
         formatDuration, pct, durationMinutes } from "./utils.js";

const DOW_FULL = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/**
 * Build a month grid for a given "YYYY-MM" key.
 * `summaries` is a Map: "YYYY-MM-DD" -> daily summary object.
 * `onPick` is called with the clicked dateKey (null for filler cells).
 */
export function buildMonthGrid(monthKey, summaries, onPick, weekStart = 1) {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0).getDate();
  const startDowRaw = first.getDay();                // 0..6
  const lead = (startDowRaw - weekStart + 7) % 7;

  const cal = el("div", { class: "cal" });

  // Weekday headers, ordered from weekStart.
  for (let i = 0; i < 7; i++) {
    const dow = (weekStart + i) % 7;
    cal.append(el("div", { class: "dow", text: DOW_FULL[dow] }));
  }

  // Lead filler cells
  for (let i = 0; i < lead; i++) cal.append(el("div", { class: "day empty" }));

  const today = toLocalDateKey();
  for (let d = 1; d <= lastDay; d++) {
    const dateKey = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const sum = summaries.get(dateKey);
    const classes = ["day"];
    if (sum && sum.totalPlannedTaskCount) classes.push("has-data");
    if (dateKey === today) classes.push("today");

    const node = el("div", {
      class: classes.join(" "),
      role: "button",
      tabindex: "0",
      "aria-label": formatDateLong(dateKey),
      onclick: () => onPick(dateKey),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(dateKey); } },
    },
      el("div", { text: String(d) }),
      sum && sum.totalPlannedTaskCount
        ? el("div", { class: "pct", text: `${sum.completionPercentage}%` })
        : null,
    );
    cal.append(node);
  }

  // Trailing fillers so the grid is rectangular
  const used = lead + lastDay;
  const tail = (7 - (used % 7)) % 7;
  for (let i = 0; i < tail; i++) cal.append(el("div", { class: "day empty" }));

  return cal;
}

/** Build the day detail panel. `tasks` may be empty. */
export function renderDayDetail(dateKey, tasks, summary) {
  const wrap = el("div", {});

  // Header facts
  const facts = [
    ["Tasks completed", summary ? `${summary.completedTaskCount}/${summary.totalPlannedTaskCount}` : "0/0"],
    ["Completion", summary ? `${summary.completionPercentage}%` : "0%"],
    ["Focused time", formatDuration(summary?.totalFocusMinutes || 0)],
    ["Planned time", formatDuration((tasks || []).reduce((s, t) => s + durationMinutes(t.startTime, t.endTime), 0))],
  ];
  const factsGrid = el("div", { class: "stat-grid", style: "margin-bottom:14px;" });
  for (const [label, value] of facts) {
    factsGrid.append(el("div", { class: "stat" },
      el("div", { class: "label", text: label }),
      el("div", { class: "value", style: "font-size:1.15rem;", text: value }),
    ));
  }
  wrap.append(factsGrid);

  if (!tasks || !tasks.length) {
    wrap.append(el("div", { class: "empty" },
      el("div", { class: "icon", text: "—" }),
      el("p", { text: "No tasks recorded on this day." }),
    ));
    return wrap;
  }

  // Task table
  const list = el("div", { class: "task-list" });
  const sorted = [...tasks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const t of sorted) {
    const completedLabel = t.completedAt
      ? `Completed ${formatTimeFromTs(t.completedAt)}`
      : (t.completed ? "Completed" : "Not completed");
    list.append(el("div", { class: `task ${t.completed ? "done" : ""}` },
      el("div", { class: "time", text: `${t.startTime}–${t.endTime}` }),
      el("div", {},
        el("div", { class: "task-title", text: t.title }),
        el("div", { class: "task-meta" },
          el("span", { text: t.category || "Other" }),
          el("span", { class: "dim", text: "·" }),
          el("span", { text: formatDuration(durationMinutes(t.startTime, t.endTime)) }),
          el("span", { class: "dim", text: "·" }),
          el("span", { text: completedLabel }),
        ),
      ),
    ));
  }
  wrap.append(list);
  return wrap;
}

function formatTimeFromTs(ts) {
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}