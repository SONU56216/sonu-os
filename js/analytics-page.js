/* ============================================================
   SONU OS — analytics-page.js
   ============================================================ */

import { requireAuth, wireShellActions } from "./auth.js";
import { bootstrapShell } from "./app.js";
import { toast } from "./ui.js";
import { el, toLocalDateKey, addDays, formatDuration, pct } from "./utils.js";
import {
  dailySeries, weeklySeries, monthlySeries, categoryDistribution,
  computeStreaks, consistencyScore, mostProductiveDay,
  rangeDays,
} from "./analytics.js";
import { watchTasksRange } from "./tasks.js";
import { watchUserProfile } from "./user.js";

bootstrapShell({ activeNav: "analytics" });
wireShellActions();

const user = await requireAuth();
const uid = user.uid;

const { from, to } = rangeDays(90);
let currentTasks = [];
let currentUser = null;

const unsubTasks = watchTasksRange(uid, from, to, (tasks) => {
  currentTasks = tasks;
  render();
}, (err) => toast("Live sync error", err.message, "error"));

const unsubUser = watchUserProfile(uid, (u) => { currentUser = u; render(); });

function rule() {
  return currentUser?.streakRule || { type: "anyTaskCompleted" };
}

function render() {
  const days30 = dailySeries(currentTasks, addDays(toLocalDateKey(), -29), toLocalDateKey());
  const streak = computeStreaks(days30, rule());
  const consistency = consistencyScore(days30);
  const focus30 = days30.reduce((s, d) => s + d.totalFocusMinutes, 0);
  const best = mostProductiveDay(days30);
  const weightedPct = pct(
    days30.reduce((s, d) => s + d.completedTaskCount, 0),
    days30.reduce((s, d) => s + d.totalPlannedTaskCount, 0),
  );

  setText("#aActiveDays", String(consistency.activeDays));
  setText("#aAvgPct", `${weightedPct}%`);
  setText("#aFocus30", formatDuration(focus30));
  setText("#aBestDay", best && best.totalPlannedTaskCount ? `${best.date} · ${best.completionPercentage}%` : "—");

  drawDailyChart(days30);
  drawWeeklyChart(currentTasks);

  renderCategoryList(categoryDistribution(currentTasks.filter((t) => t.date >= addDays(toLocalDateKey(), -29))));
  renderMonthlyComparison(currentTasks);
}

function setText(sel, text) {
  const node = document.querySelector(sel);
  if (node) node.textContent = text;
}

function drawDailyChart(days) {
  const svg = document.getElementById("dailyChart");
  if (!svg) return;
  svg.replaceChildren();

  const W = 560, H = 220, pad = { l: 30, r: 12, t: 16, b: 26 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (innerH * i / 4);
    svg.append(el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "grid" }));
    const lbl = el("text", { x: 4, y: y + 3 });
    lbl.textContent = `${100 - i * 25}%`;
    svg.append(lbl);
  }

  const n = days.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const points = days.map((d, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + innerH * (1 - (d.completionPercentage || 0) / 100);
    return [x, y, d];
  });

  const path = points.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  const defs = el("defs");
  const g = el("linearGradient", { id: "gradCyan", x1: "0", y1: "0", x2: "0", y2: "1" });
  g.append(
    el("stop", { offset: "0%", "stop-color": "rgba(34,211,238,0.35)" }),
    el("stop", { offset: "100%", "stop-color": "rgba(34,211,238,0)" }),
  );
  defs.append(g);
  svg.append(defs);

  const areaPath = `${path} L ${(pad.l + innerW).toFixed(1)} ${(pad.t + innerH).toFixed(1)} L ${pad.l} ${(pad.t + innerH).toFixed(1)} Z`;
  svg.append(el("path", { class: "area", d: areaPath }));
  svg.append(el("path", { class: "line", d: path }));

  points.slice(-10).forEach(([x, y, d]) => {
    const c = el("circle", { cx: x, cy: y, r: 2.5, fill: "var(--accent)" });
    c.append(el("title", { text: `${d.date}: ${d.completionPercentage}%` }));
    svg.append(c);
  });

  points.forEach(([x, , d], i) => {
    if (i % 7 !== 0) return;
    const t = el("text", { x, y: H - 8, "text-anchor": "middle" });
    t.textContent = d.date.slice(5);
    svg.append(t);
  });
}

function drawWeeklyChart(tasks) {
  const svg = document.getElementById("weeklyChart");
  if (!svg) return;
  svg.replaceChildren();

  const today = toLocalDateKey();
  const from8w = addDays(today, -7 * 8 + 1);
  const weeks = weeklySeries(tasks, from8w, today, currentUser?.weekStart ?? 1);

  const W = 560, H = 220, pad = { l: 34, r: 12, t: 16, b: 26 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;

  const max = Math.max(60, ...weeks.map((w) => w.totals.focus));

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (innerH * i / 4);
    svg.append(el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "grid" }));
    const val = Math.round(max * (1 - i / 4));
    const lbl = el("text", { x: 4, y: y + 3 });
    lbl.textContent = `${val}m`;
    svg.append(lbl);
  }

  if (!weeks.length) return;

  const barW = innerW / weeks.length * 0.6;
  const gap = innerW / weeks.length;

  weeks.forEach((w, i) => {
    const x = pad.l + gap * i + (gap - barW) / 2;
    const h = innerH * (w.totals.focus / max);
    const y = pad.t + innerH - h;
    const rect = el("rect", { x, y, width: barW, height: Math.max(2, h), rx: 3, class: "bar" });
    rect.append(el("title", { text:
      `${w.weekStart} – ${w.weekEnd}\n${w.totals.focus} min focused\n${w.totals.completed}/${w.totals.planned} tasks` }));
    svg.append(rect);

    const t = el("text", { x: x + barW / 2, y: H - 8, "text-anchor": "middle" });
    t.textContent = w.weekStart.slice(5);
    svg.append(t);
  });
}

function renderCategoryList(dist) {
  const wrap = document.getElementById("categoryList");
  if (!wrap) return;
  wrap.replaceChildren();
  if (!dist.length) {
    wrap.append(el("div", { class: "empty" }, el("p", { text: "No tasks in the last 30 days." })));
    return;
  }
  const total = dist.reduce((s, r) => s + r.plannedMinutes, 0) || 1;
  for (const row of dist) {
    const bar = el("div", { style:
      "height:6px;border-radius:3px;background:var(--bg-elev-3);overflow:hidden;margin-top:4px;" });
    const fill = el("div", { style:
      `height:100%;width:${Math.round((row.plannedMinutes/total)*100)}%;` +
      `background:${categoryColorSafe(row.category)};` });
    bar.append(fill);
    wrap.append(el("div", { style: "margin-bottom:10px;" },
      el("div", { class: "row items-center justify-between" },
        el("div", { text: row.category }),
        el("div", { class: "muted mono", text: `${formatDuration(row.plannedMinutes)} · ${Math.round((row.plannedMinutes/total)*100)}%` }),
      ),
      bar,
    ));
  }
}

function categoryColorSafe(cat) {
  const map = {
    "Discrete Structure":"#22d3ee", "Data Structures and Algorithms":"#22c55e",
    "Photoshop":"#3b82f6", "CorelDRAW":"#a855f7", "Book Reading":"#f59e0b",
    "College":"#ef4444", "Personal Development":"#06b6d4", "Cooking":"#84cc16",
    "Break":"#64748b", "Exercise":"#ec4899", "Other":"#8b949e",
  };
  return map[cat] || "#22d3ee";
}

function renderMonthlyComparison(tasks) {
  const wrap = document.getElementById("monthlyCompare");
  if (!wrap) return;
  wrap.replaceChildren();

  const series = monthlySeries(tasks, 3);
  const current = series[series.length - 1];
  const prev = series[series.length - 2];

  if (!current) {
    wrap.append(el("div", { class: "empty" }, el("p", { text: "Not enough data yet." })));
    return;
  }
  if (!prev || !prev.planned) {
    wrap.append(el("div", { class: "empty" },
      el("p", { text: "No activity last month to compare." })));
    return;
  }

  const delta = (cur, p) => {
    if (!p) return "—";
    const d = cur - p;
    if (d === 0) return "no change";
    return `${d > 0 ? "+" : ""}${d}%`;
  };

  const rows = [
    ["Completion %", `${current.completionPercentage}%`, delta(current.completionPercentage, prev.completionPercentage)],
    ["Tasks completed", String(current.completed), delta(current.completed, prev.completed)],
    ["Focused minutes", formatDuration(current.focus), delta(current.focus, prev.focus)],
    ["Active days", String(current.activeDays), delta(current.activeDays, prev.activeDays)],
  ];

  for (const [label, now, change] of rows) {
    wrap.append(el("div", { class: "row items-center justify-between", style: "padding:8px 0;border-bottom:1px dashed var(--border);" },
      el("div", { class: "muted", text: label }),
      el("div", {},
        el("strong", { text: now }),
        el("span", { class: "dim", style: "margin-left:8px;font-size:12px;", text: change }),
      ),
    ));
  }
}

window.addEventListener("beforeunload", () => {
  try { unsubTasks(); } catch {}
  try { unsubUser(); } catch {}
});