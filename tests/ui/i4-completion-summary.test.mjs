// I4.5 — Workout Completion & Summary after the approved master (WCSM v1, canvas v81), on the app as it
// ships (S1): confirmation sheets (all done / unfilled grouped / nothing performed), the one-time summary
// (hero, status D3, metric grid with explanation dialogs, records PRO / offer Free, volume per exercise),
// exits D1 / D2 / D5. Values from finish() and the existing engine only.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $$, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
const K = (n) => `nextrep1_guest_${n}_v1`;
const read = (n) => JSON.parse(localStorage.getItem(K(n)));
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
const item = (id, exerciseId, n, extra = {}) => ({ id, exerciseId, catalogExerciseId: exerciseId, loadModel: null, restSeconds: 90, supersetGroup: null, setsDetail: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, target: "6-8", rir: "1-2" })), ...extra });
const PLAN = { id: "plan-a", name: "Push A", exercises: [item("pi-1", BENCH, 2)] };
const PLAN2 = { id: "plan-b", name: "Push B", exercises: [item("pi-1", BENCH, 2), item("pi-2", "fly_band_standing", 2)] };
const PRIOR = { id: "s-old", date: "2026-10-10T10:00:00.000Z", planId: "plan-a", planName: "Push A", durationSec: 3600, exercisesCount: 1, totalSets: 2, totalReps: 16, totalWeight: 160, volume: 1280, exercises: [{ id: "e-old", exerciseId: BENCH, catalogExerciseId: BENCH, name: "Wyciskanie", type: "weight", sets: [{ weight: 80, reps: "8", rir: "1-2", setType: "normal" }, { weight: 80, reps: "8", rir: "1-2", setType: "normal" }] }] };

async function enterSet(kg, reps, next) {
  const cur = byTestId("aw-set-current");
  await type(cur.querySelector('input[data-field="kg"]'), kg);
  await type(cur.querySelector('input[data-field="reps"]'), reps);
  await flush(5, 2);
  if (next) {
    await click($$("button").find((b) => b.getAttribute("aria-label") === `Wpisz wyniki: ${next}`));
    await flush(5, 2);
  }
}
async function openFinish() {
  while (!document.querySelector('[data-act="finish"]')) {
    await click(document.querySelector('[data-act="next"]'));
    await flush(5, 2);
  }
  await click(document.querySelector('[data-act="finish"]'));
  await flush(5, 3);
}
async function start(seed, plan = PLAN) {
  await boot({ plans: [plan], ...seed });
  await click(byTestId("dashboard-start"));
  await flush(10, 4);
}

describe("I4.5 confirmation sheets", () => {
  test("all sets done: „Zakończyć trening?” (alertdialog) · plan · time; „Zakończ i zapisz” → saved, summary", async () => {
    await start();
    await enterSet("82,5", "8", "Seria 2");
    await enterSet("82,5", "7");
    await openFinish();
    const sheet = byTestId("wcs-confirm");
    assert.equal(sheet.getAttribute("role"), "alertdialog");
    assert.equal(sheet.getAttribute("aria-modal"), "true");
    assert.match(sheet.textContent, /Zakończyć trening\?/);
    assert.match(sheet.textContent, /Push A · \d+ min \d+s/);
    assert.match(sheet.textContent, /Bieżące wyniki zostaną zapisane w Historii\./);
    assert.deepEqual($$("button", sheet).map((b) => b.textContent.trim()), ["Zakończ i zapisz", "Wróć do treningu"]);
    await click(byTestId("wcs-finish"));
    await flush(10, 5);
    assert.equal(read("history").length, 1);
    assert.equal(localStorage.getItem(K("active_workout_draft")), null);
    assert.ok(byTestId("workout-summary"));
  });

  test("unfilled sets: grouped by exercise, a whole exercise marked, „Pominie n serii · zapisze wykonane”", async () => {
    await start({}, PLAN2);
    await enterSet("60", "8");
    await openFinish();
    const sheet = byTestId("wcs-unfinished");
    assert.match(sheet.textContent, /3 niewypełnione serie/);
    assert.match(sheet.textContent, /Niewypełnione serie zostaną pominięte\. Zapiszemy tylko wykonane serie\./);
    const groups = $$('[data-testid="wcs-unfilled-exercise"]', sheet);
    assert.equal(groups.length, 2);
    assert.match(groups[0].textContent, /Wyciskanie sztangi leżąc na ławce poziomej/);
    assert.match(groups[0].textContent, /Seria 2/);
    assert.doesNotMatch(groups[0].textContent, /Całe ćwiczenie/);
    assert.match(groups[1].textContent, /Całe ćwiczenie zostanie pominięte — brak wykonanych serii/);
    assert.match(byTestId("wcs-finish").textContent, /Zakończ mimo toPominie 3 serie · zapisze wykonane/);
    await click($$("button", sheet).find((b) => b.textContent.trim() === "Wróć i uzupełnij"));
    await flush(5, 2);
    assert.ok(!byTestId("wcs-unfinished") && byTestId("active-workout"), "back to the workout");
    await openFinish();
    await click(byTestId("wcs-finish"));
    await flush(10, 5);
    const saved = read("history")[0];
    assert.equal(saved.totalSets, 1, "only the performed set is saved");
    assert.equal(saved.exercises.length, 1);
  });

  test("nothing performed: „Brak wykonanych serii”, no empty workout; Przerwij trening keeps the draft", async () => {
    await start();
    await openFinish();
    const sheet = byTestId("wcs-no-sets");
    assert.match(sheet.textContent, /Pusty trening nie zostanie utworzony\./);
    assert.ok(!byTestId("wcs-finish"), "no way to save an empty workout");
    await click(byTestId("wcs-interrupt"));
    await flush(10, 4);
    assert.equal(localStorage.getItem(K("history")), null);
    assert.ok(localStorage.getItem(K("active_workout_draft")), "the unfinished workout is kept");
    assert.ok(byTestId("dashboard-active-workout"));
  });
});

describe("I4.5 summary", () => {
  async function finishPlan(seed = {}) {
    await start(seed);
    await enterSet("82,5", "8", "Seria 2");
    await enterSet("80", "6");
    await openFinish();
    await click(byTestId("wcs-finish"));
    await flush(10, 5);
  }
  test("hero: Trening zakończony, plan, date · time, status without an account (D3), X with its name", async () => {
    await finishPlan();
    const s = byTestId("workout-summary");
    assert.match(byTestId("wcs-hero").textContent, /Trening zakończony/);
    assert.equal(s.querySelector("h1").textContent, "Push A");
    const st = byTestId("wcs-sync-status");
    assert.equal(st.getAttribute("role"), "status");
    assert.equal(st.dataset.kind, "loggedOut");
    assert.match(st.textContent, /Zapisano na tym urządzeniu/);
    assert.match(st.textContent, /Bez konta — dane są dostępne lokalnie\./);
    assert.equal(byTestId("wcs-close").getAttribute("aria-label"), "Zamknij podsumowanie i przejdź do Historii");
    assert.ok(document.querySelector('nav[aria-label="Nawigacja główna"]'), "bottom nav shown");
    assert.ok(!document.querySelector('nav[aria-label="Nawigacja główna"] [aria-current="page"]'), "no active tab");
  });

  test("metrics from finish(): 6 buttons with spoken values; explanation dialog (focus on X, Escape, focus back)", async () => {
    await finishPlan();
    const labels = ["ex", "sets", "reps", "dur", "sumw", "vol"].map((m) => byTestId(`wcs-metric-${m}`).getAttribute("aria-label"));
    assert.equal(labels[0], "Ćwiczenia: 1. Pokaż wyjaśnienie");
    assert.equal(labels[1], "Serie: 2. Pokaż wyjaśnienie");
    assert.equal(labels[2], "Powtórzenia: 14. Pokaż wyjaśnienie");
    assert.match(labels[3], /^Czas: \d+ min \d+s\. Pokaż wyjaśnienie$/);
    assert.equal(labels[4], "Suma ciężarów: 163 kg. Pokaż wyjaśnienie", "82,5 + 80 = 162,5 → 163 (rounded for display)");
    assert.equal(labels[5], "Objętość: 1\u00a0140 kg. Pokaż wyjaśnienie", "82,5 × 8 + 80 × 6");
    await click(byTestId("wcs-metric-vol"));
    await flush(5, 2);
    const sheet = byTestId("wcs-metric-sheet");
    assert.equal(sheet.getAttribute("role"), "dialog");
    assert.match(sheet.textContent, /W tym treningu: 1\u00a0140 kg/);
    assert.match(sheet.textContent, /Ciężar × powtórzenia dla każdej wykonanej serii, zsumowane\./);
    assert.equal(document.activeElement.getAttribute("aria-label"), "Zamknij wyjaśnienie");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await flush(5, 3);
    assert.ok(!byTestId("wcs-metric-sheet"));
    assert.equal(document.activeElement, byTestId("wcs-metric-vol"));
  });

  test("Free: records → compact PRO offer; volume per exercise", async () => {
    await finishPlan();
    assert.match(byTestId("wcs-pro-offer").textContent, /Zobacz trend, nie tylko pojedynczy wynik/);
    assert.ok(!byTestId("wcs-records"));
    assert.match(byTestId("wcs-volume").textContent, /Wyciskanie sztangi leżąc na ławce poziomej1\u00a0140 kg/);
    assert.match(byTestId("wcs-volume").textContent, /Paski porównują tylko ćwiczenia w tej samej jednostce/);
  });

  test("PRO: records from generateTrainingReport + full report; D4 without records: no empty section, report reachable", async () => {
    await finishPlan({ history: [PRIOR], pro_status: { manualPro: true } });
    assert.match(byTestId("wcs-records").textContent, /Rekordy z tego treningu/);
    assert.match(byTestId("wcs-records").textContent, /Nowy maksymalny ciężar: 82\.5 kg \(poprzednio 80 kg\)/, "wording of generateTrainingReport (unchanged)");
    assert.ok(byTestId("wcs-open-report"));
    await finishPlan({ pro_status: { manualPro: true } });
    assert.ok(!byTestId("wcs-records"), "no invented records");
    assert.ok(byTestId("wcs-open-report"));
    await click(byTestId("wcs-open-report"));
    await flush(10, 3);
    assert.ok(!byTestId("workout-summary"), "the full report opens");
  });

  test("D1: X → History list (no second summary, D5); Back also → History; D2: a tab goes straight there", async () => {
    await finishPlan();
    await click(byTestId("wcs-close"));
    await flush(10, 3);
    assert.ok(!byTestId("workout-summary"));
    assert.match(document.body.textContent, /HISTORIA/, "the History screen (the saved workout is there)");
    await finishPlan();
    await act(async () => window.dispatchEvent(new Event("popstate")));
    await flush(10, 3);
    assert.ok(!byTestId("workout-summary"));
    await finishPlan();
    await click(byTestId("nav-dashboard"));
    await flush(10, 3);
    assert.ok(byTestId("dashboard"), "straight to Start");
  });

  test("save failed (10a): full screen, draft protected, retry saves once", async () => {
    await start();
    await enterSet("60", "8", "Seria 2");
    await enterSet("60", "8");
    const proto = Object.getPrototypeOf(globalThis.localStorage);
    const real = proto.setItem;
    let fail = true;
    proto.setItem = function (k, v) {
      if (fail && k === K("history")) {
        const e = new Error("QuotaExceededError");
        e.name = "QuotaExceededError";
        throw e;
      }
      return real.call(this, k, v);
    };
    try {
      await openFinish();
      await click(byTestId("wcs-finish"));
      await flush(10, 4);
      assert.ok(byTestId("wcs-save-failed"));
      assert.match(byTestId("finish-error").textContent, /Trening nie został zapisany w Historii/);
      assert.match(byTestId("finish-error").textContent, /„Push A” jest nadal chroniony/);
      assert.ok(localStorage.getItem(K("active_workout_draft")));
      fail = false;
      await click(byTestId("finish-retry"));
      await flush(10, 5);
      assert.equal(read("history").length, 1);
      assert.ok(byTestId("workout-summary"));
    } finally {
      proto.setItem = real;
    }
  });
});
