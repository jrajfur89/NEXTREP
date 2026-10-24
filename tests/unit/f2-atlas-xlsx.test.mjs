// F2.2 — atlas batch template (XLSX), reading a batch, merging, the validation report.
// SYNTHETIC data only (tests/fixtures/atlas/synthetic.mjs). ExcelJS comes from tests/ packages.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { createTemplate, fillBatch, readBatch, checkBatch, mergeBatch, writeReport, reportMarkdown, EXERCISE_COLUMNS, TECH_LISTS, TEMPLATE_VERSION } from "../../tools/atlas-xlsx.mjs";
import { emptyAtlas, LOAD_MODEL_CODES, STATS_GROUPS } from "../../src/engine/atlas-schema.js";
import { baseAtlas, ex, clone } from "../fixtures/atlas/synthetic.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "nextrep-atlas-")); });
after(() => rmSync(dir, { recursive: true, force: true }));
async function batchFile(name, content) {
  const wb = await createTemplate(ExcelJS);
  fillBatch(wb, content);
  const p = join(dir, name);
  await wb.xlsx.writeFile(p);
  return p;
}
const firstBatch = () => { const a = baseAtlas(); return { exercises: a.exercises.map(({ entryRev, introducedIn, changedIn, ...e }) => e), families: a.families, dictionaries: a.dictionaries }; };

describe("the empty template", () => {
  test("sheets, headers, technical keys, technical lists = engine values, empty dictionaries", async () => {
    const p = join(dir, "template.xlsx");
    await (await createTemplate(ExcelJS)).xlsx.writeFile(p);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(p);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ["Instrukcja", "Ćwiczenia", "Rodziny", "Słownik sprzętu", "Słownik mięśni", "Słownik cech", "Listy techniczne", "Raport walidacji"]);
    assert.equal(wb.getWorksheet("Instrukcja").getCell("B2").value, TEMPLATE_VERSION);
    const exs = wb.getWorksheet("Ćwiczenia");
    EXERCISE_COLUMNS.forEach((c, i) => assert.equal(exs.getCell(2, i + 1).value, c.key));
    const tech = wb.getWorksheet("Listy techniczne");
    Object.entries(TECH_LISTS).forEach(([k, values], i) => {
      assert.equal(tech.getCell(1, i + 1).value, k);
      values.forEach((v, j) => assert.equal(tech.getCell(2 + j, i + 1).value, v));
    });
    assert.deepEqual(TECH_LISTS.loadModel, LOAD_MODEL_CODES);
    assert.deepEqual(TECH_LISTS.statsGroup, STATS_GROUPS);
    for (const s of ["Słownik sprzętu", "Słownik mięśni", "Słownik cech", "Rodziny", "Ćwiczenia"]) assert.equal(wb.getWorksheet(s).getCell(3, 1).value, null, `${s} is empty`);
  });
  test("every dictionary / technical column has a closed drop-down list; the increment accepts only kg > 0", async () => {
    const wb = await createTemplate(ExcelJS);
    const dv = wb.getWorksheet("Ćwiczenia").dataValidations.model;
    const letter = (i) => { let s = ""; for (let x = i + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
    EXERCISE_COLUMNS.forEach((c, i) => {
      const rule = dv[`${letter(i)}3:${letter(i)}1000`];
      if (c.list) assert.equal(rule && rule.type, "list", c.key);
      if (c.list) assert.equal(rule.errorStyle, "stop", c.key);
      if (c.decimal) assert.equal(rule && rule.type, "decimal", c.key);
      if (!c.list && !c.decimal) assert.equal(rule, undefined, c.key);
    });
  });
  test("an empty template reads as an empty batch with no problems", async () => {
    const p = join(dir, "empty.xlsx");
    await (await createTemplate(ExcelJS)).xlsx.writeFile(p);
    const { batch, problems } = await readBatch(ExcelJS, p);
    assert.deepEqual([batch.exercises.length, batch.families.length, problems], [0, 0, []]);
    const r = checkBatch(emptyAtlas(), batch, problems);
    assert.deepEqual([r.ok, r.summary.atlasVersion], [true, 0]); // nothing changed → no new release
  });
});

describe("a synthetic batch through the whole path", () => {
  test("first batch: XLSX → batch → merged atlas equals the synthetic atlas, release 1, 0 errors", async () => {
    const p = await batchFile("batch1.xlsx", firstBatch());
    const { batch, problems } = await readBatch(ExcelJS, p);
    assert.deepEqual(problems, []);
    const r = checkBatch(emptyAtlas(), batch, problems);
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
    assert.equal(r.atlas.atlasVersion, 1);
    assert.equal(r.changes.added.length, 10);
    const want = baseAtlas();
    const norm = (e) => JSON.parse(JSON.stringify(e, Object.keys(e).sort()));
    for (const e of want.exercises) assert.deepEqual(norm(r.atlas.exercises.find((x) => x.exerciseId === e.exerciseId)), norm(e), e.exerciseId);
    assert.deepEqual(r.atlas.issuedIds.sort(), want.issuedIds.sort());
    assert.deepEqual(r.atlas.dictionaries, want.dictionaries);
  });
  test("Polish decimals and numbers typed as text are read as numbers; text stays text and is rejected", async () => {
    const b = firstBatch();
    b.exercises[0].loadIncrementKg = "2,5";
    b.exercises[1].implements = "2";
    b.exercises[2].loadIncrementKg = "dużo";
    const { batch, problems } = await readBatch(ExcelJS, await batchFile("numbers.xlsx", b));
    assert.equal(batch.exercises[0].loadIncrementKg, 2.5);
    assert.equal(batch.exercises[1].implements, 2);
    const r = checkBatch(emptyAtlas(), batch, problems);
    assert.ok(r.issues.some((i) => i.code === "LOAD_INCREMENT_INVALID" && i.exerciseId === batch.exercises[2].exerciseId));
  });
  test("a second batch: tips change keeps entryRev; a muscle change raises it; release 2", () => {
    const base = checkBatch(emptyAtlas(), firstBatch()).atlas;
    const b = { exercises: [{ ...base.exercises[0], tipsPl: "Testowa wskazówka" }, { ...base.exercises[1], primaryMuscles: ["test.m.chest_b"] }] };
    const r = checkBatch(base, b);
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
    assert.equal(r.atlas.atlasVersion, 2);
    assert.deepEqual([r.atlas.exercises[0].entryRev, r.atlas.exercises[1].entryRev], [1, 2]);
    assert.deepEqual([r.atlas.exercises[0].changedIn, r.atlas.exercises[1].changedIn, r.atlas.exercises[2].changedIn], [2, 2, 1]);
    assert.equal(r.atlas.exercises.length, 10); // rows absent from a batch are kept, never deleted
  });
  test("a second batch changing the load interpretation is blocked unless it is an approved correction", () => {
    const base = checkBatch(emptyAtlas(), firstBatch()).atlas;
    const cable = base.exercises.find((e) => e.exerciseId === "test_row_cable");
    const changed = { ...cable, variantAttributes: ["test.side.one"], laterality: "unilateral", repsCounting: "per_side" };
    const blocked = checkBatch(base, { exercises: [changed] });
    assert.equal(blocked.ok, false);
    assert.ok(blocked.issues.some((i) => i.code === "LOAD_INTERPRETATION_CHANGED"));
    const approved = checkBatch(base, { exercises: [{ ...changed, correction: { approvedIn: "test-decision-1", note: "Testowa poprawka" } }] });
    assert.equal(approved.ok, true, JSON.stringify(approved.issues.filter((i) => i.level === "error")));
    assert.ok(approved.issues.some((i) => i.code === "CORRECTION_APPLIED"));
    assert.equal(approved.atlas.exercises.find((e) => e.exerciseId === "test_row_cable").entryRev, 2);
  });
  test("merging never mutates the base atlas or the batch", () => {
    const base = baseAtlas();
    const b = firstBatch();
    const [b0, base0] = [clone(b), clone(base)];
    mergeBatch(base, b);
    assert.deepEqual([b, base], [b0, base0]);
  });
});

describe("batch problems and the report", () => {
  test("duplicate rows, a changed template and a foreign file are reported as batch errors", async () => {
    const b = firstBatch();
    b.exercises.push({ ...b.exercises[0] });
    const p = await batchFile("dup.xlsx", b);
    const { problems } = await readBatch(ExcelJS, p);
    assert.ok(problems.some((x) => x.code === "BATCH_DUPLICATE_ROW"));
    const wb = await createTemplate(ExcelJS);
    wb.getWorksheet("Ćwiczenia").getCell(2, 2).value = "nazwa";
    wb.getWorksheet("Instrukcja").getCell("B2").value = "inny-szablon";
    const p2 = join(dir, "changed.xlsx");
    await wb.xlsx.writeFile(p2);
    const r2 = await readBatch(ExcelJS, p2);
    assert.ok(r2.problems.some((x) => x.code === "BATCH_TEMPLATE_CHANGED"));
    assert.ok(r2.problems.some((x) => x.code === "BATCH_TEMPLATE_VERSION"));
    assert.equal(checkBatch(emptyAtlas(), r2.batch, r2.problems).ok, false);
  });
  test("the report sheet lists every issue with its level, rule, code, record and sheet row", async () => {
    const b = firstBatch();
    b.exercises[0].equipment = ["test.bar", "test.chain", "test.bench"]; // MULTIPLE_LOAD_SOURCES_UNSUPPORTED
    b.exercises[1].namePl = "Testowe wyciskanie 60 kg"; // NAME_CONTAINS_WORKING_WEIGHT
    const p = await batchFile("errors.xlsx", b);
    const { batch, problems, workbook } = await readBatch(ExcelJS, p);
    const r = checkBatch(emptyAtlas(), batch, problems);
    assert.equal(r.ok, false);
    writeReport(workbook, r, { batchRows: batch.rows });
    const out = join(dir, "errors.raport.xlsx");
    await workbook.xlsx.writeFile(out);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    const rep = wb.getWorksheet("Raport walidacji");
    assert.match(String(rep.getCell("A1").value), /zablokowany/);
    const rows = [];
    for (let i = 5; i <= rep.rowCount; i++) rows.push([1, 2, 3, 4, 5, 6, 7].map((c) => rep.getCell(i, c).value));
    const multi = rows.find((x) => x[2] === "MULTIPLE_LOAD_SOURCES_UNSUPPORTED");
    assert.deepEqual([multi[0], multi[1], multi[3], multi[6]], ["błąd", "V5", "test_press_bar", 3]);
    assert.ok(rows.some((x) => x[2] === "NAME_CONTAINS_WORKING_WEIGHT" && x[6] === 4));
    assert.equal(rows.length, r.issues.length);
    assert.match(reportMarkdown(r), /MULTIPLE_LOAD_SOURCES_UNSUPPORTED/);
    // the rest of the workbook is unchanged
    assert.equal(wb.getWorksheet("Ćwiczenia").getCell(3, 1).value, "test_press_bar");
  });
});

describe("command-line tools (need the root packages; skipped where only tests/ is installed)", () => {
  const hasRoot = existsSync(join(root, "node_modules/exceljs"));
  test("import-atlas-batch: report only by default, --write only without errors", { skip: !hasRoot && "root packages not installed" }, async () => {
    // An independent empty atlas (release 0): the importer is tested on its own base, not on the
    // repository atlas, whose release grows with every approved batch.
    const base = join(dir, "atlas.json");
    writeFileSync(base, JSON.stringify(emptyAtlas(), null, 2) + "\n");
    const repoAtlasBefore = readFileSync(join(root, "src/atlas/atlas.json"), "utf8");
    const bad = await batchFile("cli-bad.xlsx", { ...firstBatch(), exercises: firstBatch().exercises.map((e, i) => (i === 0 ? { ...e, primaryMuscles: [] } : e)) });
    let code = 0;
    try { execFileSync(process.execPath, [join(root, "tools/import-atlas-batch.mjs"), bad, "--base", base, "--write"], { stdio: "pipe" }); } catch (e) { code = e.status; }
    assert.equal(code, 1);
    assert.equal(JSON.parse(readFileSync(base, "utf8")).atlasVersion, 0, "atlas not written on errors");
    assert.ok(existsSync(bad.replace(/\.xlsx$/, ".raport.xlsx")));
    const good = await batchFile("cli-good.xlsx", firstBatch());
    execFileSync(process.execPath, [join(root, "tools/import-atlas-batch.mjs"), good, "--base", base], { stdio: "pipe" });
    assert.equal(JSON.parse(readFileSync(base, "utf8")).atlasVersion, 0, "report-only by default");
    execFileSync(process.execPath, [join(root, "tools/import-atlas-batch.mjs"), good, "--base", base, "--write"], { stdio: "pipe" });
    assert.equal(JSON.parse(readFileSync(base, "utf8")).atlasVersion, 1);
    assert.equal(readFileSync(join(root, "src/atlas/atlas.json"), "utf8"), repoAtlasBefore, "the repository atlas is never touched by the importer test");
  });
});

describe("the repository atlas", () => {
  test("src/atlas/atlas.json is valid: 0 validator errors, format 1, approved release number", async () => {
    const a = JSON.parse(readFileSync(join(root, "src/atlas/atlas.json"), "utf8"));
    assert.equal(a.formatVersion, emptyAtlas().formatVersion);
    assert.ok(Number.isInteger(a.atlasVersion) && a.atlasVersion >= 0, "atlasVersion is a non-negative integer");
    const { validateAtlas } = await import("../../src/engine/atlas-validate.js");
    const r = validateAtlas(a);
    assert.deepEqual(r.issues.filter((i) => i.level === "error").map((i) => i.code), []);
    assert.equal(r.ok, true);
  });
  test("exercises and issuedIds agree: unique ids, every exercise issued, every issued id still present", () => {
    const a = JSON.parse(readFileSync(join(root, "src/atlas/atlas.json"), "utf8"));
    const exerciseIds = a.exercises.map((e) => e.exerciseId);
    assert.equal(new Set(exerciseIds).size, exerciseIds.length, "exerciseId unique");
    assert.equal(new Set(a.issuedIds).size, a.issuedIds.length, "issuedIds unique");
    assert.deepEqual([...exerciseIds].sort(), [...a.issuedIds].sort(), "issued ids = exercises (ids are archived, never removed)");
    const familyIds = a.families.map((f) => f.familyId);
    assert.equal(new Set(familyIds).size, familyIds.length, "familyId unique");
  });
  test("no synthetic identifiers (test_ / test.) anywhere in the repository atlas", () => {
    const a = JSON.parse(readFileSync(join(root, "src/atlas/atlas.json"), "utf8"));
    const d = a.dictionaries;
    const ids = [...a.exercises.map((e) => e.exerciseId), ...a.issuedIds, ...a.families.map((f) => f.familyId), ...[...d.equipment, ...d.muscles, ...d.variantAttributes].map((v) => v.code)];
    assert.deepEqual(ids.filter((id) => /^test[._]/.test(id)), []);
  });
  test("no synthetic test code leaks into the repository atlas; the app reads the atlas only through the AT2 catalog", () => {
    assert.doesNotMatch(readFileSync(join(root, "src/atlas/atlas.json"), "utf8"), /test[._]/);
    const grep = (patterns, paths) => {
      try {
        return execFileSync("git", ["grep", "--untracked", "-l", ...patterns.flatMap((p) => ["-e", p]), "--", ...paths], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean).sort();
      } catch {
        return []; // git grep exits 1 when nothing matches
      }
    };
    // AT2: atlas.json enters the app through one engine module only (the nr1 build reads it separately)
    assert.deepEqual(grep(["atlas.json", "src/atlas"], ["src/app", "src/engine"]), ["src/engine/atlas-release.js"]);
    // the app does not use the validator, the hierarchy or the muscle statistics yet (later stages)
    assert.deepEqual(grep(["atlas-validate", "muscle-work", "muscle-stats", "hierarchy", "navigation.json"], ["src/app", "src/engine/index.js"]), []);
    // I3: the snapshot module reaches the app only through the engine entry (validateLoadSnapshot) and
    // the nr1 builder; no app file names it
    assert.deepEqual(grep(["load-snapshot"], ["src/app", "src/engine/index.js"]), ["src/engine/index.js"]);
    // the engine entry exposes only the read-only release on top of the old engine
    assert.deepEqual(grep(["atlas-release"], ["src/engine/index.js"]), ["src/engine/index.js"]);
  });
});
