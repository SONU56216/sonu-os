/* ============================================================
   SONU OS — dashboard-page.js
   ============================================================ */

import { requireAuth, wireShellActions } from "./auth.js";
import { bootstrapShell } from "./app.js";
import { toast, confirmDialog } from "./ui.js";
import { renderIcons } from "./icons.js";
import {
  $, el, toLocalDateKey, addDays, formatTime, formatDuration,
  pct, greetingFor, relativeTime, isValidTime,
} from "./utils.js";
import {
  watchTasksRange, watchRecentActivity, createTask, updateTask, deleteTask,
  setTaskCompleted, categoryColor, DEFAULT_CATEGORIES, taskDurationMinutes,
  findOverlaps, normalizeTask,
} from "./tasks.js";
import { watchUserProfile } from "./user.js";
import { renderHeatmap } from "./heatmap.js";

bootstrapShell({ activeNav: "dashboard" });
wireShellActions();

const user = await requireAuth();
const uid = user.uid;

$("#greeting").textContent = `${greetingFor()}, ${user.displayName?.split(" ")[0] || "there"}`;

const state = {
  today: toLocalDateKey(),
  weekFrom: addDays(toLocalDateKey(), -6),
  tasksToday: [],
  tasksWeek: [],
  user: null,
  unsub: [],
};

state.unsub.push(watchTasksRange(uid, state.weekFrom, state.today, (tasks) => {
  state.tasksWeek = tasks;
  state.tasksToday = tasks.filter((t) => t.date === state.today);
  renderStats();
  renderTaskList();
  renderWeekChart();
}, (err) => toast("Live sync error", err.message, "error")));

state.unsub.push(watchRecentActivity(uid, (logs) => renderFeed(logs), 15));

state.unsub.push(watchUserProfile(uid, (u) => {
  state.user = u;
  renderStats();
}));

function renderStats() {
  const total = state.tasksToday.length;
  const done = state.tasksToday.filter((t) => t.completed).length;
  const remaining = total - done;
  const focusMinsToday = state.tasksToday.reduce((s, t) => s + (t.actualFocusMinutes || 0), 0);
  const completion = pct(done, total);

  $("#statPct").textContent = `${completion}%`;
  $("#statPctSub").textContent = total ? `${done} of ${total} completed` : "No tasks planned yet";
  $("#statDone").textContent = String(done);
  $("#statTotal").textContent = String(total);
  $("#statRemaining").textContent = String(remaining);
  $("#statFocus").textContent = formatDuration(focusMinsToday);
  $("#statStreak").textContent = String(state.user?.currentStreak ?? 0);
  $("#statLongest").textContent = String(state.user?.longestStreak ?? 0);
}

function renderTaskList() {
  const list = $("#taskList");
  list.replaceChildren();

  if (!state.tasksToday.length) {
    list.append(el("div", { class: "empty" },
      el("div", { class: "icon", text: "🗓" }),
      el("h3", { text: "No tasks for today yet" }),
      el("p", { text: "Add your first task, or import a schedule prepared with ChatGPT." }),
      el("a", { class: "btn btn-primary", href: "./schedule.html", text: "Open schedule" }),
    ));
    $("#todayCount").textContent = "";
    return;
  }

  const sorted = [...state.tasksToday].sort((a, b) => a.startTime.localeCompare(b.startTime));
  $("#todayCount").textContent = `${sorted.filter(t=>t.completed).length} / ${sorted.length}`;

  for (const t of sorted) list.append(buildTaskRow(t));
  renderIcons(list);
}

function buildTaskRow(task) {
  const check = el("button", {
    class: "check", type: "button",
    "aria-label": task.completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`,
    onclick: () => onToggle(task),
  });
  if (task.completed) check.append(el("span", { text: "✓", style: "font-size:14px;font-weight:700;" }));

  const time = el("div", { class: "time",
    text: `${formatTime(task.startTime, "24")}–${formatTime(task.endTime, "24")}` });

  const title = el("div", { class: "task-title", text: task.title, dataset: { time: task.startTime } });
  const meta = el("div", { class: "task-meta" });
  meta.append(
    el("span", { class: "cat-dot", style: `background:${categoryColor(task.category)}` }),
    el("span", { text: task.category }),
    el("span", { class: "dim", text: "·" }),
    el("span", { text: formatDuration(taskDurationMinutes(task)) }),
    el("span", { class: `badge ${task.priority === "high" ? "red" : task.priority === "low" ? "" : "warn"}`,
                   text: task.priority }),
  );

  const info = el("div", {}, title, meta);

  const actions = el("div", { class: "actions" });
  actions.append(
    el("button", { type: "button", title: "Edit", onclick: () => openEditModal(task) },
      el("span", { text: "✎" })),
    el("button", { type: "button", title: "Delete", onclick: () => onDelete(task) },
      el("span", { text: "✕" })),
  );

  return el("div", { class: `task ${task.completed ? "done" : ""}`, dataset: { id: task.id } },
    check, time, info, actions);
}

async function onToggle(task) {
  const goingTo = !task.completed;
  const row = document.querySelector(`.task[data-id="${task.id}"]`);
  row?.classList.toggle("done", goingTo);
  const check = row?.querySelector(".check");
  if (check) check.replaceChildren(...(goingTo ? [el("span", { text: "✓" })] : []));
  const t = state.tasksToday.find((x) => x.id === task.id);
  if (t) t.completed = goingTo;

  try {
    await setTaskCompleted(uid, task.id, goingTo);
    toast(goingTo ? "Task completed" : "Completion undone",
          task.title, goingTo ? "success" : "");
  } catch (err) {
    if (t) t.completed = !goingTo;
    row?.classList.toggle("done", !goingTo);
    toast("Couldn't save", err.message || "Check your connection.", "error");
    renderTaskList();
  }
  renderStats();
}

async function onDelete(task) {
  const ok = await confirmDialog("Delete task?", `"${task.title}" will be removed from this day.`, "Delete");
  if (!ok) return;
  try {
    await deleteTask(uid, task.id);
    toast("Task deleted", task.title, "success");
  } catch (err) {
    toast("Delete failed", err.message, "error");
  }
}

function openTaskModal(existing = null) {
  const isEdit = !!existing;
  const form = el("form", { id: "taskForm" });
  const err = el("div", { class: "form-error hidden" });

  form.append(
    err,
    el("div", { class: "field" }, el("label", { text: "Title" }),
      el("input", { type: "text", name: "title", required: true, maxlength: 120, value: existing?.title || "" })),
    el("div", { class: "field" }, el("label", { text: "Category" }),
      el("input", { type: "text", name: "category", list: "catList", value: existing?.category || "Other" }),
      el("datalist", { id: "catList" }, ...DEFAULT_CATEGORIES.map((c) => el("option", { value: c })))),
    el("div", { class: "form-row" },
      el("div", { class: "field" }, el("label", { text: "Start" }),
        el("input", { type: "time", name: "startTime", required: true, value: existing?.startTime || "09:00" })),
      el("div", { class: "field" }, el("label", { text: "End" }),
        el("input", { type: "time", name: "endTime", required: true, value: existing?.endTime || "10:00" }))),
    el("div", { class: "field" }, el("label", { text: "Priority" }),
      (() => {
        const sel = el("select", { name: "priority" });
        for (const p of ["low","medium","high"]) {
          const o = el("option", { value: p, text: p[0].toUpperCase()+p.slice(1) });
          if ((existing?.priority || "medium") === p) o.selected = true;
          sel.append(o);
        }
        return sel;
      })()),
    el("div", { class: "field" }, el("label", { text: "Notes (optional)" }),
      el("textarea", { name: "notes", maxlength: 400, value: existing?.notes || "" })),
  );

  const { close } = openModalShell({
    title: isEdit ? "Edit task" : "Add task",
    body: form,
    actions: [
      { label: "Cancel", class: "btn-ghost" },
      { label: isEdit ? "Save" : "Create", class: "btn-primary", close: false,
        onClick: async () => {
          err.classList.add("hidden");
          const data = Object.fromEntries(new FormData(form));
          try {
            const normalized = normalizeTask({ ...existing, ...data, date: state.today });
            if (!isValidTime(normalized.startTime) || !isValidTime(normalized.endTime)) {
              throw new Error("Times must be valid HH:mm.");
            }
            const others = state.tasksToday.filter((t) => t.id !== existing?.id);
            const overlaps = findOverlaps([...others, { id: "new", ...normalized }])
              .filter(([a, b]) => a.id === "new" || b.id === "new");
            if (overlaps.length) {
              const proceed = await confirmDialog("Time overlap",
                "This task overlaps with at least one other task. Save anyway?", "Save anyway");
              if (!proceed) return;
            }
            if (isEdit) {
              await updateTask(uid, existing.id, normalized);
              toast("Task updated", normalized.title, "success");
            } else {
              await createTask(uid, normalized);
              toast("Task added", normalized.title, "success");
            }
            close();
          } catch (e) {
            err.textContent = e.message || "Could not save.";
            err.classList.remove("hidden");
          }
        } },
    ],
  });
}

function openModalShell({ title, body, actions }) {
  const scrim = el("div", { class: "modal-scrim show" });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
  const head  = el("div", { class: "modal-head" }, el("h3", { text: title }));
  const bd    = el("div", { class: "modal-body" });
  bd.append(body instanceof Node ? body : el("p", { text: String(body) }));
  const foot  = el("div", { class: "modal-foot" });

  const close = () => { document.removeEventListener("keydown", onKey); scrim.remove(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);

  for (const a of actions) {
    const btn = el("button", { class: `btn ${a.class || ""}`, type: "button", text: a.label });
    btn.addEventListener("click", async () => {
      if (!a.onClick) { if (a.close !== false) close(); return; }
      btn.disabled = true;
      try { await a.onClick(btn); }
      finally { btn.disabled = false; }
    });
    foot.append(btn);
  }
  modal.append(head, bd, foot);
  scrim.append(modal);
  document.body.append(scrim);
  return { close, root: modal };
}

function openEditModal(task) { openTaskModal(task); }

$("#addTaskBtn")?.addEventListener("click", () => openTaskModal());
$("#importBtn")?.addEventListener("click", () => { location.href = "./schedule.html#import"; });

function renderWeekChart() {
  const svg = $("#weekChart");
  if (!svg) return;
  svg.replaceChildren();

  const W = 560, H = 220, pad = { l: 32, r: 12, t: 16, b: 28 };
  const days = [...Array(7)].map((_, i) => addDays(state.today, i - 6));
  const data = days.map((d) => {
    const ts = state.tasksWeek.filter((t) => t.date === d);
    const done = ts.filter((t) => t.completed).length;
    const p = ts.length ? Math.round((done / ts.length) * 100) : 0;
    return { date: d, pct: p, total: ts.length, done };
  });

  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const barW = innerW / 7 * 0.55;

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (innerH * i / 4);
    svg.append(el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "grid" }));
    const label = el("text", { x: 4, y: y + 3 });
    label.textContent = `${100 - i * 25}%`;
    svg.append(label);
  }

  data.forEach((d, i) => {
    const x = pad.l + (innerW / 7) * i + (innerW / 7 - barW) / 2;
    const h = innerH * (d.pct / 100);
    const y = pad.t + innerH - h;
    const rect = el("rect", { x, y, width: barW, height: Math.max(2, h), rx: 4, class: "bar" });
    rect.append(el("title", { text: `${d.date}\n${d.done}/${d.total} tasks · ${d.pct}%` }));
    svg.append(rect);

    const lbl = el("text", { x: x + barW / 2, y: H - 8, "text-anchor": "middle" });
    lbl.textContent = new Date(d.date).toLocaleDateString(undefined, { weekday: "short" });
    svg.append(lbl);
  });
}

function renderFeed(logs) {
  const wrap = $("#activityFeed");
  if (!wrap) return;
  wrap.replaceChildren();
  if (!logs.length) {
    wrap.append(el("div", { class: "empty" },
      el("p", { text: "No activity yet. Complete a task to see it here." })));
    return;
  }
  for (const log of logs) {
    const cls = log.type === "task.completed" ? "green" : "";
    const icon = log.type === "task.completed" ? "✓"
              : log.type === "task.uncompleted" ? "↺"
              : log.type === "import" ? "⇩"
              : "•";
    const desc = (() => {
      if (log.type === "task.completed")   return `Completed "${log.meta?.title || "a task"}"`;
      if (log.type === "task.uncompleted") return `Marked "${log.meta?.title || "a task"}" not done`;
      if (log.type === "import")           return `Imported ${log.meta?.count || 0} tasks for ${log.date}`;
      return log.type;
    })();
    wrap.append(el("div", { class: `feed-item ${cls}` },
      el("div", { class: "ico", text: icon }),
      el("div", { text: desc }),
      el("div", { class: "when", text: relativeTime(log.createdAt) }),
    ));
  }
}

let heatmapCtl = null;
(async () => {
  const wrap = $("#heatmap");
  if (!wrap) return;
  heatmapCtl = await renderHeatmap(uid, wrap, {
    onDayClick: (dateKey) => {
      sessionStorage.setItem("sonuos.history.selected", dateKey);
      location.href = "./history.html";
    },
  });
})();

window.addEventListener("beforeunload", () => {
  for (const u of state.unsub) { try { u(); } catch {} }
  try { heatmapCtl?.destroy?.(); } catch {}
});