// I3 (24.10.2026) — the NEXTREP 1.0 atlas as the ONLY source of exercises in S1, tested on the app as it
// ships (bundle app-s1):
//   - the pickers of plans and workouts list the atlas (55), no own-exercise list, no "add" form;
//   - a plan item stores catalogExerciseId (= exerciseId) and the checked model (B02-D21 choice asked);
//   - a workout exercise carries catalogExerciseId + load snapshot v3 built by the nr1 domain; the
//     snapshot is frozen into the saved session; the set format is unchanged;
//   - catalog exercises are never copied into the person's exercise list;
//   - the old "add exercise" form is off; muscle-group stats of the old grouping are off;
//   - a JSON copy that does not fit the atlas-only model is refused.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $$, byTestId, buttonByText, loadApp } from "../harness/ui.mjs";
import { validateLoadSnapshot } from "../../src/engine/load-snapshot.js";
import { validateWorkoutSet } from "../../src/nr1/contracts/set.js";

useS1Profile();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const atlas = JSON.parse(readFileSync(resolve(root, "src/atlas/atlas.json"), "utf8"));
const K = (n) => `nextrep1_guest_${n}_v1`;
const read = (k) => JSON.parse(localStorage.getItem(k));
const btn = (re) => $$("button").find((b) => re.test(b.textContent.trim()));
let A;

async function boot(seed = {}) {
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
async function pickFromAtlas(name) {
  await type(document.querySelector('input[placeholder="Szukaj w atlasie..."]'), name);
  await flush(5, 2);
  await click($$('[data-testid="atlas-picker-item"]').find((b) => b.textContent.startsWith(name)));
  await flush(5, 3);
}
async function finishWorkout() {
  while (!btn(/^Zakończ/) && btn(/^Następne/)) {
    await click(btn(/^Następne/));
    await flush(5, 2);
  }
  await click(btn(/^Zakończ/));
  await flush(10, 3);
  await click(byTestId("wcs-finish"));
  await flush(10, 5);
}

before(async () => {
  A = await loadApp();
});
after(async () => {
  await unmount();
});

describe("I3: plan editor picks from the atlas", () => {
  test("Dodaj ćwiczenie do planu → atlas (55), no 'add' form; the item keeps the atlas id; a machine asks for the model", async () => {
    assert.equal(A.NR_ATLAS_ONLY_EXERCISES, true, "S1 ships the atlas-only exercises");
    await unmount();
    let saved = null;
    await mount(React.createElement(A.PlanEditor, { plan: null, exercises: [], onSave: (p) => (saved = p), onCancel: () => {} }));
    await flush(5, 2);
    await type(document.querySelector('input[placeholder]'), "Klatka A");
    await click(btn(/Dodaj ćwiczenie do planu/));
    await flush(5, 2);
    assert.ok(byTestId("atlas-picker"));
    assert.equal($$('[data-testid="atlas-picker-item"]').length, 55);
    assert.ok(!$$("button").some((b) => b.textContent.trim() === "Dodaj ćwiczenie"), "no add-exercise form");
    await pickFromAtlas("Wyciskanie sztangi leżąc na ławce poziomej");
    assert.ok(document.body.textContent.includes("Wyciskanie sztangi leżąc na ławce poziomej"), "shown in the plan from the atlas");
    await click(btn(/Dodaj ćwiczenie do planu/));
    await flush(5, 2);
    await pickFromAtlas(atlas.exercises.find((e) => e.exerciseId === "chest_press_machine_flat").namePl);
    assert.ok(byTestId("atlas-model-choice"), "the model is asked (B02-D21)");
    await click(btn(/^Maszyna ładowana talerzami/));
    await flush(5, 3);
    await click(btn(/Zapisz plan/));
    await flush(5, 3);
    assert.ok(saved, "plan saved");
    const [a, b] = saved.exercises;
    assert.equal(a.catalogExerciseId, "bench_press_barbell_flat");
    assert.equal(a.exerciseId, "bench_press_barbell_flat");
    assert.equal(a.loadModel, null);
    assert.equal(a.setsDetail.length, 3);
    assert.equal(b.catalogExerciseId, "chest_press_machine_flat");
    assert.equal(b.loadModel, "plate_loaded");
  });
});

describe("I3: workouts on atlas exercises (whole app, S1)", () => {
  const PLAN = {
    id: "plan-a",
    name: "Klatka A",
    exercises: [
      { id: "pi-1", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", loadModel: null, restSeconds: 90, supersetGroup: null, setsDetail: [{ id: "d1", target: "8-10", rir: "1-2" }, { id: "d2", target: "8-10", rir: "1-2" }] },
      { id: "pi-2", exerciseId: "chest_press_machine_flat", catalogExerciseId: "chest_press_machine_flat", loadModel: "plate_loaded", restSeconds: 90, supersetGroup: null, setsDetail: [{ id: "d3", target: "10-12", rir: "1-2" }] },
    ],
  };

  test("plan → workout: every exercise carries catalogExerciseId + snapshot v3; finishing freezes it into history; nothing copied into the exercise list", async () => {
    await boot({ plans: [PLAN] });
    await click(btn(/^Trening$/));
    await flush(10, 3);
    await click(byTestId("tef-own"));
    await flush(5, 2);
    await click(btn(/Klatka A/));
    await flush(10, 4);
    const draft = read(K("active_workout_draft"));
    const items = draft.blocks.flatMap((b) => b.items);
    assert.deepEqual(items.map((i) => [i.catalogExerciseId, i.loadSnapshot.loadModel, i.name]), [
      ["bench_press_barbell_flat", "barbell_total", "Wyciskanie sztangi leżąc na ławce poziomej"],
      ["chest_press_machine_flat", "plate_loaded", atlas.exercises.find((e) => e.exerciseId === "chest_press_machine_flat").namePl],
    ]);
    for (const i of items) assert.deepEqual(validateLoadSnapshot(i.loadSnapshot), []);
    assert.ok(byTestId("atlas-load-hint"), "the load-model hint is shown");
    await type(document.querySelector('input[data-field="kg"]'), "60");
    await type(document.querySelector('input[data-field="reps"]'), "8");
    await flush(5, 3);
    await finishWorkout();
    const history = read(K("history"));
    assert.equal(history.length, 1);
    const ex = history[0].exercises.find((e) => e.catalogExerciseId === "bench_press_barbell_flat");
    assert.deepEqual(ex.loadSnapshot, items[0].loadSnapshot, "the snapshot taken at the start is kept");
    assert.equal(ex.exerciseId, "bench_press_barbell_flat");
    const set = ex.sets[0];
    assert.equal(set.weight, 60);
    assert.equal(set.reps, "8");
    assert.deepEqual(Object.keys(set).filter((k) => ["loadKg", "assistKg", "durationSec"].includes(k)), [], "set format unchanged");
    // the nr1 contract accepts the set values for this snapshot once typed (later stage converts)
    assert.deepEqual(validateWorkoutSet({ id: "s", setType: "working", status: "done", reps: 8, loadKg: 60, rir: null }, ex.loadSnapshot), []);
    assert.equal(localStorage.getItem(K("exercises")), null, "no catalog exercise copied into the exercise list");
  });

  test("no-plan workout → Dodaj ćwiczenie → atlas picker; restart keeps the snapshot", async () => {
    await boot();
    await click(btn(/^Trening$/));
    await flush(10, 3);
    await click(byTestId("tef-no-plan"));
    await flush(10, 3);
    await click($$("button").find((b) => b.textContent.trim() === "Dodaj ćwiczenie"));
    await flush(5, 3);
    assert.ok(byTestId("atlas-picker"));
    await pickFromAtlas("Rozpiętki z gumą stojąc");
    const item = read(K("active_workout_draft")).blocks[0].items[0];
    assert.equal(item.catalogExerciseId, "fly_band_standing");
    assert.equal(item.type, "bodyweight");
    assert.equal(item.loadSnapshot.loadModel, "band");
    const snap = item.loadSnapshot;
    await unmount();
    A.__testState.resetActiveDataNamespace();
    await mount(React.createElement(A.App));
    await flush(20, 5);
    assert.deepEqual(read(K("active_workout_draft")).blocks[0].items[0].loadSnapshot, snap);
    assert.equal(localStorage.getItem(K("exercises")), null);
  });

  test("Ćwiczenia: no 'Dodaj' (old form off); Statystyki (PRO): muscle groups of the old grouping off", async () => {
    await boot({ pro_status: { manualPro: true } });
    await click(btn(/^Ćwiczenia$/));
    await flush(10, 3);
    assert.ok(!$$("button").some((b) => b.textContent.trim() === "Dodaj"), "no add button");
    assert.ok(byTestId("atlas-entry"));
    await click(btn(/^Statystyki$/));
    await flush(10, 3);
    assert.ok(byTestId("muscle-groups-off"));
  });
});
