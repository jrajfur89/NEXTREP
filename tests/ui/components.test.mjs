// Component-level UI tests in jsdom — new suite written 2026-10-06.
// Real components from index.html rendered with React 18.3.1 (the version the app pins).
// SCOPE NOTE: jsdom is not a browser. Layout, CSS, native date picker, audio and real touch
// behaviour are NOT covered here (the old Chromium suite was lost — see tests/README.md).
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { React, mount, unmount, byTestId, buttonByText, click, type, blur, flush, loadApp, $ } from "../harness/ui.mjs";
import { resetStorage } from "../harness/load-app.mjs";

let A;
const h = React.createElement;
before(async () => {
  A = await loadApp();
});
beforeEach(() => resetStorage());
after(unmount);

describe("DateField (typed dd.mm.rrrr, no future dates)", () => {
  function Harness({ initial, max, onChangeSpy }) {
    const [v, setV] = React.useState(initial);
    return h("div", null, h(A.DateField, { value: v, max, testId: "df", onChange: (x) => { onChangeSpy.push(x); setV(x); } }), h("output", { id: "val" }, v));
  }
  test("shows the value as dd.mm.rrrr with a numeric keyboard", async () => {
    const calls = [];
    await mount(h(Harness, { initial: "2026-09-15", max: "2026-10-06", onChangeSpy: calls }));
    const input = byTestId("df");
    assert.equal(input.value, "15.09.2026");
    assert.equal(input.getAttribute("inputmode"), "numeric");
    assert.ok(byTestId("df-picker"), "calendar button present");
  });
  test("typing digits inserts dots and commits a valid date", async () => {
    const calls = [];
    await mount(h(Harness, { initial: "2026-09-15", max: "2026-10-06", onChangeSpy: calls }));
    const input = byTestId("df");
    await type(input, "0309");
    assert.equal(input.value, "03.09");
    await type(input, "03092026");
    assert.equal(input.value, "03.09.2026");
    assert.deepEqual(calls, ["2026-09-03"]);
    assert.equal($("#val").textContent, "2026-09-03");
  });
  test("a future date (after max) is rejected and marked invalid", async () => {
    const calls = [];
    await mount(h(Harness, { initial: "2026-09-15", max: "2026-10-06", onChangeSpy: calls }));
    const input = byTestId("df");
    await type(input, "07102026");
    assert.deepEqual(calls, []);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    await blur(input);
    assert.equal(input.value, "15.09.2026", "blur restores the last valid value");
  });
  test("an impossible date (31.02) is rejected", async () => {
    const calls = [];
    await mount(h(Harness, { initial: "2026-09-15", max: "2026-10-06", onChangeSpy: calls }));
    await type(byTestId("df"), "31022026");
    assert.deepEqual(calls, []);
  });
});

describe("ExerciseEditorModal — primary/secondary muscle groups (MGW-002)", () => {
  async function openEditor(exercise) {
    const saved = [];
    await mount(h(A.ExerciseEditorModal, { exercise, onSave: (x) => saved.push(x), onClose: () => {} }));
    return saved;
  }
  const saveBtn = () => buttonByText(/Zapisz|Dodaj/);

  test("new own exercise: saving without a primary group shows an error and saves nothing", async () => {
    const saved = await openEditor(null);
    await type(document.querySelector('input[placeholder="np. Przysiad ze sztangą"]'), "Moje ćwiczenie");
    await click(saveBtn());
    assert.ok(byTestId("primary-group-error"));
    assert.equal(saved.length, 0);
  });
  test("primary + secondaries saved into `category` in dictionary order; primary never a secondary", async () => {
    const saved = await openEditor(null);
    await type(document.querySelector('input[placeholder="np. Przysiad ze sztangą"]'), "Wiosłowanie własne");
    await click(byTestId("mg-primary-back"));
    await click(byTestId("mg-secondary-forearms"));
    await click(byTestId("mg-secondary-biceps"));
    // the chosen primary is shown but DISABLED as a secondary; clicking it changes nothing
    assert.equal(byTestId("mg-secondary-back").disabled, true);
    await click(byTestId("mg-secondary-back"));
    assert.equal(byTestId("mg-secondary-back").getAttribute("aria-checked"), "false");
    await click(saveBtn());
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].category, ["Plecy", "Biceps", "Przedramiona"]);
  });
  test("changing the primary removes it from the secondaries", async () => {
    const saved = await openEditor(null);
    await type(document.querySelector('input[placeholder="np. Przysiad ze sztangą"]'), "X");
    await click(byTestId("mg-primary-chest"));
    await click(byTestId("mg-secondary-triceps"));
    await click(byTestId("mg-primary-triceps"));
    await click(saveBtn());
    assert.deepEqual(saved[0].category, ["Triceps"]);
  });
  test("atlas exercise: groups are read-only and its stored category is not rewritten", async () => {
    const bench = A.DEFAULT_EXERCISES.find((e) => e.id === "barbell_row");
    const saved = await openEditor(bench);
    const box = byTestId("atlas-muscle-groups");
    assert.ok(box);
    assert.match(box.textContent, /Plecy/);
    assert.match(box.textContent, /Biceps/);
    assert.ok(!byTestId("mg-primary-back"), "no primary picker for atlas exercises");
    await click(saveBtn());
    assert.deepEqual(saved[0].category, bench.category);
  });
  test("legacy own 'Nogi' exercise: note shown, no primary preselected", async () => {
    await openEditor({ id: "own_legs", name: "Stare nogi", category: ["Nogi"], equipment: ["Sztanga"] });
    assert.ok(byTestId("legacy-groups-note"));
    assert.ok(!document.querySelector('[data-testid^="mg-primary-"][aria-checked="true"]'));
  });
});

describe("LoginScreen offline", () => {
  test("network failure shows the friendly network text, never 'Failed to fetch'", async () => {
    globalThis.__nrSupabase.failNetwork = true;
    await mount(h(A.LoginScreen, { onNavigate: () => {} }));
    await type(document.querySelector('input[type="email"]'), "test@example.com");
    await type(document.querySelector('input[placeholder="••••••••"]'), "secret123");
    await click(buttonByText("Zaloguj się"));
    await flush(0, 3);
    const err = byTestId("login-error");
    assert.ok(err, "login-error rendered");
    assert.equal(err.textContent, A.NETWORK_ERROR_TEXT);
    assert.doesNotMatch(document.body.textContent, /Failed to fetch/);
  });
});

// Post-smoke-test fix: ChartCard's header delta (last − first) is optional.
describe("ChartCard showDelta", () => {
  const props = { title: "Objętość na trening z tą partią", data: [1800, 2160, 240], dates: ["3.10", "6.10", "6.10"], unit: "kg" };
  test("default (showDelta=true): unchanged behaviour — red TrendingDown with −1560kg", async () => {
    const root = await mount(h(A.ChartCard, props));
    assert.ok(root.querySelector('[data-icon="TrendingDown"]'));
    assert.match(root.textContent, /-1560kg/);
  });
  test("default keeps a positive delta green/TrendingUp (other charts unchanged)", async () => {
    const root = await mount(h(A.ChartCard, { ...props, data: [100, 120] }));
    assert.ok(root.querySelector('[data-icon="TrendingUp"]'));
    assert.match(root.textContent, /\+20kg/);
  });
  test("showDelta=false: no delta in the header, values still shown", async () => {
    const root = await mount(h(A.ChartCard, { ...props, showDelta: false }));
    assert.ok(!root.querySelector('[data-icon="TrendingDown"]') && !root.querySelector('[data-icon="TrendingUp"]'));
    assert.doesNotMatch(root.textContent, /-1560|\+360/);
    assert.match(root.textContent, /240kg/, "current (last) value still displayed");
    assert.match(root.textContent, /240kg – 2160kg/, "min–max of the real points still displayed");
  });
});

// Post-smoke-test fix: the Łydki tile uses its own asset; Czworogłowe uda keeps the Nogi asset.
describe("CategoryTiles atlas images", () => {
  test("each muscle-group tile renders the expected asset", async () => {
    const root = await mount(h(A.CategoryTiles, { categories: A.MUSCLE_FILTER_OPTIONS, onSelect: () => {}, countFor: () => 1 }));
    const src = (alt) => {
      const img = root.querySelector(`img[alt="${alt}"]`);
      return img ? img.getAttribute("src") : null;
    };
    assert.equal(src("Łydki"), A.CATEGORY_IMAGES["Łydki"]);
    assert.equal(src("Czworogłowe uda"), A.CATEGORY_IMAGES.Nogi);
    assert.notEqual(src("Łydki"), src("Czworogłowe uda"));
    assert.equal(src("Klatka piersiowa"), A.CATEGORY_IMAGES.Klatka);
    assert.equal(src("Dwugłowe uda / pośladki"), A.CATEGORY_IMAGES["Pośladki"]);
    assert.equal(src("Cardio"), A.CATEGORY_IMAGES.Cardio);
    assert.equal(root.querySelectorAll("img").length, 11, "10 groups + Cardio, each with an image");
  });
});
