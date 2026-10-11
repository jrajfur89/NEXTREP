// F2.2 — writes the EMPTY atlas batch template (XLSX): lists, required-field highlighting, the
// technical lists of the engine and an empty validation report sheet. Dictionary sheets are empty —
// the real equipment and muscle dictionaries come from the approved Standaryzacja batches.
//   node tools/make-atlas-template.mjs [out.xlsx]      (default docs/atlas/nextrep-atlas-batch-template.xlsx)
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createTemplate } from "./atlas-xlsx.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] || resolve(root, "docs/atlas/nextrep-atlas-batch-template.xlsx"));
mkdirSync(dirname(out), { recursive: true });
const wb = await createTemplate(ExcelJS);
await wb.xlsx.writeFile(out);
console.log(`[make-atlas-template] ${out}`);
