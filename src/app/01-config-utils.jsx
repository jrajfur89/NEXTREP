/* ---------------------------------------------------------------------- */
/* Supabase Auth configuration                                             */
/*                                                                           */
/* Wklej swoje dane z panelu Supabase (Project Settings → API) poniżej.    */
/* SUPABASE_URL: adres Twojego projektu (np. "https://xxxx.supabase.co")   */
/* SUPABASE_PUBLISHABLE_KEY: klucz "anon" / "publishable" — NIGDY klucza   */
/* "service_role" (ten musi zostać wyłącznie po stronie serwera).          */
/* ---------------------------------------------------------------------- */
const SUPABASE_URL = "https://pyhhvbqcjhpulrmqiguz.supabase.co";               // <-- WKLEJ TUTAJ: SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZGduhY1VqosHfz8iGJgXmw_DOaszUMo";   // <-- WKLEJ TUTAJ: SUPABASE_PUBLISHABLE_KEY

// I2 (NEXTREP 1.0, S1 profile — approved by the product owner 24.10.2026):
// - NR_CLEAN_DATA_SPACE: the app keeps its data under its own, clean local key space
//   ("nextrep1_…"). The old keys ("nextrep_…", "trainapp_…") stay on the device untouched — never
//   read, copied, migrated or removed. No old history is carried over.
// - NR_CLOUD_SYNC_ENABLED: sign-in and sync with Supabase are TEMPORARILY off (`supabase` = null, the
//   same calm "no cloud" state the app already has without configuration). Nothing is sent to or
//   deleted from any cloud project; the sync code itself stays in place for a later stage.
// The test harness builds the legacy profile (false / true) only to keep testing that dormant code.
const NR_CLEAN_DATA_SPACE = true;
const NR_CLOUD_SYNC_ENABLED = false;

// Dopóki powyższe pola są puste, `supabase` pozostaje `null` i cały ekran konta
// pokazuje spokojny komunikat zamiast się wywracać — reszta aplikacji (dane lokalne,
// plany, historia, backupy) działa dokładnie tak samo jak wcześniej, bez zmian.
const supabase =
  NR_CLOUD_SYNC_ENABLED && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

// Where Supabase sends people back after the e-mail link (sign-up confirmation, password reset):
// the app root of the CURRENT deployment — never a hard-coded host. Normalised to the directory
// of the page ("…/index.html" → "…/"), so the browser and the installed PWA (start_url
// ./index.html) send the same URL and one Supabase allow-list entry covers both.
// NOTE: Supabase only honours this if it matches Auth → URL Configuration → "Redirect URLs";
// otherwise it silently falls back to the project's "Site URL".
function authRedirectUrl() {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/[^/]*$/, "");
}

/* ---------------------------------------------------------------------- */
/* Utilities                                                               */
/* ---------------------------------------------------------------------- */

const WELCOME_BG_IMAGE = __asset_welcome_bg;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const todayISO = () => new Date().toISOString();

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
};

const fmtDateShort = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
};

// Universal Polish plural-form picker: 1 → "one" (1 seria), 2–4 not ending 12–14 → "few" (2
// serie), everything else (0, 5+, 11–14, 22, ...) → "many" (5 serii). One small helper instead of
// hand-fixing every "N rzeczownik" string across the app.
function plWord(n, one, few, many) {
  const abs = Math.abs(Math.round(n || 0));
  if (abs === 1) return one;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

const fmtDuration = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m} min ${String(s).padStart(2, "0")}s`;
};

// A session counts as "cardio" for display purposes only when every exercise in it is cardio —
// a mixed session (e.g. strength + a treadmill finisher) keeps the normal strength-style summary.
function isCardioSession(session) {
  return session.exercises?.length > 0 && session.exercises.every((ex) => ex.type === "cardio");
}

function cardioSessionSummary(session) {
  const parts = [];
  session.exercises.forEach((ex) => {
    const s = ex.sets?.[0];
    if (!s) return;
    const bits = [];
    if (s.duration) bits.push(fmtDuration(Number(s.duration)));
    if (s.distance) bits.push(`${s.distance} km`);
    if (s.kcal) bits.push(`${s.kcal} kcal`);
    if (bits.length) parts.push(`${ex.name}: ${bits.join(" · ")}`);
  });
  return parts.join(" | ");
}

// Clock format for live, running timers (workout elapsed time, rest timer): M:SS under an hour
// (minutes never zero-padded — "0:42", "12:37", "59:59"), then H:MM once it rolls past an hour
// ("1:00", "1:15", "2:03") — never "75:00" and never a bare minute count like "75 min".
const fmtClock = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// "YYYY-MM-DD" for the LOCAL calendar day, for <input type="date"> values and day-bucketing
// (calendars, "today" checks). Deliberately not `date.toISOString().slice(0, 10)`, which reads
// the UTC day — near midnight that can be a day off from what the person actually sees on their
// clock, showing yesterday's date in a date picker or bucketing a session onto the wrong day.
function toLocalDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CATEGORIES = [
  "Klatka", "Plecy", "Nogi", "Barki", "Biceps", "Triceps",
  "Brzuch", "Pośladki", "Przedramiona", "Całe ciało", "Cardio",
];

const EQUIPMENT_OPTIONS = [
  "Masa ciała", "Drążek", "Sztanga", "Hantle", "Kettlebell",
  "Sztanga łamana", "Gumy oporowe", "Obciążenie", "Maszyny", "Linki", "Piłka", "Inne",
];

// Equipment that implies a bodyweight-style set (reps only, no external weight number)
const BODYWEIGHT_EQUIPMENT = ["Masa ciała", "Drążek", "Piłka", "Gumy oporowe"];

// Visual identity per muscle-group category, used for tile pickers (icon-based, since embedding
// real photos per category would bloat the file significantly).
const CATEGORY_META = {
  "Klatka": { icon: Heart, classes: "bg-orange-500/15 border-orange-500/30 text-orange-400" },
  "Plecy": { icon: ArrowUpDown, classes: "bg-sky-500/15 border-sky-500/30 text-sky-400" },
  "Nogi": { icon: Footprints, classes: "bg-lime-500/15 border-lime-500/30 text-lime-400" },
  "Barki": { icon: CircleDot, classes: "bg-purple-500/15 border-purple-500/30 text-purple-400" },
  "Biceps": { icon: Zap, classes: "bg-pink-500/15 border-pink-500/30 text-pink-400" },
  "Triceps": { icon: Flame, classes: "bg-amber-500/15 border-amber-500/30 text-amber-400" },
  "Brzuch": { icon: Hexagon, classes: "bg-teal-500/15 border-teal-500/30 text-teal-400" },
  "Pośladki": { icon: Circle, classes: "bg-red-500/15 border-red-500/30 text-red-400" },
  "Przedramiona": { icon: Hand, classes: "bg-indigo-500/15 border-indigo-500/30 text-indigo-400" },
  "Całe ciało": { icon: PersonStanding, classes: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" },
  "Cardio": { icon: Activity, classes: "bg-rose-500/15 border-rose-500/30 text-rose-400" },
};

const CARDIO_DEVICE_TYPES = ["Bieżnia", "Orbitrek", "Rower stacjonarny", "Ergometr wioślarski", "Schody", "Air Bike", "Inne"];

// Which of the shared cardio fields are relevant for each device — never force a field that
// doesn't apply (e.g. no incline for a rower, no resistance level for a bieżnia).
const CARDIO_DEVICE_FIELDS = {
  "Bieżnia": ["distance", "speed", "incline", "kcal", "heartRate"],
  "Orbitrek": ["distance", "resistance", "kcal", "heartRate"],
  "Rower stacjonarny": ["distance", "speed", "kcal", "heartRate"],
  "Ergometr wioślarski": ["distance", "pace", "kcal", "heartRate"],
  "Schody": ["level", "floors", "kcal", "heartRate"],
  "Air Bike": ["distance", "resistance", "kcal", "heartRate"],
  "Inne": ["distance", "speed", "kcal", "heartRate"],
};

const CARDIO_FIELD_LABELS = {
  distance: { label: "Dystans", unit: "km" },
  speed: { label: "Prędkość", unit: "km/h" },
  incline: { label: "Nachylenie", unit: "%" },
  resistance: { label: "Opór", unit: "poziom" },
  pace: { label: "Tempo", unit: "/500m" },
  level: { label: "Poziom", unit: "" },
  floors: { label: "Piętra/stopnie", unit: "" },
  kcal: { label: "Spalone kcal", unit: "kcal" },
  heartRate: { label: "Tętno", unit: "bpm" },
};

const CATEGORY_IMAGES = {
  "Klatka": __asset_muscle_klatka,
  "Plecy": __asset_muscle_plecy,
  "Nogi": __asset_muscle_nogi,
  // Łydki: own tile (same reference sheet and crop as the others); Czworogłowe uda keep "Nogi".
  "Łydki": __asset_muscle_lydki,
  "Barki": __asset_muscle_barki,
  "Biceps": __asset_muscle_biceps,
  "Triceps": __asset_muscle_triceps,
  "Brzuch": __asset_muscle_brzuch,
  "Pośladki": __asset_muscle_posladki,
  "Przedramiona": __asset_muscle_przedramiona,
  "Całe ciało": __asset_muscle_cale_cialo,
  "Cardio": __asset_muscle_cardio,
};

const KIND_LABELS = {
  weight: { label: "Ciężar", short: "kg" },
  bodyweight: { label: "Masa ciała", short: "pwt" },
  bodyweightPlus: { label: "Masa ciała + ciężar", short: "MW+kg" },
  time: { label: "Czas", short: "czas" },
  sets: { label: "Bez powtórzeń", short: "serie" },
  cardio: { label: "Cardio", short: "cardio" },
};

