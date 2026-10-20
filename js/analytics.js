/* ============================================================
   SONU OS — analytics.js
   Pure metric computation. No DOM, no Firebase.
   ============================================================ */

import { addDays, toLocalDateKey, pct, durationMinutes } from "./utils.js";

export function groupByDate(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (!t.date) continue;
    if (!map.has(t.date)) map.set(t.date, []);
    map.get(t.date).push(t);
  }
  return map;
}

export function summarizeDay(dateKey, tasks) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const focus = tasks.reduce((s, t) => s + (t.actualFocusMinutes || 0), 0);
  const plannedMinutes = tasks.reduce(
    (s, t) => s + durationMinutes(t.startTime, t.endTime), 0,
  );
  return {
    date: dateKey,
    totalPlannedTaskCount: total,
    completedTaskCount: completed,
    completionPercentage: pct(completed, total),
    totalFocusMinutes: focus,
    plannedMinutes,
    activeDay: completed > 0,
  };
}

export function dailySeries(tasks, fromDate, toDate) {
  const byDate = groupByDate(tasks);
  const out = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    out.push(summarizeDay(cursor, byDate.get(cursor) || []));
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function weeklySeries(tasks, fromDate, toDate, weekStart = 1) {
  const days = dailySeries(tasks, fromDate, toDate);
  const buckets = new Map();

  const startDow = (k) => new Date(k + "T00:00:00").getDay();
  const anchor = (k) => {
    const d = startDow(k);
    const delta = (d - weekStart + 7) % 7;
    return addDays(k, -delta);
  };

  for (const day of days) {
    const wk = anchor(day.date);
    if (!buckets.has(wk)) buckets.set(wk, []);
    buckets.get(wk).push(day);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStartKey, ds]) => {
      const totals = ds.reduce(
        (acc, d) => {
          acc.planned += d.totalPlannedTaskCount;
          acc.completed += d.completedTaskCount;
          acc.focus += d.totalFocusMinutes;
          acc.plannedMinutes += d.plannedMinutes;
          if (d.activeDay) acc.activeDays += 1;
          return acc;
        },
        { planned: 0, completed: 0, focus: 0, plannedMinutes: 0, activeDays: 0 },
      );
      return {
        weekStart: weekStartKey,
        weekEnd: ds[ds.length - 1].date,
        days: ds,
        totals: { ...totals, completionPercentage: pct(totals.completed, totals.planned) },
      };
    });
}

export function monthKey(dateKey) { return dateKey.slice(0, 7); }

export function monthlySeries(tasks, monthsBack = 6) {
  const today = toLocalDateKey();
  const tasksByMonth = new Map();
  for (const t of tasks) {
    const m = monthKey(t.date);
    if (!tasksByMonth.has(m)) tasksByMonth.set(m, []);
    tasksByMonth.get(m).push(t);
  }

  const months = [];
  let cursorKey = monthKey(today);
  for (let i = 0; i < monthsBack; i++) {
    months.push(cursorKey);
    const [y, m] = cursorKey.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    cursorKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  }
  months.reverse();

  return months.map((m) => {
    const ts = tasksByMonth.get(m) || [];
    const planned = ts.length;
    const completed = ts.filter((t) => t.completed).length;
    const focus = ts.reduce((s, t) => s + (t.actualFocusMinutes || 0), 0);
    const activeDays = new Set(ts.filter((t) => t.completed).map((t) => t.date)).size;
    return {
      month: m,
      planned, completed, focus, activeDays,
      completionPercentage: pct(completed, planned),
    };
  });
}

export function categoryDistribution(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const cat = t.category || "Other";
    const mins = durationMinutes(t.startTime, t.endTime);
    const prev = map.get(cat) || { category: cat, plannedMinutes: 0, focusMinutes: 0, tasks: 0 };
    prev.plannedMinutes += mins;
    prev.focusMinutes += t.actualFocusMinutes || 0;
    prev.tasks += 1;
    map.set(cat, prev);
  }
  const totalPlanned = [...map.values()].reduce((s, r) => s + r.plannedMinutes, 0);
  return [...map.values()]
    .map((r) => ({ ...r, share: totalPlanned ? r.plannedMinutes / totalPlanned : 0 }))
    .sort((a, b) => b.plannedMinutes - a.plannedMinutes);
}

export function dayQualifies(day, rule = { type: "anyTaskCompleted" }) {
  if (!day || !day.totalPlannedTaskCount) return false;
  if (rule.type === "minPct50") return (day.completionPercentage || 0) >= 50;
  if (rule.type === "minPct80") return (day.completionPercentage || 0) >= 80;
  return (day.completedTaskCount || 0) >= 1;
}

export function computeStreaks(days, rule) {
  let longest = 0, run = 0;
  for (const d of days) {
    if (dayQualifies(d, rule)) { run += 1; longest = Math.max(longest, run); }
    else run = 0;
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (dayQualifies(days[i], rule)) current += 1;
    else break;
  }
  return { current, longest };
}

export function consistencyScore(days) {
  const activeDays = days.filter((d) => d.activeDay).length;
  const scheduledDays = days.filter((d) => d.totalPlannedTaskCount > 0).length;
  return {
    activeDays,
    scheduledDays,
    activeOverScheduled: pct(activeDays, scheduledDays),
    activeOverAll: pct(activeDays, days.length),
  };
}

export function mostProductiveDay(days) {
  return days.reduce((best, d) => {
    if (!best) return d;
    if (d.completionPercentage !== best.completionPercentage)
      return d.completionPercentage > best.completionPercentage ? d : best;
    return (d.completedTaskCount > best.completedTaskCount) ? d : best;
  }, null);
}

export function rangeDays(days) {
  const today = toLocalDateKey();
  return { from: addDays(today, -(days - 1)), to: today };
}

export function monthRange(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from: first, to: last };
}