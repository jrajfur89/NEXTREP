// DES-01 / D2-FIX-02 — hotfix after the S22 acceptance of D2.
// P1: Android Back dead after the card's name sheet. Cause: on Back the module PUSHED a history entry while
// handling popstate (no user gesture). Chromium / Android WebView then marks the document's entries as
// skippable, WebView.canGoBack() turns false and @capacitor/app 8 (no backButton listener) ignores every
// further Back. The model below plays that WebView: entries are counted, a push without a tap since the last
// navigation makes Back dead, the system Back with the soft keyboard up only hides the keyboard (the IME
// takes it), JS history.back() pops one entry.
// P2: „Aktywne 0 · Zarchiwizowane 0” — the switch of Moje ćwiczenia also without own exercises.
import { describe, test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, click, type, $, $$, byTestId, loadApp } from "../harness/ui.mjs";

useS1Profile();
const h = React.createElement;
const K = (n) => `nextrep1_guest_${n}_v1`;
const NOW = "2026-10-26T10:00:00.000Z";
const SMITH = "bench_press_smith_flat";
const base = { scope: "private", secondaryMuscles: [], variantAttributes: [], measurementType: "weight_reps", implements: null, laterality: "bilateral", repsCounting: "total", status: "active", archivedReason: null, entryRev: 1, createdAt: NOW, updatedAt: NOW, archivedAt: null };
const OWN = { ...base, exerciseId: "00000000-0000-4000-8000-000000000001", namePl: "Hip thrust na maszynie", equipment: ["barbell", "bench"], primaryMuscles: ["gluteus_maximus"], loadModel: "barbell_total" };
const ARCH = { ...base, exerciseId: "00000000-0000-4000-8000-000000000004", namePl: "Przysiad bułgarski z hantlami", equipment: ["dumbbell", "bench"], primaryMuscles: ["quadriceps"], loadModel: "dumbbell_pair", implements: 2, status: "archived", archivedReason: "Zarchiwizowane przez użytkownika", archivedAt: NOW };
const NAMES = { exercise_names: { [SMITH]: { name: "Smith klata", updatedAt: NOW } } };
const FAVS = { favourites: [{ exerciseId: SMITH, addedAt: NOW }, { exerciseId: "pushup_standard", addedAt: NOW }] };

let A;
let wv = null;
let vv = null;
after(async () => {
  await unmount();
});
afterEach(() => {
  if (wv) wv.restore();
  wv = null;
  vv = null;
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true, writable: true });
});
const text = (el) => (el ? el.textContent : "");

// ---- the Android WebView + @capacitor/app 8 model ----------------------------------------------------------
function installWebView() {
  const hist = window.history;
  const orig = { pushState: hist.pushState, back: hist.back };
  const st = { index: 0, activated: false, skippable: false, inPop: false, pushesInPop: 0, pendingBack: 0, popstates: 0 };
  const onTap = () => (st.activated = true); // a tap / a key on the page = user activation
  document.addEventListener("click", onTap, true);
  document.addEventListener("input", onTap, true);
  hist.pushState = function () {
    if (st.inPop) st.pushesInPop += 1;
    if (!st.activated) st.skippable = true; // no gesture since the last navigation → canGoBack() false
    st.activated = false;
    st.index += 1;
  };
  hist.back = function () {
    st.pendingBack += 1; // JS back: one pop, delivered asynchronously
  };
  const pop = async () => {
    st.index -= 1;
    st.activated = false;
    st.inPop = true;
    st.popstates += 1;
    try {
      await act(async () => window.dispatchEvent(new Event("popstate")));
    } finally {
      st.inPop = false;
    }
    await flush(5, 2);
  };
  st.settle = async () => {
    await flush(3, 2);
    while (st.pendingBack > 0) {
      st.pendingBack -= 1;
      if (st.index > 0) await pop();
    }
  };
  // the system Back: the IME takes it while the keyboard is up; otherwise WebView.goBack() if canGoBack()
  st.systemBack = async ({ imeTakesKeyboardBack = true } = {}) => {
    await st.settle();
    if (imeTakesKeyboardBack && vv && vv.height < window.innerHeight - 120) {
      await setKeyboard(false);
      return "ime";
    }
    if (st.index <= 0 || st.skippable) return "dead";
    await pop();
    await st.settle();
    return "popped";
  };
  st.restore = () => {
    hist.pushState = orig.pushState;
    hist.back = orig.back;
    document.removeEventListener("click", onTap, true);
    document.removeEventListener("input", onTap, true);
  };
  return st;
}
function installViewport() {
  vv = new window.EventTarget();
  vv.height = window.innerHeight;
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true, writable: true });
}
async function setKeyboard(open) {
  vv.height = open ? window.innerHeight - 320 : window.innerHeight;
  await act(async () => vv.dispatchEvent(new window.Event("resize")));
  await flush(3, 2);
}

async function boot(seed = {}, { keyboard = false } = {}) {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.atlasBrowseReset();
  A.invalidateUserExerciseCatalog();
  A.atlasCardOverlay.expectedPops = 0;
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  for (const [n, v] of Object.entries(seed)) localStorage.setItem(K(n), JSON.stringify(v));
  if (keyboard) installViewport();
  await mount(h(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
  wv = installWebView();
  await click(byTestId("nav-exercises"));
  await flush(10, 3);
}
const cardOpen = () => Boolean(byTestId("atlas-detail"));
const sheetOpen = () => Boolean(byTestId("atlas-card-menu") || byTestId("atlas-name-sheet") || byTestId("atlas-name-input"));
async function openChestCard() {
  await click(byTestId("atlas-category-chest"));
  await flush(5, 2);
  assert.equal(A.atlasBrowseMemory.level, "list");
  await click($(`[data-testid="atlas-row"][data-exercise-id="${SMITH}"]`) || $('[data-testid="atlas-row"]'));
  await flush(5, 2);
  assert.ok(cardOpen());
}
async function openNameSheet() {
  await click(byTestId("atlas-detail-more"));
  await flush(3, 2);
  assert.ok(byTestId("atlas-card-menu"));
  await click(byTestId("atlas-menu-rename"));
  await flush(3, 2);
  assert.ok(byTestId("atlas-name-input"));
}
// the card is closed and the list it was opened from is back (same level / category); Back stays alive
async function assertBackToChestList() {
  assert.equal(cardOpen(), false, "the card is closed");
  assert.equal(A.atlasBrowseMemory.level, "list");
  assert.equal(A.atlasBrowseMemory.categoryCode, "chest", "the source list is kept");
  assert.ok($$('[data-testid="atlas-row"]').length > 0);
  assert.equal(wv.skippable, false, "no entry pushed without a gesture — WebView can still go back");
  assert.equal(wv.pushesInPop, 0, "nothing pushed while handling popstate");
  assert.equal(await wv.systemBack(), "popped", "the next Back still works");
  assert.equal(A.atlasBrowseMemory.level, "home", "list → E01");
}

describe("P1 — Android Back from the card (WebView model)", () => {
  test("control: list → card → Back → the list", async () => {
    await boot();
    await openChestCard();
    assert.equal(await wv.systemBack(), "popped");
    await assertBackToChestList();
  });

  test("the S22 scenario: keyboard (IME) → sheet → card; 1st Back hides the keyboard, 2nd closes the sheet, 3rd returns to the list", async () => {
    await boot({}, { keyboard: true });
    await openChestCard();
    await openNameSheet();
    await click(byTestId("atlas-name-input")); // tap into the field
    byTestId("atlas-name-input").focus();
    await setKeyboard(true);
    assert.equal(await wv.systemBack(), "ime", "1st Back: the keyboard");
    assert.ok(sheetOpen(), "the sheet stays");
    assert.equal(await wv.systemBack(), "popped", "2nd Back");
    assert.equal(sheetOpen(), false, "the sheet is closed");
    assert.ok(cardOpen(), "the card stays");
    assert.equal(await wv.systemBack(), "popped", "3rd Back");
    await assertBackToChestList();
  });

  test("the keyboard Back delivered to the page (popstate while the keyboard is up): keyboard → sheet → list, never dead", async () => {
    await boot({}, { keyboard: true });
    await openChestCard();
    await openNameSheet();
    await click(byTestId("atlas-name-input"));
    byTestId("atlas-name-input").focus();
    await setKeyboard(true);
    assert.equal(await wv.systemBack({ imeTakesKeyboardBack: false }), "popped");
    await setKeyboard(false); // the blur hides it
    assert.ok(sheetOpen(), "1st Back: only the keyboard, the sheet stays (V5 K4)");
    assert.notEqual(document.activeElement, byTestId("atlas-name-input"));
    assert.equal(await wv.systemBack(), "popped");
    assert.equal(sheetOpen(), false, "2nd Back: the sheet");
    assert.ok(cardOpen());
    assert.equal(await wv.systemBack(), "popped");
    await assertBackToChestList();
  });

  test("menu opened and closed by Back, then Back → the list", async () => {
    await boot();
    await openChestCard();
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    assert.equal(await wv.systemBack(), "popped");
    assert.equal(byTestId("atlas-card-menu"), null, "Back closes the menu");
    assert.ok(cardOpen());
    assert.equal(document.activeElement, byTestId("atlas-detail-more"), "focus back on ⋮");
    assert.equal(await wv.systemBack(), "popped");
    await assertBackToChestList();
  });

  test("menu closed on screen („Anuluj”, ✕, scrim), then ONE Back → the list (the sheet's entry went with it)", async () => {
    await boot();
    await openChestCard();
    for (const closer of ["atlas-card-menu-cancel", "atlas-card-menu-close", "atlas-card-menu-scrim"]) {
      await click(byTestId("atlas-detail-more"));
      await flush(3, 2);
      await click(byTestId(closer));
      await wv.settle();
      assert.equal(byTestId("atlas-card-menu"), null, closer);
      assert.ok(cardOpen(), `${closer}: the card stays (the pop of the sheet's entry is consumed)`);
    }
    assert.equal(await wv.systemBack(), "popped");
    await assertBackToChestList();
  });

  test("name edit cancelled („Anuluj”), then Back → the list", async () => {
    await boot();
    await openChestCard();
    await openNameSheet();
    await type(byTestId("atlas-name-input"), "Nie zapisuj");
    await click(byTestId("atlas-name-cancel"));
    await wv.settle();
    assert.equal(sheetOpen(), false);
    assert.ok(cardOpen());
    assert.equal(localStorage.getItem(K("exercise_names")), null, "nothing saved");
    assert.equal(await wv.systemBack(), "popped");
    await assertBackToChestList();
  });

  test("private name saved, then Back → the list; the name and „Cofnij” of the card unchanged", async () => {
    await boot();
    await openChestCard();
    const id = A.atlasBrowseMemory.openExerciseId;
    await openNameSheet();
    await type(byTestId("atlas-name-input"), "Moja klata");
    await click(byTestId("atlas-name-save"));
    await wv.settle();
    assert.equal(sheetOpen(), false);
    assert.ok(cardOpen());
    assert.equal(text(byTestId("atlas-detail-name")), "Moja klata");
    assert.equal(JSON.parse(localStorage.getItem(K("exercise_names")))[id].name, "Moja klata");
    assert.match(text(byTestId("atlas-detail-toast")), /Zapisano nazwę: Moja klata/);
    assert.equal(await wv.systemBack(), "popped");
    await assertBackToChestList();
  });

  test("private name removed from the menu, then Back → the list", async () => {
    await boot(NAMES);
    await openChestCard();
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    await click(byTestId("atlas-menu-remove-name"));
    await wv.settle();
    assert.equal(sheetOpen(), false);
    assert.ok(cardOpen());
    assert.equal(await wv.systemBack(), "popped");
    await assertBackToChestList();
  });

  test("card opened from Ulubione: sheet → keyboard → Back ×3 → Ulubione, then E01", async () => {
    await boot(FAVS, { keyboard: true });
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    await click($(`[data-exercise-id="${SMITH}"]`));
    await flush(5, 2);
    await openNameSheet();
    await click(byTestId("atlas-name-input"));
    byTestId("atlas-name-input").focus();
    await setKeyboard(true);
    assert.equal(await wv.systemBack(), "ime");
    assert.equal(await wv.systemBack(), "popped");
    assert.equal(sheetOpen(), false);
    assert.equal(await wv.systemBack(), "popped");
    assert.equal(cardOpen(), false);
    assert.equal(A.atlasBrowseMemory.level, "favourites", "back on Ulubione");
    assert.ok(byTestId("atlas-favourites"));
    assert.equal(wv.skippable, false);
    assert.equal(wv.pushesInPop, 0);
    assert.equal(await wv.systemBack(), "popped");
    assert.equal(A.atlasBrowseMemory.level, "home");
  });

  test("the list's state is kept: filters chosen on the list come back after card → sheet → Back ×2", async () => {
    await boot();
    await click(byTestId("atlas-category-chest"));
    await flush(5, 2);
    A.atlasBrowseMemory.selection = { equipment: ["barbell"] };
    A.atlasBrowseMemory.sort = "az";
    await click($('[data-testid="atlas-row"]'));
    await flush(5, 2);
    await click(byTestId("atlas-detail-more"));
    await flush(3, 2);
    await wv.systemBack();
    await wv.systemBack();
    assert.equal(cardOpen(), false);
    assert.deepEqual(A.atlasBrowseMemory.selection, { equipment: ["barbell"] });
    assert.equal(A.atlasBrowseMemory.sort, "az");
    assert.equal(A.atlasBrowseMemory.categoryCode, "chest");
    assert.equal(wv.skippable, false);
  });
});

describe("P2 — the switch of Moje ćwiczenia without own exercises", () => {
  const openMine = async () => {
    await click(byTestId("atlas-tile-mine"));
    await flush(5, 2);
  };
  const sw = () => byTestId("atlas-mine-view");
  test("zero own exercises, zero names: „Aktywne 0 · Zarchiwizowane 0”, ✓ on Aktywne, the empty state of each view", async () => {
    await boot();
    await openMine();
    assert.ok(sw(), "the switch is shown");
    assert.equal(text(byTestId("atlas-mine-view-active-count")), "0");
    assert.equal(text(byTestId("atlas-mine-view-archived-count")), "0");
    assert.equal(byTestId("atlas-mine-view-active").getAttribute("aria-checked"), "true");
    assert.ok($("svg", byTestId("atlas-mine-view-active")), "✓ on the chosen one");
    assert.equal($("svg", byTestId("atlas-mine-view-archived")), null);
    assert.ok(byTestId("atlas-mine-empty"), "Aktywne: the D05 empty state");
    assert.ok(sw().compareDocumentPosition(byTestId("atlas-mine-empty")) & Node.DOCUMENT_POSITION_FOLLOWING, "empty state under the switch");
    await click(byTestId("atlas-mine-view-archived"));
    await flush(3, 2);
    assert.equal(byTestId("atlas-mine-view-archived").getAttribute("aria-checked"), "true");
    assert.ok($("svg", byTestId("atlas-mine-view-archived")));
    assert.equal($("svg", byTestId("atlas-mine-view-active")), null);
    assert.ok(byTestId("atlas-mine-archived-empty"), "Zarchiwizowane: its empty state");
    assert.ok(byTestId("atlas-mine-archived-note"));
    assert.equal(byTestId("atlas-mine-empty"), null);
    await click(byTestId("atlas-mine-view-active"));
    await flush(3, 2);
    assert.ok(byTestId("atlas-mine-empty"), "switching back");
    assert.equal(localStorage.getItem(K("user_exercises")), null, "no record created");
  });

  test("only private names of Atlas exercises (the S22 state): the switch 0 / 0 under the search, the names section stays", async () => {
    await boot(NAMES);
    await openMine();
    assert.ok(sw());
    assert.equal(text(byTestId("atlas-mine-view-active-count")), "0");
    assert.equal(text(byTestId("atlas-mine-view-archived-count")), "0");
    const search = $('[data-testid="atlas-search"]');
    assert.ok(search, "the search (names can be searched)");
    assert.ok(search.compareDocumentPosition(sw()) & Node.DOCUMENT_POSITION_FOLLOWING, "the switch under the search");
    assert.ok(byTestId("atlas-mine-none"), "Aktywne: „Nie masz jeszcze własnych ćwiczeń.”");
    assert.ok($(`[data-testid="atlas-name-row"][data-exercise-id="${SMITH}"]`), "the names section");
    await click(byTestId("atlas-mine-view-archived"));
    await flush(3, 2);
    assert.ok(byTestId("atlas-mine-archived-empty"));
    assert.equal($('[data-testid="atlas-name-row"]'), null, "names belong to Aktywne (filtering unchanged)");
    assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem(K("exercise_names")))), [SMITH], "data untouched");
    assert.equal(localStorage.getItem(K("user_exercises")), null);
  });

  test("the counts follow the data: 0 / 0 → 1 / 1 after test records are added; only active → 1 / 0, switch kept", async () => {
    await boot();
    await openMine();
    assert.equal(text(byTestId("atlas-mine-view-active-count")), "0");
    localStorage.setItem(K("user_exercises"), JSON.stringify([OWN, ARCH]));
    A.invalidateUserExerciseCatalog();
    await wv.systemBack();
    await openMine();
    assert.equal(text(byTestId("atlas-mine-view-active-count")), "1");
    assert.equal(text(byTestId("atlas-mine-view-archived-count")), "1");
    assert.ok($(`[data-exercise-id="${OWN.exerciseId}"]`));
    await boot({ user_exercises: [OWN] });
    await openMine();
    assert.ok(sw(), "only active ones: the switch stays (1 / 0)");
    assert.equal(text(byTestId("atlas-mine-view-active-count")), "1");
    assert.equal(text(byTestId("atlas-mine-view-archived-count")), "0");
  });

  test("Ulubione are unchanged: no switch, their empty state", async () => {
    await boot();
    await click(byTestId("atlas-tile-favourites"));
    await flush(5, 2);
    assert.equal(sw(), null);
    assert.ok(byTestId("atlas-favourites-empty"));
  });
});
