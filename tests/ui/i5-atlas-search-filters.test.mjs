// I5.4 — ATLAS-UX-01 E04 (filters), E05 (search) and E07 (states) on the app as it ships (S1):
// search at every character over namePl + aliasesPl (the existing engine), „Też jako”, the D08
// suggestion, the keyboard rules of E05 (Enter, „Wyczyść”, „Anuluj”, Back hides the keyboard first —
// also with an Android visual viewport), the sheet (OR inside a dimension, AND between them, live
// counts, 0 disabled, „Pokaż N”, „Wyczyść”, Escape / Back / ✕, focus, inert background), the active
// filters P3, the messages E07, and D06 with search, filters and sort.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $, $$, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
const h = React.createElement;
let A;
async function boot() {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.atlasBrowseReset();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  await mount(h(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
  await click(byTestId("nav-exercises"));
  await flush(10, 3);
}
after(async () => {
  await unmount();
});
const M = () => A.atlasBrowseModel();
const text = (el) => (el ? el.textContent.replace(/\u00a0/g, " ") : ""); // „Pokaż N ćwiczeń” is bound by no-break spaces
const input = () => $('[data-testid="atlas-search"] input');
const rows = () => $$('[data-testid="atlas-row"]');
const ids = () => rows().map((r) => r.dataset.exerciseId);
const status = () => text(byTestId("atlas-results-count"));
const focus = async (el) => {
  await act(async () => el.focus());
  await flush(3, 1);
};
const blur = async (el) => {
  await act(async () => el.blur());
  await flush(3, 1);
};
const key = async (el, k, opts = {}) => {
  await act(async () => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts })));
  await flush(3, 1);
};
const back = async () => {
  await act(async () => window.dispatchEvent(new Event("popstate")));
  await flush(5, 2);
};
const write = async (q) => {
  await type(input(), q);
  await flush(3, 1);
};
const openChest = async () => {
  await click(byTestId("atlas-category-chest"));
  await flush(5, 2);
};
const openSheet = async () => {
  await click(byTestId("atlas-filters-button"));
  await flush(5, 2);
};
const chip = (dim, code) => byTestId(`atlas-chip-${dim}-${code}`);
// history entries pushed by the module (each popstate in these tests stands for one popped entry)
function countPushes() {
  const orig = window.history.pushState;
  const c = { n: 0, restore: () => (window.history.pushState = orig) };
  window.history.pushState = function (...a) {
    c.n++;
    return orig.apply(this, a);
  };
  return c;
}

describe("E05 search on E01 (boards E05-Szukaj / E05-Alias)", () => {
  test("focus → E05 with „Anuluj”; results at every character, ranking of the engine, „N wyników w całym Atlasie”, rows „Partia · sprzęt”", async () => {
    await boot();
    await focus(input());
    assert.ok(byTestId("atlas-search-screen"), "E05");
    assert.equal(byTestId("atlas-home"), null, "the E01 content gives way to the search");
    assert.ok(byTestId("atlas-search-cancel"), "„Anuluj” while the field has the focus");
    assert.equal(byTestId("atlas-filters-button"), null);
    await write("wyciskanie");
    const n1 = M().browseResults({}, "wyciskanie", {}, "best").total;
    assert.equal(status(), `${n1} ${A.plPlural(n1, "result")} w całym Atlasie`);
    await write("wyciskanie hantli");
    assert.equal(status(), "7 wyników w całym Atlasie", "board E05-Szukaj");
    assert.equal(byTestId("atlas-results-count").getAttribute("role"), "status");
    assert.deepEqual(ids(), M().browseResults({}, "wyciskanie hantli", {}, "best").items.map((e) => e.exerciseId), "„Najlepsze dopasowanie” = engine order");
    assert.deepEqual(ids().slice(0, 4), ["bench_press_dumbbell_neutral", "bench_press_dumbbell_pair_flat", "floor_press_dumbbell_pair", "bench_press_dumbbell_pair_incline"]);
    assert.equal(byTestId("atlas-results-sort").getAttribute("aria-label"), "Sortowanie: Najlepsze dopasowanie. Zmień");
    assert.equal(byTestId("atlas-list-items").getAttribute("aria-label"), "Wyniki wyszukiwania");
    assert.match(text(rows()[0]), /^Wyciskanie hantli chwytem neutralnym na ławce poziomejKlatka piersiowa · Hantel · Ławka$/);
    // sort toggle → A–Z (same 7)
    await click(byTestId("atlas-results-sort"));
    await flush(3, 1);
    const names = rows().map((r) => $("span span", r).textContent);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "pl")));
    assert.equal(byTestId("atlas-results-sort").getAttribute("aria-label"), "Sortowanie: Nazwa A–Z. Zmień");
  });

  test("case and Polish characters do not matter; a part of a word is found („skośn”)", async () => {
    await boot();
    await focus(input());
    await write("WYCISKANIE HANTLI");
    assert.equal(status(), "7 wyników w całym Atlasie");
    await write("wyciskanie hantli lezac");
    assert.equal(rows().length, M().browseResults({}, "wyciskanie hantli leżąc").total);
    assert.ok(rows().length > 0);
    await write("skośn");
    assert.equal(rows().length, M().browseResults({}, "skośn").total);
    assert.ok(rows().length >= 2);
  });

  test("alias: „bench” → 2 wyniki, „Też jako: …” under the name, the note of the board", async () => {
    await boot();
    await focus(input());
    await write("bench");
    await key(input(), "Enter");
    assert.equal(status(), "2 wyniki w całym Atlasie");
    assert.deepEqual(ids(), ["bench_press_barbell_flat", "bench_press_dumbbell_pair_flat"]);
    assert.match(text(rows()[0]), /Też jako: Bench press$/);
    assert.match(text(rows()[1]), /Też jako: Dumbbell bench press$/);
    assert.equal(text(byTestId("atlas-alias-note")), "Szukamy w polskich nazwach i aliasach z Atlasu. Gdy pasuje tylko alias, widać go pod nazwą.");
    // a name hit has no alias line
    await focus(input());
    await write("wyciskanie sztangi");
    assert.equal(byTestId("atlas-alias-note"), null);
    assert.ok(!/Też jako/.test(text(byTestId("atlas-list-items"))));
  });

  test("keyboard: Enter hides it and keeps the results (P9 instead of „Anuluj”); „Wyczyść” keeps the focus; „Anuluj” → E01 as before", async () => {
    await boot();
    await focus(input());
    await write("bench");
    await key(input(), "Enter");
    assert.notEqual(document.activeElement, input(), "Enter → blur");
    assert.equal(status(), "2 wyniki w całym Atlasie", "results stay");
    assert.equal(byTestId("atlas-search-cancel"), null);
    assert.ok(byTestId("atlas-filters-button"), "board E05-Alias: „Filtry” next to the field");
    await focus(input());
    const clear = byTestId("atlas-search-clear");
    assert.equal(clear.getAttribute("aria-label"), "Wyczyść wyszukiwanie");
    await act(async () => clear.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));
    await click(clear);
    await flush(3, 1);
    assert.equal(input().value, "");
    assert.equal(document.activeElement, input(), "the field (and the keyboard) stay");
    await write("bench");
    await click(byTestId("atlas-search-cancel"));
    await flush(3, 1);
    assert.ok(byTestId("atlas-home"), "back on E01");
    assert.equal(input().value, "");
    assert.equal(A.atlasBrowseMemory.query, "");
    assert.equal(A.exercisesOverlayRef.current, null);
  });

  test("Back in E05: first hides the keyboard, then ends the search; the module stays (each popped entry is put back)", async () => {
    await boot();
    const pushes = countPushes();
    try {
      await focus(input());
      await write("bench");
      await back(); // keyboard open (no visualViewport in jsdom = a focused field counts as open)
      assert.notEqual(document.activeElement, input());
      assert.equal(status(), "2 wyniki w całym Atlasie", "still E05");
      await back();
      assert.ok(byTestId("atlas-home"), "E01");
      assert.equal(input().value, "");
      assert.equal(pushes.n, 2, "both Back steps put their entry back");
      assert.equal(A.exercisesOverlayRef.current, null, "the next Back leaves the module as before");
    } finally {
      pushes.restore();
    }
  });

  test("Android keyboard: visualViewport decides — open (smaller than the window) → Back hides it; already hidden by the system → Back ends the search", async () => {
    await boot();
    const vv = { height: window.innerHeight - 300, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true, writable: true });
    try {
      await focus(input());
      await write("bench");
      await back();
      assert.notEqual(document.activeElement, input(), "open keyboard → hidden");
      assert.ok(byTestId("atlas-search-screen"));
      await focus(input());
      vv.height = window.innerHeight; // Android closed the keyboard itself, the field kept the focus
      await back();
      assert.ok(byTestId("atlas-home"), "→ the search ends at once");
    } finally {
      Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true, writable: true });
    }
  });

  test("E05 → card → Back: the same query and results, the keyboard stays closed (no autofocus)", async () => {
    await boot();
    await focus(input());
    await write("bench");
    await click(rows()[1]);
    await flush(5, 2);
    assert.equal(text(byTestId("atlas-detail-name")), "Wyciskanie hantli leżąc na ławce poziomej");
    await back();
    assert.ok(byTestId("atlas-search-screen"));
    assert.equal(input().value, "bench");
    assert.equal(status(), "2 wyniki w całym Atlasie");
    assert.notEqual(document.activeElement, input());
  });
});

describe("E07 states (boards E07-BrakWynikow / E07-FiltryZero / E07-Blad)", () => {
  test("no results: the phrase, the text, the D08 suggestion with its real count, „Wyczyść wyszukiwanie”", async () => {
    await boot();
    await focus(input());
    await write("przysiad bułgarski");
    await key(input(), "Enter");
    assert.equal(status(), "0 wyników w całym Atlasie", "announced by the status");
    const m = byTestId("atlas-no-results");
    assert.match(text(m), /^Nie znaleźliśmy „przysiad bułgarski”Sprawdź pisownię albo wpisz mniej słów\. Szukamy w polskich nazwach i aliasach ćwiczeń z Atlasu\./);
    assert.equal(text(byTestId("atlas-no-results-primary")), "Szukaj „przysiad” · 2 wyniki");
    assert.equal(text(byTestId("atlas-no-results-link")), "Wyczyść wyszukiwanie");
    assert.equal(byTestId("atlas-results-sort"), null);
    await click(byTestId("atlas-no-results-primary"));
    await flush(3, 1);
    assert.equal(input().value, "przysiad");
    assert.equal(status(), "2 wyniki w całym Atlasie");
    await write("zzzz");
    assert.equal(byTestId("atlas-no-results-primary"), null, "one word → no suggestion");
    await write("przysiad zzzz qqqq");
    assert.equal(M().searchSuggestion({}, "przysiad zzzz qqqq"), null);
    assert.equal(byTestId("atlas-no-results-primary"), null, "the shorter phrase has 0 → no suggestion (D08)");
    await click(byTestId("atlas-no-results-link"));
    await flush(3, 1);
    assert.equal(input().value, "");
  });

  test("filters without results: „0 z 42 ćwiczeń”, the text of the board, „Usuń filtry · 3 wyniki”, „Wyczyść wyszukiwanie”", async () => {
    await boot();
    await openChest();
    await openSheet();
    await click(chip("equipment", "dumbbell"));
    await click(byTestId("atlas-filter-show"));
    await flush(3, 1);
    await write("smith");
    assert.equal(status(), "0 z 42 ćwiczeń");
    const m = byTestId("atlas-filters-zero");
    assert.match(text(m), /^Brak ćwiczeń dla tych filtrów„smith” w partii Klatka piersiowa z filtrem Hantel nie daje wyników\./);
    assert.equal(text(byTestId("atlas-filters-zero-primary")), "Usuń filtry · 3 wyniki");
    assert.equal(text(byTestId("atlas-filters-zero-link")), "Wyczyść wyszukiwanie");
    assert.equal(byTestId("atlas-clear-filters"), null, "board E07-FiltryZero: only the chip in the group");
    assert.ok(byTestId("atlas-active-equipment-dumbbell"));
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), "Filtry, aktywne: 1");
    await click(byTestId("atlas-filters-zero-primary"));
    await flush(3, 1);
    assert.equal(status(), "3 z 42 ćwiczeń");
    assert.equal(byTestId("atlas-active-filters"), null);
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), "Filtry");
  });

  test("error: E07-Blad on E01 (verbatim, role=alert) — covered with a broken model; empty categories stay disabled tiles", async () => {
    await boot();
    assert.equal(byTestId("atlas-category-cardio").disabled, true);
    await unmount();
    await mount(h(A.AtlasHomeView, { model: { ok: false }, onRetry() {}, onOpenAll() {}, onOpenCategory() {} }));
    await flush(2, 1);
    assert.ok(byTestId("atlas-error").closest('[role="alert"]'));
    assert.equal(text(byTestId("atlas-error-primary")), "Spróbuj ponownie");
    assert.equal($$('[role="search"]').length, 0, "no search without a catalog");
  });
});

describe("E04 filters (boards E04-Filtry / E03-Filtry)", () => {
  test("the sheet: dialog, scope line, dimensions in the board order, equipment 7 + „Pokaż wszystkie (16)”, counts, 0 disabled, live „Pokaż N”", async () => {
    await boot();
    await openChest();
    await openSheet();
    const dlg = $('[role="dialog"]');
    assert.equal(dlg.getAttribute("aria-modal"), "true");
    assert.equal(document.getElementById(dlg.getAttribute("aria-labelledby")).textContent, "Filtry");
    assert.equal(text(byTestId("atlas-filter-scope")), "Partia: Klatka piersiowa");
    assert.deepEqual($$("section[data-dimension]", dlg).map((s) => s.dataset.dimension), ["equipment", "loadModel", "angle", "grip", "position", "laterality"]);
    assert.deepEqual($$("section[data-dimension] h3", dlg).slice(0, 3).map((x) => x.textContent), ["Sprzęt", "Rodzaj obciążenia", "Kąt ławki"]);
    const eq = () => $$('section[data-dimension="equipment"] [aria-pressed]', dlg);
    assert.equal(eq().length, 7);
    assert.deepEqual(eq().slice(0, 6).map((b) => b.textContent), ["Ławka18", "Hantel12", "Wyciąg treningowy5", "Mata4", "Sztanga4", "Guma oporowa3"], "D11: count desc, ties A–Z");
    assert.equal(text(byTestId("atlas-filter-more")), "Pokaż wszystkie (16)");
    assert.equal(text(byTestId("atlas-filter-show")), "Pokaż 42 ćwiczenia");
    await click(chip("equipment", "dumbbell"));
    assert.equal(chip("equipment", "dumbbell").getAttribute("aria-pressed"), "true");
    assert.equal(text(byTestId("atlas-filter-show")), "Pokaż 12 ćwiczeń", "board E04: live");
    // counts without the dimension's own choice (equipment stays 18 / 12 / …), others narrowed
    assert.equal(text(chip("equipment", "bench")), "Ławka18");
    assert.equal(text(chip("loadModel", "dumbbell_pair")), "Dwa hantle11");
    const kettle = chip("loadModel", "kettlebell_single");
    assert.equal(kettle.disabled, true, "0 → disabled (dashed)");
    assert.equal(kettle.style.border, "1px dashed rgb(42, 42, 42)");
    assert.deepEqual(["flat", "incline", "decline"].map((c) => text(chip("angle", `angle.${c}`))), ["Ławka pozioma6", "Ławka skośna dodatnia2", "Ławka skośna ujemna2"], "board E04");
    await click(byTestId("atlas-filter-more"));
    assert.equal(eq().length, 16);
    // D16: the default chip — background and border #222224 (board E04)
    const plain = chip("equipment", "bench");
    assert.equal(plain.style.background, "rgb(34, 34, 36)");
    assert.equal(plain.style.border, "1px solid rgb(34, 34, 36)");
  });

  test("OR inside a dimension, AND between dimensions — counts = the engine", async () => {
    await boot();
    await openChest();
    await openSheet();
    const sc = { categoryCode: "chest" };
    const n = (sel) => M().browseResults(sc, "", sel).total;
    await click(chip("equipment", "dumbbell"));
    await click(chip("equipment", "barbell"));
    const or = { equipment: ["dumbbell", "barbell"] };
    assert.equal(text(byTestId("atlas-filter-show")), `Pokaż ${n(or)} ${A.plPlural(n(or), "exercise")}`);
    assert.ok(n(or) >= 12 && n(or) <= 16, "OR: at least the larger of the two");
    const angleChip = $$('section[data-dimension="angle"] [aria-pressed]').find((b) => /^Ławka pozioma/.test(b.textContent));
    await click(angleChip);
    const and = M().sheetFacets(sc, "", or).find((d) => d.dimension === "angle").options.find((o) => /^Ławka pozioma/.test(o.label));
    const sel = { ...or, angle: [and.code] };
    assert.equal(text(byTestId("atlas-filter-show")), `Pokaż ${n(sel)} ${A.plPlural(n(sel), "exercise")}`);
    assert.ok(n(sel) < n(or), "AND narrows");
    await click(byTestId("atlas-filter-show"));
    await flush(3, 1);
    assert.equal(status(), `${n(sel)} z 42 ${A.ATLAS_PLURALS.exercise[2]}`);
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), "Filtry, aktywne: 3", "D15");
    assert.equal(text(byTestId("atlas-filters-button-badge")), "3");
    assert.equal($$('[data-testid^="atlas-active-"][aria-label^="Usuń filtr"]').length, 3);
    assert.ok($('[aria-label="Usuń filtr Sprzęt: Hantel"]'));
    assert.match(byTestId("atlas-list-items").getAttribute("aria-label"), /^Ćwiczenia: Klatka piersiowa, filtry Hantel, Sztanga, Ławka pozioma$/);
    await click($('[aria-label="Usuń filtr Kąt ławki: Ławka pozioma"]'));
    await flush(3, 1);
    assert.equal(status(), `${n(or)} z 42 ${A.ATLAS_PLURALS.exercise[2]}`);
    await click(byTestId("atlas-clear-filters"));
    await flush(3, 1);
    assert.equal(status(), "42 ćwiczenia");
  });

  test("„Wyczyść” resets every dimension; closing without „Pokaż” keeps the choice; N = 0 → disabled „Brak wyników”", async () => {
    await boot();
    await openChest();
    await openSheet();
    await click(chip("equipment", "dumbbell"));
    await click(byTestId("atlas-filter-clear"));
    assert.equal(text(byTestId("atlas-filter-show")), "Pokaż 42 ćwiczenia");
    assert.equal($$('[aria-pressed="true"]').length, 0);
    await click(chip("equipment", "dumbbell"));
    await click(byTestId("atlas-filter-close"));
    await flush(3, 1);
    assert.equal(byTestId("atlas-filter-sheet"), null);
    assert.equal(status(), "12 z 42 ćwiczeń", "the choice works at once");
    await write("smith");
    await openSheet();
    const show = byTestId("atlas-filter-show");
    assert.equal(show.disabled, true);
    assert.equal(text(show), "Brak wyników");
  });

  test("a11y and closing: focus in the sheet, Tab stays inside, inert background, Escape / scrim / Back close it, focus back on „Filtry”", async () => {
    await boot();
    await openChest();
    const p9 = byTestId("atlas-filters-button");
    assert.equal(p9.getAttribute("aria-haspopup"), "dialog");
    await openSheet();
    const dlg = $('[role="dialog"]');
    assert.equal(document.activeElement, byTestId("atlas-filter-close"), "focus moves into the sheet");
    const bg = byTestId("atlas-list").parentElement;
    assert.equal(bg.hasAttribute("inert"), true);
    assert.equal(bg.getAttribute("aria-hidden"), "true");
    const focusable = $$("button", dlg).filter((b) => !b.disabled);
    await act(async () => focusable.at(-1).focus());
    await key(document.activeElement, "Tab");
    assert.equal(document.activeElement, focusable[0], "Tab wraps inside the dialog");
    await key(document.activeElement, "Escape");
    await flush(3, 1);
    assert.equal(byTestId("atlas-filter-sheet"), null, "Escape closes");
    assert.equal(bg.hasAttribute("inert"), false);
    assert.equal(document.activeElement, byTestId("atlas-filters-button"), "focus back on P9");
    await openSheet();
    await click(byTestId("atlas-filter-scrim"));
    await flush(3, 1);
    assert.equal(byTestId("atlas-filter-sheet"), null, "scrim closes");
    const pushes = countPushes();
    try {
      await openSheet();
      assert.equal(pushes.n, 0, "the sheet pushes no entry");
      await back();
      assert.equal(byTestId("atlas-filter-sheet"), null, "Back closes the sheet");
      assert.ok(byTestId("atlas-list"), "and stays on E03");
      assert.equal(pushes.n, 1, "the popped entry is put back");
    } finally {
      pushes.restore();
    }
  });

  test("from E01: „Filtry” → choice → the whole-atlas list with it („Cały Atlas”); Back → E01 with the badge (D06), the choice kept in a category it fits", async () => {
    await boot();
    await openSheet();
    assert.equal(text(byTestId("atlas-filter-scope")), "Cały Atlas");
    await click(chip("equipment", "dumbbell"));
    const n = M().browseResults({}, "", { equipment: ["dumbbell"] }).total;
    await click(byTestId("atlas-filter-show"));
    await flush(5, 2);
    assert.equal(text(byTestId("atlas-list-title")), "Wszystkie ćwiczenia");
    assert.equal(status(), `${n} z 55 ${A.ATLAS_PLURALS.exercise[2]}`);
    await back();
    assert.ok(byTestId("atlas-home"));
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), "Filtry, aktywne: 1");
    await openChest();
    assert.equal(status(), "12 z 42 ćwiczeń", "the filter applies in Klatka too");
    await back();
    await click(byTestId("atlas-category-back"));
    await flush(5, 2);
    await click($$('[data-tile="subregion"]')[0]);
    await flush(5, 2);
    const kept = M().scopeIndex({ categoryCode: "back", subregionCode: A.atlasBrowseMemory.subregionCode }).facets({}).equipment.some((o) => o.code === "dumbbell");
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), kept ? "Filtry, aktywne: 1" : "Filtry", "a value absent from the scope is dropped (no invisible filter)");
  });
});

describe("D06 with search, filters and sort", () => {
  test("E03 query + filter + sort → card → Back: all restored, keyboard closed; E03 → E02 → E03: filters and sort stay, the query does not", async () => {
    await boot();
    await click(byTestId("atlas-category-back"));
    await flush(5, 2);
    await click(byTestId("atlas-all"));
    await flush(5, 2);
    await openSheet();
    const optLabel = "Hantel";
    await click(chip("equipment", "dumbbell"));
    await click(byTestId("atlas-filter-show"));
    await flush(3, 1);
    await focus(input());
    await write("wios");
    await click(byTestId("atlas-results-sort"));
    await flush(3, 1);
    const sortLabel = byTestId("atlas-results-sort").getAttribute("aria-label");
    const before = ids();
    assert.ok(before.length > 0);
    await click(rows()[0]);
    await flush(5, 2);
    assert.ok(byTestId("atlas-detail"));
    await back();
    assert.equal(input().value, "wios");
    assert.deepEqual(ids(), before);
    assert.equal(byTestId("atlas-results-sort").getAttribute("aria-label"), sortLabel);
    assert.ok($(`[aria-label="Usuń filtr Sprzęt: ${optLabel}"]`));
    assert.notEqual(document.activeElement, input(), "no autofocus on return");
    await back(); // E03 → E02
    assert.ok(byTestId("atlas-category"));
    await click(byTestId("atlas-all"));
    await flush(5, 2);
    assert.equal(input().value, "", "the query belonged to the list");
    assert.ok($(`[aria-label="Usuń filtr Sprzęt: ${optLabel}"]`), "the filter stays");
    assert.equal(byTestId("atlas-results-sort").getAttribute("aria-label"), sortLabel, "the chosen sort stays");
  });

  test("reset on entry from B2 (and a tap on the active tab): no query, no filters, automatic sort", async () => {
    await boot();
    await openChest();
    await openSheet();
    await click(chip("equipment", "dumbbell"));
    await click(byTestId("atlas-filter-show"));
    await flush(3, 1);
    await write("rozp");
    await click(byTestId("nav-exercises"));
    await flush(10, 3);
    assert.ok(byTestId("atlas-home"));
    assert.equal(input().value, "");
    assert.equal(byTestId("atlas-filters-button").getAttribute("aria-label"), "Filtry");
    assert.deepEqual({ ...A.atlasBrowseMemory }, { ...A.ATLAS_BROWSE_HOME, selection: {} });
  });
});

describe("360 px and touch targets (styles of P1 / P2 / P9 in place)", () => {
  test("the search field 48 high, P9 48 × 48, chips and links ≥ 44, rows ≥ 64", async () => {
    await boot();
    await openChest();
    assert.equal(input().style.minHeight, "48px");
    const p9 = byTestId("atlas-filters-button");
    assert.deepEqual([p9.style.width, p9.style.height], ["48px", "48px"]);
    await openSheet();
    for (const b of $$('[role="dialog"] button')) {
      const s = b.style;
      assert.ok(s.minHeight === "44px" || s.minHeight === "52px" || s.height === "44px", `${b.textContent || b.getAttribute("aria-label")}: ${s.minHeight || s.height}`);
    }
  });
});
