// DES-01 / D2-FIX-01 — the 13 corrections of the Claude Design conformance audit (claude/des-01-d2-conformance-audit.md),
// checked against the values of the DES-01 v4 boards (Main, D01, D02, D02b, D03, D04, D04b, D05, D09, D09c, D13b, D15c).
// P2: R01 tile, R02 badges, R03 atlas-name line, R04 switch, R07 menu, R08 name sheet. P3: R05, R06, R09–R13.
// Behaviour kept: heart „Ulubione” + aria-pressed, Back, „Cofnij”, validation, menu actions.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $, $$, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
const h = React.createElement;
const K = (n) => `nextrep1_guest_${n}_v1`;
const NOW = "2026-10-26T10:00:00.000Z";
const SMITH = "bench_press_smith_flat";
const SMITH_NAME = "Wyciskanie na maszynie Smitha na ławce poziomej";
const base = { scope: "private", secondaryMuscles: [], variantAttributes: [], measurementType: "weight_reps", implements: null, laterality: "bilateral", repsCounting: "total", status: "active", archivedReason: null, entryRev: 1, createdAt: NOW, updatedAt: NOW, archivedAt: null };
const OWN = [
  { ...base, exerciseId: "00000000-0000-4000-8000-000000000001", namePl: "Hip thrust na maszynie", equipment: ["barbell", "bench"], primaryMuscles: ["gluteus_maximus"], loadModel: "barbell_total" },
  { ...base, exerciseId: "00000000-0000-4000-8000-000000000002", namePl: "Wiosłowanie na maszynie T-bar", equipment: ["barbell"], primaryMuscles: ["latissimus_dorsi"], loadModel: "barbell_total" },
  { ...base, exerciseId: "00000000-0000-4000-8000-000000000003", namePl: "Wyciskanie hantli na ławce skośnej 30°", equipment: ["dumbbell", "bench"], primaryMuscles: ["pectoralis_major"], loadModel: "dumbbell_pair", implements: 2 },
];
const ARCH = { ...base, exerciseId: "00000000-0000-4000-8000-000000000004", namePl: "Przysiad bułgarski z hantlami", equipment: ["dumbbell", "bench"], primaryMuscles: ["quadriceps"], loadModel: "dumbbell_pair", implements: 2, status: "archived", archivedReason: "Zarchiwizowane przez użytkownika", archivedAt: NOW };
const SEED = {
  user_exercises: [...OWN, ARCH],
  favourites: ["pushup_standard", ARCH.exerciseId, SMITH, OWN[2].exerciseId].map((exerciseId) => ({ exerciseId, addedAt: NOW })),
  exercise_names: { [SMITH]: { name: "Smith klata", updatedAt: NOW } },
  plans: [{ id: "p1", name: "Push", exercises: [{ id: "i1", exerciseId: OWN[2].exerciseId, privateExerciseId: OWN[2].exerciseId, setsDetail: [{ id: "d1", target: "8", rir: "" }] }, { id: "i2", exerciseId: OWN[2].exerciseId, privateExerciseId: OWN[2].exerciseId, setsDetail: [] }] }, { id: "p2", name: "Pull", exercises: [{ id: "i3", exerciseId: OWN[2].exerciseId, privateExerciseId: OWN[2].exerciseId, setsDetail: [] }] }],
  history: [{ id: "s1", date: "2026-10-20T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: OWN[2].exerciseId, loadSnapshot: { source: "private", privateExerciseId: OWN[2].exerciseId }, sets: [] }] }],
};
let A;
after(async () => {
  await unmount();
});
const text = (el) => (el ? el.textContent : "");
const css = (el, p) => el.style.getPropertyValue(p);
async function boot(seed = SEED) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.atlasBrowseReset();
  A.invalidateUserExerciseCatalog();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(K(n), JSON.stringify(v));
  await mount(h(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
  await click(byTestId("nav-exercises"));
  await flush(10, 3);
}
const back = async () => {
  await act(async () => window.dispatchEvent(new Event("popstate")));
  await flush(5, 2);
};
const rowOf = (id) => $(`[data-exercise-id="${id}"]`);

describe("P2", () => {
  test("R01 — E01 tiles: min-height 104, icon in a 36 × 36 square (radius 10, brand tint), chevron at the top, name + count at the bottom; „user-round” kept", async () => {
    await boot();
    for (const id of ["atlas-tile-favourites", "atlas-tile-mine"]) {
      const t = byTestId(id);
      assert.equal(css(t, "min-height"), "104px", id);
      assert.equal(css(t, "padding"), "12px 12px 10px 14px");
      assert.equal(css(t, "border-radius"), "16px");
      const sq = $("[data-tile-icon]", t);
      assert.equal(css(sq, "width"), "36px");
      assert.equal(css(sq, "height"), "36px");
      assert.equal(css(sq, "border-radius"), "10px");
      assert.equal(css(sq, "background"), "rgba(255, 133, 27, 0.1)");
      const top = sq.parentElement;
      assert.equal(top.children.length, 2, "icon square + chevron in the top row");
      assert.ok(t.lastElementChild.contains(byTestId(`${id}-count`)), "name and count at the bottom");
      assert.equal(t.disabled, false);
    }
    assert.equal(text(byTestId("atlas-tile-favourites-count")), "4 ćwiczenia");
    assert.equal(text(byTestId("atlas-tile-mine-count")), "3 ćwiczenia");
    assert.equal($("[data-tile-icon] svg", byTestId("atlas-tile-mine")).getAttribute("data-lucide") || "UserRound", "UserRound");
  });

  test("R02 — badges: 6 px rectangle, padding 1/8/1/6, icon 12; „Własne” rgba(255,106,0,.12) / #FFB27A; „Twoja nazwa” #222224 / #D9D9D9; „Zarchiwizowane” #66666A / #B8B8B8", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    const own = $('[data-badge="own"]');
    const name = $('[data-badge="name"]');
    const arch = $('[data-badge="archived"]');
    for (const b of [own, name, arch]) {
      assert.equal(css(b, "border-radius"), "6px", "no pill");
      assert.equal(css(b, "padding"), "1px 8px 1px 6px");
      assert.equal(css(b, "font-size"), "14px");
      assert.equal(css(b, "line-height"), "18px");
    }
    assert.equal(css(own, "background"), "rgba(255, 106, 0, 0.12)");
    assert.equal(css(own, "color"), "rgb(255, 178, 122)");
    assert.equal(css(own, "border"), "1px solid rgba(255, 133, 27, 0.45)");
    assert.equal(css(name, "background"), "rgb(34, 34, 36)");
    assert.equal(css(name, "color"), "rgb(217, 217, 217)");
    assert.equal(css(arch, "border"), "1px solid rgb(102, 102, 106)");
    assert.equal(css(arch, "color"), "rgb(184, 184, 184)");
    assert.equal(text(own), "Własne");
    assert.equal(css(own.parentElement, "gap"), "6px");
  });

  test("R03 — a row with a private name: name, „W Atlasie: …” (15/19 #9A9A9A), „Partia · sprzęt”, badge; same exerciseId; history untouched", async () => {
    await boot();
    const history = localStorage.getItem(K("history"));
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    const row = rowOf(SMITH);
    const lines = [...row.querySelector("span").children].map((e) => text(e));
    assert.deepEqual(lines.slice(0, 3), ["Smith klata", `W Atlasie: ${SMITH_NAME}`, "Klatka piersiowa · Maszyna Smitha · Ławka"]);
    const al = $("[data-row-atlas-name]", row);
    assert.equal(css(al, "font-size"), "15px");
    assert.equal(css(al, "line-height"), "19px");
    assert.equal(css(al, "color"), "rgb(154, 154, 154)");
    assert.equal(row.dataset.exerciseId, SMITH);
    assert.equal($("[data-row-atlas-name]", rowOf("pushup_standard")), null, "no private name → no line");
    assert.equal(localStorage.getItem(K("history")), history);
    // the names section of Moje ćwiczenia has the same row
    await back();
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    const nameRow = $(`[data-testid="atlas-name-row"][data-exercise-id="${SMITH}"]`);
    assert.match(text(nameRow), new RegExp(`^Smith klataW Atlasie: ${SMITH_NAME}Klatka piersiowa · Maszyna Smitha · ŁawkaTwoja nazwa`));
  });

  test("R04 — Moje: add → search + „Filtry” → switch → counter; counts from the data; ✓ on the chosen one; radio semantics kept", async () => {
    await boot();
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    const order = [...byTestId("atlas-mine").children].map((e) => e.dataset.testid || (e.getAttribute("role") === "search" ? "search" : e.tagName)).filter((x) => ["atlas-mine-add", "search", "atlas-mine-view", "atlas-results"].includes(x) || (x && x.startsWith && x.startsWith("atlas-mine-add")));
    const idx = (id) => [...byTestId("atlas-mine").querySelectorAll("*")].indexOf(id === "search" ? $('[data-testid="atlas-search"]') : byTestId(id));
    assert.ok(idx("atlas-mine-add") < idx("search") && idx("search") < idx("atlas-mine-view") && idx("atlas-mine-view") < idx("atlas-results"), `order ${JSON.stringify(order)}`);
    assert.equal(text(byTestId("atlas-mine-view-active-count")), "3");
    assert.equal(text(byTestId("atlas-mine-view-archived-count")), "1");
    const on = byTestId("atlas-mine-view-active");
    const off = byTestId("atlas-mine-view-archived");
    assert.equal(on.getAttribute("role"), "radio");
    assert.equal(on.getAttribute("aria-checked"), "true");
    assert.ok($("svg", on), "✓ on the chosen option");
    assert.equal($("svg", off), null);
    assert.equal(css(on, "border"), "1px solid rgb(255, 133, 27)");
    assert.equal(css(on, "background"), "rgba(255, 133, 27, 0.14)");
    assert.equal(css(off, "background"), "rgb(34, 34, 36)");
    await click(off);
    await flush(3, 2);
    assert.equal(byTestId("atlas-mine-view-archived").getAttribute("aria-checked"), "true");
    assert.ok($("svg", byTestId("atlas-mine-view-archived")));
  });

  test("R07 — menu: title = the exercise's name, subtitle by kind, icons pencil / x / git-branch, „Anuluj”; actions unchanged", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    await click(rowOf(SMITH));
    await flush(5, 2);
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    const dlg = $('[data-testid="atlas-card-menu"] [role="dialog"]');
    assert.equal(text($("h2", dlg)), "Smith klata");
    assert.equal(text($("h2", dlg).nextElementSibling), `W Atlasie: ${SMITH_NAME}`);
    assert.equal(text(byTestId("atlas-card-menu-cancel")), "Anuluj");
    assert.equal(byTestId("atlas-menu-variant").disabled, true, "D3 action still unavailable");
    await click(byTestId("atlas-card-menu-cancel"));
    await flush(3, 2);
    assert.equal(byTestId("atlas-card-menu"), null, "„Anuluj” closes");
    assert.equal(document.activeElement, byTestId("atlas-detail-more"));
    // own exercise: „Własne · w N planach i M zapisanych treningach” from the real data
    await back();
    await back();
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    await click(rowOf(OWN[2].exerciseId));
    await flush(5, 2);
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    const d2 = $('[data-testid="atlas-card-menu"] [role="dialog"]');
    assert.equal(text($("h2", d2)), OWN[2].namePl);
    assert.equal(text($("h2", d2).nextElementSibling), "Własne · w 2 planach i 1 zapisanym treningu");
    for (const b of [byTestId("atlas-menu-edit"), byTestId("atlas-menu-archive")]) assert.equal(b.disabled, true);
  });

  test("R08 — name sheet: the atlas name in a read-only field, „Twoja nazwa · wymagane”, dots, „Zapisz nazwę” + „Anuluj”; validation and saving unchanged", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    await click(rowOf(SMITH));
    await flush(5, 2);
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    await click(byTestId("atlas-menu-rename"));
    await flush(3, 2);
    const ro = byTestId("atlas-name-atlas");
    assert.equal(ro.getAttribute("role"), "textbox");
    assert.equal(ro.getAttribute("aria-readonly"), "true");
    assert.equal(text(ro), SMITH_NAME);
    assert.equal(css(ro, "background"), "rgb(26, 26, 27)");
    assert.equal(css(ro, "border-radius"), "12px");
    assert.equal(text(byTestId("atlas-name-label")), "Twoja nazwa · wymagane");
    const input = byTestId("atlas-name-input");
    assert.equal(input.getAttribute("aria-required"), "true");
    assert.equal(document.activeElement, input);
    assert.equal($$("[data-rule-dot]").length, 3);
    assert.equal(text(byTestId("atlas-name-cancel")), "Anuluj");
    await type(input, "");
    await click(byTestId("atlas-name-save"));
    await flush(3, 2);
    assert.equal(input.getAttribute("aria-invalid"), "true", "validation kept");
    await type(byTestId("atlas-name-input"), "Smith płasko");
    await click(byTestId("atlas-name-save"));
    await flush(3, 2);
    assert.equal(JSON.parse(localStorage.getItem(K("exercise_names")))[SMITH].name, "Smith płasko");
    assert.equal(text(byTestId("atlas-detail-name")), "Smith płasko");
  });
});

describe("P3", () => {
  test("R05 + R06 — archived view: information box (border #2A2A2A, #0F0F10, info icon) and a dimmed name (#B8B8B8)", async () => {
    await boot();
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    await click(byTestId("atlas-mine-view-archived"));
    await flush(3, 2);
    const note = byTestId("atlas-mine-archived-note");
    assert.equal(css(note, "border"), "1px solid rgb(42, 42, 42)");
    assert.equal(css(note, "background"), "rgb(15, 15, 16)");
    assert.ok($("svg", note), "info icon");
    assert.match(text(note), /Ich historia jest zachowana\./);
    assert.equal(css($("[data-row-name]", rowOf(ARCH.exerciseId)), "color"), "rgb(184, 184, 184)");
    await click(byTestId("atlas-mine-view-active"));
    await flush(3, 2);
    assert.equal(css($("[data-row-name]", rowOf(OWN[0].exerciseId)), "color"), "rgb(255, 255, 255)", "active rows stay white");
  });
  test("R09 — empty Ulubione: outline heart, the board text", async () => {
    await boot({});
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    const msg = byTestId("atlas-favourites-empty");
    assert.match(text(msg), /Na karcie ćwiczenia dotknij serca — ćwiczenie pojawi się tutaj\./);
    assert.notEqual($("svg", msg).getAttribute("fill"), "#FF851B", "outline heart");
  });
  test("R10 — placeholders „Szukaj w ulubionych” / „Szukaj w moich ćwiczeniach”; accessible names kept", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    const f = $('[data-testid="atlas-search"] input');
    assert.equal(f.getAttribute("placeholder"), "Szukaj w ulubionych");
    assert.match(text(f.closest("label")), /Szukaj w Ulubionych/);
    await back();
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    assert.equal($('[data-testid="atlas-search"] input').getAttribute("placeholder"), "Szukaj w moich ćwiczeniach");
  });
  test("R11 — DS-C08 message with circle-check (#42C98A); „Cofnij” kept", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    await click(rowOf("pushup_standard"));
    await flush(5, 2);
    await click(byTestId("atlas-detail-heart"));
    await flush(3, 2);
    await back();
    const t = byTestId("atlas-list-toast");
    assert.ok($('[data-icon="CheckCircle2"]', t), "circle-check (lucide CheckCircle2; the stub names the component)");
    await click(byTestId("atlas-list-toast-undo"));
    await flush(3, 2);
    assert.ok(rowOf("pushup_standard"), "undo still works");
  });
  test("R12 — archived card: the state message under the equipment line", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    await click(rowOf(ARCH.exerciseId));
    await flush(5, 2);
    const eq = byTestId("atlas-detail-primary-equipment");
    const msg = byTestId("atlas-detail-archived");
    assert.ok(eq.compareDocumentPosition(msg) & Node.DOCUMENT_POSITION_FOLLOWING, "message after the equipment line");
    assert.deepEqual($$('[role="tab"]').map(text), ["Ćwiczenie", "Historia", "Warianty"]);
  });
  test("R13 — Moje: no switch without archived exercises (D05); the switch appears when there are some", async () => {
    await boot({});
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    assert.ok(byTestId("atlas-mine-empty"));
    assert.equal(byTestId("atlas-mine-view"), null);
    assert.equal($('[data-testid="atlas-search"]'), null);
    await boot({ user_exercises: [OWN[0]] });
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    assert.equal(byTestId("atlas-mine-view"), null, "only active ones → no switch");
    await boot({ user_exercises: [ARCH] });
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
    assert.ok(byTestId("atlas-mine-view"), "archived ones → the switch leads to them");
    assert.equal(text(byTestId("atlas-mine-view-active-count")), "0");
  });
});

describe("§5 accessibility kept", () => {
  test("heart: constant name „Ulubione”, aria-pressed, 44 × 44", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    await click(rowOf(SMITH));
    await flush(5, 2);
    const heart = byTestId("atlas-detail-heart");
    assert.equal(heart.getAttribute("aria-label"), "Ulubione");
    assert.equal(heart.getAttribute("aria-pressed"), "true");
    assert.equal(css(heart, "width"), "44px");
    assert.equal(css(heart, "height"), "44px");
    await click(heart);
    await flush(3, 2);
    assert.equal(byTestId("atlas-detail-heart").getAttribute("aria-label"), "Ulubione", "the name does not change with the state");
    assert.equal(byTestId("atlas-detail-heart").getAttribute("aria-pressed"), "false");
  });
});
