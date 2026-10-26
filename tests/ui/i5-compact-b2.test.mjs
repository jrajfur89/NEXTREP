// I5.5 — Compact B2 (ATLAS-UX-01 §6, DS-C04 proposal) and the bar hidden while the soft keyboard is
// open on every screen (D07, Q2), with the app's ONE keyboard detector (useSoftKeyboard /
// nrSoftKeyboardOpen, moved out of the Active Workout without changing its rule). The 7 tabs, order,
// labels, routing and aria-current stay checked by tests/ui/i4-b2-nav.test.mjs.
import { describe, test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, $, $$, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
const h = React.createElement;
const K = (n) => `nextrep1_guest_${n}_v1`;
let A;
after(async () => {
  await unmount();
});
// a visual viewport like Android's: an EventTarget with a height, „resize” when the keyboard moves
let vv = null;
function installViewport(height = window.innerHeight) {
  vv = new window.EventTarget();
  vv.height = height;
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true, writable: true });
  return vv;
}
afterEach(() => {
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true, writable: true });
});
const keyboard = async (open) => {
  vv.height = open ? window.innerHeight - 320 : window.innerHeight;
  await act(async () => vv.dispatchEvent(new window.Event("resize")));
  await flush(3, 1);
};
const focus = async (el) => {
  await act(async () => el.focus());
  await flush(3, 2);
};
const nav = () => $('nav[aria-label="Nawigacja główna"]');
const navVar = () => document.documentElement.style.getPropertyValue("--nr-nav-h");
async function boot(seed = {}) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.atlasBrowseReset();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(K(n), JSON.stringify(v));
  await mount(h(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
}

describe("Compact B2 parameters (handoff §6)", () => {
  test("row 56 px (also in the icon mode), icon 22, gap 2, bottom padding = the safe area only, side safe areas kept", async () => {
    A = A || (await loadApp());
    await unmount();
    await mount(h(A.BottomNav, { screen: "exercises", onNavigate() {} }));
    await flush(2, 1);
    const n = nav();
    assert.equal(n.dataset.variant, "B2");
    assert.equal(n.dataset.size, "compact");
    // jsdom drops env() values, so the declarations are checked in the component's source
    const css = A.BottomNav.toString();
    assert.match(css, /paddingBottom: "env\(safe-area-inset-bottom, 0px\)"/, "56 + inset, no 8 px minimum");
    assert.doesNotMatch(css, /max\(env\(safe-area-inset-bottom, 0px\), 8px\)/);
    assert.match(css, /paddingLeft: "env\(safe-area-inset-left, 0px\)"/);
    assert.match(css, /paddingRight: "env\(safe-area-inset-right, 0px\)"/);
    assert.equal(n.firstElementChild.style.gridAutoRows, "56px");
    assert.equal(n.firstElementChild.style.gridTemplateColumns, "repeat(7, minmax(0, 1fr))");
    for (const b of $$("button", n)) assert.equal(b.style.gap, "2px");
    const src = A.BottomNav.toString();
    assert.match(src, /size: 22/, "icon 22");
    assert.doesNotMatch(src, /size: 24/);
    assert.doesNotMatch(src, /62px/, "no 62 px row any more");
    // colours / active state unchanged
    const active = byTestId("nav-exercises");
    assert.equal(active.getAttribute("aria-current"), "page");
    assert.equal(active.style.color, "rgb(255, 133, 27)");
    assert.equal(byTestId("nav-plans").style.color, "rgb(184, 184, 184)");
    assert.equal(n.style.borderTop, "1px solid rgba(255, 133, 27, 0.45)");
  });

  test("content padding fallback of --nr-nav-h is 57 (56 + 1 px border) wherever the app sets it (the card Compact Tabs v3 is not touched)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["11-ui-shared.jsx", "17-exercises-plans.jsx", "17c-atlas-browse.jsx", "18-active-workout.jsx"]) {
      const s = readFileSync(new URL(`../../src/app/${f}`, import.meta.url), "utf8");
      assert.doesNotMatch(s, /--nr-nav-h, 71px/, f);
      assert.match(s, /--nr-nav-h, 57px/, f);
    }
  });
});

// V5 / KOREKTA B2 (owner decision): the bar has two modes — icons with labels when every label fits its
// tab (standard font), icons only when a label does not fit (large system font). jsdom has no layout, so
// the label and tab widths are stubbed; the real fonts are checked in e2e/v5-text-scale.e2e.mjs.
describe("Compact B2 modes: icons + labels / icons only (V5 / KOREKTA B2)", () => {
  const LABELS = ["Start", "Ćwiczenia", "Plany", "Trening", "Statystyki", "Historia", "Więcej"];
  let labelW = 40;
  const origRect = window.HTMLElement.prototype.getBoundingClientRect;
  const origCW = Object.getOwnPropertyDescriptor(window.Element.prototype, "clientWidth");
  const stub = () => {
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute && this.hasAttribute("data-nav-label")) return { width: labelW, height: 15, top: 0, left: 0, right: labelW, bottom: 15, x: 0, y: 0 };
      return origRect.call(this);
    };
    Object.defineProperty(window.Element.prototype, "clientWidth", { configurable: true, get() { return this.tagName === "BUTTON" ? 51 : 0; } });
  };
  const unstub = () => {
    window.HTMLElement.prototype.getBoundingClientRect = origRect;
    if (origCW) Object.defineProperty(window.Element.prototype, "clientWidth", origCW);
  };
  const remeasure = async (w) => {
    labelW = w;
    await act(async () => window.dispatchEvent(new window.Event("resize")));
    await flush(3, 1);
  };
  const tabs = () => $$("button", nav());
  const labelOf = (b) => b.querySelector("[data-nav-label]");

  test("standard font (labels fit): icons with visible labels; a label wider than its tab → icons only; fits again → labels back", async () => {
    A = A || (await loadApp());
    await unmount();
    stub();
    try {
      let went = null;
      await mount(h(A.BottomNav, { screen: "exercises", onNavigate(k) { went = k; } }));
      await remeasure(40);
      // mode 1: icons + labels
      assert.equal(nav().dataset.layout, "1row");
      assert.equal(tabs().length, 7);
      for (const [i, b] of tabs().entries()) {
        const l = labelOf(b);
        assert.equal(l.textContent, LABELS[i]);
        assert.equal(l.style.visibility, "visible");
        assert.equal(l.style.position, "relative");
        assert.equal(b.getAttribute("aria-label"), null, "name from the visible label");
        assert.ok(b.querySelector("svg"), "icon");
      }
      assert.equal(nav().firstElementChild.style.gridAutoRows, "56px");
      // mode 2: icons only (a label does not fit: 48 > 51 − 4)
      await remeasure(48);
      assert.equal(nav().dataset.layout, "icons");
      assert.equal(tabs().length, 7, "seven tabs");
      for (const [i, b] of tabs().entries()) {
        const l = labelOf(b);
        assert.equal(l.style.visibility, "hidden", `${LABELS[i]} hidden`);
        assert.equal(l.style.position, "absolute");
        assert.equal(b.getAttribute("aria-label"), LABELS[i], "full accessible name");
        assert.ok(b.querySelector("svg"), "icon");
      }
      assert.equal(nav().firstElementChild.style.gridAutoRows, "56px", "row stays 56 px");
      const active = byTestId("nav-exercises");
      assert.equal(active.getAttribute("aria-current"), "page");
      assert.equal(active.style.color, "rgb(255, 133, 27)");
      assert.equal(byTestId("nav-plans").getAttribute("aria-current"), null);
      assert.equal(byTestId("nav-plans").style.color, "rgb(184, 184, 184)");
      await click(byTestId("nav-history"));
      assert.equal(went, "history", "icons only still navigate");
      // back to labels
      await remeasure(30);
      assert.equal(nav().dataset.layout, "1row");
      for (const b of tabs()) {
        assert.equal(labelOf(b).style.visibility, "visible");
        assert.equal(b.getAttribute("aria-label"), null);
      }
    } finally {
      unstub();
    }
  });

  test("icons only + soft keyboard: the bar still hides with the keyboard and returns in icon mode", async () => {
    A = A || (await loadApp());
    await unmount();
    installViewport();
    stub();
    try {
      await mount(h("div", null, h("input", { id: "f" }), h(A.BottomNav, { screen: "dashboard", onNavigate() {} })));
      await remeasure(60);
      assert.equal(nav().dataset.layout, "icons");
      await focus(document.getElementById("f"));
      await keyboard(true);
      assert.equal(nav().style.display, "none");
      await act(async () => document.getElementById("f").blur());
      await keyboard(false);
      assert.notEqual(nav().style.display, "none");
      await remeasure(60);
      assert.equal(nav().dataset.layout, "icons");
      assert.equal(byTestId("nav-dashboard").getAttribute("aria-label"), "Start");
    } finally {
      unstub();
    }
  });
});

describe("B2 hidden while the soft keyboard is open — on every screen (D07, Q2)", () => {
  test("a text field focused + visual viewport > 120 px shorter → display none, --nr-nav-h 0; keyboard down → back", async () => {
    A = A || (await loadApp());
    await unmount();
    installViewport();
    await mount(h("div", null, h("input", { id: "f" }), h(A.BottomNav, { screen: "dashboard", onNavigate() {} })));
    await flush(2, 1);
    assert.notEqual(nav().style.display, "none");
    await focus(document.getElementById("f"));
    assert.notEqual(nav().style.display, "none", "focus alone (keyboard not up yet) hides nothing");
    await keyboard(true);
    assert.equal(nav().style.display, "none");
    assert.equal(nav().dataset.keyboard, "open");
    assert.equal(navVar(), "0px", "the content may use the whole height");
    await keyboard(false);
    assert.notEqual(nav().style.display, "none", "keyboard hidden by the system, field still focused");
    await keyboard(true);
    await act(async () => document.getElementById("f").blur());
    await flush(3, 2);
    assert.notEqual(nav().style.display, "none", "blur → back");
  });

  test("Android WebView with adjustResize (window shrinks too): the base is the viewport without the keyboard, not the window", async () => {
    A = A || (await loadApp());
    await unmount();
    const full = window.innerHeight;
    installViewport(full);
    await mount(h("div", null, h("input", { id: "f" }), h(A.BottomNav, { screen: "dashboard", onNavigate() {} })));
    await flush(2, 1);
    await focus(document.getElementById("f"));
    const orig = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerHeight", { value: full - 320, configurable: true });
    try {
      vv.height = full - 320;
      await act(async () => vv.dispatchEvent(new window.Event("resize")));
      await flush(3, 1);
      assert.equal(nav().style.display, "none");
    } finally {
      if (orig) Object.defineProperty(window, "innerHeight", orig);
      else delete window.innerHeight;
    }
  });

  test("a checkbox or a button does not count; without visualViewport the bar never hides", async () => {
    A = A || (await loadApp());
    await unmount();
    await mount(h("div", null, h("input", { id: "f" }), h(A.BottomNav, { screen: "dashboard", onNavigate() {} })));
    await focus(document.getElementById("f"));
    assert.notEqual(nav().style.display, "none", "no visualViewport → never hidden");
    assert.equal(A.nrSoftKeyboardOpen(), false);
    await unmount();
    installViewport();
    await mount(h("div", null, h("button", { id: "b" }, "x"), h(A.BottomNav, { screen: "dashboard", onNavigate() {} })));
    await focus(document.getElementById("b"));
    await keyboard(true);
    assert.notEqual(nav().style.display, "none");
  });

  test("whole app — Ćwiczenia (search E05) and Dashboard (name field): B2 hides with the keyboard and returns; Back with the keyboard open only hides it", async () => {
    installViewport();
    await boot();
    await click(byTestId("nav-exercises"));
    await flush(10, 3);
    const input = $('[data-testid="atlas-search"] input');
    await focus(input);
    await keyboard(true);
    assert.equal(nav().style.display, "none", "Ćwiczenia");
    await act(async () => window.dispatchEvent(new Event("popstate")));
    await flush(5, 2);
    assert.notEqual(document.activeElement, input, "Back hides the keyboard first (shared detector)");
    await keyboard(false);
    assert.notEqual(nav().style.display, "none");
    // Dashboard (another screen with B2): the name editor of the greeting
    await click(byTestId("nav-dashboard"));
    await flush(10, 3);
    await click(byTestId("dashboard-greeting"));
    await flush(5, 2);
    const name = $$("input").find((i) => i.type !== "checkbox");
    assert.ok(name, "the dashboard has a text field");
    await focus(name);
    await keyboard(true);
    assert.equal(nav().style.display, "none", "Dashboard");
    await act(async () => name.blur());
    await keyboard(false);
    assert.notEqual(nav().style.display, "none");
  });

  test("Active Workout (no B2) keeps its rule through the shared hook: dock and footer hidden while typing, back afterwards", async () => {
    installViewport();
    const BENCH = "bench_press_barbell_flat";
    const item = (id, exerciseId) => ({ id, exerciseId, catalogExerciseId: exerciseId, loadModel: null, restSeconds: 90, supersetGroup: null, setsDetail: [{ id: `${id}-1`, target: "6-8", rir: "1-2" }] });
    await boot({ plans: [{ id: "plan-a", name: "Push A", exercises: [item("pi-1", BENCH)] }] });
    await click(byTestId("dashboard-start"));
    await flush(10, 4);
    assert.ok(byTestId("active-workout"));
    assert.equal(nav(), null, "no B2 in a live workout");
    assert.ok($("[data-footer]") && $("[data-rest]"));
    const field = $$('[data-testid="active-workout"] input').find((i) => i.type !== "checkbox");
    await focus(field);
    await keyboard(true);
    assert.equal($("[data-footer]"), null, "footer hidden while typing");
    assert.equal($("[data-rest]"), null, "rest dock hidden while typing");
    await act(async () => field.blur());
    await keyboard(false);
    assert.ok($("[data-footer]") && $("[data-rest]"), "back after the keyboard");
  });
});
