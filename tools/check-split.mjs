// F1.2 — proof that the split is purely mechanical: the files in src/app/ joined in ORDER.json
// order are byte-for-byte the app script recorded in tools/f1-baseline.json (index.html at
// a2b9ca0, the finished S1). While index.html still carries the script (F1.2), it must also be
// identical to it. Exit code 1 on any difference.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const baseline = JSON.parse(readFileSync(resolve(root, "tools/f1-baseline.json"), "utf8"));
const order = JSON.parse(readFileSync(resolve(root, "src/app/ORDER.json"), "utf8"));
const joined = order.map((f) => readFileSync(resolve(root, "src/app", f), "utf8")).join("");

let ok = true;
const report = (cond, msg) => { console.log(`${cond ? "OK  " : "FAIL"} ${msg}`); if (!cond) ok = false; };
report(Buffer.byteLength(joined) === baseline.appScriptBytes, `size ${Buffer.byteLength(joined)} bytes (baseline ${baseline.appScriptBytes})`);
report(sha(joined) === baseline.appScriptSha256, `sha256 ${sha(joined)} (baseline ${baseline.appScriptSha256})`);

const html = readFileSync(resolve(root, "index.html"), "utf8");
const open = html.indexOf('<script type="text/babel"');
if (open >= 0) {
  const s = html.indexOf(">", open) + 1;
  const inline = html.slice(s, html.indexOf("</script>", s));
  report(inline === joined, "index.html still carries the script and it is identical to src/app/");
} else {
  console.log("     index.html carries no app script (F1.3+): src/app/ is the only copy");
}
console.log(`     ${order.length} files: ${order.join(", ")}`);
process.exit(ok ? 0 : 1);
