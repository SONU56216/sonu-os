/* ============================================================
   SONU OS — auth.js
   Authentication helpers + route guard.
   ============================================================ */

import { auth, isFirebaseConfigMissing } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { toast, toggleTheme } from "./ui.js";

/* ---------- Guard ---------- */

export function requireAuth() {
  return new Promise((resolve) => {
    if (isFirebaseConfigMissing()) {
      location.replace("./login.html");
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) {
        const here = location.pathname.split("/").pop() || "dashboard.html";
        sessionStorage.setItem("sonuos.redirectAfterLogin", here);
        location.replace("./login.html");
      } else {
        resolve(user);
      }
    });
  });
}

export function redirectIfAuthed(to = "./dashboard.html") {
  if (isFirebaseConfigMissing()) return;
  onAuthStateChanged(auth, (user) => {
    if (user) location.replace(to);
  });
}

/* ---------- Accessors ---------- */

export function currentUser() { return auth?.currentUser || null; }

export function onUserChanged(cb) {
  if (isFirebaseConfigMissing()) return () => {};
  return onAuthStateChanged(auth, cb);
}

/* ---------- Actions ---------- */

export async function logout() {
  try {
    await signOut(auth);
    sessionStorage.removeItem("sonuos.redirectAfterLogin");
    location.replace("./login.html");
  } catch (err) {
    toast("Sign-out failed", err?.message || "Please try again.", "error");
  }
}

/* ---------- Wire shared chrome ---------- */

export function wireShellActions() {
  const out = document.getElementById("logoutBtn");
  if (out) out.addEventListener("click", (e) => { e.preventDefault(); logout(); });

  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) themeBtn.addEventListener("click", () => toggleTheme());
}

/* ---------- Redirect-after-login helper ---------- */

export function consumeRedirectAfterLogin(fallback = "./dashboard.html") {
  const dest = sessionStorage.getItem("sonuos.redirectAfterLogin");
  if (dest) {
    sessionStorage.removeItem("sonuos.redirectAfterLogin");
    if (/^[a-z0-9_-]+\.html$/i.test(dest)) return `./${dest}`;
  }
  return fallback;
}