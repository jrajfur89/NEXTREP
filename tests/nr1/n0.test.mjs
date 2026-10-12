// NEXTREP 1.0 — N0 acceptance tests: separate build, atlas gate, architecture boundaries, isolation
// from the old app's data and from every existing Supabase project, frozen old app.
// Every build here writes into a temporary directory; dist/ (old app) and dist-nr1/ are not touched.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, cpSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { baseAtlas, clone } from "../fixtures/atlas/synthetic.mjs";
import { emptyAtlas } from "../../src/engine/atlas-schema.js";
import { validateAtlas } from "../../src/engine/atlas-validate.js";
import { checkMetafile, checkBundleText, forbiddenPathReason, oldExerciseIds, PROTECTED_SUPABASE_REFS } from "../../tools/check-nr1-boundaries.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const BUILD = resolve(ROOT, "tools/build-nr1.mjs");
const CHECK = resolve(ROOT, "tools/check-nr1-boundaries.mjs");
const FREEZE_REF = "7d13f74"; // audit point of C01; the old app stays frozen until N12 (C01-7)

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), "nr1-n0-")); });
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

let n = 0;
function build(args = [], env = {}) {
  const out = join(tmp, `out-${++n}`);
  const work = join(tmp, `work-${n}`);
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE/i.test(k)));
  const r = spawnSync(process.execPath, [BUILD, "--out", out, "--work", work, ...args], { cwd: ROOT, encoding: "utf8", env: { ...cleanEnv, ...env } });
  return { ...r, out, work, text: `${r.stdout}\n${r.stderr}` };
}
function writeAtlas(atlas, name) {
  const p = join(tmp, name);
  writeFileSync(p, typeof atlas === "string" ? atlas : JSON.stringify(atlas, null, 2));
  return p;
}
function dirHash(dir) {
  if (!existsSync(dir)) return "absent";
  const h = createHash("sha256");
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}
const fixture = (name) => resolve(here, "fixtures/entries", name);

// ---- 1. independent build ---------------------------------------------------------------------
describe("N0-A / N0-B: the new app builds on its own", () => {
  let ok;
  let distBefore;
  before(() => {
    distBefore = dirHash(resolve(ROOT, "dist"));
    ok = build();
  });

  test("build succeeds with the repository atlas and writes only its own output", () => {
    assert.equal(ok.status, 0, ok.text);
    for (const f of ["index.html", "assets/app.js", "atlas-release.json"]) assert.ok(existsSync(join(ok.out, f)), f);
    assert.ok(existsSync(join(ok.work, "metafile.json")));
    assert.equal(dirHash(resolve(ROOT, "dist")), distBefore, "dist/ of the old app must not change");
  });

  test("index.html: development title, the app script, no network (CSP connect-src 'none'), no CDN", () => {
    const html = readFileSync(join(ok.out, "index.html"), "utf8");
    assert.match(html, /<title>NEXTREP 1\.0 — wersja deweloperska<\/title>/);
    assert.match(html, /<script defer src="\.\/assets\/app\.js"><\/script>/);
    assert.match(html, /connect-src 'none'/);
    assert.doesNotMatch(html, /https?:\/\//);
  });

  test("the atlas release metadata is generated from the validated atlas (C01-4)", () => {
    const atlasBytes = readFileSync(resolve(ROOT, "src/atlas/atlas.json"));
    const atlas = JSON.parse(atlasBytes);
    const rel = JSON.parse(readFileSync(join(ok.out, "atlas-release.json"), "utf8"));
    assert.equal(rel.atlasVersion, atlas.atlasVersion);
    assert.equal(rel.exerciseCount, atlas.exercises.length);
    assert.equal(rel.issuedIdCount, atlas.issuedIds.length);
    assert.equal(rel.sha256, createHash("sha256").update(atlasBytes).digest("hex"));
    assert.equal(rel.validation.errors, 0);
  });

  test("the output can never be the old app's dist/ or a source directory", () => {
    const before = dirHash(resolve(ROOT, "dist"));
    for (const target of ["dist", "dist/nr1", "src", "android", "."]) {
      const r = spawnSync(process.execPath, [BUILD, "--out", target], { cwd: ROOT, encoding: "utf8" });
      assert.notEqual(r.status, 0, target);
      assert.match(r.stderr, /refusing to write/);
    }
    const r = spawnSync(process.execPath, [BUILD, "--work", ".build-web"], { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.equal(dirHash(resolve(ROOT, "dist")), before);
  });

  test("the CLI boundary check accepts the finished build", () => {
    const r = spawnSync(process.execPath, [CHECK, "--dist", ok.out, "--work", ok.work], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /OK/);
  });

  test("the CLI boundary check rejects a tampered bundle", () => {
    const out = join(tmp, "tampered");
    cpSync(ok.out, out, { recursive: true });
    appendFileSync(join(out, "assets/app.js"), ';window.localStorage.getItem("trainapp_history_v1");');
    const r = spawnSync(process.execPath, [CHECK, "--dist", out, "--work", ok.work], { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /OLD_DATA/);
    assert.match(r.stderr, /OLD_STORAGE/);
  });
});

// ---- 2. atlas gate ----------------------------------------------------------------------------
describe("N0-B: atlas validation gates the build", () => {
  test("a valid empty atlas (release 0) builds", () => {
    const r = build(["--atlas", writeAtlas(emptyAtlas(), "empty.json")]);
    assert.equal(r.status, 0, r.text);
    assert.equal(JSON.parse(readFileSync(join(r.out, "atlas-release.json"), "utf8")).exerciseCount, 0);
  });

  test("a valid release with warnings builds; counts and warnings are reported", () => {
    const a = baseAtlas();
    a.atlasVersion = 1;
    const warnings = validateAtlas(a).issues.filter((i) => i.level === "warning").length;
    const r = build(["--atlas", writeAtlas(a, "synthetic.json")]);
    assert.equal(r.status, 0, r.text);
    const rel = JSON.parse(readFileSync(join(r.out, "atlas-release.json"), "utf8"));
    assert.deepEqual([rel.atlasVersion, rel.exerciseCount, rel.validation.errors, rel.validation.warnings], [1, a.exercises.length, 0, warnings]);
  });

  test("a validator error blocks the build and nothing is written", () => {
    const a = baseAtlas();
    a.exercises[0].equivalentTo = a.exercises[1].exerciseId; // V8: equivalence field forbidden
    a.exercises.push(clone(a.exercises[2])); // I1: duplicate id
    assert.ok(validateAtlas(a).issues.some((i) => i.level === "error"));
    const r = build(["--atlas", writeAtlas(a, "broken.json")]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Błąd walidatora atlasu blokuje build/);
    assert.match(r.stderr, /EQUIVALENCE_FIELD_FORBIDDEN/);
    assert.ok(!existsSync(r.out), "no output on a blocked build");
  });

  test("an unreadable atlas blocks the build", () => {
    const r = build(["--atlas", writeAtlas("{ not json", "garbage.json")]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /cannot be read/);
    assert.ok(!existsSync(r.out));
  });

  test("--check-atlas validates only (0 = valid, 1 = errors)", () => {
    const good = spawnSync(process.execPath, [BUILD, "--check-atlas"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /błędy 0/);
    const a = baseAtlas();
    a.exercises[0].unknownField = 1;
    const bad = spawnSync(process.execPath, [BUILD, "--check-atlas", "--atlas", writeAtlas(a, "bad-check.json")], { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(bad.status, 0);
  });
});

// ---- 3. architecture boundaries on the REAL dependency graph ------------------------------------
describe("N0-C / N0-D: boundaries are enforced on real dependencies and on the bundle", () => {
  const refused = [
    ["imports-old-app.jsx", /stara aplikacja \(src\/app\/\)/],
    ["imports-legacy-progression.jsx", /legacy-progression\.js/],
    ["imports-legacy-map.jsx", /load-legacy-map\.js/],
    ["imports-volume.jsx", /volume\.js/],
    ["imports-engine-index.jsx", /src\/engine\/index\.js/],
    ["imports-supabase.jsx", /klient Supabase/],
    ["reads-old-storage.jsx", /OLD_STORAGE/],
    ["old-storage-key.jsx", /OLD_DATA/],
    ["production-url.jsx", /PROTECTED_PROJECT[\s\S]*produkcja|produkcja/],
    ["f5-test-ref.jsx", /nextrep-f5-test/],
    ["old-exercise-id.jsx", /OLD_EXERCISE_ID/],
  ];
  for (const [file, why] of refused) {
    test(`refused: ${file}`, () => {
      const r = build(["--entry", fixture(file)]);
      assert.notEqual(r.status, 0, r.text);
      assert.match(r.stderr, why);
      assert.ok(!existsSync(r.out), "nothing written");
    });
  }

  test("allowed: the build-time atlas release module", () => {
    const r = build(["--entry", fixture("allowed-atlas-release.jsx")]);
    assert.equal(r.status, 0, r.text);
    const inputs = Object.keys(JSON.parse(readFileSync(join(r.work, "metafile.json"), "utf8")).inputs);
    assert.ok(inputs.includes("nr1:nr1:atlas-release"));
    assert.ok(!inputs.some((i) => /legacy|volume\.js|src\/app\/|src\/engine\//.test(i)));
  });

  test("transitive dependencies are detected: src/engine/load.js → legacy-progression.js is refused (N0 finding, N1 prerequisite)", () => {
    const r = build(["--entry", fixture("imports-load-transitive.jsx")]);
    assert.notEqual(r.status, 0, r.text);
    assert.match(r.stderr, /legacy-progression\.js[\s\S]*src\/engine\/load\.js/);
    assert.ok(!existsSync(r.out));
  });

  test("a Supabase setting for NEXTREP 1.0 is refused (no backend in N0)", () => {
    const r = build([], { NR1_SUPABASE_URL: "https://example.supabase.co" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no backend/);
  });

  test("the old app's Supabase variables are ignored, never built in", () => {
    const r = build([], { NEXTREP_SUPABASE_URL: `https://${Object.keys(PROTECTED_SUPABASE_REFS)[0]}.supabase.co`, NEXTREP_SUPABASE_KEY: "sb_publishable_x" });
    assert.equal(r.status, 0, r.text);
    const js = readFileSync(join(r.out, "assets/app.js"), "utf8");
    assert.doesNotMatch(js, /supabase|sb_publishable_/i);
  });

  test("rule units: forbidden paths, metafile allowlist, bundle patterns", () => {
    assert.match(forbiddenPathReason(resolve(ROOT, "src/app/21-app.jsx")), /stara aplikacja/);
    assert.match(forbiddenPathReason(resolve(ROOT, "src/engine/legacy-progression.js")), /tylko dla starej/);
    assert.match(forbiddenPathReason(resolve(ROOT, "node_modules/@supabase/supabase-js/dist/main/index.js")), /Supabase/);
    assert.match(forbiddenPathReason(resolve(ROOT, "node_modules/lucide-react/dist/esm/lucide-react.js")), /spoza listy/);
    assert.equal(forbiddenPathReason(resolve(ROOT, "src/engine/load.js")), null);
    assert.equal(forbiddenPathReason(resolve(ROOT, "src/nr1/main.jsx")), null);
    const meta = { inputs: { "src/nr1/main.jsx": {}, "src/app/09-backups.jsx": {}, "src/engine/volume.js": {}, "docs/sql/x.sql": {}, "nr1:nr1:atlas-release": {} } };
    const v = checkMetafile(meta, { entry: "src/nr1/main.jsx" });
    assert.deepEqual(v.map((x) => x.file).sort(), ["docs/sql/x.sql", "src/app/09-backups.jsx", "src/engine/volume.js"]);
    for (const s of ["sb_secret_abc", "x.supabase.co", "nextrep_sync_queue_v1", "legacy_id", "sessionStorage", "https://unpkg.com/react"]) {
      assert.ok(checkBundleText(`var a="${s}";`, {}).length > 0, s);
    }
    assert.deepEqual(checkBundleText('var a="NEXTREP 1.0 — wersja deweloperska";', {}), []);
  });

  test("old exercise ids: 68 from the old atlas; an id issued by the 1.0 atlas is not treated as old", () => {
    const all = oldExerciseIds(null);
    assert.equal(all.length, 68);
    const a = emptyAtlas();
    a.issuedIds = [all[0]];
    assert.equal(oldExerciseIds(a).length, 67);
    assert.deepEqual(checkBundleText(`x("${all[0]}")`, { atlas: a }), []);
  });
});

// ---- 4. runtime: the new app never reads the old app's data -----------------------------------
describe("N0-F: runtime isolation (jsdom)", () => {
  test("renders the development screen; zero access to localStorage, sessionStorage, network; old data intact", async () => {
    const r = build();
    assert.equal(r.status, 0, r.text);
    const html = readFileSync(join(r.out, "index.html"), "utf8").replace(/<script[^>]*src=[^>]*><\/script>/, "");
    const dom = new JSDOM(html, { url: "https://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
    const w = dom.window;
    const OLD = { trainapp_exercises_v1: '[{"id":"squat_barbell"}]', trainapp_history_v1: "[]", nextrep_sync_queue_v1: "[]", "nextrep_user_x_account_init_v1": "{}" };
    for (const [k, v] of Object.entries(OLD)) w.localStorage.setItem(k, v);
    const realLocalStorage = w.localStorage;
    let storageCalls = 0;
    let network = 0;
    const proto = w.Storage.prototype;
    for (const m of ["getItem", "setItem", "removeItem", "key", "clear"]) {
      const orig = proto[m];
      proto[m] = function (...a) { storageCalls++; return orig.apply(this, a); };
    }
    for (const name of ["localStorage", "sessionStorage"]) {
      const real = w[name];
      Object.defineProperty(w, name, { configurable: true, get() { storageCalls++; return real; } });
    }
    w.fetch = () => { network++; return Promise.reject(new Error("no network")); };
    w.XMLHttpRequest = function () { network++; throw new Error("no network"); };
    w.WebSocket = function () { network++; throw new Error("no network"); };
    w.indexedDB = new Proxy({}, { get() { network++; throw new Error("no IndexedDB in N0"); } });
    storageCalls = 0;
    w.eval(readFileSync(join(r.out, "assets/app.js"), "utf8"));
    await new Promise((res) => setTimeout(res, 100));
    const doc = w.document;
    assert.equal(doc.querySelector('[data-testid="nr1-title"]')?.textContent, "NEXTREP 1.0 — wersja deweloperska");
    assert.equal(doc.querySelector('[data-testid="nr1-atlas-version"]')?.textContent, String(JSON.parse(readFileSync(join(r.out, "atlas-release.json"), "utf8")).atlasVersion));
    assert.equal(storageCalls, 0, "the new app must not touch localStorage / sessionStorage");
    assert.equal(network, 0, "no network, no IndexedDB in N0");
    // the old data is still exactly as it was
    assert.equal(realLocalStorage.length, Object.keys(OLD).length);
    for (const [k, v] of Object.entries(OLD)) assert.equal(realLocalStorage.getItem(k), v);
    w.close();
  });
});

// ---- 5. the old app and existing environments stay untouched ----------------------------------
describe("N0-F: frozen old app and environments (C01-7)", () => {
  test(`no change since ${FREEZE_REF} in the old app, its build, Android project, Supabase-related config and S1 workflow`, () => {
    const paths = [
      "src/app", "index.html", "tools/build-web.mjs", "android", "capacitor.config.json", "vercel.json",
      ".github/workflows/android-s1-apk.yml", "src/engine/legacy-progression.js", "src/engine/load-legacy-map.js",
      "src/engine/volume.js", "src/engine/index.js", "db", "docs/sql",
    ];
    let diff;
    try {
      diff = execFileSync("git", ["diff", "--stat", FREEZE_REF, "--", ...paths], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      assert.fail(`git diff against ${FREEZE_REF} failed (shallow clone?): ${e.message}`);
    }
    assert.equal(diff.trim(), "", diff);
  });
});
