// F1 guard: the modularization must keep every top-level name of the app (539 at a2b9ca0).
// A name that disappears or is renamed during F1 means code was lost or changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "../harness/load-app.mjs";

test("F1: the app exports exactly the baseline list of top-level names", async () => {
  const baseline = JSON.parse(readFileSync(new URL("../harness/f1-exports.json", import.meta.url), "utf8"));
  const A = await loadApp();
  const names = Object.keys(A).filter((n) => n !== "__testState").sort();
  assert.equal(names.length, baseline.count);
  assert.deepEqual(names, baseline.names);
});
