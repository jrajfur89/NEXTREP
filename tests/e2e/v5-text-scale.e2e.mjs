// V5 / DEVICE BUGFIX — large Android system font (S22: ≈130 % and the maximum) on the BUILT app, with
// the font scaling of WebView textZoom emulated (e2e/text-scale.mjs: fonts grow, boxes do not).
// BUG-V5-02: E01 tile names are never clipped (the tile grows); Compact B2 keeps all 7 labels visible
// (they wrap inside their tab and the bar grows — no icon-only mode, no smaller text).
// BUG-V5-03: the search hint is never cut (a shorter hint is shown when the long one does not fit);
// the field keeps its accessible name. At 100 % everything stays as approved (one-line B2, the long hint).
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, openApp } from "./lib.mjs";
import { TEXT_SCALE_SCRIPT } from "./text-scale.mjs";

const DIST = process.env.E2E_DIST;
const SIZES = [
  [360, 780],
  [390, 844],
];
const SCALES = [1, 1.3, 1.7, 2];
const NAV = 'nav[aria-label="Nawigacja główna"]';
const LABELS = ["Start", "Ćwiczenia", "Plany", "Trening", "Statystyki", "Historia", "Więcej"];
let srv;

// text of `root` clipped by any ancestor up to `stop` that hides overflow, or by `stop` itself
function clippedTexts(rootSel, stopSel) {
  return `(() => {
    const out = [];
    for (const stop of document.querySelectorAll(${JSON.stringify(stopSel)})) {
      const sr = stop.getBoundingClientRect();
      const walker = document.createTreeWalker(stop.querySelector(${JSON.stringify(rootSel)}) || stop, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const b of r.getClientRects()) {
          if (b.width === 0) continue;
          if (b.left < sr.left - 0.5 || b.right > sr.right + 0.5 || b.top < sr.top - 0.5 || b.bottom > sr.bottom + 0.5) out.push(n.textContent.trim() + " @ " + (stop.dataset.testid || stop.tagName));
          for (let a = el; a && a !== stop.parentElement; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
            const ar = a.getBoundingClientRect();
            if (b.left < ar.left - 0.5 || b.right > ar.right + 0.5 || b.top < ar.top - 0.5 || b.bottom > ar.bottom + 0.5) out.push(n.textContent.trim() + " clipped by " + a.tagName);
          }
        }
      }
    }
    return [...new Set(out)];
  })()`;
}

async function open(w, h, f) {
  const app = await openApp();
  const page = app.page;
  await page.setViewportSize({ width: w, height: h });
  await page.goto(srv.url);
  await page.evaluate(() => localStorage.setItem("nextrep1_onboarding_completed_v1", "true"));
  await page.addInitScript(TEXT_SCALE_SCRIPT(f));
  await page.reload();
  await page.getByTestId("nav-exercises").waitFor({ timeout: 20000 });
  await page.getByTestId("nav-exercises").click();
  await page.getByTestId("atlas-home").waitFor();
  await page.waitForTimeout(600);
  return app;
}

// the B2 bar: 7 tabs, every label visible, inside its tab, at the scaled size, accessible name = label
async function navState(page) {
  return page.evaluate((sel) => {
    const nav = document.querySelector(sel);
    const tabs = [...nav.querySelectorAll("button")];
    return {
      layout: nav.dataset.layout,
      height: nav.getBoundingClientRect().height,
      tabs: tabs.map((b) => {
        const l = b.querySelector("[data-nav-label]");
        const br = b.getBoundingClientRect();
        const lr = l.getBoundingClientRect();
        const cs = getComputedStyle(l);
        return {
          name: b.getAttribute("aria-label") || b.textContent.trim(),
          text: l.textContent.replace(/­/g, ""),
          visible: cs.visibility === "visible" && cs.display !== "none" && lr.width > 0 && lr.height > 0,
          inside: lr.left >= br.left - 0.5 && lr.right <= br.right + 0.5 && lr.top >= br.top - 0.5 && lr.bottom <= br.bottom + 0.5,
          overflow: l.scrollWidth > l.clientWidth + 1,
          fontSize: parseFloat(cs.fontSize),
        };
      }),
    };
  }, NAV);
}

// the search hint fits the field on one line (measured in the field's own font)
async function hintState(page) {
  return page.evaluate(() => {
    const i = document.querySelector("[data-atlas-search]");
    const cs = getComputedStyle(i);
    const c = document.createElement("canvas").getContext("2d");
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return { hint: i.placeholder, width: c.measureText(i.placeholder).width, room, fontSize: parseFloat(cs.fontSize) };
  });
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

describe("V5 / DEVICE BUGFIX — large system font (emulated textZoom) on the built app", { concurrency: false }, () => {
  before(async () => {
    srv = await serve(DIST);
  });
  after(() => {
    srv?.server.close();
  });

  for (const [w, h] of SIZES) {
    for (const f of SCALES) {
      test(`${w} × ${h} at ${Math.round(f * 100)} %: E01 tiles, B2 labels, search hint (E01, E03), no horizontal scroll`, async (t) => {
        const app = await open(w, h, f);
        const page = app.page;
        try {
          // BUG-V5-02 — E01 tiles: names and counts never clipped; tiles of one row equally tall
          const clipped = await page.evaluate(clippedTexts("span", '[data-tile="category"]'));
          assert.deepEqual(clipped, [], "no clipped tile text");
          const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-tile="category"]')].map((b) => [Math.round(b.getBoundingClientRect().top), Math.round(b.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().width)]));
          for (const [top, ht, wd] of tiles) {
            assert.ok(ht >= Math.floor((wd * 2) / 3) - 1, "3:2 stays the minimum");
            for (const [top2, ht2] of tiles) if (top2 === top) assert.equal(ht2, ht, "one row, one height");
          }
          if (f === 1) assert.ok(tiles.every(([, ht, wd]) => Math.abs(ht - (wd * 2) / 3) <= 1), "100 %: exactly 3:2 as approved");
          // BUG-V5-02 — B2: 7 labels visible, inside the tab, not smaller than 13 px × scale
          const nav = await navState(page);
          t.diagnostic(`B2 ${nav.layout}, ${nav.height}px`);
          assert.deepEqual(nav.tabs.map((x) => x.text), LABELS);
          assert.deepEqual(nav.tabs.map((x) => x.name), LABELS, "accessible names = labels (no soft hyphens)");
          for (const x of nav.tabs) {
            assert.ok(x.visible, `${x.text} visible`);
            assert.ok(x.inside, `${x.text} inside its tab`);
            assert.ok(!x.overflow, `${x.text} not overflowing`);
            assert.ok(x.fontSize >= 13 * f - 0.05, `${x.text} not shrunk (${x.fontSize})`);
          }
          if (f === 1) {
            assert.equal(nav.layout, "1row", "100 %: one-line B2 as approved");
            assert.equal(nav.height, 57);
          }
          assert.equal(await page.locator(`${NAV} [data-layout="icons"], ${NAV}[data-layout="icons"]`).count(), 0, "no icon-only mode");
          // BUG-V5-03 — the hint fits; the field keeps its name
          const e01 = await hintState(page);
          t.diagnostic(`E01 hint „${e01.hint}” ${e01.width.toFixed(1)} / ${e01.room}`);
          assert.ok(e01.width <= e01.room + 0.5, `E01 hint not cut: „${e01.hint}”`);
          if (f === 1) assert.equal(e01.hint, "Szukaj po nazwie lub aliasie", "100 %: the approved hint");
          assert.equal(await page.getByRole("searchbox", { name: "Szukaj ćwiczenia" }).count(), 1, "accessible name kept");
          assert.ok(await noHorizontalScroll(page), "E01 no horizontal scroll");
          await page.screenshot({ path: `e2e/.out/v5-E01-${w}-${Math.round(f * 100)}.png` }).catch(() => {});
          // E03 (Klatka piersiowa list)
          await page.getByTestId("atlas-category-chest").click();
          await page.waitForTimeout(500);
          const e03 = await hintState(page);
          t.diagnostic(`E03 hint „${e03.hint}” ${e03.width.toFixed(1)} / ${e03.room}`);
          assert.ok(e03.hint.length > 0 && e03.width <= e03.room + 0.5, `E03 hint not cut: „${e03.hint}”`);
          assert.ok(await noHorizontalScroll(page), "E03 no horizontal scroll");
          // B2 on another screen (Start)
          await page.getByTestId("nav-dashboard").click();
          await page.waitForTimeout(400);
          const nav2 = await navState(page);
          for (const x of nav2.tabs) assert.ok(x.visible && x.inside && !x.overflow, `Start: ${x.text}`);
          assert.ok(await noHorizontalScroll(page), "Start no horizontal scroll");
          assert.deepEqual(app.errors.filter((e) => e.startsWith("pageerror")), []);
        } finally {
          await app.browser.close();
        }
      });
    }
  }
});
