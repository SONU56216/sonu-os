/* ============================================================
   SONU OS — tasks.js
   Task CRUD + realtime subscription + Done/Undo + dailyRecords.
   ============================================================ */

import { db } from "./firebase.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toLocalDateKey, durationMinutes } from "./utils.js";

/* ---------- Helpers ---------- */

function tasksCol(uid)   { return collection(db, "users", uid, "tasks"); }
function taskDoc(uid, id) { return doc(db, "users", uid, "tasks", id); }
function dailyDoc(uid, dateKey) { return doc(db, "users", uid, "dailyRecords", dateKey); }
function activityCol(uid) { return collection(db, "users", uid, "activityLogs"); }

export const CATEGORY_COLORS = {
  "Discrete Structure":              "#22d3ee",
  "Data Structures and Algorithms":  "#22c55e",
  "Photoshop":                       "#3b82f6",
  "CorelDRAW":                       "#a855f7",
  "Book Reading":                    "#f59e0b",
  "College":                         "#ef4444",
  "Personal Development":            "#06b6d4",
  "Cooking":                         "#84cc16",
  "Break":                           "#64748b",
  "Exercise":                        "#ec4899",
  "Other":                           "#8b949e",
};

export function categoryColor(name) {
  return CATEGORY_COLORS[name] || "#22d3ee";
}

export const DEFAULT_CATEGORIES = Object.keys(CATEGORY_COLORS);

/* ---------- Normalize a task object ---------- */

export function normalizeTask(input) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Task title is required.");
  const date = String(input.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Task date must be YYYY-MM-DD.");
  const startTime = String(input.startTime || "").trim();
  const endTime   = String(input.endTime   || "").trim();
  if (!/^\d{2}:\d{2}$/.test(startTime)) throw new Error("Start time must be HH:mm.");
  if (!/^\d{2}:\d{2}$/.test(endTime))   throw new Error("End time must be HH:mm.");

  const priority = ["low","medium","high"].includes(input.priority) ? input.priority : "medium";

  return {
    title,
    description: String(input.description || "").trim(),
    category:    String(input.category || "Other").trim() || "Other",
    date,
    startTime,
    endTime,
    priority,
    notes:       String(input.notes || "").trim(),
    completed:   !!input.completed,
    completedAt: input.completedAt || null,
    actualFocusMinutes: Number.isFinite(input.actualFocusMinutes) ? input.actualFocusMinutes : 0,
    order:       Number.isFinite(input.order) ? input.order : Date.now(),
  };
}

export function taskDurationMinutes(task) {
  return durationMinutes(task.startTime, task.endTime);
}

/* ---------- CRUD ---------- */

export async function createTask(uid, input) {
  const clean = normalizeTask(input);
  const ref = await addDoc(tasksCol(uid), {
    ...clean,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await recomputeDailyRecord(uid, clean.date);
  return ref.id;
}

export async function updateTask(uid, taskId, patch) {
  const ref = taskDoc(uid, taskId);
  const before = (await getDoc(ref)).data() || {};
  const merged = normalizeTask({ ...before, ...patch });
  await updateDoc(ref, { ...merged, updatedAt: serverTimestamp() });
  const dates = new Set([before.date, merged.date].filter(Boolean));
  for (const d of dates) await recomputeDailyRecord(uid, d);
}

export async function deleteTask(uid, taskId) {
  const ref = taskDoc(uid, taskId);
  const before = (await getDoc(ref)).data() || {};
  await deleteDoc(ref);
  if (before.date) await recomputeDailyRecord(uid, before.date);
}

export async function setTaskCompleted(uid, taskId, completed) {
  const ref = taskDoc(uid, taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Task not found.");
  const task = snap.data();
  if (task.completed === completed) return;

  await updateDoc(ref, {
    completed,
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });

  await recomputeDailyRecord(uid, task.date);

  await addDoc(activityCol(uid), {
    type: completed ? "task.completed" : "task.uncompleted",
    taskId, date: task.date,
    meta: { title: task.title, category: task.category },
    createdAt: serverTimestamp(),
  });
}

export async function moveTaskToDate(uid, taskId, newDate) {
  const ref = taskDoc(uid, taskId);
  const before = (await getDoc(ref)).data() || {};
  await updateDoc(ref, { date: newDate, updatedAt: serverTimestamp() });
  for (const d of new Set([before.date, newDate].filter(Boolean))) {
    await recomputeDailyRecord(uid, d);
  }
}

export async function duplicateTaskToDate(uid, taskId, newDate) {
  const snap = await getDoc(taskDoc(uid, taskId));
  if (!snap.exists()) throw new Error("Task not found.");
  const t = snap.data();
  await createTask(uid, {
    title: t.title, description: t.description, category: t.category,
    date: newDate, startTime: t.startTime, endTime: t.endTime,
    priority: t.priority, notes: t.notes,
    completed: false, completedAt: null,
    actualFocusMinutes: 0, order: Date.now(),
  });
}

export async function duplicateDay(uid, fromDate, toDate, { skipDuplicates = true } = {}) {
  const source = await listTasksOnce(uid, fromDate);
  if (!source.length) return 0;
  const existingTargets = skipDuplicates ? await listTasksOnce(uid, toDate) : [];
  const existingKeys = new Set(existingTargets.map((t) => `${t.startTime}|${t.title}`));

  const batch = writeBatch(db);
  let written = 0;
  for (const t of source) {
    const key = `${t.startTime}|${t.title}`;
    if (skipDuplicates && existingKeys.has(key)) continue;
    const ref = doc(tasksCol(uid));
    batch.set(ref, {
      title: t.title, description: t.description || "", category: t.category || "Other",
      date: toDate, startTime: t.startTime, endTime: t.endTime,
      priority: t.priority || "medium", notes: t.notes || "",
      completed: false, completedAt: null,
      actualFocusMinutes: 0, order: Date.now() + written,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    written++;
  }
  if (written) await batch.commit();
  if (written) await recomputeDailyRecord(uid, toDate);
  return written;
}

/* ---------- Reads ---------- */

export async function listTasksOnce(uid, dateKey) {
  const q = query(tasksCol(uid), where("date", "==", dateKey));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}

export function watchTasksForDate(uid, dateKey, cb, onError) {
  const q = query(tasksCol(uid), where("date", "==", dateKey));
  return onSnapshot(q, (snap) => {
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    out.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    cb(out);
  }, (err) => { if (onError) onError(err); });
}

export function watchTasksRange(uid, fromDate, toDate, cb, onError) {
  const q = query(
    tasksCol(uid),
    where("date", ">=", fromDate),
    where("date", "<=", toDate),
    orderBy("date", "asc"),
  );
  return onSnapshot(q, (snap) => {
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    cb(out);
  }, (err) => { if (onError) onError(err); });
}

/* ---------- Daily record (derived summary) ---------- */

export async function recomputeDailyRecord(uid, dateKey) {
  const tasks = await listTasksOnce(uid, dateKey);
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const focus = tasks.reduce((s, t) => s + (t.actualFocusMinutes || 0), 0);
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const activeDay = completed > 0;

  await setDoc(dailyDoc(uid, dateKey), {
    date: dateKey,
    completedTaskCount: completed,
    totalPlannedTaskCount: total,
    completionPercentage: pct,
    totalFocusMinutes: focus,
    activeDay,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await refreshUserAggregates(uid);
}

export async function refreshUserAggregates(uid) {
  const snap = await getDocs(collection(db, "users", uid, "dailyRecords"));
  const records = [];
  snap.forEach((d) => records.push(d.data()));

  const totalTasks = records.reduce((s, r) => s + (r.completedTaskCount || 0), 0);
  const totalFocus = records.reduce((s, r) => s + (r.totalFocusMinutes || 0), 0);

  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.data() || {};
  const streakRule = userData.streakRule || { type: "anyTaskCompleted" };

  const qualifies = (r) => {
    if (!r || !r.totalPlannedTaskCount) return false;
    if (streakRule.type === "minPct50") return (r.completionPercentage || 0) >= 50;
    if (streakRule.type === "minPct80") return (r.completionPercentage || 0) >= 80;
    return (r.completedTaskCount || 0) >= 1;
  };

  const today = toLocalDateKey();
  const byDate = new Map(records.map((r) => [r.date, r]));

  let current = 0;
  let cursor = today;
  while (qualifies(byDate.get(cursor))) {
    current++;
    cursor = shiftDateKey(cursor, -1);
  }

  const sortedDates = [...byDate.keys()].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of sortedDates) {
    if (qualifies(byDate.get(d))) {
      run = (prev && isNextDay(prev, d)) ? run + 1 : 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
    prev = d;
  }

  await updateDoc(doc(db, "users", uid), {
    totalTasksCompleted: totalTasks,
    totalFocusMinutes: totalFocus,
    currentStreak: current,
    longestStreak: longest,
    lastActiveDate: byDate.get(today)?.activeDay ? today : (userData.lastActiveDate || null),
  });
}

function shiftDateKey(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear(), mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function isNextDay(a, b) { return shiftDateKey(a, 1) === b; }

/* ---------- Activity feed ---------- */

export function watchRecentActivity(uid, cb, limitN = 20, onError) {
  const q = query(
    collection(db, "users", uid, "activityLogs"),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(q, (snap) => {
    const out = [];
    snap.forEach((d) => { if (out.length < limitN) out.push({ id: d.id, ...d.data() }); });
    cb(out);
  }, (err) => { if (onError) onError(err); });
}

/* ---------- Overlap detection ---------- */

export function findOverlaps(tasks) {
  const withRange = tasks.map((t) => {
    const [sh, sm] = t.startTime.split(":").map(Number);
    const [eh, em] = t.endTime.split(":").map(Number);
    let start = sh * 60 + sm;
    let end   = eh * 60 + em;
    if (end <= start) end += 24 * 60;
    return { task: t, start, end };
  }).sort((a, b) => a.start - b.start);

  const pairs = [];
  for (let i = 0; i < withRange.length; i++) {
    for (let j = i + 1; j < withRange.length; j++) {
      const a = withRange[i], b = withRange[j];
      if (b.start < a.end) pairs.push([a.task, b.task]);
      else break;
    }
  }
  return pairs;
}

/* ---------- Batch write ---------- */

export async function bulkCreateTasks(uid, tasks, dateKey) {
  if (!tasks.length) return 0;
  const batch = writeBatch(db);
  let n = 0;
  for (const t of tasks) {
    const clean = normalizeTask({ ...t, date: dateKey, order: Date.now() + n });
    const ref = doc(tasksCol(uid));
    batch.set(ref, {
      ...clean,
      completed: false, completedAt: null, actualFocusMinutes: 0,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    n++;
  }
  await batch.commit();
  await recomputeDailyRecord(uid, dateKey);
  return n;
}

/* ---------- Focus sessions (Phase 5 addition) ---------- */

export async function recordFocusSession(uid, { taskId = null, plannedMinutes, actualMinutes, mode, startedAt, endedAt, completed = true }) {
  if (!Number.isFinite(actualMinutes) || actualMinutes <= 0) {
    throw new Error("Session must have positive actualMinutes.");
  }
  const ref = await addDoc(collection(db, "users", uid, "focusSessions"), {
    taskId, plannedMinutes, actualMinutes, mode,
    startedAt, endedAt, completed,
    createdAt: serverTimestamp(),
  });

  if (taskId && mode === "focus") {
    const tRef = taskDoc(uid, taskId);
    const snap = await getDoc(tRef);
    if (snap.exists()) {
      const prev = snap.data().actualFocusMinutes || 0;
      await updateDoc(tRef, { actualFocusMinutes: prev + actualMinutes, updatedAt: serverTimestamp() });
      const taskDate = snap.data().date;
      if (taskDate) await recomputeDailyRecord(uid, taskDate);
    }
  }
  return ref.id;
}

export async function listRecentFocusSessions(uid, limitN = 20) {
  const q = query(
    collection(db, "users", uid, "focusSessions"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  const out = [];
  snap.forEach((d) => { if (out.length < limitN) out.push({ id: d.id, ...d.data() }); });
  return out;
}