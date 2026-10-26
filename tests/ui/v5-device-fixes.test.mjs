// V5 / DEVICE BUGFIX (S22) — BUG-V5-01: a resumed unfinished workout continues its clock from the time
// it was left (the "Czas" of the Dashboard card), the clock keeps moving every second (also past one
// hour) and the duration saved in history does not include the time the workout spent closed.
// BUG-V5-02 / BUG-V5-03 (large system font) are checked on the built app: tests/e2e/v5-text-scale.e2e.mjs.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, $, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
const K = (n) => `nextrep1_guest_${n}_v1`;
const read = (n) => JSON.parse(localStorage.getItem(K(n)));
let A;
after(async () => {
  await unmount();
});
async function boot(seed = {}) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(K(n), JSON.stringify(v));
  await mount(React.createElement(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
}
const PLAN = { id: "plan-a", name: "Push A", exercises: [{ id: "pi-1", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", loadModel: null, restSeconds: 90, setsDetail: [{ id: "d1", target: "8-10", rir: "1-2" }] }] };
// a workout started `startedAgo` ms ago and left (last saved) `leftAgo` ms ago, with its one set done
async function draft(startedAgo, leftAgo) {
  A = A || (await loadApp());
  const blocks = A.buildBlocksFromPlan({ ...PLAN }, [], [], new Date().toISOString());
  blocks[0].items[0].sets[0] = { ...blocks[0].items[0].sets[0], weight: "60", reps: "8" };
  const now = Date.now();
  return { version: 1, savedAt: new Date(now - leftAgo).toISOString(), plan: { ...PLAN }, backfillInfo: null, nowDate: new Date(now - startedAgo).toISOString(), startTime: now - startedAgo, blocks, blockIdx: 0, subIdx: 0, manualDuration: 45 };
}
const clock = () => byTestId("aw-clock").textContent.trim();
const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
const toSec = (t) => t.split(":").reduce((a, p) => a * 60 + Number(p), 0);
const H = 3600000;
const MIN = 60000;

describe("BUG-V5-01 helpers", () => {
  test("awResumeStart: the start moves by the time the workout was closed; broken or future times are left as they are", async () => {
    A = A || (await loadApp());
    const now = 10 * H;
    const iso = (t) => new Date(t).toISOString();
    assert.equal(A.awResumeStart({ startTime: now - 3 * H, savedAt: iso(now - 3 * H + 10 * MIN) }, now), now - 10 * MIN, "10 min worked → clock at 10:00");
    assert.equal(A.awResumeStart({ startTime: now - 5000, savedAt: iso(now) }, now), now - 5000, "nothing to skip");
    assert.equal(A.awResumeStart({ startTime: now - H, savedAt: "broken" }, now), now - H, "no save time → the old start");
    assert.equal(A.awResumeStart({ startTime: now - H, savedAt: iso(now - 2 * H) }, now), now - H, "save before start (broken) → the old start");
    assert.equal(A.awResumeStart({ startTime: now - H, savedAt: iso(now + MIN) }, now), now - H, "save in the future (clock moved back) → the old start");
    assert.equal(A.awResumeStart({ startTime: "x", savedAt: iso(now) }, now), now, "no start → now");
  });
  test("awElapsedClock: M:SS below one hour (as before), H:MM:SS from one hour on — the seconds always move", async () => {
    A = A || (await loadApp());
    assert.equal(A.awElapsedClock(0), "0:00");
    assert.equal(A.awElapsedClock(1457), "24:17");
    assert.equal(A.awElapsedClock(3599), "59:59");
    assert.equal(A.awElapsedClock(3600), "1:00:00");
    assert.equal(A.awElapsedClock(3909), "1:05:09");
    assert.equal(A.awElapsedClock(3910), "1:05:10");
    assert.equal(A.fmtClock(3909), "1:05", "fmtClock (rest of the app) unchanged");
  });
});

describe("BUG-V5-01 resumed workout (Dashboard → Wznów trening)", () => {
  test("left at 10:00, closed for 2 h 50 min: card Czas 10:00 → the clock continues from 10:00 and ticks; history keeps ≈ 10 min, not ≈ 3 h", async () => {
    await boot({ active_workout_draft: await draft(3 * H, 3 * H - 10 * MIN) });
    assert.match(byTestId("dashboard-active-workout").textContent, /Czas10:00/);
    await click(byTestId("dashboard-resume"));
    await flush(10, 3);
    assert.ok(byTestId("active-workout"));
    const first = toSec(clock());
    assert.ok(first >= 600 && first <= 602, `continues from the remembered time, not from the original start (${clock()})`);
    await wait(2200);
    await flush(2, 1);
    const later = toSec(clock());
    assert.ok(later >= first + 1, `the clock moves (${first} → ${later})`);
    assert.match(byTestId("aw-clock").getAttribute("aria-label"), /^Czas treningu 10 minut/);
    // the next draft keeps the shifted start, so another interruption keeps the same time base
    const saved = read("active_workout_draft");
    assert.ok(Date.now() - saved.startTime < 11 * MIN, "draft start shifted");
    // finish → history
    while (!$('[data-act="finish"]')) {
      await click($('[data-act="next"]'));
      await flush(5, 2);
    }
    await click($('[data-act="finish"]'));
    await flush(5, 3);
    await click(byTestId("wcs-finish"));
    await flush(10, 5);
    const s = read("history")[0];
    assert.ok(s.durationSec >= 600 && s.durationSec < 620, `durationSec ${s.durationSec} ≈ 10 min (before the fix ≈ 3 h)`);
  });
  test("a workout resumed past one hour shows H:MM:SS and the seconds move", async () => {
    await boot({ active_workout_draft: await draft(5 * H, 5 * H - 65 * MIN) });
    await click(byTestId("dashboard-resume"));
    await flush(10, 3);
    const a = clock();
    assert.match(a, /^1:05:0\d$/, a);
    await wait(2200);
    await flush(2, 1);
    assert.notEqual(clock(), a, "moves within seconds, not once a minute");
  });
  test("a new workout (no draft) still starts at 0:00", async () => {
    await boot({ plans: [PLAN] });
    await click(byTestId("dashboard-start"));
    await flush(10, 4);
    assert.match(clock(), /^0:0\d$/);
  });
});
