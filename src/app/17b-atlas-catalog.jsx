/* ---------------------------------------------------------------------- */
/* AT2 — „Atlas ćwiczeń”: the NEXTREP 1.0 atlas as a READ-ONLY catalog       */
/*                                                                           */
/* Source: the approved atlas release bundled with the app (ATLAS_RELEASE,  */
/* engine module atlas-release.js). This file is the only reader in the app.*/
/* The catalog screen writes nothing. Since I3 the same adapter serves the  */
/* pickers of plans and workouts (below): atlas exercises enter plans and   */
/* workouts by id + load snapshot, never the user's own exercise list.      */
/* ---------------------------------------------------------------------- */

const ATLAS_LOAD_MODEL_LABELS = {
  barbell_total: "Sztanga — wpisujesz ciężar całkowity",
  dumbbell_pair: "Dwa hantle — wpisujesz ciężar jednego hantla",
  dumbbell_single: "Jeden hantel — wpisujesz jego ciężar",
  kettlebell_pair: "Dwa kettle — wpisujesz ciężar jednego",
  kettlebell_single: "Jeden kettle — wpisujesz jego ciężar",
  machine_stack: "Maszyna — ciężar ze stosu",
  plate_loaded: "Maszyna na talerze — ciężar całkowity",
  cable: "Wyciąg — ciężar ze stosu",
  smith_plates_only: "Maszyna Smitha — wpisujesz tylko masę talerzy",
  bodyweight: "Masa ciała",
  bodyweight_plus: "Masa ciała + dodatkowy ciężar — wpisujesz tylko dodane kg",
  assisted: "Z asystą — wpisujesz ciężar asysty",
  band: "Opór gumy",
  time: "Na czas",
  cardio: "Cardio",
  sets_only: "Tylko serie",
};
const ATLAS_MEASUREMENT_LABELS = {
  weight_reps: "Ciężar i powtórzenia",
  bodyweight_reps: "Masa ciała i powtórzenia",
  band_reps: "Guma i powtórzenia",
  time: "Czas",
  cardio: "Cardio",
  sets_only: "Tylko serie",
};
const ATLAS_LATERALITY_LABELS = { bilateral: "Obustronnie", unilateral: "Jednostronnie", alternating: "Naprzemiennie" };
const ATLAS_REPS_COUNTING_LABELS = { total: "Powtórzenia łącznie", per_side: "Powtórzenia na stronę" };
const ATLAS_STATS_GROUP_LABELS = {
  chest: "Klatka",
  back: "Plecy",
  shoulders: "Barki",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Przedramiona",
  abs: "Brzuch",
  quads: "Uda — przód",
  hamstrings_glutes: "Uda — tył i pośladki",
  calves: "Łydki",
};

function deepFreezeAtlasCatalog(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreezeAtlasCatalog(v);
  }
  return value;
}

// Pure: an atlas release → the read-only catalog shown by the screen (active exercises only,
// sorted by Polish name). Unknown codes fall back to the code itself instead of failing.
function buildAtlasCatalog(atlas) {
  const a = atlas || {};
  const d = a.dictionaries || {};
  const byCode = (list) => new Map((Array.isArray(list) ? list : []).map((x) => [x.code, x]));
  const equipment = byCode(d.equipment);
  const muscles = byCode(d.muscles);
  const families = new Map((Array.isArray(a.families) ? a.families : []).map((f) => [f.familyId, f]));
  const variantAttrs = byCode(d.variantAttributes);
  const option = (code, labels) => ({ code: code ?? null, label: (code != null && labels[code]) || (code != null ? String(code) : "—") });
  const muscle = (code) => {
    const m = muscles.get(code);
    const group = m ? m.statsGroup : null;
    return { code, label: (m && m.labelPl) || code, group, groupLabel: (group && ATLAS_STATS_GROUP_LABELS[group]) || group || "" };
  };
  const exercises = (Array.isArray(a.exercises) ? a.exercises : [])
    .filter((e) => e && e.status === "active")
    .map((e) => {
      const primaryMuscles = (e.primaryMuscles || []).map(muscle);
      const groups = [];
      for (const m of primaryMuscles) if (m.group && !groups.includes(m.group)) groups.push(m.group);
      return {
        exerciseId: e.exerciseId,
        name: e.namePl,
        aliases: [...(e.aliasesPl || [])],
        familyId: e.familyId ?? null,
        familyName: (families.get(e.familyId) || {}).namePl || "",
        // I4.6 (card v3): the atlas's own card content and variant attributes, read as they are
        variantAttributes: (e.variantAttributes || []).map((code) => ({ code, dimension: (variantAttrs.get(code) || {}).dimension || String(code).split(".")[0], label: (variantAttrs.get(code) || {}).labelPl || code })),
        instructions: [...(e.instructionsPl || [])],
        mistakes: [...(e.commonMistakesPl || [])],
        safety: [...(e.safetyPl || [])],
        videoUrl: e.videoUrl || null,
        equipment: (e.equipment || []).map((code) => ({ code, label: (equipment.get(code) || {}).labelPl || code })),
        primaryMuscles,
        secondaryMuscles: (e.secondaryMuscles || []).map(muscle),
        statsGroups: groups.map((g) => ({ code: g, label: ATLAS_STATS_GROUP_LABELS[g] || g })),
        measurementType: option(e.measurementType, ATLAS_MEASUREMENT_LABELS),
        loadModel: option(e.loadModel, ATLAS_LOAD_MODEL_LABELS),
        laterality: option(e.laterality, ATLAS_LATERALITY_LABELS),
        repsCounting: option(e.repsCounting, ATLAS_REPS_COUNTING_LABELS),
        implements: e.implements ?? null,
        tips: e.tipsPl || "",
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, "pl"));
  return deepFreezeAtlasCatalog({ atlasVersion: a.atlasVersion ?? null, exercises });
}

const ATLAS_CATALOG = buildAtlasCatalog(ATLAS_RELEASE);

function AtlasChips({ items, testId }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {items.map((it) => (
        <span key={it.code} className="text-xs px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800/60 text-neutral-200 font-medium">
          {it.label}
        </span>
      ))}
    </div>
  );
}

function AtlasSection({ title, children }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
      <p className="text-neutral-500 text-[11px] font-bold uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* I4.6 — exercise card „Compact Tabs v3” (master EXV3, canvas v76/v81)     */
/* Ćwiczenie · Historia · Warianty. Read-only: the atlas release and the     */
/* saved history are only read; nothing is written (D7 state lives in       */
/* memory only).                                                             */
/* ---------------------------------------------------------------------- */
const EXV_DIMENSION_LABELS = { angle: "Kąt ławki", execution: "Wykonanie", grip: "Chwyt", laterality: "Strona", position: "Pozycja" };
const EXV_NUM = "Inter, 'Barlow Condensed', sans-serif";
const EXV_TOP = "calc(max(env(safe-area-inset-top, 0px), 12px) + 44px)"; // the pinned tabs sit under the pinned bar
// D7: the card's history state kept while a workout opened from the table is shown (memory only).
const exvMemory = { restore: false, exerciseId: null, tab: "ex", years: null, sel: null, scrollY: 0, hScroll: {} };
function exvClearRestore() {
  exvMemory.restore = false;
}
const exvKg = (v) => String(v).replace(".", ",");
const exvDayMonth = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const exvMmSs = (sec) => {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};
// Every execution of ONE exercise (no merging of variants): session + its exercise entry; stable
// executionId = session id + entry id (or position), also for two entries in one session.
function exvExecutions(history, exerciseId) {
  const out = [];
  for (const s of Array.isArray(history) ? history : []) {
    (s.exercises || []).forEach((ex, i) => {
      if (ex && ex.exerciseId === exerciseId) out.push({ executionId: `${s.id}:${ex.id || i}`, session: s, date: s.date, kind: ex.type, sets: ex.sets || [] });
    });
  }
  return out.sort((a, b) => new Date(b.date) - new Date(a.date));
}
// One cell of the table, by the exercise's existing model (values as saved).
function exvCell(set, kind) {
  if (!set) return null;
  if (kind === "time") return { main: `${Number(set.duration) || 0} s` };
  if (kind === "bodyweight") return { main: String(set.reps ?? "—") };
  const hasW = set.weight !== "" && set.weight != null;
  if (kind === "sets" && !set.reps) return { main: hasW ? `${exvKg(set.weight)} kg` : "✓" };
  const w = hasW ? `${kind === "bodyweightPlus" ? "+" : ""}${exvKg(set.weight)}` : "—";
  return { main: w, reps: `×${set.reps ?? "—"}` };
}
function exvCardio(set) {
  const dur = Number(set && set.duration) || 0;
  const dist = Number(String((set && set.distance) || "").replace(",", ".")) || 0;
  const main = dur && dist ? `${exvMmSs(dur)} · ${dist.toFixed(2).replace(".", ",")} km` : dur ? exvMmSs(dur) : dist ? `— · ${dist.toFixed(2).replace(".", ",")} km` : "—";
  const sub = dur && dist ? `${exvMmSs(dur / dist)} /km` : dur ? "bez dystansu" : dist ? "bez czasu" : "";
  return { main, sub, pace: dur && dist ? dur / dist : null };
}
// D5 — the chart metric by the exercise's model (existing functions, no new algorithm).
function exvMetric(kind) {
  if (kind === "bodyweight") return { title: "Maksymalne powtórzenia", value: (e) => Math.max(0, ...e.sets.map((s) => Number(s.reps) || 0)), text: (v) => `${v} powt.` };
  if (kind === "time") return { title: "Maksymalny czas", value: (e) => Math.max(0, ...e.sets.map((s) => Number(s.duration) || 0)), text: (v) => `${v} s` };
  if (kind === "cardio") return { title: "Tempo", value: (e) => exvCardio(e.sets[0]).pace, text: (v) => `${exvMmSs(v)} /km` };
  return { title: "Objętość", value: (e) => exerciseDetailVolume(e.sets), text: (v) => `${fmtThousands(v)} kg` };
}

const EXV_HEAD = { fontWeight: 500, fontSize: "15px", lineHeight: "18px", letterSpacing: ".03em", textTransform: "uppercase" };
function ExvSectionHead({ icon: Icon, children, id }) {
  return (
    <h2 id={id} style={{ margin: 0, display: "flex" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <Icon aria-hidden="true" size={18} color={NR.warm} strokeWidth={2.25} style={{ flexShrink: 0 }} />
        <span style={{ ...nrHeadText, ...EXV_HEAD }}>{children}</span>
      </span>
    </h2>
  );
}
function ExvDisclosure({ id, icon: Icon, iconColor = NR.textSecondary, border = "#232325", title, sub, open, onToggle, children, testId }) {
  return (
    <section data-testid={testId} style={{ borderRadius: "14px", border: `1px solid ${border}`, background: "#0F0F10" }}>
      <h2 style={{ margin: 0 }}>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} style={{ width: "100%", minHeight: "52px", display: "flex", alignItems: "center", gap: "10px", padding: "4px 12px", border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
          {Icon && <Icon aria-hidden="true" size={20} color={iconColor} style={{ flexShrink: 0 }} />}
          <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
            <span style={{ fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 600, color: NR.textDisplay, overflowWrap: "anywhere" }}>{title}</span>
            {sub && <span style={{ fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", color: "#9A9A9A" }}>{sub}</span>}
          </span>
          <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "none" }}>
            <ChevronDown aria-hidden="true" size={20} color="#9A9A9A" />
          </span>
        </button>
      </h2>
      {open && (
        <div id={id} style={{ padding: "0 12px 12px" }}>
          {children}
        </div>
      )}
    </section>
  );
}
const exvPoints = (n) => `${n} ${plWord(n, "punkt", "punkty", "punktów")}`;
const EXV_ITEM_TEXT = { fontFamily: NR.font, fontSize: "18px", lineHeight: "23px", color: "#E8E8E8" };

// „Ćwiczenie” — instruction, mistakes, safety, tips and the full metadata, only from the atlas.
// AT3-D12: a section without data is not shown (no placeholder content).
function ExvExerciseTab({ exercise }) {
  const [allSteps, setAllSteps] = useState(false);
  const [open, setOpen] = useState({ mi: false, sa: false, de: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const steps = exercise.instructions || [];
  const shown = allSteps ? steps : steps.slice(0, 3);
  const row = (dt, dd, testId) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px", padding: "8px 0", borderTop: "1px solid #1E1E20" }}>
      <dt style={{ fontFamily: NR.font, fontSize: "14px", lineHeight: "17px", color: NR.textMuted }}>{dt}</dt>
      <dd data-testid={testId} style={{ margin: 0, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", color: "#F0F0F0" }}>
        {dd}
      </dd>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {exercise.videoUrl && (
        <section aria-label="Film" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "8px 8px 8px 12px", borderRadius: "14px", background: "#0F0F10", border: "1px solid #232325" }}>
          <span aria-hidden="true" style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "10px", background: "rgba(255,106,0,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Video size={20} color="#FF9A3D" />
          </span>
          <span style={{ flex: "1 1 140px", minWidth: 0, fontFamily: NR.font, fontSize: "18px", lineHeight: "21px", fontWeight: 600, color: NR.textDisplay }}>Film instruktażowy</span>
          <a href={exercise.videoUrl} target="_blank" rel="noreferrer" aria-label="Zobacz film instruktażowy" style={{ minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 14px", borderRadius: "12px", background: "rgba(255,106,0,.12)", border: "1px solid rgba(255,133,27,.55)", color: "#FFB27A", fontFamily: NR.font, fontSize: "17px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            <PlayCircle aria-hidden="true" size={16} color="#FFB27A" /> Zobacz film
          </a>
        </section>
      )}
      {steps.length > 0 && (
        <section aria-labelledby="exv-st-h" data-testid="exv-steps" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <ExvSectionHead icon={ListOrdered} id="exv-st-h">Sposób wykonania</ExvSectionHead>
          <ol id="exv-steps-l" aria-label="Kroki wykonania" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
            {shown.map((t, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "30px minmax(0, 1fr)", gap: "12px", alignItems: "start" }}>
                <span aria-hidden="true" style={{ width: "30px", height: "30px", borderRadius: "15px", background: "rgba(255,106,0,.14)", border: "1px solid rgba(255,133,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: EXV_NUM, fontSize: "15px", lineHeight: "18px", fontWeight: 600, color: "#FFB27A" }}>
                  {i + 1}
                </span>
                <span style={{ fontFamily: NR.font, fontSize: "19px", lineHeight: "25px", color: "#F2F2F2", paddingTop: "2px" }}>{t}</span>
              </li>
            ))}
          </ol>
          {steps.length > 3 && (
            <button type="button" aria-expanded={allSteps} aria-controls="exv-steps-l" onClick={() => setAllSteps((v) => !v)} style={{ alignSelf: "flex-start", minHeight: "44px", padding: "0 2px", border: 0, background: "transparent", color: "#FF9A3D", fontFamily: NR.font, fontSize: "18px", lineHeight: "21px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {allSteps ? "Pokaż mniej" : `Pokaż całą instrukcję (${steps.length} ${plWord(steps.length, "krok", "kroki", "kroków")})`}
              <ChevronDown aria-hidden="true" size={18} color="#FF9A3D" style={{ transform: allSteps ? "rotate(180deg)" : "none" }} />
            </button>
          )}
        </section>
      )}
      {(exercise.mistakes || []).length > 0 && (
        <ExvDisclosure id="exv-mi" testId="exv-mistakes" icon={CircleSlash} iconColor="#D9A066" border="rgba(217,160,102,.30)" title="Najczęstsze błędy" sub={exvPoints(exercise.mistakes.length)} open={open.mi} onToggle={() => toggle("mi")}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {exercise.mistakes.map((t, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", gap: "10px", alignItems: "start" }}>
                <CircleSlash aria-hidden="true" size={18} color="#D9A066" style={{ marginTop: "2px" }} />
                <span style={EXV_ITEM_TEXT}>{t}</span>
              </li>
            ))}
          </ul>
        </ExvDisclosure>
      )}
      {(exercise.safety || []).length > 0 && (
        <ExvDisclosure id="exv-sa" testId="exv-safety" icon={Shield} title="Bezpieczeństwo" sub={exvPoints(exercise.safety.length)} open={open.sa} onToggle={() => toggle("sa")}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {exercise.safety.map((t, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", gap: "10px", alignItems: "start" }}>
                <Check aria-hidden="true" size={18} color={NR.textSecondary} style={{ marginTop: "2px" }} />
                <span style={EXV_ITEM_TEXT}>{t}</span>
              </li>
            ))}
          </ul>
        </ExvDisclosure>
      )}
      {exercise.tips && (
        <section aria-labelledby="exv-tp-h" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <ExvSectionHead icon={Lightbulb} id="exv-tp-h">Wskazówki treningowe</ExvSectionHead>
          <p data-testid="atlas-detail-tips" style={{ margin: 0, ...EXV_ITEM_TEXT }}>{exercise.tips}</p>
        </section>
      )}
      <ExvDisclosure id="exv-de" testId="exv-details" icon={Info} title="Szczegóły ćwiczenia" open={open.de} onToggle={() => toggle("de")}>
        <dl style={{ margin: 0 }}>
          {row("Mięśnie główne", exercise.primaryMuscles.map((m) => m.label).join(", "), "atlas-detail-primary")}
          {exercise.secondaryMuscles.length > 0 && row("Mięśnie pomocnicze", exercise.secondaryMuscles.map((m) => m.label).join(", "), "atlas-detail-secondary")}
          {exercise.statsGroups.length > 0 && row("Kategoria", exercise.statsGroups.map((g) => g.label).join(", "))}
          {(exercise.variantAttributes || []).map((a) => (
            <React.Fragment key={a.code}>{row(EXV_DIMENSION_LABELS[a.dimension] || a.dimension, a.label)}</React.Fragment>
          ))}
          {exercise.aliases.length > 0 && row("Inne nazwy", exercise.aliases.join(" · "), "atlas-detail-aliases")}
          {row("Sposób zapisu", exercise.measurementType.label)}
          {row("Obciążenie", exercise.loadModel.label, "atlas-detail-model")}
          {row("Strony", `${exercise.laterality.label} · ${exercise.repsCounting.label.toLowerCase()}`, "atlas-detail-sides")}
          {row("Sprzęt", exercise.equipment.map((e) => e.label).join(" · "), "atlas-detail-equipment")}
        </dl>
      </ExvDisclosure>
    </div>
  );
}

// PRO chart — the last 7 executions, equal spacing, real dates, year boundary dashed; a point is a
// 44 × 44 radio (arrows / Home / End) selecting the whole row of that execution in the table.
function ExvChart({ points, metric, selected, onSelect }) {
  const n = points.length;
  const W = 600;
  const H = 110;
  const xs = points.map((_, i) => (n === 1 ? W / 2 : 4 + (i * (W - 8)) / (n - 1)));
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.max(1, Math.abs(hi) || 1);
  const ys = vals.map((v) => (hi === lo ? 55 : 10 + (1 - (v - lo) / span) * 80));
  const pct = (x) => (x / W) * 100;
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const boundaries = [];
  for (let i = 1; i < n; i++) {
    const a = new Date(points[i - 1].date).getFullYear();
    const b = new Date(points[i].date).getFullYear();
    if (a !== b) boundaries.push({ x: (xs[i - 1] + xs[i]) / 2, before: a, after: b });
  }
  const sel = points.find((p) => p.executionId === selected) || points[n - 1];
  const refs = useRef([]);
  const onKey = (e, i) => {
    const to = e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(n - 1, i + 1) : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to == null) return;
    e.preventDefault();
    onSelect(points[to].executionId);
    const el = refs.current[to];
    if (el && el.focus) el.focus();
  };
  return (
    <section aria-labelledby="exv-ch-h" data-testid="exv-chart" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px 8px", borderRadius: "14px", background: "#0E0E0F", border: "1px solid #232325" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <h2 id="exv-ch-h" style={{ margin: 0, fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", fontWeight: 500, color: NR.textSecondary }}>
          {metric.title} · ostatnie {n} {plWord(n, "wykonanie", "wykonania", "wykonań")}
        </h2>
        <span style={{ fontFamily: NR.font, fontSize: "12px", lineHeight: "15px", color: "#6E6E70" }}>PRO</span>
      </div>
      <p data-readout data-testid="exv-readout" aria-live="polite" style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px" }}>
        <span style={{ fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", color: "#D9D9D9" }}>{fmtDate(sel.date)}</span>
        <span style={{ fontFamily: EXV_NUM, fontSize: "18px", lineHeight: "22px", fontWeight: 600, color: NR.textDisplay, whiteSpace: "nowrap" }}>{metric.text(sel.value)}</span>
      </p>
      <div style={{ position: "relative", height: "110px", margin: "0 6px" }}>
        <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="110" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <linearGradient id="exv-vg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#FF851B" stopOpacity=".22" />
              <stop offset="1" stopColor="#FF851B" stopOpacity="0" />
            </linearGradient>
          </defs>
          {boundaries.map((b, i) => (
            <line key={i} x1={b.x} x2={b.x} y1="0" y2={H} stroke="#3A3A3C" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          ))}
          {n > 1 && <path d={`${line} L${xs[n - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`} fill="url(#exv-vg)" />}
          {n > 1 && <path d={line} fill="none" stroke="#FF851B" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        </svg>
        {boundaries.map((b, i) => (
          <React.Fragment key={i}>
            <span style={{ position: "absolute", left: `calc(${pct(b.x)}% - 46px)`, top: 0, width: "40px", textAlign: "right", fontFamily: NR.font, fontSize: "11px", lineHeight: "13px", color: "#6E6E70" }}>{b.before}</span>
            <span style={{ position: "absolute", left: `calc(${pct(b.x)}% + 6px)`, top: 0, fontFamily: NR.font, fontSize: "11px", lineHeight: "13px", color: "#6E6E70" }}>{b.after}</span>
          </React.Fragment>
        ))}
        <div role="radiogroup" aria-label={`${metric.title} — wybierz wykonanie, aby zaznaczyć je w tabeli`} style={{ position: "absolute", inset: 0 }}>
          {points.map((p, i) => {
            const on = p.executionId === sel.executionId;
            return (
              <button
                key={p.executionId}
                ref={(el) => (refs.current[i] = el)}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-pt={p.executionId}
                data-testid="exv-point"
                aria-label={`${fmtDate(p.date)}: ${metric.text(p.value)}`}
                onClick={() => onSelect(p.executionId)}
                onKeyDown={(e) => onKey(e, i)}
                style={{ position: "absolute", left: `calc(${pct(xs[i])}% - 22px)`, top: `${ys[i] - 22}px`, width: "44px", height: "44px", border: 0, padding: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <span style={{ display: "block", width: on ? "14px" : "10px", height: on ? "14px" : "10px", borderRadius: "50%", background: on ? NR.warm : "#151516", border: `2px solid ${NR.warm}`, boxShadow: on ? "0 0 0 4px rgba(255,133,27,.25)" : "none" }} />
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" style={{ position: "relative", height: "16px", margin: "0 6px" }}>
        {points.map((p, i) => {
          const on = p.executionId === sel.executionId;
          return (
            <span key={p.executionId} style={{ position: "absolute", left: `${pct(xs[i])}%`, transform: "translateX(-50%)", fontFamily: NR.font, fontSize: "12px", lineHeight: "15px", color: on ? "#FFB27A" : NR.textMuted, fontWeight: on ? 600 : 400, whiteSpace: "nowrap" }}>
              {exvDayMonth(p.date)}
            </span>
          );
        })}
      </div>
    </section>
  );
}

// Table of one year: pinned date + Seria 1…N (scrolls sideways from 5 sets), 38 px rows (D1).
function ExvYearTable({ year, rows, cardio, selected, onOpen, scrollRef }) {
  const cols = cardio ? 1 : Math.max(1, ...rows.map((r) => r.sets.length));
  const cellBase = { padding: "2px 1px 2px 4px", verticalAlign: "middle" };
  const sameDay = {};
  return (
    <div data-hfit role="region" aria-label={`Rok ${year}, tabela`} ref={scrollRef} data-testid={`exv-table-${year}`} style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #232325", background: "#0F0F10" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "15px", tableLayout: "fixed", width: "100%", minWidth: `calc(3em + ${cols} * 2.9em)` }}>
        <colgroup>
          <col style={{ width: cardio ? "4em" : "3em" }} />
          {Array.from({ length: cols }, (_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" style={{ position: "sticky", left: 0, zIndex: 2, padding: "4px 1px 4px 4px", textAlign: "left", background: "#0F0F10", boxShadow: "1px 0 0 #2A2A2A", fontFamily: NR.font, fontSize: "13px", lineHeight: "16px", fontWeight: 500, color: NR.textMuted }}>Data</th>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i} scope="col" style={{ padding: "4px 1px 4px 4px", textAlign: "left", fontFamily: NR.font, fontSize: "13px", lineHeight: "16px", fontWeight: 500, color: NR.textMuted }}>
                {cardio ? "Wynik" : `Seria ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = r.executionId === selected;
            const key = new Date(r.date).toDateString();
            sameDay[key] = (sameDay[key] || 0) + 1;
            const nth = rows.filter((x) => new Date(x.date).toDateString() === key).length > 1 ? ` (${sameDay[key]})` : "";
            const border = on ? "1px solid rgba(255,133,27,.45)" : "1px solid #1E1E20";
            const tdBg = on ? { background: "rgba(255,106,0,.13)" } : {};
            let n = 0;
            let d = 0;
            return (
              <tr key={r.executionId} data-exec={r.executionId} data-testid="exv-row" data-sel={on ? "" : undefined} onClick={() => onOpen(r)} style={{ height: "38px", cursor: "pointer", scrollMarginTop: "150px", scrollMarginBottom: "110px" }}>
                <th scope="row" style={{ position: "sticky", left: 0, zIndex: 1, padding: 0, borderTop: border, background: on ? "#2A1708" : "#0F0F10", boxShadow: on ? "inset 3px 0 0 #FF851B, 1px 0 0 #2A2A2A" : "1px 0 0 #2A2A2A" }}>
                  <button
                    type="button"
                    aria-label={`${fmtDate(r.date)}${nth} — ${on ? "wybrane na wykresie. " : ""}pokaż szczegóły treningu`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(r);
                    }}
                    style={{ width: "100%", minHeight: "37px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "0 3px 0 7px", border: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ fontFamily: NR.font, fontSize: "15px", lineHeight: "17px", fontWeight: 600, color: on ? "#FFB27A" : NR.textDisplay, textDecoration: "underline", textDecorationColor: on ? NR.warm : "#5A5A5C", textUnderlineOffset: "3px" }}>{exvDayMonth(r.date)}</span>
                  </button>
                </th>
                {cardio ? (
                  (() => {
                    const c = exvCardio(r.sets[0]);
                    return (
                      <td style={{ ...cellBase, borderTop: border, ...tdBg }}>
                        <span style={{ fontFamily: EXV_NUM, fontSize: "14px", lineHeight: "18px", fontWeight: 500, letterSpacing: "-0.2px", color: NR.textPrimary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.main}</span>
                        {c.sub && <span style={{ display: "block", fontFamily: EXV_NUM, fontSize: "12px", lineHeight: "15px", color: "#A8A8A8" }}>{c.sub}</span>}
                      </td>
                    );
                  })()
                ) : (
                  Array.from({ length: cols }, (_, i) => {
                    const s = r.sets[i];
                    if (!s)
                      return (
                        <td key={i} style={{ ...cellBase, borderTop: border, color: "#4A4A4A", fontFamily: EXV_NUM, fontSize: "14px", ...tdBg }}>
                          <span aria-hidden="true">·</span>
                          <span style={AW_SR}>brak serii</span>
                        </td>
                      );
                    const drop = s.setType === "dropset";
                    if (drop) d++;
                    else n++;
                    const c = exvCell(s, r.kind);
                    return (
                      <td key={i} style={{ ...cellBase, borderTop: border, ...tdBg }}>
                        {drop && (
                          <span aria-label="dropset" style={{ marginRight: "3px", fontFamily: NR.font, fontSize: "12px", lineHeight: "15px", fontWeight: 700, color: "#FF9A3D" }}>
                            {d > 1 ? `D${d}` : "D"}
                          </span>
                        )}
                        <span style={{ fontFamily: EXV_NUM, fontSize: "14px", lineHeight: "18px", fontWeight: 500, letterSpacing: "-0.2px", color: NR.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ whiteSpace: "nowrap" }}>{c.main}</span>
                          {c.reps && (
                            <>
                              <wbr />
                              <span style={{ whiteSpace: "nowrap" }}>{c.reps}</span>
                            </>
                          )}
                        </span>
                      </td>
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// „Historia” — the full history of this exerciseId, FREE and PRO (table); PRO adds the chart.
function ExvHistoryTab({ exercise, history, isPro, onOpenUnlock, onOpenSession, mem }) {
  const execs = useMemo(() => exvExecutions(history, exercise.exerciseId), [history, exercise.exerciseId]);
  const nowYear = new Date().getFullYear();
  const byYear = useMemo(() => {
    const m = new Map();
    for (const e of execs) {
      const y = new Date(e.date).getFullYear();
      if (!m.has(y)) m.set(y, []);
      m.get(y).push(e);
    }
    return m;
  }, [execs]);
  // D2 / D3: the current year always (expanded); other years only with executions, collapsed — the
  // newest earlier year opens too when the current year has none.
  const years = [...new Set([nowYear, ...byYear.keys()])].sort((a, b) => b - a);
  const defaultOpen = () => {
    const o = { [nowYear]: true };
    if (!byYear.has(nowYear)) {
      const prev = years.find((y) => y < nowYear && byYear.has(y));
      if (prev) o[prev] = true;
    }
    return o;
  };
  const [openYears, setOpenYears] = useState(() => (mem && mem.years) || defaultOpen());
  const kind = execs[0] ? execs[0].kind : null;
  const cardio = kind === "cardio";
  const metric = exvMetric(kind);
  const points = execs
    .slice()
    .reverse()
    .map((e) => ({ executionId: e.executionId, date: e.date, value: metric.value(e) }))
    .filter((p) => p.value != null && Number.isFinite(p.value))
    .slice(-7);
  const [selected, setSelected] = useState(() => (mem && mem.sel) || (points.length ? points[points.length - 1].executionId : null));
  const [notice, setNotice] = useState(null);
  const scrollRefs = useRef({});
  useEffect(() => {
    // D7: horizontal positions of the year tables come back too
    if (!mem || !mem.hScroll) return;
    for (const [y, x] of Object.entries(mem.hScroll)) {
      const el = scrollRefs.current[y];
      if (el) el.scrollLeft = x;
    }
  }, []);
  const select = (id) => {
    setSelected(id);
    const e = execs.find((x) => x.executionId === id);
    if (!e) return;
    const y = new Date(e.date).getFullYear();
    if (!openYears[y]) {
      setOpenYears((o) => ({ ...o, [y]: true }));
      setNotice({ year: y, text: `Rozwinięto rok ${y}, aby pokazać wybrane wykonanie.` });
    } else setNotice(null);
    setTimeout(() => {
      const row = document.querySelector(`[data-exec="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id}"]`);
      if (row && row.scrollIntoView) {
        try {
          row.scrollIntoView({ block: "nearest" });
        } catch {}
      }
    }, 0);
  };
  const open = (r) => {
    exvMemory.restore = true;
    exvMemory.exerciseId = exercise.exerciseId;
    exvMemory.tab = "hist";
    exvMemory.years = openYears;
    exvMemory.sel = selected;
    exvMemory.scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    exvMemory.hScroll = Object.fromEntries(Object.entries(scrollRefs.current).filter(([, el]) => el).map(([y, el]) => [y, el.scrollLeft]));
    onOpenSession && onOpenSession(r.session, r.executionId);
  };
  const unilateral = exercise.repsCounting.code === "per_side";
  const legend =
    kind === "cardio" ? (
      "czas · dystans · tempo (wyliczane)"
    ) : (
      <>
        {kind === "time" ? "czas serii · " : kind === "bodyweight" ? `powt.${unilateral ? " na stronę" : ""} · ` : `kg × powt.${unilateral ? " na stronę" : ""} · `}
        {kind !== "time" && (
          <>
            <span style={{ color: "#FF9A3D", fontWeight: 700 }}>D</span> = dropset ·{" "}
          </>
        )}
        <span style={{ color: "#6E6E70" }}>·</span> = brak serii
      </>
    );

  if (execs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0, fontFamily: NR.font, fontSize: "15px", lineHeight: "19px", color: NR.textMuted }}>Tylko to ćwiczenie — warianty mają osobną historię.</p>
        <div data-testid="exv-no-history" style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px", borderRadius: "12px", background: "#0E0E0F", border: "1px dashed #2E2E30" }}>
          <HistoryIcon aria-hidden="true" size={20} color={NR.textSecondary} style={{ flexShrink: 0 }} />
          <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ fontFamily: NR.font, fontSize: "18px", lineHeight: "21px", fontWeight: 600, color: NR.textDisplay }}>Brak historii</span>
            <span style={{ fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: "#C8C8C8" }}>To ćwiczenie nie pojawiło się jeszcze w żadnym treningu.</span>
          </span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p style={{ margin: 0, fontFamily: NR.font, fontSize: "15px", lineHeight: "19px", color: NR.textMuted }}>Wszystkie wykonania tego ćwiczenia (warianty mają osobną historię). Dotknij daty, aby otworzyć trening.</p>
      {isPro ? (
        points.length > 0 && <ExvChart points={points} metric={metric} selected={selected} onSelect={select} />
      ) : (
        <div data-testid="exv-pro-line" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "4px 4px 4px 10px", borderRadius: "12px", border: "1px solid rgba(255,133,27,.22)", background: "#0E0E0F" }}>
          <Lock aria-hidden="true" size={15} color={NR.warm} />
          <span style={{ flex: "1 1 150px", minWidth: 0, fontFamily: NR.font, fontSize: "15px", lineHeight: "19px", color: "#C8C8C8" }}>Wykres progresji tego ćwiczenia — NEXTREP PRO</span>
          <button type="button" onClick={onOpenUnlock} style={{ flexShrink: 0, minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 14px", borderRadius: "12px", background: "#141415", border: "1px solid #2E2E30", color: NR.textPrimary, fontFamily: NR.font, fontSize: "17px", lineHeight: "20px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            Poznaj PRO
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <ExvSectionHead icon={HistoryIcon}>Historia wykonań</ExvSectionHead>
        <p style={{ margin: 0, fontFamily: NR.font, fontSize: "14px", lineHeight: "17px", color: "#9A9A9A" }}>{legend}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {years.map((y) => {
          const rows = byYear.get(y) || [];
          const isOpen = !!openYears[y];
          return (
            <section key={y} data-yeargroup={y} style={{ display: "flex", flexDirection: "column", gap: "6px", paddingBottom: isOpen ? "8px" : 0, borderBottom: "1px solid #1E1E20" }}>
              <h3 style={{ margin: 0 }}>
                <button type="button" data-year={y} data-testid={`exv-year-${y}`} aria-expanded={isOpen} aria-controls={`exv-yr-${y}`} onClick={() => setOpenYears((o) => ({ ...o, [y]: !o[y] }))} style={{ width: "100%", minHeight: "48px", display: "flex", alignItems: "center", gap: "10px", padding: "0 4px", border: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontFamily: NR.font, fontSize: "20px", lineHeight: "24px", fontWeight: 600, color: NR.textDisplay }}>{y}</span>
                  <span style={{ flex: "1 1 auto", fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", color: "#9A9A9A" }}>
                    {rows.length} {plWord(rows.length, "wykonanie", "wykonania", "wykonań")}
                  </span>
                  <span style={{ display: "flex", transform: isOpen ? "rotate(180deg)" : "none" }}>
                    <ChevronDown aria-hidden="true" size={20} color={NR.textSecondary} />
                  </span>
                </button>
              </h3>
              {isOpen && (
                <div id={`exv-yr-${y}`}>
                  {notice && notice.year === y && (
                    <p role="status" style={{ margin: "0 0 4px", fontFamily: NR.font, fontSize: "14px", lineHeight: "17px", color: "#FFB27A" }}>
                      {notice.text}
                    </p>
                  )}
                  {rows.length === 0 ? (
                    <p style={{ margin: "0 4px 4px", fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textMuted }}>Brak wykonań w tym roku</p>
                  ) : (
                    <ExvYearTable year={y} rows={rows} cardio={cardio} selected={isPro ? selected : null} onOpen={open} scrollRef={(el) => (scrollRefs.current[y] = el)} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// „Warianty” — the family's exercises; each opens its own card (never an automatic replacement).
function ExvVariantsTab({ exercise, onOpenVariant }) {
  const family = ATLAS_CATALOG.exercises.filter((e) => e.familyId && e.familyId === exercise.familyId);
  const desc = (e) => [...(e.variantAttributes || []).map((a) => a.label), `Sprzęt: ${e.equipment.map((q) => q.label).join(", ")}`].join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p style={{ margin: 0, fontFamily: NR.font, fontSize: "15px", lineHeight: "19px", color: NR.textMuted }}>
        {exercise.familyName ? `Rodzina: ${exercise.familyName}. ` : ""}Każdy wariant to osobne ćwiczenie z własną historią — nie są automatycznymi zamiennikami.
      </p>
      <ul aria-label="Warianty" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
        {family.map((e) =>
          e.exerciseId === exercise.exerciseId ? (
            <li key={e.exerciseId} data-testid="exv-variant-current" style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "52px", padding: "6px 12px", borderRadius: "12px", border: "1px solid rgba(255,133,27,.45)", background: "rgba(255,106,0,.06)" }}>
              <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ fontFamily: NR.font, fontSize: "17px", lineHeight: "20px", fontWeight: 600, color: NR.textDisplay, overflowWrap: "anywhere" }}>{e.name}</span>
                <span style={{ fontFamily: NR.font, fontSize: "14px", lineHeight: "18px", color: NR.textSecondary }}>{desc(e)}</span>
              </span>
              <span style={{ flexShrink: 0, fontFamily: NR.font, fontSize: "14px", lineHeight: "18px", fontWeight: 600, color: "#FF9A3D" }}>To ćwiczenie</span>
            </li>
          ) : (
            <li key={e.exerciseId}>
              <button type="button" data-testid="exv-variant" onClick={() => onOpenVariant(e.exerciseId)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", minHeight: "52px", boxSizing: "border-box", padding: "6px 8px 6px 12px", borderRadius: "12px", border: "1px solid #232325", background: "#111112", textAlign: "left", cursor: "pointer" }}>
                <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ fontFamily: NR.font, fontSize: "17px", lineHeight: "20px", fontWeight: 500, color: NR.textPrimary, overflowWrap: "anywhere" }}>{e.name}</span>
                  <span style={{ fontFamily: NR.font, fontSize: "14px", lineHeight: "18px", color: NR.textSecondary }}>{desc(e)}</span>
                </span>
                <ChevronRight aria-hidden="true" size={20} color="#9A9A9A" style={{ flexShrink: 0 }} />
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

const EXV_TABS = [
  ["ex", "Ćwiczenie"],
  ["hist", "Historia"],
  ["var", "Warianty"],
];
function AtlasExerciseDetail({ exercise, onBack, onNavigate, history = [], isPro = false, onOpenUnlock, onOpenSession, onOpenVariant }) {
  const mem = exvMemory.restore && exvMemory.exerciseId === exercise.exerciseId ? { ...exvMemory } : null;
  const [tab, setTab] = useState(() => (mem ? mem.tab : "ex"));
  const tabRefs = useRef({});
  // DES-01 / D2 (Q10, limited unfreeze): heart, „Więcej”, the display name with its badges and „W Atlasie: …”,
  // the archived state, the sheets and the feedback message (17c-atlas-browse.jsx). Tabs, history, variants
  // and pinning are unchanged.
  const user = useAtlasCardUser(exercise.exerciseId);
  const info = user.info;
  const shownName = info ? info.displayName : exercise.name;
  const [toast, setToast] = useState(null); // { text, onUndo? }
  const [sheet, setSheet] = useState(null); // null | "menu" | "name"
  const rootRef = useRef(null);
  const moreRef = useRef(null);
  const closeSheet = () => {
    setSheet(null);
    setTimeout(() => {
      try {
        if (moreRef.current && moreRef.current.focus) moreRef.current.focus();
      } catch {}
    }, 0);
  };
  const closeSheetRef = useRef(closeSheet);
  closeSheetRef.current = closeSheet;
  useEffect(() => {
    if (!sheet) {
      atlasCardOverlay.current = null;
      return undefined;
    }
    atlasCardOverlay.current = () => {
      const el = document.activeElement;
      // Back with the keyboard open over the name field: the keyboard goes first, the sheet stays (V5 K4)
      if (el && el.matches && el.matches("[data-testid='atlas-name-input']") && window.visualViewport && nrSoftKeyboardOpen()) return el.blur();
      closeSheetRef.current();
    };
    return () => {
      atlasCardOverlay.current = null;
    };
  }, [sheet]);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (sheet) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    } else {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  }, [sheet]);
  const toggleHeart = () => {
    const r = toggleFavouriteExercise(exercise.exerciseId);
    if (!r.ok) return setToast({ text: "Nie udało się zmienić ulubionych. Spróbuj ponownie.", at: Date.now() });
    user.refresh();
    if (r.favourite) {
      if (atlasBrowseMemory.favUndo && atlasBrowseMemory.favUndo.removed.exerciseId === exercise.exerciseId) atlasBrowseMemory.favUndo = null;
      return setToast({ text: "Dodano do ulubionych", at: Date.now() });
    }
    // D02b: opened from Ulubione → the list offers „Cofnij” too when it is back
    if (atlasBrowseMemory.level === "favourites") atlasBrowseMemory.favUndo = { removed: r.removed, name: shownName, at: Date.now() };
    setToast({
      text: "Usunięto z ulubionych",
      at: Date.now(),
      onUndo: () => {
        restoreFavouriteExercise(r.removed);
        atlasBrowseMemory.favUndo = null;
        user.refresh();
        setToast({ text: "Przywrócono do ulubionych", at: Date.now() });
      },
    });
  };
  const removeName = () => {
    const prev = info && info.customName;
    const r = removeCustomExerciseNameFor(exercise.exerciseId);
    closeSheet();
    user.refresh();
    if (!r.ok) return setToast({ text: "Nie udało się usunąć nazwy. Spróbuj ponownie.", at: Date.now() });
    setToast({
      text: "Przywrócono nazwę z Atlasu",
      at: Date.now(),
      onUndo: prev
        ? () => {
            setCustomExerciseNameFor(exercise.exerciseId, prev);
            user.refresh();
            setToast({ text: `Przywrócono Twoją nazwę: ${prev}`, at: Date.now() });
          }
        : null,
    });
  };
  useEffect(() => {
    if (!mem) return;
    exvClearRestore();
    const y = mem.scrollY || 0;
    setTimeout(() => {
      try {
        window.scrollTo(0, y);
      } catch {}
    }, 0);
  }, []);
  const onTabKey = (e, i) => {
    const to = e.key === "ArrowRight" ? (i + 1) % 3 : e.key === "ArrowLeft" ? (i + 2) % 3 : e.key === "Home" ? 0 : e.key === "End" ? 2 : null;
    if (to == null) return;
    e.preventDefault();
    setTab(EXV_TABS[to][0]);
    const el = tabRefs.current[EXV_TABS[to][0]];
    if (el && el.focus) el.focus();
  };
  return (
    <>
    <div ref={rootRef} data-testid="atlas-detail" data-screen="exercise-detail" data-source={info ? info.source : undefined} style={{ minHeight: "100vh", boxSizing: "border-box", position: "relative", overflowX: "clip", background: NR.bg, color: NR.textPrimary, fontFamily: NR.font, padding: "0 12px calc(var(--nr-nav-h, 71px) + 16px)", display: "flex", flexDirection: "column", gap: "12px" }}>
      <FontStyles />
      <div data-pin="bar" style={{ position: "sticky", top: 0, zIndex: 7, margin: "0 -12px", padding: "max(env(safe-area-inset-top, 0px), 12px) 6px 0 2px", background: NR.bg }}>
        <header style={{ display: "flex", alignItems: "center", gap: "2px", minHeight: "44px" }}>
          <button type="button" aria-label="Wróć do Atlasu ćwiczeń" data-testid="atlas-detail-back" onClick={onBack} style={{ ...AW_ICON_BTN, borderRadius: "22px" }}>
            <ChevronLeft aria-hidden="true" size={22} color={NR.textPrimary} />
          </button>
          <span style={{ flex: "1 1 auto", minWidth: 0, fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: NR.textSecondary, overflowWrap: "anywhere" }}>Atlas ćwiczeń</span>
          {info && <AtlasCardHeart favourite={user.favourite} onToggle={toggleHeart} />}
          {info && <AtlasCardMoreButton buttonRef={moreRef} onOpen={() => setSheet("menu")} />}
        </header>
      </div>
      <section aria-labelledby="exv-h" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "2px 2px 4px" }}>
        <h1 id="exv-h" data-testid="atlas-detail-name" style={{ margin: 0, fontFamily: NR.font, fontSize: "32px", lineHeight: "35px", fontWeight: 600, color: NR.textDisplay, overflowWrap: "anywhere" }}>{shownName}</h1>
        <AtlasCardUserHeader info={info} />
        {exercise.equipment[0] && (
          <p data-testid="atlas-detail-primary-equipment" style={{ margin: 0, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", color: NR.textSecondary }}>
            <span style={AW_SR}>Podstawowy sprzęt: </span>
            {exercise.equipment[0].label}
          </p>
        )}
      </section>
      <div data-pin="tabs" style={{ position: "sticky", top: EXV_TOP, zIndex: 6, margin: "0 -12px", padding: "0 12px", background: NR.bg, borderBottom: "1px solid #222224" }}>
        <div role="tablist" aria-label="Sekcje ćwiczenia" style={{ display: "flex" }}>
          {EXV_TABS.map(([k, label], i) => {
            const on = tab === k;
            return (
              <button
                key={k}
                ref={(el) => (tabRefs.current[k] = el)}
                type="button"
                role="tab"
                id={`exv-tab-${k}`}
                aria-controls={`exv-panel-${k}`}
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                data-testid={`exv-tab-${k}`}
                onClick={() => setTab(k)}
                onKeyDown={(e) => onTabKey(e, i)}
                style={{ position: "relative", flex: "1 1 0", minWidth: 0, minHeight: "48px", border: 0, background: "transparent", cursor: "pointer", padding: "0 4px", fontFamily: NR.font, fontSize: "18px", lineHeight: "21px", fontWeight: on ? 600 : 500, color: on ? NR.textDisplay : "#9A9A9A" }}
              >
                {label}
                {on && <span aria-hidden="true" style={{ position: "absolute", left: "18%", right: "18%", bottom: 0, height: "3px", borderRadius: "2px 2px 0 0", background: "linear-gradient(90deg, #FF9A3D, #FF6A00)" }} />}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" id={`exv-panel-${tab}`} aria-labelledby={`exv-tab-${tab}`} tabIndex={0} style={{ paddingTop: "6px", outline: "none" }}>
        {tab === "ex" && <ExvExerciseTab exercise={exercise} />}
        {tab === "hist" && <ExvHistoryTab exercise={exercise} history={history} isPro={isPro} onOpenUnlock={onOpenUnlock} onOpenSession={onOpenSession} mem={mem} />}
        {tab === "var" && <ExvVariantsTab exercise={exercise} onOpenVariant={(id) => onOpenVariant && onOpenVariant(id)} />}
      </div>
      <BottomNav screen="exercises" onNavigate={onNavigate} />
    </div>
    {sheet === "menu" && info && <AtlasCardMenu info={info} onRename={() => setSheet("name")} onRemoveName={removeName} onClose={closeSheet} />}
    {sheet === "name" && info && (
      <AtlasNameSheet
        info={info}
        onClose={closeSheet}
        onSaved={(name) => {
          closeSheet();
          user.refresh();
          setToast({ text: `Zapisano nazwę: ${name}`, at: Date.now() });
        }}
      />
    )}
    {toast && <AtlasToast key={toast.at} text={toast.text} actionLabel={toast.onUndo ? "Cofnij" : null} onAction={toast.onUndo || null} onDone={() => setToast(null)} testId="atlas-detail-toast" />}
    </>
  );
}

// The catalog screen, opened from „Ćwiczenia”. Back (on screen or hardware) steps detail → list →
// „Ćwiczenia” through exercisesOverlayRef, like the category view of that screen.
function AtlasCatalogView({ onClose, onNavigate, history = [], isPro = false, onOpenUnlock, onOpenSession }) {
  // I4.6 D7: back from a workout opened in the card's history → the same card again
  const [selectedId, setSelectedId] = useState(() => (exvMemory.restore ? exvMemory.exerciseId : null));
  const selected = selectedId ? ATLAS_CATALOG.exercises.find((e) => e.exerciseId === selectedId) || null : null;

  useEffect(() => {
    exercisesOverlayRef.current = selected ? () => setSelectedId(null) : onClose;
    return () => {
      exercisesOverlayRef.current = null;
    };
  }, [selected, onClose]);

  const open = (id) => {
    try {
      window.history.pushState({ trainapp: true }, "", "");
    } catch {}
    setSelectedId(id);
    try {
      window.scrollTo(0, 0); // the details start at the top, wherever the list was scrolled
    } catch {}
  };
  // like „Wszystkie partie”: the browser Back pops the entry pushed on open, and the app's popstate
  // handler calls exercisesOverlayRef (one step)
  const stepBack = () => window.history.back();

  if (selected)
    return (
      <AtlasExerciseDetail
        key={selected.exerciseId}
        exercise={selected}
        onBack={stepBack}
        onNavigate={onNavigate}
        history={history}
        isPro={isPro}
        onOpenUnlock={onOpenUnlock}
        onOpenSession={onOpenSession}
        // a variant opens its own card in place of this one (Back → the atlas list)
        onOpenVariant={(id) => {
          setSelectedId(id);
          try {
            window.scrollTo(0, 0);
          } catch {}
        }}
      />
    );

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28" data-testid="atlas-catalog">
      <FontStyles />
      <TopBar title="ATLAS ĆWICZEŃ" onBack={stepBack} />
      <div className="px-5 pt-3">
        <p className="text-neutral-400 text-xs" data-testid="atlas-catalog-info">
          Katalog NEXTREP 1.0 · wydanie {ATLAS_CATALOG.atlasVersion} · {ATLAS_CATALOG.exercises.length} ćwiczeń · tylko do odczytu
        </p>
        <div className="space-y-2 mt-3">
          {ATLAS_CATALOG.exercises.length === 0 && (
            <EmptyState icon={Dumbbell} title="Atlas jest pusty" subtitle="Ćwiczenia pojawią się po zatwierdzeniu pierwszej partii." />
          )}
          {ATLAS_CATALOG.exercises.map((ex) => (
            <button
              key={ex.exerciseId}
              data-testid="atlas-item"
              onClick={() => open(ex.exerciseId)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3 text-left active:border-orange-500/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-neutral-100 font-semibold break-words">{ex.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <AtlasChips items={ex.statsGroups} />
                </div>
              </div>
              <ChevronRight size={18} className="text-neutral-500 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
      <BottomNav screen="exercises" onNavigate={onNavigate} />
    </div>
  );
}

// Entry tile on the „Ćwiczenia” screen (browsing view only).
function AtlasCatalogEntry({ onOpen }) {
  return (
    <button
      data-testid="atlas-entry"
      onClick={onOpen}
      className="w-full mt-4 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3 text-left active:border-orange-500/50"
    >
      <div className="flex-1 min-w-0">
        <p className="text-neutral-100 font-semibold">Atlas ćwiczeń</p>
        <p className="text-neutral-500 text-xs mt-0.5">NEXTREP 1.0 · {ATLAS_CATALOG.exercises.length} ćwiczeń · podgląd</p>
      </div>
      <ChevronRight size={18} className="text-neutral-500 flex-shrink-0" />
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/* I3 — the atlas as the ONLY source of exercises in plans and workouts    */
/*                                                                           */
/* (S1, NR_ATLAS_ONLY_EXERCISES). A catalog exercise is NEVER copied into   */
/* the person's own exercise list: plan items and workout exercises carry   */
/* its id (`catalogExerciseId`, also in `exerciseId` for the existing       */
/* screens) and every workout exercise its load snapshot v3, built by the   */
/* nr1 domain (planItemSnapshot → engine buildLoadSnapshot) when it enters  */
/* the workout and frozen there. The set format is unchanged; the meaning   */
/* of the typed kg comes from loadSnapshot.loadModel.                       */
/* ---------------------------------------------------------------------- */
const ATLAS_RECORD_BY_ID = new Map(
  ((ATLAS_RELEASE && ATLAS_RELEASE.exercises) || []).filter((e) => e && e.status === "active").map((e) => [e.exerciseId, e])
);
function atlasRecord(id) {
  return id != null ? ATLAS_RECORD_BY_ID.get(id) || null : null;
}
function isAtlasExerciseId(id) {
  return id != null && ATLAS_RECORD_BY_ID.has(id);
}
// Input kind of the existing workout screen, from the atlas measurement type / load model (what is
// typed in a set — never muscles). Assisted exercises record repetitions only until the typed set
// format of a later stage (the set format stays unchanged in I3).
function atlasWorkoutKind(rec) {
  if (!rec) return "weight";
  if (rec.measurementType === "cardio" || rec.loadModel === "cardio") return "cardio";
  if (rec.measurementType === "time" || rec.loadModel === "time") return "time";
  if (rec.measurementType === "sets_only" || rec.loadModel === "sets_only") return "sets";
  if (rec.loadModel === "bodyweight_plus") return "bodyweightPlus";
  if (rec.measurementType === "bodyweight_reps" || rec.measurementType === "band_reps") return "bodyweight";
  return "weight";
}
// The exercise behind an id for the existing screens: the person's own exercise, or a read-only view of
// the atlas exercise (name and input kind only — never stored, never given a category).
function atlasExerciseView(id) {
  const rec = atlasRecord(id);
  if (!rec) return null;
  return { id: rec.exerciseId, catalogExerciseId: rec.exerciseId, name: rec.namePl, loadModel: rec.loadModel, kind: atlasWorkoutKind(rec), videoUrl: "" };
}
function exerciseKindFor(id, exercises) {
  const own = (exercises || []).find((e) => e.id === id);
  if (own) return getExerciseKind(own);
  const view = atlasExerciseView(id);
  return view ? view.kind : getExerciseKind(undefined);
}
function exerciseNameFor(id, exercises) {
  const own = (exercises || []).find((e) => e.id === id);
  if (own) return own.name;
  const view = atlasExerciseView(id);
  return view ? view.name : null;
}
// B02-D21 through the nr1 contract: which load models the person may choose for this atlas exercise.
function atlasLoadModelChoice(id) {
  const rec = atlasRecord(id);
  if (!rec) return { choice: false, options: [] };
  const r = resolvePlanItemLoadModel({ ref: { catalogExerciseId: id, privateExerciseId: null }, loadModel: null, exercise: rec, atlas: ATLAS_RELEASE });
  return { choice: Boolean(r.choice), options: [...r.options] };
}
// Fields of a plan item / synthetic item for an atlas exercise; the model is checked by the nr1 contract.
function atlasPlanItemFields(id, loadModel = null) {
  const rec = atlasRecord(id);
  if (!rec) throw new Error(`I3: ${id} is not an active atlas exercise`);
  const r = resolvePlanItemLoadModel({ ref: { catalogExerciseId: id, privateExerciseId: null }, loadModel, exercise: rec, atlas: ATLAS_RELEASE });
  if (!r.ok) throw new Error(`I3: ${id} — ${r.errors.map((e) => e.code).join(", ")}`);
  return { exerciseId: id, catalogExerciseId: id, loadModel: r.loadModel };
}
// Load snapshot v3 of an atlas exercise entering a workout (nr1 planItemSnapshot → buildLoadSnapshot).
function atlasLoadSnapshot(id, loadModel = null, now = new Date().toISOString()) {
  const r = planItemSnapshot(
    { id: `atlas-${id}`, deletedAt: null, catalogExerciseId: id, privateExerciseId: null, loadModel },
    { atlasById: ATLAS_RECORD_BY_ID, atlas: ATLAS_RELEASE, atlasVersion: ATLAS_RELEASE ? ATLAS_RELEASE.atlasVersion : null, now }
  );
  if (!r.ok) throw new Error(`I3: snapshot of ${id} — ${r.error.code}`);
  return r.snapshot;
}
// The atlas reference of a workout exercise, carried unchanged into the draft, the saved session and
// an edit of it (the snapshot is never rebuilt).
function atlasRefFields(item) {
  return item && item.catalogExerciseId ? { catalogExerciseId: item.catalogExerciseId, loadSnapshot: item.loadSnapshot || null } : {};
}
// What the person is told while typing a set of an atlas exercise.
function atlasLoadHint(snapshot) {
  if (!snapshot) return null;
  const m = snapshot.loadModel;
  if (m === "assisted") return "Z asystą — zapisujesz powtórzenia (kg asysty w kolejnym etapie)";
  if (LOAD_MODEL_CHOICE_LABELS[m]) return `${LOAD_MODEL_CHOICE_LABELS[m].label} — ${LOAD_MODEL_CHOICE_LABELS[m].entryHint}`;
  return ATLAS_LOAD_MODEL_LABELS[m] || null;
}

// I3: a JSON copy is imported in S1 only when it fits the atlas-only model — no exercises of the old
// form, every plan item and every saved exercise refers to an active atlas exercise, and every saved
// exercise carries a valid load snapshot of that exercise. Returns the problems (empty = compatible).
function atlasImportProblems(data) {
  const problems = [];
  if (!data || typeof data !== "object") return ["brak danych"];
  if (Array.isArray(data.exercises) && data.exercises.length > 0) problems.push("ćwiczenia spoza atlasu");
  for (const p of Array.isArray(data.plans) ? data.plans : []) {
    for (const it of (p && Array.isArray(p.exercises) ? p.exercises : [])) {
      if (!it || !isAtlasExerciseId(it.catalogExerciseId) || it.exerciseId !== it.catalogExerciseId) {
        problems.push("plan z ćwiczeniem spoza atlasu");
        break;
      }
    }
  }
  for (const s of Array.isArray(data.history) ? data.history : []) {
    for (const ex of (s && Array.isArray(s.exercises) ? s.exercises : [])) {
      const ok =
        ex && isAtlasExerciseId(ex.catalogExerciseId) && ex.exerciseId === ex.catalogExerciseId && ex.loadSnapshot &&
        validateLoadSnapshot(ex.loadSnapshot).length === 0 && validateRefMatchesSnapshot({ catalogExerciseId: ex.catalogExerciseId, privateExerciseId: null }, ex.loadSnapshot).length === 0;
      if (!ok) {
        problems.push("trening bez ćwiczenia z atlasu lub bez snapshotu");
        break;
      }
    }
  }
  return [...new Set(problems)];
}

// The exercise picker of plans and workouts in S1: the atlas only (search by name and alias, filter by
// the atlas stats group). An exercise with a machine choice (B02-D21) asks for the model first.
function AtlasExercisePickerModal({ onPick, onClose, title = "WYBIERZ ĆWICZENIE", excludeExerciseId = null }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(null);
  const [choiceFor, setChoiceFor] = useState(null);
  const all = ATLAS_CATALOG.exercises.filter((e) => e.exerciseId !== excludeExerciseId);
  const groups = Object.keys(ATLAS_STATS_GROUP_LABELS).filter((g) => all.some((e) => e.statsGroups.some((s) => s.code === g)));
  const q = query.trim().toLowerCase();
  const list = all.filter(
    (e) => (!group || e.statsGroups.some((s) => s.code === group)) && (!q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))
  );
  const pick = (id) => {
    const c = atlasLoadModelChoice(id);
    if (c.choice) setChoiceFor({ id, options: c.options });
    else onPick(id, null);
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={onClose} data-testid="atlas-picker">
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 flex flex-col" style={{ maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4 flex-shrink-0" />
        <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
          <h2 className="font-display text-2xl text-neutral-50 tracking-wide">{title}</h2>
          <button onClick={onClose} aria-label="Zamknij" className="p-1.5 -mr-1.5 text-neutral-400 active:text-orange-500">
            <X size={22} />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 mb-3 flex-shrink-0">
          <Search size={16} className="text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj w atlasie..."
            className="bg-transparent outline-none text-neutral-200 text-sm flex-1 placeholder-neutral-600"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
          {[null, ...groups].map((g) => (
            <button
              key={g || "all"}
              data-testid="atlas-picker-group"
              onClick={() => setGroup(g)}
              className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${group === g ? "bg-orange-500 border-orange-500 text-neutral-950" : "border-neutral-700 bg-neutral-800/60 text-neutral-200"}`}
            >
              {g ? ATLAS_STATS_GROUP_LABELS[g] : "Wszystkie"}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto no-scrollbar pb-4 space-y-2">
          {list.length === 0 && <p className="text-neutral-500 text-sm text-center py-6">Brak ćwiczeń w atlasie dla tego wyszukiwania.</p>}
          {list.map((ex) => (
            <button
              key={ex.exerciseId}
              data-testid="atlas-picker-item"
              onClick={() => pick(ex.exerciseId)}
              className="w-full text-left bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 active:border-orange-500"
            >
              <span className="block text-neutral-100 font-medium">{ex.name}</span>
              <span className="block text-neutral-500 text-xs mt-0.5">{ex.loadModel.label}</span>
            </button>
          ))}
        </div>
      </div>
      {choiceFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={(e) => { e.stopPropagation(); setChoiceFor(null); }}>
          <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5" onClick={(e) => e.stopPropagation()} data-testid="atlas-model-choice">
            <p className="font-display text-xl text-neutral-50 tracking-wide mb-3">{LOAD_MODEL_CHOICE_LABELS.question}</p>
            <div className="space-y-2">
              {choiceFor.options.map((m) => (
                <button
                  key={m}
                  onClick={() => onPick(choiceFor.id, m)}
                  className="w-full text-left bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 active:border-orange-500"
                >
                  <span className="block text-neutral-100 font-medium">{(LOAD_MODEL_CHOICE_LABELS[m] || {}).label || m}</span>
                  <span className="block text-neutral-500 text-xs mt-0.5">{(LOAD_MODEL_CHOICE_LABELS[m] || {}).entryHint || ""}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Fields of an item picked in a plan or a workout: an atlas exercise (not one of the person's own) by
// its id and checked model; otherwise the person's own exercise as before.
function pickedExerciseFields(id, loadModel, exercises) {
  const own = (exercises || []).some((e) => e.id === id);
  return !own && isAtlasExerciseId(id) ? atlasPlanItemFields(id, loadModel) : { exerciseId: id };
}
