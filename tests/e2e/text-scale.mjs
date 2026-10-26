// Android system font size (WebView textZoom) emulated in Chromium: every element's font-size — and a
// line-height given in px — is multiplied by `factor`, re-applied while React re-renders. Boxes, padding
// and gaps stay as authored, like textZoom on the phone. Used by e2e/v5-text-scale.e2e.mjs.
export const TEXT_SCALE_SCRIPT = (factor) => `(() => {
  const F = ${Number(factor)};
  if (F === 1) return;
  const mine = new WeakMap(); // element → { fs, lh, ofs, olh }: what we set and what was there before
  const restore = (e) => {
    const m = mine.get(e);
    if (!m) return;
    const s = e.style;
    if (Math.abs(parseFloat(s.getPropertyValue("font-size")) - parseFloat(m.fs)) < 0.01) { if (m.ofs) s.setProperty("font-size", m.ofs); else s.removeProperty("font-size"); }
    if (m.lh && Math.abs(parseFloat(s.getPropertyValue("line-height")) - parseFloat(m.lh)) < 0.01) { if (m.olh) s.setProperty("line-height", m.olh); else s.removeProperty("line-height"); }
    mine.delete(e);
  };
  const run = () => {
    const els = [...document.body.querySelectorAll("*")];
    els.forEach(restore);
    const base = els.map((e) => { const cs = getComputedStyle(e); return [e, parseFloat(cs.fontSize), cs.lineHeight.endsWith("px") ? parseFloat(cs.lineHeight) : null, e.style.getPropertyValue("font-size"), e.style.getPropertyValue("line-height")]; });
    base.forEach(([e, fs, lh, ofs, olh]) => {
      const m = { fs: (fs * F).toFixed(2) + "px", lh: lh != null ? (lh * F).toFixed(2) + "px" : null, ofs, olh };
      e.style.setProperty("font-size", m.fs);
      if (m.lh) e.style.setProperty("line-height", m.lh);
      mine.set(e, m);
    });
  };
  let t = null;
  const mo = new MutationObserver(() => {
    if (t) return;
    t = requestAnimationFrame(() => { t = null; mo.disconnect(); run(); observe(); });
  });
  const observe = () => mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class"] });
  const start = () => { run(); observe(); };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();`;
