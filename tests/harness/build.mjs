// Builds a testable ES module from ../index.html WITHOUT modifying index.html.
//
// 1. Reads index.html (read-only) and extracts the app's <script type="text/babel"> body.
// 2. Replaces the single render line `createRoot(...).render(<App />);` with an
//    `export { ... }` of every top-level function/const/let of the app, so tests can call
//    the REAL production functions.
// 3. Bundles with esbuild (JSX → React.createElement). react / react-dom stay external (shared
//    with the tests); lucide-react and @supabase/supabase-js are replaced by local stubs
//    (no network, no real Supabase project is ever contacted).
// Output: harness/.build/app.bundle.mjs + harness/.build/meta.json (md5 of the source index.html).
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
const html = ref
  ? execFileSync("git", ["show", `${ref}:index.html`], { cwd: resolve(here, "../.."), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  : readFileSync(indexPath, "utf8");
const tag = ref ? `ref-${ref}` : "app";
const open = html.indexOf('<script type="text/babel"');
if (open < 0) throw new Error("build: <script type=\"text/babel\"> not found in index.html");
const bodyStart = html.indexOf(">", open) + 1;
const bodyEnd = html.indexOf("</script>", bodyStart);
let code = html.slice(bodyStart, bodyEnd);

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

const md5 = createHash("md5").update(html).digest("hex");
writeFileSync(resolve(outDir, `${tag}.meta.json`), JSON.stringify({ indexMd5: md5, exportedNames: names.length, builtAt: new Date().toISOString() }, null, 2));
console.log(`[build] ${ref ? ref + ":" : ""}index.html md5=${md5} exported=${names.length} names → harness/.build/${tag}.bundle.mjs`);
