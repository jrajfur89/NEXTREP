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

report(Buffer.byteLength(joined) === baseline.appScriptBytes, `size ${Buffer.byteLength(joined)} bytes (baseline ${baseline.appScriptBytes})`);
report(sha(joined) === baseline.appScriptSha256, `sha256 ${sha(joined)} (baseline ${baseline.appScriptSha256})`);

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
