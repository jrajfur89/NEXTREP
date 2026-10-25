// I4.2 — Dashboard after the approved masters (canvas v81): New User A / B (DASH-NU), Returning User
// (DASH-RU), Interrupted Workout (DASH-IW). Values only from the existing app logic; values the masters
// did not approve are a marked temporary state; no fictitious data.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, $$, byTestId, loadApp, workoutSetShown } from "../harness/ui.mjs";

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
const dash = () => byTestId("dashboard");
const text = () => dash().textContent;
const btn = (re) => $$("button").find((b) => re.test(b.textContent.trim()));
const PLAN = { id: "plan-a", name: "Push A", exercises: [{ id: "pi-1", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", loadModel: null, restSeconds: 90, setsDetail: [{ id: "d1", target: "8-10", rir: "1-2" }] }] };
const session = (id, date, extra = {}) => ({ id, date, planId: null, planName: null, durationSec: 3720, volume: 12450, exercises: [{ id: `${id}-e`, exerciseId: "bench_press_barbell_flat", name: "Wyciskanie", type: "weight", sets: [{ weight: 60, reps: "8" }] }], ...extra });

describe("I4.2 Dashboard — New User", () => {
  test("A (no plan, no workout): Witaj!, first-step card → Trening, how-it-works, explore tiles; no stats, no history", async () => {
    await boot();
    assert.equal(dash().dataset.screen, "new-user-noplan");
    assert.match(text(), /Witaj!/);
    assert.match(text(), /Twój pierwszy rep zaczyna się dziś\./);
    assert.match(text(), /Pierwszy krok/);
    assert.match(text(), /Jak to działa/);
    assert.match(text(), /Wolisz najpierw się rozejrzeć\?/);
    assert.ok(!byTestId("dashboard-progress") && !byTestId("dashboard-last-workout"), "no statistics, no fictitious history");
    await click(byTestId("dashboard-start"));
    await flush(10, 3);
    assert.ok(btn(/TRENING BEZ PLANU/i), "CTA → Trening section");
  });
  test("A with a name: „Witaj, Ola!”; the greeting still opens the name editor", async () => {
    await boot({ user_name: "Ola" });
    assert.match(text(), /Witaj, Ola!/);
    await click(byTestId("dashboard-greeting"));
    await flush(5, 2);
    assert.ok($$("input").length > 0, "name editor open");
  });
  test("explore tiles: Gotowe plany → Plany (marked „wkrótce”), Ćwiczenia → Ćwiczenia", async () => {
    await boot();
    assert.match(byTestId("dashboard-tile-plans").textContent, /wkrótce/);
    await click(byTestId("dashboard-tile-exercises"));
    await flush(10, 3);
    assert.ok(byTestId("atlas-entry"), "Ćwiczenia");
  });
  test("B (plan, no finished workout): „Pierwszy trening z planu” with the plan; CTA starts that plan", async () => {
    await boot({ plans: [PLAN] });
    assert.equal(dash().dataset.screen, "new-user-withplan");
    assert.match(text(), /Pierwszy trening z planu/);
    assert.match(text(), /Push A/);
    assert.match(text(), /Rozpocznij plan/);
    await click(byTestId("dashboard-start"));
    await flush(10, 4);
    const draft = JSON.parse(localStorage.getItem(K("active_workout_draft")));
    assert.equal(draft.plan.name, "Push A", "the plan's workout started");
  });
});

describe("I4.2 Dashboard — Returning User", () => {
  test("last workout card from the newest session; progress card: workouts from the 30-day rule, the rest „Wkrótce”", async () => {
    await boot({ history: [session("s1", "2026-10-01T10:00:00.000Z"), session("s2", "2026-10-10T10:00:00.000Z", { planName: "Legs A" })] });
    assert.equal(dash().dataset.screen, "returning");
    assert.match(text(), /Cześć!/);
    const last = byTestId("dashboard-last-workout");
    assert.match(last.textContent, /Legs A/);
    assert.match(last.textContent, /10 października 2026/);
    assert.match(last.textContent, /62 min/);
    assert.match(last.textContent, /Objętość: 12 450 kg/);
    const prog = byTestId("dashboard-progress");
    assert.match(prog.textContent, /Treningi2/);
    assert.equal(prog.querySelectorAll('[data-state="temporary"]').length, 2);
    assert.ok(byTestId("dashboard-start-card"), "no next plan → the start card (fallback, state not designed)");
    await click(last);
    await flush(10, 3);
    assert.ok(!dash(), "the last-workout card opens the workout details");
  });
  test("next plan card after the last plan session; CTA starts it", async () => {
    const plans = [PLAN, { ...PLAN, id: "plan-b", name: "Pull B" }];
    await boot({ plans, history: [session("s1", "2026-10-10T10:00:00.000Z", { planId: "plan-a", planName: "Push A" })] });
    const card = byTestId("dashboard-next-plan");
    assert.match(card.textContent, /Następny trening/);
    assert.match(card.textContent, /Pull B/);
    assert.match(card.textContent, /1 ćwiczenie/);
    await click(byTestId("dashboard-start"));
    await flush(10, 4);
    assert.equal(JSON.parse(localStorage.getItem(K("active_workout_draft"))).plan.name, "Pull B");
  });
  test("progress card opens Statystyki", async () => {
    await boot({ history: [session("s1", "2026-10-10T10:00:00.000Z")] });
    await click(byTestId("dashboard-progress"));
    await flush(10, 3);
    assert.ok(!dash());
  });
});

describe("I4.2 Dashboard — Interrupted Workout", () => {
  const draft = async () => {
    const plan = { ...PLAN };
    const blocks = A.buildBlocksFromPlan(plan, [], [], new Date().toISOString());
    blocks[0].items[0].sets[0] = { ...blocks[0].items[0].sets[0], weight: "60", reps: "8" };
    return { version: 1, savedAt: new Date(Date.now() - 60000).toISOString(), plan, backfillInfo: null, nowDate: new Date().toISOString(), startTime: Date.now() - 24 * 60000 - 18000 - 60000, blocks, blockIdx: 0, subIdx: 0, manualDuration: 45 };
  };
  test("unfinished workout first: card, stats from the draft, „Wznów trening”, info line; no competing start", async () => {
    A = A || (await loadApp());
    await boot({ active_workout_draft: await draft(), history: [session("s1", "2026-10-10T10:00:00.000Z")] });
    assert.equal(dash().dataset.screen, "interrupted");
    assert.match(text(), /Dokończ trening, który już zacząłeś\./);
    const card = byTestId("dashboard-active-workout");
    assert.match(card.textContent, /Niedokończony trening/);
    assert.match(card.textContent, /Push A/);
    assert.match(card.textContent, /Ćwiczenia1 \/ 1/);
    assert.match(card.textContent, /Czas24:18/);
    assert.match(card.textContent, /Objętość480 kg/);
    assert.match(text(), /Trening trafi do historii dopiero po jego zakończeniu\./);
    assert.ok(!byTestId("dashboard-next-plan") && !byTestId("dashboard-start-card"), "no competing start");
    assert.ok(byTestId("dashboard-last-workout"), "last workout below");
  });
  test("Opcje → sheet (dialog) → Przerwij bez zapisywania → Usuń trening clears the draft", async () => {
    await boot({ active_workout_draft: await draft() });
    await click(byTestId("dashboard-draft-options"));
    await flush(5, 2);
    const sheet = byTestId("dashboard-draft-menu");
    assert.equal(sheet.getAttribute("role"), "dialog");
    assert.equal(sheet.getAttribute("aria-modal"), "true");
    assert.deepEqual($$("button", sheet).map((b) => b.textContent.trim()), ["Wznów trening", "Przerwij bez zapisywania", "Anuluj"]);
    await click(btn(/^Przerwij bez zapisywania$/));
    await flush(5, 2);
    assert.match(byTestId("dashboard-draft-menu").textContent, /Przerwać bez zapisywania\?/);
    await click(btn(/^Usuń trening$/));
    await flush(10, 3);
    assert.equal(localStorage.getItem(K("active_workout_draft")), null);
    assert.equal(dash().dataset.screen, "new-user-withplan".replace("withplan", "noplan"));
  });
  test("„Wznów trening” opens the workout as it was left", async () => {
    await boot({ active_workout_draft: await draft() });
    await click(byTestId("dashboard-resume"));
    await flush(10, 3);
    assert.ok(!dash());
    assert.ok(workoutSetShown(60));
  });
});
