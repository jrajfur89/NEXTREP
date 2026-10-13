// N1 — the old app after moving parseRirBounds to src/engine/rir.js.
// The minified bundle of the old app changes its bytes only because esbuild orders the moved
// function differently (accepted in the N1 authorisation). This test proves it rigorously: the
// UNMINIFIED bundles of the old app at db38ae8 (before N1) and at the end of N1 (0591c47) are
// identical once the one moved function (and the module comment esbuild puts above it) is taken out —
// and that function is byte-identical in both. Since AT2 (K01-1) the app changes on purpose, so this
// proof is checked on the N1 end commit, not on the working tree (as tools/check-split.mjs does for F1);
// later changes are proved by their own tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REF = "db38ae8";
const N1_END = "0591c47";

async function unminifiedOldApp(root) {
  const order = JSON.parse(readFileSync(resolve(root, "src/app/ORDER.json"), "utf8"));
  const app = order.map((f) => readFileSync(resolve(root, "src/app", f), "utf8")).join("");
  const r = await build({
    absWorkingDir: root,
    stdin: { contents: app, loader: "jsx", resolveDir: resolve(root, "src/app"), sourcefile: "app.jsx" },
    bundle: true, write: false, format: "esm", platform: "browser", target: ["chrome100", "safari15"], jsx: "transform",
    minify: false, legalComments: "none", define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@nextrep-assets": resolve(root, "src/assets"), "@nextrep-engine": resolve(root, "src/engine/index.js") },
    loader: { ".jpg": "file", ".png": "file" }, assetNames: "img/[name]", publicPath: "./assets/", outdir: join(root, ".n1-out"),
    preserveSymlinks: true, logLevel: "silent",
  });
  return r.outputFiles.find((f) => f.path.endsWith(".js")).text;
}

const FN = /function parseRirBounds\(rir\) \{\n(?: {2}.*\n)+?\}\n/;

test(`old app: unminified bundle at ${N1_END} = ${REF} except the placement of the moved parseRirBounds`, async () => {
  const dir = mkdtempSync(join(tmpdir(), "n1-old-"));
  const dirN1 = mkdtempSync(join(tmpdir(), "n1-end-"));
  try {
    for (const [ref, d] of [[REF, dir], [N1_END, dirN1]]) {
      execFileSync("bash", ["-c", `git -C "${ROOT}" archive ${ref} src | tar -x -C "${d}"`]);
      symlinkSync(resolve(ROOT, "node_modules"), join(d, "node_modules")); // same packages, same relative paths
    }
    const before = await unminifiedOldApp(dir);
    const after = await unminifiedOldApp(dirN1);
    const fb = before.match(FN);
    const fa = after.match(FN);
    assert.ok(fb && fa, "parseRirBounds present in both bundles");
    assert.equal(fa[0], fb[0], "the function itself is byte-identical");
    assert.equal(before.match(new RegExp(FN.source, "g")).length, 1);
    assert.equal(after.match(new RegExp(FN.source, "g")).length, 1);
    const strip = (t) => t.replace(FN, "").replace("// src/engine/rir.js\n\n", "").replace("// src/engine/rir.js\n", "");
    assert.ok(after.includes("// src/engine/rir.js\n"), "the new module is in the bundle");
    assert.equal(strip(after), strip(before), "nothing else differs");
    assert.notEqual(after, before, "the placement did change (otherwise this test proves nothing)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dirN1, { recursive: true, force: true });
  }
});
