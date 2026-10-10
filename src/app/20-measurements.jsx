const MEASUREMENT_FIELDS = [
  { key: "weight", label: "Masa ciała (kg)", unit: " kg" },
  { key: "bodyFat", label: "Tkanka tłuszczowa (%)", unit: "%" },
  { key: "chest", label: "Klatka (cm)", unit: " cm" },
  { key: "waist", label: "Talia (cm)", unit: " cm" },
  { key: "hips", label: "Biodra (cm)", unit: " cm" },
  { key: "arm", label: "Ramię (cm)", unit: " cm" },
  { key: "thigh", label: "Udo (cm)", unit: " cm" },
];

function MeasurementsScreen({ measurements, updateMeasurements, customFields, updateCustomFields, onNavigate }) {
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewMode, setViewMode] = useState("wykresy"); // 'wykresy' | 'tabela'
  const sorted = [...measurements].sort((a, b) => new Date(b.date) - new Date(a.date));
  const allFields = [...MEASUREMENT_FIELDS, ...customFields];

  const addEntry = (entry) => {
    updateMeasurements((prev) => [...prev, entry]);
    setFormOpen(false);
  };
  const remove = (id) => updateMeasurements((prev) => prev.filter((m) => m.id !== id));
  const addCustomField = (field) => updateCustomFields((prev) => [...prev, field]);

  const availableFields = allFields.filter((f) => sorted.filter((m) => m[f.key] != null).length >= 2);

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar title="POMIARY" />
      <div className="px-5 pt-3">
        <button
          onClick={() => setFormOpen(true)}
          className="w-full border-2 border-dashed border-neutral-700 active:border-orange-500 rounded-xl py-3 flex items-center justify-center gap-2 text-neutral-400 active:text-orange-400 font-semibold text-sm"
        >
          <Plus size={18} /> Dodaj pomiar
        </button>

        {measurements.length > 0 && (
          <div className="flex gap-1 mt-3 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
            {[
              { key: "wykresy", label: "Wykresy" },
              { key: "tabela", label: "Tabela" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${viewMode === v.key ? "bg-orange-500 text-neutral-950" : "text-neutral-400"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {measurements.length === 0 && (
          <div className="mt-4">
            <EmptyState icon={Ruler} title="Brak pomiarów" subtitle="Dodaj pierwszy pomiar, żeby śledzić postępy sylwetki." />
          </div>
        )}

        {viewMode === "wykresy" && measurements.length > 0 && (
          <div className="mt-4 space-y-3">
            {availableFields.length === 0 ? (
              <EmptyState icon={TrendingUp} title="Za mało danych na wykres" subtitle="Dodaj co najmniej dwa pomiary tego samego parametru." compact />
            ) : (
              availableFields.map((f) => {
                const series = sorted
                  .filter((m) => m[f.key] != null)
                  .slice(0, 12)
                  .reverse();
                return (
                  <ChartCard
                    key={f.key}
                    title={f.label.split(" (")[0]}
                    data={series.map((m) => Number(m[f.key]))}
                    dates={series.map((m) => fmtDateShort(m.date))}
                    unit={f.unit}
                  />
                );
              })
            )}
          </div>
        )}

        {viewMode === "tabela" && measurements.length > 0 && (
          <div className="mt-4 overflow-x-auto no-scrollbar">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-neutral-500 font-semibold uppercase py-2 pr-3 sticky left-0 bg-neutral-950">Data</th>
                  {allFields
                    .filter((f) => sorted.some((m) => m[f.key] != null))
                    .map((f) => (
                      <th key={f.key} className="text-left text-neutral-500 font-semibold uppercase py-2 px-3 whitespace-nowrap">
                        {f.label.split(" (")[0]}
                      </th>
                    ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-800">
                    <td className="py-2 pr-3 text-neutral-200 font-medium whitespace-nowrap sticky left-0 bg-neutral-950">{fmtDateShort(m.date)}</td>
                    {allFields
                      .filter((f) => sorted.some((mm) => mm[f.key] != null))
                      .map((f) => (
                        <td key={f.key} className="py-2 px-3 text-neutral-400 whitespace-nowrap">
                          {m[f.key] != null ? m[f.key] : "—"}
                        </td>
                      ))}
                    <td className="py-2">
                      <button onClick={() => setConfirmDelete(m)} className="p-1 text-neutral-600 active:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <MeasurementFormModal onSave={addEntry} onClose={() => setFormOpen(false)} customFields={customFields} onAddCustomField={addCustomField} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="USUNĄĆ POMIAR?"
          message={`Pomiar z dnia ${fmtDate(confirmDelete.date)} zostanie trwale usunięty.`}
          confirmLabel="Usuń"
          danger
          onConfirm={() => {
            remove(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <BottomNav screen="measurements" onNavigate={onNavigate} />
    </div>
  );
}

function MiniChart({ data, dates, unit = "", formatSeconds, pointLabels, highlightLast = false, formatValue }) {
  const [activeIdx, setActiveIdx] = useState(null);
  if (!data || data.length === 0) return null;
  const w = 300;
  const h = 90;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * (w - 10) + 5 : w / 2;
    const y = h - ((v - min) / range) * (h - 14) - 7;
    return { x, y };
  });
  const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const fmtVal = (v) => (formatValue ? formatValue(v) : formatSeconds ? (v >= 60 ? fmtClock(v) : `${v}s`) : `${Math.round(v * 10) / 10}${unit}`);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: "90px", overflow: highlightLast ? "visible" : undefined }}>
        <polyline points={pointsStr} fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onClick={() => setActiveIdx(activeIdx === i ? null : i)} style={{ cursor: "pointer" }}>
            {/* larger invisible circle as an easier touch target than the visible dot */}
            <circle cx={p.x} cy={p.y} r="12" fill="transparent" />
            {highlightLast && i === pts.length - 1 ? (
              <>
                <circle cx={p.x} cy={p.y} r="7" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.9" />
                <circle cx={p.x} cy={p.y} r="4.5" fill="#fff" />
              </>
            ) : (
              <circle cx={p.x} cy={p.y} r={activeIdx === i ? 5 : 3} fill="#f97316" stroke={activeIdx === i ? "#fff" : "none"} strokeWidth="1.5" />
            )}
          </g>
        ))}
      </svg>
      {activeIdx != null ? (
        <div className="flex flex-col items-center gap-0.5 bg-neutral-950 border border-orange-500/40 rounded-lg px-2 py-1.5 mt-1">
          {pointLabels?.[activeIdx] && <span className="text-neutral-300 text-xs font-semibold">{pointLabels[activeIdx]}</span>}
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 text-xs">{dates?.[activeIdx] || `#${activeIdx + 1}`}</span>
            <span className="text-orange-400 font-display text-sm tracking-wide">{fmtVal(data[activeIdx])}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-neutral-600">{dates?.[0] || ""}</span>
          <span className="text-neutral-400 font-semibold">
            {fmtVal(min)} – {fmtVal(max)}
          </span>
          <span className="text-neutral-600">{dates?.[dates.length - 1] || ""}</span>
        </div>
      )}
    </div>
  );
}

// A chart with real context on top: the current value and how much it's moved since the first
// tracked session, so progress is obvious at a glance instead of just a bare line.
// showDelta=false hides the header change (last − first): used where the points are not
// necessarily comparable with each other (muscle-group workload — see computeCategoryLastDelta).
function ChartCard({ title, data, dates, unit = "", formatSeconds, pointLabels, showDelta = true }) {
  if (!data || data.length === 0) return null;
  const last = data[data.length - 1];
  const first = data[0];
  const delta = last - first;
  const fmtVal = (v) => (formatSeconds ? (v >= 60 ? fmtClock(v) : `${v}s`) : `${Math.round(v * 10) / 10}${unit}`);
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-neutral-500 text-xs uppercase font-semibold">{title}</p>
        {showDelta && Math.abs(delta) > 0.01 && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${delta > 0 ? "text-lime-400" : "text-red-400"}`}>
            {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta > 0 ? "+" : ""}
            {formatSeconds ? `${Math.round(delta)}s` : `${Math.round(delta * 10) / 10}${unit}`}
          </span>
        )}
      </div>
      <p className="font-display text-3xl text-neutral-50 tracking-wide mb-2">{fmtVal(last)}</p>
      <MiniChart data={data} dates={dates} unit={unit} formatSeconds={formatSeconds} pointLabels={pointLabels} />
    </div>
  );
}

function MeasurementFormModal({ onSave, onClose, customFields, onAddCustomField }) {
  const [date, setDate] = useState(toLocalDateStr(new Date()));
  const [values, setValues] = useState({});
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("cm");

  const allFields = [...MEASUREMENT_FIELDS, ...customFields];

  const save = () => {
    const entry = { id: uid(), date: new Date(date).toISOString() };
    let hasAny = false;
    allFields.forEach((f) => {
      if (values[f.key]) {
        entry[f.key] = Number(values[f.key]);
        hasAny = true;
      }
    });
    if (!hasAny) return;
    onSave(entry);
  };

  const diacritics = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
  const addCustomField = () => {
    const name = customName.trim();
    if (!name) return;
    const slugBase = name
      .toLowerCase()
      .split("")
      .map((c) => diacritics[c] || c)
      .join("")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const key = `custom_${slugBase || uid()}`;
    const unit = customUnit.trim();
    const label = unit ? `${name} (${unit})` : name;
    onAddCustomField({ key, label, unit: unit ? ` ${unit}` : "" });
    setCustomName("");
    setCustomUnit("cm");
    setAddingCustom(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full overflow-y-auto no-scrollbar bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 pb-8" style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
        <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-4">NOWY POMIAR</h2>

        <label className="text-neutral-500 text-xs uppercase font-semibold">Data</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full mt-1 mb-4 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <div className="space-y-3">
          {allFields.map((f) => (
            <div key={f.key}>
              <label className="text-neutral-500 text-xs uppercase font-semibold">{f.label}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={values[f.key] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder="—"
                className="w-full mt-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-100 outline-none focus:border-orange-500"
              />
            </div>
          ))}
        </div>

        {addingCustom ? (
          <div className="mt-4 bg-neutral-950 border border-orange-500/30 rounded-xl p-3 space-y-2">
            <label className="text-neutral-500 text-xs uppercase font-semibold">Nazwa nowej kategorii</label>
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="np. Przedramię"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 text-sm outline-none focus:border-orange-500"
            />
            <label className="text-neutral-500 text-xs uppercase font-semibold">Jednostka</label>
            <input
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              placeholder="np. cm"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 text-sm outline-none focus:border-orange-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setAddingCustom(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm font-semibold">
                Anuluj
              </button>
              <button onClick={addCustomField} disabled={!customName.trim()} className="flex-1 py-2 rounded-lg bg-orange-500 disabled:opacity-40 text-neutral-950 text-sm font-bold">
                Dodaj kategorię
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCustom(true)}
            className="w-full mt-4 py-2.5 rounded-xl border-2 border-dashed border-neutral-800 active:border-orange-500 text-neutral-500 active:text-orange-400 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Dodaj własną kategorię pomiaru
          </button>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
            Anuluj
          </button>
          <button onClick={save} className="flex-1 py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold">
            Zapisz pomiar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Root App                                                                */
/* ---------------------------------------------------------------------- */

// Shared outside React so the single root popstate handler (inside App) can close whichever of
// ActiveWorkout's OWN local overlays (add-exercise picker, menu, etc.) is currently open, without
// ActiveWorkout needing its own popstate listener (which would run after — and too late relative
// to — the root one). ActiveWorkout keeps this in sync via an effect; App checks it first, before
// falling through to its own "close X" chain, so a back-press while e.g. the exercise picker is
// open closes only that picker and never exits or ends the workout.
const activeWorkoutOverlayRef = { current: null };

// Set by a LIVE ActiveWorkout (not edit mode): what a system/Android Back on the workout itself
// does — save the draft and open the "Opuszczasz aktywny trening" dialog. While it's set, the root
// popstate handler never closes the workout on its own.
const activeWorkoutBackRef = { current: null };

// History guard for a LIVE workout. Chrome on Android marks history entries created by
// pushState WITHOUT a user gesture as "skippable" for the system Back button — so an entry pushed
// inside a popstate handler (Back is not a gesture) can be jumped over, and a few Back presses can
// run through all of the app's entries and close the PWA. Therefore: a Back press never pushes an
// entry; it only uses up one guard entry (depth − 1). On the person's next tap (a real user
// gesture) the guard is topped back up to ACTIVE_WORKOUT_GUARD_DEPTH entries — see the capture
// click listener in ActiveWorkout. So several Back presses in a row without touching the screen
// still stay inside the app, and history can grow by at most that many entries.
const ACTIVE_WORKOUT_GUARD_DEPTH = 2;
const activeWorkoutGuard = { depth: 0 };
const consumeActiveWorkoutGuard = () => {
  activeWorkoutGuard.depth = Math.max(0, activeWorkoutGuard.depth - 1);
};

