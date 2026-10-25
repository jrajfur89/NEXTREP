function Stat({ label, value, small, wide, compact }) {
  return (
    <div className={`bg-neutral-950 border border-neutral-800 rounded-xl px-2 flex flex-col items-center justify-center ${wide ? (compact ? "py-2" : "py-3") : compact ? "py-1.5" : "py-2"}`}>
      <span className={`font-display tracking-wide text-neutral-50 leading-none ${small ? "text-sm" : compact ? "text-lg" : "text-xl"}`}>{value}</span>
      <span className="text-neutral-500 text-xs uppercase font-semibold mt-0.5">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Exercises Screen                                                        */
/* ---------------------------------------------------------------------- */

function ExercisesScreen({ exercises, updateExercises, onNavigate, onOpenDetail, history = [], isPro = false, onOpenUnlock, onOpenSession }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Wszystkie");
  const [equipmentFilter, setEquipmentFilter] = useState("Wszystkie");
  const [sheet, setSheet] = useState(null); // 'category' | 'equipment' | null
  const [editing, setEditing] = useState(null); // exercise object or "new"
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [atlasOpen, setAtlasOpen] = useState(() => !NR_ATLAS_ONLY_EXERCISES && exvMemory.restore); // AT2: read-only „Atlas ćwiczeń” (I4.6 D7: reopened after a workout from the card)
  // I5.3 (S1): the module opens on E01 (AtlasBrowseScreen); the person's own exercises — the old list
  // below, unchanged — are one level deeper („Moje ćwiczenia”, only when there are any).
  const [ownOpen, setOwnOpen] = useState(() => NR_ATLAS_ONLY_EXERCISES && atlasBrowseMemory.level === "own");
  const browseScreen = NR_ATLAS_ONLY_EXERCISES && !ownOpen;

  const searching = query.trim().length > 0;
  const browsing = !searching && categoryFilter === "Wszystkie";

  // Keeps the hardware/gesture back button stepping from a single category (e.g. Klatka) back to
  // the category tiles, instead of skipping past this whole screen — see exercisesOverlayRef.
  // I5.3: in S1 the list itself is one step from E01, so Back from its root closes it.
  useEffect(() => {
    if (browseScreen) return; // E01–E03 set the overlay themselves
    if (categoryFilter !== "Wszystkie") {
      exercisesOverlayRef.current = () => setCategoryFilter("Wszystkie");
    } else {
      exercisesOverlayRef.current = ownOpen ? () => closeOwn() : null;
    }
    return () => {
      exercisesOverlayRef.current = null;
    };
  }, [categoryFilter, browseScreen, ownOpen]);
  const openOwn = () => {
    try {
      window.history.pushState({ trainapp: true }, "", "");
    } catch {}
    atlasBrowseMemory.level = "own"; // D06: back from an own exercise's details → this list again
    setOwnOpen(true);
  };
  const closeOwn = () => {
    atlasBrowseReset();
    setQuery("");
    setCategoryFilter("Wszystkie");
    setOwnOpen(false);
  };

  const selectCategory = (cat) => {
    if (cat !== "Wszystkie" && categoryFilter === "Wszystkie") {
      try {
        window.history.pushState({ trainapp: true }, "", "");
      } catch {}
    }
    setCategoryFilter(cat);
  };

  const filtered = exercises.filter((e) => {
    const matchQuery = e.name.toLowerCase().includes(query.toLowerCase());
    const matchCategory = exerciseMatchesMuscleFilter(e, categoryFilter, exercises);
    const matchEquipment = equipmentFilter === "Wszystkie" || e.equipment.includes(equipmentFilter);
    return matchQuery && matchCategory && matchEquipment;
  });

  const handleSave = (ex) => {
    if (exercises.find((e) => e.id === ex.id)) {
      updateExercises((prev) => prev.map((e) => (e.id === ex.id ? ex : e)));
    } else {
      updateExercises((prev) => [...prev, ex]);
    }
    setEditing(null);
  };

  const handleDelete = (id) => {
    updateExercises((prev) => prev.filter((e) => e.id !== id));
  };

  const openAtlas = () => {
    try {
      window.history.pushState({ trainapp: true }, "", "");
    } catch {}
    setAtlasOpen(true);
  };
  const closeAtlas = useCallback(() => setAtlasOpen(false), []);
  if (browseScreen) return <AtlasBrowseScreen onNavigate={onNavigate} history={history} isPro={isPro} onOpenUnlock={onOpenUnlock} onOpenSession={onOpenSession} ownCount={exercises.length} onOpenOwn={openOwn} />;
  if (atlasOpen) return <AtlasCatalogView onClose={closeAtlas} onNavigate={onNavigate} history={history} isPro={isPro} onOpenUnlock={onOpenUnlock} onOpenSession={onOpenSession} />;

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar
        title={ownOpen ? "MOJE ĆWICZENIA" : "ĆWICZENIA"}
        onBack={ownOpen ? () => window.history.back() : undefined}
        right={
          NR_ATLAS_ONLY_EXERCISES ? null : ( // I3: the old "add exercise" form is off in S1
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-1 bg-orange-500 active:bg-orange-600 text-neutral-950 font-bold text-xs px-3 py-2 rounded-lg flex-shrink-0"
          >
            <Plus size={15} strokeWidth={3} /> Dodaj
          </button>
          )
        }
      />
      <div className="px-5 pt-3">
        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5">
          <Search size={16} className="text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj ćwiczenia..."
            className="bg-transparent outline-none text-neutral-200 text-sm flex-1 placeholder-neutral-600"
          />
        </div>

        {!browsing && (
          <div className="flex gap-2 mt-3">
            <FilterTrigger label="Sprzęt" value={equipmentFilter} onClick={() => setSheet("equipment")} />
          </div>
        )}

        {browsing && !NR_ATLAS_ONLY_EXERCISES && <AtlasCatalogEntry onOpen={openAtlas} />}

        {browsing ? (
          <div className="mt-4">
            <CategoryTiles
              categories={muscleFilterOptionsFor(exercises)}
              includeAll
              countFor={(cat) => exercises.filter((e) => exerciseMatchesMuscleFilter(e, cat, exercises)).length}
              onSelect={(cat) => selectCategory(cat === "Wszystkie" ? "Wszystkie" : cat)}
            />
          </div>
        ) : (
          <div className="mt-4">
            {categoryFilter !== "Wszystkie" && !searching && (
              <button
                onClick={() => window.history.back()}
                className="flex items-center gap-1 text-neutral-400 text-sm font-semibold mb-3"
              >
                <ArrowLeft size={15} /> Wszystkie partie
              </button>
            )}
            <div className="space-y-2">
              {filtered.length === 0 && (
                <EmptyState icon={Dumbbell} title="Brak ćwiczeń" subtitle="Dodaj ćwiczenie lub zmień filtry wyszukiwania." />
              )}
              {filtered.map((ex) => (
                <div key={ex.id} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <button className="flex-1 min-w-0 text-left" onClick={() => onOpenDetail(ex)}>
                    <p className="text-neutral-100 font-semibold break-words">{ex.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <EquipmentBadge exercise={ex} />
                      <CategoryBadges categories={exerciseMuscleBadges(ex, exercises)} />
                    </div>
                  </button>
                  <button onClick={() => setEditing(ex)} className="p-2 text-neutral-400 active:text-orange-500">
                    <Pencil size={17} />
                  </button>
                  <button onClick={() => setConfirmDelete(ex)} className="p-2 text-neutral-400 active:text-red-500">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {sheet === "equipment" && (
        <FilterPickerSheet
          title="Sprzęt"
          options={EQUIPMENT_OPTIONS}
          selected={equipmentFilter}
          onSelect={setEquipmentFilter}
          onClose={() => setSheet(null)}
        />
      )}

      {editing && (
        <ExerciseEditorModal
          exercise={editing === "new" ? null : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="USUNĄĆ ĆWICZENIE?"
          message={`„${confirmDelete.name}” zostanie trwale usunięte. Historia treningów z tym ćwiczeniem zostanie zachowana.`}
          confirmLabel="Usuń"
          danger
          onConfirm={() => {
            handleDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <BottomNav screen="exercises" onNavigate={onNavigate} />
    </div>
  );
}

function ExerciseEditorModal({ exercise, onSave, onClose }) {
  const [name, setName] = useState(exercise?.name || "");
  // Muscle groups (NR-MGW-002): one primary + optional secondaries, saved in the existing `category`.
  const initialGroups = useMemo(() => readMuscleSelection(exercise), [exercise]);
  const atlasGroups = initialGroups.atlas;
  const [primaryGroup, setPrimaryGroup] = useState(initialGroups.primary);
  const [secondaryGroups, setSecondaryGroups] = useState(initialGroups.secondary);
  const [groupError, setGroupError] = useState(false);
  const initialEquipmentRaw = exercise?.equipment?.length ? exercise.equipment : [EQUIPMENT_OPTIONS[0]];
  const initialCustomEquipment = initialEquipmentRaw.find((e) => !EQUIPMENT_OPTIONS.includes(e)) || "";
  const [equipment, setEquipment] = useState(
    initialCustomEquipment ? initialEquipmentRaw.map((e) => (e === initialCustomEquipment ? "Inne" : e)) : initialEquipmentRaw
  );
  const [customEquipment, setCustomEquipment] = useState(initialCustomEquipment);
  const [isTimeBased, setIsTimeBased] = useState(exercise?.isTimeBased || false);
  const [isSetsOnly, setIsSetsOnly] = useState(exercise?.isSetsOnly || false);
  const [isCardio, setIsCardio] = useState(exercise?.isCardio || false);
  const [deviceType, setDeviceType] = useState(exercise?.deviceType || CARDIO_DEVICE_TYPES[0]);
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl || "");
  const [notes, setNotes] = useState(exercise?.notes || "");

  const toggleInArray = (setter) => (value) => {
    setter((prev) => {
      if (prev.includes(value)) {
        return prev.length > 1 ? prev.filter((v) => v !== value) : prev; // keep at least one selected
      }
      return [...prev, value];
    });
  };
  const choosePrimary = (id) => {
    setPrimaryGroup(id);
    setSecondaryGroups((prev) => prev.filter((g) => g !== id)); // the primary is never also a secondary
    setGroupError(false);
  };
  const toggleSecondary = (id) => {
    if (id === primaryGroup) return;
    setSecondaryGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };
  const toggleEquipment = toggleInArray(setEquipment);

  const save = () => {
    if (!name.trim()) return;
    if (!isCardio && !atlasGroups && !primaryGroup) {
      setGroupError(true);
      return;
    }
    const resolvedEquipment = equipment.map((e) => (e === "Inne" && customEquipment.trim() ? customEquipment.trim() : e));
    onSave({
      id: exercise?.id || uid(),
      name: name.trim(),
      // atlas: its category is never rewritten (ATLAS_MUSCLE_GROUPS decides the groups)
      category: isCardio ? ["Cardio"] : atlasGroups ? exercise.category : buildMuscleCategory(primaryGroup, secondaryGroups),
      equipment: isCardio ? ["Maszyny"] : resolvedEquipment,
      isTimeBased: isCardio ? false : isTimeBased,
      isSetsOnly: isCardio ? false : isSetsOnly,
      isCardio,
      deviceType: isCardio ? deviceType : "",
      videoUrl: videoUrl.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 pb-8 overflow-y-auto no-scrollbar" style={{ maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
        <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-4">
          {exercise ? "EDYTUJ ĆWICZENIE" : "NOWE ĆWICZENIE"}
        </h2>

        <label className="text-neutral-500 text-xs uppercase font-semibold">Rodzaj ćwiczenia</label>
        <div className="grid grid-cols-2 gap-2 mt-1.5 mb-4">
          <button
            onClick={() => setIsCardio(false)}
            className={`py-3 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 ${
              !isCardio ? "bg-orange-500 border-orange-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-400"
            }`}
          >
            <Dumbbell size={16} /> Siłowe
          </button>
          <button
            onClick={() => setIsCardio(true)}
            className={`py-3 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 ${
              isCardio ? "bg-rose-500 border-rose-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-400"
            }`}
          >
            <Activity size={16} /> Cardio
          </button>
        </div>

        <label className="text-neutral-500 text-xs uppercase font-semibold">Nazwa</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isCardio ? "np. Bieg na bieżni" : "np. Przysiad ze sztangą"}
          className="w-full mt-1 mb-4 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        {isCardio ? (
          <>
            <label className="text-neutral-500 text-xs uppercase font-semibold">Urządzenie / rodzaj cardio</label>
            <div className="flex flex-wrap gap-2 mt-1.5 mb-4">
              {CARDIO_DEVICE_TYPES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDeviceType(d)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1.5 ${
                    deviceType === d ? "bg-rose-500 border-rose-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-400"
                  }`}
                >
                  {deviceType === d && <Check size={13} />}
                  {d}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {atlasGroups ? (
              <div className="mt-1.5 mb-4 bg-neutral-950 border border-neutral-800 rounded-xl p-3" data-testid="atlas-muscle-groups">
                <p className="text-neutral-500 text-xs uppercase font-semibold">Główna partia mięśniowa</p>
                <p className="text-neutral-100 text-sm font-semibold mt-0.5">{MUSCLE_GROUP_BY_ID[primaryGroup]?.label}</p>
                {secondaryGroups.length > 0 && (
                  <>
                    <p className="text-neutral-500 text-xs uppercase font-semibold mt-2">Partie drugorzędne</p>
                    <p className="text-neutral-300 text-sm mt-0.5">{secondaryGroups.map((id) => MUSCLE_GROUP_BY_ID[id]?.label).join(", ")}</p>
                  </>
                )}
                <p className="text-neutral-600 text-xs mt-2 leading-relaxed">Partie tego ćwiczenia ustala atlas NEXTREP — nie można ich zmienić.</p>
              </div>
            ) : (
              <>
                <label className="text-neutral-500 text-xs uppercase font-semibold">Główna partia mięśniowa</label>
                {initialGroups.legacyUnmapped && !primaryGroup && (
                  <p className="text-amber-400 text-xs mt-1 leading-relaxed" data-testid="legacy-groups-note">
                    To ćwiczenie miało dawną kategorię ({(exercise.category || []).join(", ")}). Wybierz główną partię.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 mt-1.5" role="radiogroup" aria-label="Główna partia mięśniowa">
                  {MUSCLE_GROUPS.map((g) => {
                    const on = primaryGroup === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-testid={`mg-primary-${g.id}`}
                        onClick={() => choosePrimary(g.id)}
                        className={`min-h-[44px] px-2.5 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1 text-left leading-tight ${
                          on ? "bg-orange-500 border-orange-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-300"
                        }`}
                      >
                        {on && <Check size={13} className="flex-shrink-0" />}
                        <span className="min-w-0 [overflow-wrap:normal] [word-break:normal]">{g.label}</span>
                      </button>
                    );
                  })}
                </div>
                {groupError && (
                  <p className="text-red-400 text-xs mt-1.5" data-testid="primary-group-error">
                    Wybierz główną partię mięśniową.
                  </p>
                )}
                <label className="text-neutral-500 text-xs uppercase font-semibold block mt-4">
                  Partie drugorzędne <span className="normal-case text-neutral-600">(opcjonalnie)</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1.5 mb-4">
                  {MUSCLE_GROUPS.map((g) => {
                    const isPrimary = primaryGroup === g.id;
                    const on = secondaryGroups.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={isPrimary}
                        data-testid={`mg-secondary-${g.id}`}
                        onClick={() => toggleSecondary(g.id)}
                        className={`min-h-[44px] px-2.5 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1 text-left leading-tight ${
                          isPrimary
                            ? "bg-neutral-950 border-neutral-900 text-neutral-700"
                            : on
                            ? "bg-orange-500/15 border-orange-500 text-orange-300"
                            : "bg-neutral-950 border-neutral-800 text-neutral-400"
                        }`}
                      >
                        {on && <Check size={13} className="flex-shrink-0" />}
                        <span className="min-w-0 [overflow-wrap:normal] [word-break:normal]">{g.label}{isPrimary ? " · główna" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <label className="text-neutral-500 text-xs uppercase font-semibold">Sprzęt <span className="normal-case text-neutral-600">(można wybrać kilka)</span></label>
            <div className="flex flex-wrap gap-2 mt-1.5 mb-4">
              {EQUIPMENT_OPTIONS.map((eq) => (
                <button
                  key={eq}
                  onClick={() => toggleEquipment(eq)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1.5 ${
                    equipment.includes(eq) ? "bg-orange-500 border-orange-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-400"
                  }`}
                >
                  {equipment.includes(eq) && <Check size={13} />}
                  {eq}
                </button>
              ))}
            </div>

            {equipment.includes("Inne") && (
              <div className="mb-4">
                <label className="text-neutral-500 text-xs uppercase font-semibold">Jaki sprzęt?</label>
                <input
                  value={customEquipment}
                  onChange={(e) => setCustomEquipment(e.target.value)}
                  placeholder="Wpisz nazwę sprzętu..."
                  className="w-full mt-1.5 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
                />
              </div>
            )}

            <label className="text-neutral-500 text-xs uppercase font-semibold">Sposób wykonania</label>
            <div className="space-y-2 mt-1.5 mb-4">
              <button
                onClick={() => {
                  setIsTimeBased((v) => !v);
                  if (!isTimeBased) setIsSetsOnly(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border ${
                  isTimeBased ? "bg-sky-500/10 border-sky-500/40" : "bg-neutral-950 border-neutral-800"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                  <Clock size={16} className={isTimeBased ? "text-sky-400" : "text-neutral-500"} /> Ćwiczenie na czas (np. plank)
                </span>
                <div className={`w-10 h-6 rounded-full flex items-center px-0.5 ${isTimeBased ? "bg-sky-500 justify-end" : "bg-neutral-700 justify-start"}`}>
                  <div className="w-5 h-5 rounded-full bg-white" />
                </div>
              </button>

              <button
                onClick={() => {
                  setIsSetsOnly((v) => !v);
                  if (!isSetsOnly) setIsTimeBased(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border ${
                  isSetsOnly ? "bg-purple-500/10 border-purple-500/40" : "bg-neutral-950 border-neutral-800"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                  <Layers size={16} className={isSetsOnly ? "text-purple-400" : "text-neutral-500"} /> Bez powtórzeń (np. spacer farmera)
                </span>
                <div className={`w-10 h-6 rounded-full flex items-center px-0.5 ${isSetsOnly ? "bg-purple-500 justify-end" : "bg-neutral-700 justify-start"}`}>
                  <div className="w-5 h-5 rounded-full bg-white" />
                </div>
              </button>
              {isSetsOnly && (
                <p className="text-purple-400/80 text-xs px-1">Podczas treningu zapiszesz tylko liczbę serii i opcjonalnie ciężar — bez liczenia powtórzeń.</p>
              )}
            </div>
          </>
        )}

        <label className="text-neutral-500 text-xs uppercase font-semibold">Link do instruktażu (YouTube itp.)</label>
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtube.com/..."
          className="w-full mt-1 mb-4 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <label className="text-neutral-500 text-xs uppercase font-semibold">{isCardio ? "Opis (opcjonalnie)" : "Notatki (opcjonalnie)"}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full mt-1 mb-5 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500 resize-none"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
            Anuluj
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="flex-1 py-3 rounded-xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Exercise Detail (history / stats / charts for a single exercise)        */
/* ---------------------------------------------------------------------- */

function ExerciseDetail({ exercise, history, onBack, updateExercises, isPro, onOpenUnlock }) {
  const [tab, setTab] = useState("historia"); // historia | statystyki | wykresy
  const [editing, setEditing] = useState(false);

  // Same exercise-history source as the progression engine and the PRO report (by exerciseId).
  const relevantSessions = findMatchingSessions(history, { exerciseId: exercise.id });

  const entries = relevantSessions.map((s) => ({
    date: s.date,
    data: s.exercises.find((e) => e.exerciseId === exercise.id),
  }));

  const totalWorkouts = entries.length;
  const totalSets = entries.reduce((sum, e) => sum + e.data.sets.length, 0);
  const totalReps = entries.reduce((sum, e) => sum + e.data.sets.reduce((s, st) => s + (Number(st.reps) || 0), 0), 0);
  const totalLoad = entries.reduce((sum, e) => sum + exerciseDetailVolume(e.data.sets), 0);
  const totalDuration = entries.reduce((sum, e) => sum + e.data.sets.reduce((s, st) => s + (Number(st.duration) || 0), 0), 0);

  const chartEntries = [...entries].reverse();
  const chartDates = chartEntries.map((e) => fmtDateShort(e.date));
  const maxWeightSeries = chartEntries.map((e) => Math.max(0, ...e.data.sets.map((s) => Number(s.weight) || 0)));
  const maxRepsSeries = chartEntries.map((e) => Math.max(0, ...e.data.sets.map((s) => Number(s.reps) || 0)));
  const maxDurationSeries = chartEntries.map((e) => Math.max(0, ...e.data.sets.map((s) => Number(s.duration) || 0)));
  const maxSpeedSeries = chartEntries.map((e) => Math.max(0, ...e.data.sets.map((s) => Number(s.speed) || 0)));
  const volumeSeries = chartEntries.map((e) => exerciseDetailVolume(e.data.sets));

  const kind = getExerciseKind(exercise);

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar
        title={exercise.name}
        onBack={onBack}
        right={
          <button onClick={() => setEditing(true)} className="p-1 text-neutral-400 active:text-orange-500">
            <Pencil size={19} />
          </button>
        }
      />

      <div className="px-5 pt-2">
        <div className="flex flex-wrap gap-1.5">
          <EquipmentBadge exercise={exercise} />
          <CategoryBadges categories={exerciseMuscleBadges(exercise)} />
        </div>
        {exercise.videoUrl && (
          <a
            href={exercise.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-orange-400 text-xs font-semibold underline underline-offset-2"
          >
            <Link2 size={13} /> Instruktaż wideo
          </a>
        )}

        {exercise.notes &&
          (() => {
            const { description, bullets } = parseExerciseNotes(exercise.notes);
            return (
              <div className="mt-4 space-y-3">
                {description && (
                  <div>
                    <p className="text-neutral-500 text-xs font-bold uppercase tracking-wide mb-1" style={{ letterSpacing: "0.06em" }}>
                      Opis ćwiczenia
                    </p>
                    <p className="text-neutral-300 text-sm leading-relaxed">{description}</p>
                  </div>
                )}
                {bullets.length > 0 && (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-orange-400 text-xs font-bold uppercase tracking-wide mb-2" style={{ letterSpacing: "0.06em" }}>
                      Technika — maksymalizacja hipertrofii
                    </p>
                    <ul className="space-y-1.5">
                      {bullets.map((b, i) => (
                        <li key={i} className="text-neutral-300 text-sm leading-relaxed flex items-start gap-2">
                          <span className="text-orange-500 flex-shrink-0 mt-1.5" style={{ width: 4, height: 4, borderRadius: 999, background: "currentColor" }} />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

        <div className="flex gap-1 mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
          {[
            { key: "historia", label: "Historia" },
            { key: "statystyki", label: "Statystyki" },
            { key: "wykresy", label: "Wykresy" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
                tab === t.key ? "bg-orange-500 text-neutral-950" : "text-neutral-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "historia" && (
          <div className="mt-4 space-y-2">
            {entries.length === 0 && (
              <EmptyState icon={HistoryIcon} title="Brak historii" subtitle="To ćwiczenie nie pojawiło się jeszcze w żadnym treningu." compact />
            )}
            {entries.map((e, i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                <p className="text-neutral-400 text-xs mb-2">{fmtDate(e.date)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {e.data.sets.map((s, j) => (
                    <span key={j} className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-neutral-200 font-display tracking-wide">
                      {kind === "time"
                        ? `${s.duration}s`
                        : kind === "cardio"
                        ? [`${s.duration || 0}s`, s.speed ? `${s.speed}km/h` : null, s.incline ? `${s.incline}%` : null].filter(Boolean).join(" · ")
                        : kind === "sets"
                        ? s.weight != null
                          ? `${s.weight}kg`
                          : "seria"
                        : kind === "bodyweight"
                        ? `${s.reps} p.${formatRir(s.rir) ? ` (RIR ${formatRir(s.rir)})` : ""}`
                        : kind === "bodyweightPlus"
                        ? `MW+${s.weight || 0}kg×${s.reps}${formatRir(s.rir) ? ` (RIR ${formatRir(s.rir)})` : ""}`
                        : `${s.weight}kg×${s.reps}${formatRir(s.rir) ? ` (RIR ${formatRir(s.rir)})` : ""}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "statystyki" && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Treningi" value={totalWorkouts} wide />
            <Stat label="Serie" value={totalSets} wide />
            {kind === "cardio" || kind === "time" ? (
              <Stat label="Łączny czas" value={fmtDuration(totalDuration)} wide />
            ) : (
              <>
                <Stat label="Powtórzenia" value={totalReps} wide />
                <Stat label="Obciążenie" value={`${Math.round(totalLoad)} kg`} wide />
              </>
            )}
          </div>
        )}

        {/* Historical progression charts are NEXTREP PRO. Free gets the gate only — no chart and no
            chart data is rendered before PRO is unlocked. The "Historia" tab stays a Free diary. */}
        {tab === "wykresy" && !isPro && (
          <ProAnalysisLock
            onOpenUnlock={onOpenUnlock}
            title="Zobacz trend, nie tylko pojedynczy wynik"
            lines={[
              "Twoja historia treningów jest już zapisana.",
              "NEXTREP PRO analizuje kolejne wykonania tego ćwiczenia i pokazuje, dokąd naprawdę zmierza Twój progres.",
            ]}
          />
        )}
        {tab === "wykresy" && isPro && (
          <div className="mt-4 space-y-3">
            {chartEntries.length < 2 ? (
              <EmptyState icon={TrendingUp} title="Za mało danych" subtitle="Wykresy pojawią się po co najmniej dwóch treningach z tym ćwiczeniem." compact />
            ) : (
              <>
                {kind === "weight" && (
                  <>
                    <ChartCard title="Maksymalny ciężar" data={maxWeightSeries} dates={chartDates} unit="kg" />
                    <ChartCard title="Objętość na sesję" data={volumeSeries} dates={chartDates} unit="kg" />
                  </>
                )}
                {kind === "bodyweightPlus" && (
                  <>
                    <ChartCard title="Dodatkowy ciężar" data={maxWeightSeries} dates={chartDates} unit="kg" />
                    <ChartCard title="Maksymalne powtórzenia" data={maxRepsSeries} dates={chartDates} unit=" powt." />
                  </>
                )}
                {kind === "bodyweight" && <ChartCard title="Maksymalne powtórzenia" data={maxRepsSeries} dates={chartDates} unit=" powt." />}
                {kind === "time" && <ChartCard title="Maksymalny czas" data={maxDurationSeries} dates={chartDates} unit="s" formatSeconds />}
                {kind === "cardio" && (
                  <>
                    <ChartCard title="Czas" data={maxDurationSeries} dates={chartDates} unit="s" formatSeconds />
                    {maxSpeedSeries.some((v) => v > 0) && <ChartCard title="Maksymalna prędkość" data={maxSpeedSeries} dates={chartDates} unit=" km/h" />}
                  </>
                )}
                {kind === "sets" && maxWeightSeries.some((v) => v > 0) && <ChartCard title="Ciężar" data={maxWeightSeries} dates={chartDates} unit="kg" />}
                {kind === "sets" && !maxWeightSeries.some((v) => v > 0) && (
                  <p className="text-neutral-500 text-xs">To ćwiczenie nie ma zapisanych ciężarów — brak liczby do wykresu.</p>
                )}
              </>
            )}
            {!isPro && chartEntries.length >= 2 && (
              <button onClick={onOpenUnlock} className="w-full text-left pt-1">
                <p className="text-orange-400/80 text-xs leading-snug">Chcesz zobaczyć to na tle wszystkich partii mięśniowych? → Statystyki PRO</p>
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <ExerciseEditorModal
          exercise={exercise}
          onSave={(updated) => {
            updateExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Plans Screen + Editor                                                   */
/* ---------------------------------------------------------------------- */

function PlansScreen({ plans, exercises, updatePlans, updateExercises, onNavigate, onOpenEditor, isPro, onOpenUnlock }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewMode, setViewMode] = useState("wlasne"); // 'wlasne' | 'gotowe'
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null); // { template, level } or null

  const move = (idx, dir) => {
    updatePlans((prev) => {
      const arr = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });
  };

  const remove = (id) => updatePlans((prev) => prev.filter((p) => p.id !== id));

  // Pure(ish) commit: actually persists the template as a real plan and returns it. Only called
  // once the person has seen the preview and explicitly chosen to add or edit it — never on tap.
  const commitTemplate = (template, level) => {
    const built = buildPlansFromTemplateLevel(template, level, exercises);
    if (!built) {
      const existingName = template.levels.length > 1 ? `${template.name} — ${level.label}` : template.name;
      const existing = plans.find((p) => p.name === existingName);
      if (existing) return existing;
      const newPlan = { id: uid(), name: existingName, exercises: [] };
      updatePlans((prev) => [...prev, newPlan]);
      return newPlan;
    }
    const existingByName = built.newPlans.every((np) => plans.some((p) => p.name === np.name));
    if (existingByName) return plans.find((p) => p.name === built.newPlans[0].name);
    if (built.newExercises.length) updateExercises((prev) => [...prev, ...built.newExercises]);
    updatePlans((prev) => [...prev, ...built.newPlans]);
    return built.newPlans[0];
  };

  // Same result as commitTemplate, but WITHOUT saving: for "Edytuj plan". An already-saved plan of
  // this template is edited as-is; otherwise an unsaved copy goes to the editor and is only
  // persisted if the person presses "Zapisz plan" (see pendingTemplatePlans / App's PlanEditor).
  const prepareTemplateForEdit = (template, level) => {
    const built = buildPlansFromTemplateLevel(template, level, exercises);
    if (!built) {
      const existingName = template.levels.length > 1 ? `${template.name} — ${level.label}` : template.name;
      const existing = plans.find((p) => p.name === existingName);
      if (existing) return existing;
      const draftPlan = { id: uid(), name: existingName, exercises: [] };
      pendingTemplatePlans.set(draftPlan.id, { newExercises: [], extraPlans: [] });
      return draftPlan;
    }
    const existingByName = built.newPlans.every((np) => plans.some((p) => p.name === np.name));
    if (existingByName) return plans.find((p) => p.name === built.newPlans[0].name);
    const [first, ...rest] = built.newPlans;
    pendingTemplatePlans.set(first.id, { newExercises: built.newExercises, extraPlans: rest });
    return first;
  };

  const openLevelPreview = (template, level) => {
    if (template.tier === "premium" && !isPro) {
      onOpenUnlock();
      return;
    }
    setPreviewTarget({ template, level });
  };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar
        title="PLANY TRENINGOWE"
        right={
          viewMode === "wlasne" && (
            <button
              onClick={() => onOpenEditor(null)}
              aria-label="Nowy plan treningowy"
              className="w-9 h-9 flex-shrink-0 rounded-full bg-orange-500 active:bg-orange-600 text-neutral-950 flex items-center justify-center shadow-brand-glow"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          )
        }
      />
      <div className="px-5 pt-3">
        <div className="flex gap-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
          {[
            { key: "wlasne", label: "Własne" },
            { key: "gotowe", label: "Gotowe" },
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

        {viewMode === "wlasne" && (
          <>
            <div className="mt-1 space-y-2">
              {plans.length === 0 && (
                <EmptyState icon={ClipboardList} title="Brak planów treningowych" subtitle="Stwórz plan np. A, B lub C, albo skorzystaj z gotowego szablonu w zakładce „Gotowe”." />
              )}
              {plans.length > 1 && (
                <p className="text-neutral-500 text-xs mb-2 leading-relaxed" data-testid="plans-order-note">
                  <span className="text-neutral-400 font-semibold">Kolejność ma znaczenie</span> — Start podpowiada następny trening według kolejności Twoich planów.
                </p>
              )}
              {plans.map((p, idx) => (
                <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PlanThumbnail variant="ready" size={44} planKey={p.templateKey || "fbw"} />
                    <div className="flex-1 min-w-0" onClick={() => onOpenEditor(p)}>
                      <p className="text-neutral-100 font-semibold break-words">{p.name}</p>
                      <p className="text-neutral-500 text-xs mt-0.5">
                        {p.exercises.length} {plWord(p.exercises.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
                      </p>
                    </div>
                    <div className="flex flex-col">
                      <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-0.5 text-neutral-500 disabled:opacity-20 active:text-orange-500">
                        <ChevronUp size={16} />
                      </button>
                      <button onClick={() => move(idx, 1)} disabled={idx === plans.length - 1} className="p-0.5 text-neutral-500 disabled:opacity-20 active:text-orange-500">
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <button onClick={() => onOpenEditor(p)} className="p-2 text-neutral-400 active:text-orange-500">
                      <Pencil size={17} />
                    </button>
                    <button onClick={() => setConfirmDelete(p)} className="p-2 text-neutral-400 active:text-red-500">
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {viewMode === "gotowe" && (
          <div className="space-y-2">
            {READY_PLAN_TEMPLATES.map((t) => {
              const isExpanded = !t.comingSoon && expandedTemplate === t.key; // I2: „Wkrótce” never expands
              const isPremiumTier = t.tier === "premium";
              return (
                <div key={t.key} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                  <button onClick={() => !t.comingSoon && setExpandedTemplate(isExpanded ? null : t.key)} disabled={!!t.comingSoon} className={`w-full p-3 flex items-start gap-3 text-left${t.comingSoon ? " opacity-60" : ""}`}>
                    <PlanThumbnail variant="ready" size={56} planKey={t.key} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-neutral-100 font-semibold text-sm">{t.name}</p>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            isPremiumTier ? "bg-orange-500/15 text-orange-400 border border-orange-500/30" : "bg-lime-500/15 text-lime-400 border border-lime-500/30"
                          }`}
                        >
                          {isPremiumTier ? "PRO" : "FREE"}
                        </span>
                        {t.comingSoon && <ReadyTemplateSoonBadge />}
                      </div>
                      <p className="text-neutral-500 text-xs mt-1 leading-relaxed">{t.description}</p>
                    </div>
                    {!t.comingSoon && <ChevronDown size={16} className={`text-neutral-600 flex-shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-1.5">
                      {t.levels.map((lvl) => (
                        <button
                          key={lvl.id}
                          onClick={() => openLevelPreview(t, lvl)}
                          className="w-full flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-left"
                        >
                          <PlanThumbnail variant="ready" tier={levelTier(lvl.label)} size={36} planKey={t.key} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-neutral-200 text-sm font-medium">{lvl.label}</span>
                            {lvl.experience && <span className="block text-neutral-600 text-xs mt-0.5">{lvl.experience}</span>}
                          </span>
                          {isPremiumTier && !isPro ? (
                            <Lock size={15} className="text-orange-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight size={15} className="text-neutral-600 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="USUNĄĆ PLAN?"
          message={`Plan „${confirmDelete.name}” zostanie trwale usunięty. Historia treningów wykonanych wg tego planu zostanie zachowana.`}
          confirmLabel="Usuń"
          danger
          onConfirm={() => {
            remove(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {previewTarget &&
        (() => {
          const { template, level } = previewTarget;
          const built = buildPlansFromTemplateLevel(template, level, exercises);
          const planName = template.levels.length > 1 ? `${template.name} — ${level.label}` : template.name;
          const days = built ? built.newPlans : [];
          const exerciseLookup = new Map(exercises.map((e) => [e.id, e]));
          (built?.newExercises || []).forEach((e) => exerciseLookup.set(e.id, e));
          const totalExercises = days.reduce((sum, d) => sum + d.exercises.length, 0);
          const totalSets = days.reduce((sum, d) => sum + d.exercises.reduce((s, it) => s + it.setsDetail.length, 0), 0);
          const estMinutes = Math.max(20, Math.round((totalSets * 2.5) / 5) * 5);
          const allEquipment = [...new Set(days.flatMap((d) => d.exercises.flatMap((it) => exerciseLookup.get(it.exerciseId)?.equipment || [])))];

          return (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setPreviewTarget(null)}>
              <div
                className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 overflow-y-auto no-scrollbar"
                style={{ maxHeight: "88vh" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
                <p className="text-neutral-500 text-xs font-semibold uppercase mb-1">Podgląd planu</p>
                <h2 className="font-display text-3xl text-neutral-50 tracking-wide leading-tight mb-3">{planName}</h2>

                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300">{level.label}</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300">ok. {estMinutes} min</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300">
                    {totalExercises} ćwicz. {days.length > 1 ? `· ${days.length} dni` : ""}
                  </span>
                </div>

                {allEquipment.length > 0 && (
                  <div className="mb-4">
                    <p className="text-neutral-500 text-xs font-semibold uppercase mb-1.5">Sprzęt</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allEquipment.map((eq) => (
                        <span key={eq} className="text-xs px-2 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-400">
                          {eq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4 mb-4">
                  {days.map((day, di) => (
                    <div key={day.id}>
                      {days.length > 1 && <p className="text-neutral-400 text-xs font-semibold uppercase mb-1.5">{day.name}</p>}
                      <div className="space-y-1.5">
                        {day.exercises.map((it, ii) => {
                          const ex = exerciseLookup.get(it.exerciseId);
                          const firstSet = it.setsDetail[0];
                          return (
                            <div key={it.id} className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5">
                              <p className="text-neutral-100 text-sm font-medium">{ex?.name || "Ćwiczenie"}</p>
                              <p className="text-neutral-500 text-xs mt-0.5">
                                {it.setsDetail.length} {plWord(it.setsDetail.length, "seria", "serie", "serii")} · {firstSet?.target} {ex?.isTimeBased ? "s" : "powt."}
                                {formatRir(firstSet?.rir) ? ` · RIR ${formatRir(firstSet.rir)}` : ""} · przerwa {it.restSeconds || 90}s
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const plan = prepareTemplateForEdit(template, level);
                      setPreviewTarget(null);
                      onOpenEditor(plan);
                    }}
                    className="w-full py-3 rounded-xl bg-neutral-800 text-neutral-200 font-semibold"
                  >
                    Edytuj plan
                  </button>
                  <button
                    onClick={() => {
                      commitTemplate(template, level);
                      setPreviewTarget(null);
                    }}
                    className="w-full py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold"
                  >
                    Dodaj do moich planów
                  </button>
                  <button onClick={() => setPreviewTarget(null)} className="w-full py-2 text-neutral-500 text-sm font-semibold">
                    Anuluj
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      <BottomNav screen="plans" onNavigate={onNavigate} />
    </div>
  );
}

function PlanEditor({ plan, exercises, onSave, onCancel }) {
  const [name, setName] = useState(plan?.name || "");
  const [items, setItems] = useState(plan?.exercises ? plan.exercises.map((i) => ({ ...i })) : []);
  const [pickerOpen, setPickerOpen] = useState(false);

  const addExercise = (exerciseId, loadModel = null) => {
    const kind = exerciseKindFor(exerciseId, exercises);
    const detail =
      kind === "cardio"
        ? [{ id: uid() }]
        : kind === "sets"
        ? [{ id: uid() }, { id: uid() }, { id: uid() }]
        : [
            { id: uid(), target: kind === "time" ? "20-30" : "8-10", rir: "1-2" },
            { id: uid(), target: kind === "time" ? "20-30" : "8-10", rir: "1-2" },
            { id: uid(), target: kind === "time" ? "20-30" : "8-10", rir: "0-1" },
          ];
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        ...pickedExerciseFields(exerciseId, loadModel, exercises), // I3: an atlas exercise by id (+ model), never copied
        restSeconds: 90,
        supersetGroup: null,
        setsDetail: detail,
        targetSets: detail.length,
        targetReps: detail[0]?.target || "",
      },
    ]);
    setPickerOpen(false);
  };

  const updateSetDetail = (itemId, setId, patch) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, setsDetail: (it.setsDetail || []).map((s) => (s.id === setId ? { ...s, ...patch } : s)) } : it
      )
    );
  };

  const addSetRow = (itemId) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const detail = it.setsDetail && it.setsDetail.length ? it.setsDetail : getPlanItemSetsDetail(it);
        const last = detail[detail.length - 1] || { target: "8-10", rir: "1-2" };
        const next = [...detail, { id: uid(), target: last.target, rir: last.rir }];
        return { ...it, setsDetail: next, targetSets: next.length };
      })
    );
  };

  const removeSetRow = (itemId, setId) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const detail = it.setsDetail && it.setsDetail.length ? it.setsDetail : getPlanItemSetsDetail(it);
        if (detail.length <= 1) return it;
        const next = detail.filter((s) => s.id !== setId);
        return { ...it, setsDetail: next, targetSets: next.length };
      })
    );
  };

  const setSetsCount = (itemId, count) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const n = Math.max(1, count);
        const detail = it.setsDetail && it.setsDetail.length ? it.setsDetail : getPlanItemSetsDetail(it);
        const next = Array.from({ length: n }, (_, i) => detail[i] || { id: uid() });
        return { ...it, setsDetail: next, targetSets: n };
      })
    );
  };

  const updateItem = (id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  const move = (idx, dir) => {
    setItems((prev) => {
      const arr = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });
  };

  const toggleSuperset = (idx) => {
    // link item at idx with item at idx+1, syncing rest time across the whole group
    setItems((prev) => {
      const arr = [...prev];
      const a = arr[idx];
      const b = arr[idx + 1];
      if (!b) return prev;
      const alreadyLinked = a.supersetGroup && a.supersetGroup === b.supersetGroup;
      if (alreadyLinked) {
        arr[idx] = { ...a, supersetGroup: null };
        arr[idx + 1] = { ...b, supersetGroup: null };
      } else {
        const gid = a.supersetGroup || uid();
        const sharedRest = a.restSeconds;
        for (let k = 0; k < arr.length; k++) {
          if (k === idx || k === idx + 1 || arr[k].supersetGroup === gid) {
            arr[k] = { ...arr[k], supersetGroup: gid, restSeconds: sharedRest };
          }
        }
      }
      return arr;
    });
  };

  // Applies one shared rest time to every exercise in a superset group — the pause happens
  // once per round (after the last exercise in the group), not after each individual exercise.
  const updateGroupRest = (groupId, value) => {
    setItems((prev) => prev.map((it) => (it.supersetGroup === groupId ? { ...it, restSeconds: value } : it)));
  };

  const exName = (exId) => exerciseNameFor(exId, exercises) || "Usunięte ćwiczenie";
  const exType = (exId) => exerciseKindFor(exId, exercises);

  const save = () => {
    if (!name.trim() || items.length === 0) return;
    onSave({ id: plan?.id || uid(), name: name.trim(), exercises: items });
  };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar title={plan ? "EDYTUJ PLAN" : "NOWY PLAN"} onBack={onCancel} />
      <div className="px-5 pt-3">
        <label className="text-neutral-500 text-xs uppercase font-semibold">Nazwa planu</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="np. Trening A"
          className="w-full mt-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Ćwiczenia w planie</p>

        <div className="space-y-2">
          {items.map((it, idx) => {
            const linkedNext = it.supersetGroup && items[idx + 1]?.supersetGroup === it.supersetGroup;
            const linkedPrev = it.supersetGroup && items[idx - 1]?.supersetGroup === it.supersetGroup;
            const isLastInGroup = it.supersetGroup && !linkedNext;
            return (
              <div key={it.id}>
                {linkedPrev && (
                  <div className="flex items-center gap-1 pl-2 text-lime-400 text-xs font-semibold -mb-1">
                    <Link2 size={11} /> superseria
                  </div>
                )}
                <div className={`bg-neutral-900 border rounded-xl px-3 py-3 ${it.supersetGroup ? "border-lime-500/40" : "border-neutral-800"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 text-xs w-4">{idx + 1}.</span>
                    <p className="text-neutral-100 font-semibold flex-1 min-w-0 break-words">{exName(it.exerciseId)}</p>
                    <div className="flex flex-col">
                      <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-0.5 text-neutral-500 disabled:opacity-20">
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="p-0.5 text-neutral-500 disabled:opacity-20">
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <button onClick={() => removeItem(it.id)} className="p-1.5 text-neutral-500 active:text-red-500">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="mt-2">
                    {exType(it.exerciseId) === "cardio" ? (
                      <p className="text-rose-400/80 text-xs">Cardio — pojedyncza, ciągła sesja (czas, dystans, kcal itd. wpisywane podczas treningu).</p>
                    ) : exType(it.exerciseId) === "sets" ? (
                      <div>
                        <span className="text-xs text-neutral-500 uppercase font-semibold">Liczba serii</span>
                        <input
                          type="number"
                          min={1}
                          value={(it.setsDetail && it.setsDetail.length) || it.targetSets || 3}
                          onChange={(e) => setSetsCount(it.id, Number(e.target.value))}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-100 text-sm mt-0.5"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <span className="text-xs text-neutral-500 uppercase font-semibold">
                          Serie — {exType(it.exerciseId) === "time" ? "czas (s)" : "cel powtórzeń"} i RIR
                        </span>
                        {(it.setsDetail && it.setsDetail.length ? it.setsDetail : getPlanItemSetsDetail(it)).map((s, si) => (
                          <div key={s.id} className="flex items-center gap-1.5">
                            <span className="text-neutral-500 text-xs w-4 flex-shrink-0">{si + 1}.</span>
                            <input
                              value={s.target || ""}
                              onChange={(e) => updateSetDetail(it.id, s.id, { target: e.target.value })}
                              placeholder={exType(it.exerciseId) === "time" ? "np. 20-30" : "np. 8-10"}
                              className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-100 text-sm"
                            />
                            <select
                              value={s.rir || ""}
                              onChange={(e) => updateSetDetail(it.id, s.id, { rir: e.target.value })}
                              className="bg-neutral-950 border border-neutral-800 rounded-lg px-1 py-1.5 text-neutral-100 text-sm w-20 flex-shrink-0"
                            >
                              <option value="">RIR</option>
                              {RIR_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {formatRir(r)}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeSetRow(it.id, s.id)}
                              disabled={(it.setsDetail || []).length <= 1}
                              className="p-1 text-neutral-600 disabled:opacity-20 active:text-red-500 flex-shrink-0"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addSetRow(it.id)}
                          className="w-full text-xs font-semibold text-neutral-500 py-1.5 border border-dashed border-neutral-800 rounded-lg active:text-orange-400"
                        >
                          + Dodaj serię
                        </button>
                      </div>
                    )}
                  </div>

                  {!it.supersetGroup && (
                    <div className="mt-2">
                      <span className="text-xs text-neutral-500 uppercase font-semibold">Przerwa (s)</span>
                      <input
                        type="number"
                        min={0}
                        value={it.restSeconds}
                        onChange={(e) => updateItem(it.id, { restSeconds: Number(e.target.value) })}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-100 text-sm mt-0.5"
                      />
                    </div>
                  )}
                </div>

                {isLastInGroup && (
                  <div className="bg-lime-500/5 border border-t-0 border-lime-500/30 rounded-b-xl px-3 py-2.5 -mt-1">
                    <span className="text-xs text-lime-400 uppercase font-semibold flex items-center gap-1">
                      <Link2 size={11} /> Przerwa po całej superserii (s)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={it.restSeconds}
                      onChange={(e) => updateGroupRest(it.supersetGroup, Number(e.target.value))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-100 text-sm mt-1"
                    />
                  </div>
                )}

                {idx < items.length - 1 && (
                  <button
                    onClick={() => toggleSuperset(idx)}
                    className={`w-full text-xs font-semibold py-1 flex items-center justify-center gap-1 ${
                      linkedNext ? "text-lime-400" : "text-neutral-600"
                    }`}
                  >
                    <Link2 size={12} /> {linkedNext ? "połączone w superserię — kliknij by rozłączyć" : "połącz z kolejnym w superserię"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="w-full mt-3 border-2 border-dashed border-neutral-700 active:border-orange-500 rounded-xl py-3 flex items-center justify-center gap-2 text-neutral-400 active:text-orange-400 font-semibold text-sm"
        >
          <Plus size={18} /> Dodaj ćwiczenie do planu
        </button>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
            Anuluj
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || items.length === 0}
            className="flex-1 py-3 rounded-xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold"
          >
            Zapisz plan
          </button>
        </div>
      </div>

      {pickerOpen && (
        <ExercisePickerModal exercises={exercises} onPick={addExercise} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

// End-of-rest signal: a short, clear two-tone beep through the device's CURRENT audio output (the
// browser routes Web Audio like any other page sound — speaker or headphones), plus a short
// vibration where supported. Web Audio only mixes in a brief sound; it never starts or stops the
// person's music. Browsers only allow audio after a user gesture, so the AudioContext is created/
// resumed inside the tap that starts the rest countdown (unlock), and the end signal just plays
// on it. Every part is optional: if audio is blocked or missing, vibration still runs, and vice
// versa — never a thrown error, never a popup.
// KNOWN PLATFORM LIMITATION (PWA / Web Audio on Android) — deliberately NOT worked around here:
// with the phone fully locked, Chrome may suspend the page's audio, so the end-of-rest beep is not
// guaranteed to sound until the screen is turned on/unlocked. The countdown itself stays correct:
// it is timestamp-based (endAt = start + restSeconds, remaining = endAt − Date.now()), so after
// unlocking it shows the real remaining time, stops at 0:00, never auto-starts another rest and
// signals once. In a future native Android build, a native notification/alarm (independent of the
// WebView/PWA lifecycle) should fire at that same endAt — this timer is the right base for it.
// No Service Worker, MediaSession, background-audio or keep-alive tricks are used on purpose.
const restSignal = {
  ctx: null,
  scheduled: null, // { start, nodes } — the end beep queued on the audio clock for the deadline
  _beepAt(ctx, t0) {
    const nodes = [];
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t0 + i * 0.18;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
      nodes.push(osc);
    });
    return nodes;
  },
  // Queue the end beep on the AUDIO clock at the deadline. Rendering is driven by the audio thread,
  // not by JS timers, so if the platform keeps the context running while the screen is off, the
  // beep comes on time even though the JS countdown is frozen. If the platform suspends the
  // context, end() plays it once when the app is back. Never two beeps.
  schedule(delaySec) {
    this.cancelScheduled();
    try {
      const ctx = this.ctx;
      if (!ctx || !(delaySec > 0)) return false;
      const start = ctx.currentTime + delaySec;
      this.scheduled = { start, nodes: this._beepAt(ctx, start) };
      return true;
    } catch {
      this.scheduled = null;
      return false;
    }
  },
  cancelScheduled() {
    const sch = this.scheduled;
    this.scheduled = null;
    if (!sch) return;
    sch.nodes.forEach((n) => {
      try {
        n.stop(0);
        n.disconnect();
      } catch {}
    });
  },
  // The countdown reached 0:00: the beep exactly once (skipped if the queued one already sounded)
  // and the vibration exactly once.
  end() {
    const ctx = this.ctx;
    const sch = this.scheduled;
    let alreadySounded = false;
    try {
      alreadySounded = !!(sch && ctx && ctx.currentTime >= sch.start - 0.05);
    } catch {}
    if (alreadySounded) {
      this.scheduled = null;
      let vibrate = false;
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") vibrate = !!navigator.vibrate([200, 100, 200]);
      } catch {}
      return { audio: true, vibrate, scheduled: true };
    }
    this.cancelScheduled();
    return { ...this.play(), scheduled: false };
  },
  unlock() {
    try {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return false;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  },
  play() {
    let audio = false;
    let vibrate = false;
    try {
      const ctx = this.ctx;
      if (ctx) {
        if (ctx.state === "suspended" && ctx.resume) ctx.resume().catch(() => {});
        this._beepAt(ctx, ctx.currentTime + 0.02);
        audio = true;
      }
    } catch {
      audio = false;
    }
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") vibrate = !!navigator.vibrate([200, 100, 200]);
    } catch {
      vibrate = false;
    }
    return { audio, vibrate };
  },
};

// Exercise picker (atlas). With onCreateExercise, it also offers "+ Dodaj ćwiczenie", which opens
// the SAME ExerciseEditorModal used in the "Ćwiczenia" atlas; the new exercise gets a normal,
// stable id, is saved to the atlas by the caller, and appears in this list right away (the view
// jumps to its muscle group, freshly added exercise highlighted) — nothing is added to a plan.
function ExercisePickerModal({ exercises, onPick, onClose, onCreateExercise, title = "WYBIERZ ĆWICZENIE", excludeExerciseId = null }) {
  // I3: in S1 the picker of plans and workouts is the atlas (no own-exercise list, no "add" form).
  // NR_ATLAS_ONLY_EXERCISES is a build constant, so the hooks below always run in the same order.
  if (NR_ATLAS_ONLY_EXERCISES) return <AtlasExercisePickerModal onPick={onPick} onClose={onClose} title={title} excludeExerciseId={excludeExerciseId} />;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Wszystkie");
  const [equipmentFilter, setEquipmentFilter] = useState("Wszystkie");
  const [sheet, setSheet] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState(null);

  const searching = query.trim().length > 0;
  const browsing = !searching && category === "Wszystkie";

  const filtered = exercises.filter((e) => {
    const matchQuery = e.name.toLowerCase().includes(query.toLowerCase());
    const matchCategory = exerciseMatchesMuscleFilter(e, category, exercises);
    const matchEquipment = equipmentFilter === "Wszystkie" || e.equipment.includes(equipmentFilter);
    return matchQuery && matchCategory && matchEquipment;
  });

  return (
    <>
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 flex flex-col" style={{ maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4 flex-shrink-0" />
        <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
          <h2 className="font-display text-2xl text-neutral-50 tracking-wide">{title}</h2>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onCreateExercise && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-full bg-orange-500 text-neutral-950 text-xs font-bold active:bg-orange-600"
              >
                <Plus size={15} strokeWidth={2.5} /> Dodaj ćwiczenie
              </button>
            )}
            <button onClick={onClose} aria-label="Zamknij" className="p-1.5 -mr-1.5 text-neutral-400 active:text-orange-500">
              <X size={22} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 mb-3 flex-shrink-0">
          <Search size={16} className="text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj..."
            className="bg-transparent outline-none text-neutral-200 text-sm flex-1 placeholder-neutral-600"
          />
        </div>

        {!browsing && (
          <div className="flex gap-2 mb-3 flex-shrink-0">
            <FilterTrigger label="Partia" value={category} onClick={() => setSheet("category")} />
            <FilterTrigger label="Sprzęt" value={equipmentFilter} onClick={() => setSheet("equipment")} />
          </div>
        )}

        <div className="overflow-y-auto no-scrollbar pb-4">
          {browsing ? (
            <CategoryTiles
              categories={muscleFilterOptionsFor(exercises)}
              includeAll
              countFor={(cat) => exercises.filter((e) => exerciseMatchesMuscleFilter(e, cat, exercises)).length}
              onSelect={(cat) => setCategory(cat)}
            />
          ) : (
            <>
              {category !== "Wszystkie" && !searching && (
                <button
                  onClick={() => setCategory("Wszystkie")}
                  className="flex items-center gap-1 text-neutral-400 text-sm font-semibold mb-3"
                >
                  <ArrowLeft size={15} /> Wszystkie partie
                </button>
              )}
              <div className="space-y-2">
                {filtered.length === 0 && <p className="text-neutral-500 text-sm text-center py-6">{onCreateExercise ? "Brak wyników. Utwórz je przyciskiem „Dodaj ćwiczenie”." : "Brak wyników. Dodaj to ćwiczenie w zakładce „Ćwiczenia”."}</p>}
                {filtered.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => onPick(ex.id)}
                    className={`w-full text-left bg-neutral-950 border rounded-xl px-4 py-3 flex items-center justify-between gap-2 active:border-orange-500 ${
                      ex.id === createdId ? "border-orange-500" : "border-neutral-800"
                    }`}
                  >
                    <span className="text-neutral-100 font-medium">
                      {ex.name}
                      {ex.id === createdId && <span className="block text-orange-400 text-[11px] font-semibold mt-0.5">Nowe ćwiczenie — stuknij, żeby wybrać</span>}
                    </span>
                    <EquipmentBadge exercise={ex} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {sheet === "category" && (
        <FilterPickerSheet title="Partia mięśniowa" options={muscleFilterOptionsFor(exercises)} selected={category} onSelect={setCategory} onClose={() => setSheet(null)} />
      )}
      {sheet === "equipment" && (
        <FilterPickerSheet title="Sprzęt" options={EQUIPMENT_OPTIONS} selected={equipmentFilter} onSelect={setEquipmentFilter} onClose={() => setSheet(null)} />
      )}
    </div>
    {creating && (
      <ExerciseEditorModal
        exercise={null}
        onSave={(ex) => {
          onCreateExercise(ex);
          setCreatedId(ex.id);
          setQuery("");
          setEquipmentFilter("Wszystkie");
          {
            // jump to the new exercise's primary group (or Cardio)
            const mg = getExerciseMuscleGroups(ex.id, [ex]);
            setCategory(isCardioExercise(ex) ? MUSCLE_FILTER_CARDIO : mg ? MUSCLE_GROUP_BY_ID[mg.muscleGroup].label : "Wszystkie");
          }
          setCreating(false);
        }}
        onClose={() => setCreating(false)}
      />
    )}
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Start Workout Screen                                                    */
/* ---------------------------------------------------------------------- */

// I4.3 — Training Entry Flow (master TEFM v1, 14.10.2026; canvas v81). The Trening tab:
//   selection (3 paths) · own plans empty state · unfinished-workout protection (decision screen,
//   delete confirmation, cancelled, deleted ≈4 s message, delete error) · unreadable draft (+ its
//   delete confirmation). Global rule: no start path overwrites an unfinished or unreadable workout.
const tefCardLink = {
  position: "relative", width: "100%", minHeight: "96px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "14px",
  padding: "14px 12px 14px 14px", borderRadius: "16px", background: NR.cardSurface, boxShadow: NR.cardShadow, color: "inherit", border: 0,
  textAlign: "left", fontFamily: NR.font, cursor: "pointer",
};
const tefWideButton = (danger) => ({
  width: "100%", minHeight: "52px", boxSizing: "border-box", padding: "10px 16px", borderRadius: "12px",
  border: danger ? "1px solid rgba(242,85,90,.45)" : `1px solid ${NR.hairline}`, background: danger ? "transparent" : "#121213",
  color: danger ? NR.dangerText : NR.textPrimary, fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 500,
  display: "flex", alignItems: "center", gap: "12px", textAlign: "left", cursor: "pointer",
});
const TEF_FOCUS = "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]";
function TefHeader({ title, subtitle, onBack }) {
  return (
    <header style={{ position: "relative", display: "flex", flexDirection: "column", gap: "6px", margin: "4px 0 8px 9px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {onBack && (
          <button type="button" aria-label="Wróć" onClick={onBack} className={TEF_FOCUS} style={{ flexShrink: 0, width: "44px", height: "44px", marginLeft: "-10px", border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: NR.textPrimary }}>
            <ChevronLeft aria-hidden="true" size={24} strokeWidth={2} />
          </button>
        )}
        <h1 style={{ margin: 0, fontWeight: 600, fontSize: "32px", lineHeight: "36px", color: NR.textDisplay }}>{title}</h1>
      </div>
      {subtitle && <p style={{ margin: 0, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>{subtitle}</p>}
    </header>
  );
}
function TefChoice({ icon: Icon, title, text, onClick, testId, border }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={onClick} data-testid={testId} className={TEF_FOCUS} style={tefCardLink}>
        <span aria-hidden="true" style={{ flexShrink: 0, width: "44px", height: "44px", borderRadius: "12px", background: "rgba(255,133,27,.10)", border: "1px solid rgba(255,133,27,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={22} strokeWidth={2} color={NR.warm} />
        </span>
        <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "23px", lineHeight: "26px", fontWeight: 500, color: NR.textDisplay }}>{title}</span>
          <span style={{ fontSize: "15px", lineHeight: "19px", color: NR.textSecondary }}>{text}</span>
        </span>
        <ChevronRight aria-hidden="true" size={18} strokeWidth={2} color={NR.warm} style={{ flexShrink: 0 }} />
      </button>
      {border && <NrFadeBorder alpha={0.5} />}
    </div>
  );
}
function TefInfo({ children }) {
  return (
    <p style={{ margin: "2px 4px 0", display: "flex", gap: "8px", fontSize: "15px", lineHeight: "19px", color: NR.textSecondary, fontFamily: NR.font }}>
      <Info aria-hidden="true" size={17} strokeWidth={2} color={NR.textSecondary} style={{ flexShrink: 0 }} />
      <span>{children}</span>
    </p>
  );
}
function TefBullets({ items }) {
  return (
    <ul style={{ margin: "0 0 18px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
      {items.map((t) => (
        <li key={t} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "16px", lineHeight: "20px", color: "#D0D0D0" }}>
          <span aria-hidden="true" style={{ flexShrink: 0, width: "6px", height: "6px", borderRadius: "3px", background: NR.danger, marginTop: "7px" }} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
// Confirmation sheet of a destructive step (role=alertdialog, red top edge).
function TefConfirmSheet({ title, summary, bullets, confirmLabel, onConfirm, onCancel, testId }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const btns = ref.current ? ref.current.querySelectorAll("button") : [];
    if (btns[btns.length - 1]) btns[btns.length - 1].focus(); // the safe choice first
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      try {
        if (prev && prev.focus) prev.focus();
      } catch {}
    };
  }, []);
  const btn = { minHeight: "52px", width: "100%", border: 0, borderRadius: "12px", fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 600, cursor: "pointer", padding: "8px 14px" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div aria-hidden="true" onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.7)" }} />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="tef-confirm-h" data-testid={testId} style={{ position: "absolute", left: 0, right: 0, bottom: 0, boxSizing: "border-box", padding: "10px 16px max(env(safe-area-inset-bottom, 0px), 8px)", borderRadius: "20px 20px 0 0", background: "linear-gradient(180deg, #151515 0%, #0F0F10 100%)", borderTop: "1px solid rgba(242,85,90,.45)", fontFamily: NR.font }}>
        <div aria-hidden="true" style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#3A3A3A", margin: "0 auto 16px" }} />
        <div style={{ paddingBottom: "16px" }}>
          <p id="tef-confirm-h" style={{ margin: "0 0 8px", fontSize: "25px", lineHeight: "28px", fontWeight: 600, color: NR.textDisplay }}>{title}</p>
          {summary && <p style={{ margin: "0 0 10px", fontSize: "17px", lineHeight: "21px", fontWeight: 500, color: NR.textPrimary, overflowWrap: "anywhere" }}>{summary}</p>}
          <TefBullets items={bullets} />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button type="button" onClick={onConfirm} data-testid={`${testId}-confirm`} className={TEF_FOCUS} style={{ ...btn, background: NR.danger, color: NR.bg }}>{confirmLabel}</button>
            <button type="button" onClick={onCancel} data-testid={`${testId}-cancel`} className={TEF_FOCUS} style={{ ...btn, background: "#1A1A1B", color: NR.textPrimary, fontWeight: 500 }}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function TefDraftCard({ summary, onResume }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <NrHeroCard labelledBy="tef-dec-h" testId="tef-draft-card" photoPos="50% 22%" bottomShade="linear-gradient(0deg, rgba(11,11,12,.92) 0%, rgba(11,11,12,.55) 38%, rgba(11,11,12,0) 62%)">
        <div style={{ position: "relative", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 8px 14px 16px" }}>
          <NrSectionHead icon={PauseCircle}>Niedokończony trening</NrSectionHead>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingRight: "8px" }}>
            <h2 id="tef-dec-h" style={{ margin: 0, fontWeight: 500, fontSize: "29px", lineHeight: "34px", color: NR.textDisplay, overflowWrap: "anywhere" }}>{summary.name}</h2>
            <p style={{ margin: 0, fontSize: "16px", lineHeight: "20px", color: NR.textPrimary }}>Trening nie został zakończony.</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "26px", paddingRight: "8px" }}>
            <DashStat label="Ćwiczenia" value={`${summary.doneExercises} / ${summary.totalExercises}`} />
            <DashStat label="Czas" value={summary.elapsedSec != null ? fmtClock(summary.elapsedSec) : "—"} />
            <DashStat label="Objętość" value={`${fmtThousands(summary.volume)} kg`} />
          </div>
          <NrPillCta onClick={onResume} testId="tef-resume">Wznów trening</NrPillCta>
        </div>
      </NrHeroCard>
    </div>
  );
}
function TefAlert({ title, text, onRetry, retryLabel = "Spróbuj ponownie", testId }) {
  return (
    <div role="alert" data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px 12px 12px 14px", borderRadius: "14px", background: "rgba(242,85,90,.10)", border: "1px solid rgba(242,85,90,.45)" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <AlertTriangle aria-hidden="true" size={20} strokeWidth={2} color={NR.dangerText} style={{ flexShrink: 0 }} />
        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "18px", lineHeight: "21px", fontWeight: 600, color: NR.textDisplay }}>{title}</span>
          <span style={{ fontSize: "16px", lineHeight: "20px", color: "#D0D0D0" }}>{text}</span>
        </span>
      </div>
      {onRetry && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onRetry} data-testid={`${testId}-retry`} className={TEF_FOCUS} style={{ minHeight: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid #3A3A3C", background: "#151516", color: NR.textPrimary, fontFamily: NR.font, fontSize: "17px", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
            {retryLabel}
          </button>
        </div>
      )}
    </div>
  );
}
// The ≈4 s result message (role=status) above the B2 bar.
function TefStatus({ text }) {
  return (
    <div role="status" aria-live="polite" data-testid="tef-status" style={{ position: "fixed", left: "12px", right: "12px", bottom: "calc(var(--nr-nav-h, 57px) + 12px)", zIndex: 40, display: "flex", alignItems: "center", gap: "10px", minHeight: "52px", boxSizing: "border-box", padding: "10px 14px", borderRadius: "14px", background: "linear-gradient(180deg, #1A1A1B, #121213)", border: "1px solid rgba(66,201,138,.45)", boxShadow: "0 12px 28px -8px rgba(0,0,0,.9)", fontFamily: NR.font }}>
      <Check aria-hidden="true" size={20} strokeWidth={2.5} color={NR.success} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: "17px", lineHeight: "21px", color: NR.textPrimary, overflowWrap: "anywhere" }}>{text}</span>
    </div>
  );
}

function StartWorkoutScreen({ plans, exercises, updatePlans, updateExercises, onNavigate, onSelectPlan, onNoPlan, isPro, onOpenUnlock, draftState = null, onResumeDraft, onDeleteDraft, onRereadDraft }) {
  const [mode, setMode] = useState(null); // null | 'plans' | 'ready'
  const [confirm, setConfirm] = useState(null); // null | 'draft' | 'unreadable'
  const [deleteError, setDeleteError] = useState(false);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const draftSummary = draftState && draftState.status === "ok" ? summarizeActiveWorkoutDraft(draftState.draft) : null;
  const guard = draftState && draftState.status === "unreadable" ? "unreadable" : draftSummary ? "draft" : null;
  const runDelete = (kind) => {
    const name = draftSummary ? draftSummary.name : null;
    const result = onDeleteDraft ? onDeleteDraft() : "failed";
    setConfirm(null);
    if (result === "deleted") {
      setDeleteError(false);
      setMode(null);
      setNotice(kind === "draft" ? `Usunięto niedokończony trening „${name}”.` : "Usunięto nieczytelny zapis treningu.");
    } else {
      setDeleteError(true);
    }
  };
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  // Multi-day ready plan: which level's days are being shown, so the person picks the day.
  const [dayPick, setDayPick] = useState(null); // null | { templateKey, levelId, baseName, days, newExercises }

  // "Rozpocznij trening" from a ready plan: starts the workout from the ready plan itself.
  // Using a plan never saves it — only "Zapisz plan" / "Dodaj do moich planów" does that.
  const startReadyDay = (day, newExercises) => {
    if (newExercises && newExercises.length) updateExercises((prev) => mergeNewExercises(prev, newExercises));
    onSelectPlan(day);
  };
  const useTemplateLevel = (template, level) => {
    if (template.tier === "premium" && !isPro) {
      onOpenUnlock();
      return;
    }
    const ready = buildReadyPlanDays(template, level, exercises);
    if (ready.days.length === 1) {
      startReadyDay(ready.days[0], ready.newExercises);
      return;
    }
    setDayPick({ templateKey: template.key, levelId: level.id, ...ready });
  };

  const nav = <BottomNav screen="startWorkout" onNavigate={onNavigate} />;
  const status = notice && <TefStatus text={notice} />;

  if (guard === "draft") {
    return (
      <>
        <NrScreen testId="tef-decision" screen="trening-decision">
          <TefHeader title="Masz niedokończony trening" subtitle="Zanim zaczniesz nowy, zdecyduj, co zrobić z rozpoczętym treningiem." />
          {deleteError && (
            <TefAlert
              testId="tef-delete-error"
              title="Nie udało się usunąć treningu"
              text="Usunięcie nie zostało potwierdzone (pamięć urządzenia lub synchronizacja). Niedokończony trening jest zachowany bez zmian."
              onRetry={() => runDelete("draft")}
            />
          )}
          <TefDraftCard summary={draftSummary} onResume={onResumeDraft} />
          <section aria-label="Inne możliwości" style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
            <button type="button" onClick={() => onNavigate("dashboard")} data-testid="tef-back-dashboard" className={TEF_FOCUS} style={tefWideButton(false)}>
              <Home aria-hidden="true" size={20} strokeWidth={2} />
              <span>Wróć do Dashboardu</span>
            </button>
            <button type="button" onClick={() => setConfirm("draft")} data-testid="tef-delete" className={TEF_FOCUS} style={tefWideButton(true)}>
              <Trash2 aria-hidden="true" size={20} strokeWidth={2} />
              <span>Usuń i wybierz nowy trening</span>
            </button>
            <TefInfo>Nowy trening nie zastąpi rozpoczętego bez Twojego potwierdzenia.</TefInfo>
          </section>
        </NrScreen>
        {nav}
        {confirm === "draft" && (
          <TefConfirmSheet
            testId="tef-confirm"
            title="Usunąć niedokończony trening?"
            summary={`${draftSummary.name} · ${draftSummary.doneExercises} / ${draftSummary.totalExercises} ćwiczeń · ${draftSummary.elapsedSec != null ? fmtClock(draftSummary.elapsedSec) : "—"} · ${fmtThousands(draftSummary.volume)} kg`}
            bullets={["Trening zostanie trwale usunięty.", "Nie pojawi się w historii.", "Nie będzie można go odzyskać."]}
            confirmLabel="Usuń i wybierz nowy trening"
            onConfirm={() => runDelete("draft")}
            onCancel={() => setConfirm(null)}
          />
        )}
      </>
    );
  }

  if (guard === "unreadable") {
    return (
      <>
        <NrScreen testId="tef-unreadable" screen="trening-corrupt">
          <TefHeader title="Nie można odczytać treningu" subtitle="Znaleźliśmy zapis niedokończonego treningu, ale nie da się go teraz odczytać." />
          {deleteError && (
            <TefAlert
              testId="tef-delete-error"
              title="Nie udało się usunąć zapisu"
              text="Usunięcie nie zostało potwierdzone (pamięć urządzenia lub synchronizacja). Zapis jest zachowany bez zmian."
              onRetry={() => runDelete("unreadable")}
            />
          )}
          <section role="alert" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "12px", padding: "16px 14px", borderRadius: "16px", border: "1px solid rgba(255,181,71,.45)", background: "linear-gradient(180deg, #17130C, #0E0C09)" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <AlertTriangle aria-hidden="true" size={22} strokeWidth={2} color="#FFB547" style={{ flexShrink: 0 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "20px", lineHeight: "23px", fontWeight: 600, color: NR.textDisplay }}>Zapis jest uszkodzony lub nieczytelny</span>
                <span style={{ fontSize: "16px", lineHeight: "20px", color: "#D0D0D0" }}>Nic nie zostało usunięte ani nadpisane. Nowy trening nie zastąpi tego zapisu bez Twojej decyzji.</span>
              </span>
            </div>
          </section>
          <section aria-label="Możliwości" style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
            <div style={{ display: "flex" }}>
              <NrPillCta onClick={onRereadDraft} testId="tef-reread">Spróbuj ponownie odczytać</NrPillCta>
            </div>
            <button type="button" onClick={() => onNavigate("dashboard")} data-testid="tef-back-dashboard" className={TEF_FOCUS} style={{ ...tefWideButton(false), justifyContent: "center" }}>
              <Home aria-hidden="true" size={20} strokeWidth={2} />
              <span>Wróć do Dashboardu</span>
            </button>
            <button type="button" onClick={() => setConfirm("unreadable")} data-testid="tef-delete" className={TEF_FOCUS} style={{ ...tefWideButton(true), justifyContent: "center" }}>
              <Trash2 aria-hidden="true" size={20} strokeWidth={2} />
              <span>Usuń zapis i wybierz nowy trening</span>
            </button>
            <TefInfo>Usunięcie wymaga osobnego potwierdzenia.</TefInfo>
          </section>
        </NrScreen>
        {nav}
        {confirm === "unreadable" && (
          <TefConfirmSheet
            testId="tef-confirm"
            title="Usunąć nieczytelny zapis treningu?"
            bullets={["Zapis zostanie trwale usunięty.", "Nie pojawi się w historii.", "Nie będzie można go odzyskać."]}
            confirmLabel="Usuń zapis i wybierz nowy trening"
            onConfirm={() => runDelete("unreadable")}
            onCancel={() => setConfirm(null)}
          />
        )}
      </>
    );
  }

  if (!mode) {
    return (
      <>
        <NrScreen testId="tef-select" screen="trening">
          <TefHeader title="Rozpocznij trening" subtitle="Wybierz, jak chcesz dziś trenować." />
          <TefChoice icon={ClipboardList} title="Własne plany treningowe" text="Wybierz jeden ze swoich zapisanych planów (np. A, B, C)." onClick={() => setMode("plans")} testId="tef-own" border />
          <TefChoice icon={ListOrdered} title="Gotowe plany treningowe" text="FBW, Split, 5×5 i inne gotowe szablony — wkrótce." onClick={() => setMode("ready")} testId="tef-ready" />
          <TefChoice icon={PlayCircle} title="Trening bez planu" text="Zacznij od razu i dodawaj ćwiczenia w trakcie." onClick={onNoPlan} testId="tef-no-plan" />
        </NrScreen>
        {nav}
        {status}
      </>
    );
  }

  if (mode === "plans" && plans.length === 0) {
    return (
      <>
        <NrScreen testId="tef-own-empty" screen="trening">
          <TefHeader title="Własne plany" onBack={() => setMode(null)} />
          <section aria-labelledby="tef-empty-h" style={{ position: "relative", marginTop: "8px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px", padding: "28px 18px 22px", borderRadius: "16px", background: NR.cardSurface, boxShadow: NR.cardShadow }}>
            <span aria-hidden="true" style={{ width: "64px", height: "64px", borderRadius: "32px", background: "radial-gradient(circle at 50% 30%, rgba(255,133,27,.22), rgba(255,133,27,.04) 70%)", border: "1px solid rgba(255,133,27,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ClipboardList size={30} strokeWidth={1.75} color={NR.warm} />
            </span>
            <h2 id="tef-empty-h" style={{ margin: "6px 0 0", fontSize: "25px", lineHeight: "28px", fontWeight: 500, color: NR.textDisplay }}>Nie masz jeszcze własnych planów</h2>
            <p style={{ margin: "0 0 6px", maxWidth: "280px", fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>Stwórz plan, np. A, B lub C — potem wybierzesz go tutaj przed treningiem.</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <NrPillCta onClick={() => onNavigate("plans")} testId="tef-create-plan">Stwórz własny plan treningowy</NrPillCta>
            </div>
            <div style={{ width: "100%", marginTop: "4px" }}>
              <button type="button" onClick={() => setMode("ready")} data-testid="tef-see-ready" className={TEF_FOCUS} style={{ ...tefWideButton(false), justifyContent: "center", gap: "10px" }}>
                <ListOrdered aria-hidden="true" size={20} strokeWidth={2} />
                <span>Zobacz gotowe plany</span>
              </button>
            </div>
          </section>
        </NrScreen>
        {nav}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar title="ROZPOCZNIJ TRENING" onBack={mode ? () => setMode(null) : undefined} />

      {mode === "plans" && (
        <div className="px-5 pt-4 space-y-2">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectPlan(p)}
              className="w-full text-left bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 flex items-center justify-between active:border-orange-500"
            >
              <div>
                <p className="text-neutral-100 font-semibold">{p.name}</p>
                <p className="text-neutral-500 text-xs mt-0.5">{p.exercises.length} {plWord(p.exercises.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")}</p>
              </div>
              <ChevronRight size={18} className="text-neutral-600" />
            </button>
          ))}
        </div>
      )}

      {mode === "ready" && (
        <div className="px-5 pt-4 space-y-2">
          {READY_PLAN_TEMPLATES.map((t) => {
            const isExpanded = !t.comingSoon && expandedTemplate === t.key; // I2: „Wkrótce” never expands
            const isPremiumTier = t.tier === "premium";
            return (
              <div key={t.key} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                <button onClick={() => !t.comingSoon && setExpandedTemplate(isExpanded ? null : t.key)} disabled={!!t.comingSoon} className={`w-full p-3 flex items-start gap-3 text-left${t.comingSoon ? " opacity-60" : ""}`}>
                  <PlanThumbnail variant="ready" size={56} planKey={t.key} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-neutral-100 font-semibold text-sm">{t.name}</p>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          isPremiumTier ? "bg-orange-500/15 text-orange-400 border border-orange-500/30" : "bg-lime-500/15 text-lime-400 border border-lime-500/30"
                        }`}
                      >
                        {isPremiumTier ? "PRO" : "FREE"}
                      </span>
                      {t.comingSoon && <ReadyTemplateSoonBadge />}
                    </div>
                    <p className="text-neutral-500 text-xs mt-1 leading-relaxed">{t.description}</p>
                  </div>
                  {!t.comingSoon && <ChevronDown size={16} className={`text-neutral-600 flex-shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {dayPick && dayPick.templateKey === t.key && (
                      <div className="bg-neutral-950 border border-orange-500/40 rounded-lg p-2.5 space-y-1.5">
                        <p className="text-neutral-400 text-xs font-semibold uppercase">Wybierz dzień — {dayPick.baseName}</p>
                        {dayPick.days.map((d, i) => (
                          <button
                            key={d.id}
                            onClick={() => startReadyDay(d, dayPick.newExercises)}
                            className="w-full flex items-center justify-between gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-left active:border-orange-500"
                          >
                            <span className="min-w-0">
                              <span className="block text-neutral-100 text-sm font-medium">{readyDayLabel(dayPick.baseName, d, i)}</span>
                              <span className="block text-neutral-600 text-xs mt-0.5">
                                {d.exercises.length} {plWord(d.exercises.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
                              </span>
                            </span>
                            <PlayCircle size={18} className="text-orange-400 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                    {t.levels.map((lvl) => (
                      <button
                        key={lvl.id}
                        onClick={() => useTemplateLevel(t, lvl)}
                        className={`w-full flex items-center gap-3 bg-neutral-950 border rounded-lg px-3 py-2.5 text-left ${
                          dayPick && dayPick.templateKey === t.key && dayPick.levelId === lvl.id ? "border-orange-500" : "border-neutral-800"
                        }`}
                      >
                        <PlanThumbnail variant="ready" tier={levelTier(lvl.label)} size={36} planKey={t.key} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-neutral-200 text-sm font-medium">{lvl.label}</span>
                          {lvl.experience && <span className="block text-neutral-600 text-xs mt-0.5">{lvl.experience}</span>}
                        </span>
                        {isPremiumTier && !isPro ? (
                          <Lock size={15} className="text-orange-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight size={15} className="text-neutral-600 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BottomNav screen="startWorkout" onNavigate={onNavigate} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Active Workout                                                          */
/* ---------------------------------------------------------------------- */

// Finds sessions containing this exact exercise, chronologically before `beforeDate` (never
// using data from a session that happened later, even if it was entered into the app later —
// this is what makes backfilled past workouts safe to add without leaking future data into them).
// Matching is by exerciseId only, regardless of which plan the session belonged to: if Bench
// Press was last done in "Trening A" and now appears in "Trening B", its history and
// recommendation still follow — a training's name never determines an exercise's continuity.
// ===== Report data (PRO analysis) — presentation helpers over EXISTING data only =====
// No second engine: histories come from findMatchingSessions (strictly before the session's own
// date → no future leakage), exercise volume from computeSessionVolume (the engine's rules, incl.
// MW+ = external load × reps), workout volume from the session's own stored `volume`, and the
// text from computeExerciseAnalysis. Charts show only real saved data points (never padded).
const REPORT_MAX_POINTS = PROGRESSION_MAX_PERFORMANCES; // ≤ 10 points incl. the reported one

// Last ≤10 performances of ONE exerciseId, ending with this session's own performance.
function exercisePerformanceSeries(history, session, ex) {
  const prior = findMatchingSessions(history || [], { exerciseId: ex.exerciseId, beforeDate: session.date })
    .filter((s) => s.id !== session.id)
    .slice(0, REPORT_MAX_POINTS - 1)
    .reverse()
    .map((s) => ({ session: s, sets: s.exercises.find((e) => e.exerciseId === ex.exerciseId)?.sets || [], isCurrent: false }));
  return [...prior, { session, sets: ex.sets || [], isCurrent: true }].map((p) => ({
    ...p,
    date: p.session.date,
    volume: exerciseVolume(p.sets, ex.type),
    summary: summarizeExerciseSets(p.sets, ex.type),
  }));
}

// Compact numbers for one performance: working (top) load, total reps, RIR categories, series count.
function summarizeExerciseSets(sets, kind) {
  const normal = (sets || []).filter((s) => s.setType !== "dropset");
  const loaded = kind === "weight" || kind === "bodyweightPlus";
  const loads = normal.map((s) => toNumber(s.weight) || 0);
  // RIR shown as the model categories used in this performance, in order ("1–2" or "1–2, 0–1").
  const rirLabels = [...new Set(normal.map((s) => formatRir(s.rir)).filter(Boolean))];
  return {
    setsCount: normal.length,
    workingLoad: loaded && loads.length ? Math.max(...loads) : null,
    reps: normal.reduce((sum, s) => sum + (Number(s.reps) || 0), 0),
    seconds: normal.reduce((sum, s) => sum + (Number(s.duration) || 0), 0),
    rir: rirLabels.length ? rirLabels.join(", ") : null,
  };
}

// "Analogous" workout = the same training day: same planId (a user plan's id, or the stable
// "tpl-<template>-<level>-<day>" id of a ready-plan day). Sessions without a planId (e.g. pulled
// from the cloud, where a ready-plan workout has plan_id null) fall back to the same plan name.
// A workout without any plan has no analogous workouts.
function isAnalogousSession(a, b) {
  if (a.planId && b.planId) return a.planId === b.planId;
  if (!a.planName || !b.planName) return false;
  return a.planName === b.planName;
}

// Last ≤10 workouts for the workout-level chart, ending with this session. mode "analogous" (the
// default context) = same training day only; mode "all" = every earlier workout, any type.
function workoutComparisonSeries(history, session, mode) {
  const t = new Date(session.date).getTime();
  const prior = (history || [])
    .filter((s) => s.id !== session.id && new Date(s.date).getTime() < t && (s.exercises || []).length > 0)
    .filter((s) => (mode === "analogous" ? isAnalogousSession(s, session) : true))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, REPORT_MAX_POINTS - 1)
    .reverse();
  return [...prior, session].map((s) => ({
    session: s,
    date: s.date,
    isCurrent: s === session,
    volume: Math.round(Number(sessionVolume(s)) || 0),
    totalSets: s.totalSets,
    totalReps: s.totalReps,
  }));
}

const pctChange = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);
const fmtPct = (p) => `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p).toFixed(1).replace(".", ",")}%`;
const fmtVolume = (v, kind) => (kind === "time" ? fmtDuration(v) : kind === "bodyweight" ? `${Math.round(v)} powt.` : `${Math.round(v).toLocaleString("pl-PL")} kg`);
const pointLabelsFor = (points) => points.map((p, i) => (p.isCurrent ? "Ten trening" : `T-${points.length - 1 - i}`));

