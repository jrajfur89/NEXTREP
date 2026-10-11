// PE-A (A2) — generates LEGACY_ATLAS_MODELS in src/engine/load-legacy-map.js from today's built-in
// exercises (DEFAULT_EXERCISES in src/app/10-atlas-templates.jsx). Re-runnable; `--check` only
// verifies that the committed map is what this tool produces (used by the tests).
//
// Each built-in exercise gets the model that the equipment rules infer (inferLoadModel), unless it
// is listed in EXCEPTIONS below — the cases the equipment alone cannot tell (one dumbbell, reps per
// side, alternating sides, plates on a machine). Transitional: the F2 atlas assigns the final
// loadModel / laterality / repsCounting for its own exercises (decision of 11.10.2026).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "src/engine/load-legacy-map.js");

export const EXCEPTIONS = {
  db_row_single_arm: { loadModel: "dumbbell_single", laterality: "unilateral" }, // one dumbbell, reps per side
  bulgarian_split_squat_db: { loadModel: "dumbbell_pair", laterality: "unilateral" }, // two dumbbells, reps per leg
  db_lunge: { loadModel: "dumbbell_pair", laterality: "alternating" }, // two dumbbells, reps in total
  leg_press: { loadModel: "plate_loaded" }, // plates, not a stack (same arithmetic)
  dead_bug: { laterality: "alternating" },
  bird_dog: { laterality: "alternating" },
};

// acorn is loaded lazily: the tests pass the exercises themselves and run without root packages
export async function readDefaultExercises() {
  const { Parser } = await import("acorn");
  const { default: jsx } = await import("acorn-jsx");
  const src = readFileSync(resolve(root, "src/app/10-atlas-templates.jsx"), "utf8");
  const ast = Parser.extend(jsx()).parse(src, { ecmaVersion: "latest", sourceType: "module" });
  const decl = ast.body.find((n) => n.type === "VariableDeclaration" && n.declarations[0].id.name === "DEFAULT_EXERCISES");
  if (!decl) throw new Error("DEFAULT_EXERCISES not found");
  const init = decl.declarations[0].init;
  // the array is a plain data literal (strings, numbers, booleans, arrays, objects)
  return Function(`"use strict"; return (${src.slice(init.start, init.end)});`)();
}

export async function generate(exercises = null) {
  const { inferLoadModel, legacyEquipmentKey } = await import(pathToFileURL(target).href);
  const lines = [];
  for (const ex of exercises || (await readDefaultExercises())) {
    const inferred = inferLoadModel(ex);
    const e = EXCEPTIONS[ex.id] || {};
    const loadModel = e.loadModel || inferred.loadModel;
    const laterality = e.laterality || inferred.laterality;
    if (loadModel === "external_unknown") throw new Error(`${ex.id}: no model — add it to EXCEPTIONS`);
    lines.push(`  ${ex.id}: { key: ${JSON.stringify(legacyEquipmentKey(ex))}, loadModel: "${loadModel}", laterality: "${laterality}" },`);
  }
  for (const id of Object.keys(EXCEPTIONS)) if (!lines.some((l) => l.startsWith(`  ${id}:`))) throw new Error(`exception for unknown id ${id}`);
  return `// BEGIN LEGACY_ATLAS_MODELS\nexport const LEGACY_ATLAS_MODELS = {\n${lines.join("\n")}\n};\n// END LEGACY_ATLAS_MODELS`;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const block = await generate();
  const src = readFileSync(target, "utf8");
  const current = src.slice(src.indexOf("// BEGIN LEGACY_ATLAS_MODELS"), src.indexOf("// END LEGACY_ATLAS_MODELS") + "// END LEGACY_ATLAS_MODELS".length);
  if (process.argv.includes("--check")) {
    console.log(current === block ? "OK   LEGACY_ATLAS_MODELS is up to date" : "FAIL LEGACY_ATLAS_MODELS differs — run node tools/gen-legacy-load-map.mjs");
    process.exit(current === block ? 0 : 1);
  }
  writeFileSync(target, src.replace(current, block));
  console.log(`[gen-legacy-load-map] ${block.split("\n").length - 4} exercises → src/engine/load-legacy-map.js`);
}
