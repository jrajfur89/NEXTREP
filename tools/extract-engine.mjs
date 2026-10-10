// F1.5 — ONE-OFF: moves the current progression engine (27 top-level names, pure functions and
// constants with no React, storage or Supabase) out of src/app/ into the real ES module
// src/engine/legacy-progression.js. Kept in the repo to document exactly what was done.
//
// Each declaration is moved verbatim, together with the comment lines directly above it, in its
// original order. The app imports the names back in 00-imports.jsx, so every other line of the app
// is unchanged. The engine must not use any app name (checked below); behaviour is proved by
// tests/unit/f1-engine-equivalence.test.mjs (old vs new build on random inputs).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";
import jsx from "acorn-jsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = resolve(root, "src/app");
const outFile = resolve(root, "src/engine/legacy-progression.js");
if (existsSync(outFile)) throw new Error("src/engine/legacy-progression.js exists — already extracted");

export const ENGINE_NAMES = [
  // 02-progression-core.jsx
  "toNumber", "parseRepRange", "parseRirBounds", "overallRepRange", "noteOverride", "avgOf",
  "computeSessionVolume", "PROGRESSION_MAX_PERFORMANCES", "PROGRESSION_LONG_BREAK_DAYS",
  "summarizePerformance", "sumTopK", "comparePerformances", "computeExerciseAnalysis",
  "exerciseHistoryBefore", "analyzeSessionExercise",
  // 14-analytics.jsx
  "MUSCLE_GROUPS", "CATEGORY_TO_MUSCLE_GROUP", "ATLAS_MUSCLE_GROUPS", "getExerciseMuscleGroups",
  "WORKLOAD_UNIT_BY_KIND", "computeMuscleGroupWorkload", "workloadMainUnit", "computeProgressSignal",
  "muscleGroupSessionPoints", "computeCategoryLastDelta", "getHistoricalBest",
  // 18-active-workout.jsx
  "findMatchingSessions",
];
const Parser = acorn.Parser.extend(jsx());
const parse = (code) => Parser.parse(code, { ecmaVersion: "latest", sourceType: "module", allowImportExportEverywhere: true });
const declName = (n) => (n.type === "FunctionDeclaration" ? n.id.name : n.type === "VariableDeclaration" && n.declarations.length === 1 ? n.declarations[0].id.name : null);
const isComment = (l) => /^(\/\/|\/\*| \*|\*\/)/.test(l);

const order = JSON.parse(readFileSync(resolve(appDir, "ORDER.json"), "utf8"));
const moved = [];
const found = new Set();
for (const file of order) {
  const path = resolve(appDir, file);
  let src = readFileSync(path, "utf8");
  const nodes = parse(src).body.filter((n) => ENGINE_NAMES.includes(declName(n)));
  if (!nodes.length) continue;
  const cuts = nodes.map((n) => {
    let start = src.lastIndexOf("\n", n.start - 1) + 1; // start of the declaration's line
    while (start > 0) {                                  // + comment lines directly above
      const prevStart = src.lastIndexOf("\n", start - 2) + 1;
      if (!isComment(src.slice(prevStart, start - 1))) break;
      start = prevStart;
    }
    let end = src.indexOf("\n", n.end);
    end = end < 0 ? src.length : end + 1;               // through the end of its last line
    if (src.slice(n.end, end).trim()) throw new Error(`${declName(n)}: code after the declaration on its last line`);
    return { name: declName(n), start, end };
  });
  for (const c of cuts) { found.add(c.name); moved.push({ file, ...c, text: src.slice(c.start, c.end) }); }
  for (const c of [...cuts].reverse()) src = src.slice(0, c.start) + src.slice(c.end);
  writeFileSync(path, src);
}
const missing = ENGINE_NAMES.filter((n) => !found.has(n));
if (missing.length) throw new Error(`not found: ${missing.join(", ")}`);

const body = moved.map((m) => m.text).join("\n");
const module =
  "// NEXTREP progression engine as it was at the finished S1 (a2b9ca0) — moved verbatim from the\n" +
  "// app script in F1.5 (tools/extract-engine.mjs). Pure functions and constants: no React, storage or\n" +
  "// Supabase. Progress Engine 2.0 (PE-A…PE-H) replaces these step by step; screens import from\n" +
  "// src/engine/index.js only.\n\n" +
  body + `\nexport {\n  ${ENGINE_NAMES.join(",\n  ")},\n};\n`;

// The engine must be self-contained: every free identifier is either its own or a JS global.
const ast = parse(module);
const own = new Set(ENGINE_NAMES);
const GLOBALS = new Set(["Math", "Number", "String", "Array", "Object", "JSON", "Date", "Set", "Map", "Boolean", "Infinity", "NaN", "isFinite", "isNaN", "parseFloat", "parseInt", "undefined", "console", "Symbol", "RegExp", "Error"]);
const free = new Set();
(function walk(node, scope) {
  if (!node || typeof node.type !== "string") return;
  if (node.type === "Identifier" && !own.has(node.name) && !GLOBALS.has(node.name)) free.add(node.name);
  for (const [k, v] of Object.entries(node)) {
    if (k === "loc" || k === "start" || k === "end") continue;
    if (Array.isArray(v)) v.forEach((x) => walk(x, scope)); else if (v && typeof v.type === "string") walk(v, scope);
  }
})(ast);
// free now also holds locals, params and property names; resolve against the app's top-level names
const appTop = new Set();
for (const f of order) for (const n of parse(readFileSync(resolve(appDir, f), "utf8")).body) { const d = declName(n); if (d) appTop.add(d); else if (n.type === "VariableDeclaration") n.declarations.forEach((x) => x.id.name && appTop.add(x.id.name)); }
const appRefs = [...free].filter((n) => appTop.has(n));
if (appRefs.length) throw new Error(`engine would use app names: ${appRefs.join(", ")}`);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, module);
writeFileSync(resolve(root, "src/engine/index.js"),
  "// Public interface of the NEXTREP engine. Screens import from here only (F1.5).\n" +
  'export * from "./legacy-progression.js";\n');
const importsPath = resolve(appDir, "00-imports.jsx");
const imp = readFileSync(importsPath, "utf8");
const line = `// F1.5 engine — the progression engine lives in src/engine/ (real ES module)\nimport {\n  ${ENGINE_NAMES.join(",\n  ")},\n} from "@nextrep-engine";\n`;
const END = "// F1.4 assets (end)\n";
if (!imp.includes(END)) throw new Error("00-imports.jsx: F1.4 block end not found");
writeFileSync(importsPath, imp.replace(END, END + line));
console.log(`[extract-engine] ${moved.length} declarations (${body.length} chars) → src/engine/legacy-progression.js`);
