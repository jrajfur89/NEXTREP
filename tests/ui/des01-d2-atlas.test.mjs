// DES-01 / D2 — „Twoje” on E01, Ulubione (D02 / D03), Moje ćwiczenia (D04 / D05), the card's heart and
// „Więcej” (D11 / D13), private names (D09), on the app as it ships (S1). Mandatory cases of the D2 brief §6:
// favourites add / remove / undo, archived and own favourites, E01 tiles at 0 and their counts, own exercises
// active / archived, private name add / edit / remove, search by private name, no duplicate exerciseId,
// account switch, import + catalog refresh, Back, filters and scroll kept, accessibility of buttons and sheets.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $, $$, byTestId, loadApp } from "../harness/ui.mjs";
import { UA } from "../harness/account-fixtures.mjs";

useS1Profile();
const h = React.createElement;
const K = (n, ns = "guest") => `nextrep1_${ns}_${n}_v1`;
const NOW = "2026-10-26T10:00:00.000Z";
const BENCH = "bench_press_barbell_flat";
const BENCH_NAME = "Wyciskanie sztangi leżąc na ławce poziomej";
const OWN = { exerciseId: "00000000-0000-4000-8000-000000000001", scope: "private", namePl: "Wyciskanie w garażu", equipment: ["barbell", "bench"], primaryMuscles: ["pectoralis_major"], secondaryMuscles: [], variantAttributes: ["angle.flat"], measurementType: "weight_reps", loadModel: "barbell_total", implements: null, laterality: "bilateral", repsCounting: "total", status: "active", archivedReason: null, entryRev: 1, createdAt: NOW, updatedAt: NOW, archivedAt: null };
const ARCH = { ...OWN, exerciseId: "00000000-0000-4000-8000-000000000002", namePl: "Stare uginanie", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], variantAttributes: [], loadModel: "dumbbell_pair", implements: 2, status: "archived", archivedReason: "Zarchiwizowane przez użytkownika", archivedAt: NOW };
let A;
after(async () => {
  await unmount();
});
const text = (el) => (el ? el.textContent : "");
const raw = (n, ns) => localStorage.getItem(K(n, ns));
const json = (n, ns) => JSON.parse(raw(n, ns));
async function boot(seed = {}) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.atlasBrowseReset();
  A.invalidateUserExerciseCatalog();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(K(n), JSON.stringify(v));
  await mount(h(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
  await click(byTestId("nav-exercises"));
  await flush(10, 3);
}
const back = async () => {
  await act(async () => window.dispatchEvent(new Event("popstate")));
  await flush(5, 2);
};
const key = async (k) => {
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
  await flush(3, 2);
};
const rows = () => $$('[data-testid="atlas-row"]');
const rowIds = () => rows().map((r) => r.dataset.exerciseId);
const tileCount = (id) => text(byTestId(`${id}-count`));
const favIds = () => (raw("favourites") ? json("favourites").map((f) => f.exerciseId) : []);
async function openCardFromAll(id = BENCH) {
  await click(byTestId("atlas-all"));
  await flush(5, 2);
  await click($(`[data-exercise-id="${id}"]`));
  await flush(5, 2);
}

describe("D2.1 E01 „Twoje”", () => {
  test("both tiles at 0: shown, active, „0 ćwiczeń”, between „Wszystkie ćwiczenia” and „Partie mięśniowe”; atlas counts unchanged; no new B2 tab", async () => {
    await boot();
    const home = byTestId("atlas-home");
    assert.deepEqual($$("h2", home).map(text), ["Twoje", "Partie mięśniowe"]);
    const order = [...home.querySelectorAll('[data-testid="atlas-all"], [data-testid="atlas-yours"], [aria-labelledby="atlas-cats-h"]')].map((e) => e.dataset.testid || "cats");
    assert.deepEqual(order, ["atlas-all", "atlas-yours", "cats"]);
    for (const id of ["atlas-tile-favourites", "atlas-tile-mine"]) {
      const t = byTestId(id);
      assert.equal(t.tagName, "BUTTON");
      assert.equal(t.disabled, false, `${id} active at 0`);
      assert.equal(tileCount(id), "0 ćwiczeń");
    }
    assert.equal(byTestId("atlas-tile-favourites").getAttribute("aria-label"), "Ulubione, 0 ćwiczeń");
    assert.equal(byTestId("atlas-tile-mine").getAttribute("aria-label"), "Moje ćwiczenia, 0 ćwiczeń");
    assert.equal(text(byTestId("atlas-home-total")), "Atlas NEXTREP · 55 ćwiczeń");
    assert.equal($$('nav[aria-label="Nawigacja główna"] button').length, 7);
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    assert.ok(byTestId("atlas-favourites-empty"), "D03");
    assert.match(text(byTestId("atlas-favourites-empty")), /Nie masz jeszcze ulubionych ćwiczeń/);
    // „Przeglądaj Atlas” = one step back (history.back → popstate); jsdom delivers popstate asynchronously
    let backs = 0;
    const origBack = window.history.back;
    window.history.back = () => backs++;
    try {
      await click(byTestId("atlas-favourites-empty-primary"));
    } finally {
      window.history.back = origBack;
    }
    assert.equal(backs, 1, "„Przeglądaj Atlas” steps back once");
    await back();
    assert.ok(byTestId("atlas-home"));
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    assert.ok(byTestId("atlas-mine-empty"), "D05");
  });
  test("counts: favourites incl. archived ones (decision 8); own = ACTIVE own exercises only; unknown favourite ids not counted", async () => {
    await boot({ user_exercises: [OWN, ARCH], favourites: [{ exerciseId: BENCH, addedAt: NOW }, { exerciseId: ARCH.exerciseId, addedAt: NOW }, { exerciseId: "00000000-0000-4000-8000-000000000099", addedAt: NOW }] });
    assert.equal(tileCount("atlas-tile-favourites"), "2 ćwiczenia");
    assert.equal(tileCount("atlas-tile-mine"), "1 ćwiczenie");
    assert.equal(text(byTestId("atlas-home-total")), "Atlas NEXTREP · 55 ćwiczeń", "the atlas counter is not changed by own exercises");
  });
});

describe("D2.2 Ulubione + D2.4 heart", () => {
  test("add on the card (aria-pressed, message), list updates without restart; remove with „Cofnij” on the card and on the list (same place and date)", async () => {
    await boot();
    await openCardFromAll(BENCH);
    const heart = byTestId("atlas-detail-heart");
    assert.equal(heart.getAttribute("aria-label"), "Ulubione");
    assert.equal(heart.getAttribute("aria-pressed"), "false");
    await click(heart);
    await flush(3, 2);
    assert.equal(byTestId("atlas-detail-heart").getAttribute("aria-pressed"), "true", "instant");
    assert.equal(text(byTestId("atlas-detail-toast-text")), "Dodano do ulubionych");
    assert.equal(byTestId("atlas-detail-toast").getAttribute("role"), "status");
    assert.deepEqual(favIds(), [BENCH]);
    const addedAt = json("favourites")[0].addedAt;
    await back();
    await back();
    assert.equal(tileCount("atlas-tile-favourites"), "1 ćwiczenie");
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    assert.deepEqual(rowIds(), [BENCH]);
    // remove on the card, undo on the card
    await click(rows()[0]);
    await flush(5, 2);
    await click(byTestId("atlas-detail-heart"));
    await flush(3, 2);
    assert.equal(text(byTestId("atlas-detail-toast-text")), "Usunięto z ulubionych");
    assert.deepEqual(favIds(), []);
    await click(byTestId("atlas-detail-toast-undo"));
    await flush(3, 2);
    assert.deepEqual(json("favourites"), [{ exerciseId: BENCH, addedAt }], "the same entry back");
    assert.equal(byTestId("atlas-detail-heart").getAttribute("aria-pressed"), "true");
    // remove again, go back: the row is gone and the list offers „Cofnij” (D02b)
    await click(byTestId("atlas-detail-heart"));
    await flush(3, 2);
    await back();
    assert.ok(byTestId("atlas-favourites"));
    assert.deepEqual(rowIds(), []);
    assert.equal(text(byTestId("atlas-list-toast-text")), `Usunięto z ulubionych: ${BENCH_NAME}`);
    await click(byTestId("atlas-list-toast-undo"));
    await flush(5, 2);
    assert.deepEqual(rowIds(), [BENCH], "back on the list without a restart");
    assert.deepEqual(json("favourites"), [{ exerciseId: BENCH, addedAt }]);
  });
  test("archived and own exercises in Ulubione: badges, the right card (own → „Własne”), heart works for own exercises", async () => {
    await boot({ user_exercises: [OWN, ARCH], favourites: [{ exerciseId: ARCH.exerciseId, addedAt: NOW }, { exerciseId: BENCH, addedAt: NOW }] });
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    assert.deepEqual(rowIds().sort(), [ARCH.exerciseId, BENCH].sort());
    const arch = $(`[data-exercise-id="${ARCH.exerciseId}"]`);
    assert.deepEqual([...arch.querySelectorAll("[data-badge]")].map((b) => b.dataset.badge), ["own", "archived"]);
    assert.match(text(arch), /WłasneZarchiwizowane/, "badges carry words, not colour only");
    await click(arch);
    await flush(5, 2);
    assert.equal(byTestId("atlas-detail").dataset.source, "private");
    assert.equal(text(byTestId("atlas-detail-name")), "Stare uginanie");
    assert.deepEqual([...byTestId("atlas-detail-badges").querySelectorAll("[data-badge]")].map((b) => b.dataset.badge), ["own", "archived"]);
    assert.ok(byTestId("atlas-detail-archived"), "archived state on the card");
    assert.equal(byTestId("atlas-detail-heart").getAttribute("aria-pressed"), "true");
    await back();
    // an active own exercise: favourite from its card
    await back();
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    await click($(`[data-exercise-id="${OWN.exerciseId}"]`));
    await flush(5, 2);
    assert.equal(byTestId("atlas-detail-heart").getAttribute("aria-pressed"), "false");
    await click(byTestId("atlas-detail-heart"));
    await flush(3, 2);
    assert.ok(favIds().includes(OWN.exerciseId));
    // the tabs of the card are the same three
    assert.deepEqual($$('[role="tab"]').map(text), ["Ćwiczenie", "Historia", "Warianty"]);
  });
  test("search, E04 filters and sort in Ulubione; kept on Back from the card, with the scroll position", async () => {
    const favs = ["bench_press_barbell_flat", "bench_press_dumbbell_pair_flat", "curl_dumbbell_pair_standing", "squat_barbell_back"].map((exerciseId) => ({ exerciseId, addedAt: NOW }));
    await boot({ favourites: favs });
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    assert.equal(rows().length, 4);
    assert.equal(text(byTestId("atlas-results-count")), "4 ćwiczenia");
    await type($('[data-testid="atlas-search"] input'), "wyciskanie");
    await flush(3, 2);
    assert.equal(rows().length, 2);
    await click(byTestId("atlas-filters-button"));
    await flush(3, 2);
    assert.ok($('[role="dialog"][aria-modal="true"]'));
    await click(byTestId("atlas-chip-equipment-dumbbell"));
    await flush(3, 2);
    await key("Escape");
    assert.deepEqual(rowIds(), ["bench_press_dumbbell_pair_flat"]);
    const scrolls = [];
    const origTo = window.scrollTo;
    window.scrollTo = (x, y) => scrolls.push(y);
    Object.defineProperty(window, "scrollY", { value: 321, configurable: true, writable: true });
    try {
      await click(rows()[0]);
      await flush(5, 2);
      assert.ok(byTestId("atlas-detail"));
      await back();
      assert.ok(byTestId("atlas-favourites"));
      assert.equal($('[data-testid="atlas-search"] input').value, "wyciskanie", "query kept");
      assert.deepEqual(rowIds(), ["bench_press_dumbbell_pair_flat"], "filter kept");
      assert.ok(scrolls.includes(321), "scroll position restored");
    } finally {
      window.scrollTo = origTo;
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
    }
    // Back → E01; the list's own filters do not leak into E01
    await back(); // keyboard / field first, if focused
    if (!byTestId("atlas-home")) await back();
    assert.ok(byTestId("atlas-home"));
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), "Filtry");
  });
});

describe("D2.3 Moje ćwiczenia", () => {
  test("active / archived switch (radio), badges, explanation, own-names section; „+ Dodaj ćwiczenie” clearly unavailable and writes nothing", async () => {
    await boot({ user_exercises: [OWN, ARCH], exercise_names: { [BENCH]: { name: "Klata płasko", updatedAt: NOW } } });
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    assert.equal(byTestId("atlas-mine").dataset.view, "active");
    assert.deepEqual(rowIds(), [OWN.exerciseId]);
    assert.deepEqual([...$(`[data-exercise-id="${OWN.exerciseId}"]`).querySelectorAll("[data-badge]")].map((b) => b.dataset.badge), ["own"]);
    const names = byTestId("atlas-mine-names");
    assert.match(text(names), /Twoje nazwy ćwiczeń z Atlasu/);
    assert.match(text(names), /Klata płasko/);
    assert.match(text(names), new RegExp(`W Atlasie: ${BENCH_NAME}`));
    const add = byTestId("atlas-mine-add");
    assert.equal(add.disabled, true);
    assert.match(text(add), /Dodaj ćwiczenie.*Wkrótce/);
    assert.equal(text(byTestId("atlas-mine-add-note")), "Dodawanie własnych ćwiczeń będzie dostępne w kolejnej aktualizacji.");
    assert.equal(add.getAttribute("aria-describedby"), "atlas-mine-add-note");
    const before = JSON.stringify(localStorage);
    await click(add);
    await flush(3, 2);
    assert.equal(JSON.stringify(localStorage), before, "no example record, no form");
    const sw = byTestId("atlas-mine-view");
    assert.equal(sw.getAttribute("role"), "radiogroup");
    assert.equal(byTestId("atlas-mine-view-active").getAttribute("aria-checked"), "true");
    await click(byTestId("atlas-mine-view-archived"));
    await flush(3, 2);
    assert.equal(byTestId("atlas-mine").dataset.view, "archived");
    assert.equal(byTestId("atlas-mine-view-archived").getAttribute("aria-checked"), "true");
    assert.deepEqual(rowIds(), [ARCH.exerciseId]);
    assert.ok(byTestId("atlas-mine-archived-note"));
    assert.equal(byTestId("atlas-mine-names"), null, "names belong to the active view");
    // search inside the own list
    await click(byTestId("atlas-mine-view-active"));
    await flush(3, 2);
    await type($('[data-testid="atlas-search"] input'), "klata");
    await flush(3, 2);
    assert.deepEqual(rowIds(), [], "no own exercise matches");
    assert.match(text(byTestId("atlas-mine-names")), /Klata płasko/, "the names section is filtered by the query too");
  });
  test("the old list of the old model stays reachable from E01 under its own name (Q6)", async () => {
    await boot({ exercises: [{ id: "old-1", name: "Stare ćwiczenie", category: "Klatka", equipment: [], type: "weight" }] });
    assert.match(text(byTestId("atlas-own")), /^Ćwiczenia zapisane wcześniej1 ćwiczenie/);
    assert.equal(tileCount("atlas-tile-mine"), "0 ćwiczeń", "the old list is not mixed into own exercises");
  });
});

describe("D2.5 „Więcej” + D2.6 private names", () => {
  test("system exercise: name add → card, list, E01 search (full name first), atlas name still found; same exerciseId; no duplicate", async () => {
    await boot({ history: [{ id: "s1", date: "2026-10-20T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: BENCH, catalogExerciseId: BENCH, name: BENCH_NAME, sets: [] }] }] });
    const history = raw("history");
    await openCardFromAll(BENCH);
    const more = byTestId("atlas-detail-more");
    assert.equal(more.getAttribute("aria-label"), "Więcej działań");
    assert.equal(more.getAttribute("aria-haspopup"), "dialog");
    await click(more);
    await flush(3, 2);
    const menu = $('[data-testid="atlas-card-menu"] [role="dialog"]');
    assert.equal(menu.getAttribute("aria-modal"), "true");
    assert.ok(menu.contains(document.activeElement), "focus in the sheet");
    assert.equal(byTestId("atlas-detail").getAttribute("inert"), "", "the card behind is inert");
    assert.equal(byTestId("atlas-menu-variant").disabled, true, "variant: D3, unavailable");
    assert.match(text(byTestId("atlas-menu-variant")), /Wkrótce/);
    assert.equal(byTestId("atlas-menu-remove-name"), null, "no name yet");
    await click(byTestId("atlas-menu-rename"));
    await flush(3, 2);
    const input = byTestId("atlas-name-input");
    assert.equal(document.activeElement, input);
    assert.equal(text(byTestId("atlas-name-atlas")), BENCH_NAME);
    // validation: empty, same as the atlas name
    await click(byTestId("atlas-name-save"));
    await flush(3, 2);
    assert.equal(text(byTestId("atlas-name-error")), "Wpisz nazwę albo zamknij bez zmian.");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    await type(input, BENCH_NAME.toUpperCase());
    await click(byTestId("atlas-name-save"));
    await flush(3, 2);
    assert.match(text(byTestId("atlas-name-error")), /To jest nazwa z Atlasu/);
    await type(byTestId("atlas-name-input"), "  Klata płasko  ");
    await click(byTestId("atlas-name-save"));
    await flush(3, 2);
    assert.equal(byTestId("atlas-name-sheet"), null);
    assert.equal(text(byTestId("atlas-detail-name")), "Klata płasko");
    assert.equal(text(byTestId("atlas-detail-atlas-name")), `W Atlasie: ${BENCH_NAME}`);
    assert.equal(text(byTestId("atlas-detail-toast-text")), "Zapisano nazwę: Klata płasko");
    await flush(3, 2);
    assert.equal(document.activeElement, byTestId("atlas-detail-more"), "focus back on „Więcej” after saving");
    assert.deepEqual(Object.keys(json("exercise_names")), [BENCH], "keyed by the same exerciseId");
    assert.equal(raw("history"), history, "history and its names untouched");
    assert.equal(raw("user_exercises"), null, "no own copy");
    // E03 list shows the name with its badge; E01 search finds it by both names
    await back();
    const row = $(`[data-exercise-id="${BENCH}"]`);
    assert.match(text(row), /^Klata płasko/);
    assert.deepEqual([...row.querySelectorAll("[data-badge]")].map((b) => b.dataset.badge), ["name"]);
    const ids = rowIds();
    assert.equal(new Set(ids).size, ids.length, "no duplicate exerciseId in the list");
    assert.equal(ids.length, 55);
    await back();
    await type($('[data-testid="atlas-search"] input'), "Klata płasko");
    await flush(3, 2);
    assert.equal(rowIds()[0], BENCH, "the full private name ranks first");
    await type($('[data-testid="atlas-search"] input'), BENCH_NAME);
    await flush(3, 2);
    assert.ok(rowIds().includes(BENCH), "the atlas name still finds it");
    assert.match(text($(`[data-exercise-id="${BENCH}"]`)), new RegExp(`Też jako: ${BENCH_NAME}`));
  });
  test("edit and remove the name (back to the atlas name, „Cofnij” restores it)", async () => {
    await boot({ exercise_names: { [BENCH]: { name: "Klata płasko", updatedAt: NOW } } });
    await openCardFromAll(BENCH);
    assert.equal(text(byTestId("atlas-detail-name")), "Klata płasko");
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    assert.equal(text(byTestId("atlas-menu-rename")).startsWith("Zmień własną nazwę"), true);
    await click(byTestId("atlas-menu-rename"));
    await flush(3, 2);
    assert.equal(byTestId("atlas-name-input").value, "Klata płasko");
    await type(byTestId("atlas-name-input"), "Klata na płasko");
    await click(byTestId("atlas-name-save"));
    await flush(3, 2);
    assert.equal(json("exercise_names")[BENCH].name, "Klata na płasko");
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    await click(byTestId("atlas-menu-remove-name"));
    await flush(3, 2);
    assert.equal(text(byTestId("atlas-detail-name")), BENCH_NAME);
    assert.equal(byTestId("atlas-detail-atlas-name"), null);
    assert.deepEqual(json("exercise_names"), {});
    assert.equal(text(byTestId("atlas-detail-toast-text")), "Przywrócono nazwę z Atlasu");
    await click(byTestId("atlas-detail-toast-undo"));
    await flush(3, 2);
    assert.equal(text(byTestId("atlas-detail-name")), "Klata na płasko");
  });
  test("own exercise menu: edit / archive / restore shown as unavailable (later stages), nothing active that does nothing", async () => {
    await boot({ user_exercises: [OWN, ARCH] });
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    await click($(`[data-exercise-id="${OWN.exerciseId}"]`));
    await flush(5, 2);
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    const actions = $$('[data-testid="atlas-card-menu"] [role="dialog"] button').filter((b) => b.dataset.testid && b.dataset.testid.startsWith("atlas-menu-"));
    assert.deepEqual(actions.map((b) => b.dataset.testid), ["atlas-menu-edit", "atlas-menu-archive"]);
    for (const b of actions) {
      assert.equal(b.disabled, true, b.dataset.testid);
      assert.match(text(b), /Wkrótce/);
    }
    await key("Escape");
    assert.equal(byTestId("atlas-card-menu"), null);
  });
});

describe("D2.8 Back, sheets and keyboard", () => {
  test("Back with a sheet open closes the sheet only (card stays); focus returns to „Więcej”; Back from the card → the list; from the list → E01", async () => {
    await boot({ favourites: [{ exerciseId: BENCH, addedAt: NOW }] });
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    await click(rows()[0]);
    await flush(5, 2);
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    await back();
    assert.equal(byTestId("atlas-card-menu"), null, "Back closed the menu");
    assert.ok(byTestId("atlas-detail"), "the card stays");
    await flush(3, 2);
    assert.equal(document.activeElement, byTestId("atlas-detail-more"), "focus back on „Więcej”");
    assert.equal(byTestId("atlas-detail").getAttribute("inert"), null);
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    await click(byTestId("atlas-menu-rename"));
    await flush(3, 2);
    await back();
    assert.equal(byTestId("atlas-name-sheet"), null, "Back closed the name sheet");
    assert.ok(byTestId("atlas-detail"));
    await back();
    assert.ok(byTestId("atlas-favourites"), "card → Ulubione");
    await back();
    assert.ok(byTestId("atlas-home"), "Ulubione → E01");
    assert.ok($('nav[aria-label="Nawigacja główna"]'), "B2 on the lists and E01");
  });
});

describe("D2.7 catalog refresh: account switch and import", () => {
  test("account switch: E01 shows the other account's counts and names, never the previous ones", async () => {
    await boot({ favourites: [{ exerciseId: BENCH, addedAt: NOW }], exercise_names: { [BENCH]: { name: "Klata gościa", updatedAt: NOW } } });
    assert.equal(tileCount("atlas-tile-favourites"), "1 ćwiczenie");
    await act(async () => A.activateDataNamespace(UA));
    await click(byTestId("nav-exercises"));
    await flush(5, 2);
    assert.equal(tileCount("atlas-tile-favourites"), "0 ćwiczeń");
    await click(byTestId("atlas-all"));
    await flush(5, 2);
    assert.match(text($(`[data-exercise-id="${BENCH}"]`)), new RegExp(`^${BENCH_NAME}`), "A sees the atlas name");
    assert.equal(A.getUserExerciseCatalog().customNameOf(BENCH), null);
    await act(async () => A.activateDataNamespace(null));
    await click(byTestId("nav-exercises"));
    await flush(5, 2);
    assert.equal(tileCount("atlas-tile-favourites"), "1 ćwiczenie");
    await click(byTestId("atlas-all"));
    await flush(5, 2);
    assert.match(text($(`[data-exercise-id="${BENCH}"]`)), /^Klata gościa/);
  });
  test("an imported copy refreshes the catalog at once (names, favourites, own exercises)", async () => {
    await boot();
    const r = A.applyImportedAppData({ userExercises: [OWN], favourites: [{ exerciseId: OWN.exerciseId, addedAt: NOW }], exerciseNames: { [BENCH]: { name: "Z kopii", updatedAt: NOW } } });
    assert.equal(r.ok, true, JSON.stringify(r));
    await click(byTestId("nav-exercises"));
    await flush(5, 2);
    assert.equal(tileCount("atlas-tile-favourites"), "1 ćwiczenie");
    assert.equal(tileCount("atlas-tile-mine"), "1 ćwiczenie");
    await type($('[data-testid="atlas-search"] input'), "Z kopii");
    await flush(3, 2);
    assert.equal(rowIds()[0], BENCH);
  });
  test("the catalog is cached: the same object while nothing changes, a new one after a write or a namespace switch", async () => {
    await boot();
    const c1 = A.getUserExerciseCatalog();
    assert.equal(A.getUserExerciseCatalog(), c1);
    A.setCustomExerciseNameFor(BENCH, "X1");
    const c2 = A.getUserExerciseCatalog();
    assert.notEqual(c2, c1);
    assert.equal(c2.customNameOf(BENCH), "X1");
    A.activateDataNamespace(UA);
    assert.equal(A.getUserExerciseCatalog().customNameOf(BENCH), null);
    A.activateDataNamespace(null);
    assert.equal(A.getUserExerciseCatalog().customNameOf(BENCH), "X1");
    localStorage.setItem(K("exercise_names"), JSON.stringify({})); // a write from outside the layer (e.g. a restore)
    assert.equal(A.getUserExerciseCatalog().customNameOf(BENCH), null);
  });
});
