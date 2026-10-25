// I5.3 — ATLAS-UX-01 E01 / E02 / E03 / E06 on the BUILT app (Chromium, offline) at 360 × 780 and
// 390 × 844: the walk E01 → E02 → E03 → E06 → Back, and the layout rules of the design check —
// no horizontal scroll, nothing cut, touch targets ≥ 44, the last element ≥ 16 px above B2.
// Screenshots for the visual review go to e2e/.out/i5-<screen>-<width>.png.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { serve, openApp } from "./lib.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), ".out");
const DIST = process.env.E2E_DIST;
const SIZES = [
  [360, 780],
  [390, 844],
];
let srv, app, page;

// layout problems of the current screen (scrolled to its very end)
async function layoutProblems() {
  return page.evaluate(async () => {
    const out = [];
    const root = document.querySelector("[data-screen]");
    if (document.documentElement.scrollWidth > window.innerWidth) out.push(`horizontal scroll ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    for (const el of root.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible") out.push(`cut: ${el.textContent.trim().slice(0, 40)}`);
      if (el.matches("button, a, input")) {
        const r = el.getBoundingClientRect();
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.push(`target ${Math.round(r.width)}×${Math.round(r.height)}: ${(el.getAttribute("aria-label") || el.textContent).trim().slice(0, 40)}`);
        if (r.right > window.innerWidth + 0.5 || r.left < -0.5) out.push(`outside the screen: ${el.textContent.trim().slice(0, 40)}`);
      }
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 120));
    const nav = document.querySelector('nav[aria-label="Nawigacja główna"]');
    const navTop = nav.getBoundingClientRect().top;
    const items = [...root.children].filter((el) => el.tagName !== "STYLE" && el.getBoundingClientRect().height > 0);
    const last = items[items.length - 1];
    const gap = navTop - last.getBoundingClientRect().bottom;
    if (gap < 16 - 0.5) out.push(`last element only ${gap.toFixed(1)} px above B2`);
    window.scrollTo(0, 0);
    return out;
  });
}
async function shot(name, [w]) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `i5-${name}-${w}.png`), animations: "disabled", caret: "hide", fullPage: true });
}
const tap = async (sel) => {
  await page.locator(sel).first().click();
  await page.waitForTimeout(250);
};

describe("I5.3 ATLAS-UX-01 screens on the built app", { concurrency: false }, () => {
  before(async () => {
    mkdirSync(OUT, { recursive: true });
    srv = await serve(DIST);
    app = await openApp();
    page = app.page;
    await page.goto(srv.url);
    await page.evaluate(() => localStorage.setItem("nextrep1_onboarding_completed_v1", "true"));
    await page.reload();
    await page.getByTestId("nav-exercises").waitFor({ timeout: 20000 });
  });
  after(async () => {
    await app?.browser.close();
    srv?.server.close();
  });

  for (const size of SIZES) {
    test(`${size[0]} × ${size[1]}: E01 → E02 (Plecy, Nogi) → E03 (Klatka 42, Najszerszy, Wszystkie 55) → E06 → Back; layout rules`, async () => {
      await page.setViewportSize({ width: size[0], height: size[1] });
      await page.getByTestId("nav-exercises").click();
      await page.waitForTimeout(400);
      await page.evaluate(() => document.fonts.ready);
      const problems = {};
      const check = async (name) => {
        const p = await layoutProblems();
        if (p.length) problems[name] = p;
        await shot(name, size);
      };

      assert.ok(await page.getByTestId("atlas-home").isVisible());
      await check("E01");
      await tap('[data-testid="atlas-category-back"]');
      assert.match(await page.getByTestId("atlas-category-summary").innerText(), /5 ćwiczeń · 3 podpartie/);
      await check("E02-Plecy");
      await tap('[data-tile="subregion"]');
      assert.equal(await page.getByTestId("atlas-list-title").innerText(), "Najszerszy grzbietu");
      await check("E03-Najszerszy");
      await tap('[data-testid="atlas-row"]');
      assert.ok(await page.getByTestId("atlas-detail").isVisible(), "E06");
      await page.goBack(); // hardware Back
      await page.waitForTimeout(300);
      assert.equal(await page.getByTestId("atlas-list-title").innerText(), "Najszerszy grzbietu", "E06 → E03");
      await page.goBack();
      await page.waitForTimeout(300);
      assert.ok(await page.getByTestId("atlas-category").isVisible(), "E03 → E02");
      await page.goBack();
      await page.waitForTimeout(300);
      assert.ok(await page.getByTestId("atlas-home").isVisible(), "E02 → E01");

      await tap('[data-testid="atlas-category-legs"]');
      await check("E02-Nogi");
      await page.getByTestId("atlas-back").click(); // on-screen Back
      await page.waitForTimeout(300);
      await tap('[data-testid="atlas-category-chest"]');
      assert.equal(await page.locator('[data-testid="atlas-row"]').count(), 42);
      await check("E03-Klatka");
      await page.getByTestId("atlas-back").click();
      await page.waitForTimeout(300);
      await tap('[data-testid="atlas-all"]');
      assert.equal(await page.locator('[data-testid="atlas-row"]').count(), 55);
      await check("E03-Wszystkie");
      await page.goBack();
      await page.waitForTimeout(300);
      assert.ok(await page.getByTestId("atlas-home").isVisible());
      assert.deepEqual(problems, {});
    });
  }

  test("no page errors, no network", async () => {
    assert.deepEqual(app.errors.filter((e) => e.startsWith("pageerror")), []);
    assert.deepEqual(app.blocked.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u)), []);
  });
});
