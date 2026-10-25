// I5.1 — ATLAS-UX-01: the view model of the module „Ćwiczenia” (src/app/17c-atlas-browse.jsx).
// Counts and lists come from the bundled atlas release 5 and navigation.json (hierarchy 1) through the
// existing engines; this suite pins them to the approved boards (E01–E07) and the handoff §3.2.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "../harness/load-app.mjs";
import { buildAtlasIndex, ATLAS_NAVIGATION, ATLAS_RELEASE, buildHierarchyIndex, validateHierarchy, ATLAS_FACET_DIMENSIONS } from "../../src/engine/index.js";

const repoAtlas = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const repoNav = JSON.parse(readFileSync(new URL("../../src/atlas/navigation.json", import.meta.url), "utf8"));
const NBSP = " ";
let A;
let M;
before(async () => {
  A = await loadApp();
  M = A.atlasBrowseModel();
});
const cat = (code) => M.categories.find((c) => c.code === code);
const sub = (c, code) => cat(c).subregions.find((s) => s.code === code);

describe("I5.1 data entry: one path through the engine", () => {
  test("the engine entry exposes the repository navigation and the existing engines", () => {
    assert.deepEqual(ATLAS_NAVIGATION, repoNav);
    assert.deepEqual(ATLAS_RELEASE, repoAtlas);
    assert.equal(typeof buildHierarchyIndex, "function");
    assert.equal(validateHierarchy(ATLAS_NAVIGATION, { atlas: ATLAS_RELEASE }).ok, true);
    assert.ok(ATLAS_FACET_DIMENSIONS.includes("equipment"));
  });
  test("the release and the hierarchy are valid together; the model is built once and frozen", () => {
    assert.equal(M.ok, true, M.error);
    assert.equal(A.atlasBrowseModel(), M, "memo");
    assert.ok(Object.isFrozen(M) && Object.isFrozen(M.categories) && Object.isFrozen(M.categories[0].subregions[0]));
    assert.equal(M.hierarchyVersion, repoNav.hierarchyVersion);
    assert.equal(M.atlasVersion, repoAtlas.atlasVersion);
  });
});

describe("I5.1 categories and sub-regions (E01 / E02, D02 / D03)", () => {
  test("E01: total 55 and the 7 categories in navigation order with the board counts", () => {
    assert.equal(M.total, repoAtlas.exercises.filter((e) => e.status === "active").length);
    assert.equal(M.total, 55);
    assert.deepEqual(
      M.categories.map((c) => [c.label, c.count, c.enabled]),
      [
        ["Klatka piersiowa", 42, true],
        ["Plecy", 5, true],
        ["Barki", 1, true],
        ["Ramiona", 4, true],
        ["Brzuch i core", 2, true],
        ["Nogi", 4, true],
        ["Cardio i kondycja", 0, false],
      ]
    );
    assert.deepEqual(M.categories.map((c) => c.code), repoNav.categories.map((c) => c.code));
  });
  test("E02: Plecy 5 / 1 / 0; Nogi with Łydki (no muscles) present and disabled (D03); counts not summed", () => {
    assert.deepEqual(cat("back").subregions.map((s) => [s.label, s.count, s.enabled]), [
      ["Najszerszy grzbietu", 5, true],
      ["Środek i góra pleców", 1, true],
      ["Dolny odcinek pleców", 0, false],
    ]);
    assert.deepEqual(cat("legs").subregions.map((s) => [s.label, s.count, s.enabled]), [
      ["Czworogłowe uda", 3, true],
      ["Dwugłowe uda", 1, true],
      ["Pośladki", 4, true],
      ["Przywodziciele", 0, false],
      ["Zginacze biodra", 0, false],
      ["Łydki", 0, false],
    ]);
    const calves = repoNav.categories.find((c) => c.code === "legs").subregions.find((s) => s.labelPl === "Łydki");
    assert.deepEqual(calves.muscles, [], "a sub-region without muscles in the data");
    assert.equal(cat("chest").subregions.length, 1, "Klatka: one sub-region → E03 directly");
    const cond = cat(repoNav.categories.find((c) => c.kind === "conditioning").code);
    assert.deepEqual([cond.count, cond.enabled, cond.subregions.length], [0, false, 0], "Cardio: 0, no action (D02)");
  });
  test("scopes: a category / a sub-region / the whole atlas", () => {
    assert.equal(M.scopeExercises({}).length, 55);
    assert.equal(M.scopeExercises({ categoryCode: "back" }).length, 5);
    assert.equal(M.scopeExercises({ subregionCode: sub("back", "back.upper").code }).length, 1);
    assert.equal(M.scopeExercises({ subregionCode: "back.lower" }).length, 0);
    assert.equal(M.scopeIndex({ categoryCode: "back" }), M.scopeIndex({ categoryCode: "back" }), "memo per scope");
  });
});

describe("I5.1 results (E03 / E05)", () => {
  test("A–Z by Polish name; „best” = the engine's ranking; N z M", () => {
    const r = M.browseResults({ categoryCode: "chest" }, "", {}, "az");
    assert.equal(r.total, 42);
    assert.equal(r.inScope, 42);
    const names = r.items.map((e) => e.namePl);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "pl")));
    const best = M.browseResults({}, "wyciskanie hantli", {}, "best");
    const engine = buildAtlasIndex(repoAtlas).filter({}, { query: "wyciskanie hantli" });
    assert.deepEqual(best.items.map((e) => e.exerciseId), engine.map((e) => e.exerciseId));
    const scoped = M.browseResults({ categoryCode: "chest" }, "smith", {}, "az");
    assert.deepEqual([scoped.total, scoped.inScope], [3, 42]);
  });
  test("row: at most 2 chips in the order laterality → angle → grip → position, never execution", () => {
    for (const e of M.scopeExercises({})) {
      const chips = M.rowChips(e);
      assert.ok(chips.length <= 2, e.exerciseId);
      assert.ok(chips.every((c) => c.dimension !== "execution"));
      const order = ["laterality", "angle", "grip", "position"];
      assert.deepEqual(chips.map((c) => order.indexOf(c.dimension)), chips.map((c) => order.indexOf(c.dimension)).slice().sort((a, b) => a - b));
    }
    assert.deepEqual(M.rowChips(M.exercise("pushup_feet_elevated")).map((c) => c.label), ["Stopy na podwyższeniu"]);
    assert.deepEqual(M.rowChips(M.exercise("pushup_standard")), [], "execution only → no chip");
  });
  test("row lines: equipment (load first, none → „Bez sprzętu”) and „Partia · …” for global results", () => {
    assert.equal(M.rowEquipment(M.exercise("dip_chest_weighted")), "Talerze/krążki obciążeniowe · Poręcze do dipów · Pas do podwieszania ciężaru");
    assert.equal(M.rowEquipment(M.exercise("pushup_standard")), "Bez sprzętu");
    assert.equal(M.rowCategoryLabel(M.exercise("bench_press_barbell_flat")), "Klatka piersiowa");
  });
  test("„Też jako”: only when the name does not match and an alias does (engine normalisation)", () => {
    const bench = M.exercise("bench_press_barbell_flat");
    assert.equal(M.aliasHit(bench, "bench"), "Bench press");
    assert.equal(M.aliasHit(bench, "BENCH press"), "Bench press");
    assert.equal(M.aliasHit(bench, "wyciskanie"), null, "the name matches");
    assert.equal(M.aliasHit(bench, ""), null);
  });
  test("D08: „przysiad bułgarski” → „przysiad” · 2; no suggestion when the shorter query finds nothing or is one word", () => {
    assert.equal(M.browseResults({}, "przysiad bułgarski").total, 0);
    assert.deepEqual(M.searchSuggestion({}, "przysiad bułgarski"), { query: "przysiad", count: 2 });
    assert.equal(M.searchSuggestion({}, "xyz abc"), null);
    assert.equal(M.searchSuggestion({}, "przysiad"), null);
  });
  test("E07-FiltryZero: „smith” in Klatka with Hantel → 0; without filters → 3", () => {
    assert.equal(M.browseResults({ categoryCode: "chest" }, "smith", { equipment: ["dumbbell"] }).total, 0);
    assert.equal(M.relaxFiltersCount({ categoryCode: "chest" }, "smith"), 3);
  });
});

describe("I5.1 filter sheet (E04, D05)", () => {
  const sheet = () => M.sheetFacets({ categoryCode: "chest" }, "", { equipment: ["dumbbell"] });
  const dim = (d) => sheet().find((x) => x.dimension === d);
  test("dimensions in board order; a dimension without options in the scope is hidden", () => {
    assert.deepEqual(sheet().map((d) => d.label), ["Sprzęt", "Rodzaj obciążenia", "Kąt ławki", "Chwyt", "Pozycja", "Jednostronność"]);
    assert.ok(!M.sheetFacets({ categoryCode: "back" }).some((d) => d.dimension === "angle"), "no bench angle in Plecy");
    assert.ok(!sheet().some((d) => d.dimension === "family" || d.dimension === "measurementType"), "Q5");
  });
  test("Sprzęt: by count (top of the board: Ławka 18, Hantel 12, Wyciąg treningowy 5, Mata 4, Sztanga 4, Guma oporowa 3)", () => {
    assert.deepEqual(dim("equipment").options.slice(0, 6).map((o) => [o.label, o.count]), [
      ["Ławka", 18],
      ["Hantel", 12],
      ["Wyciąg treningowy", 5],
      ["Mata", 4],
      ["Sztanga", 4],
      ["Guma oporowa", 3],
    ]);
    assert.equal(dim("equipment").options.find((o) => o.code === "dumbbell").selected, true);
  });
  test("Rodzaj obciążenia: short labels (D05); options with 0 stay visible and disabled", () => {
    assert.deepEqual(dim("loadModel").options.map((o) => [o.label, o.count, o.enabled]), [
      ["Dwa hantle", 11, true],
      ["Jeden hantel", 1, true],
      ["Jeden kettle", 0, false],
      ["Masa ciała", 0, false],
      ["Masa ciała + dodatkowy ciężar", 0, false],
      ["Maszyna", 0, false],
      ["Maszyna Smitha", 0, false],
      ["Opór gumy", 0, false],
      ["Sztanga", 0, false],
      ["Wyciąg", 0, false],
      ["Z asystą", 0, false],
    ]);
    assert.deepEqual(dim("angle").options.map((o) => [o.label, o.count]), [["Ławka pozioma", 6], ["Ławka skośna dodatnia", 2], ["Ławka skośna ujemna", 2]]);
    assert.equal(A.shortLoadModelLabel("dumbbell_pair"), "Dwa hantle");
    assert.equal(A.shortLoadModelLabel("bodyweight_plus"), "Masa ciała + dodatkowy ciężar");
  });
});

describe("I5.1 plurals, errors, purity", () => {
  test("plPlural: 1 ćwiczenie / 2–4 ćwiczenia / 5+ ćwiczeń, wynik / wyniki / wyników", () => {
    assert.deepEqual([1, 2, 5, 12, 22, 42].map((n) => A.plPlural(n, "exercise")), ["ćwiczenie", "ćwiczenia", "ćwiczeń", "ćwiczeń", "ćwiczenia", "ćwiczenia"]);
    assert.deepEqual([0, 1, 3, 7].map((n) => A.plPlural(n, "result")), ["wyników", "wynik", "wyniki", "wyników"]);
    assert.equal(A.plPlural(3, "subregion"), "podpartie");
  });
  test("an invalid hierarchy or a broken release → { ok: false } (E07-Blad), no exception", () => {
    const bad = { ...repoNav, formatVersion: 99 };
    const r = A.createAtlasBrowse(repoAtlas, bad);
    assert.equal(r.ok, false);
    assert.match(r.error, /FORMAT_VERSION/);
    assert.equal(A.createAtlasBrowse(repoAtlas, null).ok, false);
    assert.equal(A.createAtlasBrowse(null, repoNav).ok, false);
  });
  test("retry rebuilds the model from the bundled data", () => {
    const again = A.atlasBrowseRetry();
    assert.notEqual(again, M);
    assert.deepEqual(again.categories, M.categories);
    M = again;
  });
  test("read-only: the release and the hierarchy are not changed by building or using the model", () => {
    const before = JSON.stringify([ATLAS_RELEASE, ATLAS_NAVIGATION]);
    const m = A.createAtlasBrowse(ATLAS_RELEASE, ATLAS_NAVIGATION);
    assert.equal(m.ok, true);
    m.browseResults({ categoryCode: "chest" }, "hantle", { equipment: ["bench"] }, "best");
    m.sheetFacets({}, "", {});
    assert.equal(JSON.stringify([ATLAS_RELEASE, ATLAS_NAVIGATION]), before);
  });
});
