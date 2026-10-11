// F1 proof + current-tree consistency. Exit code 1 on any failure.
//
// 1. F1 proof (frozen): the tree at the end of F1 (tools/f1-baseline.json "f1EndRef", read from
//    git) is exactly the baseline app script of a2b9ca0 — assets re-inlined (F1.4) and every
//    non-empty line of the baseline present in src/app/ + src/engine/legacy-progression.js as often
//    as before, nothing added (F1.5). Byte identity of the whole script was proved up to F1.4.
//    Since PE-A4.5 the app itself changes on purpose, so this proof is checked on the F1 end
//    commit, not on the working tree; later changes are proved by their own tests
//    (tests/unit/pe-a-adapter-equivalence.test.mjs compares with the F1.6 build).
// 2. Current tree: asset files match MANIFEST and each is used once; every name the app imports
//    from the engine is exported by it; the Tailwind config is the former inline one; index.html
//    carries no app script.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const baseline = JSON.parse(readFileSync(resolve(root, "tools/f1-baseline.json"), "utf8"));
const git = (args, encoding = "utf8") => execFileSync("git", args, { cwd: root, encoding, maxBuffer: 64 * 1024 * 1024 });
// file at a git ref, or in the working tree when ref is null
const readAt = (ref, path, binary = false) =>
  ref ? git(["show", `${ref}:${path}`], binary ? "buffer" : "utf8") : readFileSync(resolve(root, path), binary ? undefined : "utf8");

let ok = true;
const report = (cond, msg) => { console.log(`${cond ? "OK  " : "FAIL"} ${msg}`); if (!cond) ok = false; };

function joinedApp(ref) {
  const order = JSON.parse(readAt(ref, "src/app/ORDER.json"));
  return { order, text: order.map((f) => readAt(ref, `src/app/${f}`)).join("") };
}
function baselineScript() {
  const html = git(["show", `${baseline.ref}:index.html`]);
  const s = html.indexOf(">", html.indexOf('<script type="text/babel"')) + 1;
  const text = html.slice(s, html.indexOf("</script>", s));
  if (sha(text) !== baseline.appScriptSha256) throw new Error("baseline script from git does not match tools/f1-baseline.json");
  return text;
}
// F1.4: drop the asset import block and put every data: literal back in place of its identifier
function reinlineAssets(ref, text, check) {
  const BEGIN = "// F1.4 assets (begin)";
  const END = "// F1.4 assets (end)\n";
  if (text.indexOf(BEGIN) !== 0 || text.indexOf(END) < 0) { check(false, "F1.4 asset import block at the top of src/app/00-imports.jsx"); return text; }
  let out = text.slice(text.indexOf(END) + END.length);
  const { assets } = JSON.parse(readAt(ref, "src/assets/MANIFEST.json"));
  for (const a of assets) {
    const bytes = readAt(ref, `src/assets/${a.file}`, true);
    check(sha(bytes) === a.sha256, `asset ${a.file} (${bytes.length} bytes) matches MANIFEST`);
    const re = new RegExp(`\\b${a.id}\\b`, "g");
    const n = (out.match(re) || []).length;
    check(n === 1, `asset id ${a.id} used exactly once (found ${n})`);
    out = out.replace(re, () => `"data:${a.mime};base64,${bytes.toString("base64")}"`);
  }
  return out;
}

// ---- 1. F1 proof on the F1 end commit ---------------------------------------------------------
{
  const ref = baseline.f1EndRef;
  const quiet = (cond, msg) => { if (!cond) report(false, `[F1 ${ref}] ${msg}`); };
  const { text } = joinedApp(ref);
  const joined = reinlineAssets(ref, text, quiet);
  const IMP_END = '} from "@nextrep-engine";\n';
  const app = joined.slice(joined.indexOf(IMP_END) + IMP_END.length);
  let engine = readAt(ref, "src/engine/legacy-progression.js");
  engine = engine.slice(engine.indexOf("\n\n") + 2);
  engine = engine.slice(0, engine.lastIndexOf("\nexport {"));
  const count = (t) => { const m = new Map(); for (const l of t.split("\n")) if (l.trim()) m.set(l, (m.get(l) || 0) + 1); return m; };
  const want = count(baselineScript());
  const have = count(app + "\n" + engine);
  let lost = 0, added = 0;
  for (const [l, n] of want) if ((have.get(l) || 0) < n) lost += n - (have.get(l) || 0);
  for (const [l, n] of have) if ((want.get(l) || 0) < n) added += n - (want.get(l) || 0);
  report(lost === 0 && added === 0, `F1 end ${ref}: app + engine = baseline ${baseline.ref} line for line (${lost} lost, ${added} added; assets re-inlined)`);
}

// ---- 2. current tree --------------------------------------------------------------------------
const { order, text: current } = joinedApp(null);
if (existsSync(resolve(root, "src/assets/MANIFEST.json"))) {
  let assetsOk = true;
  reinlineAssets(null, current, (c, m) => { if (!c) { assetsOk = false; report(false, m); } });
  report(assetsOk, "assets: every file matches MANIFEST and every asset id is used exactly once");
}
{
  // names imported by the app from the engine, from every `import { … } from "@nextrep-engine"`
  const imported = [...current.matchAll(/import \{([^}]*)\} from "@nextrep-engine";/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()).filter(Boolean));
  const exported = new Set(Object.keys(await import(pathToFileURL(resolve(root, "src/engine/index.js")).href)));
  const missing = imported.filter((n) => !exported.has(n));
  report(imported.length > 0 && missing.length === 0, `engine: all ${imported.length} names the app imports are exported by src/engine/index.js${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  report(new Set(imported).size === imported.length, "engine: no name imported twice");
}
if (baseline.tailwindConfigSha256) {
  const cfg = (await import(pathToFileURL(resolve(root, "src/tailwind-config.mjs")).href)).default;
  report(sha(JSON.stringify(cfg)) === baseline.tailwindConfigSha256, "src/tailwind-config.mjs = the former inline tailwind.config of index.html");
}
report(!readFileSync(resolve(root, "index.html"), "utf8").includes('<script type="text/babel"'), "index.html carries no app script: src/app/ is the only copy");
console.log(`     ${order.length} files: ${order.join(", ")}`);
process.exit(ok ? 0 : 1);
