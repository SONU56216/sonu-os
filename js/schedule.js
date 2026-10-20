/* ============================================================
   SONU OS — schedule.js
   Import validation + duplicate detection.
   ============================================================ */

import { isValidDateKey, isValidTime, durationMinutes } from "./utils.js";

export function validateImport(raw, defaultDate) {
  const errors = [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${e.message}`], plan: null };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errors: ["Top-level value must be an object."], plan: null };
  }

  const date = String(parsed.date || defaultDate || "");
  if (!isValidDateKey(date)) errors.push(`"date" must be YYYY-MM-DD (got "${parsed.date}").`);

  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    errors.push(`"tasks" must be a non-empty array.`);
    return { ok: false, errors, plan: null };
  }

  const plan = { date, tasks: [] };
  const seen = new Set();

  parsed.tasks.forEach((t, i) => {
    const where = `tasks[${i}]`;
    if (!t || typeof t !== "object") { errors.push(`${where}: not an object.`); return; }

    const title = String(t.title || "").trim();
    if (!title) { errors.push(`${where}.title: required.`); return; }
    if (title.length > 120) errors.push(`${where}.title: too long (max 120).`);

    const startTime = String(t.startTime || "").trim();
    const endTime   = String(t.endTime   || "").trim();
    if (!isValidTime(startTime)) errors.push(`${where}.startTime: expected HH:mm (got "${t.startTime}").`);
    if (!isValidTime(endTime))   errors.push(`${where}.endTime: expected HH:mm (got "${t.endTime}").`);

    const priority = String(t.priority || "medium").toLowerCase();
    if (!["low","medium","high"].includes(priority)) {
      errors.push(`${where}.priority: must be low, medium, or high (got "${t.priority}").`);
    }

    const category = String(t.category || "Other").trim() || "Other";
    const notes = String(t.notes || "").trim().slice(0, 400);
    const description = String(t.description || "").trim().slice(0, 400);

    let duration = null;
    if (isValidTime(startTime) && isValidTime(endTime)) {
      duration = durationMinutes(startTime, endTime);
      if (duration <= 0) errors.push(`${where}: end time must be after start time.`);
      if (duration > 12 * 60) errors.push(`${where}: duration over 12 hours — please split the task.`);
    }

    const dupKey = `${startTime}|${title}`;
    if (seen.has(dupKey)) errors.push(`${where}: duplicate of another row (same title + start time).`);
    seen.add(dupKey);

    plan.tasks.push({
      title, category, startTime, endTime, priority, notes, description,
      _rowIndex: i, _duration: duration,
    });
  });

  return { ok: errors.length === 0, errors, plan };
}

export function findDuplicateCandidates(plan, existingTasks) {
  const existing = new Set(existingTasks.map((t) => `${t.startTime}|${t.title}`));
  return plan.tasks.filter((t) => existing.has(`${t.startTime}|${t.title}`));
}