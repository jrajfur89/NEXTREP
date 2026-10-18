// NEXTREP 1.0 atlas validator (F2.1) — design "F2 v2" approved 11.10.2026.
//
// validateAtlas(atlas, { previous }) checks a whole atlas (optionally against the previous release)
// and returns a report; it never changes the atlas. Levels: "error" blocks the import, "warning"
// goes to review, "info" only explains. Every issue has the rule of the design (M1, V5, …), a stable
// code (e.g. MULTIPLE_LOAD_SOURCES_UNSUPPORTED), the record and field, and a Polish message.
// The same rules will check private exercises in the app (F3) — validateExercise is reusable.
import { normalizeModel, LOAD_MODELS } from "./load.js";
import {
  STATS_GROUPS, SCOPES, STATUSES, REPS_COUNTINGS, LATERALITIES, LOAD_MODEL_CODES, NO_LOAD_MODELS, LOAD_FREE_MODELS,
  PER_IMPLEMENT_MODELS, MEASUREMENT_TYPES, EQUIPMENT_ROLES, VARIANT_DIMENSIONS, EXERCISE_FIELDS, CALC_FIELDS,
  INTERPRETATION_FIELDS, FAMILY_FIELDS, DICTIONARY_FIELDS, EQUIVALENCE_FIELDS, EXERCISE_ID_PATTERN, DICT_CODE_PATTERN,
  normalizeName,
} from "./atlas-schema.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sortedKey = (list) => [...arr(list)].map(String).sort().join("|");

// Muscle groups of an exercise (K4): primary = groups of the primary muscles; secondary = groups of
// the secondary muscles WITHOUT the primary groups, so one group never gets both kinds of work.
export function deriveGroups(exercise, muscleDict) {
  const groupOf = new Map(arr(muscleDict).map((m) => [m.code, m.statsGroup]));
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  const primaryGroups = uniq(arr(exercise && exercise.primaryMuscles).map((c) => groupOf.get(c)));
  const secondaryGroups = uniq(arr(exercise && exercise.secondaryMuscles).map((c) => groupOf.get(c))).filter((g) => !primaryGroups.includes(g));
  return { primaryGroups, secondaryGroups };
}

// Working weight / performed reps in a name (V7). Numbers that are part of a method or an angle are fine.
const WEIGHT_IN_NAME = /\d+(?:[.,]\d+)?\s*(?:kg|kilogram\p{L}*|lbs?|funt\p{L}*)(?!\p{L})/iu;
const REPS_IN_NAME = /\d+\s*(?:powt\p{L}*|reps?|repy|repetycj\p{L}*)(?!\p{L})/iu;
const SETS_X_REPS_IN_NAME = /\b\d+\s*[x×]\s*\d+\b/i;
const SIDE_WORDS = /\b(jednor[aą]cz|jednon[oó][zż]|jedn[aą] r[eę]k[aą]|jedn[aą] nog[aą])\b/i;

function makeReport() {
  const issues = [];
  const add = (level, rule, code, where, field, message) => issues.push({ level, rule, code, ...where, field: field ?? null, message });
  return { issues, add };
}

// ---- dictionaries ----------------------------------------------------------------------------
function validateDictionaries(atlas, previous, add) {
  const d = (atlas && atlas.dictionaries) || {};
  for (const kind of ["equipment", "muscles", "variantAttributes"]) {
    const list = arr(d[kind]);
    const codes = new Set();
    const labels = new Set();
    for (const v of list) {
      const where = { dictionary: kind, value: v && v.code };
      for (const k of Object.keys(v || {})) if (!DICTIONARY_FIELDS[kind].includes(k)) add("error", "S1", "UNKNOWN_FIELD", where, k, `Nieznane pole „${k}” w słowniku.`);
      if (!v || typeof v.code !== "string" || !DICT_CODE_PATTERN.test(v.code)) { add("error", "S1", "DICT_CODE_FORMAT", where, "code", "Kod wartości słownika ma niedozwolony format."); continue; }
      if (codes.has(v.code)) add("error", "S1", "DICT_CODE_DUPLICATE", where, "code", "Kod występuje w słowniku więcej niż raz.");
      codes.add(v.code);
      const label = normalizeName(v.labelPl);
      if (!label) add("error", "S1", "REQUIRED_FIELD_MISSING", where, "labelPl", "Brak polskiej etykiety.");
      else if (labels.has(label)) add("error", "S1", "DICT_LABEL_DUPLICATE", where, "labelPl", "Polska etykieta powtarza się w słowniku.");
      labels.add(label);
      if (!STATUSES.includes(v.status)) add("error", "S1", "STATUS_INVALID", where, "status", "Status musi być active albo archived.");
      if (kind === "muscles" && !STATS_GROUPS.includes(v.statsGroup)) add("error", "M4", "MUSCLE_GROUP_INVALID", where, "statsGroup", "Mięsień musi mieć przypisaną dokładnie jedną z 10 grup statystyk.");
      if (kind === "equipment") {
        if (!EQUIPMENT_ROLES.includes(v.role)) add("error", "S1", "EQUIPMENT_ROLE_INVALID", where, "role", "Rola sprzętu musi być load, support albo assist.");
        const lm = arr(v.loadModels);
        if (lm.some((m) => !LOAD_MODEL_CODES.includes(m))) add("error", "S1", "EQUIPMENT_LOAD_MODELS_INVALID", where, "loadModels", "Nieznany model obciążenia na liście sprzętu.");
        if (v.role === "load" && !lm.length) add("error", "S1", "EQUIPMENT_LOAD_MODELS_INVALID", where, "loadModels", "Sprzęt obciążający musi wskazać dozwolone modele obciążenia.");
        if (v.role === "assist" && !(lm.length === 1 && lm[0] === "assisted")) add("error", "S1", "EQUIPMENT_LOAD_MODELS_INVALID", where, "loadModels", "Sprzęt asystujący dopuszcza wyłącznie model assisted.");
        if (v.role === "support" && lm.length) add("error", "S1", "EQUIPMENT_LOAD_MODELS_INVALID", where, "loadModels", "Podpora nie wskazuje modeli obciążenia.");
      }
      if (kind === "variantAttributes") {
        if (!VARIANT_DIMENSIONS.includes(v.dimension)) add("error", "S1", "VARIANT_DIMENSION_INVALID", where, "dimension", "Nieznany wymiar cechy wariantu.");
        if (v.dimension === "laterality" && !LATERALITIES.includes(v.laterality)) add("error", "S1", "VARIANT_ATTRIBUTE_INVALID", where, "laterality", "Cecha jednostronności musi wskazać lateralność.");
        if (v.repsCounting != null && !REPS_COUNTINGS.includes(v.repsCounting)) add("error", "S1", "VARIANT_ATTRIBUTE_INVALID", where, "repsCounting", "Nieznany sposób liczenia powtórzeń.");
        if (v.dimension === "implements" && !(Number.isInteger(v.implements) && v.implements > 0)) add("error", "S1", "VARIANT_ATTRIBUTE_INVALID", where, "implements", "Cecha liczby przyrządów musi podać liczbę.");
      }
    }
    // S2: a value of the previous release is never removed (only archived)
    if (previous) for (const pv of arr(previous.dictionaries && previous.dictionaries[kind])) if (!codes.has(pv.code)) add("error", "S2", "DICT_VALUE_REMOVED", { dictionary: kind, value: pv.code }, "code", "Wartości słownika z poprzedniego wydania nie wolno usuwać — tylko archiwizować.");
  }
}

// ---- one exercise ---------------------------------------------------------------------------
// ctx: { dict: {equipment, muscles, variantAttributes} maps by code, families map, mode: "system"|"private" }
export function validateExercise(ex, ctx, add) {
  const where = { exerciseId: ex && ex.exerciseId };
  const active = ex && ex.status === "active";
  const isSystem = ctx.mode !== "private";
  for (const k of Object.keys(ex || {})) {
    if (EQUIVALENCE_FIELDS.includes(k)) add("error", "V8", "EQUIVALENCE_FIELD_FORBIDDEN", where, k, "Atlas nie zapisuje równoważności ćwiczeń; rodzina tylko grupuje warianty.");
    else if (!EXERCISE_FIELDS.includes(k)) add("error", "S1", "UNKNOWN_FIELD", where, k, `Nieznane pole „${k}”.`);
  }
  const req = (field, ok) => { if (!ok) add("error", "T1", "REQUIRED_FIELD_MISSING", where, field, `Brak wymaganego pola ${field}.`); return ok; };
  req("exerciseId", typeof ex.exerciseId === "string" && ex.exerciseId.length > 0);
  if (typeof ex.exerciseId === "string" && ex.exerciseId && (!EXERCISE_ID_PATTERN.test(ex.exerciseId) || ex.exerciseId.length > 64)) add("error", "I1", "EXERCISE_ID_FORMAT", where, "exerciseId", "Identyfikator ma niedozwolony format.");
  if (!SCOPES.includes(ex.scope)) add("error", "S1", "SCOPE_INVALID", where, "scope", "Zakres musi być system albo private.");
  else if (isSystem && ex.scope !== "system") add("error", "S1", "SCOPE_INVALID", where, "scope", "Atlas zawiera wyłącznie ćwiczenia systemowe.");
  req("namePl", typeof ex.namePl === "string" && ex.namePl.trim().length > 0);
  if (!STATUSES.includes(ex.status)) add("error", "S1", "STATUS_INVALID", where, "status", "Status musi być active albo archived.");
  if (isSystem) req("approvedIn", typeof ex.approvedIn === "string" && ex.approvedIn.trim().length > 0);
  for (const f of ["aliasesPl", "variantAttributes", "equipment", "primaryMuscles", "secondaryMuscles"]) if (ex[f] != null && !Array.isArray(ex[f])) add("error", "S1", "FIELD_TYPE", where, f, `Pole ${f} musi być listą.`);

  // family (V1)
  if (req("familyId", typeof ex.familyId === "string" && ex.familyId.length > 0)) {
    const fam = ctx.families.get(ex.familyId);
    if (!fam) add("error", "V1", "FAMILY_UNKNOWN", where, "familyId", "Rodzina nie istnieje.");
    else if (active && fam.status !== "active") add("error", "V1", "FAMILY_ARCHIVED", where, "familyId", "Aktywne ćwiczenie nie może należeć do zarchiwizowanej rodziny.");
  }

  // dictionary values (S1 / M2)
  const dictCheck = (field, dictName, rule) => {
    const seen = new Set();
    for (const code of arr(ex[field])) {
      if (seen.has(code)) add("error", rule === "M2" ? "M3" : "S1", rule === "M2" ? "MUSCLE_DUPLICATE" : "DICT_VALUE_DUPLICATE", where, field, `Wartość „${code}” powtarza się na liście.`);
      seen.add(code);
      const v = ctx.dict[dictName].get(code);
      if (!v) add("error", rule, rule === "M2" ? "MUSCLE_UNKNOWN" : "DICT_VALUE_UNKNOWN", where, field, `Wartości „${code}” nie ma w słowniku.`);
      else if (active && v.status !== "active") add("error", rule, "DICT_VALUE_ARCHIVED", where, field, `Wartość „${code}” jest w słowniku zarchiwizowana.`);
    }
  };
  dictCheck("equipment", "equipment", "S1");
  dictCheck("variantAttributes", "variantAttributes", "S1");
  dictCheck("primaryMuscles", "muscles", "M2");
  dictCheck("secondaryMuscles", "muscles", "M2");

  // muscles (M1, M3, M5, M6). M1 since AT3.2c (O-30): cardio needs no muscles — they are optional and
  // informational; every other exercise has at least one primary muscle.
  if (ex.measurementType !== "cardio" && !arr(ex.primaryMuscles).length) add("error", "M1", "PRIMARY_MUSCLE_REQUIRED", where, "primaryMuscles", "Ćwiczenie musi mieć co najmniej jeden mięsień główny.");
  for (const c of arr(ex.secondaryMuscles)) if (arr(ex.primaryMuscles).includes(c)) add("error", "M3", "MUSCLE_PRIMARY_AND_SECONDARY", where, "secondaryMuscles", `Mięsień „${c}” nie może być jednocześnie główny i pomocniczy.`);
  const groups = deriveGroups(ex, [...ctx.dict.muscles.values()]);
  if (arr(ex.primaryMuscles).length > 3 || groups.primaryGroups.length > 2) add("warning", "M5", "MANY_PRIMARY_MUSCLES", where, "primaryMuscles", `Dużo pracy głównej (${arr(ex.primaryMuscles).length} mięśnie, ${groups.primaryGroups.length} grupy) — sprawdź, czy to na pewno praca główna.`);
  const primaryGroupSet = new Set(groups.primaryGroups);
  for (const c of arr(ex.secondaryMuscles)) {
    const g = ctx.dict.muscles.get(c) && ctx.dict.muscles.get(c).statsGroup;
    if (g && primaryGroupSet.has(g)) add("info", "M6", "SECONDARY_IN_PRIMARY_GROUP", where, "secondaryMuscles", `Mięsień pomocniczy „${c}” należy do grupy głównej ${g}; nie zmienia statystyk tej grupy.`);
  }

  // technical fields (T1–T4)
  const mt = MEASUREMENT_TYPES[ex.measurementType];
  if (req("measurementType", ex.measurementType != null) && !mt) add("error", "T3", "MEASUREMENT_UNKNOWN", where, "measurementType", "Nieznany typ pomiaru.");
  const lmKnown = LOAD_MODEL_CODES.includes(ex.loadModel);
  if (req("loadModel", ex.loadModel != null) && !lmKnown) add("error", "T2", "LOAD_MODEL_UNKNOWN", where, "loadModel", "Nieznany model obciążenia.");
  if (mt && lmKnown && !mt.loadModels.includes(ex.loadModel)) add("error", "T3", "MEASUREMENT_MODEL_MISMATCH", where, "loadModel", `Typ pomiaru ${ex.measurementType} nie dopuszcza modelu ${ex.loadModel}.`);
  if (req("laterality", ex.laterality != null) && !LATERALITIES.includes(ex.laterality)) add("error", "T2", "LATERALITY_INVALID", where, "laterality", "Nieznana lateralność.");
  if (req("repsCounting", ex.repsCounting != null) && !REPS_COUNTINGS.includes(ex.repsCounting)) add("error", "T2", "REPS_COUNTING_INVALID", where, "repsCounting", "Nieznany sposób liczenia powtórzeń.");
  if (ex.laterality === "bilateral" && ex.repsCounting === "per_side") add("error", "T2", "BILATERAL_PER_SIDE", where, "repsCounting", "Ćwiczenie obustronne liczy powtórzenia łącznie (D2).");
  if (lmKnown && LATERALITIES.includes(ex.laterality) && REPS_COUNTINGS.includes(ex.repsCounting)) {
    const n = normalizeModel({ loadModel: ex.loadModel, implements: ex.implements, laterality: ex.laterality, repsCounting: ex.repsCounting, confidence: "verified" });
    if (n.loadModel === "external_unknown" || n.repsCounting !== ex.repsCounting) add("error", "T2", "MODEL_NOT_INTERPRETABLE", where, "loadModel", "Silnik nie interpretuje tego modelu jednoznacznie.");
  }
  // implements (V6)
  if (lmKnown) {
    if (PER_IMPLEMENT_MODELS.includes(ex.loadModel)) {
      if (!(Number.isInteger(ex.implements) && ex.implements > 0)) add("error", "V6", "IMPLEMENTS_REQUIRED", where, "implements", "Model liczony na przyrząd wymaga liczby przyrządów.");
      else if (ex.implements !== LOAD_MODELS[ex.loadModel].implements) add("error", "V6", "IMPLEMENTS_MODEL_MISMATCH", where, "implements", `Model ${ex.loadModel} oznacza ${LOAD_MODELS[ex.loadModel].implements} przyrząd(y), podano ${ex.implements}.`);
    } else if (ex.implements != null) add("error", "V6", "IMPLEMENTS_NOT_APPLICABLE", where, "implements", "Liczba przyrządów dotyczy tylko hantli i kettlebell.");
  }
  const attrs = arr(ex.variantAttributes).map((c) => ctx.dict.variantAttributes.get(c)).filter(Boolean);
  for (const a of attrs.filter((x) => x.dimension === "implements")) if (ex.implements !== a.implements) add("error", "V6", "IMPLEMENTS_ATTRIBUTE_MISMATCH", where, "implements", `Cecha „${a.code}” oznacza ${a.implements} przyrząd(y), podano ${ex.implements ?? "brak"}.`);
  // load increment (T4)
  const kgModel = lmKnown && ["total", "per_implement", "added"].includes(LOAD_MODELS[ex.loadModel].kg);
  if (ex.loadIncrementKg != null && (!(typeof ex.loadIncrementKg === "number" && ex.loadIncrementKg > 0) || !kgModel)) add("error", "T4", "LOAD_INCREMENT_INVALID", where, "loadIncrementKg", "Krok ciężaru musi być liczbą > 0 i dotyczy tylko modeli liczonych w kg.");
  if (kgModel && ex.loadIncrementKg == null) add("warning", "T4", "LOAD_INCREMENT_MISSING", where, "loadIncrementKg", "Brak kroku ciężaru — silnik nie poda konkretnego ciężaru do zwiększenia (D7).");

  // laterality attribute (V4)
  const latAttrs = attrs.filter((a) => a.dimension === "laterality");
  if (latAttrs.length > 1) add("error", "V4", "LATERALITY_ATTRIBUTE_MULTIPLE", where, "variantAttributes", "Ćwiczenie może mieć najwyżej jedną cechę jednostronności.");
  else if (latAttrs.length === 1) {
    const a = latAttrs[0];
    if (a.laterality !== ex.laterality) add("error", "V4", "LATERALITY_ATTRIBUTE_MISMATCH", where, "laterality", `Cecha „${a.code}” oznacza ${a.laterality}, podano ${ex.laterality}.`);
    const wantCounting = a.repsCounting || (a.laterality === "unilateral" ? "per_side" : "total");
    if (a.laterality === ex.laterality && wantCounting !== ex.repsCounting) add("error", "V4", "LATERALITY_ATTRIBUTE_MISMATCH", where, "repsCounting", `Cecha „${a.code}” oznacza liczenie ${wantCounting}, podano ${ex.repsCounting}.`);
  } else if (ex.laterality && ex.laterality !== "bilateral") add("error", "V4", "LATERALITY_ATTRIBUTE_MISSING", where, "variantAttributes", "Jednostronność lub naprzemienność musi być widoczna jako cecha wariantu.");
  if (!latAttrs.length && SIDE_WORDS.test(String(ex.namePl || ""))) add("warning", "V9", "NAME_SUGGESTS_SIDE", where, "namePl", "Nazwa sugeruje pracę jedną stroną, a ćwiczenie nie ma cechy jednostronności.");

  // equipment ↔ model (V5)
  if (lmKnown && !LOAD_FREE_MODELS.includes(ex.loadModel)) {
    const eq = arr(ex.equipment).map((c) => ctx.dict.equipment.get(c)).filter(Boolean);
    const loads = eq.filter((e) => e.role === "load");
    const assists = eq.filter((e) => e.role === "assist");
    if (loads.length > 1) add("error", "V5", "MULTIPLE_LOAD_SOURCES_UNSUPPORTED", where, "equipment", `Ćwiczenie ma ${loads.length} źródła obciążenia (${loads.map((e) => e.code).join(", ")}); sumowanie różnych obciążeń nie jest jeszcze obsługiwane.`);
    else if (ex.loadModel === "assisted") {
      if (!assists.length) add("error", "V5", "ASSISTED_WITHOUT_ASSIST_EQUIPMENT", where, "equipment", "Model assisted wymaga sprzętu asystującego.");
      if (loads.length) add("error", "V5", "LOAD_MODEL_EQUIPMENT_MISMATCH", where, "equipment", "Ćwiczenie z asystą nie może mieć sprzętu obciążającego.");
    } else if (loads.length === 1) {
      if (!arr(loads[0].loadModels).includes(ex.loadModel)) add("error", "V5", "LOAD_MODEL_EQUIPMENT_MISMATCH", where, "loadModel", `Sprzęt „${loads[0].code}” nie dopuszcza modelu ${ex.loadModel}.`);
    } else if (!NO_LOAD_MODELS.includes(ex.loadModel)) add("error", "V5", "LOAD_MODEL_EQUIPMENT_MISMATCH", where, "equipment", `Model ${ex.loadModel} wymaga sprzętu obciążającego.`);
  }

  // names (V7)
  for (const [field, text] of [["namePl", ex.namePl], ...arr(ex.aliasesPl).map((a) => ["aliasesPl", a])]) {
    const t = String(text ?? "");
    if (WEIGHT_IN_NAME.test(t)) add("error", "V7", "NAME_CONTAINS_WORKING_WEIGHT", where, field, `„${t}” zawiera ciężar roboczy; zmiana ciężaru nie tworzy nowego ćwiczenia.`);
    if (REPS_IN_NAME.test(t)) add("error", "V7", "NAME_CONTAINS_REPS", where, field, `„${t}” zawiera liczbę powtórzeń; zmiana powtórzeń nie tworzy nowego ćwiczenia.`);
    else if (SETS_X_REPS_IN_NAME.test(t)) add("warning", "V7", "NAME_SETS_REPS_PATTERN", where, field, `„${t}” wygląda na serie × powtórzenia; dozwolone tylko jako nazwa metody.`);
  }

  // archive (I4, V8)
  if (ex.status === "archived" && !(typeof ex.archivedReason === "string" && ex.archivedReason.trim())) add("error", "I4", "ARCHIVED_REASON_REQUIRED", where, "archivedReason", "Zarchiwizowane ćwiczenie wymaga powodu.");
  if (ex.successorHint != null && ex.status !== "archived") add("error", "V8", "SUCCESSOR_HINT_ONLY_ARCHIVED", where, "successorHint", "Podpowiedź następcy jest dozwolona tylko przy ćwiczeniu zarchiwizowanym.");
  if (ex.correction != null && !(ex.correction && typeof ex.correction.approvedIn === "string" && ex.correction.approvedIn.trim() && typeof ex.correction.note === "string" && ex.correction.note.trim())) add("error", "I6", "CORRECTION_INVALID", where, "correction", "Poprawka błędu wymaga zatwierdzenia (approvedIn) i opisu (note).");
  return groups;
}

// ---- whole atlas ------------------------------------------------------------------------------
export function validateAtlas(atlas, { previous = null } = {}) {
  const { issues, add } = makeReport();
  const a = atlas || {};
  validateDictionaries(a, previous, add);
  const byCode = (list) => new Map(arr(list).filter((v) => v && typeof v.code === "string").map((v) => [v.code, v]));
  const d = a.dictionaries || {};
  const ctx = { dict: { equipment: byCode(d.equipment), muscles: byCode(d.muscles), variantAttributes: byCode(d.variantAttributes) }, families: new Map(), mode: "system" };

  // families
  const famNames = new Map();
  for (const f of arr(a.families)) {
    const where = { familyId: f && f.familyId };
    for (const k of Object.keys(f || {})) if (!FAMILY_FIELDS.includes(k)) add("error", "S1", "UNKNOWN_FIELD", where, k, `Nieznane pole „${k}” rodziny.`);
    if (!f || typeof f.familyId !== "string" || !EXERCISE_ID_PATTERN.test(f.familyId)) { add("error", "V1", "FAMILY_ID_FORMAT", where, "familyId", "Identyfikator rodziny ma niedozwolony format."); continue; }
    if (ctx.families.has(f.familyId)) add("error", "V1", "FAMILY_ID_DUPLICATE", where, "familyId", "Rodzina występuje więcej niż raz.");
    ctx.families.set(f.familyId, f);
    if (!STATUSES.includes(f.status)) add("error", "S1", "STATUS_INVALID", where, "status", "Status musi być active albo archived.");
    const n = normalizeName(f.namePl);
    if (!n) add("error", "T1", "REQUIRED_FIELD_MISSING", where, "namePl", "Brak nazwy rodziny.");
    else if (famNames.has(n)) add("error", "V1", "FAMILY_NAME_DUPLICATE", where, "namePl", `Nazwa rodziny powtarza „${famNames.get(n)}”.`);
    famNames.set(n, f.familyId);
  }

  // exercises one by one
  const exs = arr(a.exercises).filter((x) => x && typeof x === "object");
  const derived = {};
  const ids = new Map();
  for (const ex of exs) {
    if (typeof ex.exerciseId === "string") {
      if (ids.has(ex.exerciseId)) add("error", "I1", "EXERCISE_ID_DUPLICATE", { exerciseId: ex.exerciseId }, "exerciseId", "Identyfikator występuje więcej niż raz.");
      ids.set(ex.exerciseId, ex);
    }
    derived[ex.exerciseId] = validateExercise(ex, ctx, add);
  }

  // I1: issued ids are never removed or reused
  const issued = new Set([...arr(a.issuedIds), ...(previous ? arr(previous.issuedIds) : [])]);
  for (const id of issued) if (!ids.has(id)) add("error", "I1", "EXERCISE_ID_REMOVED", { exerciseId: id }, "exerciseId", "Wydanego identyfikatora nie wolno usunąć — ćwiczenie można tylko zarchiwizować.");
  for (const id of ids.keys()) if (!arr(a.issuedIds).includes(id)) add("error", "I1", "EXERCISE_ID_NOT_ISSUED", { exerciseId: id }, "issuedIds", "Identyfikator nie jest zapisany na liście wydanych identyfikatorów.");

  // I2 / I3: names and aliases
  const names = new Map();
  for (const ex of exs) {
    const n = normalizeName(ex.namePl);
    if (!n) continue;
    if (names.has(n)) add("error", "I2", "NAME_DUPLICATE", { exerciseId: ex.exerciseId }, "namePl", `Nazwa powtarza nazwę ćwiczenia ${names.get(n)}.`);
    else names.set(n, ex.exerciseId);
  }
  const aliasOwner = new Map();
  for (const ex of exs.filter((x) => x.status === "active")) {
    const own = new Set();
    for (const al of arr(ex.aliasesPl)) {
      const n = normalizeName(al);
      if (!n) continue;
      if (own.has(n) || n === normalizeName(ex.namePl)) add("error", "I3", "ALIAS_DUPLICATE", { exerciseId: ex.exerciseId }, "aliasesPl", `Alias „${al}” powtarza się w tym ćwiczeniu.`);
      own.add(n);
      const nameOwner = names.get(n);
      if (nameOwner && nameOwner !== ex.exerciseId && ids.get(nameOwner) && ids.get(nameOwner).status === "active") add("error", "I3", "ALIAS_CONFLICT", { exerciseId: ex.exerciseId }, "aliasesPl", `Alias „${al}” jest nazwą ćwiczenia ${nameOwner}.`);
      if (aliasOwner.has(n) && aliasOwner.get(n) !== ex.exerciseId) add("error", "I3", "ALIAS_CONFLICT", { exerciseId: ex.exerciseId }, "aliasesPl", `Alias „${al}” jest też aliasem ćwiczenia ${aliasOwner.get(n)}.`);
      aliasOwner.set(n, ex.exerciseId);
    }
  }

  // V2 / V3: variant signatures among active exercises
  const sigs = new Map();
  for (const ex of exs.filter((x) => x.status === "active")) {
    const sig = `${ex.familyId}#${sortedKey(ex.equipment)}#${sortedKey(ex.variantAttributes)}`;
    const other = sigs.get(sig);
    if (other) {
      const differs = INTERPRETATION_FIELDS.some((f) => !same(ex[f], other[f]));
      if (differs) add("error", "V3", "VARIANT_INTERPRETATION_NOT_VISIBLE", { exerciseId: ex.exerciseId }, "variantAttributes", `Różni się od ${other.exerciseId} sposobem interpretacji danych, ale nie cechą wariantu ani sprzętem.`);
      else add("error", "V2", "VARIANT_DUPLICATE", { exerciseId: ex.exerciseId }, "variantAttributes", `Ten sam wariant co ${other.exerciseId} (rodzina, sprzęt i cechy).`);
    } else sigs.set(sig, ex);
  }
  // V9: families
  for (const f of ctx.families.values()) {
    if (f.status !== "active") continue;
    const n = exs.filter((x) => x.familyId === f.familyId && x.status === "active").length;
    if (n === 0) add("warning", "V9", "FAMILY_WITHOUT_ACTIVE_EXERCISE", { familyId: f.familyId }, "familyId", "Aktywna rodzina nie ma aktywnych ćwiczeń.");
    if (n === 1) add("warning", "V9", "FAMILY_SINGLE_EXERCISE", { familyId: f.familyId }, "familyId", "Rodzina ma tylko jedno aktywne ćwiczenie.");
  }
  // I4: successors
  for (const ex of exs.filter((x) => x.successorHint != null)) {
    const s = ids.get(ex.successorHint);
    if (ex.successorHint === ex.exerciseId || !s || s.status !== "active") add("error", "I4", "SUCCESSOR_INVALID", { exerciseId: ex.exerciseId }, "successorHint", "Podpowiedź następcy musi wskazywać inne, aktywne ćwiczenie.");
  }
  // I5 / I6: against the previous release
  if (previous) {
    const prevById = new Map(arr(previous.exercises).map((x) => [x.exerciseId, x]));
    for (const ex of exs) {
      const p = prevById.get(ex.exerciseId);
      if (!p) continue;
      const calcChanged = CALC_FIELDS.some((f) => !same(ex[f], p[f]));
      const interpChanged = INTERPRETATION_FIELDS.filter((f) => !same(ex[f], p[f]));
      if (Number(ex.entryRev) < Number(p.entryRev)) add("error", "I5", "ENTRY_REV_DECREASED", { exerciseId: ex.exerciseId }, "entryRev", "Wersja wpisu nie może się zmniejszyć.");
      if (calcChanged && !(Number(ex.entryRev) > Number(p.entryRev))) add("error", "I5", "ENTRY_REV_NOT_BUMPED", { exerciseId: ex.exerciseId }, "entryRev", "Zmiana pola wpływającego na obliczenia wymaga podniesienia entryRev.");
      if (interpChanged.length) {
        const approved = ex.correction && typeof ex.correction.approvedIn === "string" && ex.correction.approvedIn.trim() && !same(ex.correction, p.correction);
        if (!approved) add("error", "I6", "LOAD_INTERPRETATION_CHANGED", { exerciseId: ex.exerciseId }, interpChanged[0], `Zmiana ${interpChanged.join(", ")} istniejącego ćwiczenia wymaga nowego wariantu (K3) albo zatwierdzonej poprawki błędu.`);
        else add("info", "I6", "CORRECTION_APPLIED", { exerciseId: ex.exerciseId }, interpChanged[0], `Zatwierdzona poprawka błędu (${ex.correction.approvedIn}); stare treningi zachowują swoje snapshoty.`);
      }
    }
  }
  if (!Number.isInteger(a.atlasVersion) || a.atlasVersion < 0) add("error", "S1", "ATLAS_VERSION_INVALID", {}, "atlasVersion", "Numer wydania atlasu musi być liczbą całkowitą ≥ 0.");
  if (previous && Number.isInteger(previous.atlasVersion) && a.atlasVersion <= previous.atlasVersion && !same(a, previous)) add("error", "S1", "ATLAS_VERSION_NOT_BUMPED", {}, "atlasVersion", "Zmieniony atlas wymaga nowego numeru wydania.");

  const count = (lvl) => issues.filter((i) => i.level === lvl).length;
  return {
    ok: count("error") === 0,
    summary: { errors: count("error"), warnings: count("warning"), infos: count("info"), exercises: exs.length, active: exs.filter((x) => x.status === "active").length, families: ctx.families.size },
    issues,
    derived,
  };
}
