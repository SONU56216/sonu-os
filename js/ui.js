/* ============================================================
   SONU OS — ui.js
   Shared UI: theme toggle, sidebar, toast, modal, network status.
   ============================================================ */

import { $, el } from "./utils.js";

/* ---------- Theme ---------- */
const THEME_KEY = "sonuos.theme";
export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.dataset.theme = saved;
  return saved;
}
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
}
export function toggleTheme() {
  const cur = document.documentElement.dataset.theme || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
}

/* ---------- Toast ---------- */
function ensureToastWrap() {
  let w = $(".toast-wrap");
  if (!w) { w = el("div", { class: "toast-wrap" }); document.body.append(w); }
  return w;
}
export function toast(title, body = "", kind = "") {
  const wrap = ensureToastWrap();
  const node = el("div", { class: `toast ${kind}` },
    el("div", { class: "t-title", text: title }),
    body ? el("div", { class: "t-body", text: body }) : null
  );
  wrap.append(node);
  setTimeout(() => {
    node.style.transition = "opacity .2s, transform .2s";
    node.style.opacity = "0";
    node.style.transform = "translateY(4px)";
    setTimeout(() => node.remove(), 220);
  }, 3200);
}

/* ---------- Modal helper ---------- */
export function openModal({ title, body, actions = [] }) {
  const scrim = el("div", { class: "modal-scrim show" });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
  const head  = el("div", { class: "modal-head" }, el("h3", { text: title }));
  const bd    = el("div", { class: "modal-body" });
  if (typeof body === "string") bd.append(el("p", { text: body }));
  else if (body instanceof Node) bd.append(body);

  const foot = el("div", { class: "modal-foot" });
  for (const a of actions) {
    const btn = el("button", {
      class: `btn ${a.class || ""}`,
      text: a.label,
      onclick: () => { if (a.onClick) a.onClick(); if (a.close !== false) close(); },
    });
    foot.append(btn);
  }
  modal.append(head, bd, foot);
  scrim.append(modal);
  document.body.append(scrim);
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  function close() {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
  }
  return { close, root: modal, body: bd };
}

export function confirmDialog(title, message, confirmLabel = "Confirm") {
  return new Promise((resolve) => {
    openModal({
      title,
      body: message,
      actions: [
        { label: "Cancel", class: "btn-ghost", onClick: () => resolve(false) },
        { label: confirmLabel, class: "btn-danger", onClick: () => resolve(true) },
      ],
    });
  });
}

/* ---------- Sidebar (mobile drawer) ---------- */
export function initSidebar() {
  const sb = $(".sidebar");
  const sc = $(".scrim");
  const btn = $(".hamburger");
  if (!sb || !btn) return;
  const close = () => { sb.classList.remove("open"); sc?.classList.remove("show"); };
  const open  = () => { sb.classList.add("open");  sc?.classList.add("show"); };
  btn.addEventListener("click", open);
  sc?.addEventListener("click", close);
  sb.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
}

/* ---------- Network status ---------- */
export function initNetworkStatus() {
  const dot = $(".net-dot");
  const txt = $(".net-text");
  if (!dot) return;
  const update = () => {
    const on = navigator.onLine;
    dot.classList.toggle("offline", !on);
    if (txt) txt.textContent = on ? "Online" : "Offline";
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

/* ---------- Live clock ---------- */
export function startClock(node, opts = {}) {
  if (!node) return;
  const tick = () => {
    const now = new Date();
    node.textContent = now.toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };
  tick(); setInterval(tick, 1000);
  if (opts.dateNode) {
    opts.dateNode.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }
}

/* ---------- Skeleton helper ---------- */
export function skeletonLines(container, n = 3) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < n; i++) {
    container.append(el("div", { class: "skeleton", style: `width:${60 + Math.random()*35}%; margin:8px 0;` }));
  }
}