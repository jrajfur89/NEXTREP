// I5.2 — ATLAS-UX-01 components P1–P9 (src/app/17c-atlas-browse.jsx): anatomy, states and accessibility
// per design package v2 §4 and the boards E01–E07; integration with the I5.1 view model (atlasRowProps).
// The components are not on any screen yet (I5.3) — the visible UI does not change.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { React, mount, unmount, flush, act, click, type, $, $$, byTestId, loadApp } from "../harness/ui.mjs";

const h = React.createElement;
const NBSP = " ";
let A;
let M;
before(async () => {
  A = await loadApp();
  M = A.atlasBrowseModel();
});
after(unmount);
const render = async (el) => {
  await unmount();
  await mount(el);
  await flush(2, 1);
};

describe("P1 AtlasSearchField", () => {
  function Harness(props) {
    const [v, setV] = React.useState(props.initial || "");
    return h(A.AtlasSearchField, { value: v, onChange: setV, label: "Szukaj ćwiczenia", placeholder: "Szukaj po nazwie lub aliasie", ...props }, props.trailing || null);
  }
  test("role=search, hidden label, search keyboard attributes, placeholder of the board", async () => {
    await render(h(Harness));
    const root = byTestId("atlas-search");
    assert.equal(root.getAttribute("role"), "search");
    const input = $("input", root);
    assert.equal(input.closest("label").textContent, "Szukaj ćwiczenia", "the label names the field");
    assert.deepEqual(
      ["type", "enterkeyhint", "autocomplete", "autocapitalize", "spellcheck", "placeholder"].map((a) => input.getAttribute(a)),
      ["search", "search", "off", "off", "false", "Szukaj po nazwie lub aliasie"]
    );
    assert.ok(!byTestId("atlas-search-clear"), "no „Wyczyść” without text");
    assert.ok(!byTestId("atlas-search-cancel"), "„Anuluj” only in E05");
  });
  test("typing shows „Wyczyść” (44 × 44, named); it clears and keeps the focus; Enter blurs", async () => {
    await render(h(Harness));
    const input = $('[data-atlas-search]');
    await act(async () => input.focus());
    await type(input, "hantle");
    const clear = byTestId("atlas-search-clear");
    assert.equal(clear.getAttribute("aria-label"), "Wyczyść wyszukiwanie");
    assert.equal(clear.style.width, "44px");
    assert.equal(clear.style.height, "44px");
    assert.equal(input.style.border, "2px solid rgb(255, 133, 27)", "focus ring of the field");
    await click(clear);
    assert.equal($('[data-atlas-search]').value, "");
    assert.equal(document.activeElement, $('[data-atlas-search]'), "the field keeps the focus");
    await type($('[data-atlas-search]'), "x");
    await act(async () => $('[data-atlas-search]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.notEqual(document.activeElement, $('[data-atlas-search]'), "Enter hides the keyboard");
    assert.equal($('[data-atlas-search]').value, "x", "results stay");
  });
  test("„Anuluj” (E05) and the trailing slot (P9)", async () => {
    let cancelled = 0;
    await render(h(Harness, { onCancel: () => cancelled++, trailing: h(A.AtlasFiltersButton, { count: 0 }) }));
    await click(byTestId("atlas-search-cancel"));
    assert.equal(cancelled, 1);
    assert.ok(byTestId("atlas-filters-button"));
  });
});

describe("P2 AtlasFilterChip / P3 AtlasActiveFilterChip", () => {
  test("P2: aria-pressed; selected with check; 0 → disabled, dashed; count in Inter", async () => {
    let n = 0;
    await render(
      h("div", null, [
        h(A.AtlasFilterChip, { key: 1, label: "Hantel", count: 12, selected: true, onToggle: () => n++, testId: "c1" }),
        h(A.AtlasFilterChip, { key: 2, label: "Ławka", count: 18, testId: "c2" }),
        h(A.AtlasFilterChip, { key: 3, label: "Jeden kettle", count: 0, enabled: false, testId: "c3" }),
      ])
    );
    assert.equal(byTestId("c1").getAttribute("aria-pressed"), "true");
    assert.ok($('[data-icon="Check"]', byTestId("c1")));
    assert.equal(byTestId("c2").getAttribute("aria-pressed"), "false");
    assert.equal(byTestId("c3").disabled, true);
    assert.match(byTestId("c3").style.border, /dashed/);
    assert.equal(byTestId("c3").textContent, "Jeden kettle0");
    assert.equal(byTestId("c1").style.minHeight, "44px");
    await click(byTestId("c1"));
    assert.equal(n, 1);
  });
  test("P3: „Usuń filtr {wymiar}: {wartość}”", async () => {
    let removed = 0;
    await render(h(A.AtlasActiveFilterChip, { dimensionLabel: "Sprzęt", label: "Hantel", onRemove: () => removed++ }));
    assert.equal(byTestId("atlas-active-chip").getAttribute("aria-label"), "Usuń filtr Sprzęt: Hantel");
    await click(byTestId("atlas-active-chip"));
    assert.equal(removed, 1);
  });
});

describe("P4 AtlasCategoryTile / P6 AtlasSubregionTile (D02 / D03)", () => {
  test("P4 active: 3:2, photo layer present and empty (no assets), no scrim, count with plural, arrow", async () => {
    let opened = 0;
    await render(h(A.AtlasCategoryTile, { label: "Klatka piersiowa", count: 42, onOpen: () => opened++ }));
    const t = byTestId("atlas-category-tile");
    assert.equal(t.tagName, "BUTTON");
    assert.equal(t.style.aspectRatio, "3 / 2");
    const layer = $('[data-layer="photo"]', t);
    assert.equal(layer.getAttribute("aria-hidden"), "true");
    assert.equal(layer.children.length, 0, "empty photo layer in 1.0");
    assert.ok(!$('[data-layer="scrim"]', t));
    assert.equal(t.dataset.photo, "none");
    assert.equal(t.textContent, "Klatka piersiowa42 ćwiczenia");
    await click(t);
    assert.equal(opened, 1);
  });
  test("P4 disabled (Cardio 0): button disabled with the full label, dashed, no arrow", async () => {
    await render(h(A.AtlasCategoryTile, { label: "Cardio i kondycja", count: 0, enabled: false }));
    const t = byTestId("atlas-category-tile");
    assert.equal(t.disabled, true);
    assert.equal(t.getAttribute("aria-label"), "Cardio i kondycja, 0 ćwiczeń, brak w tym wydaniu Atlasu");
    assert.equal(t.textContent, "Cardio i kondycja0 ćwiczeń · brak w tym wydaniu");
    assert.ok(!$('[data-icon="ChevronRight"]', t));
    assert.ok($('[data-layer="photo"]', t), "same structure");
  });
  test("P4 photo variant (future NR-01): lazy decorative image + scrim; failure → no photo, same size", async () => {
    await render(h(A.AtlasCategoryTile, { label: "Plecy", count: 5, photo: { src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", focus: "70% 30%" } }));
    const img = $('[data-layer="photo"] img');
    assert.equal(img.getAttribute("alt"), "");
    assert.equal(img.getAttribute("loading"), "lazy");
    assert.equal(img.style.objectPosition, "70% 30%");
    assert.ok($('[data-layer="scrim"]'));
    await act(async () => img.dispatchEvent(new Event("error")));
    assert.ok(!$('[data-layer="photo"] img') && !$('[data-layer="scrim"]'));
    assert.equal(byTestId("atlas-category-tile").style.aspectRatio, "3 / 2");
  });
  test("P6: active and disabled „0 ćwiczeń / Brak w tym wydaniu”", async () => {
    await render(
      h("div", null, [
        h(A.AtlasSubregionTile, { key: 1, label: "Środek i góra pleców", count: 1, testId: "s1" }),
        h(A.AtlasSubregionTile, { key: 2, label: "Dolny odcinek pleców", count: 0, enabled: false, testId: "s2" }),
      ])
    );
    assert.equal(byTestId("s1").textContent, "Środek i góra pleców1 ćwiczenie");
    assert.equal(byTestId("s1").style.minHeight, "80px");
    assert.equal(byTestId("s2").disabled, true);
    assert.equal(byTestId("s2").getAttribute("aria-label"), "Dolny odcinek pleców, 0 ćwiczeń, brak w tym wydaniu Atlasu");
    assert.equal(byTestId("s2").textContent, "Dolny odcinek pleców0 ćwiczeńBrak w tym wydaniu");
  });
  test("from the model: every category and sub-region renders with its data count and state", async () => {
    await render(
      h("ul", null, M.categories.map((c) => h("li", { key: c.code }, h(A.AtlasCategoryTile, { label: c.label, count: c.count, enabled: c.enabled, testId: `cat-${c.code}` }))))
    );
    for (const c of M.categories) {
      const t = byTestId(`cat-${c.code}`);
      assert.equal(t.disabled, !c.enabled, c.code);
      assert.match(t.textContent, new RegExp(`^${c.label}${c.count} `));
    }
  });
});

describe("P5 AtlasExerciseRow + atlasRowProps (D04 / D12 / D13)", () => {
  test("scoped list: equipment line, ≤ 2 chips (Jednostronnie, Ławka pozioma), the whole row opens the exercise", async () => {
    const ex = M.exercise("bench_press_dumbbell_single");
    const props = A.atlasRowProps(M, ex);
    let opened = null;
    await render(h("ul", null, h(A.AtlasExerciseRow, { ...props, onOpen: (id) => (opened = id) })));
    const row = byTestId("atlas-row");
    assert.equal(row.tagName, "BUTTON");
    assert.equal(row.dataset.exerciseId, "bench_press_dumbbell_single");
    assert.equal(row.style.minHeight, "64px");
    assert.equal(row.textContent, "Wyciskanie hantla jednorącz na ławce poziomejHantel · ŁawkaJednostronnie, na stronęŁawka pozioma");
    assert.equal($('[data-icon="ChevronRight"]', row).getAttribute("aria-hidden"), "true");
    await click(row);
    assert.equal(opened, "bench_press_dumbbell_single");
  });
  test("global results: „Partia · sprzęt”, no chips, „Też jako” on an alias hit (E05-Alias)", async () => {
    const props = A.atlasRowProps(M, M.exercise("bench_press_barbell_flat"), { global: true, query: "bench" });
    assert.deepEqual(props, { exerciseId: "bench_press_barbell_flat", name: "Wyciskanie sztangi leżąc na ławce poziomej", line: "Klatka piersiowa · Sztanga · Ławka", alias: "Bench press", chips: [] });
    await render(h("ul", null, h(A.AtlasExerciseRow, props)));
    assert.match(byTestId("atlas-row").textContent, /Też jako: Bench press/);
    assert.equal(A.atlasRowProps(M, M.exercise("pushup_standard")).line, "Bez sprzętu");
  });
});

describe("P7 AtlasResultsBar", () => {
  test("„N z M ćwiczeń” (E03-Filtry), „N wyników w całym Atlasie” (E05), „N ćwiczenia” (E03); status polite; sort button", async () => {
    let toggled = 0;
    await render(h(A.AtlasResultsBar, { count: 12, of: 42, sort: "az", onToggleSort: () => toggled++ }));
    const status = byTestId("atlas-results-count");
    assert.equal(status.getAttribute("role"), "status");
    assert.equal(status.getAttribute("aria-live"), "polite");
    assert.equal(status.textContent, "12 z 42 ćwiczeń");
    assert.equal(byTestId("atlas-results-sort").getAttribute("aria-label"), "Sortowanie: Nazwa A–Z. Zmień");
    await click(byTestId("atlas-results-sort"));
    assert.equal(toggled, 1);
    await render(h(A.AtlasResultsBar, { count: 7, noun: "result", suffix: " w całym Atlasie", sort: "best", onToggleSort: () => {} }));
    assert.equal(byTestId("atlas-results-count").textContent, "7 wyników w całym Atlasie");
    assert.match(byTestId("atlas-results-sort").textContent, /Najlepsze dopasowanie/);
    await render(h(A.AtlasResultsBar, { count: 2, noun: "result", suffix: " w całym Atlasie" }));
    assert.equal(byTestId("atlas-results-count").textContent, "2 wyniki w całym Atlasie");
    assert.ok(!byTestId("atlas-results-sort"), "no sort button without a handler");
    await render(h(A.AtlasResultsBar, { count: 42 }));
    assert.equal(byTestId("atlas-results-count").textContent, "42 ćwiczenia");
  });
});

describe("P8 AtlasMessage (E07, texts verbatim)", () => {
  const T = () => A.ATLAS_MESSAGES;
  test("no results: title with the query, hint, suggestion „Szukaj „przysiad” · 2 wyniki”, „Wyczyść wyszukiwanie”", async () => {
    const s = M.searchSuggestion({}, "przysiad bułgarski");
    let used = null;
    await render(h(A.AtlasMessage, { title: T().noResultsTitle("przysiad bułgarski"), text: T().noResultsText, primary: { label: T().suggestion(s.query), count: s.count, onClick: () => (used = s.query) }, link: { label: T().clearSearch, onClick: () => {} } }));
    const m = byTestId("atlas-message");
    assert.ok(!m.closest('[role="alert"]'), "not an alert");
    assert.equal(m.textContent, "Nie znaleźliśmy „przysiad bułgarski”Sprawdź pisownię albo wpisz mniej słów. Szukamy w polskich nazwach i aliasach ćwiczeń z Atlasu.Szukaj „przysiad” · 2 wynikiWyczyść wyszukiwanie");
    await click(byTestId("atlas-message-primary"));
    assert.equal(used, "przysiad");
  });
  test("filters without results: „Usuń filtry · 3 wyniki”", async () => {
    await render(h(A.AtlasMessage, { variant: "filters", marginTop: 8, title: T().filtersZeroTitle, text: "„smith” w partii Klatka piersiowa z filtrem Hantel nie daje wyników.", primary: { label: T().removeFilters, count: M.relaxFiltersCount({ categoryCode: "chest" }, "smith"), onClick: () => {} }, link: { label: T().clearSearch, onClick: () => {} } }));
    assert.equal(byTestId("atlas-message-primary").textContent, "Usuń filtry · 3 wyniki");
  });
  test("error: role=alert, neutral icon, texts and „Spróbuj ponownie”", async () => {
    await render(h(A.AtlasMessage, { variant: "error", marginTop: 60, title: T().errorTitle, text: T().errorText, primary: { label: T().retry, onClick: () => {} } }));
    const m = byTestId("atlas-message");
    assert.ok(m.closest('[role="alert"]'));
    assert.ok($('[data-icon="RefreshCcw"]', m));
    assert.equal(m.textContent, "Nie udało się wczytać Atlasu ćwiczeńKatalog jest chwilowo niedostępny. Spróbuj ponownieSpróbuj ponownie");
  });
});

describe("P9 AtlasFiltersButton", () => {
  test("48 × 48; „Filtry” without filters; „Filtry, aktywne: N” + badge + warm border with filters; opens a dialog", async () => {
    await render(h(A.AtlasFiltersButton, { count: 0 }));
    let b = byTestId("atlas-filters-button");
    assert.equal(b.getAttribute("aria-label"), "Filtry");
    assert.equal(b.getAttribute("aria-haspopup"), "dialog");
    assert.deepEqual([b.style.width, b.style.height], ["48px", "48px"]);
    assert.ok(!byTestId("atlas-filters-button-badge"));
    let opened = 0;
    await render(h(A.AtlasFiltersButton, { count: 2, onOpen: () => opened++ }));
    b = byTestId("atlas-filters-button");
    assert.equal(b.getAttribute("aria-label"), "Filtry, aktywne: 2");
    assert.equal(byTestId("atlas-filters-button-badge").textContent, "2");
    assert.equal(byTestId("atlas-filters-button-badge").getAttribute("aria-hidden"), "true");
    assert.equal(b.style.border, "2px solid rgb(255, 133, 27)");
    await click(b);
    assert.equal(opened, 1);
  });
});

describe("I5.2 scope", () => {
  test("I5.6: the atlas components take their colours from the approved DS tokens (NR), values unchanged", async () => {
    assert.equal(A.ATLAS_PROPOSED_DS, undefined, "no local PROPOSED colours any more");
    const { surfaceControl, surfaceRaised, surfaceTertiary, textChip, brandBright } = A.NR;
    assert.deepEqual({ surfaceControl, surfaceRaised, surfaceTertiary, textChip, brandBright }, { surfaceControl: "#121213", surfaceRaised: "#1A1A1B", surfaceTertiary: "#222224", textChip: "#D9D9D9", brandBright: "#FF9A3D" });
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/app/17c-atlas-browse.jsx", import.meta.url), "utf8");
    for (const hex of ["#121213", "#1A1A1B", "#222224", "#D9D9D9", "#FF9A3D"]) assert.ok(!src.toUpperCase().includes(hex), `${hex} only through its token`);
  });
});
