// The only RIR values selectable during a workout — a list, not free text.
// "2" means a reserve of 2 or more reps — the top category (never "3").
const RIR_OPTIONS = ["0", "0-1", "1-2", "2"];

// Derives how a set should be logged (weight+reps / reps only / time / just sets / bodyweight+extra)
// from an exercise's equipment + flags, since "Rodzaj" was replaced by "Sprzęt".
function getExerciseKind(ex) {
  if (!ex) return "weight";
  if (ex.isCardio) return "cardio";
  if (ex.isTimeBased) return "time";
  if (ex.isSetsOnly) return "sets";
  const eq = ex.equipment || [];
  const hasBodyweight = eq.includes("Masa ciała");
  const hasExtra = eq.some((e) => e !== "Masa ciała");
  if (hasBodyweight && hasExtra) return "bodyweightPlus";
  if (eq.length > 0 && eq.every((e) => BODYWEIGHT_EQUIPMENT.includes(e))) return "bodyweight";
  return "weight";
}




// Display label for ANY stored RIR value, always one of the model's four categories:
// "0", "0–1", "1–2", "2" ("2" = a reserve of 2 or more — the top category, never shown as "3").
// Older numeric data is mapped by the same lower bound the engine compares on (3 → "2",
// 1 → "1–2"), so display and analysis agree. Stored values are never rewritten.
function formatRir(rir) {
  const b = parseRirBounds(rir);
  if (!b) return null;
  if (b.lo >= 2) return "2";
  if (b.lo >= 1) return "1–2";
  return b.hi >= 1 ? "0–1" : "0";
}



const STATUS_META = {
  green: {
    icon: "🟢",
    label: "Progres",
    description: "Lepsze wykonanie niż wcześniej: powtórzenia, zapas, objętość lub utrzymany nowy ciężar.",
  },
  yellow: {
    icon: "🟡",
    label: "Kontynuuj na tym poziomie",
    description: "Obecny poziom nadal jest odpowiedni do dalszej pracy, zanim pojawi się sygnał do zwiększenia ciężaru lub dalszej progresji.",
  },
  red: {
    icon: "🔴",
    label: "Utrzymujący się spadek",
    description: "Kolejne słabsze wykonania na tym samym lub niższym poziomie — nie jeden gorszy dzień.",
  },
  stagnation: {
    icon: "⚠️",
    label: "Możliwa stagnacja",
    description: "Kilka porównywalnych wykonań bez poprawy. To sygnał do obserwacji, a nie automatyczna decyzja o zmianie planu.",
  },
  // Not an engine status: the first performance of an exercise (analysis.baseline).
  baseline: {
    icon: "ℹ️",
    label: "Punkt odniesienia",
    description: "Pierwsze wykonanie. Od niego zaczyna się historia ćwiczenia.",
  },
};










