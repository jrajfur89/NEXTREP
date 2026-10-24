// I2 (24.10.2026) — NEXTREP 1.0 S1 profile, tested on the app EXACTLY as it ships (bundle app-s1, no
// test substitution):
//   1. the old built-in catalog (68 exercises) is gone and nothing seeds it — also after a restart;
//   2. clean local data space: old keys ("nextrep_…", "trainapp_…") stay byte for byte, are never read,
//      copied or removed; the app writes only its own "nextrep1_…" keys;
//   3. cloud sync temporarily off: no Supabase client is created, nothing is sent anywhere;
//   4. ready-made templates: no exercises, every template inactive („Wkrótce”);
//   5. the NEXTREP 1.0 atlas (catalog screen) is still there.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $$, byTestId, buttonByText, loadApp } from "../harness/ui.mjs";
import { LEGACY_DEFAULT_EXERCISES } from "../fixtures/legacy/default-exercises.mjs";

useS1Profile();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let A;

// What an earlier S1 build left on the device: the seeded old catalog in the old namespace, a finished
// workout, the old global keys, an old backup list and the old onboarding marker.
const OLD_SESSION = { id: "old-1", date: "2026-10-01T10:00:00.000Z", name: "Stary trening", exercises: [{ exerciseId: "bench_press", sets: [{ weight: 60, reps: 8 }] }] };
const OLD_KEYS = {
  nextrep_guest_exercises_v1: JSON.stringify(LEGACY_DEFAULT_EXERCISES),
  nextrep_guest_history_v1: JSON.stringify([OLD_SESSION]),
  nextrep_guest_user_name_v1: JSON.stringify("Stary"),
  trainapp_exercises_v1: JSON.stringify(LEGACY_DEFAULT_EXERCISES),
  trainapp_history_v1: JSON.stringify([OLD_SESSION]),
  trainapp_onboarding_completed_v1: "true",
  nextrep_backup_list_v1: JSON.stringify([{ id: "b1", namespace: "guest", kind: "AUTO", data: { history: [OLD_SESSION] } }]),
  nextrep_local_namespace_migration_v1: JSON.stringify({ status: "completed", target: "guest" }),
};
const oldDump = () => Object.fromEntries(Object.keys(OLD_KEYS).map((k) => [k, localStorage.getItem(k)]));
const ownKeys = () => Object.keys({ ...localStorage }).filter((k) => !(k in OLD_KEYS)).sort();
const read = (k) => JSON.parse(localStorage.getItem(k));

async function startApp() {
  await mount(React.createElement(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
}
async function restart() {
  await unmount();
  A.__testState.resetActiveDataNamespace();
  await startApp();
}
const bodyText = () => document.body.textContent;

before(async () => {
  A = await loadApp();
});
after(async () => {
  await unmount();
});

describe("I2: the shipped profile", () => {
  test("source: clean data space on, cloud sync off; no Supabase client", () => {
    assert.equal(A.NR_CLEAN_DATA_SPACE, true);
    assert.equal(A.NR_CLOUD_SYNC_ENABLED, false);
    assert.equal(A.supabase, null);
    const cfg = readFileSync(resolve(root, "src/app/01-config-utils.jsx"), "utf8");
    assert.match(cfg, /^const NR_CLEAN_DATA_SPACE = true;$/m);
    assert.match(cfg, /^const NR_CLOUD_SYNC_ENABLED = false;$/m);
    assert.match(cfg, /^ {2}NR_CLOUD_SYNC_ENABLED && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY \? createClient\(/m);
  });
  test("keys: scoped data, onboarding and backups live under nextrep1_", () => {
    A.__testState.resetActiveDataNamespace();
    A.activateDataNamespace(null);
    assert.equal(A.STORAGE_KEYS.exercises, "nextrep1_guest_exercises_v1");
    assert.equal(A.STORAGE_KEYS.history, "nextrep1_guest_history_v1");
    assert.equal(A.STORAGE_KEYS.onboardingCompleted, "nextrep1_onboarding_completed_v1");
    assert.equal(A.BACKUP_LIST_KEY, "nextrep1_backup_list_v1");
    assert.equal(A.getStorageKey("exercises", "abc"), "nextrep1_user_abc_exercises_v1");
  });
  test("the old catalog is gone from the app; templates carry no exercises and are all „Wkrótce”", () => {
    assert.equal(A.DEFAULT_EXERCISES, undefined);
    assert.equal(A.EXERCISE_ATLAS_META, undefined);
    assert.deepEqual(A.BUILT_IN_EXERCISES, []);
    assert.deepEqual(A.TEMPLATE_PLAN_DATA, {});
    assert.equal(A.READY_PLAN_TEMPLATES.length, 8);
    for (const t of A.READY_PLAN_TEMPLATES) {
      assert.equal(t.comingSoon, true, t.key);
      for (const lvl of t.levels) assert.equal(A.buildPlansFromTemplateLevel(t, lvl, []), null, lvl.id);
    }
    for (const f of ["10-atlas-templates.jsx", "21-app.jsx", "04-account-init-migration.jsx"]) {
      const code = readFileSync(resolve(root, "src/app", f), "utf8");
      assert.doesNotMatch(code, /DEFAULT_EXERCISES|EXERCISE_ATLAS_META|squat_barbell"|"Przysiad ze sztangą"/, f);
    }
  });
});

describe("I2: clean start on a device with old data", () => {
  test("first start: empty exercise list, nothing seeded, old data neither shown nor touched, no cloud", async () => {
    resetStorage();
    A.__testState.resetActiveDataNamespace();
    for (const [k, v] of Object.entries(OLD_KEYS)) localStorage.setItem(k, v);
    localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
    const before = oldDump();
    await startApp();
    assert.equal(A.__testState.activeDataNamespace, "guest");
    assert.ok(!bodyText().includes("Stary trening"), "the old workout is not shown");
    assert.equal(localStorage.getItem("nextrep1_guest_exercises_v1"), null, "no exercise list is seeded");
    assert.deepEqual(oldDump(), before, "old keys byte for byte");
    for (const k of ownKeys()) assert.match(k, /^nextrep1_/, `the app wrote only its own keys (${k})`);
    assert.equal(globalThis.__nrSupabase, undefined, "no Supabase client was ever created");
  });

  test("Ćwiczenia: no old exercise; the NEXTREP 1.0 atlas is still there", async () => {
    await click(buttonByText("Ćwiczenia"));
    await flush(10, 3);
    for (const name of ["Przysiad ze sztangą", "Wiosłowanie sztangą", "Plank z obciążeniem"]) assert.ok(!bodyText().includes(name), name);
    const entry = byTestId("atlas-entry");
    assert.ok(entry, "atlas entry tile");
    assert.match(entry.textContent, new RegExp(`${A.ATLAS_CATALOG.exercises.length} ćwiczeń`));
    assert.equal(A.ATLAS_CATALOG.exercises.length, 55);
    await click(entry);
    await flush(10, 3);
    assert.equal($$('[data-testid="atlas-item"]').length, 55);
  });

  test("restart (twice): still no old exercise, nothing seeded, old keys unchanged", async () => {
    const before = oldDump();
    for (let i = 0; i < 2; i++) {
      await restart();
      assert.equal(localStorage.getItem("nextrep1_guest_exercises_v1"), null);
      assert.ok(!bodyText().includes("Stary trening"));
      await click(buttonByText("Ćwiczenia"));
      await flush(10, 3);
      for (const e of LEGACY_DEFAULT_EXERCISES.slice(0, 10)) assert.ok(!bodyText().includes(e.name), e.name);
    }
    assert.deepEqual(oldDump(), before);
    for (const k of ownKeys()) assert.match(k, /^nextrep1_/, k);
    assert.equal(globalThis.__nrSupabase, undefined);
  });

  test("an exercise the person adds stays theirs after a restart (the only exercises are their own)", async () => {
    localStorage.setItem("nextrep1_guest_exercises_v1", JSON.stringify([{ id: "own-1", name: "Moje ćwiczenie", category: ["Klatka"], equipment: ["Sztanga"] }]));
    await restart();
    assert.deepEqual(read("nextrep1_guest_exercises_v1").map((e) => e.id), ["own-1"]);
    await click(buttonByText("Ćwiczenia"));
    await flush(10, 3);
    await type(document.querySelector('input[placeholder="Szukaj ćwiczenia..."]'), "ćwiczenie");
    await flush(10, 3);
    assert.ok(bodyText().includes("Moje ćwiczenie"));
    await type(document.querySelector('input[placeholder="Szukaj ćwiczenia..."]'), "przysiad");
    await flush(10, 3);
    assert.ok(!bodyText().includes("Przysiad ze sztangą"), "the search finds no old exercise");
  });

  test("Plany → Gotowe: all 8 templates listed with „Wkrótce”, none expands, no plan is created", async () => {
    await click(buttonByText("Plany"));
    await flush(10, 3);
    await click($$("button").find((b) => b.textContent.trim() === "Gotowe"));
    await flush(10, 3);
    const badges = $$('[data-testid="template-coming-soon"]');
    assert.equal(badges.length, 8);
    for (const t of A.READY_PLAN_TEMPLATES) {
      const card = buttonByText(t.name);
      assert.ok(card && card.disabled, `${t.name} inactive`);
      await click(card);
      await flush(5, 2);
      for (const lvl of t.levels) assert.ok(!$$("button").some((b) => b.textContent.trim().startsWith(lvl.label) && b !== card), `${t.key}: no level ${lvl.label}`);
    }
    assert.equal(localStorage.getItem("nextrep1_guest_plans_v1"), null, "no plan written");
  });

  test("Rozpocznij trening → Gotowe plany: 8 × „Wkrótce”, no level can be picked, no workout starts", async () => {
    await click(buttonByText("Start"));
    await flush(10, 3);
    await click(buttonByText("ROZPOCZNIJ TRENING"));
    await flush(10, 3);
    await click(buttonByText("GOTOWE PLANY TRENINGOWE"));
    await flush(10, 3);
    assert.equal($$('[data-testid="template-coming-soon"]').length, 8);
    const card = buttonByText("FBW (Full Body Workout)");
    assert.ok(card.disabled);
    await click(card);
    await flush(5, 2);
    assert.ok(!buttonByText("Początkujący"), "no level button");
    assert.equal(localStorage.getItem("nextrep1_guest_active_workout_draft_v1"), null, "no workout started");
  });

  test("Historia → Dodaj zaległy trening → Plan → Gotowe plany: 8 × „Wkrótce”, none expands", async () => {
    await restart();
    await click(buttonByText("Historia"));
    await flush(10, 3);
    await click(document.querySelector('[aria-label="Dodaj zaległy trening"]'));
    await flush(10, 3);
    await click($$("button").find((b) => /Plan/.test(b.textContent) && /Bez planu/.test(b.textContent)));
    await flush(10, 3);
    await click(buttonByText("Gotowe plany"));
    await flush(10, 3);
    assert.equal($$('[data-testid="template-coming-soon"]').length, 8);
    const card = buttonByText("Push Pull Legs");
    assert.ok(card.disabled);
    await click(card);
    await flush(5, 2);
    assert.ok(!buttonByText("Średniozaawansowany"), "no level button");
  });
});
