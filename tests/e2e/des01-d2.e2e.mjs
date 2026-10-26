// DES-01 / D2 on the BUILT app (Chromium, offline): E01 „Twoje”, Ulubione, Moje ćwiczenia (active / archived),
// the card with badges, the „Więcej” sheet and the private-name sheet at 360 × 780 and 390 × 844, with the
// system font at 100 % and 130 % (emulated WebView textZoom, e2e/text-scale.mjs). Layout rules of the design
// check (no horizontal scroll, nothing cut, targets ≥ 44, the last element ≥ 16 px above B2) and axe
// (WCAG 2.x A / AA) on every screen and sheet. Screenshots: e2e/.out/d2-<screen>-<width>-<scale>.png.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { serve, openApp } from "./lib.mjs";
import { TEXT_SCALE_SCRIPT } from "./text-scale.mjs";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const OUT = join(dirname(fileURLToPath(import.meta.url)), ".out");
const DIST = process.env.E2E_DIST;
const CASES = [
  [360, 780, 1],
  [390, 844, 1],
  [360, 780, 1.3],
  [390, 844, 1.3],
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const NOW = "2026-10-26T10:00:00.000Z";
const OWN = { exerciseId: "00000000-0000-4000-8000-000000000001", scope: "private", namePl: "Wyciskanie w garażu na ławce", equipment: ["barbell", "bench"], primaryMuscles: ["pectoralis_major"], secondaryMuscles: [], variantAttributes: ["angle.flat"], measurementType: "weight_reps", loadModel: "barbell_total", implements: null, laterality: "bilateral", repsCounting: "total", status: "active", archivedReason: null, entryRev: 1, createdAt: NOW, updatedAt: NOW, archivedAt: null };
const ARCH = { ...OWN, exerciseId: "00000000-0000-4000-8000-000000000002", namePl: "Stare uginanie hantlami", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], variantAttributes: [], loadModel: "dumbbell_pair", implements: 2, status: "archived", archivedReason: "Zarchiwizowane przez użytkownika", archivedAt: NOW };
const SEED = {
  user_exercises: [OWN, ARCH],
  favourites: [{ exerciseId: "bench_press_barbell_flat", addedAt: NOW }, { exerciseId: OWN.exerciseId, addedAt: NOW }, { exerciseId: ARCH.exerciseId, addedAt: NOW }],
  exercise_names: { bench_press_barbell_flat: { name: "Klata płasko — moja nazwa", updatedAt: NOW } },
};
let srv;

async function layoutProblems(page, { lastAboveNav = true } = {}) {
  return page.evaluate(async (lastAboveNav) => {
    const out = [];
    const root = document.querySelector("[data-screen]");
    if (document.documentElement.scrollWidth > window.innerWidth) out.push(`horizontal scroll ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    for (const el of document.querySelectorAll("[data-screen] *, [role='dialog'] *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (el.getBoundingClientRect().width <= 1) continue;
      if (el.closest("[inert]")) continue;
      if (el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible") out.push(`cut: ${el.textContent.trim().slice(0, 40)}`);
      if (el.matches("button, a, input")) {
        const r = el.getBoundingClientRect();
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.push(`target ${Math.round(r.width)}×${Math.round(r.height)}: ${(el.getAttribute("aria-label") || el.textContent).trim().slice(0, 40)}`);
        if (r.right > window.innerWidth + 0.5 || r.left < -0.5) out.push(`outside the screen: ${el.textContent.trim().slice(0, 40)}`);
      }
    }
    if (lastAboveNav) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 120));
      const nav = document.querySelector('nav[aria-label="Nawigacja główna"]');
      const items = [...root.children].filter((el) => el.tagName !== "STYLE" && el.tagName !== "NAV" && getComputedStyle(el).position !== "fixed" && el.getBoundingClientRect().height > 0);
      const last = items[items.length - 1];
      const gap = nav.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
      if (gap < 16 - 0.5) out.push(`last element only ${gap.toFixed(1)} px above B2`);
      window.scrollTo(0, 0);
    }
    return out;
  }, lastAboveNav);
}
async function axe(page) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 4) }));
  }, TAGS);
}

describe("DES-01 / D2 screens on the built app", { concurrency: false }, () => {
  before(async () => {
    mkdirSync(OUT, { recursive: true });
    srv = await serve(DIST);
  });
  after(() => {
    srv?.server.close();
  });

  for (const [w, h, f] of CASES) {
    test(`${w} × ${h} at ${Math.round(f * 100)} %: E01 „Twoje”, Ulubione, Moje ćwiczenia, card, „Więcej”, private name — layout and axe`, async (t) => {
      const app = await openApp();
      const page = app.page;
      const found = {};
      const check = async (name, opts) => {
        await page.waitForTimeout(250);
        const p = await layoutProblems(page, opts);
        const v = await axe(page);
        if (p.length) found[`${name} layout`] = p;
        if (v.length) found[`${name} axe`] = v;
        await page.screenshot({ path: join(OUT, `d2-${name}-${w}-${Math.round(f * 100)}.png`), animations: "disabled", caret: "hide" });
      };
      try {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(srv.url);
        await page.evaluate((seed) => {
          localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
          for (const [k, v] of Object.entries(seed)) localStorage.setItem(`nextrep1_guest_${k}_v1`, JSON.stringify(v));
        }, SEED);
        await page.addInitScript(TEXT_SCALE_SCRIPT(f));
        await page.reload();
        await page.getByTestId("nav-exercises").click();
        await check("E01");
        assert.equal(await page.getByTestId("atlas-tile-favourites-count").textContent(), "3 ćwiczenia");
        await page.getByTestId("atlas-tile-favourites").click();
        await check("Ulubione");
        await page.locator('[data-testid="atlas-row"]').first().click();
        await check("Karta", { lastAboveNav: false });
        await page.getByTestId("atlas-detail-more").click();
        await check("Wiecej", { lastAboveNav: false });
        await page.getByTestId("atlas-menu-rename").click();
        await check("Nazwa", { lastAboveNav: false });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
        await page.goBack();
        await page.waitForTimeout(200);
        await page.goBack();
        await page.waitForTimeout(200);
        await page.getByTestId("atlas-tile-mine").click();
        await check("Moje");
        await page.getByTestId("atlas-mine-view-archived").click();
        await check("Moje-Zarchiwizowane");
        t.diagnostic(Object.keys(found).length ? JSON.stringify(found) : "no problems");
        assert.deepEqual(found, {});
        assert.deepEqual(app.errors.filter((e) => e.startsWith("pageerror")), []);
      } finally {
        await app.browser.close();
      }
    });
  }
});
