// F1.2 — proof that the split is purely mechanical: the files in src/app/ joined in ORDER.json
// order are byte-for-byte the app script recorded in tools/f1-baseline.json (index.html at
// a2b9ca0, the finished S1). While index.html still carries the script (F1.2), it must also be
// identical to it. Exit code 1 on any difference.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const baseline = JSON.parse(readFileSync(resolve(root, "tools/f1-baseline.json"), "utf8"));
const order = JSON.parse(readFileSync(resolve(root, "src/app/ORDER.json"), "utf8"));
import { execFileSync } from "node:child_process";
// The baseline script itself (for the F1.5 line check): from git, index.html at the baseline commit.
function baselineScript() {
  const html = execFileSync("git", ["show", `${baseline.ref}:index.html`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const s = html.indexOf(">", html.indexOf('<script type="text/babel"')) + 1;
  const text = html.slice(s, html.indexOf("</script>", s));
  if (sha(text) !== baseline.appScriptSha256) throw new Error("baseline script from git does not match tools/f1-baseline.json");
  return text;
}
let ok = true;
const report = (cond, msg) => { console.log(`${cond ? "OK  " : "FAIL"} ${msg}`); if (!cond) ok = false; };

let joined = order.map((f) => readFileSync(resolve(root, "src/app", f), "utf8")).join("");

// F1.4: images live in src/assets/. Undo that step exactly — drop the import block and put every
// "data:<mime>;base64,<bytes>" literal back in place of its identifier — before comparing bytes.
const manifestPath = resolve(root, "src/assets/MANIFEST.json");
if (existsSync(manifestPath)) {
  const { assets } = JSON.parse(readFileSync(manifestPath, "utf8"));
  const BEGIN = "// F1.4 assets (begin)";
  const END = "// F1.4 assets (end)\n";
  const b = joined.indexOf(BEGIN);
  const e = joined.indexOf(END);
  if (b !== 0 || e < 0) { console.log("FAIL F1.4 asset import block not found at the top of src/app/00-imports.jsx"); process.exit(1); }
  joined = joined.slice(e + END.length);
  for (const a of assets) {
    const bytes = readFileSync(resolve(root, "src/assets", a.file));
    report(sha(bytes) === a.sha256, `asset ${a.file} (${bytes.length} bytes) matches MANIFEST`);
    const re = new RegExp(`\\b${a.id}\\b`, "g");
    const n = (joined.match(re) || []).length;
    report(n === 1, `asset id ${a.id} used exactly once (found ${n})`);
    joined = joined.replace(re, () => `"data:${a.mime};base64,${bytes.toString("base64")}"`);
  }
}

// F1.5: the progression engine moved to src/engine/legacy-progression.js (real ES module). From here
// on the app and the engine together must contain exactly the baseline's lines: every non-empty
// line of the baseline script appears in src/app/ or src/engine/ as often as before, and no other
// non-empty line exists except the engine's own header, its export list and the import in
// 00-imports.jsx. Behaviour is proved by tests/unit/f1-engine-equivalence.test.mjs.
const enginePath = resolve(root, "src/engine/legacy-progression.js");
if (existsSync(enginePath)) {
  const IMP_BEGIN = "// F1.5 engine";
  const IMP_END = '} from "@nextrep-engine";\n';
  const ib = joined.indexOf(IMP_BEGIN);
  const ie = joined.indexOf(IMP_END);
  if (ib !== 0 || ie < 0) { console.log("FAIL F1.5 engine import not found at the top of the app"); process.exit(1); }
  const app = joined.slice(ie + IMP_END.length);
  let engine = readFileSync(enginePath, "utf8");
  engine = engine.slice(engine.indexOf("\n\n") + 2);           // drop the module header comment
  engine = engine.slice(0, engine.lastIndexOf("\nexport {"));   // drop the export list
  const count = (text) => { const m = new Map(); for (const l of text.split("\n")) if (l.trim()) m.set(l, (m.get(l) || 0) + 1); return m; };
  const want = count(Buffer.from(baselineScript()).toString());
  const have = count(app + "\n" + engine);
  let lost = 0, added = 0;
  for (const [l, n] of want) if ((have.get(l) || 0) < n) lost += n - (have.get(l) || 0);
  for (const [l, n] of have) if ((want.get(l) || 0) < n) added += n - (want.get(l) || 0);
  report(lost === 0 && added === 0, `F1.5 line conservation app + engine vs baseline: ${lost} non-empty lines lost, ${added} added`);
  const exp = readFileSync(enginePath, "utf8").match(/\nexport \{([^}]*)\};\n$/);
  const imp = joined.slice(ib, ie).match(/import \{([^}]*)$/);
  const names = (m) => (m ? m[1].split(",").map((x) => x.trim()).filter(Boolean).sort().join(",") : "");
  report(exp && imp && names(exp) === names(imp), `engine exports = names imported by the app (${names(exp).split(",").length})`);
  console.log("     byte identity of the whole script applies up to F1.4; F1.5+ is checked by line conservation + equivalence tests");
} else {
report(Buffer.byteLength(joined) === baseline.appScriptBytes, `size ${Buffer.byteLength(joined)} bytes (baseline ${baseline.appScriptBytes})`);
report(sha(joined) === baseline.appScriptSha256, `sha256 ${sha(joined)} (baseline ${baseline.appScriptSha256})`);
}

if (baseline.tailwindConfigSha256) {
  const cfg = (await import(pathToFileURL(resolve(root, "src/tailwind-config.mjs")).href)).default;
  report(sha(JSON.stringify(cfg)) === baseline.tailwindConfigSha256, "src/tailwind-config.mjs = the former inline tailwind.config of index.html");
}

const html = readFileSync(resolve(root, "index.html"), "utf8");
const open = html.indexOf('<script type="text/babel"');
if (open >= 0) {
  const s = html.indexOf(">", open) + 1;
  const inline = html.slice(s, html.indexOf("</script>", s));
  report(inline === joined, "index.html still carries the script and it is identical to src/app/ (assets re-inlined)");
} else {
  console.log("     index.html carries no app script (F1.3+): src/app/ is the only copy");
}
console.log(`     ${order.length} files: ${order.join(", ")}`);
process.exit(ok ? 0 : 1);
