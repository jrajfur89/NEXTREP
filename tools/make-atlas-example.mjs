// F2.2 — writes the EXAMPLE of a synthetic batch and its import report into docs/atlas/przyklad/.
// The batch is the synthetic test atlas (tests/fixtures/atlas/synthetic.mjs, every value marked
// TEST) with a few deliberate mistakes, so the report shows errors, warnings and information.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createTemplate, fillBatch, readBatch, checkBatch, writeReport, reportMarkdown } from "./atlas-xlsx.mjs";
import { emptyAtlas } from "../src/engine/atlas-schema.js";
import { baseAtlas, ex } from "../tests/fixtures/atlas/synthetic.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "docs/atlas/przyklad");
mkdirSync(out, { recursive: true });

const a = baseAtlas();
const exercises = a.exercises.map(({ entryRev, introducedIn, changedIn, ...e }) => e);
const byId = (id) => exercises.find((e) => e.exerciseId === id);
byId("test_press_bar").equipment = ["test.bar", "test.chain", "test.bench"]; // two load sources
byId("test_row_cable").namePl = "Testowe wiosłowanie na wyciągu 40 kg"; // working weight in the name
Object.assign(byId("test_pull_bw"), { laterality: "unilateral", repsCounting: "per_side" }); // side without attribute
byId("test_core_band").primaryMuscles = []; // no primary muscle
exercises.push(ex("test_press_bar_method", { namePl: "Testowa metoda 5x5", variantAttributes: ["test.grip.wide"], loadIncrementKg: null })); // warnings only

const wb = await createTemplate(ExcelJS);
fillBatch(wb, { exercises, families: a.families, dictionaries: a.dictionaries });
const batchPath = resolve(out, "partia-syntetyczna.xlsx");
await wb.xlsx.writeFile(batchPath);

const { batch, problems, workbook } = await readBatch(ExcelJS, batchPath);
const result = checkBatch(emptyAtlas(), batch, problems);
writeReport(workbook, result, { batchRows: batch.rows });
await workbook.xlsx.writeFile(resolve(out, "partia-syntetyczna.raport.xlsx"));
writeFileSync(resolve(out, "partia-syntetyczna.raport.md"), reportMarkdown(result, "Raport importu — partia syntetyczna (dane testowe)"));
console.log(`[make-atlas-example] ${result.summary.errors} errors, ${result.summary.warnings} warnings → docs/atlas/przyklad/`);
