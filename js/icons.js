/* ============================================================
   SONU OS — icons.js
   Loads Lucide icons from CDN. If the CDN is unreachable, icons
   degrade gracefully (elements just show their text/label).
   Call `renderIcons(root)` after building DOM that contains
   elements with `data-lucide="name"` attributes.
   ============================================================ */

let lucideReady = null;

/** Lazily import Lucide once. Returns a promise that resolves to the module or null. */
function loadLucide() {
  if (lucideReady) return lucideReady;
  lucideReady = import("https://unpkg.com/lucide@0.451.0/dist/esm/lucide.js")
    .catch(() => null);
  return lucideReady;
}

/** Replace [data-lucide] placeholders with real SVG icons, if Lucide loaded. */
export async function renderIcons(root = document) {
  const mod = await loadLucide();
  if (!mod || typeof mod.createIcons !== "function") return;
  try {
    mod.createIcons({
      nameAttr: "data-lucide",
      attrs: { "stroke-width": 1.75 },
      root: root instanceof Element ? root : document,
    });
  } catch {
    /* silent — icons are cosmetic */
  }
}