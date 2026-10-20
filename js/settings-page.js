/* ============================================================
   SONU OS — settings-page.js
   ============================================================ */

import { requireAuth, wireShellActions } from "./auth.js";
import { bootstrapShell } from "./app.js";
import { toast, confirmDialog, openModal, setTheme } from "./ui.js";
import { el } from "./utils.js";
import { watchUserProfile } from "./user.js";
import {
  savePreferences, loadAllUserData, downloadJson, downloadTasksCsv,
  deleteAccountAndData, recalcLastNDays,
} from "./settings.js";

bootstrapShell({ activeNav: "settings" });
wireShellActions();

const user = await requireAuth();
const uid = user.uid;

const prefsForm = document.getElementById("prefsForm");
let lastUser = null;

watchUserProfile(uid, (u) => {
  lastUser = u;
  if (!prefsForm.dataset.populated) {
    prefsForm.themePref.value = u.theme || document.documentElement.dataset.theme || "dark";
    prefsForm.timeFormat.value = u.timeFormat || "24";
    prefsForm.weekStart.value = String(u.weekStart ?? 1);
    prefsForm.streakType.value = u.streakRule?.type || "anyTaskCompleted";
    const f = u.focusDurations || { focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 };
    prefsForm.focusMin.value = f.focus;
    prefsForm.shortMin.value = f.shortBreak;
    prefsForm.longMin.value = f.longBreak;
    prefsForm.longEvery.value = f.longEvery;
    prefsForm.dataset.populated = "1";
  }
});

prefsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = prefsForm.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const prefs = {
      theme: prefsForm.themePref.value,
      timeFormat: prefsForm.timeFormat.value,
      weekStart: Number(prefsForm.weekStart.value),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      streakRule: { type: prefsForm.streakType.value },
      focusDurations: {
        focus: Number(prefsForm.focusMin.value),
        shortBreak: Number(prefsForm.shortMin.value),
        longBreak: Number(prefsForm.longMin.value),
        longEvery: Number(prefsForm.longEvery.value),
      },
      notifications: lastUser?.notifications || { toastOnComplete: true },
    };
    await savePreferences(uid, prefs);
    setTheme(prefs.theme);
    toast("Preferences saved", "", "success");
  } catch (err) {
    toast("Could not save preferences", err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Save preferences";
  }
});

document.getElementById("exportJsonBtn").addEventListener("click", async () => {
  try {
    const payload = await loadAllUserData(uid);
    downloadJson(payload, `sonu-os-${new Date().toISOString().slice(0,10)}.json`);
    toast("Export ready", "JSON download started.", "success");
  } catch (err) {
    toast("Export failed", err.message, "error");
  }
});

document.getElementById("exportCsvBtn").addEventListener("click", async () => {
  try {
    const payload = await loadAllUserData(uid);
    downloadTasksCsv(payload.tasks, `sonu-os-tasks-${new Date().toISOString().slice(0,10)}.csv`);
    toast("Export ready", "CSV download started.", "success");
  } catch (err) {
    toast("Export failed", err.message, "error");
  }
});

(function addRecalcButton() {
  const wrap = document.getElementById("exportJsonBtn").parentElement;
  const btn = el("button", { class: "btn btn-ghost", type: "button", text: "Recalculate last 30 days" });
  btn.addEventListener("click", async () => {
    const ok = await confirmDialog("Recalculate?", "Rebuild dailyRecords for the last 30 days from stored tasks.", "Recalculate");
    if (!ok) return;
    btn.disabled = true;
    try {
      const n = await recalcLastNDays(uid, 30);
      toast("Recalculated", `${n} days rebuilt.`, "success");
    } catch (err) {
      toast("Recalculate failed", err.message, "error");
    } finally { btn.disabled = false; }
  });
  wrap.append(btn);
})();

document.getElementById("deleteAccountBtn").addEventListener("click", () => {
  const passwordInput = el("input", { type: "password", placeholder: "Current password", autocomplete: "current-password" });
  const typed = el("input", { type: "text", placeholder: 'Type DELETE to confirm' });
  const err = el("div", { class: "form-error hidden" });
  const body = el("div", {},
    err,
    el("p", { text:
      "This permanently deletes your profile, tasks, daily records, focus sessions, and activity logs, " +
      "and then deletes your Firebase Authentication account. There is no undo." }),
    el("div", { class: "field" }, el("label", { text: "Password" }), passwordInput),
    el("div", { class: "field" }, el("label", { text: 'Type DELETE to confirm' }), typed),
  );
  const { close } = openModal({
    title: "Delete account and all data",
    body,
    actions: [
      { label: "Cancel", class: "btn-ghost" },
      { label: "Delete everything", class: "btn-danger", close: false,
        onClick: async () => {
          err.classList.add("hidden");
          if (typed.value.trim() !== "DELETE") { err.textContent = 'Type DELETE exactly.'; err.classList.remove("hidden"); return; }
          if (!passwordInput.value) { err.textContent = "Password is required."; err.classList.remove("hidden"); return; }
          try {
            await deleteAccountAndData({
              uid, email: user.email, password: passwordInput.value,
              onProgress: (msg) => { err.textContent = msg; err.classList.remove("hidden"); },
            });
            toast("Account deleted", "Redirecting…", "success");
            setTimeout(() => location.replace("./login.html"), 400);
          } catch (e2) {
            err.textContent = e2.message || "Deletion failed.";
            err.classList.remove("hidden");
          }
        } },
    ],
  });
});