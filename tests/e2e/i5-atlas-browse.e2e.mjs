// I5.3 / I5.4 — ATLAS-UX-01 E01 / E02 / E03 / E04 / E05 / E06 / E07 on the BUILT app (Chromium, offline) at 360 × 780 and
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
      if (el.getBoundingClientRect().width <= 1) continue; // visually hidden labels (P1)
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

describe("I5.3–I5.5 ATLAS-UX-01 screens and Compact B2 on the built app", { concurrency: false }, () => {
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

  for (const size of SIZES) {
    test(`${size[0]} × ${size[1]}: E05 search + alias, E07 no results, E04 sheet, E03 with a filter, E07 filters without results; Back`, async () => {
      await page.setViewportSize({ width: size[0], height: size[1] });
      await page.getByTestId("nav-exercises").click();
      await page.waitForTimeout(400);
      const problems = {};
      const check = async (name) => {
        const p = await layoutProblems();
        if (p.length) problems[name] = p;
        await shot(name, size);
      };
      const field = page.locator('[data-testid="atlas-search"] input');
      await field.click();
      assert.ok(await page.getByTestId("atlas-search-screen").isVisible(), "E05");
      await field.pressSequentially("wyciskanie hantli", { delay: 10 });
      await page.waitForTimeout(200);
      assert.equal(await page.getByTestId("atlas-results-count").innerText(), "7 wyników w całym Atlasie");
      assert.equal(await field.evaluate((el) => el === document.activeElement), true, "the field keeps the focus while E01 turns into E05");
      await check("E05-Szukaj");
      await field.fill("bench");
      await field.press("Enter");
      await page.waitForTimeout(200);
      assert.equal(await field.evaluate((el) => el === document.activeElement), false, "Enter hides the keyboard");
      assert.match(await page.locator('[data-testid="atlas-list-items"]').innerText(), /Też jako: Bench press/);
      await check("E05-Alias");
      await field.fill("przysiad bułgarski");
      await page.waitForTimeout(200);
      assert.equal(await page.getByTestId("atlas-no-results-primary").innerText(), "Szukaj „przysiad” · 2 wyniki");
      await check("E07-BrakWynikow");
      await page.goBack(); // no soft keyboard in desktop Chromium → Back ends the search
      await page.waitForTimeout(300);
      assert.ok(await page.getByTestId("atlas-home").isVisible(), "E05 → E01");
      assert.equal(await field.inputValue(), "");

      await tap('[data-testid="atlas-category-chest"]');
      await tap('[data-testid="atlas-filters-button"]');
      assert.ok(await page.locator('[role="dialog"]').isVisible(), "E04");
      await tap('[data-testid="atlas-chip-equipment-dumbbell"]');
      assert.equal((await page.getByTestId("atlas-filter-show").innerText()).replace(/\s+/g, " "), "Pokaż 12 ćwiczeń");
      const sheetProblems = await page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > window.innerWidth) out.push("horizontal scroll");
        for (const el of document.querySelectorAll('[role="dialog"] button')) {
          const r = el.getBoundingClientRect();
          if (r.height === 0) continue;
          if (r.width < 43.5 || r.height < 43.5) out.push(`target ${Math.round(r.width)}×${Math.round(r.height)} ${el.textContent}`);
          if (r.right > window.innerWidth + 0.5) out.push(`outside: ${el.textContent}`);
        }
        return out;
      });
      if (sheetProblems.length) problems["E04-Filtry"] = sheetProblems;
      await page.screenshot({ path: join(OUT, `i5-E04-Filtry-${size[0]}.png`), animations: "disabled", caret: "hide" });
      await page.goBack(); // Back closes the sheet
      await page.waitForTimeout(300);
      assert.equal(await page.locator('[role="dialog"]').count(), 0);
      assert.equal(await page.getByTestId("atlas-results-count").innerText(), "12 z 42 ćwiczeń");
      await check("E03-Filtry");
      await field.fill("smith");
      await field.press("Enter");
      await page.waitForTimeout(200);
      assert.equal((await page.getByTestId("atlas-filters-zero-primary").innerText()).replace(/\s+/g, " "), "Usuń filtry · 3 wyniki");
      await check("E07-FiltryZero");
      await page.goBack();
      await page.waitForTimeout(300);
      assert.ok(await page.getByTestId("atlas-home").isVisible(), "E03 → E01");
      assert.deepEqual(problems, {});
    });
  }

  // I5.5 — Compact B2 on every screen with the bar: 56 + 1 px border (no inset in Chromium), icon 22,
  // gap 2, every tab ≥ 48 × 48, labels fit (1 row), and at the end of each screen no content under it.
  for (const size of SIZES) {
    test(`${size[0]} × ${size[1]}: Compact B2 on Start, Ćwiczenia (E01 / E03 end), Plany, Trening, Statystyki, Historia, Więcej — sizes and nothing under the bar`, async () => {
      await page.setViewportSize({ width: size[0], height: size[1] });
      const problems = {};
      const measure = async (name) => {
        await page.waitForTimeout(350);
        await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(async () => {
          const out = [];
          const nav = document.querySelector('nav[aria-label="Nawigacja główna"]');
          const nr = nav.getBoundingClientRect();
          if (Math.round(nr.height) !== 57) out.push(`bar height ${nr.height}`);
          if (nav.dataset.layout !== "1row") out.push(`layout ${nav.dataset.layout}`);
          const v = getComputedStyle(document.documentElement).getPropertyValue("--nr-nav-h").trim();
          if (v !== "57px") out.push(`--nr-nav-h ${v}`);
          for (const b of nav.querySelectorAll("button")) {
            const br = b.getBoundingClientRect();
            if (br.width < 48 || br.height < 48) out.push(`tab ${Math.round(br.width)}×${Math.round(br.height)}`);
            const svg = b.querySelector("svg");
            if (Math.round(svg.getBoundingClientRect().width) !== 22) out.push(`icon ${svg.getBoundingClientRect().width}`);
            const lab = b.querySelector("[data-nav-label]");
            const gap = lab.getBoundingClientRect().top - svg.getBoundingClientRect().bottom;
            if (Math.abs(gap - 2) > 0.6) out.push(`gap ${gap.toFixed(1)}`);
            if (lab.getBoundingClientRect().width > br.width - 4) out.push(`label too wide: ${lab.textContent}`);
          }
          window.scrollTo(0, document.documentElement.scrollHeight);
          await new Promise((res) => setTimeout(res, 150));
          const top = nav.getBoundingClientRect().top;
          for (const el of document.querySelectorAll("body *")) {
            if (nav.contains(el) || el.closest('[role="dialog"]')) continue;
            const cs = getComputedStyle(el);
            if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
            const leaf = el.matches("button, a, input, h1, h2, h3, p, li") || (el.children.length === 0 && el.textContent.trim());
            if (!leaf) continue;
            if (el.closest("[style*='position: fixed'], .fixed")) continue;
            const er = el.getBoundingClientRect();
            if (er.height === 0 || er.width <= 1) continue;
            if (er.bottom > top + 0.5 && er.top < window.innerHeight) out.push(`under the bar: ${(el.getAttribute("aria-label") || el.textContent).trim().slice(0, 30)}`);
          }
          window.scrollTo(0, 0);
          return [...new Set(out)];
        });
        if (r.length) problems[name] = r;
      };
      for (const [name, tid] of [["Start", "nav-dashboard"], ["Plany", "nav-plans"], ["Trening", "nav-startWorkout"], ["Statystyki", "nav-stats"], ["Historia", "nav-history"], ["Więcej", "nav-more"], ["Ćwiczenia", "nav-exercises"]]) {
        await page.getByTestId(tid).click();
        await measure(name);
      }
      await page.screenshot({ path: join(OUT, `i5-B2-E01-${size[0]}.png`), animations: "disabled", caret: "hide" });
      await tap('[data-testid="atlas-category-chest"]');
      await measure("E03-Klatka (long list)");
      await page.getByTestId("nav-dashboard").click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `i5-B2-Start-${size[0]}.png`), animations: "disabled", caret: "hide" });
      await page.getByTestId("nav-startWorkout").click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `i5-B2-Trening-${size[0]}.png`), animations: "disabled", caret: "hide" });
      assert.deepEqual(problems, {});
    });
  }

  test("no page errors, no network", async () => {
    assert.deepEqual(app.errors.filter((e) => e.startsWith("pageerror")), []);
    assert.deepEqual(app.blocked.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u)), []);
  });
});
