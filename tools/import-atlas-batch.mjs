// F2.2 — checks one atlas batch (XLSX from the template) against the whole atlas.
//
//   node tools/import-atlas-batch.mjs <batch.xlsx> [--base <atlas.json>] [--report <out.xlsx>] [--md <out.md>] [--write]
//
// Default: REPORT ONLY. Reads the batch, merges it into a copy of the base atlas (default
// src/atlas/atlas.json), validates the result against the base release, saves a copy of the batch
// with the "Raport walidacji" sheet filled (default <batch>.raport.xlsx) and prints a summary.
// Nothing in the repository changes. With --write, and only if there are 0 errors, the merged atlas
// is written to the base file (to be used only after the report has been approved).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { readBatch, checkBatch, writeReport, reportMarkdown } from "./atlas-xlsx.mjs";
import { emptyAtlas } from "../src/engine/atlas-schema.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a, i) => !a.startsWith("--") && !["--base", "--report", "--md"].includes(args[i - 1]));
if (!file) {
  console.error("usage: node tools/import-atlas-batch.mjs <batch.xlsx> [--base atlas.json] [--report out.xlsx] [--md out.md] [--write]");
  process.exit(2);
}
const basePath = resolve(opt("--base") || resolve(root, "src/atlas/atlas.json"));
const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath, "utf8")) : emptyAtlas();
const { batch, problems, workbook } = await readBatch(ExcelJS, resolve(file));
const result = checkBatch(base, batch, problems);

const reportPath = resolve(opt("--report") || resolve(file).replace(/\.xlsx$/i, "") + ".raport.xlsx");
writeReport(workbook, result, { batchRows: batch.rows });
await workbook.xlsx.writeFile(reportPath);
const md = reportMarkdown(result);
if (opt("--md")) writeFileSync(resolve(opt("--md")), md);
console.log(md);
console.log(`Raport XLSX: ${reportPath}`);

if (args.includes("--write")) {
  if (!result.ok) {
    console.error("Nie zapisano atlasu: partia ma błędy.");
    process.exit(1);
  }
  writeFileSync(basePath, JSON.stringify(result.atlas, null, 2) + "\n");
  console.log(`Zapisano atlas (wydanie ${result.atlas.atlasVersion}): ${basePath}`);
}
process.exit(result.ok ? 0 : 1);
