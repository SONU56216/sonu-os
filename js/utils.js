/* ============================================================
   SONU OS — utils.js
   Pure helpers: dates, formatting, DOM, safety.
   No Firebase imports here — pure functions only.
   ============================================================ */

/* ---------- Dates (timezone-safe for the user's LOCAL day) ---------- */

/** Local date string "YYYY-MM-DD" from a Date or epoch. */
export function toLocalDateKey(d = new Date()) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" into a local Date at 00:00. */
export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateKey, days) {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return toLocalDateKey(d);
}

export function isValidDateKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
         !isNaN(parseDateKey(s).getTime());
}

/** "HH:mm" validator (24-hour clock). */
export function isValidTime(s) {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Minutes since midnight from "HH:mm". */
export function timeToMinutes(t) { const [h,m] = t.split(":").map(Number); return h*60+m; }

/** Duration in minutes between two "HH:mm" (supports cross-midnight). */
export function durationMinutes(start, end) {
  let a = timeToMinutes(start), b = timeToMinutes(end);
  if (b <= a) b += 24 * 60;
  return b - a;
}

/** Human-friendly duration from minutes ("1h 25m"). */
export function formatDuration(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** 12h/24h formatting. */
export function formatTime12(t) {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2,"0")} ${am ? "AM" : "PM"}`;
}

export function formatTime(t, pref = "24") {
  return pref === "12" ? formatTime12(t) : t;
}

export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5)  return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Winding down";
}

export function formatDateLong(dateKey) {
  const d = parseDateKey(dateKey);
  return d.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

export function relativeTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 604800) return `${Math.floor(s/86400)}d ago`;
  return d.toLocaleDateString();
}

/* ---------- Math ---------- */
export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/* ---------- DOM helpers (safe — no innerHTML for user data) ---------- */
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Escape HTML for cases where we must set innerHTML (never for user text). */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/* ---------- Misc ---------- */
export function uid() {
  return (crypto.randomUUID?.() ??
    (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}