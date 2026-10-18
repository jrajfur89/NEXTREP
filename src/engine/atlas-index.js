// AT3.2a — read-only index of an atlas release: resolver, search and catalog facets.
//
// Pure: the atlas is passed in (the app gets it from atlas-release.js; tests from any atlas object).
// Nothing here reads files, storage or user data. The index is built once and frozen; the atlas passed
// in is copied, never changed.
//
// - resolve(exerciseId): active AND archived exercises (history and plans keep pointing at archived
//   ids); unknown or invalid id → null.
// - search(query): `namePl` and `aliasesPl`, case- and Polish-letter-insensitive (normalizeName, the
//   same rule the validator uses for name uniqueness, I2). Every word of the query has to occur in the
//   name or in ONE alias. Active exercises only unless { includeArchived: true }.
// - filter / facets: the catalog filters of the atlas spec v2 §4.1. Different dimensions combine with
//   AND, values within one dimension with OR. Facet counts of a dimension ignore that dimension's own
//   selection (so the other values stay choosable) and list only values present in active exercises.
//   Category / sub-region (navigation.json) is added in AT3.2b; user data (mine, favourites, recent)
//   later. Labels come from the atlas dictionaries; codes without a dictionary label get label null
//   (the UI names them).
import { normalizeName } from "./atlas-schema.js";

export const ATLAS_FACET_DIMENSIONS = Object.freeze([
  "equipment",
  "loadModel",
  "measurementType",
  "grip",
  "position",
  "angle",
  "laterality",
  "family",
]);

const ATTRIBUTE_DIMENSIONS = ["grip", "position", "angle"];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const list = (x) => (Array.isArray(x) ? x : []);

// The facet values of one exercise per dimension (always an array; equipment can have several).
function facetValuesOf(ex, attributeDimension) {
  const attrs = list(ex.variantAttributes);
  const byDim = (dim) => attrs.filter((code) => attributeDimension.get(code) === dim);
  return {
    equipment: [...new Set(list(ex.equipment))],
    loadModel: ex.loadModel != null ? [ex.loadModel] : [],
    measurementType: ex.measurementType != null ? [ex.measurementType] : [],
    grip: byDim("grip"),
    position: byDim("position"),
    angle: byDim("angle"),
    laterality: ex.laterality != null ? [ex.laterality] : [],
    family: ex.familyId != null ? [ex.familyId] : [],
  };
}

// 0 exact name · 1 name starts with the query · 2 exact alias · 3 alias starts with the query ·
// 4 all words in the name · 5 all words in one alias; null = no match.
function rankOf(entry, q, words) {
  if (entry.name === q) return 0;
  if (entry.name.startsWith(q)) return 1;
  if (entry.aliases.includes(q)) return 2;
  if (entry.aliases.some((a) => a.startsWith(q))) return 3;
  if (words.every((w) => entry.name.includes(w))) return 4;
  if (entry.aliases.some((a) => words.every((w) => a.includes(w)))) return 5;
  return null;
}

export function buildAtlasIndex(atlas) {
  const a = atlas && typeof atlas === "object" ? atlas : {};
  const d = a.dictionaries || {};
  const exercises = deepFreeze(structuredClone(list(a.exercises).filter((e) => e && typeof e.exerciseId === "string")));
  const byId = new Map(exercises.map((e) => [e.exerciseId, e]));

  const attributeDimension = new Map(list(d.variantAttributes).map((v) => [v.code, v.dimension]));
  const labels = {
    equipment: new Map(list(d.equipment).map((x) => [x.code, x.labelPl ?? null])),
    attribute: new Map(list(d.variantAttributes).map((x) => [x.code, x.labelPl ?? null])),
    family: new Map(list(a.families).map((f) => [f.familyId, f.namePl ?? null])),
  };
  const labelOf = (dim, code) => {
    if (dim === "equipment") return labels.equipment.get(code) ?? null;
    if (ATTRIBUTE_DIMENSIONS.includes(dim)) return labels.attribute.get(code) ?? null;
    if (dim === "family") return labels.family.get(code) ?? null;
    return null; // loadModel, measurementType, laterality: technical codes, named by the UI
  };

  const plName = (x, y) => String(x.namePl ?? "").localeCompare(String(y.namePl ?? ""), "pl");
  const entries = exercises.map((ex) => ({
    ex,
    active: ex.status === "active",
    name: normalizeName(ex.namePl),
    aliases: list(ex.aliasesPl).map(normalizeName).filter(Boolean),
    values: facetValuesOf(ex, attributeDimension),
  }));
  const activeSorted = entries.filter((e) => e.active).sort((x, y) => plName(x.ex, y.ex));

  function resolve(exerciseId) {
    if (typeof exerciseId !== "string") return null;
    return byId.get(exerciseId) ?? null;
  }

  // [{ entry, rank }] in result order
  function searchEntries(query, { includeArchived = false } = {}) {
    const pool = entries.filter((e) => includeArchived || e.active);
    const q = normalizeName(query);
    if (!q) return pool.slice().sort((x, y) => plName(x.ex, y.ex)).map((entry) => ({ entry, rank: null }));
    const words = q.split(" ").filter(Boolean);
    const hits = [];
    for (const entry of pool) {
      const rank = rankOf(entry, q, words);
      if (rank != null) hits.push({ entry, rank });
    }
    return hits.sort((x, y) => x.rank - y.rank || plName(x.entry.ex, y.entry.ex));
  }

  function search(query, options) {
    return searchEntries(query, options).map((h) => h.entry.ex);
  }

  function checkSelection(selection) {
    const sel = selection && typeof selection === "object" ? selection : {};
    const out = {};
    for (const [dim, values] of Object.entries(sel)) {
      if (!ATLAS_FACET_DIMENSIONS.includes(dim)) throw new TypeError(`Nieznany wymiar filtra: ${dim}`);
      const v = list(values);
      if (v.length) out[dim] = new Set(v);
    }
    return out;
  }

  const matches = (entry, sel, skip) =>
    Object.entries(sel).every(([dim, wanted]) => dim === skip || entry.values[dim].some((v) => wanted.has(v)));

  // Catalog results: query (if any) then filters; order = search order, or Polish name order without a query.
  function filter(selection, { query = "" } = {}) {
    const sel = checkSelection(selection);
    return searchEntries(query)
      .filter((h) => matches(h.entry, sel, null))
      .map((h) => h.entry.ex);
  }

  // { dimension: [{ code, label, count, selected }] } over active exercises; values sorted by label
  // (Polish), then code. Values that are selected but absent from the results stay listed with count 0.
  function facets(selection, { query = "" } = {}) {
    const sel = checkSelection(selection);
    const pool = searchEntries(query).map((h) => h.entry);
    const present = {};
    for (const dim of ATLAS_FACET_DIMENSIONS) present[dim] = new Set(activeSorted.flatMap((e) => e.values[dim]));
    const out = {};
    for (const dim of ATLAS_FACET_DIMENSIONS) {
      const counts = new Map([...present[dim]].map((c) => [c, 0]));
      for (const entry of pool) if (matches(entry, sel, dim)) for (const v of entry.values[dim]) counts.set(v, (counts.get(v) ?? 0) + 1);
      const chosen = sel[dim] || new Set();
      out[dim] = [...counts.entries()]
        .filter(([code, count]) => count > 0 || chosen.has(code))
        .map(([code, count]) => ({ code, label: labelOf(dim, code), count, selected: chosen.has(code) }))
        .sort((x, y) => String(x.label ?? x.code).localeCompare(String(y.label ?? y.code), "pl") || x.code.localeCompare(y.code));
    }
    return out;
  }

  return Object.freeze({
    atlasVersion: a.atlasVersion ?? null,
    size: Object.freeze({ all: exercises.length, active: activeSorted.length }),
    resolve,
    search,
    filter,
    facets,
  });
}
