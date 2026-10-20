/* ============================================================
   SONU OS — profile-page.js
   ============================================================ */

import { requireAuth, wireShellActions } from "./auth.js";
import { bootstrapShell } from "./app.js";
import { toast } from "./ui.js";
import { formatDuration } from "./utils.js";
import { updateUserProfile, watchUserProfile } from "./user.js";

bootstrapShell({ activeNav: "profile" });
wireShellActions();

const user = await requireAuth();
const uid = user.uid;

const form = document.getElementById("profileForm");
const err = document.createElement("div");
err.className = "form-error hidden";
form.prepend(err);

let lastUser = null;

watchUserProfile(uid, (u) => {
  lastUser = u;
  if (!form.dataset.populated) {
    form.displayName.value = u.displayName || user.displayName || "";
    form.photoURL.value = u.photoURL || "";
    form.intro.value = u.intro || "";
    form.goals.value = u.goals || "";
    form.dataset.populated = "1";
  }

  document.getElementById("pTotalTasks").textContent = String(u.totalTasksCompleted ?? 0);
  document.getElementById("pTotalFocus").textContent = formatDuration(u.totalFocusMinutes ?? 0);
  document.getElementById("pStreak").textContent = String(u.currentStreak ?? 0);
  document.getElementById("pLongest").textContent = String(u.longestStreak ?? 0);
  document.getElementById("pSince").textContent = u.createdAt?.toDate
    ? u.createdAt.toDate().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.classList.add("hidden");
  const btn = document.getElementById("saveProfileBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const patch = {
      displayName: String(form.displayName.value).trim().slice(0, 60),
      photoURL: String(form.photoURL.value).trim().slice(0, 500),
      intro: String(form.intro.value).trim().slice(0, 400),
      goals: String(form.goals.value).trim().slice(0, 400),
    };
    if (!patch.displayName) throw new Error("Display name is required.");
    await updateUserProfile(uid, patch);
    toast("Profile saved", "", "success");
  } catch (e2) {
    err.textContent = e2.message || "Could not save profile.";
    err.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Save changes";
  }
});