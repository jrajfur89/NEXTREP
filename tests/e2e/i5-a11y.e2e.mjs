// I5.7 — automatic accessibility check (axe-core 4.10.2, WCAG 2.0 / 2.1 / 2.2 A + AA rules) of the
// ATLAS-UX-01 screens on the BUILT app at 360 × 780 and 390 × 844: E01, E02, E03, E04 (sheet), E05,
// E07 (no results, filters without results), the card Compact Tabs v3 (E06, reported only — not changed
// in I5) and Compact B2 on Start. Manual TalkBack checks stay for V5.
// Known global finding outside I5: `meta-viewport` — index.html sets maximum-scale=1 (pinch zoom
// limited, WCAG 1.4.4). index.html is a frozen file (n0), so the rule is checked on its own below and
// left out of the per-screen runs; the change needs a separate decision.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { serve, openApp } from "./lib.mjs";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const DIST = process.env.E2E_DIST;
const SIZES = [
  [360, 780],
  [390, 844],
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
let srv, app, page;

async function axe(include = null) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async ({ tags, include }) => {
      const r = await window.axe.run(include ? { include: [include] } : document, { runOnly: { type: "tag", values: tags }, rules: { "meta-viewport": { enabled: false } }, resultTypes: ["violations"] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5), count: v.nodes.length }));
    },
    { tags: TAGS, include }
  );
}
const tap = async (sel) => {
  await page.locator(sel).first().click();
  await page.waitForTimeout(250);
};

describe("I5.7 accessibility (axe) of the atlas module and Compact B2", { concurrency: false }, () => {
  before(async () => {
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

  for (const [w, h] of SIZES) {
    test(`${w} × ${h}: no axe violation on E01–E07 and B2 (the card E06 is reported separately)`, async (t) => {
      await page.setViewportSize({ width: w, height: h });
      const found = {};
      const run = async (name, include) => {
        await page.waitForTimeout(300);
        const v = await axe(include);
        if (v.length) found[name] = v;
      };
      await page.getByTestId("nav-dashboard").click();
      await run("Start + B2");
      await page.getByTestId("nav-exercises").click();
      await run("E01");
      await tap('[data-testid="atlas-category-back"]');
      await run("E02");
      await tap('[data-tile="subregion"]');
      await run("E03");
      await tap('[data-testid="atlas-filters-button"]');
      await run("E04 (sheet)");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      await tap('[data-testid="atlas-row"]');
      const card = await axe();
      t.diagnostic(`E06 card Compact Tabs v3 (not changed in I5): ${card.length ? JSON.stringify(card) : "no violations"}`);
      await page.getByTestId("nav-exercises").click();
      await page.waitForTimeout(300);
      const field = page.locator('[data-testid="atlas-search"] input');
      await field.fill("bench");
      await field.press("Enter");
      await run("E05");
      await field.fill("przysiad bułgarski");
      await field.press("Enter");
      await run("E07 no results");
      await page.getByTestId("nav-exercises").click();
      await tap('[data-testid="atlas-category-chest"]');
      await tap('[data-testid="atlas-filters-button"]');
      await tap('[data-testid="atlas-chip-equipment-dumbbell"]');
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      await field.fill("smith");
      await field.press("Enter");
      await run("E07 filters without results");
      await page.getByTestId("nav-exercises").click();
      assert.deepEqual(found, {});
    });
  }

  test("known global finding (outside I5, frozen index.html): meta-viewport maximum-scale=1 — reported for a separate decision", async (t) => {
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["meta-viewport"] } })).violations.map((v) => v.id));
    const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]').getAttribute("content"));
    t.diagnostic(`viewport: ${meta}; axe: ${r.join(", ") || "none"}`);
    assert.ok(/maximum-scale=1/.test(meta) ? r.includes("meta-viewport") : r.length === 0);
  });

  test("no page errors", async () => {
    assert.deepEqual(app.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});
