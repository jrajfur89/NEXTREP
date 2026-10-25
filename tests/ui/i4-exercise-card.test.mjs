// I4.6 — atlas exercise card „Compact Tabs v3” (master EXV3, approved 20.10.2026) on the app as it
// ships (S1): tabs Ćwiczenie · Historia · Warianty; the atlas card content only from the atlas
// (AT3-D12); the full history of one exerciseId by years (D2 / D3), FREE table + PRO chart (D4 / D5);
// a row opens the workout in History (D6) and Back comes back to the same state (D7). Read-only.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, $$, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
const K = (n) => `nextrep1_guest_${n}_v1`;
let A;
async function boot(seed = {}) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(K(n), JSON.stringify(v));
  await mount(React.createElement(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
}
after(async () => {
  await unmount();
});
const BENCH = "bench_press_barbell_flat";
const Y = new Date().getFullYear();
const sess = (id, date, sets, exerciseId = BENCH) => ({ id, date, planId: null, planName: "Push", durationSec: 3000, exercisesCount: 1, totalSets: sets.length, totalReps: 0, totalWeight: 0, volume: 0, exercises: [{ id: `${id}-e`, exerciseId, catalogExerciseId: exerciseId, name: "x", type: "weight", sets }] });
const st = (weight, reps, setType = "normal") => ({ weight, reps: String(reps), rir: "", setType });
async function openCard(name, seed) {
  await boot(seed);
  await click(byTestId("nav-exercises"));
  await flush(10, 3);
  await click(byTestId("atlas-entry"));
  await flush(5, 2);
  const ex = A.ATLAS_CATALOG.exercises.find((e) => e.exerciseId === name);
  await click($$('[data-testid="atlas-item"]').find((b) => b.querySelector("p").textContent === ex.name));
  await flush(5, 2);
  return ex;
}
const tab = (k) => byTestId(`exv-tab-${k}`);

describe("I4.6 card — header, tabs, „Ćwiczenie”", () => {
  test("pinned bar (Wróć do Atlasu ćwiczeń), name, only the primary equipment; tablist with arrow keys", async () => {
    const ex = await openCard(BENCH);
    assert.equal(byTestId("atlas-detail-back").getAttribute("aria-label"), "Wróć do Atlasu ćwiczeń");
    assert.equal(byTestId("atlas-detail-name").textContent, ex.name);
    assert.equal(byTestId("atlas-detail-primary-equipment").textContent, `Podstawowy sprzęt: ${ex.equipment[0].label}`);
    const list = document.querySelector('[role="tablist"]');
    assert.deepEqual($$('[role="tab"]', list).map((t) => [t.textContent, t.getAttribute("aria-selected")]), [["Ćwiczenie", "true"], ["Historia", "false"], ["Warianty", "false"]]);
    await act(async () => tab("ex").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    await flush(5, 2);
    assert.equal(tab("hist").getAttribute("aria-selected"), "true");
  });

  test("instruction: 3 steps + „Pokaż całą instrukcję (n kroków)”; mistakes and safety collapsed with counts; tips; details", async () => {
    const ex = await openCard(BENCH);
    const steps = byTestId("exv-steps");
    assert.equal(steps.querySelectorAll("ol li").length, 3);
    const more = $$("button", steps).find((b) => /Pokaż całą instrukcję/.test(b.textContent));
    assert.match(more.textContent, new RegExp(`\\(${ex.instructions.length} kroków\\)|\\(${ex.instructions.length} kroki\\)`));
    await click(more);
    assert.equal(byTestId("exv-steps").querySelectorAll("ol li").length, ex.instructions.length);
    const mi = byTestId("exv-mistakes");
    assert.match(mi.textContent, new RegExp(`Najczęstsze błędy${ex.mistakes.length} punkt`));
    assert.equal(mi.querySelector("button").getAttribute("aria-expanded"), "false");
    await click(mi.querySelector("button"));
    assert.equal(byTestId("exv-mistakes").querySelectorAll("li").length, ex.mistakes.length);
    assert.match(byTestId("exv-safety").textContent, /Bezpieczeństwo/);
    assert.equal(byTestId("atlas-detail-tips").textContent, ex.tips);
    assert.ok(!document.body.textContent.includes("Treść przykładowa"), "real atlas content, no mock labels");
    assert.ok(!document.body.textContent.includes("Film instruktażowy"), "no video in the atlas → no video row");
  });
});

describe("I4.6 card — „Historia”", () => {
  const HIST = [
    sess("a1", `${Y}-10-15T10:00:00.000Z`, [st(82.5, 7), st(80, 8), st(60, 8, "dropset")]),
    sess("a2", `${Y}-10-11T10:00:00.000Z`, [st(80, 8), st(80, 8)]),
    sess("b1", `${Y - 1}-06-20T10:00:00.000Z`, [st(70, 10), st(70, 9), st(70, 8)]),
    sess("other", `${Y}-10-12T10:00:00.000Z`, [st(20, 10)], "bench_press_dumbbell_pair_incline"),
  ];
  test("no history: „Brak historii”", async () => {
    await openCard(BENCH);
    await click(tab("hist"));
    assert.match(byTestId("exv-no-history").textContent, /Brak historii/);
  });

  test("FREE: full table by years (current open, older collapsed), formats 82,5 ×7 / D / ·; one PRO line, no chart; variants not merged", async () => {
    await openCard(BENCH, { history: HIST });
    await click(tab("hist"));
    assert.ok(byTestId("exv-pro-line"), "Wykres progresji — NEXTREP PRO");
    assert.ok(!byTestId("exv-chart"));
    assert.equal(byTestId(`exv-year-${Y}`).getAttribute("aria-expanded"), "true");
    assert.match(byTestId(`exv-year-${Y}`).textContent, /2 wykonania/);
    assert.equal(byTestId(`exv-year-${Y - 1}`).getAttribute("aria-expanded"), "false");
    const rows = $$('[data-testid="exv-row"]');
    assert.equal(rows.length, 2, "only this exerciseId (the incline variant is not merged)");
    const cells = [...rows[0].querySelectorAll("td")].map((td) => td.textContent);
    assert.deepEqual(cells, ["82,5×7", "80×8", "D60×8"]);
    assert.deepEqual([...rows[1].querySelectorAll("td")].map((td) => td.textContent), ["80×8", "80×8", "·brak serii"]);
    assert.match(rows[0].querySelector("th button").getAttribute("aria-label"), /15 października \d{4} — pokaż szczegóły treningu/);
    await click(byTestId(`exv-year-${Y - 1}`));
    assert.equal($$('[data-testid="exv-row"]').length, 3);
  });

  test("D2: the current year without executions → „Brak wykonań w tym roku” and the newest earlier year opens", async () => {
    await openCard(BENCH, { history: [HIST[2]] });
    await click(tab("hist"));
    assert.match(document.getElementById(`exv-yr-${Y}`).textContent, /Brak wykonań w tym roku/);
    assert.equal(byTestId(`exv-year-${Y - 1}`).getAttribute("aria-expanded"), "true");
  });

  test("PRO: chart of the last executions (Objętość, exerciseDetailVolume), latest selected, row highlighted; a point in a collapsed year opens it", async () => {
    await openCard(BENCH, { history: HIST, pro_status: { manualPro: true } });
    await click(tab("hist"));
    const chart = byTestId("exv-chart");
    assert.match(chart.textContent, /Objętość · ostatnie 3 wykonania/);
    const pts = $$('[data-testid="exv-point"]');
    assert.equal(pts.length, 3);
    assert.equal(pts[2].getAttribute("aria-checked"), "true");
    assert.match(byTestId("exv-readout").textContent, /1\u00a0698 kg/, "82,5×7 + 80×8 + 60×8 = 1 697,5 → 1 698 (rounded for display; dropsets included)");
    assert.ok(document.querySelector('[data-testid="exv-row"][data-sel]'), "the selected execution's row");
    await click(pts[0]);
    assert.equal(byTestId(`exv-year-${Y - 1}`).getAttribute("aria-expanded"), "true");
    assert.match(document.body.textContent, new RegExp(`Rozwinięto rok ${Y - 1}, aby pokazać wybrane wykonanie\\.`));
    assert.match(document.querySelector('[data-testid="exv-row"][data-sel]').textContent, /20\.06/);
  });

  test("D6 / D7: a date opens the workout in History; Back → the same card, tab, years and selection", async () => {
    await openCard(BENCH, { history: HIST, pro_status: { manualPro: true } });
    await click(tab("hist"));
    await click($$('[data-testid="exv-point"]')[0]);
    await click($$('[data-testid="exv-row"]')[0].querySelector("th button"));
    await flush(10, 3);
    assert.ok(!byTestId("atlas-detail"), "the workout details are open");
    await act(async () => window.dispatchEvent(new Event("popstate")));
    await flush(10, 4);
    assert.ok(byTestId("atlas-detail"), "back on the card");
    assert.equal(tab("hist").getAttribute("aria-selected"), "true");
    assert.equal(byTestId(`exv-year-${Y - 1}`).getAttribute("aria-expanded"), "true");
    assert.match(document.querySelector('[data-testid="exv-row"][data-sel]').textContent, /20\.06/);
    assert.equal(localStorage.getItem(K("exercises")), null, "nothing written");
  });
});

describe("I4.6 card — „Warianty”", () => {
  test("the family's exercises; this one marked; a variant opens its own card", async () => {
    const ex = await openCard(BENCH);
    await click(tab("var"));
    assert.match(byTestId("exv-variant-current").textContent, /To ćwiczenie/);
    const family = A.ATLAS_CATALOG.exercises.filter((e) => e.familyId === ex.familyId);
    assert.equal($$('[data-testid="exv-variant"]').length, family.length - 1);
    const target = $$('[data-testid="exv-variant"]')[0];
    const name = target.querySelector("span span").textContent;
    await click(target);
    await flush(5, 2);
    assert.equal(byTestId("atlas-detail-name").textContent, name);
    assert.equal(tab("ex").getAttribute("aria-selected"), "true");
  });
});
