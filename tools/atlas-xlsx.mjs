// F2.2 — the XLSX side of the atlas: the empty batch template, reading a filled batch, merging it
// into the atlas and writing the validation report back into a copy of the workbook.
// ExcelJS is passed in by the caller (the CLI tools use the root package, the tests their own),
// so this module has no package import of its own. Nothing here decides atlas content.
import {
  SCOPES, STATUSES, REPS_COUNTINGS, LATERALITIES, LOAD_MODEL_CODES, MEASUREMENT_TYPES, STATS_GROUPS, EQUIPMENT_ROLES,
  VARIANT_DIMENSIONS, CALC_FIELDS, CARD_CONTENT_FIELDS, CARD_CONTENT_LIMITS, emptyAtlas,
} from "../src/engine/atlas-schema.js";
import { validateAtlas } from "../src/engine/atlas-validate.js";

// Version 2 (B02/S4): the three card lists (AT3-D12 A) — one column per point, 10 per field, so a
// point may contain any character (semicolons, commas, quotes, line breaks) without a separator.
// Version 1 files (no card columns) are still read, explicitly: see readBatch / mergeBatch.
export const TEMPLATE_VERSION = "nextrep-atlas-batch-2";
export const LEGACY_TEMPLATE_VERSIONS = ["nextrep-atlas-batch-1"];
const FIRST_ROW = 3; // row 1: Polish header, row 2: technical key, data from row 3
const MAX_ROWS = 1000;
const FONT = { name: "Arial", size: 10 };
const FILL_INPUT = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }; // light yellow = fill in
const FILL_HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const FILL_KEY = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
const FILL_ERR = { type: "pattern", pattern: "solid", bgColor: { argb: "FFF8B4B4" }, fgColor: { argb: "FFF8B4B4" } };

const n = (k, max) => Array.from({ length: max }, (_, i) => `${k}_${i + 1}`);
// Sheet "Ćwiczenia": key, Polish header, width, list source (sheet!column) or validation, required
export const EXERCISE_COLUMNS = [
  { key: "exerciseId", label: "Identyfikator (exerciseId)", width: 26, required: true },
  { key: "namePl", label: "Pełna nazwa polska", width: 40, required: true },
  { key: "familyId", label: "Rodzina", width: 24, list: "Rodziny!$A$3:$A$1000", required: true },
  { key: "scope", label: "Zakres", width: 10, list: "tech:scope", required: true },
  { key: "status", label: "Status", width: 11, list: "tech:status", required: true },
  { key: "aliasesPl", label: "Aliasy (oddziel ;)", width: 30 },
  ...n("equipment", 4).map((k, i) => ({ key: k, label: `Sprzęt ${i + 1}`, width: 18, list: "'Słownik sprzętu'!$A$3:$A$1000" })),
  ...n("attribute", 4).map((k, i) => ({ key: k, label: `Cecha wariantu ${i + 1}`, width: 18, list: "'Słownik cech'!$A$3:$A$1000" })),
  ...n("primary", 4).map((k, i) => ({ key: k, label: `Mięsień główny ${i + 1}`, width: 18, list: "'Słownik mięśni'!$A$3:$A$1000", required: i === 0 })),
  ...n("secondary", 6).map((k, i) => ({ key: k, label: `Mięsień pomocniczy ${i + 1}`, width: 18, list: "'Słownik mięśni'!$A$3:$A$1000" })),
  { key: "measurementType", label: "Typ pomiaru (K2)", width: 16, list: "tech:measurementType", required: true },
  { key: "loadModel", label: "Model obciążenia (K2)", width: 18, list: "tech:loadModel", required: true },
  { key: "implements", label: "Liczba przyrządów (K2)", width: 12, list: "tech:implements" },
  { key: "laterality", label: "Lateralność (K2)", width: 14, list: "tech:laterality", required: true },
  { key: "repsCounting", label: "Liczenie powtórzeń (K2)", width: 14, list: "tech:repsCounting", required: true },
  { key: "loadIncrementKg", label: "Krok ciężaru kg (K2)", width: 12, decimal: true },
  { key: "tipsPl", label: "Wskazówki", width: 30 },
  { key: "videoUrl", label: "Wideo (https)", width: 24 },
  { key: "archivedReason", label: "Powód archiwizacji", width: 24 },
  { key: "successorHint", label: "Podpowiedź następcy", width: 22 },
  { key: "approvedIn", label: "Zatwierdzone w (partia / decyzja)", width: 20, required: true },
  { key: "correctionApprovedIn", label: "Poprawka błędu: zatwierdzona w", width: 20 },
  { key: "correctionNote", label: "Poprawka błędu: opis", width: 28 },
];
// v1 columns stay first and in place, so a v1 file and a v2 file agree on every common column
export const EXERCISE_COLUMNS_V1 = [...EXERCISE_COLUMNS];
const CARD_LABELS = { instructionsPl: "Instrukcja", commonMistakesPl: "Typowy błąd", safetyPl: "Bezpieczeństwo" };
export const CARD_COLUMNS = CARD_CONTENT_FIELDS.flatMap((f) => n(f, CARD_CONTENT_LIMITS.maxItems).map((k, i) => ({ key: k, label: `${CARD_LABELS[f]} — punkt ${i + 1}`, width: 36, text: true, required: i === 0 })));
EXERCISE_COLUMNS.push(...CARD_COLUMNS);
const SHEETS = {
  families: { name: "Rodziny", columns: [{ key: "familyId", label: "Identyfikator rodziny", width: 26 }, { key: "namePl", label: "Nazwa rodziny", width: 40 }, { key: "status", label: "Status", width: 11, list: "tech:status" }] },
  equipment: { name: "Słownik sprzętu", columns: [{ key: "code", label: "Kod", width: 22 }, { key: "labelPl", label: "Etykieta polska", width: 32 }, { key: "role", label: "Rola", width: 12, list: "tech:role" }, { key: "loadModels", label: "Dozwolone modele (oddziel ;)", width: 34 }, { key: "status", label: "Status", width: 11, list: "tech:status" }] },
  muscles: { name: "Słownik mięśni", columns: [{ key: "code", label: "Kod", width: 22 }, { key: "labelPl", label: "Etykieta polska", width: 32 }, { key: "statsGroup", label: "Grupa statystyk", width: 20, list: "tech:statsGroup" }, { key: "status", label: "Status", width: 11, list: "tech:status" }] },
  variantAttributes: { name: "Słownik cech", columns: [{ key: "code", label: "Kod", width: 22 }, { key: "labelPl", label: "Etykieta polska", width: 32 }, { key: "dimension", label: "Wymiar", width: 14, list: "tech:dimension" }, { key: "laterality", label: "Lateralność (dla wymiaru laterality)", width: 18, list: "tech:laterality" }, { key: "repsCounting", label: "Liczenie powtórzeń", width: 14, list: "tech:repsCounting" }, { key: "implements", label: "Liczba przyrządów (dla wymiaru implements)", width: 16, list: "tech:implements" }, { key: "status", label: "Status", width: 11, list: "tech:status" }] },
};
export const TECH_LISTS = {
  scope: SCOPES, status: STATUSES, measurementType: Object.keys(MEASUREMENT_TYPES), loadModel: LOAD_MODEL_CODES, implements: [1, 2],
  laterality: LATERALITIES, repsCounting: REPS_COUNTINGS, statsGroup: STATS_GROUPS, role: EQUIPMENT_ROLES, dimension: VARIANT_DIMENSIONS,
};
const TECH_SHEET = "Listy techniczne";
const REPORT_SHEET = "Raport walidacji";
const colLetter = (i) => { let s = ""; for (let x = i + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
function techRange(name) {
  const keys = Object.keys(TECH_LISTS);
  const c = colLetter(keys.indexOf(name));
  return `'${TECH_SHEET}'!$${c}$2:$${c}$${1 + TECH_LISTS[name].length}`;
}

function dataSheet(wb, name, columns, { inputFill = true } = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width;
    const h = ws.getCell(1, i + 1);
    h.value = c.label + (c.required ? " *" : "");
    h.font = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = FILL_HEAD;
    h.alignment = { wrapText: true, vertical: "middle" };
    const k = ws.getCell(2, i + 1);
    k.value = c.key;
    k.font = { ...FONT, size: 8, color: { argb: "FF6B7280" } };
    k.fill = FILL_KEY;
    const addr = `${colLetter(i)}${FIRST_ROW}:${colLetter(i)}${MAX_ROWS}`;
    if (c.list) {
      const formula = c.list.startsWith("tech:") ? techRange(c.list.slice(5)) : c.list;
      ws.dataValidations.add(addr, { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: "stop", errorTitle: "Wartość spoza słownika", error: "Wybierz wartość z listy (słowniki są zamknięte)." });
    }
    if (c.text) ws.getColumn(i + 1).alignment = { wrapText: true, vertical: "top" };
    if (c.decimal) ws.dataValidations.add(addr, { type: "decimal", operator: "greaterThan", allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: "Krok ciężaru", error: "Podaj liczbę większą od 0 (kg)." });
  });
  ws.getRow(1).height = 32;
  for (let r = FIRST_ROW; r <= 60; r++) for (let i = 0; i < columns.length; i++) {
    const cell = ws.getCell(r, i + 1);
    cell.font = FONT;
    if (inputFill) cell.fill = FILL_INPUT;
  }
  return ws;
}

// The empty template (dictionary sheets empty: the real dictionaries come from Standaryzacja).
export async function createTemplate(ExcelJS, { dictionaries = null } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "NEXTREP";
  wb.created = new Date("2026-10-11T00:00:00Z");
  const info = wb.addWorksheet("Instrukcja");
  info.getColumn(1).width = 38;
  info.getColumn(2).width = 100;
  const lines = [
    ["NEXTREP 1.0 — partia atlasu ćwiczeń", ""],
    ["Wersja szablonu", TEMPLATE_VERSION],
    ["", ""],
    ["Co wypełniasz", "Żółte komórki w zakładkach: Ćwiczenia, Rodziny, Słownik sprzętu, Słownik mięśni, Słownik cech. Jeden wiersz = jedno ćwiczenie / rodzina / wartość słownika. Pola z * są wymagane."],
    ["Czego nie zmieniasz", "Wiersz 2 (klucze techniczne), zakładka „Listy techniczne” (wartości silnika) i „Raport walidacji” (wypełnia narzędzie importu)."],
    ["Listy", "Pola słownikowe mają listy rozwijane. Słowniki są zamknięte: wartości spoza listy są odrzucane. Listy wielowartościowe (sprzęt, cechy, mięśnie) mają osobne kolumny 1…n. Aliasy oddziel średnikiem."],
    ["Pola techniczne (K2)", "Typ pomiaru, model obciążenia, liczba przyrządów, lateralność, liczenie powtórzeń, krok ciężaru: proponowane dla partii i zatwierdzane przed importem. Ciężar hantli wpisuje się na jeden hantel; liczba przyrządów mówi, ile hantli."],
    ["Karta ćwiczenia (AT3-D12 A)", "Instrukcja, typowe błędy, bezpieczeństwo: jedna komórka = jeden punkt, do 10 punktów na pole, każdy do 300 znaków. W komórce wolno użyć dowolnych znaków, także średnika i nowej linii (Alt+Enter). Ćwiczenie systemowe wymaga co najmniej jednego punktu w każdym polu."],
    ["Import", "node tools/import-atlas-batch.mjs <plik.xlsx> — sprawdza partię razem z całym atlasem i zapisuje kopię pliku z wypełnionym „Raportem walidacji”. Niczego nie zapisuje w atlasie. Zapis do src/atlas/atlas.json tylko z --write, po akceptacji raportu, i tylko gdy nie ma błędów."],
    ["", ""],
    ["Przykład formatu (NIE importowany)", "Wiersz poniżej pokazuje format na danych jawnie testowych; prawdziwe wiersze wpisuje się w zakładce „Ćwiczenia”."],
    ["exerciseId", "test_przyklad_wyciskanie"],
    ["namePl", "Testowe ćwiczenie przykładowe"],
    ["familyId", "test_rodzina_przykladowa"],
    ["scope / status", "system / active"],
    ["Sprzęt 1, Sprzęt 2", "test.hantle, test.lawka"],
    ["Cecha wariantu 1", "test.dwa_przyrzady"],
    ["Mięsień główny 1 / pomocniczy 1", "test.m.klatka / test.m.triceps"],
    ["Typ pomiaru / model / przyrządy", "weight_reps / dumbbell_pair / 2"],
    ["Lateralność / liczenie / krok kg", "bilateral / total / 2"],
    ["Zatwierdzone w", "test-partia-0"],
  ];
  lines.forEach(([a, b], i) => {
    const r = info.getRow(i + 1);
    r.getCell(1).value = a;
    r.getCell(2).value = b;
    r.getCell(1).font = { ...FONT, bold: true };
    r.getCell(2).font = FONT;
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  info.getCell("A1").font = { ...FONT, size: 14, bold: true };
  for (let i = 12; i <= 21; i++) info.getRow(i).getCell(2).font = { ...FONT, italic: true, color: { argb: "FF6B7280" } };

  const ex = dataSheet(wb, "Ćwiczenia", EXERCISE_COLUMNS);
  // highlight a missing required value once the row has an exerciseId
  EXERCISE_COLUMNS.forEach((c, i) => {
    if (!c.required || i === 0) return;
    const L = colLetter(i);
    ex.addConditionalFormatting({ ref: `${L}${FIRST_ROW}:${L}${MAX_ROWS}`, rules: [{ type: "expression", formulae: [`AND($A${FIRST_ROW}<>"",${L}${FIRST_ROW}="")`], style: { fill: FILL_ERR } }] });
  });
  for (const [kind, def] of Object.entries(SHEETS)) {
    const ws = dataSheet(wb, def.name, def.columns);
    if (dictionaries && kind !== "families" && Array.isArray(dictionaries[kind])) writeRows(ws, def.columns, dictionaries[kind]);
  }
  const tech = wb.addWorksheet(TECH_SHEET);
  Object.entries(TECH_LISTS).forEach(([k, values], i) => {
    tech.getColumn(i + 1).width = 18;
    const h = tech.getCell(1, i + 1);
    h.value = k;
    h.font = { ...FONT, bold: true };
    values.forEach((v, j) => { const c = tech.getCell(2 + j, i + 1); c.value = v; c.font = FONT; });
  });
  tech.state = "visible";
  const rep = wb.addWorksheet(REPORT_SHEET);
  ["Poziom", "Reguła", "Kod", "Rekord", "Pole", "Opis"].forEach((h, i) => {
    const c = rep.getCell(1, i + 1);
    c.value = h;
    c.font = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = FILL_HEAD;
    rep.getColumn(i + 1).width = [10, 8, 34, 28, 18, 90][i];
  });
  rep.getCell(2, 1).value = "Raport wypełnia narzędzie importu.";
  rep.getCell(2, 1).font = { ...FONT, italic: true, color: { argb: "FF6B7280" } };
  return wb;
}

function writeRows(ws, columns, rows) {
  rows.forEach((row, r) => columns.forEach((c, i) => {
    let v = row[c.key];
    if (Array.isArray(v)) v = v.join(";");
    if (v != null) ws.getCell(FIRST_ROW + r, i + 1).value = v;
  }));
}

// Exercises as rows of the "Ćwiczenia" sheet (for tests and for exporting a batch back to XLSX).
export function exerciseToRow(e) {
  const row = { ...e, aliasesPl: (e.aliasesPl || []).join(";") };
  const spread = (key, list, max) => n(key, max).forEach((k, i) => { row[k] = list && list[i] != null ? list[i] : null; });
  spread("equipment", e.equipment, 4);
  spread("attribute", e.variantAttributes, 4);
  spread("primary", e.primaryMuscles, 4);
  spread("secondary", e.secondaryMuscles, 6);
  row.correctionApprovedIn = e.correction ? e.correction.approvedIn : null;
  row.correctionNote = e.correction ? e.correction.note : null;
  for (const f of CARD_CONTENT_FIELDS) { spread(f, Array.isArray(e[f]) ? e[f] : null, CARD_CONTENT_LIMITS.maxItems); delete row[f]; }
  return row;
}
export function fillBatch(wb, { exercises = [], families = [], dictionaries = {} } = {}) {
  writeRows(wb.getWorksheet("Ćwiczenia"), EXERCISE_COLUMNS, exercises.map(exerciseToRow));
  writeRows(wb.getWorksheet(SHEETS.families.name), SHEETS.families.columns, families);
  for (const kind of ["equipment", "muscles", "variantAttributes"]) if (dictionaries[kind]) writeRows(wb.getWorksheet(SHEETS[kind].name), SHEETS[kind].columns, dictionaries[kind]);
  return wb;
}

// ---- reading a filled batch -------------------------------------------------------------------
const cellValue = (cell) => {
  let v = cell.value;
  if (v && typeof v === "object") {
    if ("result" in v) v = v.result; // formula
    else if (Array.isArray(v.richText)) v = v.richText.map((t) => t.text).join("");
    else if ("text" in v) v = v.text; // hyperlink
  }
  if (typeof v === "string") { v = v.trim(); if (v === "") v = null; }
  return v ?? null;
};
const toNumberOrRaw = (v) => {
  if (v == null || typeof v === "number") return v;
  const s = String(v).replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : v; // a non-number stays as text → the validator rejects it
};
const splitList = (v) => (v == null ? [] : String(v).split(";").map((x) => x.trim()).filter(Boolean));

function readSheet(ws, columns) {
  if (!ws) return { rows: [], problems: [] };
  const problems = [];
  const keys = columns.map((c, i) => cellValue(ws.getCell(2, i + 1)));
  columns.forEach((c, i) => { if (keys[i] !== c.key) problems.push({ code: "BATCH_TEMPLATE_CHANGED", message: `Zakładka „${ws.name}”: kolumna ${colLetter(i)} powinna mieć klucz ${c.key}, ma ${keys[i]}.` }); });
  const rows = [];
  for (let r = FIRST_ROW; r <= ws.rowCount; r++) {
    const row = {};
    columns.forEach((c, i) => { row[c.key] = cellValue(ws.getCell(r, i + 1)); });
    if (Object.values(row).every((v) => v == null)) continue;
    row.__row = r;
    rows.push(row);
  }
  return { rows, problems };
}

// `cardColumns: false` (a v1 file): the card fields are NOT in the file — they are left out of the
// record (not empty) and mergeBatch keeps the atlas content of an existing exercise.
// v2: the points of a field are its non-empty cells in column order; no point → the field is left
// out (for a system record the validator then reports CARD_CONTENT_REQUIRED).
export function rowToExercise(row, { cardColumns = true } = {}) {
  const list = (key, max) => n(key, max).map((k) => row[k]).filter((v) => v != null).map(String);
  const e = {
    exerciseId: row.exerciseId == null ? null : String(row.exerciseId),
    scope: row.scope, familyId: row.familyId, namePl: row.namePl == null ? null : String(row.namePl),
    aliasesPl: splitList(row.aliasesPl), variantAttributes: list("attribute", 4), equipment: list("equipment", 4),
    primaryMuscles: list("primary", 4), secondaryMuscles: list("secondary", 6),
    measurementType: row.measurementType, loadModel: row.loadModel, implements: toNumberOrRaw(row.implements),
    laterality: row.laterality, repsCounting: row.repsCounting, loadIncrementKg: toNumberOrRaw(row.loadIncrementKg),
    tipsPl: row.tipsPl, videoUrl: row.videoUrl, status: row.status, archivedReason: row.archivedReason,
    successorHint: row.successorHint, approvedIn: row.approvedIn == null ? null : String(row.approvedIn),
    correction: row.correctionApprovedIn || row.correctionNote ? { approvedIn: row.correctionApprovedIn, note: row.correctionNote } : null,
  };
  if (cardColumns) for (const f of CARD_CONTENT_FIELDS) {
    const points = list(f, CARD_CONTENT_LIMITS.maxItems);
    if (points.length) e[f] = points;
  }
  return e;
}

export async function readBatch(ExcelJS, file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const problems = [];
  const version = wb.getWorksheet("Instrukcja") && cellValue(wb.getWorksheet("Instrukcja").getCell("B2"));
  const legacy = LEGACY_TEMPLATE_VERSIONS.includes(version);
  if (version !== TEMPLATE_VERSION && !legacy) problems.push({ code: "BATCH_TEMPLATE_VERSION", message: `Plik nie jest szablonem ${TEMPLATE_VERSION} (ma: ${version ?? "brak"}).` });
  const exRead = readSheet(wb.getWorksheet("Ćwiczenia"), legacy ? EXERCISE_COLUMNS_V1 : EXERCISE_COLUMNS);
  problems.push(...exRead.problems);
  // B02/S4: a v1 file has no card columns — read explicitly, never filled with invented content
  const batch = { exercises: [], families: [], dictionaries: {}, rows: {}, templateVersion: version ?? null, cardColumns: !legacy, notices: [] };
  if (legacy) batch.notices.push({ code: "BATCH_TEMPLATE_V1_NO_CARDS", message: `Plik w starszej wersji szablonu (${version}) nie ma kolumn karty ćwiczenia: istniejące ćwiczenia zachowują treść karty z atlasu, nowe ćwiczenia systemowe zostaną odrzucone bez karty (CARD_CONTENT_REQUIRED).` });
  for (const row of exRead.rows) {
    const e = rowToExercise(row, { cardColumns: !legacy });
    batch.exercises.push(e);
    batch.rows[e.exerciseId] = row.__row;
  }
  const famRead = readSheet(wb.getWorksheet(SHEETS.families.name), SHEETS.families.columns);
  problems.push(...famRead.problems);
  batch.families = famRead.rows.map(({ __row, ...f }) => f);
  for (const kind of ["equipment", "muscles", "variantAttributes"]) {
    const d = readSheet(wb.getWorksheet(SHEETS[kind].name), SHEETS[kind].columns);
    problems.push(...d.problems);
    batch.dictionaries[kind] = d.rows.map(({ __row, ...v }) => {
      const out = { ...v };
      if (kind === "equipment") out.loadModels = splitList(v.loadModels);
      if (kind === "variantAttributes") {
        out.implements = toNumberOrRaw(v.implements);
        for (const k of ["laterality", "repsCounting", "implements"]) if (out[k] == null) delete out[k];
      }
      return out;
    });
  }
  const seen = new Set();
  for (const e of batch.exercises) {
    if (e.exerciseId && seen.has(e.exerciseId)) problems.push({ code: "BATCH_DUPLICATE_ROW", message: `Identyfikator ${e.exerciseId} występuje w partii więcej niż raz.`, exerciseId: e.exerciseId });
    seen.add(e.exerciseId);
  }
  return { batch, problems, workbook: wb };
}

// ---- merging into the atlas --------------------------------------------------------------------
// key order does not matter (rows from the sheet and records from JSON list fields differently)
const canonical = (x) => (Array.isArray(x) ? x.map(canonical) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canonical(x[k])])) : x ?? null);
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function mergeBatch(base, batch) {
  const atlas = JSON.parse(JSON.stringify(base || emptyAtlas()));
  const nextVersion = (atlas.atlasVersion || 0) + 1;
  const changes = { added: [], changed: [], unchanged: [], families: 0, dictionary: 0, cardContentKept: [] };
  for (const kind of ["equipment", "muscles", "variantAttributes"]) {
    const list = atlas.dictionaries[kind] || (atlas.dictionaries[kind] = []);
    for (const v of (batch.dictionaries && batch.dictionaries[kind]) || []) {
      const i = list.findIndex((x) => x.code === v.code);
      if (i < 0) list.push(v);
      else if (!same(list[i], v)) list[i] = v;
      else continue;
      changes.dictionary++;
    }
  }
  for (const f of batch.families || []) {
    const i = atlas.families.findIndex((x) => x.familyId === f.familyId);
    if (i < 0) atlas.families.push(f);
    else if (!same(atlas.families[i], f)) atlas.families[i] = f;
    else continue;
    changes.families++;
  }
  for (const e of batch.exercises || []) {
    const i = atlas.exercises.findIndex((x) => x.exerciseId === e.exerciseId);
    if (i < 0) {
      atlas.exercises.push({ ...e, entryRev: 1, introducedIn: nextVersion, changedIn: nextVersion });
      if (e.exerciseId && !atlas.issuedIds.includes(e.exerciseId)) atlas.issuedIds.push(e.exerciseId);
      changes.added.push(e.exerciseId);
      continue;
    }
    const prev = atlas.exercises[i];
    const keep = { entryRev: prev.entryRev, introducedIn: prev.introducedIn, changedIn: prev.changedIn };
    // a v1 file says nothing about the card: the atlas content stays (never deleted, never invented)
    if (batch.cardColumns === false) {
      let kept = false;
      for (const f of CARD_CONTENT_FIELDS) if (!(f in e) && prev[f] !== undefined) { keep[f] = prev[f]; kept = true; }
      if (kept) changes.cardContentKept.push(e.exerciseId);
    }
    const next = { ...e, ...keep };
    if (same(next, prev)) { changes.unchanged.push(e.exerciseId); continue; }
    const calc = CALC_FIELDS.some((f) => !same(next[f], prev[f]));
    const merged = { ...next, entryRev: calc ? prev.entryRev + 1 : prev.entryRev, changedIn: nextVersion };
    // the record keeps its key order (new fields last), so the atlas diff shows only real changes
    atlas.exercises[i] = Object.fromEntries([...Object.keys(prev).filter((k) => k in merged), ...Object.keys(merged).filter((k) => !(k in prev))].map((k) => [k, merged[k]]));
    changes.changed.push(e.exerciseId);
  }
  const anything = changes.added.length + changes.changed.length + changes.families + changes.dictionary > 0;
  if (anything) atlas.atlasVersion = nextVersion;
  return { atlas, changes };
}

// One call: batch problems + full validation of the merged atlas against the base release.
export function checkBatch(base, batch, problems = []) {
  const { atlas, changes } = mergeBatch(base, batch);
  const report = validateAtlas(atlas, { previous: base && base.atlasVersion > 0 ? base : null });
  const batchIssues = problems.map((p) => ({ level: "error", rule: "B", code: p.code, exerciseId: p.exerciseId ?? null, field: null, message: p.message }));
  const batchNotices = (batch.notices || []).map((p) => ({ level: "info", rule: "B", code: p.code, exerciseId: null, field: null, message: p.message }));
  const issues = [...batchIssues, ...batchNotices, ...report.issues];
  const errors = issues.filter((i) => i.level === "error").length;
  return {
    ok: errors === 0,
    atlas,
    changes,
    summary: { ...report.summary, errors, batchProblems: batchIssues.length, atlasVersion: atlas.atlasVersion },
    issues,
    derived: report.derived,
  };
}

// Writes the report into the "Raport walidacji" sheet of the batch workbook (a copy is saved by the CLI).
export function writeReport(wb, result, { batchRows = {} } = {}) {
  let ws = wb.getWorksheet(REPORT_SHEET);
  if (ws) wb.removeWorksheet(ws.id);
  ws = wb.addWorksheet(REPORT_SHEET);
  const head = (r, values, bold = false) => values.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.font = { ...FONT, bold }; });
  ws.getCell("A1").value = result.ok ? "WYNIK: partia gotowa do importu (0 błędów)" : `WYNIK: import zablokowany — błędów: ${result.summary.errors}`;
  ws.getCell("A1").font = { ...FONT, size: 12, bold: true, color: { argb: result.ok ? "FF15803D" : "FFB91C1C" } };
  head(2, [`Ćwiczenia w atlasie: ${result.summary.exercises}`, `Nowe: ${result.changes.added.length}`, `Zmienione: ${result.changes.changed.length}`, `Bez zmian: ${result.changes.unchanged.length}`, `Ostrzeżenia: ${result.summary.warnings}`, `Wydanie atlasu po imporcie: ${result.summary.atlasVersion}`]);
  head(4, ["Poziom", "Reguła", "Kod", "Rekord", "Pole", "Opis", "Wiersz w „Ćwiczenia”"], true);
  const order = { error: 0, warning: 1, info: 2 };
  const LEVEL = { error: "błąd", warning: "ostrzeżenie", info: "informacja" };
  const fill = { error: "FFFDE2E2", warning: "FFFEF3C7", info: "FFE0F2FE" };
  [...result.issues].sort((a, b) => order[a.level] - order[b.level]).forEach((i, k) => {
    const record = i.exerciseId || i.familyId || (i.dictionary ? `${i.dictionary}:${i.value}` : "atlas");
    const row = 5 + k;
    head(row, [LEVEL[i.level], i.rule, i.code, record, i.field || "", i.message, batchRows[i.exerciseId] || ""]);
    for (let c = 1; c <= 7; c++) ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill[i.level] } };
  });
  [12, 8, 36, 30, 18, 90, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  return wb;
}

// Markdown summary for the console / a report file.
export function reportMarkdown(result, title = "Raport importu partii atlasu") {
  const L = { error: "błąd", warning: "ostrzeżenie", info: "informacja" };
  const lines = [
    `# ${title}`, "",
    `**Wynik:** ${result.ok ? "gotowa do importu (0 błędów)" : `import zablokowany (błędów: ${result.summary.errors})`}`, "",
    `| Ćwiczenia w atlasie | Nowe | Zmienione | Bez zmian | Błędy | Ostrzeżenia | Wydanie po imporcie |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    `| ${result.summary.exercises} | ${result.changes.added.length} | ${result.changes.changed.length} | ${result.changes.unchanged.length} | ${result.summary.errors} | ${result.summary.warnings} | ${result.summary.atlasVersion} |`, "",
  ];
  if (result.issues.length) {
    lines.push("| Poziom | Reguła | Kod | Rekord | Pole | Opis |", "| --- | --- | --- | --- | --- | --- |");
    const order = { error: 0, warning: 1, info: 2 };
    for (const i of [...result.issues].sort((a, b) => order[a.level] - order[b.level])) lines.push(`| ${L[i.level]} | ${i.rule} | ${i.code} | ${i.exerciseId || i.familyId || (i.dictionary ? `${i.dictionary}:${i.value}` : "atlas")} | ${i.field || ""} | ${String(i.message).replace(/\|/g, "/")} |`);
  }
  return lines.join("\n") + "\n";
}
