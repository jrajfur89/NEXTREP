// NEXTREP progression engine as it was at the finished S1 (a2b9ca0) — moved verbatim from the
// app script in F1.5 (tools/extract-engine.mjs). Pure functions and constants: no React, storage or
// Supabase. Progress Engine 2.0 (PE-A…PE-H) replaces these step by step; screens import from
// src/engine/index.js only.

// parseRirBounds lives in ./rir.js since N1 (shared with NEXTREP 1.0 without the legacy engine).
import { parseRirBounds } from "./rir.js";

// Parses a free-typed weight field, tolerating Polish comma decimals ("57,5") as well as dots,
// and passing through values that are already plain numbers (from older saved sessions).
function toNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const n = Number(String(val).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Parses a plan's target into a numeric range. Accepts "8-10", "10", "20-30 s" etc.
// Returns null if it can't be parsed (so the progression engine simply skips range-based rules).
function parseRepRange(str) {
  if (!str) return null;
  const nums = String(str).match(/\d+([.,]\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const parsed = nums.map((n) => Number(n.replace(",", ".")));
  if (parsed.length === 1) return { min: parsed[0], max: parsed[0] };
  return { min: Math.min(...parsed), max: Math.max(...parsed) };
}

// Overall target range for an exercise = union across all its planned series (min of mins,
// max of maxes), since individual series can each have their own target per the plan editor.
function overallRepRange(setsDetail) {
  if (!setsDetail || !setsDetail.length) return null;
  const ranges = setsDetail.map((s) => parseRepRange(s.target)).filter(Boolean);
  if (!ranges.length) return null;
  return {
    min: Math.min(...ranges.map((r) => r.min)),
    max: Math.max(...ranges.map((r) => r.max)),
  };
}

// Keyword-based reading of the person's own notes. Notes shape the INTERPRETATION of a result —
// they never invent data. `holdWeight`: the person said the load was already hard enough / they
// won't be able to go up → never suggest considering an increase. `badDay`: they felt worse today
// (headache, pain, tired, sick…) → a weaker result is not read as a decline. `goodDay`: supports a
// positive reading but never replaces the numbers.
function noteOverride(notesJoined) {
  const t = (notesJoined || "").toLowerCase();
  if (!t.trim()) return null;
  const has = (arr) => arr.some((k) => t.includes(k));
  const holdWeight = has(["nie dam rady", "za duż", "za ciężk", "za trudn", "nie zwiększ", "zbyt ciężk"]);
  const badDay = has(["gorszy dzień", "gorzej się czu", "słaby dzień", "słabszy dzień", "bolał", "boli", "ból", "chory", "choroba", "zmęczon", "niewyspan", "przeziębi"]);
  const goodDay = has(["bardzo dobrze", "świetnie", "dobrze mi się", "lekko szło", "mocny dzień"]);
  if (!holdWeight && !badDay && !goodDay) return null;
  let reason = null;
  if (holdWeight) reason = "Z Twojej notatki wynika, że ciężar był wystarczająco wymagający — nie ma powodu, żeby go teraz zwiększać.";
  else if (badDay) reason = "Z Twojej notatki wynika, że to był słabszy dzień — słabszy wynik traktujemy jako kontekst, a nie regres.";
  return { holdWeight, badDay, goodDay, treatAsStagnation: false, reason };
}

function avgOf(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

// Volume for one performance, in the units that make sense for the exercise kind:
//   weight          → weight × reps
//   bodyweight      → reps (no external load to multiply by)
//   time            → total seconds (never kg × reps)
//   bodyweightPlus  → ONLY the external load × reps. The person's own body mass is never part of
//                     this — e.g. MW +10 kg × (8, 8, 7) = 10×8 + 10×8 + 10×7 = 230.
// Dropsets are excluded — they're a finisher, not part of the planned working sets.
function computeSessionVolume(setList, kind, isTimeKind) {
  const normal = (setList || []).filter((s) => s.setType !== "dropset");
  if (isTimeKind || kind === "time") return normal.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  if (kind === "bodyweight") return normal.reduce((sum, s) => sum + (Number(s.reps) || 0), 0);
  return normal.reduce((sum, s) => sum + (toNumber(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

// Maximum number of most recent comparable performances (today included) the engine looks at.
// A maximum context, not a requirement: 4 performances → 4 are analyzed.
const PROGRESSION_MAX_PERFORMANCES = 10;

// Gap (days) after which a performance counts as a "return after a break": a weaker result is
// context, never an automatic regression.
const PROGRESSION_LONG_BREAK_DAYS = 14;

// Condenses one performance of an exercise into the numbers the engine compares.
function summarizePerformance(sets, kind, range, date) {
  const isTimeKind = kind === "time";
  const loaded = kind === "weight" || kind === "bodyweightPlus";
  const normal = (sets || []).filter((s) => s.setType !== "dropset");
  const valueOf = (s) => (isTimeKind ? Number(s.duration) || 0 : Number(s.reps) || 0);
  const loadOf = (s) => (loaded ? toNumber(s.weight) || 0 : 0);
  const loads = normal.map(loadOf);
  const top = loads.length ? Math.max(...loads) : 0;
  const atTop = normal.filter((s) => loadOf(s) === top);
  const values = atTop.map(valueOf);
  const rirLos = atTop.map((s) => parseRirBounds(s.rir)).filter(Boolean).map((b) => b.lo);
  const notes = (sets || []).map((s) => s.note || "").join(" ");
  return {
    date: date || null,
    setCount: normal.length,
    top,
    countAtTop: atTop.length,
    values,
    // Values capped at the CURRENT plan's upper bound: going above today's target is never
    // "worse", and reps a previous (wider) plan allowed above today's target don't make today
    // look like a decline.
    capped: values.map((v) => (range ? Math.min(v, range.max) : v)),
    avgRirLo: rirLos.length === atTop.length && rirLos.length ? avgOf(rirLos) : null,
    minRirLo: rirLos.length === atTop.length && rirLos.length ? Math.min(...rirLos) : null,
    // Reserve PATTERN of the working sets at the top load (a transitional set on an earlier,
    // lighter weight is not part of atTop at all): at least half of those sets — and at least one —
    // with RIR >= 1. A single 0 / 0-1 set doesn't cancel an otherwise solid pattern; a pattern of
    // mostly 0 / 0-1 is never enough reserve.
    reserveOk: (() => {
      const ok = rirLos.filter((lo) => lo >= 1).length;
      return atTop.length > 0 && ok > 0 && ok * 2 >= atTop.length;
    })(),
    rirKnown: rirLos.length > 0,
    volume: computeSessionVolume(sets, kind, isTimeKind),
    firstLoad: loads.length ? loads[0] : 0,
    override: noteOverride(notes),
  };
}

const sumTopK = (arr, k) => [...arr].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);

// Compares one performance with the one directly before it. Returns a single classification,
// plus which signal drove it — the hierarchy is reps → RIR → volume → more sets at the new load.
function comparePerformances(cur, prev, loaded) {
  if (!prev) return { type: "none" };
  const gapDays = cur.date && prev.date ? (new Date(cur.date) - new Date(prev.date)) / 86400000 : 0;
  const afterBreak = gapDays > PROGRESSION_LONG_BREAK_DAYS;
  if (loaded && cur.top > prev.top) return { type: "loadUp", afterBreak };
  if (loaded && cur.top < prev.top) return { type: "loadDown", afterBreak };

  const k = Math.min(cur.countAtTop, prev.countAtTop);
  const curSum = sumTopK(cur.capped, k);
  const prevSum = sumTopK(prev.capped, k);
  if (curSum > prevSum) return { type: "better", signal: "reps", afterBreak };
  if (curSum < prevSum) return { type: "worse", afterBreak };
  // Overshoot: the plan's upper bound is a target, not a ceiling for progress. Capped values decide
  // first (so going down from 12 to 11 on an 8–10 plan, or reps an older wider plan allowed, never
  // look like a decline, and a reps surplus in one set never covers a weaker set); only when they
  // tie do the REAL reps above the range count — 12 after 10 at the same load is progress.
  const curRaw = sumTopK(cur.values, k);
  const prevRaw = sumTopK(prev.values, k);
  if (curRaw > prevRaw) return { type: "better", signal: "repsAboveRange", afterBreak };
  if (cur.avgRirLo != null && prev.avgRirLo != null && cur.avgRirLo > prev.avgRirLo) return { type: "better", signal: "rir", afterBreak };
  if (loaded && cur.countAtTop > prev.countAtTop) return { type: "better", signal: "moreSetsAtLoad", afterBreak };
  if (cur.setCount >= prev.setCount && cur.volume > prev.volume) return { type: "better", signal: "volume", afterBreak };
  if (cur.avgRirLo != null && prev.avgRirLo != null && cur.avgRirLo < prev.avgRirLo) return { type: "same", rirWorse: true, afterBreak };
  return { type: "same", afterBreak };
}

// The one progression engine (per exerciseId). Progress = better execution, not just a heavier bar.
//
// Inputs:
//   sets             — the performance being evaluated (today's, or a historical one)
//   kind, setsDetail — the exercise kind and the CURRENT plan's series; today is always judged
//                      against the current plan's range, history is only trend context
//   history          — earlier performances of the SAME exerciseId, most recent first, each
//                      { sets, date }; only data from before `date` (no future leakage) — the
//                      caller passes findMatchingSessions(..., { beforeDate }) results
//   date             — when `sets` was performed (for long-break detection)
//   priorSessionSets — legacy single-previous-performance input, still accepted
//
// Output: { status, message, suggestedWeight, suggestedFirstSetWeight, baseline, analyzedCount,
//           currentLine, analysisText, recommendation }.
// The last three are the SAME sentences `message` is built from, exposed separately for display
// (report: "bieżące wykonanie" / "Analiza" / "Zalecenie"); they add nothing new and never change
// status or message.
// The message never prescribes a specific next weight: at most "można rozważyć zwiększenie…".
// suggestedWeight / suggestedFirstSetWeight are only form pre-fills taken from weights the
// person actually used — never an invented increment.
function computeExerciseAnalysis({ sets, kind, setsDetail, history = null, priorSessionSets = null, date = null }) {
  const isTimeKind = kind === "time";
  const loaded = kind === "weight" || kind === "bodyweightPlus";
  const unit = isTimeKind ? " s" : " powt.";
  const loadWord = kind === "bodyweightPlus" ? "obciążenie zewnętrzne" : "ciężar";
  const range = overallRepRange(setsDetail);
  const normalSets = (sets || []).filter((s) => s.setType !== "dropset");

  const priorList = (Array.isArray(history) && history.length
    ? history
    : priorSessionSets && priorSessionSets.length
    ? [{ sets: priorSessionSets, date: null }]
    : []
  )
    .filter((h) => h && Array.isArray(h.sets) && h.sets.some((s) => s.setType !== "dropset"))
    .slice(0, PROGRESSION_MAX_PERFORMANCES - 1);

  // "Sets only" exercises (no reps/time recorded) — nothing to judge progression on.
  if (kind === "sets" || !normalSets.length) {
    return {
      status: "yellow",
      message: "Zapisano wykonanie. Dla tego ćwiczenia nie ma danych o powtórzeniach ani czasie, więc silnik nie ocenia progresji — utrzymaj jakość wykonania.",
      suggestedWeight: null,
      suggestedFirstSetWeight: null,
      baseline: true,
      analyzedCount: 1,
      currentLine: "Zapisano wykonanie.",
      analysisText: "Dla tego ćwiczenia nie ma danych o powtórzeniach ani czasie, więc silnik nie ocenia progresji.",
      recommendation: "Utrzymaj jakość wykonania.",
    };
  }

  const perfs = [summarizePerformance(sets, kind, range, date), ...priorList.map((h) => summarizePerformance(h.sets, kind, range, h.date))];
  const n = perfs.length;
  const cur = perfs[0];
  const prev = perfs[1] || null;
  const cmps = perfs.slice(0, -1).map((p, i) => comparePerformances(p, perfs[i + 1], loaded));
  const c0 = cmps[0] || { type: "none" };
  const c1 = cmps[1] || { type: "none" };

  const override = cur.override;
  const holdWeight = !!override?.holdWeight;
  const badDay = !!override?.badDay;
  const topTxt = loaded ? ` przy ${cur.top} kg` : "";
  const partial = setsDetail && setsDetail.length ? cur.setCount < setsDetail.length : false;

  // --- Today versus the CURRENT plan (independent of history). ---
  const belowMin = range ? cur.values.some((v) => v < range.min) : false;
  const atTopOfRange = range ? cur.values.length > 0 && cur.values.every((v) => v >= range.max) : false;
  // Reps above the plan's upper bound: a performance signal, never a change of the plan's range.
  const aboveMax = range ? cur.values.filter((v) => v > range.max) : [];
  const aboveTxt = aboveMax.length ? ` — powyżej górnej granicy: ${Math.max(...aboveMax)}${unit}` : "";
  const rirReserveOk = cur.reserveOk;
  const planLine = !range
    ? "Plan nie ma zdefiniowanego zakresu, więc wynik oceniam tylko względem historii."
    : atTopOfRange
    ? `Pełna realizacja celu planu (${range.min === range.max ? range.max : `${range.min}–${range.max}`}${unit})${topTxt}${aboveTxt}${aboveTxt.endsWith(".") ? "" : "."}`
    : belowMin
    ? `Część serii${topTxt} poniżej dolnej granicy planu (${range.min}${unit}).`
    : `Wynik mieści się w zakresie planu (${range.min}–${range.max}${unit})${topTxt}.`;
  const partialLine = partial ? ` Wykonano ${cur.setCount} z ${setsDetail.length} zaplanowanych serii.` : "";

  // --- Pre-fill for the next workout: the real working level from the latest performance.
  // The first set starts where the person actually started working last time (not "top − 2,5 kg",
  // not automatically the lowest weight ever used); later sets carry the top weight they used.
  const suggestedWeight = loaded ? cur.top || null : null;
  const suggestedFirstSetWeight = loaded ? (cur.firstLoad || cur.top || null) : null;

  // --- 1 performance: plan fulfilment only. No "progress", "regress", "stagnation" or "trend". ---
  if (n === 1) {
    return {
      status: "yellow",
      message: `Pierwsze zapisane wykonanie tego ćwiczenia — punkt odniesienia na kolejne treningi. ${planLine}${partialLine}`.trim(),
      suggestedWeight,
      suggestedFirstSetWeight,
      baseline: true,
      analyzedCount: 1,
      currentLine: `${planLine}${partialLine}`.trim(),
      analysisText: "Pierwsze zapisane wykonanie tego ćwiczenia — punkt odniesienia na kolejne treningi.",
      recommendation: "",
    };
  }

  // Was the current top load introduced in the previous performance (i.e. is it still "new")?
  const loadIntroducedInPrev = loaded && prev && c1.type === "loadUp" && prev.top === cur.top;
  const loadIntroducedEarlierAndHeld = loaded && prev && prev.top === cur.top && perfs[2] && perfs[2].top < cur.top;
  const newLoadRecent = loadIntroducedInPrev || loadIntroducedEarlierAndHeld;

  // Weighted trend over the analyzed window (only from 3 performances up): newer comparisons
  // weigh more; a load increase counts as positive, a decline right after a break counts as 0.
  const score = (c) =>
    c.type === "better" || c.type === "loadUp" ? 1 : c.type === "worse" && !c.afterBreak ? -1 : 0;
  const weights = cmps.map((_, i) => Math.max(0.3, 1 - i * 0.12));
  const trendScore = cmps.reduce((sum, c, i) => sum + score(c) * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
  const olderPositives = cmps.slice(1).filter((c) => score(c) > 0).length;
  const olderNegatives = cmps.slice(1).filter((c) => score(c) < 0).length;

  let status = "yellow";
  let lead = "";

  if (c0.type === "loadUp") {
    const holding = !belowMin && cur.countAtTop >= 2;
    status = holding ? "green" : "yellow";
    lead = holding
      ? `Wyższy ${loadWord} niż poprzednio (${cur.top} kg) i utrzymany zakres planu w ${cur.countAtTop} seriach — dobra baza do stabilizacji tego poziomu.`
      : `Nowy, wyższy ${loadWord} (${cur.top} kg). Mniej powtórzeń lub niższa objętość na początku to normalny etap stabilizacji nowego ciężaru, a nie regres.`;
  } else if (c0.type === "loadDown") {
    status = "yellow";
    lead = c0.afterBreak
      ? `Powrót po dłuższej przerwie na niższym ciężarze (${cur.top} kg) — rozsądne odbudowanie techniki i czucia ruchu. To nie jest regres.`
      : `Dziś pracowałeś na niższym ciężarze niż poprzednio (${cur.top} kg). Samo obniżenie ciężaru nie oznacza regresu — dalszą ocenę da kolejne wykonanie.`;
  } else if (c0.type === "better") {
    status = "green";
    const why =
      c0.signal === "reps"
        ? `więcej ${isTimeKind ? "czasu" : "powtórzeń"}${topTxt} niż poprzednio`
        : c0.signal === "repsAboveRange"
        ? `więcej ${isTimeKind ? "czasu" : "powtórzeń"}${topTxt} niż poprzednio, powyżej górnej granicy zakresu planu`
        : c0.signal === "rir"
        ? `ten sam wynik${topTxt}, ale z większym zapasem (RIR)`
        : c0.signal === "moreSetsAtLoad"
        ? `więcej serii${topTxt} niż poprzednio — ten ciężar zaczyna się stabilizować`
        : `większa objętość niż poprzednio`;
    lead = newLoadRecent
      ? `Stabilizacja nowego ciężaru — ${why}.`
      : `Progres: ${why}.`;
  } else if (c0.type === "same") {
    if (newLoadRecent && !belowMin) {
      status = "green";
      lead = `Stabilizacja nowego ciężaru — kolejne wykonanie${topTxt} na tym samym poziomie i w zakresie planu.`;
    } else {
      status = "yellow";
      lead = atTopOfRange && !c0.rirWorse
        ? `Wynik${topTxt} na poziomie poprzedniego wykonania — na górze zakresu planu.`
        : c0.rirWorse
        ? `Ten sam wynik${topTxt} co poprzednio, tym razem bliżej upadku mięśniowego (niższy RIR) — to nadal prawidłowe wykonanie. Jeśli celem jest progresja ciężarem, najpierw ustabilizuj ten ciężar z większym zapasem.`
        : `Wynik${topTxt} na poziomie poprzedniego wykonania. Utrzymaj ciężar i spróbuj poprawić powtórzenia lub zapas (RIR).`;
    }
  } else if (c0.type === "worse") {
    status = "yellow";
    if (c0.afterBreak) {
      lead = `Słabszy wynik po dłuższej przerwie od poprzedniego wykonania — to naturalne i nie jest traktowane jako regres.`;
    } else if (badDay) {
      lead = `Wynik słabszy niż poprzednio. ${override.reason}`;
    } else if (partial) {
      lead = `Trening wykonany częściowo, więc słabszy wynik nie jest traktowany jako regres.`;
    } else if (n === 2) {
      lead = `Wstępny sygnał: wynik${topTxt} nieco słabszy niż przy poprzednim wykonaniu. Dwa wykonania to za mało, żeby mówić o trendzie — warto obserwować.`;
    } else if (olderPositives >= 2 && olderPositives > olderNegatives) {
      lead = `Słabszy trening na tle pozytywnego trendu z ostatnich wykonań — jeden gorszy dzień nie odwraca stabilnego progresu.`;
    } else if (c1.type === "worse" && !c1.afterBreak && !(prev?.override?.badDay)) {
      status = "red";
      lead = `Drugi kolejny słabszy wynik${topTxt} przy tym samym lub niższym ciężarze. Priorytetem jest jakość wykonania na obecnym poziomie — nie zwiększaj ciężaru.`;
    } else {
      lead = `Wynik${topTxt} słabszy niż poprzednio. Pojedynczy słabszy trening nie oznacza regresu — kolejne wykonanie pokaże kierunek.`;
    }
  }

  // --- Possible stagnation: an observation signal, never an automatic plan/exercise change. ---
  if (status === "yellow" && !holdWeight && !badDay && !atTopOfRange && range && prev) {
    const sameLoad = !loaded || cur.top === prev.top;
    const bothAtOrBelowMin =
      sameLoad && cur.values.length && prev.values.length && cur.values.every((v) => v <= range.min) && prev.values.every((v) => Math.min(v, range.max) <= range.min);
    const threeFlat = n >= 3 && c0.type === "same" && c1.type === "same" && sameLoad && perfs[2] && (!loaded || perfs[2].top === cur.top);
    if (!prev.override?.holdWeight && !prev.override?.badDay && (bothAtOrBelowMin || threeFlat)) {
      status = "stagnation";
      lead = bothAtOrBelowMin
        ? `Możliwa stagnacja: kolejne wykonanie${topTxt} bez przekroczenia ${range.min}${unit}${unit.endsWith(".") ? "" : "."} Pracuj dalej na tym samym poziomie — spróbuj poprawić ${isTimeKind ? "czas" : "liczbę powtórzeń"}, ewentualnie dołóż dropset na ostatniej serii.`
        : `Możliwa stagnacja: ${n >= 3 ? "kilka" : "dwa"} kolejnych wykonań${topTxt} bez poprawy powtórzeń, zapasu (RIR) ani objętości. To sygnał do obserwacji — plan i ćwiczenie zostają bez zmian.`;
    }
  }

  // --- Considering a further step: only a suggestion, only from real, repeated evidence. ---
  // Requires: top of the current plan's range with at least RIR 1 on every top set, TWICE in a
  // row at the same load. RIR 0 / 0–1 at the top of the range = working at the limit → hold and
  // build reserve. The person's note that the load was hard enough always wins.
  let nextStep = "";
  const prevAtTopWithReserve =
    prev && range && (!loaded || prev.top === cur.top) && prev.values.length && prev.values.every((v) => v >= range.max) && prev.reserveOk;
  if (holdWeight) {
    nextStep = override.reason;
  } else if (atTopOfRange && rirReserveOk && prevAtTopWithReserve && status !== "red") {
    nextStep = loaded
      ? `Drugie z rzędu wykonanie na górze zakresu przy tym ciężarze, z wystarczającym zapasem w seriach roboczych (RIR 1–2 lub 2). Można rozważyć zwiększenie ${kind === "bodyweightPlus" ? "obciążenia zewnętrznego" : "ciężaru"}, jeśli czujesz się na siłach.`
      : isTimeKind
      ? `Drugie z rzędu wykonanie na górze zakresu z zapasem — można rozważyć wydłużenie czasu lub trudniejszy wariant, jeśli czujesz się na siłach.`
      : `Drugie z rzędu wykonanie na górze zakresu z zapasem — można rozważyć trudniejszy wariant lub dodatkowe obciążenie, jeśli czujesz się na siłach.`;
  } else if (atTopOfRange && rirReserveOk) {
    nextStep = `Góra zakresu z zapasem (RIR 1–2 lub 2). Jeśli kolejny trening to potwierdzi, można będzie rozważyć kolejny krok — na razie warto ustabilizować ten poziom.`;
  } else if (atTopOfRange && cur.rirKnown && !cur.reserveOk) {
    nextStep = `Góra zakresu przy pracy blisko upadku mięśniowego (RIR 0 / 0–1) — to wartościowy bodziec, nie regres i nie powód do zmniejszania ciężaru. Jeśli celem jest progresja ciężarem, najpierw ustabilizuj ten ciężar i zwiększ zapas, zanim rozważysz kolejny krok.`;
  } else if (status === "red") {
    nextStep = "";
  } else if (belowMin) {
    nextStep = `Utrzymaj ciężar i spróbuj wejść w zakres planu na każdej serii.`;
  } else if (range) {
    nextStep = `Utrzymaj ciężar i buduj ${isTimeKind ? "czas" : "powtórzenia"} w stronę górnej granicy zakresu (${range.max}${unit}).`;
  }

  // Trend line — only from 3 performances; 5+ is described as a stronger basis.
  let trendLine = "";
  if (n >= 3) {
    const dir = trendScore >= 0.25 ? "rosnący" : trendScore <= -0.25 ? "spadkowy" : "stabilny";
    trendLine = ` Trend z ${n} ostatnich wykonań: ${dir}${n >= 5 ? " (mocna podstawa danych)" : ""}.`;
    if (dir === "spadkowy" && status !== "red") trendLine = ` Trend z ${n} ostatnich wykonań wymaga obserwacji.`;
  }

  const goodNote = override?.goodDay && status === "green" ? " Twoja notatka potwierdza dobre samopoczucie." : "";
  const message = [lead, planLine + partialLine, nextStep].filter(Boolean).join(" ") + trendLine + goodNote;

  return {
    status,
    message: message.replace(/\s+/g, " ").trim(),
    suggestedWeight,
    suggestedFirstSetWeight,
    baseline: false,
    analyzedCount: n,
    currentLine: `${planLine}${partialLine}`.replace(/\s+/g, " ").trim(),
    analysisText: `${lead}${trendLine}${goodNote}`.replace(/\s+/g, " ").trim(),
    recommendation: (nextStep || "").replace(/\s+/g, " ").trim(),
  };
}

// Builds the chronological history input for computeExerciseAnalysis from saved sessions — every
// performance of this exerciseId strictly BEFORE `beforeDate` (so re-analyzing an edited or
// backfilled old workout never sees data from after it), most recent first, capped at the window.
function exerciseHistoryBefore(history, exerciseId, beforeDate, excludeSessionId = null) {
  return findMatchingSessions(history, { exerciseId, beforeDate })
    .filter((s) => s.id !== excludeSessionId)
    .slice(0, PROGRESSION_MAX_PERFORMANCES - 1)
    .map((s) => ({ sets: s.exercises.find((e) => e.exerciseId === exerciseId)?.sets || [], date: s.date }));
}

// Current-logic analysis of one exercise inside one saved session (reports, statistics, dashboard,
// "Następnym razem"). Always recomputed from the data — a stored analysis in an old session is a
// historical record and is left untouched, but never shown as the current recommendation.
function analyzeSessionExercise(history, session, ex) {
  if (!ex || ex.type === "cardio") return null;
  return computeExerciseAnalysis({
    sets: ex.sets || [],
    kind: ex.type,
    setsDetail: ex.setsDetail,
    history: exerciseHistoryBefore(history, ex.exerciseId, session.date, session.id),
    date: session.date,
  });
}

// ===================== MUSCLE-GROUP WORKLOAD (NR-MGW-001) =====================
// An analytics layer ABOVE the progression engine, never part of it: progression stays strictly per
// exact exerciseId; here different exerciseIds of the same PRIMARY muscle group add up.
//   • The FULL workload of an exercise goes to its primary muscleGroup only; secondaryMuscleGroups
//     are informational (no double counting, no arbitrary 50%/30% weights).
//   • Volume = computeSessionVolume (the one definition, drop sets excluded), kept per UNIT and never
//     mixed: kg (external load × reps — body mass is never added), reps (pure bodyweight), seconds (time).
//   • Atlas exercises: the map below (stable exerciseIds; "Nogi" split by the owner's decision).
//     Own exercises: the FIRST category the person declared (Nogi / Cardio / Całe ciało → no group).
//     No group → skipped here, never guessed, never an error. Kept in code: nothing new is stored,
//     synced or migrated.
//   • Chronology always from session.date. Workouts of different exercise sets are never compared
//     as "up/down" — that's "brak porównania" (an exercise change is not a regression).
const MUSCLE_GROUPS = [
  { id: "chest", label: "Klatka piersiowa", metaCat: "Klatka" },
  { id: "back", label: "Plecy", metaCat: "Plecy" },
  { id: "shoulders", label: "Barki", metaCat: "Barki" },
  { id: "biceps", label: "Biceps", metaCat: "Biceps" },
  { id: "triceps", label: "Triceps", metaCat: "Triceps" },
  { id: "forearms", label: "Przedramiona", metaCat: "Przedramiona" },
  { id: "abs", label: "Brzuch", metaCat: "Brzuch" },
  { id: "quads", label: "Czworogłowe uda", metaCat: "Nogi" },
  { id: "hamstrings_glutes", label: "Dwugłowe uda / pośladki", metaCat: "Pośladki" },
  { id: "calves", label: "Łydki", metaCat: "Nogi" },
];

// Old category names (existing data) + the MUSCLE_GROUPS labels themselves (what the exercise form
// saves now: category = [primary label, ...secondary labels]). "Nogi" / "Całe ciało" / "Cardio" → none.
const CATEGORY_TO_MUSCLE_GROUP = {
  Klatka: "chest", Plecy: "back", Barki: "shoulders", Biceps: "biceps", Triceps: "triceps", Przedramiona: "forearms", Brzuch: "abs", Pośladki: "hamstrings_glutes",
  ...Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.label, g.id])),
};

const ATLAS_MUSCLE_GROUPS = {
  squat_barbell: { muscleGroup: "quads", secondaryMuscleGroups: [] },
  bench_press: { muscleGroup: "chest", secondaryMuscleGroups: [] },
  deadlift: { muscleGroup: "back", secondaryMuscleGroups: [] },
  pullup: { muscleGroup: "back", secondaryMuscleGroups: [] },
  pushup: { muscleGroup: "chest", secondaryMuscleGroups: [] },
  rkc_plank: { muscleGroup: "abs", secondaryMuscleGroups: [] },
  dips: { muscleGroup: "chest", secondaryMuscleGroups: ["triceps"] },
  farmers_walk: { muscleGroup: "forearms", secondaryMuscleGroups: [] },
  lat_pulldown: { muscleGroup: "back", secondaryMuscleGroups: [] },
  rdl_barbell: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  db_shoulder_press_seated: { muscleGroup: "shoulders", secondaryMuscleGroups: [] },
  db_curl_supination: { muscleGroup: "biceps", secondaryMuscleGroups: [] },
  cable_triceps_rope: { muscleGroup: "triceps", secondaryMuscleGroups: [] },
  barbell_row: { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] },
  ez_bar_curl: { muscleGroup: "biceps", secondaryMuscleGroups: [] },
  pullup_overhand: { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] },
  db_incline_press_30: { muscleGroup: "chest", secondaryMuscleGroups: [] },
  chest_supported_row_machine: { muscleGroup: "back", secondaryMuscleGroups: [] },
  leg_press: { muscleGroup: "quads", secondaryMuscleGroups: [] },
  rdl_dumbbell: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  leg_curl_seated: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  hip_abduction_machine: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  db_lateral_raise: { muscleGroup: "shoulders", secondaryMuscleGroups: [] },
  rear_delt_machine: { muscleGroup: "shoulders", secondaryMuscleGroups: [] },
  cable_crunch: { muscleGroup: "abs", secondaryMuscleGroups: [] },
  cable_fly_standing: { muscleGroup: "chest", secondaryMuscleGroups: [] },
  barbell_row_bent: { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] },
  lat_pulldown_neutral: { muscleGroup: "back", secondaryMuscleGroups: [] },
  ohp_seated_barbell: { muscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"] },
  ohp_standing_barbell: { muscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"] },
  pullup_band_assist: { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] },
  hanging_knee_raise: { muscleGroup: "abs", secondaryMuscleGroups: ["hamstrings_glutes"] },
  pullup_underhand: { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] },
  squat_front_barbell: { muscleGroup: "quads", secondaryMuscleGroups: ["hamstrings_glutes"] },
  pullup_overhand_weighted: { muscleGroup: "back", secondaryMuscleGroups: ["biceps", "forearms"] },
  hanging_leg_raise_straight: { muscleGroup: "abs", secondaryMuscleGroups: ["hamstrings_glutes"] },
  pullup_underhand_weighted: { muscleGroup: "back", secondaryMuscleGroups: ["biceps", "forearms"] },
  cable_row_seated: { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] },
  rear_delt_cable: { muscleGroup: "shoulders", secondaryMuscleGroups: [] },
  db_lunge: { muscleGroup: "quads", secondaryMuscleGroups: ["hamstrings_glutes"] },
  calf_raise_standing: { muscleGroup: "calves", secondaryMuscleGroups: [] },
  hip_thrust_barbell: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  bodyweight_squat: { muscleGroup: "quads", secondaryMuscleGroups: [] },
  db_row_single_arm: { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] },
  glute_bridge_bodyweight: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  plank: { muscleGroup: "abs", secondaryMuscleGroups: [] },
  bulgarian_split_squat_db: { muscleGroup: "quads", secondaryMuscleGroups: ["hamstrings_glutes"] },
  hip_abduction_band: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  band_squat: { muscleGroup: "quads", secondaryMuscleGroups: [] },
  band_chest_press: { muscleGroup: "chest", secondaryMuscleGroups: [] },
  band_row: { muscleGroup: "back", secondaryMuscleGroups: [] },
  band_rdl: { muscleGroup: "hamstrings_glutes", secondaryMuscleGroups: [] },
  band_overhead_press: { muscleGroup: "shoulders", secondaryMuscleGroups: [] },
  band_curl: { muscleGroup: "biceps", secondaryMuscleGroups: [] },
  band_triceps_extension: { muscleGroup: "triceps", secondaryMuscleGroups: [] },
  band_lateral_raise: { muscleGroup: "shoulders", secondaryMuscleGroups: [] },
  dead_bug: { muscleGroup: "abs", secondaryMuscleGroups: [] },
  bird_dog: { muscleGroup: "abs", secondaryMuscleGroups: [] },
  lying_knee_raise: { muscleGroup: "abs", secondaryMuscleGroups: [] },
  ab_wheel_rollout: { muscleGroup: "abs", secondaryMuscleGroups: [] },
  weighted_plank: { muscleGroup: "abs", secondaryMuscleGroups: [] },
};

// { muscleGroup, secondaryMuscleGroups } of an exerciseId, or null (no group → not aggregated).
function getExerciseMuscleGroups(exerciseId, exercises) {
  if (exerciseId != null && Object.prototype.hasOwnProperty.call(ATLAS_MUSCLE_GROUPS, exerciseId)) return ATLAS_MUSCLE_GROUPS[exerciseId];
  const ex = (exercises || []).find((e) => e && e.id === exerciseId);
  const cats = ex && Array.isArray(ex.category) ? ex.category : [];
  const primary = cats.length ? CATEGORY_TO_MUSCLE_GROUP[cats[0]] || null : null;
  if (!primary) return null;
  const secondary = [];
  cats.slice(1).forEach((c) => {
    const g = CATEGORY_TO_MUSCLE_GROUP[c];
    if (g && g !== primary && !secondary.includes(g)) secondary.push(g);
  });
  return { muscleGroup: primary, secondaryMuscleGroups: secondary };
}

const WORKLOAD_UNIT_BY_KIND = { weight: "kg", bodyweightPlus: "kg", bodyweight: "reps", time: "seconds" };

// Workload per primary muscle group over sessions with start ≤ session.date < end (either bound
// optional): { [group]: { sets, kg, reps, seconds, exerciseIds } }.
function computeMuscleGroupWorkload(history, exercises, start = null, end = null) {
  const out = {};
  const s0 = start ? new Date(start).getTime() : -Infinity;
  const e0 = end ? new Date(end).getTime() : Infinity;
  (history || []).forEach((h) => {
    const t = Date.parse(h && h.date);
    if (Number.isNaN(t) || t < s0 || t >= e0) return;
    (h.exercises || []).forEach((ex) => {
      const mg = getExerciseMuscleGroups(ex.exerciseId, exercises);
      if (!mg) return;
      const normal = (ex.sets || []).filter((st) => st.setType !== "dropset");
      if (!normal.length) return;
      const g = out[mg.muscleGroup] || (out[mg.muscleGroup] = { sets: 0, kg: 0, reps: 0, seconds: 0, exerciseIds: [] });
      g.sets += normal.length;
      const unit = WORKLOAD_UNIT_BY_KIND[ex.type];
      if (unit) g[unit] += computeSessionVolume(ex.sets, ex.type, ex.type === "time");
      if (!g.exerciseIds.includes(ex.exerciseId)) g.exerciseIds.push(ex.exerciseId);
    });
  });
  return out;
}

// The unit a group's workload is compared in: kg first, then bodyweight reps, then seconds.
function workloadMainUnit(w) {
  if (!w) return null;
  return w.kg > 0 ? "kg" : w.reps > 0 ? "reps" : w.seconds > 0 ? "seconds" : null;
}

// For every exercise, finds the most recent session that has a stored analysis for it, and
// counts how many currently sit at each status — a single, honest "how's training going overall"
// signal instead of having to open every exercise individually.
function computeProgressSignal(history) {
  // Latest performance of every exerciseId, analyzed with the CURRENT engine (never a stored,
  // possibly outdated analysis text). First-ever performances (baseline) aren't a signal yet.
  const latestByExercise = {};
  [...history]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((h) => {
      (h.exercises || []).forEach((ex) => {
        if (ex.type !== "cardio" && ex.sets?.length) latestByExercise[ex.exerciseId] = { session: h, ex };
      });
    });
  const counts = { green: 0, yellow: 0, red: 0, stagnation: 0 };
  const items = Object.values(latestByExercise)
    .map(({ session, ex }) => {
      const a = analyzeSessionExercise(history, session, ex);
      return a && !a.baseline ? { exerciseId: ex.exerciseId, name: ex.name, ...a } : null;
    })
    .filter(Boolean);
  items.forEach((a) => {
    if (counts[a.status] !== undefined) counts[a.status]++;
  });
  return { counts, items };
}

// One point per session that trained this muscle group, chronologically (session.date): its
// workload in that session's main unit plus the exerciseIds it came from.
function muscleGroupSessionPoints(history, exercises, group) {
  return [...(history || [])]
    .filter((h) => !Number.isNaN(Date.parse(h && h.date)))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((h) => {
      const w = computeMuscleGroupWorkload([h], exercises)[group];
      const unit = workloadMainUnit(w);
      return unit ? { date: h.date, volume: w[unit], unit, exerciseIds: [...w.exerciseIds].sort(), planLabel: h.planLabel || h.planName || "Trening bez planu" } : null;
    })
    .filter(Boolean);
}

// Most recent session of this muscle group vs the one before it — session-over-session (a chest day
// and a back day fall on different days). Only an honest comparison: when the exercises or the unit
// differ, the result is { comparable: false } ("brak porównania"), never an up/down — switching
// Bench Press → Dumbbell Bench Press is not a chest regression.
function computeCategoryLastDelta(history, exercises, group) {
  const points = muscleGroupSessionPoints(history, exercises, group);
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const base = { lastDate: last.date, prevDate: prev.date, prevPlanLabel: prev.planLabel, unit: last.unit };
  if (last.unit !== prev.unit) return { ...base, comparable: false, reason: "unit" };
  if (last.exerciseIds.join("|") !== prev.exerciseIds.join("|")) return { ...base, comparable: false, reason: "exercises" };
  return { ...base, comparable: true, lastVolume: last.volume, prevVolume: prev.volume, delta: last.volume - prev.volume };
}

// Scans every session strictly before `beforeDate` for this exercise's historical best, so a
// "new record" claim in the report is only ever made when there is real prior data to beat.
function getHistoricalBest(history, exerciseId, beforeDate) {
  const matches = findMatchingSessions(history, { exerciseId, beforeDate });
  let maxWeight = 0,
    maxReps = 0,
    maxDuration = 0;
  matches.forEach((s) => {
    const data = s.exercises.find((e) => e.exerciseId === exerciseId);
    (data?.sets || []).forEach((st) => {
      maxWeight = Math.max(maxWeight, Number(st.weight) || 0);
      maxReps = Math.max(maxReps, Number(st.reps) || 0);
      maxDuration = Math.max(maxDuration, Number(st.duration) || 0);
    });
  });
  return { hasHistory: matches.length > 0, maxWeight, maxReps, maxDuration };
}

function findMatchingSessions(history, { exerciseId, beforeDate }) {
  const beforeTime = beforeDate ? new Date(beforeDate).getTime() : Infinity;
  return history
    .filter((s) => {
      const dt = new Date(s.date).getTime();
      if (!(dt < beforeTime)) return false;
      return s.exercises?.some((e) => e.exerciseId === exerciseId && e.sets?.length);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export {
  toNumber,
  parseRepRange,
  parseRirBounds,
  overallRepRange,
  noteOverride,
  avgOf,
  computeSessionVolume,
  PROGRESSION_MAX_PERFORMANCES,
  PROGRESSION_LONG_BREAK_DAYS,
  summarizePerformance,
  sumTopK,
  comparePerformances,
  computeExerciseAnalysis,
  exerciseHistoryBefore,
  analyzeSessionExercise,
  MUSCLE_GROUPS,
  CATEGORY_TO_MUSCLE_GROUP,
  ATLAS_MUSCLE_GROUPS,
  getExerciseMuscleGroups,
  WORKLOAD_UNIT_BY_KIND,
  computeMuscleGroupWorkload,
  workloadMainUnit,
  computeProgressSignal,
  muscleGroupSessionPoints,
  computeCategoryLastDelta,
  getHistoricalBest,
  findMatchingSessions,
};
