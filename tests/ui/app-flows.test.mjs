// Full-App flows in jsdom (guest, no network) — new suite written 2026-10-06.
// The real <App/> from index.html boots past the intro video with seeded guest data.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, $$ } from "../harness/ui.mjs";
import { bootGuestApp } from "../harness/app-boot.mjs";

after(unmount);

const benchSession = (iso, reps, planId = null, id = null) => ({
  id: id || `s-${iso}`,
  date: new Date(iso).toISOString(),
  planId,
  exercises: [{ id: `e-${iso}`, exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: [{ id: "x", target: "8-10", rir: "" }], sets: [{ weight: "100", reps: String(reps), rir: "" }] }],
});
const statValue = (label) => {
  const el = $$("p,span,div").find((e) => e.children.length === 0 && e.textContent.trim() === label);
  return el && el.previousElementSibling ? el.previousElementSibling.textContent.trim() : null;
};
const cloudWrites = () => globalThis.__nrSupabase.calls.filter((c) => c.kind === "table" && ["insert", "update", "upsert", "delete"].includes(c.op)).length;

describe("guest boot", () => {
  test("empty guest → Dashboard start card, guest namespace, no cloud writes", async () => {
    const { A } = await bootGuestApp();
    assert.ok(byTestId("dashboard-start-card"), "start card");
    assert.equal(A.__testState.activeDataNamespace, "guest");
    assert.equal(cloudWrites(), 0);
    assert.ok(!byTestId("account-init"), "no data-source choice for a guest");
  });
});

describe("Dashboard rolling 30 days (anchored on the last workout)", () => {
  test("last workout months ago → summary still shows that 30-day window", async () => {
    await bootGuestApp({ history: [benchSession("2026-06-01T10:00:00", 8), benchSession("2026-06-20T10:00:00", 9), benchSession("2026-01-01T10:00:00", 8)] });
    assert.equal(statValue("Treningów"), "2");
    assert.equal(statValue("Ćwiczeń"), "2");
    assert.equal(statValue("Progres"), "50%");
  });
});

describe("Dashboard unfinished workout card", () => {
  // A REAL draft shape: blocks built by the app's own buildBlocksFromPlan (as a live workout does),
  // wrapped like ActiveWorkout's draftDataRef, one set performed.
  let A0;
  const draft = async () => {
    A0 = A0 || (await import("../harness/load-app.mjs")).loadApp();
    const A = await A0;
    const nowDate = new Date().toISOString();
    const plan = { id: "P", name: "Push Day", exercises: [{ id: "pi1", exerciseId: "bench_press", setsDetail: [{ id: "s1", target: "8-10", rir: "" }, { id: "s2", target: "8-10", rir: "" }] }] };
    const blocks = A.buildBlocksFromPlan(plan, A.DEFAULT_EXERCISES, [], nowDate);
    blocks[0].items[0].sets[0] = { ...blocks[0].items[0].sets[0], weight: "100", reps: "8" };
    return { version: 1, savedAt: new Date(Date.now() - 60 * 1000).toISOString(), plan, backfillInfo: null, nowDate, startTime: Date.now() - 10 * 60 * 1000, blocks, blockIdx: 0, subIdx: 0, manualDuration: 45 };
  };

  test("draft present → 'Kontynuuj trening' card with the plan name", async () => {
    await bootGuestApp({ active_workout_draft: await draft() });
    const card = byTestId("dashboard-active-workout");
    assert.ok(card);
    assert.match(card.textContent, /Kontynuuj trening/);
    assert.match(card.textContent, /Push Day/);
    assert.ok(byTestId("dashboard-resume"));
  });

  test("tapping the card itself does NOT open the workout; only the resume button does", async () => {
    await bootGuestApp({ active_workout_draft: await draft() });
    await click(byTestId("dashboard-active-workout"));
    await flush(10, 2);
    assert.ok(byTestId("dashboard-active-workout"), "still on Dashboard");
    await click(byTestId("dashboard-resume"));
    await flush(10, 3);
    assert.ok(!byTestId("dashboard-active-workout"), "workout opened");
    assert.ok($$("input").some((i) => i.value === "100"), "the performed set (100 kg) is restored as it was left");
    assert.ok(localStorage.getItem("nextrep_guest_active_workout_draft_v1"), "resuming never deletes the draft");
  });
});

describe("Dashboard next plan", () => {
  test("next plan in stored order after the last plan session", async () => {
    const plans = [
      { id: "A", name: "Plan A", exercises: [{ id: "pa", exerciseId: "bench_press", setsDetail: [{ id: "1", target: "8-10", rir: "" }] }] },
      { id: "B", name: "Plan B", exercises: [{ id: "pb", exerciseId: "squat_barbell", setsDetail: [{ id: "1", target: "5", rir: "" }] }] },
    ];
    await bootGuestApp({ plans, history: [benchSession("2026-09-20T10:00:00", 9, "A")] });
    const card = byTestId("dashboard-next-plan");
    assert.ok(card);
    assert.match(card.textContent, /Plan B/);
  });
});

// Post-smoke-test fix — the exact production case: Statistics, muscle group "Klatka piersiowa".
// The card is the source of truth for comparisons; the chart keeps the real points but never shows
// its own last−first delta (which produced "−1560 kg" next to "Brak porównania").
describe("Statistics: muscle-group chart has no false delta", () => {
  const DAY = 86400000;
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  const bench = (reps, msAgo) => ({ id: `b-${msAgo}`, date: iso(msAgo), planId: "SP", planName: "SMOKE Plan A", exercises: [{ id: `eb-${msAgo}`, exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: [{ id: "x", target: "8-10", rir: "" }], sets: [1, 2, 3].map((i) => ({ id: `s${i}`, weight: "60", reps: String(reps), rir: "1-2" })) }] });
  const dips = (msAgo) => ({ id: `d-${msAgo}`, date: iso(msAgo), exercises: [{ id: `ed-${msAgo}`, exerciseId: "dips", name: "Dipsy", type: "bodyweightPlus", sets: [1, 2, 3].map((i) => ({ id: `s${i}`, weight: "10", reps: "8", rir: "1-2" })) }] });
  const pro = () => ({ manualPro: false, adUnlockExpiresAt: Date.now() + DAY });
  async function openChest(history) {
    await bootGuestApp({ history, pro_status: pro() });
    const nav = $$("button").find((b) => b.textContent.trim() === "Statystyki");
    await click(nav);
    await flush(10, 3);
    // "Cały czas" so the result never depends on which weekday the suite runs (default = this week)
    await click($$("button").find((b) => b.textContent.trim() === "Cały czas"));
    await flush(10, 2);
    const group = $$("button").find((b) => b.textContent.trim().startsWith("Klatka piersiowa"));
    assert.ok(group, "muscle-group card rendered");
    await click(group);
    await flush(10, 2);
    const title = $$("p").find((p) => p.textContent.trim() === "Objętość na trening z tą partią");
    assert.ok(title, "chart rendered");
    return { card: group, chart: title.parentElement.parentElement };
  }

  test("1800 → 2160 → Dipsy 240: card 'Brak porównania', chart without TrendingDown / −1560, real points kept", async () => {
    const { card, chart } = await openChest([bench(10, 3 * DAY), bench(12, 2 * DAY), dips(1 * DAY)]);
    assert.ok(byTestId("mgw-no-compare"));
    assert.match(byTestId("mgw-no-compare").textContent, /Brak porównania .* inny zestaw ćwiczeń/);
    assert.ok(!chart.querySelector('[data-icon="TrendingDown"]') && !chart.querySelector('[data-icon="TrendingUp"]'), "no delta icon in the chart header");
    assert.doesNotMatch(chart.textContent, /1560/);
    assert.match(chart.textContent, /240kg – 2160kg/, "points still the real workload (min 240, max 2160)");
    assert.ok(card);
  });

  test("1800 → 2160: card shows +360; the chart shows no contradicting direction", async () => {
    const { card, chart } = await openChest([bench(10, 3 * DAY), bench(12, 2 * DAY)]);
    assert.ok(!byTestId("mgw-no-compare"));
    assert.match(card.textContent, /\+360 kg vs/);
    assert.ok(card.querySelector('[data-icon="TrendingUp"]'));
    assert.ok(!chart.querySelector('[data-icon="TrendingDown"]'), "no red regression on the chart");
    assert.match(chart.textContent, /1800kg – 2160kg/);
  });
});
