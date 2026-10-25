// F1.1 — visual regression. The same scripted walk runs on two builds IN THE SAME BROWSER:
//   E2E_DIST      the build under test
//   E2E_REF_DIST  the reference build (the finished S1, commit a2b9ca0 — see e2e/run.mjs)
// and every screenshot must match pixel by pixel (colour tolerance 0.05 on pixelmatch's scale, which
// only absorbs ±1 anti-aliasing noise on rounded corners; a missing class, image or font is far above it). Comparing two builds on one machine (instead of
// stored images) keeps the check exact on any computer or CI runner.
// The reference images are also kept in e2e/screenshots/ for people to look at
// (refreshed with E2E_UPDATE_SCREENSHOTS=1).
//
// Determinism: frozen clock (Date), seeded Math.random, CSS animations off, fonts loaded.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { serve, openApp } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, ".out");
const STORED = join(here, "screenshots");
const FIXED_TIME = "2026-10-12T09:00:00+02:00";

// The walk: [name, action]. Each action starts where the previous one ended.
const click = (page, text, opts = {}) => page.getByText(text, opts).first().click({ timeout: 20000 });
const STEPS = [
  ["01-welcome", async (p) => { await p.getByText("ZACZYNAMY", { exact: true }).waitFor({ timeout: 20000 }); }],
  ["02-onboarding-name", async (p) => click(p, "ZACZYNAMY", { exact: true })],
  ["03-onboarding-info", async (p) => click(p, "Pomiń", { exact: true })],
  ["04-dashboard-empty", async (p) => click(p, "ZACZYNAMY TRENING")],
  // I4.2: the Dashboard CTA reads „Rozpocznij trening” / „Wznów trening” (New User / Interrupted masters)
  ["05-start-workout", async (p, underTest) => click(p, underTest ? "Rozpocznij trening" : "ROZPOCZNIJ TRENING", { exact: true })],
  ["06-ready-plans", async (p, underTest) => (underTest ? p.getByTestId("tef-ready").click({ timeout: 20000 }) : click(p, "GOTOWE PLANY TRENINGOWE"))],
  // I2: the ready-made templates carry no exercises any more, so BOTH builds walk the same workout
  // without a plan, with an exercise created on the way (the picker itself is not compared: the
  // reference lists the old 68 exercises there)
  ["07-no-plan-workout", async (p, underTest) => {
    await p.locator("button:has(svg.lucide-arrow-left)").first().click({ timeout: 20000 });
    await (underTest ? p.getByTestId("tef-no-plan").click({ timeout: 20000 }) : click(p, "TRENING BEZ PLANU", { exact: true }));
  }],
  // I3: the build under test picks the exercise from the atlas (the old "add" form is off); the reference
  // build creates its own exercise with the SAME name and kind, so the workout screens stay comparable
  ["08-active-workout", async (p, underTest) => {
    await click(p, "Dodaj ćwiczenie", { exact: true });
    if (underTest) {
      await p.locator('input[placeholder="Szukaj w atlasie..."]').fill("Wyciskanie sztangi leżąc");
      await p.locator('[data-testid="atlas-picker-item"]').first().click({ timeout: 20000 });
    } else {
      await p.getByRole("button", { name: "Dodaj ćwiczenie" }).last().click({ timeout: 20000 });
      await p.locator('input[placeholder="np. Przysiad ze sztangą"]').fill("Wyciskanie sztangi leżąc na ławce poziomej");
      await p.getByText("Klatka piersiowa", { exact: true }).nth(1).click();
      await p.getByText("Sztanga", { exact: true }).last().click();
      await p.getByText("Masa ciała", { exact: true }).last().click();
      await p.getByRole("button", { name: "Zapisz", exact: true }).last().click();
      await click(p, "Wyciskanie sztangi leżąc na ławce poziomej");
    }
    await p.locator('input[data-field="kg"], input[placeholder="kg"]').first().fill("60");
    await p.locator('input[data-field="reps"], input[placeholder="0"]').first().fill("8");
    await p.locator("body").click({ position: { x: 5, y: 300 } });
  }],
  ["09-leave-dialog", async (p) => { await p.evaluate(() => history.back()); }],
  ["10-dashboard-resume", async (p, underTest) => { await click(p, "Wróć do treningu"); await p.reload(); await p.getByText(underTest ? "Wznów trening" : "WRÓĆ DO TRENINGU", { exact: true }).first().waitFor(); }],
  ["11-finish-confirm", async (p, underTest) => {
    await click(p, underTest ? "Wznów trening" : "WRÓĆ DO TRENINGU", { exact: true });
    await p.locator("button:has(svg.lucide-ellipsis-vertical)").first().click();
    await click(p, "Zakończ trening", { exact: true });
  }],
  ["12-history-detail", async (p, underTest) => {
    if (underTest) return p.getByTestId("wcs-finish").click(); // I4.5: WCS sheet → the summary
    const b = p.locator("div.fixed button");
    const labels = await b.allInnerTexts();
    await b.nth(labels.findIndex((l) => /Zakończ/.test(l))).click();
  }],
  ["13-history-list", async (p) => { await p.evaluate(() => history.back()); await p.getByText("Historia", { exact: true }).first().waitFor({ timeout: 5000 }).catch(() => {}); }],
  ["14-more-menu", async (p, underTest) => (underTest ? p.getByTestId("nav-more").click({ timeout: 20000 }) : click(p, "Więcej", { exact: true }))],
  ["15-backup", async (p) => click(p, "Kopia zapasowa", { exact: true })],
  ["16-account", async (p) => { await click(p, "Zamknij", { exact: true }); await click(p, "Moje konto", { exact: true }); }],
  ["17-exercises", async (p, underTest) => (underTest ? p.getByTestId("nav-exercises").click({ timeout: 20000 }) : click(p, "Ćwiczenia", { exact: true }))],
  ["18-plans", async (p, underTest) => (underTest ? p.getByTestId("nav-plans").click({ timeout: 20000 }) : click(p, "Plany", { exact: true }))],
  ["19-stats", async (p, underTest) => (underTest ? p.getByTestId("nav-stats").click({ timeout: 20000 }) : click(p, "Statystyki", { exact: true }))],
  ["20-dashboard-after", async (p, underTest) => (underTest ? p.getByTestId("nav-dashboard").click({ timeout: 20000 }) : click(p, "Start", { exact: true }))],
];

// Intended changes approved stage by stage (K01-4). On these screens the element added by the stage is
// taken out of the layout (display: none) before the compared screenshot, so the rest of the screen
// must still equal the reference build pixel by pixel; the element itself must exist in the build
// under test, and the screen WITH it is saved to e2e/.out/<name>.with-change.png for review.
const INTENDED = {
  // AT2 added the tile „Atlas ćwiczeń”; I5.3 replaced the whole screen by E01 of ATLAS-UX-01 (see CHANGED)
  "17-exercises": { stage: "I5.3", selector: '[data-testid="atlas-home"]' },
  // I3: the load-model hint under an atlas exercise (also behind the two dialogs over the workout)
};
// Screens whose CONTENT an approved stage changed on purpose (not only an added element). They are not
// compared with the reference; both images go to e2e/.out/<name>.ref.png / .cur.png for review. Every
// other screen must still match pixel by pixel, and this list must be exactly the screens that differ.
const CHANGED = {
  "04-dashboard-empty": "I4.2: Dashboard — New User master (no plan, no workout)",
  "05-start-workout": "I4.3: Training Entry Flow master — selection",
  "06-ready-plans": "I2: every ready-made template is „Wkrótce” (badge, inactive, no chevron)",
  "08-active-workout": "I4.4: Active Workout master (photo header, set cards, rest dock, footer); the I3 load hint stays",
  "09-leave-dialog": "I4.4: the leave dialog over the Active Workout master",
  "10-dashboard-resume": "I4.2: Dashboard — Interrupted Workout master",
  "11-finish-confirm": "I4.4 / I4.5: the WCS confirmation sheet over the Active Workout master",
  "12-history-detail": "I4.5: after finishing the WCS summary is shown once (before: the history detail of the session)",
  "15-backup": "I3 walk: the reference build saves its own exercise first — one more automatic local copy listed",
  "16-account": "I2: accounts and sync temporarily off — the calm „not configured” state",
  "17-exercises": "I2: no old built-in list (the groups are empty); I3: no „Dodaj” (the old form is off); I5.3: E01 „Ćwiczenia” of ATLAS-UX-01",
  "20-dashboard-after": "I4.2: Dashboard — Returning User master",
};

const NAV_B2 = 'nav[aria-label="Nawigacja główna"]';
const NAV_ANY = `${NAV_B2}, div.fixed.bottom-0.left-0.right-0.z-30.backdrop-blur`; // B2 / the bar before I4
let navShot = null;
async function walk(dist, { underTest = false } = {}) {
  const { server, url } = await serve(dist);
  const app = await openApp({ fixedTime: FIXED_TIME });
  const shots = new Map();
  const withChange = new Map();
  try {
    await app.page.goto(url);
    for (const [name, action] of STEPS) {
      try {
        await action(app.page, underTest);
      } catch (e) {
        throw new Error(`step ${name}: ${e.message.split("\n")[0]} | screen: ${(await app.page.innerText("body")).replace(/\s+/g, " ").slice(0, 300)}`);
      }
      await app.page.waitForTimeout(700);
      await app.page.evaluate(() => document.fonts.ready);
      // I4: B2 replaces the bottom bar on every screen. Its own look is checked on the saved
      // nav-b2 screenshot (build under test) and by tests/ui/i4-b2-nav; for the comparison of the
      // screens the bar of BOTH builds is taken out of the layout.
      if (underTest && !navShot && (await app.page.locator(NAV_B2).count())) navShot = await app.page.locator(NAV_B2).screenshot({ animations: "disabled" }).catch(() => null);
      await app.page.addStyleTag({ content: `${NAV_ANY}{display:none !important}` });
      const intended = INTENDED[name];
      if (intended && underTest) {
        const count = await app.page.locator(intended.selector).count();
        if (count !== 1) throw new Error(`step ${name}: ${intended.stage} element ${intended.selector} found ${count} times (expected 1)`);
        withChange.set(name, await app.page.screenshot({ animations: "disabled", caret: "hide" }));
        await app.page.addStyleTag({ content: `${intended.selector}{display:none !important}` });
        await app.page.waitForTimeout(200);
      }
      shots.set(name, await app.page.screenshot({ animations: "disabled", caret: "hide" }));
      if (intended && underTest) await app.page.evaluate((sel) => { for (const st of document.querySelectorAll("style")) if (st.textContent.startsWith(sel)) st.remove(); }, intended.selector);
      await app.page.evaluate((sel) => { for (const st of document.querySelectorAll("style")) if (st.textContent.startsWith(sel)) st.remove(); }, NAV_ANY);
    }
  } finally {
    await app.browser.close();
    server.close();
  }
  return { shots, withChange, errors: app.errors };
}

describe("visual: build under test vs reference build", { concurrency: false }, () => {
  test("every screen matches the reference pixel by pixel", async (t) => {
    const ref = await walk(process.env.E2E_REF_DIST);
    const cur = await walk(process.env.E2E_DIST, { underTest: true });
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    if (process.env.E2E_UPDATE_SCREENSHOTS === "1") {
      rmSync(STORED, { recursive: true, force: true });
      mkdirSync(STORED, { recursive: true });
    }
    const diffs = [];
    const changedFound = [];
    for (const [name, refBuf] of ref.shots) {
      if (process.env.E2E_UPDATE_SCREENSHOTS === "1") writeFileSync(join(STORED, `${name}.png`), refBuf);
      const a = PNG.sync.read(refBuf);
      const b = PNG.sync.read(cur.shots.get(name));
      const same = a.width === b.width && a.height === b.height;
      const out = same ? new PNG({ width: a.width, height: a.height }) : null;
      const n = same ? pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.05 }) : -1;
      if (CHANGED[name]) {
        if (n !== 0) changedFound.push(name);
        writeFileSync(join(OUT, `${name}.ref.png`), refBuf);
        writeFileSync(join(OUT, `${name}.cur.png`), cur.shots.get(name));
        continue;
      }
      if (!same) { diffs.push(`${name}: size ${a.width}x${a.height} vs ${b.width}x${b.height}`); continue; }
      if (n > 0) {
        diffs.push(`${name}: ${n} px`);
        writeFileSync(join(OUT, `${name}.ref.png`), refBuf);
        writeFileSync(join(OUT, `${name}.cur.png`), cur.shots.get(name));
        writeFileSync(join(OUT, `${name}.diff.png`), PNG.sync.write(out));
      }
    }
    for (const [name, buf] of cur.withChange) writeFileSync(join(OUT, `${name}.with-change.png`), buf);
    if (navShot) writeFileSync(join(OUT, "nav-b2.png"), navShot);
    assert.ok(navShot, "the B2 bar was captured on the build under test");
    assert.deepEqual([...cur.withChange.keys()].sort(), Object.keys(INTENDED).sort(), "every intended change was found");
    assert.deepEqual(changedFound, Object.keys(CHANGED), "every screen listed as changed really differs");
    t.diagnostic(`${ref.shots.size - changedFound.length} screens compared; intended changes (element hidden for the comparison): ${Object.keys(INTENDED).join(", ")}; changed by a stage (reviewed, not compared): ${changedFound.join(", ")}`);
    assert.equal(ref.shots.size, STEPS.length);
    assert.deepEqual(diffs, []);
    assert.deepEqual(cur.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});
