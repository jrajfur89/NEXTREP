// I5.3 — ATLAS-UX-01 screens on the app as it ships (S1): E01 „Ćwiczenia” → E02 (partia → podpartie)
// → E03 (lista) → E06 (the existing card Compact Tabs v3, by exerciseId); the Back stack one step at a
// time (exercisesOverlayRef / popstate, unchanged in 21-app); D06 — the state is kept on Back from the
// card (also after a workout opened from it, I4.6 D7) and reset on every entry from B2 (Q1: also a tap
// on the active tab). Transitional until I5.4: no search field, no „Filtry”, no sort control.
// The person's own exercises (the old list) stay reachable from E01 when there are any.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $, $$, byTestId, loadApp } from "../harness/ui.mjs";
import { ATLAS_RELEASE, ATLAS_NAVIGATION } from "../../src/engine/index.js";

useS1Profile();
const h = React.createElement;
const K = (n) => `nextrep1_guest_${n}_v1`;
let A;
async function boot(seed = {}) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.atlasBrowseReset();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(K(n), JSON.stringify(v));
  await mount(h(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
}
after(async () => {
  await unmount();
});
const text = (el) => (el ? el.textContent : "");
const tile = (code) => byTestId(`atlas-category-${code}`);
const sub = (code) => byTestId(`atlas-subregion-${code}`);
const rows = () => $$('[data-testid="atlas-row"]');
const back = async () => {
  // hardware / gesture Back: the browser pops one entry, the app's popstate handler steps once
  await act(async () => window.dispatchEvent(new Event("popstate")));
  await flush(5, 2);
};
async function toExercises() {
  await click(byTestId("nav-exercises"));
  await flush(10, 3);
}
const M = () => A.atlasBrowseModel();
const cat = (code) => M().categories.find((c) => c.code === code);

describe("E01 „Ćwiczenia” (board Main / E01-Koniec / E01-Kafel)", () => {
  test("header, „Wszystkie ćwiczenia · 55 · alfabetycznie”, 7 categories in navigation.json order with their counts", async () => {
    await boot();
    await toExercises();
    const home = byTestId("atlas-home");
    assert.ok(home, "E01");
    assert.equal(home.dataset.screen, "exercises-home");
    assert.equal(text($("h1", home)), "Ćwiczenia");
    assert.equal(text(byTestId("atlas-home-total")), "Atlas NEXTREP · 55 ćwiczeń");
    assert.equal(text(byTestId("atlas-all")), "Wszystkie ćwiczenia55 · alfabetycznie");
    // DES-01 / D2: „Twoje” (Ulubione, Moje ćwiczenia) between „Wszystkie ćwiczenia” and „Partie mięśniowe”
    assert.deepEqual($$("h2", home).map(text), ["Twoje", "Partie mięśniowe"]);
    const tiles = $$('[data-tile="category"]', home);
    assert.deepEqual(tiles.map((t) => t.dataset.testid), ATLAS_NAVIGATION.categories.map((c) => `atlas-category-${c.code}`), "navigation.json order");
    // the counts of the board (= engine on release 5), never typed in the code
    const counts = ATLAS_NAVIGATION.categories.map((c) => [c.code, cat(c.code).count]);
    assert.deepEqual(Object.fromEntries(counts), { chest: 42, back: 5, shoulders: 1, arms: 4, core: 2, legs: 4, cardio: 0 });
    assert.equal(text(tile("chest")), "Klatka piersiowa42 ćwiczenia");
    assert.equal(text(tile("back")), "Plecy5 ćwiczeń");
    assert.equal(text(tile("shoulders")), "Barki1 ćwiczenie");
    for (const t of tiles) assert.equal(t.tagName, "BUTTON", "D14: navigation tiles are buttons");
    assert.equal($('[data-layer="photo"]', tile("chest")).children.length, 0, "photo layer present and empty (no NR-01 assets)");
    assert.equal(byTestId("nav-exercises").getAttribute("aria-current"), "page", "B2 unchanged, „Ćwiczenia” active");
  });

  test("Cardio i kondycja (0): disabled tile with its full label, no action", async () => {
    await boot();
    await toExercises();
    const c = tile("cardio");
    assert.equal(c.disabled, true);
    assert.equal(c.getAttribute("aria-label"), "Cardio i kondycja, 0 ćwiczeń, brak w tym wydaniu Atlasu");
    assert.equal(text(c), "Cardio i kondycja0 ćwiczeń · brak w tym wydaniu");
    const push = window.history.pushState;
    let pushes = 0;
    window.history.pushState = () => pushes++;
    try {
      await click(c);
      await flush(3, 1);
    } finally {
      window.history.pushState = push;
    }
    assert.ok(byTestId("atlas-home"), "still E01");
    assert.equal(pushes, 0);
    assert.equal(A.exercisesOverlayRef.current, null, "nothing to step back from on E01");
  });

  test("I5.4: E01 and E03 carry the search field (P1), „Filtry” (P9) and on E03 the sort (P7) of the boards; no old AT2 entry", async () => {
    await boot();
    await toExercises();
    const field = $('[data-testid="atlas-search"] input');
    assert.equal($('[data-testid="atlas-search"] label span').textContent, "Szukaj ćwiczenia");
    assert.equal(field.getAttribute("placeholder"), "Szukaj po nazwie lub aliasie");
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), "Filtry", "D15: N = 0");
    assert.equal(byTestId("atlas-entry"), null, "the AT2 tile „Atlas ćwiczeń” is replaced");
    await click(tile("chest"));
    await flush(5, 2);
    assert.equal($('[data-testid="atlas-search"] label span').textContent, "Szukaj w partii Klatka piersiowa");
    assert.equal($('[data-testid="atlas-search"] input').getAttribute("placeholder"), "Szukaj w tej partii");
    assert.equal(byTestId("atlas-results-sort").getAttribute("aria-label"), "Sortowanie: Nazwa A–Z. Zmień");
    assert.equal(byTestId("atlas-catalog"), null, "the AT2 list is replaced by E03");
  });
});

describe("E02 partia → podpartie (boards E02-Plecy / E02-Nogi)", () => {
  test("Plecy: „5 ćwiczeń · 3 podpartie”, „5 w partii Plecy”, sub-regions 5 / 1 / 0 (the empty one disabled, D03), footnote", async () => {
    await boot();
    await toExercises();
    await click(tile("back"));
    await flush(5, 2);
    const v = byTestId("atlas-category");
    assert.ok(v);
    assert.equal(v.dataset.category, "back");
    assert.equal(text($("h1", v)), "Plecy");
    assert.equal(text(byTestId("atlas-category-summary")), "5 ćwiczeń · 3 podpartie");
    assert.equal(text(byTestId("atlas-all")), "Wszystkie ćwiczenia5 w partii Plecy");
    assert.equal(byTestId("atlas-back").getAttribute("aria-label"), "Wróć do Ćwiczeń");
    const tiles = $$('[data-tile="subregion"]', v);
    assert.deepEqual(tiles.map((t) => text(t)), ["Najszerszy grzbietu5 ćwiczeń", "Środek i góra pleców1 ćwiczenie", "Dolny odcinek pleców0 ćwiczeńBrak w tym wydaniu"]);
    assert.deepEqual(tiles.map((t) => t.disabled), [false, false, true]);
    assert.equal(tiles[2].getAttribute("aria-label"), "Dolny odcinek pleców, 0 ćwiczeń, brak w tym wydaniu Atlasu");
    assert.match(text(v), /Ćwiczenie z kilkoma mięśniami głównymi liczy się w każdej ich podpartii, więc liczby podpartii nie sumują się do liczby partii\./);
  });

  test("Nogi: 6 sub-regions in navigation.json order, the empty ones (also Łydki without muscles) visible and disabled", async () => {
    await boot();
    await toExercises();
    await click(tile("legs"));
    await flush(5, 2);
    const legs = ATLAS_NAVIGATION.categories.find((c) => c.code === "legs");
    assert.equal(text(byTestId("atlas-category-summary")), `4 ćwiczenia · ${legs.subregions.length} podpartii`);
    const tiles = $$('[data-tile="subregion"]');
    assert.deepEqual(tiles.map((t) => t.dataset.testid), legs.subregions.map((s) => `atlas-subregion-${s.code}`));
    assert.deepEqual(cat("legs").subregions.map((s) => s.count), [3, 1, 4, 0, 0, 0]);
    assert.deepEqual(tiles.map((t) => t.disabled), [false, false, false, true, true, true]);
    // core has 2 sub-regions → E02 too; every category with more than one sub-region opens E02
    for (const c of M().categories) assert.equal(A.atlasHasSubregionScreen(c), c.subregions.length > 1, c.code);
  });
});

describe("E03 lista (boards E03-Lista / E03-360 / E03-Koniec)", () => {
  test("Klatka (one sub-region) goes straight to E03: 42 A–Z, equipment line, ≤ 2 chips, end note", async () => {
    await boot();
    await toExercises();
    await click(tile("chest"));
    await flush(5, 2);
    assert.equal(byTestId("atlas-category"), null, "no E02 for one sub-region");
    const list = byTestId("atlas-list");
    assert.equal(list.dataset.scope, "chest|");
    assert.equal(text(byTestId("atlas-list-title")), "Klatka piersiowa");
    assert.equal(byTestId("atlas-back").getAttribute("aria-label"), "Wróć do Ćwiczeń");
    assert.match(text(list), /^Ćwiczenia/, "bar label");
    assert.equal(text(byTestId("atlas-results-count")), "42 ćwiczenia");
    assert.equal(byTestId("atlas-results-count").getAttribute("role"), "status");
    assert.equal(byTestId("atlas-list-items").getAttribute("aria-label"), "Ćwiczenia: Klatka piersiowa");
    const expected = M().browseResults({ categoryCode: "chest" }, "", {}, "az").items;
    assert.equal(rows().length, 42);
    assert.deepEqual(rows().map((r) => r.dataset.exerciseId), expected.map((e) => e.exerciseId));
    const names = expected.map((e) => e.namePl);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "pl")), "Nazwa A–Z");
    const ex = expected.find((e) => e.exerciseId === "dip_chest_weighted");
    const row = $('[data-exercise-id="dip_chest_weighted"]');
    assert.equal(row.tagName, "BUTTON", "D14: the whole row is one button");
    assert.match(text(row), /Talerze\/krążki obciążeniowe · Poręcze do dipów · Pas do podwieszania ciężaru/, "D12: load equipment first");
    assert.equal(ex.namePl.length > 0, true);
    assert.match(text($('[data-exercise-id="pushup_standard"]')), /Bez sprzętu/);
    for (const r of rows()) assert.ok($$("span span span", r).length <= 2, "D04: at most 2 chips");
    assert.equal(text(byTestId("atlas-list-end")), "To wszystkie ćwiczenia: 42.");
  });

  test("Plecy → Najszerszy grzbietu: title, bar „Plecy”, „Wróć do partii Plecy”, rows with chips", async () => {
    await boot();
    await toExercises();
    await click(tile("back"));
    await flush(5, 2);
    await click(sub(cat("back").subregions[0].code));
    await flush(5, 2);
    assert.equal(text(byTestId("atlas-list-title")), "Najszerszy grzbietu");
    assert.equal(byTestId("atlas-back").getAttribute("aria-label"), "Wróć do partii Plecy");
    assert.match(text(byTestId("atlas-list")), /^Plecy/);
    assert.equal(text(byTestId("atlas-results-count")), "5 ćwiczeń");
    assert.equal(rows().length, 5);
    assert.match(text($('[data-exercise-id="row_dumbbell_single_bench_supported"]')), /Hantel · ŁawkaJednostronnie, na stronęPodparcie o ławkę/);
    // the empty sub-region does nothing
    await back();
    await click(sub(cat("back").subregions[2].code));
    await flush(3, 1);
    assert.ok(byTestId("atlas-category"));
  });

  test("„Wszystkie ćwiczenia” (E01) → the whole atlas: 55 A–Z, rows „Partia · sprzęt” (D13)", async () => {
    await boot();
    await toExercises();
    await click(byTestId("atlas-all"));
    await flush(5, 2);
    assert.equal(text(byTestId("atlas-list-title")), "Wszystkie ćwiczenia");
    assert.equal(byTestId("atlas-list").dataset.scope, "|");
    assert.equal(text(byTestId("atlas-results-count")), "55 ćwiczeń");
    assert.deepEqual(rows().map((r) => r.dataset.exerciseId), A.ATLAS_CATALOG.exercises.map((e) => e.exerciseId), "the same 55, A–Z");
    assert.match(text($('[data-exercise-id="row_dumbbell_single_bench_supported"]')), /^Wiosłowanie hantlem jednorącz z podparciem o ławkęPlecy · Hantel · Ławka$/);
    assert.equal(text(byTestId("atlas-list-end")), "To wszystkie ćwiczenia: 55.");
  });

  test("Plecy → „Wszystkie ćwiczenia · 5 w partii Plecy” → E03 of the category, Back → E02", async () => {
    await boot();
    await toExercises();
    await click(tile("back"));
    await flush(5, 2);
    await click(byTestId("atlas-all"));
    await flush(5, 2);
    assert.equal(text(byTestId("atlas-list-title")), "Plecy");
    assert.equal(byTestId("atlas-back").getAttribute("aria-label"), "Wróć do partii Plecy");
    assert.equal(rows().length, 5);
    await back();
    assert.ok(byTestId("atlas-category"));
  });

  test("long names wrap and are never cut (no ellipsis, overflow-wrap: anywhere)", async () => {
    await boot();
    await toExercises();
    await click(byTestId("atlas-all"));
    await flush(5, 2);
    const longest = [...A.ATLAS_CATALOG.exercises].sort((a, b) => b.name.length - a.name.length)[0];
    const row = $(`[data-exercise-id="${longest.exerciseId}"]`);
    const name = $("span span", row);
    assert.equal(name.textContent, longest.name, `full name (${longest.name.length} chars)`);
    assert.equal(name.style.overflowWrap, "anywhere");
    for (const el of $$("*", byTestId("atlas-list"))) {
      if (el.style.position === "absolute" && el.style.width === "1px") continue; // visually hidden labels (P1)
      assert.notEqual(el.style.textOverflow, "ellipsis");
      assert.notEqual(el.style.whiteSpace, "nowrap", el.textContent);
    }
    assert.equal(byTestId("atlas-list-title").style.overflowWrap, "anywhere");
  });
});

describe("E06 card and the Back stack", () => {
  test("E01 → E02 → E03 → E06 → Back ×3: one step at a time, one history entry per step, the card is Compact Tabs v3", async () => {
    await boot();
    await toExercises();
    const push = window.history.pushState.bind(window.history);
    let pushes = 0;
    window.history.pushState = (...a) => {
      pushes++;
      return push(...a);
    };
    try {
      await click(tile("back"));
      await flush(5, 2);
      assert.equal(pushes, 1);
      await click($$('[data-tile="subregion"]')[0]);
      await flush(5, 2);
      assert.equal(pushes, 2);
      const id = rows()[0].dataset.exerciseId;
      await click(rows()[0]);
      await flush(5, 2);
      assert.equal(pushes, 3);
      const card = byTestId("atlas-detail");
      assert.ok(card, "E06 = the existing card");
      assert.equal(text(byTestId("atlas-detail-name")), A.ATLAS_CATALOG.exercises.find((e) => e.exerciseId === id).name);
      assert.deepEqual($$('[role="tab"]').map((t) => t.textContent), ["Ćwiczenie", "Historia", "Warianty"]);
    } finally {
      window.history.pushState = push;
    }
    await back();
    assert.ok(byTestId("atlas-list"), "E06 → E03");
    assert.equal(text(byTestId("atlas-list-title")), cat("back").subregions[0].label);
    await back();
    assert.ok(byTestId("atlas-category"), "E03 → E02");
    await back();
    assert.ok(byTestId("atlas-home"), "E02 → E01");
    assert.equal(A.exercisesOverlayRef.current, null, "no overlay left on E01");
  });

  test("on-screen Back buttons go through history.back() (the same single step)", async () => {
    await boot();
    await toExercises();
    await click(tile("chest"));
    await flush(5, 2);
    const orig = window.history.back;
    let calls = 0;
    window.history.back = () => {
      calls++;
      window.dispatchEvent(new Event("popstate"));
    };
    try {
      await click(rows()[3]);
      await flush(5, 2);
      await click(byTestId("atlas-detail-back"));
      await flush(5, 2);
      assert.ok(byTestId("atlas-list"));
      await click(byTestId("atlas-back"));
      await flush(5, 2);
      assert.ok(byTestId("atlas-home"));
    } finally {
      window.history.back = orig;
    }
    assert.equal(calls, 2);
  });

  test("D06: Back from the card restores the list scroll position; a variant replaces the card, Back → the same list", async () => {
    await boot();
    await toExercises();
    await click(tile("chest"));
    await flush(5, 2);
    const scrolls = [];
    const origTo = window.scrollTo;
    window.scrollTo = (x, y) => scrolls.push(y);
    Object.defineProperty(window, "scrollY", { value: 1234, configurable: true, writable: true });
    try {
      await click($('[data-exercise-id="bench_press_barbell_flat"]'));
      await flush(5, 2);
      assert.equal(scrolls.at(-1), 0, "the card starts at the top");
      assert.equal(A.atlasBrowseMemory.openExerciseId, "bench_press_barbell_flat");
      await click(byTestId("exv-tab-var"));
      await click($$('[data-testid="exv-variant"]')[0]);
      await flush(5, 2);
      assert.ok(byTestId("atlas-detail"));
      assert.notEqual(A.atlasBrowseMemory.openExerciseId, "bench_press_barbell_flat");
      await back();
      assert.ok(byTestId("atlas-list"));
      assert.equal(byTestId("atlas-list").dataset.scope, "chest|", "the same list");
      assert.equal(scrolls.at(-1), 1234, "scroll restored");
    } finally {
      window.scrollTo = origTo;
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
    }
  });

  test("I4.6 D7 still works: a workout opened from the card's history → Back → the card → Back → the same list (D06)", async () => {
    const Y = new Date().getFullYear();
    const hist = [{ id: "w1", date: `${Y}-10-15T10:00:00.000Z`, planId: null, planName: "Push", durationSec: 3000, exercisesCount: 1, totalSets: 1, totalReps: 0, totalWeight: 0, volume: 0, exercises: [{ id: "w1-e", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", name: "x", type: "weight", sets: [{ weight: 80, reps: "8", rir: "", setType: "normal" }] }] }];
    await boot({ history: hist });
    await toExercises();
    await click(tile("chest"));
    await flush(5, 2);
    await click($('[data-exercise-id="bench_press_barbell_flat"]'));
    await flush(5, 2);
    await click(byTestId("exv-tab-hist"));
    await click($$('[data-testid="exv-row"]')[0].querySelector("th button"));
    await flush(10, 3);
    assert.ok(!byTestId("atlas-detail"), "the workout is open in History");
    await back();
    await flush(5, 2);
    assert.ok(byTestId("atlas-detail"), "back on the card");
    assert.equal(byTestId("exv-tab-hist").getAttribute("aria-selected"), "true", "same tab");
    await back();
    assert.equal(byTestId("atlas-list").dataset.scope, "chest|", "and then the same list");
    await back();
    assert.ok(byTestId("atlas-home"));
  });
});

describe("D06 reset (entry from B2, Q1)", () => {
  test("another B2 tab and back → E01; a tap on the active „Ćwiczenia” in E03 / E06 → E01", async () => {
    await boot();
    await toExercises();
    await click(tile("back"));
    await flush(5, 2);
    await click($$('[data-tile="subregion"]')[0]);
    await flush(5, 2);
    assert.ok(byTestId("atlas-list"));
    await click(byTestId("nav-dashboard"));
    await flush(10, 3);
    await toExercises();
    assert.ok(byTestId("atlas-home"), "entry from another tab → E01");
    assert.equal(A.atlasBrowseMemory.level, "home");

    await click(tile("chest"));
    await flush(5, 2);
    await toExercises(); // the active tab again
    assert.ok(byTestId("atlas-home"), "Q1: re-tap → E01");
    await click(tile("chest"));
    await flush(5, 2);
    await click(rows()[0]);
    await flush(5, 2);
    assert.ok(byTestId("atlas-detail"));
    await click(byTestId("nav-exercises")); // the card's own B2
    await flush(10, 3);
    assert.ok(byTestId("atlas-home"), "from the card too");
    assert.deepEqual({ ...A.atlasBrowseMemory }, { ...A.ATLAS_BROWSE_HOME, selection: {} });
  });
});

describe("the person's own exercises and the rest of the app are kept", () => {
  test("own exercises: „Moje ćwiczenia · N” on E01 only when there are any → the old list (search, edit, delete), details, Back", async () => {
    const own = [
      { id: "own-1", name: "Moje wiosłowanie", category: ["Plecy"], equipment: ["Sztanga"] },
      { id: "own-2", name: "Moje wyciskanie", category: ["Klatka"], equipment: ["Hantle"] },
    ];
    await boot({ exercises: own });
    await toExercises();
    // DES-01 / D2: the old list keeps its path, renamed („Moje ćwiczenia” is now the new list of own exercises)
    assert.match(text(byTestId("atlas-own")), /^Ćwiczenia zapisane wcześniej2 ćwiczenia/);
    await click(byTestId("atlas-own"));
    await flush(5, 2);
    assert.equal(byTestId("atlas-home"), null);
    assert.match(document.body.textContent, /MOJE ĆWICZENIA/);
    await type($('input[placeholder="Szukaj ćwiczenia..."]'), "moje");
    await flush(5, 2);
    assert.ok(document.body.textContent.includes("Moje wiosłowanie") && document.body.textContent.includes("Moje wyciskanie"));
    assert.equal(byTestId("atlas-entry"), null, "no AT2 entry in S1");
    // the details of an own exercise and back → the same list (D06 level „own”)
    await click($$("button").find((b) => b.textContent.startsWith("Moje wiosłowanie")));
    await flush(10, 3);
    assert.ok(document.body.textContent.includes("Moje wiosłowanie"));
    await back();
    await flush(5, 2);
    assert.match(document.body.textContent, /MOJE ĆWICZENIA/);
    await back(); // the list → E01
    assert.ok(byTestId("atlas-home"));
    assert.equal(A.exercisesOverlayRef.current, null);
    assert.deepEqual(JSON.parse(localStorage.getItem(K("exercises"))).map((e) => e.id), ["own-1", "own-2"], "untouched");
  });

  test("browsing E01–E06 writes nothing and changes no data", async () => {
    await boot({ exercises: [{ id: "own-1", name: "Moje ćwiczenie", category: ["Klatka"], equipment: ["Sztanga"] }] });
    const before = JSON.stringify({ ...localStorage });
    await toExercises();
    await click(tile("legs"));
    await flush(5, 2);
    await click($$('[data-tile="subregion"]')[2]);
    await flush(5, 2);
    await click(rows()[0]);
    await flush(5, 2);
    await back();
    await back();
    await back();
    assert.equal(JSON.stringify({ ...localStorage }), before);
  });

  test("E07-Blad on E01 when the model cannot be built: verbatim texts, role=alert, „Spróbuj ponownie” rebuilds", async () => {
    A = A || (await loadApp());
    await unmount();
    let retries = 0;
    await mount(h(A.AtlasHomeView, { model: { ok: false }, onRetry: () => retries++, onOpenAll() {}, onOpenCategory() {} }));
    await flush(2, 1);
    const err = byTestId("atlas-error");
    assert.ok(err.closest('[role="alert"]'));
    assert.match(text(err), /Nie udało się wczytać Atlasu ćwiczeńKatalog jest chwilowo niedostępny\. Spróbuj ponownieSpróbuj ponownie/);
    assert.equal(byTestId("atlas-all"), null);
    await click(byTestId("atlas-error-primary"));
    assert.equal(retries, 1);
    assert.ok(A.atlasBrowseModel().ok, "the shipped release builds");
    assert.equal(A.atlasBrowseModel().total, ATLAS_RELEASE.exercises.filter((e) => e.status === "active").length);
  });
});
