// F1.1 — behaviour of the BUILT app (dist/) in Chromium, phone viewport, all network blocked.
// The S1 browser check as a permanent test. Steps share one page and run in order.
//
// Known Android limitations are NOT covered here and stay open:
//   NR-S1-01  export JSON does nothing in the Android WebView (Blob download). In desktop
//             Chromium the download works, so G1 below only proves the browser path.
//   NR-S1-02  no sound / vibration at the end of a rest while the phone screen is off.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serve, openApp, missingClasses, bodyText } from "./lib.mjs";

const DIST = process.env.E2E_DIST;
let srv, app, page;
const missing = new Set();
const cov = async () => (await missingClasses(page)).forEach((c) => missing.add(c));
const historyCounts = () =>
  page.evaluate(() => Object.entries(localStorage).filter(([k]) => /_history_v1$/.test(k)).map(([k, v]) => [k, JSON.parse(v).length]));

describe("S1 flow on the built app (offline)", { concurrency: false }, () => {
  before(async () => {
    srv = await serve(DIST);
    app = await openApp();
    page = app.page;
  });
  after(async () => {
    await app?.browser.close();
    srv?.server.close();
  });

  test("A1 cold start with no network, only local files", async () => {
    await page.goto(srv.url);
    await page.waitForFunction(() => !document.getElementById("boot-fallback"), null, { timeout: 15000 });
  });

  test("A2 onboarding → dashboard", async () => {
    await page.getByText("ZACZYNAMY", { exact: true }).click({ timeout: 20000 });
    await cov();
    await page.getByText("Pomiń", { exact: true }).first().click();
    await page.getByText("ZACZYNAMY TRENING").click();
    await page.waitForTimeout(500);
    await cov();
    assert.match(await bodyText(page), /ROZPOCZNIJ TRENING/);
  });

  test("B1 ready plan workout, set 1 = 60 kg × 8", async () => {
    await page.getByText("ROZPOCZNIJ TRENING").click();
    await page.getByText("GOTOWE PLANY TRENINGOWE").click();
    await page.getByText("FBW (Full Body Workout)").click();
    await page.getByText("Początkujący").click();
    await page.waitForTimeout(600);
    await cov();
    await page.locator('input[placeholder="kg"]').first().fill("60");
    await page.locator('input[placeholder="0"]').first().fill("8");
    assert.match(await bodyText(page), /PRZYSIAD ZE SZTANGĄ/);
    assert.equal(await page.locator('input[placeholder="kg"]').first().inputValue(), "60");
  });

  test("C1 rest countdown keeps counting while the page is hidden (browser; Android screen-off signal = NR-S1-02, open)", async () => {
    await page.getByText(/Start przerwy/).click();
    await page.waitForTimeout(1200);
    const before = await bodyText(page);
    const setHidden = (hidden) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "visibilityState", { value: h ? "hidden" : "visible", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await page.waitForTimeout(3000);
    await setHidden(false);
    await page.waitForTimeout(600);
    assert.notEqual(await bodyText(page), before);
  });

  test("D1 system Back in the workout opens 'Opuszczasz aktywny trening'; D2 'Wróć do treningu' keeps the set", async () => {
    await page.evaluate(() => history.back());
    await page.waitForTimeout(700);
    assert.match(await bodyText(page), /opuszczasz aktywny trening/i);
    await page.getByText("Wróć do treningu").first().click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('input[placeholder="kg"]').first().inputValue(), "60");
  });

  test("E1 workout draft survives a killed/reloaded app", async () => {
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForTimeout(2500);
    const t = await bodyText(page);
    assert.match(t, /KONTYNUUJ TRENING/);
    assert.match(t, /480 KG/);
    await page.getByText("WRÓĆ DO TRENINGU").first().click();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('input[placeholder="kg"]').first().inputValue(), "60");
  });

  let saved;
  test("F1 finished workout saved to local history; F2 still there after restart", async () => {
    await page.locator("button:has(svg.lucide-ellipsis-vertical)").first().click();
    await page.waitForTimeout(400);
    await page.getByText("Zakończ trening", { exact: true }).first().click();
    await page.waitForTimeout(400);
    const buttons = page.locator("div.fixed button");
    const labels = await buttons.allInnerTexts();
    const idx = labels.findIndex((l) => /Zakończ/.test(l));
    assert.ok(idx >= 0, `no finish button in ${JSON.stringify(labels)}`);
    await buttons.nth(idx).click();
    await page.waitForTimeout(1500);
    await cov();
    saved = await historyCounts();
    assert.ok(saved.some(([, n]) => n >= 1), JSON.stringify(saved));
    await page.reload();
    await page.waitForTimeout(2500);
    assert.deepEqual(await historyCounts(), saved);
  });

  test("G1 export produces the JSON file (browser only — Android WebView: NR-S1-01, open); G2 import restores it", async () => {
    await page.getByText("Więcej", { exact: true }).click();
    await page.getByText("Kopia zapasowa", { exact: true }).click();
    await page.waitForTimeout(500);
    await cov();
    const dl = page.waitForEvent("download", { timeout: 5000 });
    await page.getByText("Eksportuj dane JSON").click();
    const file = JSON.parse(readFileSync(await (await dl).path(), "utf8"));
    assert.ok(Array.isArray(file.data?.history) && file.data.history.length >= 1);
    await page.locator('input[type="file"]').setInputFiles({ name: "kopia.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
    await page.waitForTimeout(3500);
    assert.deepEqual(await historyCounts(), saved);
  });

  test("H1 login without network shows the network message, no crash; H2 only the TEST Supabase project is contacted", async () => {
    await page.goto(srv.url);
    await page.waitForTimeout(2500);
    await page.getByText("Więcej", { exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByText(/Zaloguj się lub załóż konto/).first().click();
    await page.waitForTimeout(800);
    if (!(await page.locator('input[type="email"]').count())) {
      await page.getByRole("button", { name: /Zaloguj/ }).first().click();
      await page.waitForTimeout(600);
    }
    await cov();
    await page.locator('input[type="email"]').fill("e2e-check@example.invalid");
    await page.locator('input[type="password"]').fill("not-a-real-password");
    await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
    await page.waitForTimeout(4000);
    const t = await bodyText(page);
    assert.match(t, /Nie można połączyć się z serwerem/);
    assert.doesNotMatch(t, /Failed to fetch/);
    const supa = [...new Set(app.blocked)].filter((u) => u.includes("supabase.co"));
    assert.ok(supa.length > 0 && supa.every((u) => u.includes("qnyjrvoudyjxvitazclo.supabase.co")), supa.join(" "));
  });

  test("I1 every class used on the visited screens exists in the CSS; I2 no CDN / third-party request; I3 no JS errors", () => {
    assert.deepEqual([...missing], []);
    assert.deepEqual([...new Set(app.blocked)].filter((u) => !u.includes("supabase.co")), []);
    assert.deepEqual(app.errors.filter((e) => e.startsWith("pageerror")), []);
  });
});
