// Builds a testable ES module from the app source WITHOUT modifying it.
//
// 1. Reads the app: src/app/*.jsx in ORDER.json order (F1.3; formerly the <script type="text/babel">
//    body of ../index.html — an older commit given with --ref is still read that way).
// 2. Replaces the single render line `createRoot(...).render(<App />);` with an
//    `export { ... }` of every top-level function/const/let of the app, so tests can call
//    the REAL production functions.
// 3. Bundles with esbuild (JSX → React.createElement). react / react-dom stay external (shared
//    with the tests); lucide-react and @supabase/supabase-js are replaced by local stubs
//    (no network, no real Supabase project is ever contacted).
// Output: harness/.build/app.bundle.mjs + harness/.build/app.meta.json (md5 of the app source).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, "../../index.html");
const outDir = resolve(here, ".build");
mkdirSync(outDir, { recursive: true });

// Optional: `node harness/build.mjs --ref <git-ref>` builds the index.html of an older commit
// (read via `git show <ref>:index.html`, nothing in the working tree is touched) into
// .build/ref-<ref>.bundle.mjs — used by cross-version regression tests.
const refArg = process.argv.indexOf("--ref");
const ref = refArg > 0 ? process.argv[refArg + 1] : null;
// Source of the app (F1.3): src/app/*.jsx joined in src/app/ORDER.json order — exactly the bytes of
// the former inline script (tools/check-split.mjs). An older commit (--ref) still has the app inline
// in its index.html, read via `git show` as before.
function appFromSrc() {
  const srcDir = resolve(here, "../../src/app");
  const order = JSON.parse(readFileSync(resolve(srcDir, "ORDER.json"), "utf8"));
  return order.map((f) => readFileSync(resolve(srcDir, f), "utf8")).join("");
}
function appFromHtml(html) {
  const open = html.indexOf('<script type="text/babel"');
  if (open < 0) throw new Error("build: <script type=\"text/babel\"> not found in index.html");
  const bodyStart = html.indexOf(">", open) + 1;
  return html.slice(bodyStart, html.indexOf("</script>", bodyStart));
}
const html = ref
  ? execFileSync("git", ["show", `${ref}:index.html`], { cwd: resolve(here, "../.."), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  : null;
const tag = ref ? `ref-${ref}` : "app";
let code = ref ? appFromHtml(html) : appFromSrc();
const code0 = code; // source as read (before the test-only export rewrite)

const RENDER_LINE = 'createRoot(document.getElementById("root")).render(<App />);';
const renderCount = code.split(RENDER_LINE).length - 1;
if (renderCount !== 1) throw new Error(`build: expected exactly 1 render line, found ${renderCount}`);

const names = [];
const re = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^(?:const|let)\s+([A-Za-z0-9_$]+)\s*=/gm;
let m;
while ((m = re.exec(code))) {
  const n = m[1] || m[2];
  if (!names.includes(n)) names.push(n);
}
if (names.length < 300) throw new Error(`build: only ${names.length} top-level names found — extraction looks wrong`);

// Test-only accessor for module-level state (read-only view, no behaviour change).
const extra = `
const __testState = {
  get activeDataNamespace() { return _activeDataNamespace; },
  resetActiveDataNamespace() { _activeDataNamespace = null; },
  // a test that simulates a killed app leaves an operation in flight forever — clear its module flag
  resetAccountInitBusy() {
    if (typeof _accountInitBusy !== "undefined") _accountInitBusy = false;
    if (typeof _v1MigrationToken !== "undefined") _v1MigrationToken = null; // Stage 4A.4 F-5: the V1 token of the killed run
  },
};
`;
code = code.replace(RENDER_LINE, `${extra}\nexport { ${names.join(", ")}, __testState };`);
writeFileSync(resolve(outDir, `${tag}.entry.jsx`), code);

await build({
  entryPoints: [resolve(outDir, `${tag}.entry.jsx`)],
  outfile: resolve(outDir, `${tag}.bundle.mjs`),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  jsx: "transform",
  loader: { ".jsx": "jsx" },
  external: ["react", "react-dom", "react-dom/*"],
  alias: {
    "lucide-react": resolve(here, "stubs/lucide-react.mjs"),
    "@supabase/supabase-js": resolve(here, "stubs/supabase-js.mjs"),
  },
  logLevel: "error",
});

const md5 = createHash("md5").update(ref ? html : code0).digest("hex");
writeFileSync(resolve(outDir, `${tag}.meta.json`), JSON.stringify({ indexMd5: md5, exportedNames: names.length, builtAt: new Date().toISOString() }, null, 2));
console.log(`[build] ${ref ? ref + ":index.html" : "src/app"} md5=${md5} exported=${names.length} names → harness/.build/${tag}.bundle.mjs`);
