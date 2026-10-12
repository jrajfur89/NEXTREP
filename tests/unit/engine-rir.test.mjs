// N1 — parseRirBounds moved from src/engine/legacy-progression.js to src/engine/rir.js.
// Regression: the moved function returns exactly what the legacy one returned (reference = the file
// at db38ae8, read from git), and the old app still gets the very same function through
// legacy-progression.js and src/engine/index.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseRirBounds } from "../../src/engine/rir.js";
import * as LEGACY from "../../src/engine/legacy-progression.js";
import * as ENGINE from "../../src/engine/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REF = "db38ae8"; // last commit with parseRirBounds inside legacy-progression.js

async function referenceParse() {
  const src = execFileSync("git", ["show", `${REF}:src/engine/legacy-progression.js`], { cwd: ROOT, encoding: "utf8" });
  assert.ok(src.includes("function parseRirBounds(rir) {"), "reference must contain the original function");
  const dir = mkdtempSync(join(tmpdir(), "rir-ref-"));
  const file = join(dir, "legacy-progression.ref.mjs");
  writeFileSync(file, src);
  try {
    return (await import(pathToFileURL(file).href)).parseRirBounds;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const INPUTS = [
  null, undefined, "", " ", "0", "0-1", "1-2", "2", " 2 ", "2 ", "0 - 1", "1- 2", "3", "4-5", "10-12", "2+", "2-", "-1", "1.5", "0,5",
  "abc", "1-2-3", "01", "00-01", "∞", 0, 1, 2, 3, 1.5, -1, NaN, Infinity, true, false, [], {}, "2 or more",
];

test("rir.js returns exactly what the legacy parseRirBounds (db38ae8) returned", async () => {
  const ref = await referenceParse();
  for (const v of INPUTS) assert.deepEqual(parseRirBounds(v), ref(v), `input ${String(v)}`);
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const alphabet = ["0", "1", "2", "3", "9", "-", " ", ".", ",", "a", "+"];
  for (let i = 0; i < 1000; i++) {
    const len = Math.floor(rnd() * 6);
    const v = Array.from({ length: len }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
    assert.deepEqual(parseRirBounds(v), ref(v), `random input "${v}"`);
  }
});

test("the 4 RIR categories keep their meaning ('2' = 2 or more)", () => {
  assert.deepEqual(["0", "0-1", "1-2", "2"].map(parseRirBounds), [{ lo: 0, hi: 0 }, { lo: 0, hi: 1 }, { lo: 1, hi: 2 }, { lo: 2, hi: 3 }]);
  assert.equal(parseRirBounds(""), null);
});

test("the old app gets the same function through legacy-progression.js and src/engine/index.js", () => {
  assert.equal(LEGACY.parseRirBounds, parseRirBounds);
  assert.equal(ENGINE.parseRirBounds, parseRirBounds);
});

test("legacy-progression.js keeps its export list; load.js no longer imports the legacy engine", async () => {
  const src = execFileSync("git", ["show", `${REF}:src/engine/legacy-progression.js`], { cwd: ROOT, encoding: "utf8" });
  const dir = mkdtempSync(join(tmpdir(), "rir-ref-"));
  const file = join(dir, "legacy-progression.ref.mjs");
  writeFileSync(file, src);
  const before = Object.keys(await import(pathToFileURL(file).href)).sort();
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(Object.keys(LEGACY).sort(), before);
  const load = readFileSync(resolve(ROOT, "src/engine/load.js"), "utf8");
  assert.doesNotMatch(load, /legacy-progression/);
  assert.match(load, /from "\.\/rir\.js"/);
});
