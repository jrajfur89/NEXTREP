/* ---------------------------------------------------------------------- */
/* I5.1 — ATLAS-UX-01: view model of the module „Ćwiczenia” (no React)       */
/*                                                                           */
/* Pure functions over the bundled atlas release (ATLAS_RELEASE) and its     */
/* navigation hierarchy (ATLAS_NAVIGATION). Search, facets and the hierarchy */
/* come from the existing engines (buildAtlasIndex, buildHierarchyIndex) —   */
/* nothing is re-implemented, nothing is written, nothing is hard-coded:      */
/* every count follows the data of the release. Handoff: claude/atlas-ux-01-  */
/* i5-handoff.md §3.2.                                                       */
/* ---------------------------------------------------------------------- */

// Polish plural forms of the module's counters (one function for every text).
const ATLAS_PLURALS = {
  exercise: ["ćwiczenie", "ćwiczenia", "ćwiczeń"],
  result: ["wynik", "wyniki", "wyników"],
  subregion: ["podpartia", "podpartie", "podpartii"],
  series: ["seria", "serie", "serii"],
};
function plPlural(n, kind) {
  const f = ATLAS_PLURALS[kind];
  return f ? plWord(n, f[0], f[1], f[2]) : "";
}

// D05 — the short load-model label: the part of the app's existing label before „ — ”.
function shortLoadModelLabel(code) {
  const full = ATLAS_LOAD_MODEL_LABELS[code];
  if (!full) return code == null ? "" : String(code);
  return full.split(" — ")[0];
}

// Sheet E04 dimensions in board order; family and measurementType are not filters (Q5).
const ATLAS_SHEET_DIMENSIONS = Object.freeze([
  { dimension: "equipment", label: "Sprzęt" },
  { dimension: "loadModel", label: "Rodzaj obciążenia" },
  { dimension: "angle", label: "Kąt ławki" },
  { dimension: "grip", label: "Chwyt" },
  { dimension: "position", label: "Pozycja" },
  { dimension: "laterality", label: "Jednostronność" },
]);
// D04 — at most 2 chips per row, in this order; `execution` never.
const ATLAS_ROW_CHIP_DIMENSIONS = Object.freeze(["laterality", "angle", "grip", "position"]);

function atlasBrowseFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) atlasBrowseFreeze(v);
  }
  return value;
}
const atlasScopeKey = (scope) => `${(scope && scope.categoryCode) || ""}|${(scope && scope.subregionCode) || ""}`;

// The whole view model of one atlas release + hierarchy. Validation or index failure → { ok: false }
// (E07-Blad), never an exception into the app.
function createAtlasBrowse(atlas, navigation) {
  let check;
  try {
    check = validateHierarchy(navigation, { atlas });
  } catch (e) {
    return atlasBrowseFreeze({ ok: false, error: String((e && e.message) || e) });
  }
  if (!check || !check.ok) {
    const first = check && (check.issues || []).find((i) => i.level === "error");
    return atlasBrowseFreeze({ ok: false, error: first ? `${first.code}: ${first.message}` : "Hierarchia nieprawidłowa." });
  }
  try {
    const hierarchy = buildHierarchyIndex(navigation);
    const fullIndex = buildAtlasIndex(atlas);
    const dict = (atlas && atlas.dictionaries) || {};
    const equipmentDict = new Map((dict.equipment || []).map((e) => [e.code, e]));
    const attrDict = new Map((dict.variantAttributes || []).map((v) => [v.code, v]));
    const active = (atlas.exercises || []).filter((e) => e && e.status === "active");
    const byId = new Map(active.map((e) => [e.exerciseId, e]));
    const catOrder = (navigation.categories || []).map((c) => c.code);
    const catLabel = new Map((navigation.categories || []).map((c) => [c.code, c.labelPl]));

    // nodes of every active exercise: its sub-regions and categories (primary muscles), conditioning
    const nodes = new Map(
      active.map((e) => {
        const n = hierarchy.nodesForMuscles(e.primaryMuscles || []);
        const categories = [...n.categories];
        if (hierarchy.isConditioning(e) && hierarchy.conditioningCategory && !categories.includes(hierarchy.conditioningCategory)) categories.push(hierarchy.conditioningCategory);
        return [e.exerciseId, { categories, subregions: n.subregions }];
      })
    );
    const inScope = (e, scope) => {
      const n = nodes.get(e.exerciseId);
      if (scope && scope.subregionCode) return n.subregions.includes(scope.subregionCode);
      if (scope && scope.categoryCode) return n.categories.includes(scope.categoryCode);
      return true;
    };

    const categories = (navigation.categories || []).map((c) => {
      const count = active.filter((e) => inScope(e, { categoryCode: c.code })).length;
      // D03: sub-regions with 0 (also without muscles, e.g. Łydki) stay listed, disabled
      const subregions = (c.subregions || []).map((s) => {
        const n = active.filter((e) => inScope(e, { subregionCode: s.code })).length;
        return { code: s.code, label: s.labelPl, count: n, enabled: n > 0 };
      });
      return { code: c.code, label: c.labelPl, kind: c.kind, count, enabled: count > 0, subregions };
    });

    const scopeCache = new Map();
    const scopeOf = (scope) => {
      const key = atlasScopeKey(scope);
      if (!scopeCache.has(key)) {
        const exercises = active.filter((e) => inScope(e, scope));
        scopeCache.set(key, { exercises, index: buildAtlasIndex({ ...atlas, exercises }) });
      }
      return scopeCache.get(key);
    };

    // name-only and alias-only indexes of the same engine: an alias hit = the name does not match
    // the query, one alias does (same normalisation as the search itself)
    const nameIndex = buildAtlasIndex({ ...atlas, exercises: active.map((e) => ({ ...e, aliasesPl: [] })) });
    const aliasRows = [];
    for (const e of active) (e.aliasesPl || []).forEach((alias, k) => aliasRows.push({ ...e, exerciseId: `${e.exerciseId}#${k}`, namePl: alias, aliasesPl: [], _of: e.exerciseId, _alias: alias }));
    const aliasIndex = buildAtlasIndex({ ...atlas, exercises: aliasRows });
    const aliasOf = new Map(aliasRows.map((r) => [r.exerciseId, r]));

    const plName = (a, b) => String(a.namePl).localeCompare(String(b.namePl), "pl");

    function scopeExercises(scope) {
      return scopeOf(scope).exercises;
    }
    function scopeIndex(scope) {
      return scopeOf(scope).index;
    }
    function browseResults(scope, query = "", selection = {}, sort = "az") {
      const s = scopeOf(scope);
      let items = s.index.filter(selection, { query });
      if (sort !== "best") items = items.slice().sort(plName);
      return { items, total: items.length, inScope: s.exercises.length };
    }
    function optionLabel(dimension, opt) {
      if (dimension === "loadModel") return shortLoadModelLabel(opt.code);
      if (dimension === "laterality") return ATLAS_LATERALITY_LABELS[opt.code] || opt.code;
      return opt.label || opt.code;
    }
    function sheetFacets(scope, query = "", selection = {}) {
      const idx = scopeOf(scope).index;
      const base = idx.facets({});
      const live = idx.facets(selection, { query });
      const out = [];
      for (const d of ATLAS_SHEET_DIMENSIONS) {
        const baseOpts = base[d.dimension] || [];
        if (!baseOpts.length) continue; // a dimension without options in the scope is hidden
        const liveBy = new Map((live[d.dimension] || []).map((o) => [o.code, o]));
        const chosen = new Set((selection && selection[d.dimension]) || []);
        let options = baseOpts.map((o) => {
          const count = liveBy.has(o.code) ? liveBy.get(o.code).count : 0;
          const selected = chosen.has(o.code);
          return { code: o.code, label: optionLabel(d.dimension, o), count, enabled: count > 0 || selected, selected, baseCount: o.count };
        });
        if (d.dimension === "equipment") options.sort((a, b) => b.baseCount - a.baseCount || a.label.localeCompare(b.label, "pl"));
        else options.sort((a, b) => a.label.localeCompare(b.label, "pl") || a.code.localeCompare(b.code));
        options = options.map(({ baseCount, ...o }) => o);
        out.push({ dimension: d.dimension, label: d.label, options });
      }
      return out;
    }
    function rowChips(ex) {
      const attrs = ((ex && ex.variantAttributes) || []).map((code) => attrDict.get(code)).filter(Boolean);
      const chips = [];
      for (const dim of ATLAS_ROW_CHIP_DIMENSIONS) for (const a of attrs) if (a.dimension === dim) chips.push({ code: a.code, dimension: dim, label: a.labelPl });
      return chips.slice(0, 2);
    }
    // the equipment line of a row: load equipment first, then the rest in atlas order; none → „Bez sprzętu”
    function rowEquipment(ex) {
      const list = ((ex && ex.equipment) || []).map((code) => equipmentDict.get(code) || { code, labelPl: code, role: null });
      const ordered = [...list.filter((e) => e.role === "load"), ...list.filter((e) => e.role !== "load")];
      return ordered.length ? ordered.map((e) => e.labelPl).join(" · ") : "Bez sprzętu";
    }
    // global results (E05): „Partia · sprzęt” — the first category of the exercise in hierarchy order
    function rowCategoryLabel(ex) {
      const n = ex && nodes.get(ex.exerciseId);
      const code = n && [...n.categories].sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b))[0];
      return code ? catLabel.get(code) : "";
    }
    function aliasHit(ex, query) {
      if (!ex || !String(query || "").trim()) return null;
      if (nameIndex.search(query).some((e) => e.exerciseId === ex.exerciseId)) return null;
      const hit = aliasIndex.search(query).find((r) => aliasOf.get(r.exerciseId)._of === ex.exerciseId);
      return hit ? aliasOf.get(hit.exerciseId)._alias : null;
    }
    // D08 — the only suggestion: the query without its last word, counted by the same engine
    function searchSuggestion(scope, query, selection = {}) {
      const words = String(query || "").trim().split(/\s+/).filter(Boolean);
      if (words.length < 2) return null;
      const shorter = words.slice(0, -1).join(" ");
      const count = browseResults(scope, shorter, selection).total;
      return count > 0 ? { query: shorter, count } : null;
    }
    function relaxFiltersCount(scope, query = "") {
      return browseResults(scope, query, {}).total;
    }
    function exercise(id) {
      return byId.get(id) || null;
    }

    return {
      ok: true,
      error: null,
      atlasVersion: fullIndex.atlasVersion,
      hierarchyVersion: hierarchy.hierarchyVersion,
      total: active.length,
      categories: atlasBrowseFreeze(categories),
      scopeExercises,
      scopeIndex,
      browseResults,
      sheetFacets,
      rowChips,
      rowEquipment,
      rowCategoryLabel,
      aliasHit,
      searchSuggestion,
      relaxFiltersCount,
      exercise,
    };
  } catch (e) {
    return atlasBrowseFreeze({ ok: false, error: String((e && e.message) || e) });
  }
}

// The app's model: built once from the bundled release; „Spróbuj ponownie” (E07) rebuilds it.
let atlasBrowseMemo = null;
function atlasBrowseModel() {
  if (!atlasBrowseMemo) atlasBrowseMemo = Object.freeze(createAtlasBrowse(ATLAS_RELEASE, ATLAS_NAVIGATION));
  return atlasBrowseMemo;
}
function atlasBrowseRetry() {
  atlasBrowseMemo = null;
  return atlasBrowseModel();
}
