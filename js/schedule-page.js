/* ============================================================
   SONU OS — schedule-page.js
   Controller for schedule.html.

   Responsibilities:
     - Date picker with prev/next/today navigation
     - Real-time task list for the selected date
     - Add / edit / delete tasks (with overlap warning)
     - One-click Done / Undo (optimistic UI + rollback)
     - Duplicate previous day's schedule
     - Clear day (bulk delete with confirmation)
     - Full ChatGPT schedule import workflow:
         * paste JSON
         * validate → per-row errors
         * preview table
         * duplicate detection against the target date
         * confirm + bulk write
     - Visual timeline for the selected day
   ============================================================ */

import { requireAuth, wireShellActions } from "./auth.js";
import { bootstrapShell } from "./app.js";
import { toast, confirmDialog } from "./ui.js";
import { renderIcons } from "./icons.js";
import {
  $, el, toLocalDateKey, addDays, formatDateLong, formatDuration,
  isValidDateKey,
} from "./utils.js";
import {
  watchTasksForDate, createTask, updateTask, deleteTask, setTaskCompleted,
  duplicateDay, categoryColor, DEFAULT_CATEGORIES, taskDurationMinutes,
  findOverlaps, normalizeTask, bulkCreateTasks, listTasksOnce,
} from "./tasks.js";
import { validateImport, findDuplicateCandidates } from "./schedule.js";

/* ---------- Boot ---------- */
bootstrapShell({ activeNav: "schedule" });
wireShellActions();

const user = await requireAuth();
const uid = user.uid;

/* ---------- State ---------- */
const state = {
  date: toLocalDateKey(),
  tasks: [],
  unsub: null,
};

/* ---------- Date picker setup ---------- */
const datePicker = $("#datePicker");
datePicker.value = state.date;
datePicker.removeAttribute("max"); // future dates are allowed (planning ahead)

/* ---------- Realtime listener for the selected date ---------- */
function resubscribe() {
  if (state.unsub) state.unsub();
  state.unsub = watchTasksForDate(
    uid,
    state.date,
    (tasks) => {
      state.tasks = tasks;
      render();
    },
    (err) => toast("Sync error", err.message || "Please retry.", "error"),
  );
}
resubscribe();

/* ---------- Date navigation ---------- */
datePicker.addEventListener("change", () => {
  const v = datePicker.value;
  if (!isValidDateKey(v)) return;
  state.date = v;
  resubscribe();
});

$("#prevDayBtn").addEventListener("click", () => shiftDate(-1));
$("#nextDayBtn").addEventListener("click", () => shiftDate(+1));
$("#todayBtn").addEventListener("click", () => {
  state.date = toLocalDateKey();
  datePicker.value = state.date;
  resubscribe();
});

function shiftDate(delta) {
  state.date = addDays(state.date, delta);
  datePicker.value = state.date;
  resubscribe();
}

/* ---------- Render ---------- */
function render() {
  $("#dayTitle").textContent = formatDateLong(state.date);
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.completed).length;
  $("#daySummary").textContent = total
    ? `${done}/${total} completed`
    : "No tasks yet";

  renderTaskList();
  renderTimeline();
}

function renderTaskList() {
  const list = $("#taskList");
  list.replaceChildren();

  if (!state.tasks.length) {
    list.append(el("div", { class: "empty" },
      el("div", { class: "icon", text: "📝" }),
      el("h3", { text: "No tasks for this day" }),
      el("p", { text: "Add tasks manually, or import a schedule you prepared with ChatGPT." }),
    ));
    return;
  }

  const sorted = [...state.tasks].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""));
  for (const t of sorted) list.append(buildTaskRow(t));
  renderIcons(list);
}

function buildTaskRow(task) {
  const check = el("button", {
    class: "check",
    type: "button",
    "aria-label": task.completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`,
    onclick: () => toggle(task),
  });
  if (task.completed) check.append(el("span", { text: "✓" }));

  const time = el("div", {
    class: "time",
    text: `${task.startTime}–${task.endTime}`,
  });

  const title = el("div", {
    class: "task-title",
    text: task.title,
    dataset: { time: task.startTime },
  });

  const meta = el("div", { class: "task-meta" },
    el("span", { class: "cat-dot", style: `background:${categoryColor(task.category)}` }),
    el("span", { text: task.category }),
    el("span", { class: "dim", text: "·" }),
    el("span", { text: formatDuration(taskDurationMinutes(task)) }),
    el("span", {
      class: `badge ${task.priority === "high" ? "red" : task.priority === "low" ? "" : "warn"}`,
      text: task.priority,
    }),
  );

  const info = el("div", {}, title, meta);

  const actions = el("div", { class: "actions" },
    el("button", { type: "button", title: "Edit", onclick: () => openEdit(task) },
      el("span", { text: "✎" })),
    el("button", { type: "button", title: "Delete", onclick: () => remove(task) },
      el("span", { text: "✕" })),
  );

  return el("div", {
    class: `task ${task.completed ? "done" : ""}`,
    dataset: { id: task.id },
  }, check, time, info, actions);
}

function renderTimeline() {
  const tl = $("#timeline");
  tl.replaceChildren();

  if (!state.tasks.length) {
    tl.append(el("div", { class: "empty" }, el("p", { text: "Timeline is empty." })));
    return;
  }

  const sorted = [...state.tasks].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || ""));

  for (const t of sorted) {
    tl.append(el("div", { class: `timeline-row ${t.completed ? "done" : ""}` },
      el("div", { class: "t", text: `${t.startTime}–${t.endTime}` }),
      el("div", {},
        el("div", { text: t.title, style: "font-weight:500;" }),
        el("div", {
          class: "muted",
          style: "font-size:12px;",
          text: `${t.category} · ${formatDuration(taskDurationMinutes(t))}`,
        }),
      ),
    ));
  }
}

/* ---------- Actions: Done / Undo ---------- */
async function toggle(task) {
  const going = !task.completed;

  // Optimistic UI.
  const row = document.querySelector(`.task[data-id="${task.id}"]`);
  row?.classList.toggle("done", going);
  const check = row?.querySelector(".check");
  if (check) {
    check.replaceChildren(...(going ? [el("span", { text: "✓" })] : []));
  }
  const local = state.tasks.find((x) => x.id === task.id);
  if (local) local.completed = going;

  try {
    await setTaskCompleted(uid, task.id, going);
    toast(
      going ? "Task completed" : "Completion undone",
      task.title,
      going ? "success" : "",
    );
  } catch (err) {
    // Rollback on failure.
    if (local) local.completed = !going;
    row?.classList.toggle("done", !going);
    check?.replaceChildren(...(!going ? [el("span", { text: "✓" })] : []));
    toast("Couldn't save", err.message || "Check your connection.", "error");
    render();
  }
}

/* ---------- Actions: Delete ---------- */
async function remove(task) {
  const ok = await confirmDialog(
    "Delete task?",
    `"${task.title}" will be removed from this day.`,
    "Delete",
  );
  if (!ok) return;
  try {
    await deleteTask(uid, task.id);
    toast("Task deleted", task.title, "success");
  } catch (err) {
    toast("Delete failed", err.message, "error");
  }
}

/* ---------- Add / Edit modal ---------- */
function openTaskModal(existing = null) {
  const isEdit = !!existing;
  const form = el("form", { id: "taskForm" });
  const err = el("div", { class: "form-error hidden" });

  // Category datalist for suggestions.
  const catList = el("datalist", { id: "catList" },
    ...DEFAULT_CATEGORIES.map((c) => el("option", { value: c })),
  );

  const titleField = el("div", { class: "field" },
    el("label", { text: "Title" }),
    el("input", {
      type: "text", name: "title", required: true, maxlength: 120,
      value: existing?.title || "",
    }),
  );

  const catField = el("div", { class: "field" },
    el("label", { text: "Category" }),
    el("input", {
      type: "text", name: "category", list: "catList",
      value: existing?.category || "Other",
    }),
  );

  const timeRow = el("div", { class: "form-row" },
    el("div", { class: "field" },
      el("label", { text: "Start time" }),
      el("input", {
        type: "time", name: "startTime", required: true,
        value: existing?.startTime || "09:00",
      }),
    ),
    el("div", { class: "field" },
      el("label", { text: "End time" }),
      el("input", {
        type: "time", name: "endTime", required: true,
        value: existing?.endTime || "10:00",
      }),
    ),
  );

  const prioritySelect = el("select", { name: "priority" });
  for (const p of ["low", "medium", "high"]) {
    const o = el("option", { value: p, text: p[0].toUpperCase() + p.slice(1) });
    if ((existing?.priority || "medium") === p) o.selected = true;
    prioritySelect.append(o);
  }
  const prioField = el("div", { class: "field" },
    el("label", { text: "Priority" }),
    prioritySelect,
  );

  const notesField = el("div", { class: "field" },
    el("label", { text: "Notes (optional)" }),
    el("textarea", { name: "notes", maxlength: 400, value: existing?.notes || "" }),
  );

  form.append(err, titleField, catField, timeRow, prioField, notesField, catList);

  const { close } = openModalShell({
    title: isEdit ? "Edit task" : "Add task",
    body: form,
    actions: [
      { label: "Cancel", class: "btn-ghost" },
      {
        label: isEdit ? "Save" : "Create",
        class: "btn-primary",
        close: false,
        onClick: async () => {
          err.classList.add("hidden");
          const data = Object.fromEntries(new FormData(form));
          try {
            const normalized = normalizeTask({
              ...existing,
              ...data,
              date: state.date,
            });

            // Overlap warning (non-blocking).
            const others = state.tasks.filter((t) => t.id !== existing?.id);
            const overlaps = findOverlaps([...others, { id: "new", ...normalized }])
              .filter(([a, b]) => a.id === "new" || b.id === "new");

            if (overlaps.length) {
              const proceed = await confirmDialog(
                "Time overlap",
                "This task overlaps with another task on this day. Save anyway?",
                "Save anyway",
              );
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
        },
      },
    ],
  });
}

function openEdit(task) { openTaskModal(task); }

/* ---------- Modal shell with async primary action ---------- */
function openModalShell({ title, body, actions }) {
  const scrim = el("div", { class: "modal-scrim show" });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
  const head = el("div", { class: "modal-head" }, el("h3", { text: title }));
  const bd = el("div", { class: "modal-body" });
  bd.append(body instanceof Node ? body : el("p", { text: String(body) }));
  const foot = el("div", { class: "modal-foot" });

  const close = () => {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);

  for (const a of actions) {
    const btn = el("button", {
      class: `btn ${a.class || ""}`,
      type: "button",
      text: a.label,
    });
    btn.addEventListener("click", async () => {
      if (!a.onClick) {
        if (a.close !== false) close();
        return;
      }
      btn.disabled = true;
      try {
        await a.onClick(btn);
      } finally {
        btn.disabled = false;
      }
    });
    foot.append(btn);
  }

  modal.append(head, bd, foot);
  scrim.append(modal);
  document.body.append(scrim);
  return { close, root: modal };
}

/* ---------- Wire main buttons ---------- */
$("#addTaskBtn").addEventListener("click", () => openTaskModal());

$("#dupPrevBtn").addEventListener("click", async () => {
  const prev = addDays(state.date, -1);
  try {
    const n = await duplicateDay(uid, prev, state.date);
    if (!n) toast("Nothing to copy", `No tasks on ${prev}.`, "warn");
    else toast("Duplicated", `${n} tasks copied from ${prev}.`, "success");
  } catch (err) {
    toast("Duplicate failed", err.message, "error");
  }
});

$("#clearBtn").addEventListener("click", async () => {
  if (!state.tasks.length) {
    toast("Nothing to clear", "This day has no tasks.", "warn");
    return;
  }
  const ok = await confirmDialog(
    "Clear this day?",
    `All ${state.tasks.length} tasks on ${state.date} will be deleted. This cannot be undone.`,
    "Delete all",
  );
  if (!ok) return;
  try {
    for (const t of state.tasks) await deleteTask(uid, t.id);
    toast("Day cleared", `${state.tasks.length} tasks removed.`, "success");
  } catch (err) {
    toast("Clear failed", err.message, "error");
  }
});

/* ============================================================
   Full ChatGPT Schedule Import
   ============================================================ */

$("#importBtn").addEventListener("click", openImportDialog);

function openImportDialog() {
  const ta = el("textarea", {
    rows: 12,
    placeholder: SAMPLE_JSON(state.date),
    spellcheck: "false",
    style: "font-family:var(--font-mono);font-size:12.5px;",
  });
  const dateInput = el("input", { type: "date", value: state.date });
  const errBox = el("div", { class: "form-error hidden" });
  const previewBox = el("div", { class: "import-preview hidden" });
  const summaryBox = el("div", {
    class: "muted hidden",
    style: "margin:6px 0;",
  });

  const body = el("div", {},
    el("p", { class: "muted", text:
      "Paste a JSON schedule prepared with ChatGPT. Nothing is saved until you confirm." }),
    errBox,
    el("div", { class: "field" },
      el("label", { text: "Target date" }),
      dateInput,
    ),
    el("div", { class: "field" },
      el("label", { text: "JSON payload" }),
      ta,
      el("div", { class: "hint", text:
        "Schema: { date: \"YYYY-MM-DD\", tasks: [{ title, category, startTime, endTime, priority?, notes? }] }" }),
    ),
    summaryBox,
    previewBox,
  );

  let lastPlan = null;
  let lastDupes = [];

  const refreshPreview = async () => {
    errBox.classList.add("hidden");
    previewBox.replaceChildren();
    previewBox.classList.add("hidden");
    summaryBox.classList.add("hidden");
    lastPlan = null;
    lastDupes = [];

    const raw = ta.value.trim();
    if (!raw) return;

    // Validate against the currently chosen target date.
    const { ok, errors, plan } = validateImport(raw, dateInput.value);
    if (errors.length) {
      errBox.textContent =
        errors.slice(0, 8).join("\n") +
        (errors.length > 8 ? `\n…and ${errors.length - 8} more.` : "");
      errBox.classList.remove("hidden");
      return;
    }
    if (!ok || !plan) return;

    // Duplicate detection against the chosen target date.
    const existing = await listTasksOnce(uid, plan.date);
    const dupes = findDuplicateCandidates(plan, existing);
    lastPlan = plan;
    lastDupes = dupes;

    // Build preview table.
    previewBox.append(el("div", {
      class: "row-item",
      style: "font-weight:600; background:var(--bg-elev-3);",
    },
      el("div", { text: "Time" }),
      el("div", { text: "Title" }),
      el("div", { text: "Category" }),
    ));

    for (const t of plan.tasks) {
      const isDupe = dupes.some(
        (d) => d.title === t.title && d.startTime === t.startTime,
      );
      previewBox.append(el("div", { class: `row-item ${isDupe ? "err" : ""}` },
        el("div", { class: "mono", text: `${t.startTime}–${t.endTime}` }),
        el("div", { text: t.title }),
        el("div", {
          class: "muted",
          text: t.category + (isDupe ? "  · duplicate" : ""),
        }),
      ));
    }
    previewBox.classList.remove("hidden");

    summaryBox.textContent =
      `${plan.tasks.length} task${plan.tasks.length === 1 ? "" : "s"} for ${plan.date}` +
      (dupes.length
        ? ` · ${dupes.length} duplicate${dupes.length === 1 ? "" : "s"} already exist`
        : "");
    summaryBox.classList.remove("hidden");
  };

  // Debounced so typing doesn't hammer Firestore with duplicate checks.
  let debounceHandle = null;
  const schedulePreview = () => {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(refreshPreview, 350);
  };

  ta.addEventListener("input", schedulePreview);
  dateInput.addEventListener("change", refreshPreview);

  const { close } = openModalShell({
    title: "Import schedule",
    body,
    actions: [
      { label: "Cancel", class: "btn-ghost" },
      {
        label: "Validate & preview",
        class: "btn",
        close: false,
        onClick: async () => { await refreshPreview(); },
      },
      {
        label: "Import",
        class: "btn-primary",
        close: false,
        onClick: async (btn) => {
          errBox.classList.add("hidden");

          // If the user hasn't previewed yet, preview now.
          if (!lastPlan) await refreshPreview();
          if (!lastPlan) {
            errBox.textContent = "Nothing to import yet — fix the payload above.";
            errBox.classList.remove("hidden");
            return;
          }

          // Duplicate confirmation.
          if (lastDupes.length) {
            const proceed = await confirmDialog(
              "Duplicates detected",
              `${lastDupes.length} of ${lastPlan.tasks.length} tasks already exist on ` +
              `${lastPlan.date} with the same title and start time. Import anyway?`,
              "Import anyway",
            );
            if (!proceed) return;
          }

          btn.disabled = true;
          try {
            const n = await bulkCreateTasks(uid, lastPlan.tasks, lastPlan.date);
            toast("Imported", `${n} tasks written to ${lastPlan.date}.`, "success");

            // If the import target differs from the currently viewed day,
            // jump the view to the imported date.
            if (lastPlan.date !== state.date) {
              state.date = lastPlan.date;
              datePicker.value = lastPlan.date;
              resubscribe();
            }
            close();
          } catch (e) {
            errBox.textContent = `Import failed: ${e.message}`;
            errBox.classList.remove("hidden");
          } finally {
            btn.disabled = false;
          }
        },
      },
    ],
  });

  // Clean up the debounce on close.
  const origClose = close;
  return {
    close: () => { clearTimeout(debounceHandle); origClose(); },
  };
}

function SAMPLE_JSON(date) {
  return `{
  "date": "${date}",
  "tasks": [
    { "title": "Discrete Structure study", "category": "Discrete Structure",
      "startTime": "11:00", "endTime": "13:00", "priority": "high", "notes": "" },
    { "title": "Photoshop practice", "category": "Photoshop",
      "startTime": "13:30", "endTime": "14:30", "priority": "medium", "notes": "" }
  ]
}`;
}

/* ---------- Cleanup on unload ---------- */
window.addEventListener("beforeunload", () => {
  try { state.unsub && state.unsub(); } catch {}
});