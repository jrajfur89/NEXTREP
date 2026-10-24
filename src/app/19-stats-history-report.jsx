function MonthCalendar({ history, month, onShiftMonth, selectedRange, onSelectRange }) {
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstDay = new Date(year, monthIdx, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const todayKey = toLocalDateStr(new Date());

  const sessionsByDate = {};
  history.forEach((h) => {
    const key = toLocalDateStr(h.date);
    sessionsByDate[key] = (sessionsByDate[key] || 0) + 1;
  });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = month.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

  const handleTap = (key) => {
    if (!selectedRange) {
      onSelectRange({ from: key, to: key });
      return;
    }
    if (selectedRange.from === selectedRange.to) {
      if (selectedRange.from === key) {
        onSelectRange(null); // tapping the same single day again clears the selection
        return;
      }
      const [from, to] = key < selectedRange.from ? [key, selectedRange.from] : [selectedRange.from, key];
      onSelectRange({ from, to });
      return;
    }
    onSelectRange({ from: key, to: key }); // a range was already selected — start a fresh pick
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onShiftMonth(-1)} className="p-1 text-neutral-400 active:text-orange-500">
          <ChevronLeft size={16} />
        </button>
        <span className="text-neutral-200 text-sm font-semibold capitalize">{monthLabel}</span>
        <button onClick={() => onShiftMonth(1)} className="p-1 text-neutral-400 active:text-orange-500">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {["P", "W", "Ś", "C", "P", "S", "N"].map((d, i) => (
          <span key={i} className="text-neutral-600 text-xs">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const has = sessionsByDate[key];
          const isToday = key === todayKey;
          const inRange = selectedRange && key >= selectedRange.from && key <= selectedRange.to;
          const isEdge = selectedRange && (key === selectedRange.from || key === selectedRange.to);
          return (
            <button
              key={i}
              onClick={() => handleTap(key)}
              className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs ${
                isEdge
                  ? "bg-orange-500 text-neutral-950 font-bold"
                  : inRange
                  ? "bg-orange-500/20 text-orange-300"
                  : isToday
                  ? "border border-orange-500/50 text-neutral-200"
                  : has
                  ? "text-neutral-100 font-semibold"
                  : "text-neutral-700"
              }`}
            >
              {d}
              {has && !isEdge && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-0.5" />}
            </button>
          );
        })}
      </div>
      <p className="text-neutral-600 text-xs text-center mt-2">Stuknij dzień, żeby zaznaczyć jeden dzień, albo drugi dzień, żeby zaznaczyć zakres.</p>
    </div>
  );
}

function StatsScreen({ history, exercises, onNavigate, onOpenExercise }) {
  const [range, setRange] = useState("week"); // week | month | all
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);

  const { start, end } = getRangeBounds(range);
  const overall = computeOverallStats(history, start, end);
  const byCategory = computeStatsByCategory(history, exercises, start, end);
  const groupsWithData = MUSCLE_GROUPS.filter((g) => byCategory[g.id]);
  const UNIT_TXT = { kg: "kg", reps: "powt.", seconds: "s" };
  const progressSignal = computeProgressSignal(history);
  const report = generateProgressReport(progressSignal);

  const rangeLabel = { week: "Ten tydzień", month: "Ten miesiąc", all: "Cały czas" };
  const statusOrder = ["green", "yellow", "red", "stagnation"];
  const statusColor = { green: "text-lime-400", yellow: "text-yellow-400", red: "text-red-400", stagnation: "text-orange-400" };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar title="STATYSTYKI" />
      <div className="px-5 pt-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-4">
          <p className="text-neutral-500 text-xs uppercase font-semibold mb-3">Sygnał progresu</p>
          {progressSignal.items.length === 0 ? (
            <p className="text-neutral-500 text-xs">Zbyt mało danych — sygnał pojawi się po co najmniej dwóch wykonaniach tego samego ćwiczenia.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {statusOrder.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedStatus(selectedStatus === key ? null : key)}
                    className={`text-center rounded-lg py-1.5 ${selectedStatus === key ? "bg-neutral-800" : "active:bg-neutral-800/50"}`}
                  >
                    <p className={`font-display text-3xl ${statusColor[key]}`}>{progressSignal.counts[key]}</p>
                    <p className="text-neutral-500 text-xs leading-snug px-1">
                      {STATUS_META[key].icon} {STATUS_META[key].label}
                    </p>
                  </button>
                ))}
              </div>

              {selectedStatus ? (
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <p className="text-neutral-300 text-xs leading-relaxed mb-2">{STATUS_META[selectedStatus].description}</p>
                  <div className="space-y-1.5">
                    {progressSignal.items
                      .filter((it) => it.status === selectedStatus)
                      .map((it, i) => {
                        const liveEx = exercises.find((e) => e.id === it.exerciseId);
                        return (
                          <button
                            key={i}
                            onClick={() => liveEx && onOpenExercise(liveEx)}
                            className="w-full flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block text-neutral-200 text-sm font-medium break-words">{it.name}</span>
                              {it.message && <span className="block text-neutral-500 text-xs mt-0.5 leading-snug">{it.message}</span>}
                            </span>
                            {liveEx && <ChevronRight size={14} className="text-neutral-600 flex-shrink-0" />}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <p className="text-neutral-400 text-xs leading-relaxed mt-3 pt-3 border-t border-neutral-800">{report}</p>
              )}
            </>
          )}
        </div>

        {/* Przełącznik okresu — świadomie POD "Sygnał progresu" i tuż nad "Podsumowanie": filtruje
            wyłącznie dane podsumowania poniżej, nigdy sygnał progresu (ten zawsze patrzy na całą
            historię), więc siedzi wizualnie przy tych danych, których faktycznie dotyczy. */}
        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 mb-2">
          {["week", "month", "all"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold ${range === r ? "bg-orange-500 text-neutral-950" : "text-neutral-400"}`}
            >
              {rangeLabel[r]}
            </button>
          ))}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-4">
          <p className="text-neutral-500 text-xs uppercase font-semibold mb-3">Podsumowanie — {rangeLabel[range].toLowerCase()}</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Treningi" value={overall.sessionsCount} wide />
            <Stat label="Serie" value={overall.totalSets} wide />
            <Stat label="Objętość" value={`${Math.round(overall.totalVolume)} kg`} wide />
          </div>
        </div>

        <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Partie mięśniowe</p>
        {groupsWithData.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Brak danych w tym okresie" subtitle="Wykonaj trening, żeby zobaczyć statystyki." />
        ) : (
          <div className="space-y-2 mb-4">
            {groupsWithData.map((g) => {
              const cat = g.id;
              const st = byCategory[cat];
              const delta = muscleGroupLastDelta(history, exercises, cat);
              const meta = CATEGORY_META[g.metaCat] || { icon: Dumbbell, classes: "bg-neutral-800 text-neutral-300" };
              // workload stays in its own units: external-load kg, bodyweight reps, seconds
              const workloadParts = [
                `${st.sets} ${plWord(st.sets, "seria", "serie", "serii")}`,
                st.kg > 0 ? `${Math.round(st.kg)} kg obj.` : null,
                st.reps > 0 ? `${st.reps} powt. (masa ciała)` : null,
                st.seconds > 0 ? `${Math.round(st.seconds)} s` : null,
              ].filter(Boolean);
              const Icon = meta.icon;
              const isExpanded = expandedCategory === cat;
              const series = isExpanded ? computeCategoryTimeSeries(history, exercises, cat) : [];
              return (
                <div key={cat} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedCategory(isExpanded ? null : cat)} className="w-full p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.classes}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-neutral-100 font-semibold text-sm">{g.label}</p>
                      <p className="text-neutral-500 text-xs">
                        {workloadParts.join(" · ")} ({rangeLabel[range].toLowerCase()})
                      </p>
                      {delta && !delta.comparable && (
                        <p className="text-xs mt-0.5 text-neutral-500 break-words" data-testid="mgw-no-compare">
                          Brak porównania z „{delta.prevPlanLabel}” ({fmtDateShort(delta.prevDate)}) — {delta.reason === "unit" ? "inna jednostka obciążenia" : "inny zestaw ćwiczeń"}.
                        </p>
                      )}
                      {delta && delta.comparable && (
                        <p className={`text-xs mt-0.5 flex items-center gap-1 ${delta.delta > 0 ? "text-lime-400" : delta.delta < 0 ? "text-red-400" : "text-neutral-500"}`}>
                          {delta.delta > 0 ? <TrendingUp size={11} className="flex-shrink-0" /> : delta.delta < 0 ? <TrendingDown size={11} className="flex-shrink-0" /> : <Minus size={11} className="flex-shrink-0" />}
                          <span className="break-words">
                            {delta.delta > 0 ? "+" : ""}
                            {Math.round(delta.delta)} {UNIT_TXT[delta.unit]} vs „{delta.prevPlanLabel}” ({fmtDateShort(delta.prevDate)})
                          </span>
                        </p>
                      )}
                    </div>
                    <ChevronDown size={16} className={`text-neutral-600 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      {series.length >= 2 ? (
                        <>
                          <p className="text-neutral-600 text-xs mb-2">Dotknij punkt, żeby zobaczyć, z jakiego to treningu.</p>
                          <ChartCard
                            title="Objętość na trening z tą partią"
                            data={series.map((p) => p.volume)}
                            dates={series.map((p) => fmtDateShort(p.date))}
                            pointLabels={series.map((p) => p.planLabel)}
                            unit={UNIT_TXT[series[series.length - 1].unit]}
                            showDelta={false}
                          />
                        </>
                      ) : (
                        <p className="text-neutral-500 text-xs">Za mało treningów tej partii, żeby narysować wykres.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomNav screen="stats" onNavigate={onNavigate} />
    </div>
  );
}

function HistoryScreen({ history, plans, exercises, updatePlans, updateExercises, onNavigate, onOpenDetail, onDelete, onStartBackfill, onOpenReport, isPro, onOpenUnlock }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [planFilter, setPlanFilter] = useState("Wszystkie");
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState("kalendarz");
  const [reportRange, setReportRange] = useState("7");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [calSelectedRange, setCalSelectedRange] = useState(null);

  const planOptions = ["Wszystkie", "Bez planu", ...new Set(history.map((s) => s.planName).filter(Boolean))];

  const filtered = history.filter((s) => {
    const matchPlan =
      planFilter === "Wszystkie" || (planFilter === "Bez planu" ? !s.planName : s.planName === planFilter);
    const t = new Date(s.date).getTime();
    const matchFrom = !dateFrom || t >= new Date(dateFrom).getTime();
    const matchTo = !dateTo || t <= new Date(dateTo).getTime() + 86399999;
    return matchPlan && matchFrom && matchTo;
  });
  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

  const calFiltered = calSelectedRange
    ? history.filter((s) => {
        const key = toLocalDateStr(s.date);
        return key >= calSelectedRange.from && key <= calSelectedRange.to;
      })
    : [];
  const calSorted = [...calFiltered].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar
        title="HISTORIA"
        right={
          <button
            onClick={() => setBackfillOpen(true)}
            aria-label="Dodaj zaległy trening"
            className="w-9 h-9 flex-shrink-0 rounded-full bg-orange-500 active:bg-orange-600 text-neutral-950 flex items-center justify-center shadow-brand-glow"
          >
            <CalendarPlus size={18} strokeWidth={2.5} />
          </button>
        }
      />
      <div className="px-5 pt-3">
        {history.length > 0 && (
          <div className="flex gap-1 mb-3 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
            {[
              { key: "kalendarz", label: "Kalendarz" },
              { key: "lista", label: "Lista" },
              { key: "raporty", label: "Raporty" },
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

        {viewMode === "kalendarz" && history.length > 0 && (
          <div>
            <MonthCalendar
              history={history}
              month={calMonth}
              onShiftMonth={(dir) => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1))}
              selectedRange={calSelectedRange}
              onSelectRange={setCalSelectedRange}
            />
            {!calSelectedRange ? (
              <EmptyState icon={CalendarPlus} title="Zaznacz dzień lub zakres" subtitle="Stuknij dzień w kalendarzu, żeby zobaczyć treningi z tego okresu." />
            ) : calSorted.length === 0 ? (
              <EmptyState icon={HistoryIcon} title="Brak treningów" subtitle="W tym okresie nie zapisano żadnego treningu." />
            ) : (
              <div className="space-y-2">
                {calSorted.map((s) => (
                  <div key={s.id} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <button className="flex-1 text-left" onClick={() => onOpenDetail(s)}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-neutral-100 font-semibold flex items-start gap-1.5 min-w-0">
                          {isCardioSession(s) && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex-shrink-0 mt-0.5">CARDIO</span>
                          )}
                          <span className="break-words">{s.planName || "Trening bez planu"}</span>
                        </p>
                        <span className="text-neutral-500 text-xs flex-shrink-0">{fmtDateShort(s.date)}</span>
                      </div>
                      <p className="text-neutral-500 text-xs mt-1">
                        {isCardioSession(s)
                          ? cardioSessionSummary(s) || fmtDuration(s.durationSec)
                          : `${s.exercisesCount} ${plWord(s.exercisesCount, "ćwiczenie", "ćwiczenia", "ćwiczeń")} · ${s.totalSets} ${plWord(s.totalSets, "seria", "serie", "serii")} · ${Math.round(sessionVolume(s))} kg objętości · ${fmtDuration(s.durationSec)}`}
                      </p>
                    </button>
                    <button onClick={() => setConfirmDelete(s)} className="p-2 text-neutral-600 active:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === "raporty" && !isPro && (
          <div className="flex flex-col items-center text-center py-8 px-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            <TrendingUp size={26} className="text-orange-400 mb-2" />
            <p className="text-neutral-200 font-semibold text-sm">Raporty treningowe to funkcja NEXTREP PRO</p>
            <p className="text-neutral-500 text-xs mt-1 mb-4">Odblokuj, żeby przeglądać pełną historię analiz.</p>
            <button onClick={onOpenUnlock} className="bg-orange-500 text-neutral-950 font-bold text-sm px-5 py-2.5 rounded-xl">
              Poznaj NEXTREP PRO
            </button>
          </div>
        )}

        {viewMode === "raporty" && isPro && (
          <div>
            <div className="flex gap-1 mb-3 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
              {[
                { key: "7", label: "7 dni" },
                { key: "30", label: "30 dni" },
                { key: "all", label: "Wszystkie" },
              ].map((r) => (
                <button
                  key={r.key}
                  onClick={() => setReportRange(r.key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${reportRange === r.key ? "bg-orange-500 text-neutral-950" : "text-neutral-400"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {(() => {
              const cutoff = reportRange === "all" ? null : Date.now() - Number(reportRange) * 86400000;
              const reportSessions = [...history]
                .filter((s) => !cutoff || new Date(s.date).getTime() >= cutoff)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
              if (reportSessions.length === 0) {
                return <EmptyState icon={TrendingUp} title="Brak raportów" subtitle="W tym okresie nie ma zapisanych treningów." />;
              }
              return (
                <div className="space-y-2">
                  {reportSessions.map((s) => {
                    const rep = generateTrainingReport(s, history, exercises);
                    const overallIcon = rep.counts.green >= rep.counts.red + rep.counts.stagnation ? "🟢" : rep.counts.red + rep.counts.stagnation > rep.counts.green ? "🔴" : "🟡";
                    return (
                      <button
                        key={s.id}
                        onClick={() => onOpenReport(s)}
                        className="w-full text-left bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-neutral-100 font-semibold">
                            {fmtDateShort(s.date)} — {s.planName || "Trening bez planu"}
                          </p>
                          <span className="text-xs flex-shrink-0">{overallIcon}</span>
                        </div>
                        <p className="text-neutral-500 text-xs mt-1">
                          {s.totalSets} {plWord(s.totalSets, "seria", "serie", "serii")} · {s.totalReps} powt. · {Math.round(sessionVolume(s))} kg objętości
                        </p>
                        <p className="text-neutral-400 text-xs mt-1.5 leading-snug">{rep.narrative}</p>
                        <span className="text-orange-400 text-xs font-semibold mt-1.5 inline-flex items-center gap-1">
                          Zobacz raport <ChevronRight size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {viewMode === "lista" && history.length > 0 && (
          <div className="mb-3 space-y-2">
            <FilterTrigger label="Plan" value={planFilter} onClick={() => setPlanSheetOpen(true)} />
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-300 text-xs"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-300 text-xs"
              />
              {(dateFrom || dateTo || planFilter !== "Wszystkie") && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setPlanFilter("Wszystkie");
                  }}
                  className="px-2.5 text-neutral-500 text-xs font-semibold"
                >
                  Wyczyść
                </button>
              )}
            </div>
          </div>
        )}

        {viewMode === "lista" && (
          <div className="space-y-2">
            {sorted.length === 0 && (
              <EmptyState
                icon={HistoryIcon}
                title="Brak treningów"
                subtitle={history.length === 0 ? "Ukończone sesje pojawią się tutaj." : "Żaden trening nie pasuje do wybranych filtrów."}
              />
            )}
            {sorted.map((s) => (
              <div key={s.id} className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <button className="flex-1 text-left" onClick={() => onOpenDetail(s)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-neutral-100 font-semibold flex items-start gap-1.5 min-w-0">
                      {isCardioSession(s) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex-shrink-0 mt-0.5">CARDIO</span>
                      )}
                      <span className="break-words">{s.planName || "Trening bez planu"}</span>
                    </p>
                    <span className="text-neutral-500 text-xs flex-shrink-0">{fmtDateShort(s.date)}</span>
                  </div>
                  <p className="text-neutral-500 text-xs mt-1">
                    {isCardioSession(s)
                      ? cardioSessionSummary(s) || fmtDuration(s.durationSec)
                      : `${s.exercisesCount} ${plWord(s.exercisesCount, "ćwiczenie", "ćwiczenia", "ćwiczeń")} · ${s.totalSets} ${plWord(s.totalSets, "seria", "serie", "serii")} · ${Math.round(sessionVolume(s))} kg objętości · ${fmtDuration(s.durationSec)}`}
                  </p>
                </button>
                <button onClick={() => setConfirmDelete(s)} className="p-2 text-neutral-600 active:text-red-500">
                  <Trash2 size={16} />
              </button>
            </div>
          ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="USUNĄĆ TRENING?"
          message={`Trening z dnia ${fmtDate(confirmDelete.date)} zostanie trwale usunięty z historii.`}
          confirmLabel="Usuń"
          danger
          onConfirm={() => {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {planSheetOpen && (
        <FilterPickerSheet
          title="Plan"
          options={planOptions}
          includeAll={false}
          selected={planFilter}
          onSelect={setPlanFilter}
          onClose={() => setPlanSheetOpen(false)}
        />
      )}

      {backfillOpen && (
        <BackfillModal
          initialDate={calSelectedRange && calSelectedRange.from === calSelectedRange.to ? calSelectedRange.from : null}
          plans={plans}
          exercises={exercises}
          updatePlans={updatePlans}
          updateExercises={updateExercises}
          isPro={isPro}
          onOpenUnlock={onOpenUnlock}
          onCreate={(meta) => {
            setBackfillOpen(false);
            onStartBackfill(meta);
          }}
          onClose={() => setBackfillOpen(false)}
        />
      )}

      <BottomNav screen="history" onNavigate={onNavigate} />
    </div>
  );
}

// Date entry that doesn't depend on the platform's date picker opening: the date can always be
// TYPED as dd.mm.rrrr (numeric keyboard, dots inserted automatically), and the calendar button
// opens the native picker when the platform offers one (showPicker). Value in/out stays
// "YYYY-MM-DD", so the data flow around it is unchanged; a date after `max` is never accepted.
// Date of an edited, already finished workout (stays an ISO string in session.date):
//   same day as before  → the original timestamp, untouched (an edit never shifts the time);
//   another day          → that day at the workout's original LOCAL time of day.
function editedSessionDateIso(originalIso, editDate) {
  if (!editDate || !/^\d{4}-\d{2}-\d{2}$/.test(editDate)) return originalIso;
  const orig = new Date(originalIso);
  if (Number.isNaN(orig.getTime())) return new Date(`${editDate}T12:00:00`).toISOString();
  if (toLocalDateStr(orig) === editDate) return originalIso;
  const [y, m, d] = editDate.split("-").map(Number);
  return new Date(y, m - 1, d, orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds()).toISOString();
}

function DateField({ value, onChange, max, inputClassName = "", wrapperClassName = "", testId, ariaLabel = "Data treningu" }) {
  const toText = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}` : "");
  const [text, setText] = useState(() => toText(value));
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef(null);
  useEffect(() => {
    setText(toText(value));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parse = (t) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((t || "").trim());
    if (!m) return null;
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (max && iso > max) return null;
    return iso;
  };
  const onType = (raw) => {
    let digits = raw.replace(/\D/g, "");
    // backspace over an auto-inserted dot removes the digit before it as well
    if (raw.length < text.length && text.endsWith(".") && raw === text.slice(0, -1)) digits = digits.slice(0, -1);
    digits = digits.slice(0, 8);
    const t = digits.length > 4 ? `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}.${digits.slice(2)}` : digits;
    setText(t);
    if (digits.length === 8) {
      const iso = parse(t);
      setInvalid(!iso);
      if (iso && iso !== value) onChange(iso);
    } else setInvalid(false);
  };
  const onBlur = () => {
    if (!parse(text)) {
      setText(toText(value));
      setInvalid(false);
    }
  };
  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {}
    try {
      el.focus();
      el.click();
    } catch {}
  };
  return (
    <div className={`relative flex items-center gap-1.5 min-w-0 ${wrapperClassName}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd.mm.rrrr"
        maxLength={10}
        value={text}
        onChange={(e) => onType(e.target.value)}
        onBlur={onBlur}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        data-testid={testId}
        className={`${inputClassName} tabular-nums ${invalid ? "border-red-500" : ""}`}
      />
      <button type="button" onClick={openPicker} aria-label="Wybierz datę z kalendarza" data-testid={testId ? `${testId}-picker` : undefined} className="flex-shrink-0 p-2 -m-1 text-orange-400 active:text-orange-300">
        <CalendarDays size={18} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value || ""}
        max={max}
        onChange={(e) => {
          if (e.target.value && (!max || e.target.value <= max)) onChange(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
    </div>
  );
}

function BackfillModal({ plans, exercises, updatePlans, updateExercises, isPro, onOpenUnlock, onCreate, onClose, initialDate = null }) {
  // A day picked in the History calendar becomes the default; otherwise today, as before.
  const [date, setDate] = useState(() => {
    const today = toLocalDateStr(new Date());
    return initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && initialDate <= today ? initialDate : today;
  });
  const [durationMin, setDurationMin] = useState(45);
  const [planId, setPlanId] = useState("");
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [planSource, setPlanSource] = useState("own"); // 'own' | 'ready'
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  // A ready-plan day chosen for this back-filled workout — used, never saved as a user plan.
  const [readyPick, setReadyPick] = useState(null); // null | { day, newExercises }
  const [dayPick, setDayPick] = useState(null); // multi-day ready plan: { templateKey, levelId, baseName, days, newExercises }

  const selectedPlan = readyPick ? readyPick.day : plans.find((p) => p.id === planId) || null;

  const pickReadyDay = (day, newExercises) => {
    setPlanId("");
    setReadyPick({ day, newExercises: newExercises || [] });
    setDayPick(null);
    setPlanSheetOpen(false);
  };
  const useTemplateLevel = (template, level) => {
    if (template.tier === "premium" && !isPro) {
      onOpenUnlock();
      return;
    }
    const ready = buildReadyPlanDays(template, level, exercises);
    if (ready.days.length === 1) {
      pickReadyDay(ready.days[0], ready.newExercises);
      return;
    }
    setDayPick({ templateKey: template.key, levelId: level.id, ...ready });
  };

  const create = () => {
    // Saving the workout ≠ saving the plan: only the ready plan's missing exercises are added
    // (history needs real exerciseIds); the ready plan itself is never copied to "Moje plany".
    if (readyPick && readyPick.newExercises.length) updateExercises((prev) => mergeNewExercises(prev, readyPick.newExercises));
    onCreate({ date, durationMin: Number(durationMin) || 0, plan: selectedPlan });
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
        <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-1">ZALEGŁY TRENING</h2>
        <p className="text-neutral-500 text-xs mb-4">Uzupełnij dane treningu, który już się odbył.</p>

        <label className="text-neutral-500 text-xs uppercase font-semibold">Data treningu</label>
        <DateField
          value={date}
          onChange={setDate}
          max={toLocalDateStr(new Date())}
          testId="backfill-modal-date"
          wrapperClassName="mt-1 mb-4"
          inputClassName="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <label className="text-neutral-500 text-xs uppercase font-semibold">Szacowany czas (min)</label>
        <input
          type="number"
          min={0}
          value={durationMin}
          onChange={(e) => setDurationMin(e.target.value)}
          className="w-full mt-1 mb-4 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <label className="text-neutral-500 text-xs uppercase font-semibold">Plan (opcjonalnie)</label>
        <FilterTrigger
          label="Plan"
          value={selectedPlan ? selectedPlan.name : "Bez planu"}
          onClick={() => setPlanSheetOpen(true)}
        />

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
            Anuluj
          </button>
          <button onClick={create} className="flex-1 py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold">
            Rozpocznij wpisywanie
          </button>
        </div>
      </div>

      {planSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setPlanSheetOpen(false)}>
          <div
            className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 overflow-y-auto no-scrollbar"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
            <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-4">Wybierz plan</h2>

            <div className="flex gap-1 mb-4 bg-neutral-950 border border-neutral-800 rounded-xl p-1">
              <button
                onClick={() => setPlanSource("own")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${planSource === "own" ? "bg-orange-500 text-neutral-950" : "text-neutral-400"}`}
              >
                Moje plany
              </button>
              <button
                onClick={() => setPlanSource("ready")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${planSource === "ready" ? "bg-orange-500 text-neutral-950" : "text-neutral-400"}`}
              >
                Gotowe plany
              </button>
            </div>

            {planSource === "own" ? (
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setReadyPick(null);
                    setPlanId("");
                    setPlanSheetOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${
                    planId === "" ? "bg-orange-500 border-orange-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-300"
                  }`}
                >
                  Bez planu
                </button>
                {plans.length === 0 && <p className="text-neutral-500 text-xs px-1">Nie masz jeszcze własnych planów.</p>}
                {plans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setReadyPick(null);
                      setPlanId(p.id);
                      setPlanSheetOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${
                      planId === p.id ? "bg-orange-500 border-orange-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-300"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {READY_PLAN_TEMPLATES.map((t) => {
                  const isExpanded = !t.comingSoon && expandedTemplate === t.key; // I2: „Wkrótce” never expands
                  const isPremiumTier = t.tier === "premium";
                  return (
                    <div key={t.key} className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
                      <button onClick={() => !t.comingSoon && setExpandedTemplate(isExpanded ? null : t.key)} disabled={!!t.comingSoon} className={`w-full p-3 flex items-start gap-3 text-left${t.comingSoon ? " opacity-60" : ""}`}>
                        <PlanThumbnail variant="ready" size={44} planKey={t.key} />
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
                        </div>
                        {!t.comingSoon && <ChevronDown size={16} className={`text-neutral-600 flex-shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-1.5">
                          {dayPick && dayPick.templateKey === t.key && (
                            <div className="bg-neutral-900 border border-orange-500/40 rounded-lg p-2.5 space-y-1.5">
                              <p className="text-neutral-400 text-xs font-semibold uppercase">Wybierz dzień — {dayPick.baseName}</p>
                              {dayPick.days.map((d, i) => (
                                <button
                                  key={d.id}
                                  onClick={() => pickReadyDay(d, dayPick.newExercises)}
                                  className="w-full text-left bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-100 text-sm font-medium active:border-orange-500"
                                >
                                  {readyDayLabel(dayPick.baseName, d, i)}
                                </button>
                              ))}
                            </div>
                          )}
                          {t.levels.map((lvl) => (
                            <button
                              key={lvl.id}
                              onClick={() => useTemplateLevel(t, lvl)}
                              className="w-full flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-left"
                            >
                              <PlanThumbnail variant="ready" tier={levelTier(lvl.label)} size={32} planKey={t.key} />
                              <span className="text-neutral-200 text-sm font-medium flex-1">{lvl.label}</span>
                              {isPremiumTier && !isPro ? <Lock size={14} className="text-neutral-600" /> : <ChevronRight size={15} className="text-neutral-600" />}
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
        </div>
      )}
    </div>
  );
}

function TrainingReport({ session, history, exercises, onBack }) {
  const report = generateTrainingReport(session, history, exercises);
  const { header, quickSummary, exerciseReports, narrative, achievements, motivational, nextSteps } = report;

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar title="RAPORT TRENINGOWY" onBack={onBack} />
      <div className="px-5 pt-3">
        <p className="font-display text-2xl text-neutral-50 tracking-wide">{header.title}</p>
        <p className="text-neutral-500 text-sm mt-0.5">
          {fmtDate(header.date)}, {new Date(header.date).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} · {fmtDuration(header.durationSec)}
        </p>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Stat label="Ćwicz." value={quickSummary.exercisesCount} wide />
          <Stat label="Serie" value={quickSummary.totalSets} wide />
          <Stat label="Powt." value={quickSummary.totalReps} wide />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Stat label="Objętość" value={`${Math.round(quickSummary.volume)} kg`} wide />
          <Stat label="Suma ciężarów" value={`${Math.round(quickSummary.totalWeight)} kg`} wide />
        </div>
        {quickSummary.dropsetCount > 0 && (
          <p className="text-neutral-500 text-xs mt-2 flex items-center gap-1.5">
            <Layers size={12} /> {quickSummary.dropsetCount} {plWord(quickSummary.dropsetCount, "dropset", "dropsety", "dropsetów")} w tym treningu
          </p>
        )}

        <WorkoutAnalysisCard session={session} history={history} />

        <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Jak poszedł trening?</p>
          <p className="text-neutral-200 text-sm leading-relaxed">{narrative}</p>
          {motivational && <p className="text-neutral-400 text-sm leading-relaxed mt-2">{motivational}</p>}
        </div>

        {achievements.length > 0 && (
          <div className="mt-4 bg-lime-500/10 border border-lime-500/30 rounded-xl p-4">
            <p className="text-lime-400 text-xs uppercase font-semibold mb-2">🏆 Najlepsze momenty treningu</p>
            <div className="space-y-1">
              {achievements.map((a, i) => (
                <p key={i} className="text-neutral-200 text-sm">
                  {a}
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="text-neutral-500 text-xs uppercase font-semibold mt-5 mb-2">Analiza ćwiczeń</p>
        <div className="space-y-3">
          {exerciseReports.map((r, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-neutral-100 font-semibold break-words">{r.name}</p>
                {(r.status || r.baseline) && (
                  <span
                    className={`text-xs font-semibold text-right max-w-[55%] flex items-center gap-1 ${
                      { green: "text-lime-400", yellow: "text-yellow-400", red: "text-red-400", stagnation: "text-orange-400" }[r.status] || "text-neutral-400"
                    }`}
                  >
                    {STATUS_META[r.status || "baseline"]?.icon} {STATUS_META[r.status || "baseline"]?.label}
                  </span>
                )}
              </div>

              {r.priorSets.length > 0 && (
                <div className="mt-2">
                  <p className="text-neutral-600 text-xs uppercase font-semibold mb-1">Poprzednio</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.priorSets.map((s, j) => (
                      <span key={j} className="text-xs bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-400 font-display tracking-wide">
                        {formatReportSet(s, r.kind)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2">
                <p className="text-neutral-600 text-xs uppercase font-semibold mb-1">Dzisiaj</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.todaySets.map((s, j) => (
                    <span
                      key={j}
                      className={`text-xs rounded-lg px-2 py-1 font-display tracking-wide border ${
                        s.setType === "dropset" ? "bg-orange-500/10 border-orange-500/30 text-orange-300" : "bg-neutral-950 border-neutral-800 text-neutral-200"
                      }`}
                    >
                      {formatReportSet(s, r.kind)}
                    </span>
                  ))}
                </div>
              </div>

              {r.achievement && <p className="text-lime-400 text-xs mt-2">🏆 {r.achievement}</p>}
              {session.exercises.find((e) => e.exerciseId === r.exerciseId) && (
                <ExerciseAnalysisPanel session={session} history={history} ex={session.exercises.find((e) => e.exerciseId === r.exerciseId)} />
              )}
              {r.notes.length > 0 && (
                <p className="text-neutral-500 text-xs mt-2 italic">„{r.notes.join(" / ")}”</p>
              )}
              {r.message && (
                <div className="mt-2 pt-2 border-t border-neutral-800">
                  <p className="text-neutral-600 text-xs uppercase font-semibold mb-0.5">Następnym razem</p>
                  <p className="text-neutral-300 text-sm leading-relaxed">➡️ {r.message}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {nextSteps.length > 0 && (
          <div className="mt-5 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <p className="text-orange-400 text-xs uppercase font-semibold mb-2">Twój następny krok</p>
            <div className="space-y-1.5">
              {nextSteps.map((n, i) => (
                <p key={i} className="text-neutral-200 text-sm leading-relaxed">
                  <span className="font-semibold">{n.name}:</span> {n.message}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Report: shared presentation components (post-workout summary, Historia, full report) ----
function ProAnalysisLock({
  onOpenUnlock,
  title = "Zobacz trend, nie tylko pojedynczy wynik",
  lines = ["PRO porówna ten trening z właściwym punktem odniesienia i pokaże, dokąd zmierza każde ćwiczenie."],
}) {
  return (
    <div className="mt-4 bg-neutral-900 border border-orange-500/30 rounded-xl p-4" data-testid="pro-lock">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-neutral-200 text-xs uppercase font-bold tracking-wide">{title}</p>
        <span className="flex items-center gap-1 text-[11px] font-bold text-neutral-950 bg-orange-500 rounded-full px-2 py-0.5">
          <Lock size={11} /> PRO
        </span>
      </div>
      <div className="mb-3">
        {lines.map((t, i) => (
          <p key={i} className={`text-neutral-400 text-sm leading-relaxed ${i ? "mt-1" : ""}`}>
            {t}
          </p>
        ))}
      </div>
      <button onClick={onOpenUnlock} className="w-full py-2.5 rounded-xl bg-orange-500 text-neutral-950 font-bold text-sm">
        Poznaj NEXTREP PRO
      </button>
    </div>
  );
}

// PRO — level 1: "Jak poszedł dzisiejszy trening?" vs analogous (default) or all workouts.
function WorkoutAnalysisCard({ session, history }) {
  const [mode, setMode] = useState("analogous");
  const points = workoutComparisonSeries(history, session, mode);
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const cur = points[points.length - 1];
  const change = prev ? pctChange(cur.volume, prev.volume) : null;
  const vsLabel = mode === "analogous" ? "vs poprzedni analogiczny trening" : "vs poprzedni trening (dowolny typ)";
  let summary;
  if (!prev) {
    summary =
      mode === "analogous"
        ? session.planId || session.planName
          ? "Brak wcześniejszych treningów tego samego typu — ten trening jest punktem odniesienia na kolejne."
          : "Trening bez planu nie ma analogicznych treningów. Zobacz porównanie ze wszystkimi treningami."
        : "Brak wcześniejszych treningów do porównania.";
  } else {
    const dir = change == null || Math.abs(change) <= 2 ? "same" : change > 0 ? "up" : "down";
    summary =
      mode === "analogous"
        ? `Dzisiejszy trening miał ${{ same: "podobną", up: "wyższą", down: "niższą" }[dir]} objętość niż poprzednie wykonanie tego samego typu treningu.`
        : `Objętość ${{ same: "podobna", up: "wyższa", down: "niższa" }[dir]} niż w poprzednim treningu — to porównanie z treningami różnego typu, nie z analogicznymi.`;
    if (points.length === 2) summary += " Dwa treningi to dopiero wstępne porównanie, nie trend.";
  }
  const countLabel = `${points.length} ${plWord(points.length, "trening", "treningi", "treningów")}`;
  return (
    <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-4" data-testid="workout-analysis">
      <div className="flex items-center justify-between mb-2">
        <p className="text-neutral-500 text-xs uppercase font-semibold">Analiza treningu</p>
        <span className="text-[10px] font-bold text-orange-400 border border-orange-500/40 rounded-full px-1.5 py-0.5">PRO</span>
      </div>
      <div className="flex gap-1 bg-neutral-950 border border-neutral-800 rounded-xl p-1 mb-3" role="tablist" aria-label="Grupa porównawcza">
        {[
          ["analogous", "Analogiczny trening"],
          ["all", "Wszystkie treningi"],
        ].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold ${mode === k ? "bg-orange-500 text-neutral-950" : "text-neutral-400"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-neutral-600 text-[11px] mb-1" data-testid="comparison-scope">
        {mode === "analogous"
          ? `Ten sam typ treningu${session.planName ? ` („${session.planName}”)` : ""} · ${countLabel}`
          : `Wszystkie treningi, niezależnie od typu · ${countLabel}`}
      </p>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-neutral-400 text-xs">Objętość</span>
        <span className="font-display text-xl text-neutral-50 tracking-wide">{Math.round(cur.volume).toLocaleString("pl-PL")} kg</span>
      </div>
      {points.length >= 2 && (
        <MiniChart
          data={points.map((p) => p.volume)}
          dates={points.map((p) => (p.isCurrent ? "Ten trening" : fmtDateShort(p.date)))}
          pointLabels={pointLabelsFor(points)}
          formatValue={(v) => `${Math.round(v).toLocaleString("pl-PL")} kg`}
          highlightLast
        />
      )}
      {change != null && (
        <p className={`text-sm font-semibold mt-2 ${change > 0 ? "text-green-400" : "text-neutral-300"}`}>
          {change > 0 ? "▲" : change < 0 ? "▼" : "■"} {fmtPct(change)} {vsLabel}
        </p>
      )}
      <p className="text-neutral-300 text-sm leading-relaxed mt-2">{summary}</p>
    </div>
  );
}

// PRO — level 2: "Jak rozwijało się to ćwiczenie?" — last ≤10 performances of this exerciseId.
function ExerciseAnalysisPanel({ session, history, ex }) {
  const [open, setOpen] = useState(false);
  if (!ex || ex.type === "cardio") return null;
  const points = exercisePerformanceSeries(history, session, ex);
  const cur = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const change = prev ? pctChange(cur.volume, prev.volume) : null;
  const analysis = open ? analyzeSessionExercise(history || [], session, ex) : null;
  const row = (label, today, before) => (
    <div className="flex items-center justify-between gap-2 text-xs py-1 border-b border-neutral-800/70 last:border-0">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-200 font-semibold text-right">
        {today}
        {before != null && <span className="text-neutral-600 font-normal"> (poprz. {before})</span>}
      </span>
    </div>
  );
  return (
    <div className="mt-2" data-testid="exercise-analysis">
      <p className={`text-xs font-semibold ${change == null ? "text-neutral-500" : change > 0 ? "text-green-400" : "text-neutral-400"}`}>
        {change == null
          ? "Pierwsze zapisane wykonanie — brak porównania"
          : `${change > 0 ? "▲" : change < 0 ? "▼" : "■"} ${fmtPct(change)} objętości vs poprzednie wykonanie`}
      </p>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full mt-2 flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-left"
      >
        <span className="text-orange-400 text-xs font-bold uppercase tracking-wide">{open ? "Zwiń analizę" : "Rozwiń analizę"}</span>
        <ChevronDown size={15} className={`text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <p className="text-neutral-500 text-[11px] uppercase font-semibold mb-1" data-testid="exercise-series-count">
            Objętość — {points.length === 1 ? "1 wykonanie" : `ostatnie ${points.length} ${plWord(points.length, "wykonanie", "wykonania", "wykonań")}`}
          </p>
          {points.length >= 2 ? (
            <MiniChart
              data={points.map((p) => p.volume)}
              dates={points.map((p) => (p.isCurrent ? "Ten trening" : fmtDateShort(p.date)))}
              pointLabels={pointLabelsFor(points)}
              formatValue={(v) => fmtVolume(v, ex.type)}
              highlightLast
            />
          ) : (
            <p className="text-neutral-500 text-xs mb-1">Za mało wykonań na wykres — to pierwszy punkt historii tego ćwiczenia.</p>
          )}
          <div className="mt-2">
            {row("Objętość", fmtVolume(cur.volume, ex.type), prev ? fmtVolume(prev.volume, ex.type) : null)}
            {change != null && row("Zmiana", fmtPct(change), null)}
            {cur.summary.workingLoad != null &&
              row("Ciężar roboczy", `${cur.summary.workingLoad} kg`, prev && prev.summary.workingLoad != null ? `${prev.summary.workingLoad} kg` : null)}
            {ex.type === "time"
              ? row("Czas", fmtDuration(cur.summary.seconds), prev ? fmtDuration(prev.summary.seconds) : null)
              : row("Powtórzenia", cur.summary.reps, prev ? prev.summary.reps : null)}
            {cur.summary.rir != null && row("RIR", cur.summary.rir, prev ? prev.summary.rir : null)}
            {row("Serie", cur.summary.setsCount, prev ? prev.summary.setsCount : null)}
          </div>
          {analysis?.analysisText && (
            <div className="mt-3">
              <p className="text-neutral-500 text-[11px] uppercase font-semibold mb-0.5">Analiza</p>
              <p className="text-neutral-200 text-xs font-semibold mb-0.5">
                {STATUS_META[analysis.baseline ? "baseline" : analysis.status]?.icon} {STATUS_META[analysis.baseline ? "baseline" : analysis.status]?.label}
              </p>
              <p className="text-neutral-300 text-xs leading-relaxed">{analysis.analysisText}</p>
            </div>
          )}
          {analysis?.recommendation && (
            <div className="mt-2">
              <p className="text-neutral-500 text-[11px] uppercase font-semibold mb-0.5">Zalecenie</p>
              <p className="text-neutral-200 text-xs leading-relaxed">➡️ {analysis.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Free per-exercise description: THIS workout only, judged against its plan — computed with NO
// history at all, so nothing historical can reach a Free report.
function currentExecutionLine(session, ex) {
  if (!ex || ex.type === "cardio") return null;
  const a = computeExerciseAnalysis({ sets: ex.sets || [], kind: ex.type, setsDetail: ex.setsDetail, history: [], date: session.date });
  return a?.currentLine || null;
}

function HistoryDetail({ session, exercises, history, onBack, onOpenExercise, onStartEdit, onOpenReport, isPro, onOpenUnlock }) {
  // "Objętość wg ćwiczeń": exerciseVolume from the volume access point (src/engine/volume.js);
  // until PE-A5 that is the canonical computeSessionVolume (same rules as the PRO analysis —
  // weight × reps, MW+ = external load × reps, time = seconds, bodyweight = reps). Units differ
  // by kind, so each bar is scaled against the largest value OF THE SAME UNIT.
  const volUnit = (type) => (type === "time" ? "time" : type === "bodyweight" ? "reps" : "kg");
  const volumeOf = (ex) => (ex.type === "cardio" ? 0 : exerciseVolume(ex.sets, ex.type));
  const maxVolumeByUnit = {};
  session.exercises.forEach((ex) => {
    const u = volUnit(ex.type);
    maxVolumeByUnit[u] = Math.max(maxVolumeByUnit[u] || 1, volumeOf(ex));
  });
  const report = isPro ? generateTrainingReport(session, history, exercises) : null;

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar
        title={session.planName || "Trening bez planu"}
        onBack={onBack}
        right={
          <button onClick={() => onStartEdit(session)} className="p-1 text-neutral-400 active:text-orange-500">
            <Pencil size={19} />
          </button>
        }
      />
      <div className="px-5 pt-3">
        {isPro && report && report.achievements.length > 0 && (
          <div className="mb-3 bg-lime-500/10 border border-lime-500/30 rounded-xl p-3">
            <p className="text-lime-400 text-sm font-bold mb-1">🔥 Świetna robota!</p>
            {report.achievements.map((a, i) => (
              <p key={i} className="text-neutral-200 text-sm leading-snug">
                {a}
              </p>
            ))}
          </div>
        )}

        <p className="text-neutral-500 text-sm">{fmtDate(session.date)}</p>

        <button
          onClick={() => onOpenReport(session)}
          className="w-full mt-3 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 font-semibold text-sm flex items-center justify-center gap-2"
        >
          <TrendingUp size={16} /> Zobacz pełny raport treningowy
        </button>

        <div className="grid grid-cols-4 gap-2 mt-3">
          <Stat label="Ćwicz." value={session.exercisesCount} />
          <Stat label="Serie" value={session.totalSets} />
          <Stat label="Powt." value={session.totalReps} />
          <Stat label="Czas" value={fmtDuration(session.durationSec)} small />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Stat label="Suma ciężarów" value={`${Math.round(session.totalWeight)} kg`} wide />
          <Stat label="Objętość" value={`${Math.round(sessionVolume(session))} kg`} wide />
        </div>

        {/* Gating: history, comparisons, charts and recommendations exist only in the PRO branch;
            Free renders the lock card and never computes any historical data. */}
        {isPro ? <WorkoutAnalysisCard session={session} history={history || []} /> : <ProAnalysisLock onOpenUnlock={onOpenUnlock} />}

        {session.exercises.length > 0 && (
          <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-neutral-500 text-xs uppercase font-semibold mb-3">Objętość wg ćwiczeń</p>
            <div className="space-y-2.5">
              {session.exercises.map((ex, i) => {
                const vol = volumeOf(ex);
                const pct = Math.max(4, Math.round((vol / (maxVolumeByUnit[volUnit(ex.type)] || 1)) * 100));
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-neutral-300 font-medium break-words">{ex.name}</span>
                      <span className="text-neutral-500 flex-shrink-0 ml-2">{fmtVolume(vol, ex.type)}</span>
                    </div>
                    <div className="h-2 bg-neutral-950 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {session.exercises.map((ex, i) => {
            const liveExercise = exercises.find((e) => e.id === ex.exerciseId);
            const vol = exerciseVolume(ex.sets, ex.type);
            const sum = summarizeExerciseSets(ex.sets, ex.type);
            // Free: only THIS workout's execution vs the plan (no history). PRO: + analysis panel.
            const currentLine = currentExecutionLine(session, ex);
            return (
              <div key={i} className="w-full text-left bg-neutral-900 border border-neutral-800 rounded-xl p-4" data-testid="report-exercise">
                <button
                  onClick={() => liveExercise && onOpenExercise(liveExercise)}
                  className="w-full flex items-center justify-between mb-1 text-left active:opacity-70"
                >
                  <p className="text-neutral-100 font-semibold flex items-center gap-1.5">
                    {ex.name}
                    {liveExercise && <ChevronRight size={15} className="text-neutral-600" />}
                  </p>
                  <KindBadge kind={ex.type} />
                </button>
                {ex.type !== "cardio" && (
                  <p className="text-neutral-400 text-xs mb-2">
                    {sum.setsCount} {plWord(sum.setsCount, "seria", "serie", "serii")}
                    {ex.type === "time" ? ` · ${fmtDuration(sum.seconds)}` : ` · ${sum.reps} powt.`}
                    {ex.type === "weight" || ex.type === "bodyweightPlus" ? ` · ${fmtVolume(vol, ex.type)}` : ""}
                  </p>
                )}
                {currentLine && (
                  <p className="text-neutral-400 text-xs leading-relaxed mb-2 flex items-start gap-1.5">
                    <span className="flex-shrink-0">ℹ️</span>
                    <span>{currentLine}</span>
                  </p>
                )}
                <div className="space-y-1.5">
                  {ex.sets.map((s, j) => {
                    const isDrop = s.setType === "dropset";
                    const upTo = ex.sets.slice(0, j + 1);
                    const normalCount = upTo.filter((x) => x.setType !== "dropset").length;
                    const dropCount = upTo.filter((x) => x.setType === "dropset").length;
                    const label = isDrop ? (dropCount > 1 ? `D${dropCount}` : "D") : String(normalCount);
                    return (
                      <div key={j} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-500">Seria {label}</span>
                          <span className="text-neutral-200 font-display text-lg tracking-wide">
                            {ex.type === "time"
                              ? `${s.duration}s`
                              : ex.type === "cardio"
                              ? [`${s.duration || 0}s`, s.speed ? `${s.speed}km/h` : null, s.incline ? `${s.incline}%` : null].filter(Boolean).join(" · ")
                              : ex.type === "sets"
                              ? s.weight != null
                                ? `${s.weight} kg`
                                : "Seria wykonana"
                              : ex.type === "bodyweight"
                              ? `${s.reps} powt.${formatRir(s.rir) ? ` · RIR ${formatRir(s.rir)}` : ""}`
                              : ex.type === "bodyweightPlus"
                              ? `MW+${s.weight || 0} kg × ${s.reps}${formatRir(s.rir) ? ` · RIR ${formatRir(s.rir)}` : ""}`
                              : `${s.weight} kg × ${s.reps}${formatRir(s.rir) ? ` · RIR ${formatRir(s.rir)}` : ""}`}
                          </span>
                        </div>
                        {s.note && <p className="text-neutral-500 text-xs mt-1 italic">„{s.note}”</p>}
                      </div>
                    );
                  })}
                </div>
                {isPro && <ExerciseAnalysisPanel session={session} history={history || []} ex={ex} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

