// AT2 (NEXTREP 1.0) — „Atlas ćwiczeń”: the approved atlas release as a READ-ONLY catalog in the
// existing app. Adapter (buildAtlasCatalog), the catalog in „Ćwiczenia”, and the guarantees of the
// stage: nothing is written to storage, no network / Supabase call, the user's exercise list and the
// old built-in exercises are untouched.
// I5.3 (ATLAS-UX-01): the AT2 entry tile and list are replaced by E01 / E03 of the module „Ćwiczenia”
// (the app as it ships, S1); the same requirements are checked on the new entry, the card is the same.
import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { React, mount, unmount, byTestId, click, flush, loadApp, $$ } from "../harness/ui.mjs";
import { resetStorage, useS1Profile } from "../harness/load-app.mjs";
import { ATLAS_RELEASE } from "../../src/engine/index.js";
import { LEGACY_DEFAULT_EXERCISES } from "../fixtures/legacy/default-exercises.mjs"; // I2: the old list is test data now

const h = React.createElement;
const repoAtlas = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
useS1Profile();
let A;
before(async () => {
  A = await loadApp();
});
beforeEach(() => {
  resetStorage();
  A.atlasBrowseReset();
});
after(unmount);

const clone = (x) => JSON.parse(JSON.stringify(x));
const isDeepFrozen = (v) => !v || typeof v !== "object" || (Object.isFrozen(v) && Object.values(v).every(isDeepFrozen));

describe("AT2 adapter: atlas release → read-only catalog", () => {
  test("the engine exposes exactly the repository atlas file", () => {
    assert.deepEqual(ATLAS_RELEASE, repoAtlas);
  });

  test("the app catalog = buildAtlasCatalog(repository atlas): all active exercises, sorted by Polish name, deep-frozen", () => {
    const fresh = A.buildAtlasCatalog(clone(repoAtlas));
    assert.deepEqual(A.ATLAS_CATALOG, fresh);
    const active = repoAtlas.exercises.filter((e) => e.status === "active");
    assert.equal(A.ATLAS_CATALOG.atlasVersion, repoAtlas.atlasVersion);
    assert.equal(A.ATLAS_CATALOG.exercises.length, active.length);
    assert.deepEqual(A.ATLAS_CATALOG.exercises.map((e) => e.exerciseId).sort(), active.map((e) => e.exerciseId).sort());
    const names = A.ATLAS_CATALOG.exercises.map((e) => e.name);
    assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, "pl")));
    assert.ok(isDeepFrozen(A.ATLAS_CATALOG), "the catalog cannot be modified");
    assert.throws(() => { "use strict"; A.ATLAS_CATALOG.exercises.push({}); });
  });

  test("Batch 01 (release 1, in every later release): 15 exercises with every label resolved from the dictionaries", () => {
    // since B02-S5 the catalog holds more batches; Batch 01 = the exercises introduced in release 1
    const b01Ids = new Set(repoAtlas.exercises.filter((e) => e.introducedIn === 1).map((e) => e.exerciseId));
    const b01 = A.ATLAS_CATALOG.exercises.filter((e) => b01Ids.has(e.exerciseId));
    assert.equal(b01.length, 15);
    for (const ex of b01) {
      const src = repoAtlas.exercises.find((e) => e.exerciseId === ex.exerciseId);
      assert.equal(ex.name, src.namePl);
      assert.deepEqual(ex.aliases, src.aliasesPl);
      assert.equal(ex.tips, src.tipsPl);
      assert.deepEqual(ex.equipment.map((x) => x.code), src.equipment);
      assert.deepEqual(ex.primaryMuscles.map((x) => x.code), src.primaryMuscles);
      assert.deepEqual(ex.secondaryMuscles.map((x) => x.code), src.secondaryMuscles);
      for (const x of [...ex.equipment, ...ex.primaryMuscles, ...ex.secondaryMuscles]) assert.notEqual(x.label, x.code, `${ex.exerciseId}: label for ${x.code}`);
      for (const k of ["loadModel", "measurementType", "laterality", "repsCounting"]) {
        assert.equal(ex[k].code, src[k]);
        assert.notEqual(ex[k].label, ex[k].code, `${ex.exerciseId}: ${k} label`);
      }
      assert.ok(ex.statsGroups.length >= 1 && ex.statsGroups.every((g) => g.label !== g.code));
    }
    const row = A.ATLAS_CATALOG.exercises.find((e) => e.exerciseId === "row_dumbbell_single_bench_supported");
    assert.equal(row.loadModel.label, "Jeden hantel — wpisujesz jego ciężar");
    assert.deepEqual([row.laterality.label, row.repsCounting.label], ["Jednostronnie", "Powtórzenia na stronę"]);
    const weighted = A.ATLAS_CATALOG.exercises.find((e) => e.exerciseId === "pullup_pronated_weighted");
    assert.equal(weighted.loadModel.label, "Masa ciała + dodatkowy ciężar — wpisujesz tylko dodane kg");
    const squat = A.ATLAS_CATALOG.exercises.find((e) => e.exerciseId === "squat_barbell_back");
    assert.deepEqual(squat.statsGroups.map((g) => g.label), ["Uda — przód", "Uda — tył i pośladki"]);
  });

  test("whole release: every load model, measurement type, laterality and reps counting has a Polish label (incl. smith_plates_only, B02-S5)", () => {
    for (const ex of A.ATLAS_CATALOG.exercises) for (const k of ["loadModel", "measurementType", "laterality", "repsCounting"]) {
      assert.notEqual(ex[k].label, ex[k].code, `${ex.exerciseId}: ${k} label`);
    }
    const smith = A.ATLAS_CATALOG.exercises.find((e) => e.exerciseId === "bench_press_smith_flat");
    assert.equal(smith.loadModel.label, "Maszyna Smitha — wpisujesz tylko masę talerzy");
  });

  test("pure and defensive: input untouched, archived exercises hidden, unknown codes shown as codes, empty atlas", () => {
    const input = clone(repoAtlas);
    input.exercises = input.exercises.slice(0, 2).map((e, i) => (i === 0 ? { ...e, status: "archived" } : { ...e, equipment: [...e.equipment, "nowy_sprzet"], loadModel: "nowy_model" }));
    const before = JSON.stringify(input);
    const c = A.buildAtlasCatalog(input);
    assert.equal(JSON.stringify(input), before, "the atlas object is not modified");
    assert.equal(c.exercises.length, 1);
    assert.equal(c.exercises[0].equipment.at(-1).label, "nowy_sprzet");
    assert.equal(c.exercises[0].loadModel.label, "nowy_model");
    assert.deepEqual(A.buildAtlasCatalog({ formatVersion: 1, atlasVersion: 0, dictionaries: {}, families: [], exercises: [], issuedIds: [] }).exercises, []);
    assert.deepEqual(A.buildAtlasCatalog(null).exercises, []);
  });
});

// ---- the screen ----------------------------------------------------------------------------
function spyAll() {
  const s = { writes: [], network: [] };
  const ls = globalThis.localStorage;
  const proto = Object.getPrototypeOf(ls);
  const orig = { setItem: proto.setItem, removeItem: proto.removeItem, clear: proto.clear };
  proto.setItem = function (k, v) { s.writes.push(["setItem", k]); return orig.setItem.call(this, k, v); };
  proto.removeItem = function (k) { s.writes.push(["removeItem", k]); return orig.removeItem.call(this, k); };
  proto.clear = function () { s.writes.push(["clear"]); return orig.clear.call(this); };
  const w = globalThis.window;
  const origFetch = w.fetch;
  const origXhrOpen = w.XMLHttpRequest && w.XMLHttpRequest.prototype.open;
  const origBeacon = w.navigator.sendBeacon;
  w.fetch = globalThis.fetch = (...a) => { s.network.push(["fetch", String(a[0])]); return Promise.reject(new Error("blocked in test")); };
  if (origXhrOpen) w.XMLHttpRequest.prototype.open = function (...a) { s.network.push(["xhr", String(a[1])]); return origXhrOpen.apply(this, a); };
  w.navigator.sendBeacon = (...a) => { s.network.push(["beacon", String(a[0])]); return false; };
  const sbBefore = globalThis.__nrSupabase ? globalThis.__nrSupabase.calls.length : 0;
  s.supabaseCalls = () => (globalThis.__nrSupabase ? globalThis.__nrSupabase.calls.length - sbBefore : 0);
  s.restore = () => {
    Object.assign(proto, orig);
    w.fetch = globalThis.fetch = origFetch;
    if (origXhrOpen) w.XMLHttpRequest.prototype.open = origXhrOpen;
    w.navigator.sendBeacon = origBeacon;
  };
  return s;
}

function screenProps() {
  const exercises = LEGACY_DEFAULT_EXERCISES.map((e) => A.normalizeExercise(e));
  const updates = [];
  const navigations = [];
  return {
    props: { exercises, updateExercises: (fn) => updates.push(fn), onNavigate: (to) => navigations.push(to), onOpenDetail: () => {} },
    exercises,
    updates,
    navigations,
  };
}

const rowName = (r) => r.querySelector("span span").textContent;
describe("AT2 → I5.3 screen: the atlas in „Ćwiczenia” (E01 → E03 → card)", () => {
  test("E01 „Wszystkie ćwiczenia” → list of all catalog exercises → details → back to the list → back to „Ćwiczenia”", async () => {
    const { props } = screenProps();
    await mount(h(A.ExercisesScreen, props));
    assert.ok(byTestId("atlas-home"), "E01");
    assert.equal(byTestId("atlas-entry"), null, "the AT2 tile is replaced");
    assert.match(byTestId("atlas-home-total").textContent, new RegExp(`${A.ATLAS_CATALOG.exercises.length} ćwiczeń`));
    const entry = byTestId("atlas-all");
    assert.equal(entry.textContent, `Wszystkie ćwiczenia${A.ATLAS_CATALOG.exercises.length} · alfabetycznie`);
    assert.match(byTestId("atlas-own").textContent, new RegExp(`^Ćwiczenia zapisane wcześniej${LEGACY_DEFAULT_EXERCISES.length} ćwiczeń`), "the person's own list (old model) is still there — renamed in DES-01 / D2");

    await click(entry);
    assert.ok(byTestId("atlas-list"));
    assert.equal(byTestId("atlas-home"), null);
    assert.equal(byTestId("atlas-results-count").textContent, `${A.ATLAS_CATALOG.exercises.length} ćwiczeń`);
    const items = $$('[data-testid="atlas-row"]');
    assert.equal(items.length, A.ATLAS_CATALOG.exercises.length);
    assert.deepEqual(items.map(rowName), A.ATLAS_CATALOG.exercises.map((e) => e.name));
    assert.deepEqual(items.map((b) => b.dataset.exerciseId), A.ATLAS_CATALOG.exercises.map((e) => e.exerciseId));
    // no edit / delete / add controls in the catalog
    assert.equal($$("button").filter((b) => /Dodaj|Usuń|Edytuj/.test(b.textContent)).length, 0);

    // the first exercise that has aliases (the aliases section is shown only when there are some)
    const at = A.ATLAS_CATALOG.exercises.findIndex((e) => e.aliases.length > 0);
    assert.ok(at >= 0, "the catalog has an exercise with aliases");
    const ex = A.ATLAS_CATALOG.exercises[at];
    await click(items[at]);
    assert.ok(byTestId("atlas-detail"));
    assert.equal(byTestId("atlas-detail-name").textContent, ex.name);
    // I4.6 (card v3): the metadata sits in the collapsed „Szczegóły ćwiczenia”
    assert.equal(byTestId("atlas-detail-primary-equipment").textContent, `Podstawowy sprzęt: ${ex.equipment[0].label}`);
    await click(byTestId("exv-details").querySelector("button"));
    assert.equal(byTestId("atlas-detail-aliases").textContent, ex.aliases.join(" · "));
    assert.equal(byTestId("atlas-detail-equipment").textContent, ex.equipment.map((x) => x.label).join(" · "));
    assert.equal(byTestId("atlas-detail-primary").textContent, ex.primaryMuscles.map((x) => x.label).join(", "));
    if (ex.secondaryMuscles.length) assert.equal(byTestId("atlas-detail-secondary").textContent, ex.secondaryMuscles.map((x) => x.label).join(", "));
    assert.equal(byTestId("atlas-detail-model").textContent, ex.loadModel.label);
    assert.match(byTestId("atlas-detail-sides").textContent, new RegExp(ex.laterality.label));
    assert.equal(byTestId("atlas-detail-tips").textContent, ex.tips);

    // Back (hardware or on screen → popstate → exercisesOverlayRef): detail → list → „Ćwiczenia”
    await React.act(async () => A.exercisesOverlayRef.current());
    await flush();
    assert.ok(byTestId("atlas-list"));
    await React.act(async () => A.exercisesOverlayRef.current());
    await flush();
    assert.ok(byTestId("atlas-home"), "back on „Ćwiczenia”");
    assert.equal(A.exercisesOverlayRef.current, null, "no overlay left behind");
  });

  test("read-only: opening the catalog and every exercise writes nothing, sends nothing, changes no exercise", async () => {
    const { props, exercises, updates } = screenProps();
    const snapshot = JSON.stringify(exercises);
    const storageBefore = JSON.stringify({ ...globalThis.localStorage });
    await mount(h(A.ExercisesScreen, props));
    const spy = spyAll();
    try {
      await click(byTestId("atlas-all"));
      for (let i = 0; i < A.ATLAS_CATALOG.exercises.length; i++) {
        await click($$('[data-testid="atlas-row"]')[i]);
        assert.ok(byTestId("atlas-detail"));
        await React.act(async () => A.exercisesOverlayRef.current());
        await flush();
      }
      await React.act(async () => A.exercisesOverlayRef.current());
      await flush(20);
      assert.ok(byTestId("atlas-home"));
    } finally {
      spy.restore();
    }
    assert.deepEqual(spy.writes, [], "no localStorage write");
    assert.deepEqual(spy.network, [], "no network request");
    assert.equal(spy.supabaseCalls(), 0, "no Supabase call");
    assert.equal(updates.length, 0, "the user's exercise list is not updated");
    assert.equal(JSON.stringify(exercises), snapshot);
    assert.equal(JSON.stringify({ ...globalThis.localStorage }), storageBefore);
  });

  test("I2: the app has no old built-in list; id overlaps of the old list (test data) with the atlas are known and listed", async () => {
    assert.equal(A.DEFAULT_EXERCISES, undefined, "I2: the old catalog is gone from the app");
    assert.equal(A.EXERCISE_ATLAS_META, undefined);
    assert.equal(LEGACY_DEFAULT_EXERCISES.length, 68, "the old list survives only as test data");
    // The same identifier in the old list and in the atlas is a coincidence, NOT a mapping (K01: no
    // mapping of old ids). Listed here so that a new overlap from a later batch is noticed (risk for AT3).
    const atlasIds = new Set(A.ATLAS_CATALOG.exercises.map((e) => e.exerciseId));
    assert.deepEqual(LEGACY_DEFAULT_EXERCISES.filter((e) => atlasIds.has(e.id)).map((e) => e.id), ["hanging_knee_raise"]);
    const old = LEGACY_DEFAULT_EXERCISES.find((e) => e.id === "hanging_knee_raise");
    assert.deepEqual(old.category, ["Brzuch", "Pośladki"], "the old entry keeps its old data");
  });

  test("the person's own list (old views, unchanged) is one level below E01; searching there finds only own exercises", async () => {
    const { props } = screenProps();
    await mount(h(A.ExercisesScreen, props));
    await click(byTestId("atlas-own"));
    await flush();
    assert.equal(byTestId("atlas-home"), null);
    assert.equal(byTestId("atlas-entry"), null, "no AT2 entry tile in S1");
    assert.ok($$("button").some((b) => /Klatka/.test(b.textContent)), "the old category tiles are still there");
    const input = document.querySelector('input[placeholder="Szukaj ćwiczenia..."]');
    await React.act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "przysiad");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await flush();
    assert.ok(document.body.textContent.includes("Przysiad ze sztangą"), "an own exercise (test data) is found");
    assert.equal($$('[data-testid="atlas-row"]').length, 0, "no atlas row in the own list");
    await React.act(async () => A.exercisesOverlayRef.current());
    await flush();
    assert.ok(byTestId("atlas-home"), "Back → E01");
  });
});
