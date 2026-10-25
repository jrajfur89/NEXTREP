// I4.3 — Training Entry Flow (master TEFM v1): the selection of the Trening tab and the own-plans empty
// state. The protection states (decision, confirmation, cancelled, deleted, error, unreadable) are
// covered by ui/sec-hf-01-workout-safety (P0-1).
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, $$, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
let A;
async function boot(seed = {}) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(`nextrep1_guest_${n}_v1`, JSON.stringify(v));
  await mount(React.createElement(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
  await click(byTestId("nav-startWorkout"));
  await flush(10, 3);
}
after(async () => {
  await unmount();
});

describe("I4.3 Training Entry Flow", () => {
  test("selection: title, subtitle, three paths with the master texts; Trening tab active", async () => {
    await boot();
    const s = byTestId("tef-select");
    assert.equal(s.querySelector("h1").textContent, "Rozpocznij trening");
    assert.match(s.textContent, /Wybierz, jak chcesz dziś trenować\./);
    assert.deepEqual(["tef-own", "tef-ready", "tef-no-plan"].map((id) => byTestId(id).querySelector("span > span").textContent), [
      "Własne plany treningowe",
      "Gotowe plany treningowe",
      "Trening bez planu",
    ]);
    assert.match(byTestId("tef-ready").textContent, /wkrótce/);
    assert.equal(byTestId("nav-startWorkout").getAttribute("aria-current"), "page");
  });
  test("own plans empty state: back, create plan → Plany, see ready plans → the ready list", async () => {
    await boot();
    await click(byTestId("tef-own"));
    await flush(5, 2);
    const e = byTestId("tef-own-empty");
    assert.match(e.textContent, /Nie masz jeszcze własnych planów/);
    await click(byTestId("tef-see-ready"));
    await flush(5, 2);
    assert.equal($$('[data-testid="template-coming-soon"]').length, 8, "ready plans (all „Wkrótce”)");
    await boot();
    await click(byTestId("tef-own"));
    await flush(5, 2);
    await click($$("button").find((b) => b.getAttribute("aria-label") === "Wróć"));
    await flush(5, 2);
    assert.ok(byTestId("tef-select"), "Wróć → selection");
    await click(byTestId("tef-own"));
    await flush(5, 2);
    await click(byTestId("tef-create-plan"));
    await flush(10, 3);
    assert.equal(byTestId("nav-plans").getAttribute("aria-current"), "page", "Plany");
  });
  test("own plans present: the existing list starts the chosen plan", async () => {
    await boot({ plans: [{ id: "p1", name: "Push A", exercises: [{ id: "i", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", loadModel: null, setsDetail: [{ id: "d", target: "8-10", rir: "1-2" }] }] }] });
    await click(byTestId("tef-own"));
    await flush(5, 2);
    await click($$("button").find((b) => /Push A/.test(b.textContent)));
    await flush(10, 4);
    assert.equal(JSON.parse(localStorage.getItem("nextrep1_guest_active_workout_draft_v1")).plan.name, "Push A");
  });
});
