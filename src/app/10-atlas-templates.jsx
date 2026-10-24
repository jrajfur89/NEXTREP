const SLOGANS = [
  "Trenuj, zapisuj, progresuj.",
  "Ciężar rośnie, kiedy Ty nie odpuszczasz.",
  "Każda seria to cegła pod Twoją siłę.",
  "Dyscyplina bije motywację.",
  "Zapisz dziś, przebij jutro.",
  "Siła to suma dobrych dni na siłowni.",
  "Nie licz kalorii, licz powtórzenia.",
  "Progres lubi konsekwencję.",
  "Twój najlepszy wynik jeszcze nie padł.",
  "Ciężko teraz, lekko później.",
  "Każdy kilogram ma swoją historię.",
  "Rekordy nie biorą się znikąd.",
  "Trening bez planu to trening przypadku.",
  "Wracaj silniejszy niż wczoraj.",
  "Żelazo nie kłamie.",
  "Pot dziś, duma jutro.",
  "Małe kroki, wielkie ciężary.",
  "Nawyk buduje mięśnie, nie chwilówka.",
  "Nie czekaj na motywację, zacznij trening.",
  "Twoje ciało zapamięta każdą serię.",
  "Postęp mierzy się na kartce, nie w lustrze.",
];

function randomSlogan() {
  return SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
}

function dashboardTimePhrase() {
  const h = new Date().getHours();
  const base = h < 6 ? "Trening o tej porze? Szacunek" : h < 12 ? "Ranek to dobra pora na żelazo" : h < 17 ? "Popołudniowa dawka ciężarów" : h < 22 ? "Wieczorna sesja czeka" : "Nocna zmiana na siłowni";
  const emoji = h < 6 || h >= 22 ? "🌙" : h < 17 ? "☀️" : "🔥";
  return `${base} ${emoji}`;
}

// I2 (24.10.2026): the old built-in exercise list (68 exercises) and its metadata are gone from the
// app — no namespace is seeded with them any more. Exercises come from the NEXTREP 1.0 atlas
// (17b-atlas-catalog.jsx) and from the person's own entries.
//
// I2: the ready-made plan templates keep their names, descriptions and levels, but their old
// exercise assignments are removed — every template is shown as „Wkrótce” (inactive) until it is
// rebuilt on the new atlas. With no data a template builds no plan (buildPlansFromTemplateLevel).
const TEMPLATE_PLAN_DATA = {};

// Builds real, fully-populated plans (with real setsDetail/restSeconds) from a ready-made
// template level, resolving each exercise by NAME against the person's own exercises list first
// (so someone who already has an exercise of that name never gets a duplicate), and only creating a
// new exercise — using the shared atlas metadata for its category/equipment — when they don't yet
// have one by that name. Returns both the new plans and any newly-created exercises, so the caller
// can commit both through the existing updatePlans/updateExercises mechanism; nothing here is a
// separate "preset" system, it's just data assembly for the same plan/exercise model.
// A ready plan's day-plans prepared for USE (starting or back-filling a workout) — never saved to
// "Moje plany". Ids are stable and derived from the template ("tpl-<template>-<level>-<day>"), so
// every workout from the same ready-plan day carries the same source reference (planId + name);
// sync sends plan_id = null for them (no user plan exists) and keeps plan_name / plan_label.
// newExercises = template exercises missing from the person's exercise library; the caller adds
// them only when the workout actually starts / is created (history needs real exerciseIds).
function buildReadyPlanDays(template, level, exercises) {
  const built = buildPlansFromTemplateLevel(template, level, exercises);
  const baseName = template.levels.length > 1 ? `${template.name} — ${level.label}` : template.name;
  const toDay = (p, i) => ({ ...p, id: `tpl-${template.key}-${level.id}-${i}`, templateKey: template.key, readyTemplate: true });
  if (!built) return { baseName, days: [toDay({ name: baseName, exercises: [] }, 0)], newExercises: [] };
  return { baseName, days: built.newPlans.map(toDay), newExercises: built.newExercises };
}
// Short label of one ready-plan day for pickers: "Dzień 2 · (plecy + biceps)".
function readyDayLabel(baseName, day, i) {
  const rest = (day.name || "").startsWith(baseName) ? day.name.slice(baseName.length).trim() : "";
  return `Dzień ${i + 1}${rest ? ` · ${rest.replace(/^\(|\)$/g, "")}` : ""}`;
}
const mergeNewExercises = (prev, newExercises) => [...prev, ...(newExercises || []).filter((ne) => !prev.some((e) => e.id === ne.id))];

function buildPlansFromTemplateLevel(template, level, currentExercises) {
  const dayDefs = TEMPLATE_PLAN_DATA[level.id];
  if (!dayDefs || !dayDefs.length) return null;

  const exercisesByName = new Map(currentExercises.map((e) => [e.name, e]));
  const newExercises = [];

  const resolveExerciseId = (name) => {
    const existing = exercisesByName.get(name);
    if (existing) return existing.id;
    const meta = { category: ["Całe ciało"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false };
    const created = normalizeExercise({ id: uid(), name, ...meta });
    exercisesByName.set(name, created);
    newExercises.push(created);
    return created.id;
  };

  const multiDay = dayDefs.length > 1;
  const baseName = template.levels.length > 1 ? `${template.name} — ${level.label}` : template.name;

  const newPlans = dayDefs.map((day) => ({
    id: uid(),
    name: multiDay && day.dayLabel ? `${baseName} (${day.dayLabel})` : baseName,
    templateKey: template.key,
    exercises: day.items.map((it) => ({
      id: uid(),
      exerciseId: resolveExerciseId(it.exerciseName),
      restSeconds: it.restSeconds,
      supersetGroup: null,
      setsDetail: it.setsDetail.map((s) => ({ id: uid(), target: s.target, rir: s.rir })),
    })),
  }));

  return { newPlans, newExercises };
}

const LEVELS_3 = ["Początkujący", "Średniozaawansowany", "Zaawansowany"];
const LEVELS_2 = ["Początkujący", "Zaawansowany"];
// Two separate experience maps so there's never a gap between levels: the 3-level split uses
// bounded ranges (0–1 / 1–2 / 2+ lata), and the 2-level split uses a single continuous cutoff
// (below/above 1,5 roku) rather than reusing the 3-level boundaries, which would leave anyone
// with 1–2 lat doświadczenia matching neither level.
const LEVEL_EXPERIENCE_3 = {
  "Początkujący": "doświadczenie poniżej 1 roku",
  "Średniozaawansowany": "doświadczenie od 1 do 2 lat",
  "Zaawansowany": "doświadczenie powyżej 2 lat",
};
const LEVEL_EXPERIENCE_2 = {
  "Początkujący": "doświadczenie poniżej 1,5 roku",
  "Zaawansowany": "doświadczenie powyżej 1,5 roku",
};

function makeLevels(templateKey, labels) {
  const experienceMap = labels.length === 2 ? LEVEL_EXPERIENCE_2 : LEVEL_EXPERIENCE_3;
  return labels.map((label) => ({
    id: `${templateKey}_${label.toLowerCase()}`,
    label,
    experience: experienceMap[label],
  }));
}

// I2: every template is `comingSoon` — listed with the „Wkrótce” badge, not expandable, no level can
// be picked (Plany → Gotowe, Rozpocznij trening → Gotowe plany, Dodaj trening wstecz).
//
// Ready-made plan templates shown in the Plany → Gotowe tab. Each is a shell (no exercises yet —
// those get added afterwards in the plan editor); picking a level creates a real plan the person
// can then fill in. `tier` gates whether tapping a level opens Premium instead.

const TEMPLATE_IMAGES = {
  "fbw": __asset_plan_fbw,
  "split": __asset_plan_split,
  "5x5": __asset_plan_5x5,
  "ppl": __asset_plan_ppl,
  "home": __asset_plan_home,
  "glutes": __asset_plan_glutes,
  "bands": __asset_plan_bands,
  "abs": __asset_plan_abs,
};

const READY_PLAN_TEMPLATES = [
  {
    key: "fbw",
    name: "FBW (Full Body Workout)",
    tier: "free",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Trening całego ciała w jednej sesji, zwykle 3× w tygodniu. Angażuje wszystkie główne partie na każdym treningu — dobry wybór na start, bo pozwala często ćwiczyć każdy mięsień i szybciej uczyć się techniki.",
    levels: makeLevels("fbw", LEVELS_3),
  },
  {
    key: "split",
    name: "Split",
    tier: "free",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Trening dzielony — każda sesja skupia się na wybranych partiach (np. góra/dół albo poszczególne grupy mięśniowe). Pozwala poświęcić więcej objętości danej partii w jednym dniu, kosztem rzadszej częstotliwości jej treningu.",
    levels: makeLevels("split", LEVELS_3),
  },
  {
    key: "5x5",
    name: "5×5",
    tier: "premium",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Klasyczny program siłowy oparty na kilku ćwiczeniach wielostawowych w schemacie 5 serii po 5 powtórzeń. Skupia się na systematycznym zwiększaniu ciężaru w podstawowych ruchach — prostota i regularna progresja.",
    levels: makeLevels("5x5", LEVELS_3),
  },
  {
    key: "ppl",
    name: "Push Pull Legs",
    tier: "premium",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Podział na trzy dni: pchnięcie (klatka, barki, triceps), przyciąganie (plecy, biceps) i nogi. Pozwala trenować każdą partię z dobrą częstotliwością bez przeciążania tych samych mięśni dzień po dniu.",
    levels: makeLevels("ppl", LEVELS_3),
  },
  {
    key: "home",
    name: "Home Workout",
    tier: "free",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Trening do wykonania w domu, bez siłowni — bazuje głównie na ćwiczeniach z masą własnego ciała i minimalnym sprzęcie. Dobra opcja, gdy nie masz siłowni pod ręką albo wolisz trenować u siebie.",
    levels: makeLevels("home", ["Uniwersalny"]),
  },
  {
    key: "glutes",
    name: "Pośladki",
    tier: "premium",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Trening skoncentrowany na rozwoju pośladków, uzupełniająco angażujący nogi. Dla osób, które chcą świadomie zwiększyć objętość treningową tej konkretnej partii ponad standardowy plan.",
    levels: makeLevels("glutes", LEVELS_2),
  },
  {
    key: "bands",
    name: "Trening z gumami",
    tier: "free",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Trening oparty wyłącznie na gumach oporowych — sprzęt lekki, tani i mobilny. Sprawdza się w podróży, w domu bez sprzętu siłowego albo jako uzupełnienie głównego planu.",
    levels: makeLevels("bands", LEVELS_2),
  },
  {
    key: "abs",
    name: "Trening brzucha",
    tier: "free",
    comingSoon: true, // I2: no exercises until the template is rebuilt on the new atlas
    description: "Trening skoncentrowany na mięśniach brzucha i core. Dobre uzupełnienie głównego planu dla osób, które chcą dodatkowo popracować nad tą partią.",
    levels: makeLevels("abs", LEVELS_3),
  },
];

// I2: the badge shown on an inactive ready-made template.
function ReadyTemplateSoonBadge() {
  return (
    <span data-testid="template-coming-soon" className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-neutral-800 text-neutral-300 border border-neutral-700">
      WKRÓTCE
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Small shared UI bits                                                    */
/* ---------------------------------------------------------------------- */

