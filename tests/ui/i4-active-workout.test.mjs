// I4.4 — Active Workout after the approved master (AWM v1, canvas v81), on the app as it ships (S1).
// Visual layer only: the series, the values, the completion rule, the rest timer, the draft and
// finishing stay as in production; the recommendation text is the existing engine's.
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
const btn = (re) => $$("button").find((b) => re.test(b.textContent.trim()));
const aria = (label) => $$("button").find((b) => b.getAttribute("aria-label") === label);
const BENCH = "bench_press_barbell_flat";
const item = (id, exerciseId, extra = {}) => ({ id, exerciseId, catalogExerciseId: exerciseId, loadModel: null, restSeconds: 90, supersetGroup: null, setsDetail: [{ id: `${id}-1`, target: "6-8", rir: "1-2" }, { id: `${id}-2`, target: "6-8", rir: "1-2" }, { id: `${id}-3`, target: "6-8", rir: "1-2" }], ...extra });
const PLAN = { id: "plan-a", name: "Push A", exercises: [item("pi-1", BENCH), item("pi-2", "chest_press_machine_flat", { loadModel: "plate_loaded" })] };
const LAST = {
  id: "s-old",
  date: "2026-10-10T10:00:00.000Z",
  planId: "plan-a",
  planName: "Push A",
  durationSec: 3600,
  exercises: [{ id: "e-old", exerciseId: BENCH, catalogExerciseId: BENCH, name: "Wyciskanie", type: "weight", sets: [{ weight: 80, reps: "8", rir: "1-2", setType: "normal" }, { weight: 80, reps: "8", rir: "1-2", setType: "normal" }, { weight: 80, reps: "7", rir: "0-1", setType: "normal" }] }],
};
async function startPlan(seed) {
  await boot(seed);
  await click(byTestId("dashboard-start"));
  await flush(10, 4);
}
const sets = () => read("active_workout_draft").blocks[0].items[0].sets;

describe("I4.4 Active Workout — header, sets, cards", () => {
  test("header: clock (timer), ⋮ menu, plan · Ćwiczenie x z n, exercise name, segmented progress", async () => {
    await startPlan({ plans: [PLAN] });
    assert.ok(byTestId("active-workout"));
    const clock = byTestId("aw-clock");
    assert.equal(clock.getAttribute("role"), "timer");
    assert.match(clock.getAttribute("aria-label"), /^Czas treningu \d+ (minuta|minuty|minut) \d+ (sekunda|sekundy|sekund)$/);
    assert.ok(aria("Menu treningu: dodaj, zamień, zakończ lub przerwij trening"));
    const header = document.querySelector("header[data-header]");
    assert.match(header.textContent, /Push A · Ćwiczenie 1 z 2/);
    assert.match(header.querySelector("h1").textContent, /Wyciskanie sztangi leżąc na ławce poziomej/);
    const bar = header.querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute("aria-valuenow"), "1");
    assert.equal(bar.getAttribute("aria-valuemax"), "2");
    assert.equal(bar.children.length, 2);
  });

  test("first set is the expanded card (Cel · RIR, fields); the rest „Do wykonania”; no history → no cards", async () => {
    await startPlan({ plans: [PLAN] });
    const cur = byTestId("aw-set-current");
    assert.match(cur.textContent, /Seria 1/);
    assert.match(cur.textContent, /Cel: 6–8 · RIR 1–2/);
    assert.ok(cur.querySelector('input[data-field="kg"]') && cur.querySelector('input[data-field="reps"]') && cur.querySelector('select[data-field="rir"]'));
    assert.deepEqual($$('[data-testid="aw-set-pending"]').map((r) => r.textContent.replace(/\s+/g, " ").trim()), ["Seria 2Do wykonania— kg × —Wpisz", "Seria 3Do wykonania— kg × —Wpisz"]);
    assert.equal(document.querySelector('ol[aria-label="Serie"]').children.length, 3);
    assert.ok(!byTestId("aw-prior") && !byTestId("aw-recommendation") && !byTestId("pro-recommendation-lock"));
    assert.ok(byTestId("atlas-load-hint"), "the I3 load-model hint stays");
  });

  test("typing keeps the card open (production completion rule); „Wpisz” moves on; done row: 60 kg × 8 · RIR + pencil", async () => {
    await startPlan({ plans: [PLAN] });
    await type(document.querySelector('input[data-field="kg"]'), "60");
    await type(document.querySelector('input[data-field="reps"]'), "8");
    await flush(5, 2);
    assert.match(byTestId("aw-set-current").textContent, /Seria 1/, "still the set being entered");
    await click(aria("Wpisz wyniki: Seria 2"));
    await flush(5, 2);
    assert.match(byTestId("aw-set-current").textContent, /Seria 2/);
    const done = byTestId("aw-set-done");
    assert.equal(done.textContent.replace(/\s+/g, " ").trim(), "Seria 160 kg × 8");
    assert.deepEqual(sets().map((s) => [s.weight, s.reps]), [["60", "8"], ["", ""], ["", ""]], "values as entered, nothing added");
    await click(aria("Edytuj Seria 1"));
    await flush(5, 2);
    assert.equal(byTestId("aw-set-current").querySelector('input[data-field="kg"]').value, "60");
  });

  test("returning user (PRO): „ostatnio” only on the weight prefilled from the last workout; gone after a manual change", async () => {
    await startPlan({ plans: [PLAN], history: [LAST], pro_status: { manualPro: true } });
    const cur = byTestId("aw-set-current");
    assert.equal(cur.querySelector('input[data-field="kg"]').value, "80");
    assert.ok(byTestId("aw-weight-last"), "neutral tag");
    assert.match(cur.textContent, /Poprzednio: 80 kg × 8 · RIR 1–2/);
    await type(cur.querySelector('input[data-field="kg"]'), "82,5");
    await flush(5, 2);
    assert.ok(!byTestId("aw-weight-last"));
    assert.equal(sets()[0].fromSuggestion, false);
  });

  test("PRO: „Zalecenie na dziś” (engine text) expanded by default; history collapsed; both collapse when editing begins", async () => {
    await startPlan({ plans: [PLAN], history: [LAST], pro_status: { manualPro: true } });
    const rec = byTestId("aw-recommendation");
    assert.match(rec.textContent, /Zalecenie na dziś/);
    assert.equal(rec.querySelector("button").getAttribute("aria-expanded"), "true");
    assert.ok(rec.querySelector("p").textContent.length > 10, "the existing engine's message");
    const prior = byTestId("aw-prior");
    assert.equal(prior.querySelector("button").getAttribute("aria-expanded"), "false");
    await click(prior.querySelector("button"));
    await flush(5, 2);
    assert.match(byTestId("aw-prior").textContent, /10 października 2026 · wyniki wg serii/);
    assert.match(byTestId("aw-prior").textContent, /Seria 380 kg × 7 · RIR 0–1/);
    await act(async () => document.querySelector('input[data-field="reps"]').focus());
    await act(async () => document.querySelector('input[data-field="reps"]').dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    await flush(5, 2);
    assert.equal(byTestId("aw-recommendation").querySelector("button").getAttribute("aria-expanded"), "false");
    assert.equal(byTestId("aw-prior").querySelector("button").getAttribute("aria-expanded"), "false");
  });

  test("Free: the production lock card (Zalecenia treningowe — PRO · Poznaj PRO)", async () => {
    await startPlan({ plans: [PLAN], history: [LAST] });
    const lock = byTestId("pro-recommendation-lock");
    assert.match(lock.textContent, /Zalecenia treningowe — PRO/);
    assert.match(lock.textContent, /Poznaj PRO/);
    assert.ok(!byTestId("aw-recommendation"));
  });

  test("+ Dropset: appended at the end as the expanded card „Dropset”; removable", async () => {
    await startPlan({ plans: [PLAN] });
    await click(byTestId("aw-add-dropset"));
    await flush(5, 2);
    assert.match(byTestId("aw-set-current").textContent, /^Dropset/);
    assert.equal(sets().length, 4);
    assert.equal(sets()[3].setType, "dropset");
    await click(byTestId("aw-remove-dropset"));
    await flush(5, 2);
    assert.equal(sets().length, 3);
  });

  test("comment: icon opens the field in the card; the note is stored on the set", async () => {
    await startPlan({ plans: [PLAN] });
    await click(aria("Komentarz do serii"));
    await flush(5, 2);
    await type(byTestId("aw-set-current").querySelector("textarea"), "Lekki ból nadgarstka");
    await flush(5, 2);
    assert.equal(sets()[0].note, "Lekki ból nadgarstka");
  });
});

describe("I4.4 Active Workout — rest, superset, menu, footer", () => {
  test("rest: „Start przerwy (90 s)” → docked timer 01:30 with pause / reset / close", async () => {
    await startPlan({ plans: [PLAN] });
    assert.match(byTestId("aw-rest-start").textContent, /Start przerwy \(90 s\)/);
    await click(byTestId("aw-rest-start"));
    await flush(5, 2);
    const rest = byTestId("aw-rest");
    assert.equal(rest.getAttribute("role"), "region");
    assert.equal(rest.getAttribute("aria-label"), "Przerwa");
    assert.equal(byTestId("aw-rest-time").textContent, "01:30");
    assert.ok(aria("Pauza przerwy"), "running");
    await click(aria("Pauza przerwy"));
    await flush(5, 2);
    assert.ok(aria("Start przerwy"));
    await click(aria("Resetuj przerwę"));
    await click(aria("Zamknij przerwę"));
    await flush(5, 2);
    assert.ok(byTestId("aw-rest-start"));
  });

  test("superset A / B: green label, tablist capsules, Następne → B, rest for the whole superset", async () => {
    const ss = { ...PLAN, exercises: [item("pi-1", BENCH, { supersetGroup: "g1" }), item("pi-2", "chest_press_machine_flat", { loadModel: "plate_loaded", supersetGroup: "g1" })] };
    await startPlan({ plans: [ss] });
    const bar = byTestId("aw-superset");
    assert.ok(bar, "one block with A / B");
    assert.match(bar.textContent, /Superseria · ćwiczenie 1 z 2/);
    const tabs = bar.querySelectorAll('[role="tab"]');
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
    assert.match(byTestId("aw-rest-start").textContent, /— cała superseria/);
    await click(btn(/^Następne/));
    await flush(5, 2);
    assert.equal(byTestId("aw-superset").querySelectorAll('[role="tab"]')[1].getAttribute("aria-selected"), "true");
  });

  test("⋮ menu: bottom sheet (dialog) with the existing actions; Przerwij keeps the draft", async () => {
    await startPlan({ plans: [PLAN] });
    await click(byTestId("aw-menu"));
    await flush(5, 2);
    const sheet = byTestId("aw-menu-sheet");
    assert.equal(sheet.getAttribute("role"), "dialog");
    assert.equal(sheet.getAttribute("aria-modal"), "true");
    assert.deepEqual(
      $$("button", sheet).map((b) => b.textContent.trim()),
      ["Dodaj kolejne ćwiczenie do treningu", "Zamień ćwiczenie", "Zakończ treningBieżące wyniki zostaną zapisane i trening zostanie zakończony.", "Przerwij treningPostęp zostanie zapisany — wrócisz do treningu z ekranu Start."]
    );
    await click(btn(/^Przerwij trening/));
    await flush(5, 2);
    await click($$("button").filter((b) => b.textContent.trim() === "Przerwij trening").pop());
    await flush(10, 3);
    assert.ok(byTestId("dashboard-active-workout"), "back on the Dashboard with the unfinished workout");
    assert.ok(localStorage.getItem(K("active_workout_draft")));
  });

  test("footer: Poprzednie (off on the first) / Następne; the last exercise shows Zakończ", async () => {
    await startPlan({ plans: [PLAN] });
    const prev = document.querySelector('[data-act="prev"]');
    assert.equal(prev.disabled, true);
    await click(document.querySelector('[data-act="next"]'));
    await flush(5, 2);
    assert.match(document.querySelector("header[data-header]").textContent, /Ćwiczenie 2 z 2/);
    assert.match(document.querySelector('[data-act="finish"]').textContent, /Zakończ/);
    assert.equal(document.querySelector('[data-act="prev"]').disabled, false);
  });
});
