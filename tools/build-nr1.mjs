// NEXTREP 1.0 (N0) — build of the new app (src/nr1/), separate from the old one.
//
//   node tools/build-nr1.mjs                 build into dist-nr1/ (work files in .build-nr1/)
//   node tools/build-nr1.mjs --check-atlas   only validate the atlas and print the report
//   options: --out <dir>  --work <dir>  --atlas <atlas.json>  --entry <file>  (tests use them)
//
// Order (nothing is written before every check has passed):
//   1. atlas: parse src/atlas/atlas.json and run validateAtlas() — any error stops the build;
//      the release metadata (decision C01-4) is generated from the validated file;
//   2. bundle src/nr1/main.jsx with esbuild in memory (no CDN; React from npm). A guard plugin
//      refuses any forbidden import while resolving (old app, legacy engine adapters, Supabase);
//   3. boundaries (tools/check-nr1-boundaries.mjs): the real dependency graph (metafile) and the
//      bundle text — no old data model, no Supabase address or key, no protected project;
//   4. write dist-nr1/ (index.html, assets/app.js, atlas-release.json) and .build-nr1/.
// It never reads a Supabase configuration and never writes into dist/ (the old app's build).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, sep } from "node:path";
import { build } from "esbuild";
import { validateAtlas } from "../src/engine/atlas-validate.js";
import {
  ROOT, ATLAS_RELEASE_MODULE, forbiddenPathReason, checkMetafile, checkBundleText, formatViolations,
} from "./check-nr1-boundaries.mjs";

const rel = (abs) => relative(ROOT, abs).split(sep).join("/");
const fail = (msg) => { console.error(`[build-nr1] ${msg}`); process.exit(1); };
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };

const outDir = resolve(ROOT, arg("--out", "dist-nr1"));
const workDir = resolve(ROOT, arg("--work", ".build-nr1"));
const atlasPath = resolve(ROOT, arg("--atlas", "src/atlas/atlas.json"));
const entry = resolve(ROOT, arg("--entry", "src/nr1/main.jsx"));
const shellPath = resolve(ROOT, "src/nr1/index.html");
const checkOnly = process.argv.includes("--check-atlas");

// ---- 0. environment guard ---------------------------------------------------------------------
// N0 has no backend (decision O-13 open). A Supabase setting meant for NEXTREP 1.0 is an error; the
// old app's NEXTREP_SUPABASE_* variables are never read here.
for (const k of Object.keys(process.env)) {
  if (/^NR1_.*SUPABASE/i.test(k)) fail(`${k} is set — NEXTREP 1.0 has no backend in N0 (decision O-13)`);
}
// The output must never overlap the old app's build or the sources.
const protectedDirs = ["dist", "src", "android", "tools", "tests", "docs", ".build-web", "node_modules"].map((d) => resolve(ROOT, d));
for (const d of [outDir, workDir]) {
  if (d === ROOT || protectedDirs.some((p) => d === p || d.startsWith(p + sep))) fail(`refusing to write into ${rel(d) || "."} (protected directory)`);
}

// ---- 1. atlas -----------------------------------------------------------------------------------
let atlasBytes;
let atlas;
try {
  atlasBytes = readFileSync(atlasPath);
  atlas = JSON.parse(atlasBytes.toString("utf8"));
} catch (e) {
  fail(`atlas ${rel(atlasPath)} cannot be read: ${e.message}`);
}
const report = validateAtlas(atlas);
const count = (level) => report.issues.filter((i) => i.level === level).length;
const errors = report.issues.filter((i) => i.level === "error");
const summary = `atlas ${rel(atlasPath)}: wydanie ${atlas.atlasVersion}, ćwiczeń ${(atlas.exercises || []).length} — błędy ${errors.length}, ostrzeżenia ${count("warning")}, informacje ${count("info")}`;
if (errors.length) {
  const lines = errors.slice(0, 20).map((i) => `  ✗ ${i.rule} ${i.code}${i.exerciseId ? ` (${i.exerciseId})` : ""}: ${i.message}`);
  fail(`${summary}\n${lines.join("\n")}${errors.length > 20 ? `\n  … i ${errors.length - 20} więcej` : ""}\nBłąd walidatora atlasu blokuje build.`);
}
const release = {
  formatVersion: atlas.formatVersion,
  atlasVersion: atlas.atlasVersion,
  exerciseCount: (atlas.exercises || []).length,
  activeExerciseCount: (atlas.exercises || []).filter((e) => e.status === "active").length,
  familyCount: (atlas.families || []).length,
  issuedIdCount: (atlas.issuedIds || []).length,
  sha256: createHash("sha256").update(atlasBytes).digest("hex"),
  validation: { errors: 0, warnings: count("warning"), infos: count("info") },
};
if (checkOnly) {
  console.log(`[build-nr1] ${summary}`);
  console.log(`[build-nr1] wydanie atlasu: ${JSON.stringify(release)}`);
  process.exit(0);
}

// ---- 2. bundle (in memory) --------------------------------------------------------------------
const guardPlugin = {
  name: "nr1-guard",
  setup(b) {
    b.onResolve({ filter: /^nr1:atlas-release$/ }, () => ({ path: ATLAS_RELEASE_MODULE, namespace: "nr1" }));
    b.onLoad({ filter: /.*/, namespace: "nr1" }, () => ({ contents: JSON.stringify(release), loader: "json" }));
    b.onResolve({ filter: /^@supabase\// }, (a) => ({ errors: [{ text: `Niedozwolona zależność: klient Supabase (${a.path})` }] }));
    // every other import: resolve normally, then refuse forbidden files
    b.onResolve({ filter: /.*/ }, async (a) => {
      if (a.pluginData?.nr1Checked) return undefined;
      const r = await b.resolve(a.path, { kind: a.kind, importer: a.importer, resolveDir: a.resolveDir, pluginData: { nr1Checked: true } });
      if (r.errors.length) return { errors: r.errors };
      const reason = r.path && !r.external ? forbiddenPathReason(r.path) : null;
      if (reason) return { errors: [{ text: `Niedozwolona zależność: ${reason} — import „${a.path}” w ${rel(a.importer)}` }] };
      return r;
    });
  },
};

let result;
try {
  result = await build({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    outfile: resolve(outDir, "assets/app.js"),
    format: "iife",
    platform: "browser",
    target: ["chrome100", "safari15"],
    jsx: "automatic",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    nodePaths: [resolve(ROOT, "node_modules")],
    plugins: [guardPlugin],
    logLevel: "silent",
  });
} catch (e) {
  const msgs = (e.errors || []).map((m) => `  ✗ ${m.text}${m.location ? ` (${m.location.file}:${m.location.line})` : ""}`).join("\n");
  fail(`bundle failed:\n${msgs || e.message}`);
}
const appJs = result.outputFiles.find((f) => f.path.endsWith("app.js")).text;

// ---- 3. boundaries ----------------------------------------------------------------------------
let shell = readFileSync(shellPath, "utf8");
const MARKER = "<!-- NR1_APP: the app script is added here by tools/build-nr1.mjs -->";
if (shell.split(MARKER).length !== 2) fail("src/nr1/index.html: app marker not found exactly once");
const html = shell.replace(MARKER, '<script defer src="./assets/app.js"></script>');
const violations = [
  ...checkMetafile(result.metafile, { entry: rel(entry) }),
  ...checkBundleText(appJs, { atlas, file: "assets/app.js" }),
  ...checkBundleText(html, { atlas, file: "index.html" }),
];
if (violations.length) fail(`naruszenia granic NEXTREP 1.0 (${violations.length}) — nic nie zapisano:\n${formatViolations(violations)}`);

// ---- 4. write -----------------------------------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
rmSync(workDir, { recursive: true, force: true });
mkdirSync(resolve(outDir, "assets"), { recursive: true });
mkdirSync(workDir, { recursive: true });
writeFileSync(resolve(outDir, "assets/app.js"), appJs);
writeFileSync(resolve(outDir, "index.html"), html);
writeFileSync(resolve(outDir, "atlas-release.json"), JSON.stringify(release, null, 2) + "\n");
writeFileSync(resolve(workDir, "metafile.json"), JSON.stringify(result.metafile));
writeFileSync(resolve(workDir, "build-info.json"), JSON.stringify({ entry: rel(entry), atlasPath: rel(atlasPath), outDir: rel(outDir) }, null, 2) + "\n");
if (!existsSync(resolve(outDir, "index.html"))) fail("index.html not written");

const appSha = createHash("sha256").update(appJs).digest("hex");
console.log(`[build-nr1] ${summary}`);
console.log(`[build-nr1] ${rel(outDir)}/ ready — app.js ${(appJs.length / 1024).toFixed(1)} KB, sha256 ${appSha.slice(0, 12)}…, ${Object.keys(result.metafile.inputs).length} plików w grafie zależności`);
