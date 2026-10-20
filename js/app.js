/* ============================================================
   SONU OS — app.js
   Bootstrap for protected pages. Call bootstrapProtectedPage()
   from each page's module script after DOM is ready.
   ============================================================ */

import { initTheme, initSidebar, initNetworkStatus, toast } from "./ui.js";
import { isFirebaseConfigMissing } from "./firebase.js";

/** Show a friendly setup notice if Firebase isn't configured yet. */
function showSetupNotice() {
  const wrap = document.createElement("div");
  wrap.className = "container";
  wrap.style.padding = "60px 20px";
  wrap.innerHTML = ""; // safe — static template below
  const card = document.createElement("div");
  card.className = "card";
  const h = document.createElement("h1"); h.textContent = "SONU OS — Firebase setup required";
  const p1 = document.createElement("p"); p1.textContent =
    "Open js/firebase-config.js and paste your Firebase web config values.";
  const p2 = document.createElement("p"); p2.className = "muted"; p2.textContent =
    "The web config is public and safe to commit. Never put Admin SDK keys or service-account JSON in the frontend.";
  card.append(h, p1, p2);
  wrap.append(card);
  document.body.innerHTML = "";
  document.body.append(wrap);
}

/** Bootstraps a protected page: theme, sidebar, network status, clock. */
export function bootstrapShell({ activeNav } = {}) {
  initTheme();
  initSidebar();
  initNetworkStatus();
  if (activeNav) {
    document.querySelectorAll(".nav-link").forEach((a) => {
      if (a.dataset.nav === activeNav) a.classList.add("active");
    });
  }
  const clock = document.querySelector("[data-clock]");
  const dateNode = document.querySelector("[data-today]");
  if (clock) {
    const tick = () => {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };
    tick(); setInterval(tick, 1000);
  }
  if (dateNode) {
    dateNode.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }
}

export { isFirebaseConfigMissing, toast, showSetupNotice };