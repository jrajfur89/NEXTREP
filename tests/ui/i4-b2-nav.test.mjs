// I4.1 — bottom navigation B2 (master NAV-B2 v1, canvas v81): 7 production targets in the same order,
// labels, active tab marked by aria-current (one only), nav landmark name, routing unchanged.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, click, $, $$, loadApp } from "../harness/ui.mjs";

useS1Profile();
after(async () => {
  await unmount();
});

describe("I4.1 B2 navigation", () => {
  const ORDER = [["dashboard", "Start"], ["exercises", "Ćwiczenia"], ["plans", "Plany"], ["startWorkout", "Trening"], ["stats", "Statystyki"], ["history", "Historia"], ["more", "Więcej"]];
  for (const [key] of ORDER) {
    test(`active tab ${key}: one aria-current, order and labels unchanged, tap routes to the production target`, async () => {
      const A = await loadApp();
      const calls = [];
      await mount(React.createElement(A.BottomNav, { screen: key, onNavigate: (to) => calls.push(to) }));
      await flush(1, 1);
      const nav = $('nav[aria-label="Nawigacja główna"]');
      assert.ok(nav, "nav landmark");
      assert.equal(nav.dataset.variant, "B2");
      const tabs = $$("button", nav);
      assert.deepEqual(tabs.map((b) => b.textContent.trim()), ORDER.map(([, l]) => l));
      assert.deepEqual(tabs.filter((b) => b.getAttribute("aria-current") === "page").map((b) => b.dataset.testid), [`nav-${key}`]);
      for (const b of tabs) await click(b);
      assert.deepEqual(calls, ORDER.map(([k]) => k));
      await unmount();
    });
  }
  test("a screen without its own tab (e.g. Pomiary) marks no tab — open decision, unchanged", async () => {
    const A = await loadApp();
    await mount(React.createElement(A.BottomNav, { screen: "measurements", onNavigate() {} }));
    assert.equal($$('nav button[aria-current="page"]').length, 0);
    await unmount();
  });
});
