// AT3.2b — the one hierarchy for atlas navigation and statistics (AT3-D16).
//
// Shape (navigation.json next to the atlas release): categories → sub-regions → muscle codes of the
// atlas dictionary. Muscle categories hold exercises by their PRIMARY muscles; the conditioning
// category ("cardio") holds exercises by measurementType and has no sub-regions (O-33, P3).
// `hierarchyVersion` is reported with every aggregation (AT3-D18); node codes are stable: once
// issued (issuedNodeCodes) a code is never removed or reused for another kind of node.
// `plannedMuscles` lists codes the Standaryzacja will add to the atlas later; they are NOT muscles of
// the hierarchy until they move to `muscles` together with the atlas release that adds them.
//
// Pure: the hierarchy and the atlas are passed in.
import { DICT_CODE_PATTERN } from "./atlas-schema.js";

export const HIERARCHY_FORMAT_VERSION = 1;
export const HIERARCHY_KINDS = ["muscle", "conditioning"];

const list = (x) => (Array.isArray(x) ? x : []);

// Every rule gives { level, rule, code, node, message }; any "error" makes the hierarchy unusable.
// atlas: the release it is checked with (muscle dictionary); previous: the last approved hierarchy.
export function validateHierarchy(hierarchy, { atlas = null, previous = null } = {}) {
  const issues = [];
  const add = (level, rule, code, node, message) => issues.push({ level, rule, code, node: node ?? null, message });
  const h = hierarchy && typeof hierarchy === "object" ? hierarchy : null;
  if (!h) {
    add("error", "H1", "HIERARCHY_MISSING", null, "Brak hierarchii.");
    return { ok: false, issues };
  }

  // H1 format and version
  if (h.formatVersion !== HIERARCHY_FORMAT_VERSION) add("error", "H1", "FORMAT_VERSION", null, `formatVersion musi być ${HIERARCHY_FORMAT_VERSION}.`);
  if (!(Number.isInteger(h.hierarchyVersion) && h.hierarchyVersion >= 1)) add("error", "H1", "HIERARCHY_VERSION", null, "hierarchyVersion musi być liczbą całkowitą ≥ 1.");

  // H2 node codes: format, uniqueness, sub-region code = "<category>.<name>"
  const nodes = new Map(); // code → kind ("category" | "subregion")
  const categories = list(h.categories);
  if (!categories.length) add("error", "H2", "NO_CATEGORIES", null, "Hierarchia nie ma kategorii.");
  const registerNode = (code, kind) => {
    if (typeof code !== "string" || !DICT_CODE_PATTERN.test(code)) { add("error", "H2", "NODE_CODE_FORMAT", code, `Niepoprawny kod węzła „${code}”.`); return; }
    if (nodes.has(code)) add("error", "H2", "NODE_CODE_DUPLICATE", code, `Kod węzła „${code}” występuje więcej niż raz.`);
    nodes.set(code, kind);
  };
  let conditioning = 0;
  for (const c of categories) {
    registerNode(c && c.code, "category");
    if (!c || typeof c.labelPl !== "string" || !c.labelPl.trim()) add("error", "H2", "LABEL_REQUIRED", c && c.code, "Kategoria musi mieć nazwę.");
    if (!HIERARCHY_KINDS.includes(c && c.kind)) add("error", "H3", "CATEGORY_KIND", c && c.code, `Rodzaj kategorii musi być jednym z: ${HIERARCHY_KINDS.join(", ")}.`);
    const subs = list(c && c.subregions);
    if (c && c.kind === "muscle" && !subs.length) add("error", "H3", "MUSCLE_CATEGORY_WITHOUT_SUBREGIONS", c.code, `Kategoria mięśniowa „${c.code}” musi mieć podpartie.`);
    if (c && c.kind === "conditioning") {
      conditioning++;
      if (subs.length) add("error", "H3", "CONDITIONING_SUBREGIONS", c.code, "Kategoria cardio nie ma podpartii w 1.0 (O-33).");
      if (c.measurementType !== "cardio") add("error", "H3", "CONDITIONING_MEASUREMENT", c.code, "Kategoria cardio obejmuje ćwiczenia z measurementType „cardio”.");
    }
    for (const s of subs) {
      registerNode(s && s.code, "subregion");
      if (s && typeof s.code === "string" && !s.code.startsWith(`${c.code}.`)) add("error", "H2", "SUBREGION_CODE_PREFIX", s.code, `Kod podpartii musi zaczynać się od „${c.code}.”.`);
      if (!s || typeof s.labelPl !== "string" || !s.labelPl.trim()) add("error", "H2", "LABEL_REQUIRED", s && s.code, "Podpartia musi mieć nazwę.");
    }
  }
  if (conditioning !== 1) add("error", "H3", "CONDITIONING_CATEGORY_COUNT", null, "Hierarchia ma dokładnie jedną kategorię cardio.");

  // H4 stable node codes: every node issued; no issued code removed; previous codes kept
  const issued = list(h.issuedNodeCodes);
  if (new Set(issued).size !== issued.length) add("error", "H4", "ISSUED_DUPLICATE", null, "issuedNodeCodes zawiera powtórzenia.");
  for (const code of nodes.keys()) if (!issued.includes(code)) add("error", "H4", "NODE_NOT_ISSUED", code, `Węzeł „${code}” nie jest w issuedNodeCodes.`);
  for (const code of issued) if (!nodes.has(code)) add("error", "H4", "NODE_REMOVED", code, `Wydany kod węzła „${code}” nie może zostać usunięty.`);
  if (previous) {
    const prevNodes = new Map();
    for (const c of list(previous.categories)) {
      prevNodes.set(c.code, "category");
      for (const s of list(c.subregions)) prevNodes.set(s.code, "subregion");
    }
    for (const code of list(previous.issuedNodeCodes)) if (!issued.includes(code)) add("error", "H4", "NODE_REMOVED", code, `Wydany kod węzła „${code}” zniknął względem poprzedniej wersji.`);
    for (const [code, kind] of prevNodes) if (nodes.has(code) && nodes.get(code) !== kind) add("error", "H4", "NODE_KIND_CHANGED", code, `Węzeł „${code}” zmienił rodzaj (${kind} → ${nodes.get(code)}).`);
    const content = (x) => JSON.stringify({ categories: x.categories, issuedNodeCodes: x.issuedNodeCodes });
    if (content(previous) !== content(h) && !(h.hierarchyVersion > previous.hierarchyVersion)) add("error", "H1", "HIERARCHY_VERSION_NOT_BUMPED", null, "Zmieniona hierarchia wymaga wyższej hierarchyVersion.");
    if (h.hierarchyVersion < previous.hierarchyVersion) add("error", "H1", "HIERARCHY_VERSION_DECREASED", null, "hierarchyVersion nie może się zmniejszyć.");
  }

  // H5 muscle mapping against the atlas dictionary
  const owner = new Map(); // muscle → [sub-region]
  const planned = new Map();
  for (const c of categories) for (const s of list(c && c.subregions)) {
    for (const m of list(s && s.muscles)) owner.set(m, [...(owner.get(m) || []), s.code]);
    for (const m of list(s && s.plannedMuscles)) planned.set(m, [...(planned.get(m) || []), s.code]);
    if (s && !list(s.muscles).length) add("info", "H5", "SUBREGION_EMPTY", s.code, `Podpartia „${s.code}” nie ma jeszcze mięśni (ukryta w UI, zero w statystykach).`);
  }
  for (const [m, subs] of owner) if (subs.length > 1) add("error", "H5", "MUSCLE_MULTIPLE_SUBREGIONS", subs.join(", "), `Mięsień „${m}” jest w kilku podpartiach: ${subs.join(", ")}.`);
  for (const [m, subs] of planned) {
    if (owner.has(m)) add("error", "H5", "PLANNED_MUSCLE_ALSO_MAPPED", subs.join(", "), `Kod „${m}” jest jednocześnie planowany i przypisany.`);
    if (subs.length > 1) add("error", "H5", "MUSCLE_MULTIPLE_SUBREGIONS", subs.join(", "), `Planowany kod „${m}” jest w kilku podpartiach.`);
  }
  if (atlas) {
    const dict = new Map(list(atlas.dictionaries && atlas.dictionaries.muscles).map((m) => [m.code, m]));
    for (const [m, subs] of owner) if (!dict.has(m)) add("error", "H5", "MUSCLE_UNKNOWN", subs.join(", "), `Mięsień „${m}” nie istnieje w słowniku atlasu.`);
    for (const [code, m] of dict) if (m.status === "active" && !owner.has(code)) add("error", "H5", "MUSCLE_WITHOUT_SUBREGION", null, `Aktywny mięsień „${code}” nie ma podpartii.`);
    for (const [m, subs] of planned) if (dict.has(m)) add("error", "H5", "PLANNED_MUSCLE_IN_ATLAS", subs.join(", "), `Kod „${m}” jest już w słowniku atlasu — przenieś go z plannedMuscles do muscles.`);
  }
  return { ok: !issues.some((i) => i.level === "error"), issues };
}

// Read model of a VALID hierarchy (validate first). Node lists keep the hierarchy order.
export function buildHierarchyIndex(hierarchy) {
  const h = hierarchy || {};
  const categories = list(h.categories);
  const subregionOfMuscle = new Map();
  const categoryOfSubregion = new Map();
  const order = new Map();
  let i = 0;
  for (const c of categories) {
    order.set(c.code, i++);
    for (const s of list(c.subregions)) {
      order.set(s.code, i++);
      categoryOfSubregion.set(s.code, c.code);
      for (const m of list(s.muscles)) subregionOfMuscle.set(m, s.code);
    }
  }
  const conditioning = categories.find((c) => c.kind === "conditioning") || null;
  const byOrder = (a, b) => order.get(a) - order.get(b);

  // Muscles → their sub-regions and categories, each node once. Unknown codes stay muscles only and
  // are reported in `unmapped`.
  function nodesForMuscles(muscles) {
    const ms = [...new Set(list(muscles))];
    const subregions = new Set();
    const cats = new Set();
    const unmapped = [];
    for (const m of ms) {
      const s = subregionOfMuscle.get(m);
      if (!s) { unmapped.push(m); continue; }
      subregions.add(s);
      cats.add(categoryOfSubregion.get(s));
    }
    return { muscles: ms, subregions: [...subregions].sort(byOrder), categories: [...cats].sort(byOrder), unmapped };
  }

  return Object.freeze({
    hierarchyVersion: h.hierarchyVersion ?? null,
    conditioningCategory: conditioning ? conditioning.code : null,
    isConditioning: (snapshot) => Boolean(conditioning && snapshot && snapshot.measurementType === conditioning.measurementType),
    nodesForMuscles,
    subregionOf: (muscle) => subregionOfMuscle.get(muscle) ?? null,
    categoryOf: (subregion) => categoryOfSubregion.get(subregion) ?? null,
  });
}
