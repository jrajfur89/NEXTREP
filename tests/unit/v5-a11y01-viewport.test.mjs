// V5 / A11Y-01 (owner's decision 25.10.2026): the viewport must not block zooming — no maximum-scale
// and no user-scalable=no (WCAG 1.4.4, axe meta-viewport). The other viewport parameters stay as they
// were (width=device-width, initial-scale=1, viewport-fit=cover; the native build drops viewport-fit
// itself in tools/build-web.mjs). The built app is checked by e2e/i5-a11y.e2e.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const metas = [...html.matchAll(/<meta\s+name="viewport"\s+content="([^"]*)"/g)].map((m) => m[1]);

test("index.html: one viewport, zooming not blocked, the other parameters unchanged", () => {
  assert.equal(metas.length, 1);
  const parts = metas[0].split(",").map((p) => p.trim());
  assert.deepEqual(parts, ["width=device-width", "initial-scale=1", "viewport-fit=cover"]);
  assert.doesNotMatch(metas[0], /maximum-scale/i);
  assert.doesNotMatch(metas[0], /user-scalable\s*=\s*(no|0)/i);
});
