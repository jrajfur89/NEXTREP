// Sending real mail from a page with no backend isn't possible — this honestly opens the
// person's own mail app via a mailto: link, prefilled, rather than claiming a message was
// silently delivered when nothing was actually sent anywhere.
function FeedbackScreen({ onNavigate, userName }) {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);

  const canSend = subject.trim() && message.trim();

  const handleSend = () => {
    if (!canSend) return;
    const bodyLines = [message.trim(), "", email.trim() ? `Kontakt zwrotny: ${email.trim()}` : null].filter(Boolean);
    const mailto = `mailto:usenextrep@gmail.com?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
    window.location.href = mailto;
    setOpened(true);
  };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar title="ZGŁOŚ PROBLEM LUB SUGESTIĘ" onBack={() => onNavigate("more")} />
      <div className="px-5 pt-3">
        <p className="text-neutral-500 text-xs leading-relaxed mb-4">
          Napisz, co nie działa albo co warto poprawić. Otworzymy Twój program pocztowy z gotową wiadomością do{" "}
          <span className="text-neutral-300 font-medium">usenextrep@gmail.com</span> — dokończysz wysyłanie tam.
        </p>

        <label className="text-neutral-500 text-xs uppercase font-semibold">Twój e-mail (opcjonalnie)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="np. jan@example.com"
          className="w-full mt-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <label className="text-neutral-500 text-xs uppercase font-semibold">Temat</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="np. Błąd przy zapisywaniu treningu"
          className="w-full mt-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <label className="text-neutral-500 text-xs uppercase font-semibold">Wiadomość</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Opisz, co się stało albo co proponujesz..."
          rows={6}
          className="w-full mt-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500 resize-none"
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full py-3.5 rounded-2xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold flex items-center justify-center gap-2"
        >
          <MessageSquare size={18} /> Wyślij (otwórz e-mail)
        </button>

        {opened && (
          <p className="text-neutral-500 text-xs text-center mt-3">
            Otworzyliśmy Twój program pocztowy z gotową wiadomością — dokończ wysyłanie tam.
          </p>
        )}
      </div>
      <BottomNav screen="more" onNavigate={onNavigate} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Account / Supabase Auth screens                                         */
/*                                                                           */
/* An account here is authorization only — it never touches localStorage,  */
/* never syncs data, and is entirely optional. Every screen below checks   */
/* `supabase` (null until SUPABASE_URL/KEY are filled in above) and shows  */
/* a calm explanatory message instead of breaking when it's not configured.*/
/* ---------------------------------------------------------------------- */

// Step 8C.5 — Conflict Center: a screen (same pattern as every other onNavigate() screen in this
// app — no new routing/modal system) presenting nextrep_sync_conflicts_v1 for the user to
// resolve. Pure presentation over the existing engine: reads loadSyncConflicts(), calls
// resolveConflict()/scheduleSync() through performConflictResolution() — nothing else.
function ConflictCenterScreen({ onNavigate, exercises, isOnline }) {
  const [conflicts, setConflicts] = useState(() => loadSyncConflicts());
  const [selectedId, setSelectedId] = useState(null);
  const [pendingChoice, setPendingChoice] = useState(null); // "local" | "remote" while awaiting confirmation
  const [resolving, setResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);

  const exercisesById = useMemo(() => {
    const map = {};
    for (const ex of exercises || []) map[ex.id] = ex.name;
    return map;
  }, [exercises]);

  const refresh = () => setConflicts(loadSyncConflicts());
  const pendingList = conflicts.filter((c) => c.status === "pending");
  const selected = conflicts.find((c) => c.id === selectedId) || null;

  const openDetail = (id) => {
    setSelectedId(id);
    setPendingChoice(null);
    setErrorMsg(null);
    setResultMsg(null);
  };
  const closeDetail = () => {
    setSelectedId(null);
    setPendingChoice(null);
    setErrorMsg(null);
    setResultMsg(null);
  };

  const handleConfirm = async () => {
    if (!selected || !pendingChoice) return;
    setResolving(true);
    setErrorMsg(null);
    const result = await performConflictResolution(selected.id, pendingChoice, isOnline);
    setResolving(false);
    if (!result.success) {
      setErrorMsg("Nie udało się zapisać decyzji. Spróbuj ponownie.");
      return;
    }
    setPendingChoice(null);
    setResultMsg(
      isOnline
        ? "Decyzja zapisana. Synchronizacja w toku."
        : "Decyzja zapisana lokalnie. Zostanie zsynchronizowana po odzyskaniu połączenia."
    );
    refresh();
  };

  // ---------- Detail view ----------
  if (selected) {
    const table = selected.table;
    const localDeleted = selected.localRecord === null;
    const remoteDeleted = !!(selected.remoteRecord && selected.remoteRecord.deleted_at);
    const localFields = localDeleted ? [] : formatConflictSnapshot(table, selected.localRecord, "local", exercisesById);
    const remoteFields = remoteDeleted ? [] : formatConflictSnapshot(table, selected.remoteRecord, "remote", exercisesById);
    const diffLabels = getConflictFieldDiffs(table, selected, exercisesById);
    const isResolved = selected.status !== "pending";
    const choiceIsDelete = pendingChoice === "local" ? localDeleted : pendingChoice === "remote" ? remoteDeleted : false;
    const choiceIsRestore = pendingChoice === "remote" && localDeleted && !remoteDeleted;

    return (
      <div className="min-h-screen bg-app-depth pb-10">
        <FontStyles />
        <TopBar title="SZCZEGÓŁY KONFLIKTU" onBack={closeDetail} />
        <div className="px-5 pt-3">
          <h2 className="text-neutral-100 font-display text-xl mb-4">{getConflictDisplayName(selected, exercisesById)}</h2>

          {isResolved ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-neutral-100 font-semibold text-sm">Decyzja zapisana</p>
                <p className="text-neutral-500 text-xs mt-1">Oczekiwanie na synchronizację</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <p className="text-orange-400 text-xs font-bold uppercase tracking-wide mb-2">Twoja wersja</p>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                  {localDeleted ? (
                    <p className="text-neutral-400 text-sm">Ten rekord został usunięty.</p>
                  ) : localFields.length === 0 ? (
                    <p className="text-neutral-500 text-sm">Brak danych do pokazania.</p>
                  ) : (
                    <dl className="space-y-2">
                      {localFields.map((f) => (
                        <div key={f.label} className="flex justify-between gap-3 text-sm">
                          <dt className="text-neutral-500">{f.label}</dt>
                          <dd className={`text-right font-medium ${diffLabels.has(f.label) ? "text-orange-400" : "text-neutral-200"}`}>{String(f.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>

              <div className="mb-5">
                <p className="text-sky-400 text-xs font-bold uppercase tracking-wide mb-2">Wersja z chmury</p>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                  {remoteDeleted ? (
                    <p className="text-neutral-400 text-sm">Ten rekord został usunięty.</p>
                  ) : remoteFields.length === 0 ? (
                    <p className="text-neutral-500 text-sm">Brak danych do pokazania.</p>
                  ) : (
                    <dl className="space-y-2">
                      {remoteFields.map((f) => (
                        <div key={f.label} className="flex justify-between gap-3 text-sm">
                          <dt className="text-neutral-500">{f.label}</dt>
                          <dd className={`text-right font-medium ${diffLabels.has(f.label) ? "text-orange-400" : "text-neutral-200"}`}>{String(f.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>

              <p className="text-neutral-400 text-sm mb-3">Co chcesz zachować?</p>
              <div className="space-y-2">
                <button onClick={() => setPendingChoice("local")} className="w-full py-3.5 rounded-xl bg-orange-500 text-neutral-950 font-bold text-sm">
                  Zachowaj moją wersję
                </button>
                <button onClick={() => setPendingChoice("remote")} className="w-full py-3.5 rounded-xl bg-neutral-800 text-neutral-100 font-semibold text-sm">
                  Użyj wersji z chmury
                </button>
              </div>

              {errorMsg && <p className="text-red-400 text-xs mt-3">{errorMsg}</p>}
              {resultMsg && <p className="text-green-400 text-xs mt-3">{resultMsg}</p>}
            </>
          )}
        </div>

        {pendingChoice && (
          <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-6" onClick={() => !resolving && setPendingChoice(null)}>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <p className="text-neutral-100 font-semibold text-base mb-2">
                {pendingChoice === "local" ? "Zachować Twoją wersję?" : "Użyć wersji z chmury?"}
              </p>
              <p className="text-neutral-400 text-sm mb-1">
                {pendingChoice === "local"
                  ? "Wersja z chmury zostanie zastąpiona przy najbliższej synchronizacji."
                  : "Twoja lokalna wersja zostanie zastąpiona."}
              </p>
              {choiceIsDelete && <p className="text-red-400 text-sm mb-1">Ten rekord zostanie usunięty.</p>}
              {choiceIsRestore && <p className="text-sky-400 text-sm mb-1">Ta wersja przywróci rekord.</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setPendingChoice(null)} disabled={resolving} className="flex-1 py-3 rounded-xl bg-neutral-800 disabled:opacity-50 text-neutral-300 font-semibold text-sm">
                  Anuluj
                </button>
                <button onClick={handleConfirm} disabled={resolving} className="flex-1 py-3 rounded-xl bg-orange-500 disabled:opacity-50 text-neutral-950 font-bold text-sm">
                  {resolving ? "Zapisywanie…" : pendingChoice === "local" ? "Zachowaj moją wersję" : "Użyj wersji z chmury"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- List view ----------
  return (
    <div className="min-h-screen bg-app-depth pb-10">
      <FontStyles />
      <TopBar title="KONFLIKTY SYNCHRONIZACJI" onBack={() => onNavigate("account")} />
      <div className="px-5 pt-3">
        <p className="text-neutral-400 text-sm mb-5 leading-relaxed">
          Niektóre dane zostały zmienione na więcej niż jednym urządzeniu. Wybierz wersję, którą chcesz zachować.
        </p>
        {pendingList.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
            <p className="text-neutral-300 text-sm">Brak konfliktów wymagających decyzji.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingList.map((c) => (
              <div key={c.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                <p className="text-neutral-500 text-xs font-semibold uppercase tracking-wide mb-1">Konflikt danych</p>
                <p className="text-neutral-100 font-semibold text-base mb-1 truncate">{getConflictDisplayName(c, exercisesById)}</p>
                <p className="text-neutral-500 text-xs mb-3">Zmieniono na innym urządzeniu</p>
                <button onClick={() => openDetail(c.id)} className="w-full py-2.5 rounded-xl bg-neutral-800 text-neutral-100 font-semibold text-sm">
                  Zobacz szczegóły
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// Stage 4A.2 — full-screen account initialisation (shows NO app data while undecided).
// Stage 4A.4 F-5 (Etap 6): what the server says about the account's migration attempts, in words — and the
// only ways out of a lock: finish it on the owner device (onResumeOwn), close an attempt that the server
// counts ZERO writes for, or (two-step confirmation) consciously accept the incomplete cloud data. Time never
// changes anything: after 24 h without activity only the last activity is shown.
function migrationGateDescription(gate, now = Date.now()) {
  if (!gate) return null;
  if (!gate.ok) return { kind: "check_failed", text: MIGRATION_TEXTS.checkFailed };
  const b = gate.blocking;
  if (!b) return null;
  const last = migrationLastActivity(b);
  const lastText = last ? `Ostatnia aktywność przenoszenia: ${fmtDMYHM(last)}.` : null;
  const inactive = migrationInactiveLong(b, now);
  const text = b.status === "abandoned" ? MIGRATION_TEXTS.abandoned : gate.own ? MIGRATION_TEXTS.inProgressHere : MIGRATION_TEXTS.inProgressOther;
  return {
    kind: b.status === "abandoned" ? "abandoned" : gate.own ? "uploading_here" : "uploading_other",
    text,
    lastText,
    inactiveText: inactive
      ? "Od ponad 24 godzin nie było żadnej aktywności tego przenoszenia. Jego stan nie zmienia się sam — dokończ je na urządzeniu, które je rozpoczęło, albo świadomie przyjmij niekompletne dane."
      : null,
    canCancel: Number(b.writes_count) === 0 && (b.status === "abandoned" || gate.own),
    row: b,
  };
}
function MigrationLockPanel({ userId, gate, onChanged, onResumeOwn, testPrefix = "mig" }) {
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const d = migrationGateDescription(gate);
  if (!d) return null;
  const recheck = async () => {
    setBusy(true);
    setError(null);
    const g = await readMigrationGate(userId);
    setBusy(false);
    setConfirmAccept(false);
    if (onChanged) onChanged(g);
  };
  const act = async (fn) => {
    setBusy(true);
    setError(null);
    let deviceId = null;
    try {
      deviceId = getOrCreateDeviceId();
    } catch {}
    const row = d.row;
    const r = deviceId ? await fn({ attemptId: row.attempt_id, deviceId }) : { ok: false, error: MIGRATION_TEXTS.acceptFailed };
    if (r && r.row) noteMigrationAttemptStatus(userId, row.attempt_id, r.row.status);
    const g = await readMigrationGate(userId);
    setBusy(false);
    setConfirmAccept(false);
    if (!r || !r.ok) setError((r && r.error) || (r && r.status ? "Serwer nie zgodził się na tę zmianę — stan przenoszenia zmienił się w międzyczasie. Sprawdź ponownie." : MIGRATION_TEXTS.acceptFailed));
    if (onChanged) onChanged(g);
  };
  const b = (label, onClick, primary, testid, disabled) => (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      data-testid={testid}
      className={`w-full py-2.5 rounded-xl font-semibold text-sm mt-2 disabled:opacity-50 ${primary ? "bg-orange-500 text-neutral-950" : "bg-neutral-800 text-neutral-100"}`}
    >
      {label}
    </button>
  );
  return (
    <div data-testid={`${testPrefix}-lock`} data-kind={d.kind}>
      <p className={`text-sm leading-relaxed ${d.kind === "check_failed" ? "text-red-400" : "text-amber-400"}`} data-testid={`${testPrefix}-lock-text`}>
        {d.text}
      </p>
      {d.lastText && <p className="text-neutral-400 text-xs mt-1" data-testid={`${testPrefix}-lock-last`}>{d.lastText}</p>}
      {d.inactiveText && <p className="text-neutral-400 text-xs mt-1" data-testid={`${testPrefix}-lock-inactive`}>{d.inactiveText}</p>}
      {d.kind !== "check_failed" && d.row && Number(d.row.writes_count) > 0 && (
        <p className="text-neutral-500 text-xs mt-1">Część danych tego przenoszenia jest już w chmurze — dane w chmurze mogą być niekompletne.</p>
      )}
      {d.kind === "uploading_other" && d.row && Number(d.row.writes_count) === 0 && (
        <p className="text-neutral-500 text-xs mt-1" data-testid={`${testPrefix}-lock-nothing-sent`}>
          Z tego przenoszenia nic jeszcze nie trafiło do chmury. Najlepiej dokończ je albo przerwij na urządzeniu, które je rozpoczęło — wtedy konto odblokuje się bez przyjmowania niekompletnych danych.
        </p>
      )}
      {onResumeOwn && gate.own && b("Dokończ przenoszenie", onResumeOwn, true, `${testPrefix}-lock-resume`)}
      {b("Sprawdź ponownie", recheck, !(onResumeOwn && gate.own) && d.kind === "check_failed", `${testPrefix}-lock-recheck`)}
      {d.kind !== "check_failed" && d.canCancel && b("Zamknij przenoszenie (nic nie zostało wysłane)", () => act(cancelEmptyMigrationAttempt), false, `${testPrefix}-lock-cancel`)}
      {d.kind !== "check_failed" && !d.canCancel && !confirmAccept && b("Przyjmij niekompletne dane w chmurze", () => setConfirmAccept(true), false, `${testPrefix}-lock-accept`)}
      {d.kind !== "check_failed" && !d.canCancel && confirmAccept && (
        <>
          <p className="text-red-400 text-xs mt-2 leading-relaxed" data-testid={`${testPrefix}-lock-accept-warning`}>
            Dane w chmurze tego konta mogą być NIEKOMPLETNE — przenoszenie nie zostało dokończone i nie zostanie już dokończone{d.kind === "uploading_other" ? " (urządzenie, które je prowadzi, przestanie wysyłać dane)" : ""}. Kolejne przenoszenie danych na to konto będzie zablokowane do czasu łączenia danych (kolejny etap). Nic nie zostanie usunięte.
          </p>
          {b("Tak, przyjmuję niekompletne dane", () => act(acceptIncompleteMigrationAttempt), false, `${testPrefix}-lock-accept-confirm`)}
          {b("Anuluj", () => setConfirmAccept(false), false, `${testPrefix}-lock-accept-cancel`)}
        </>
      )}
      {error && <p className="text-red-400 text-xs mt-2" data-testid={`${testPrefix}-lock-error`}>{error}</p>}
    </div>
  );
}
const ACCEPTED_INCOMPLETE_NOTE =
  "Dane w chmurze tego konta zostały świadomie przyjęte jako NIEKOMPLETNE (przenoszenie danych nie zostało dokończone). Nie są oznaczone jako pełne, a kolejne przenoszenie danych na to konto jest zablokowane do czasu łączenia danych (kolejny etap).";

function AccountInitScreen({ init, email, onChooseLocal, onChooseCloud, onChooseEmpty, onRetry, onWorkOffline, onBack, onConfirmCloud, deviceSnapshotStatus, onAbandonCloud, onRetryUpload, onAbandonUpload, onGuestMigrate, onGuestLater, onGuestAbandon, onGuestStartWithout, onGuestRelease, onGuestReleaseConfirm, userId, onGateChanged, onConfirmStep, onUploadAcceptIncomplete }) {
  // Stage 4A.3: "go back to the device data" is offered only when that restore can really happen.
  const deviceRestorePossible = deviceSnapshotStatus === "ok";
  const snapshotNote = deviceRestorePossible
    ? null
    : deviceSnapshotStatus === "no_snapshot"
    ? "Przed wczytaniem na urządzeniu nie było danych tego konta."
    : "Kopii danych z urządzenia nie da się już bezpiecznie przywrócić z tego miejsca.";
  const shell = (children) => (
    <div className="min-h-screen bg-app-depth font-body flex items-center justify-center px-6 py-10" data-testid="account-init">
      <FontStyles />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
  const btn = (label, onClick, primary, testid) => (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`w-full py-3 rounded-2xl font-bold text-sm mb-2 ${primary ? "bg-orange-500 text-neutral-950" : "bg-neutral-900 border border-neutral-800 text-neutral-100"}`}
    >
      {label}
    </button>
  );
  const errorLine = init.error ? (
    <p className="text-red-400 text-sm mt-3" data-testid="init-error">
      {init.error}
    </p>
  ) : null;
  if (init.status === "checking" || init.status === "loading_cloud" || init.status === "uploading" || init.status === "guest_migrating") {
    return shell(
      <div className="text-center">
        <p className="font-display text-2xl text-neutral-50 tracking-wide">NEXTREP</p>
        <p className="text-neutral-400 text-sm mt-2" data-testid="init-progress">
          {init.status === "checking"
            ? "Sprawdzanie danych konta…"
            : init.status === "loading_cloud"
            ? "Pobieranie danych z chmury…"
            : init.status === "guest_migrating"
            ? "Przenoszenie danych z trybu bez logowania na konto…"
            : "Wysyłanie danych z urządzenia do chmury…"}
        </p>
        {email && <p className="text-neutral-600 text-xs mt-1 break-all">{email}</p>}
      </div>
    );
  }
  if (init.status === "error_check") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">BRAK POŁĄCZENIA Z CHMURĄ</p>
        <p className="text-neutral-300 text-sm mb-1">Nie udało się sprawdzić danych w chmurze.</p>
        {init.local.hasData && <p className="text-neutral-400 text-sm mb-4">Twoje dane zapisane na tym urządzeniu są bezpieczne.</p>}
        {!init.local.hasData && <p className="text-neutral-400 text-sm mb-4">Możesz spróbować ponownie albo kontynuować bez danych z chmury.</p>}
        {btn("Spróbuj ponownie", onRetry, true, "init-retry")}
        {btn(init.local.hasData ? "Pracuj z danymi na urządzeniu" : "Kontynuuj bez danych z chmury", onWorkOffline, false, "init-offline")}
        <p className="text-neutral-600 text-xs mt-2">Synchronizacja tego konta ruszy dopiero po sprawdzeniu chmury.</p>
      </>
    );
  }
  if (init.status === "cloud_loaded") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">WCZYTANO DANE Z CHMURY</p>
        <p className="text-neutral-300 text-sm mb-2">Na tym urządzeniu jest teraz wersja danych z chmury.</p>
        {deviceRestorePossible ? (
          <p className="text-neutral-400 text-sm mb-4">Kopia Twoich wcześniejszych danych z urządzenia jest zachowana — możesz jeszcze do nich wrócić.</p>
        ) : (
          <p className="text-neutral-400 text-sm mb-4">{snapshotNote}</p>
        )}
        {btn("Zostań przy danych z chmury", onConfirmCloud, true, "init-confirm-cloud")}
        {deviceRestorePossible && btn("Wróć do danych z urządzenia", onChooseLocal, false, "init-local")}
        <p className="text-neutral-600 text-xs mt-2">Synchronizacja ruszy dopiero po Twoim wyborze.</p>
        {init.error && (
          <p className="text-red-400 text-sm mt-3" data-testid="init-error">
            {init.error}
          </p>
        )}
      </>
    );
  }
  // Stage 4A.3: a cloud load was interrupted (refresh / closed app). The data on the device may be
  // partial and is not used; the only ways out are a new load or going back to the state before it.
  if (init.status === "cloud_interrupted") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">WCZYTYWANIE Z CHMURY ZOSTAŁO PRZERWANE</p>
        <p className="text-neutral-300 text-sm mb-2">Dane na tym urządzeniu mogą być niekompletne, dlatego nie są używane.</p>
        {deviceRestorePossible ? (
          <p className="text-neutral-400 text-sm mb-4">Kopia Twoich danych sprzed wczytania jest zachowana.</p>
        ) : (
          <p className="text-neutral-400 text-sm mb-4">{snapshotNote}</p>
        )}
        {btn("Ponów wczytanie z chmury", onChooseCloud, true, "init-retry-cloud")}
        {deviceRestorePossible
          ? btn("Wróć do danych sprzed wczytania", onChooseLocal, false, "init-local")
          : btn("Wróć do wyboru źródła danych", onAbandonCloud, false, "init-abandon-cloud")}
        <p className="text-neutral-600 text-xs mt-2">Synchronizacja ruszy dopiero po Twoim wyborze.</p>
        {errorLine}
      </>
    );
  }
  // Stage 4A.4 F-5 (Etap 6): the account is locked by a migration attempt (this or another device) — say
  // why, show the last activity, and offer the only safe ways out.
  if (init.status === "migration_blocked") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2" data-testid="init-migration-blocked">PRZENOSZENIE DANYCH NA TO KONTO</p>
        <MigrationLockPanel userId={userId} gate={init.gate} onChanged={onGateChanged} testPrefix="init" />
        {init.gate && init.gate.ok && !init.gate.blocking && <p className="text-neutral-300 text-sm">Przenoszenie danych zostało zakończone — sprawdź ponownie dane konta.</p>}
        {btn("Sprawdź dane konta ponownie", onRetry, false, "init-retry")}
        {btn(init.local && init.local.hasData ? "Pracuj z danymi na urządzeniu" : "Kontynuuj bez danych z chmury", onWorkOffline, false, "init-offline")}
        <p className="text-neutral-600 text-xs mt-2">Synchronizacja tego konta ruszy dopiero po rozstrzygnięciu przenoszenia i sprawdzeniu chmury.</p>
        {errorLine}
      </>
    );
  }
  // F-5: an interrupted device upload whose rows are partly in the cloud — finish it or consciously accept.
  if (init.status === "upload_partial") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2" data-testid="init-upload-partial">CZĘŚĆ DANYCH JEST JUŻ W CHMURZE</p>
        <p className="text-neutral-300 text-sm mb-2">{MIGRATION_TEXTS.partialDevice}</p>
        {btn("Dokończ wysyłanie", onRetryUpload, true, "init-retry-upload")}
        {!init.confirmAccept && btn("Przyjmij niekompletne dane w chmurze", () => onConfirmStep({ confirmAccept: true }), false, "init-upload-accept")}
        {init.confirmAccept && (
          <>
            <p className="text-red-400 text-sm mb-2" data-testid="init-upload-accept-warning">
              Dane w chmurze tego konta pozostaną NIEKOMPLETNE i nie zostaną już uzupełnione przenoszeniem (kolejne przenoszenie będzie zablokowane do czasu łączenia danych — kolejny etap). Synchronizacja zostanie wznowiona; dane z tego urządzenia, które nie trafiły do chmury, zostaną na nim. Nic nie zostanie usunięte.
            </p>
            {btn("Tak, przyjmuję niekompletne dane", onUploadAcceptIncomplete, false, "init-upload-accept-confirm")}
            {btn("Anuluj", () => onConfirmStep({ confirmAccept: false }), false, "init-upload-accept-cancel")}
          </>
        )}
        {btn("Pracuj z danymi na urządzeniu", onWorkOffline, false, "init-offline")}
        {errorLine}
      </>
    );
  }
  // F-5: this device's attempt was closed on another device (accepted as incomplete there) — it stopped sending.
  if (init.status === "migration_closed") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2" data-testid="init-migration-closed">PRZENOSZENIE ZOSTAŁO ZAMKNIĘTE</p>
        <p className="text-neutral-300 text-sm mb-4" data-testid="init-migration-closed-text">{init.error || MIGRATION_TEXTS.closedElsewhere}</p>
        {btn("Wróć do wyboru źródła danych", init.flow === "guest" ? onGuestAbandon : onAbandonUpload, true, "init-closed-back")}
      </>
    );
  }
  if (init.status === "error_upload" || init.status === "upload_interrupted") {
    const interrupted = init.status === "upload_interrupted";
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">{interrupted ? "WYSYŁANIE DANYCH ZOSTAŁO PRZERWANE" : "NIE UDAŁO SIĘ WYSŁAĆ DANYCH"}</p>
        <p className="text-neutral-300 text-sm mb-1">
          {interrupted ? "Wysyłanie danych z urządzenia do chmury nie zostało dokończone — część danych mogła już trafić do chmury." : "Wysyłanie danych z urządzenia do chmury nie powiodło się."}
        </p>
        <p className="text-neutral-400 text-sm mb-4">Dane na tym urządzeniu nie zostały zmienione. Synchronizacja pozostaje wyłączona.</p>
        {btn(interrupted ? "Ponów wysyłanie" : "Spróbuj ponownie", onRetryUpload, true, "init-retry-upload")}
        {btn("Wróć do wyboru źródła danych", onAbandonUpload, false, "init-abandon-upload")}
        {errorLine}
      </>
    );
  }
  // Stage 4A.4: an empty account and guest data on this device — offer to move it (nothing happens without a tap).
  if (init.status === "guest_offer") {
    const g = init.guest || {};
    const parts = [];
    if (g.history) parts.push(`${g.history} ${plWord(g.history, "trening", "treningi", "treningów")}`);
    if (g.plans) parts.push(`${g.plans} ${plWord(g.plans, "plan", "plany", "planów")}`);
    if (g.measurements) parts.push(`${g.measurements} ${plWord(g.measurements, "pomiar", "pomiary", "pomiarów")}`);
    if (g.customExercises) parts.push(`${g.customExercises} ${plWord(g.customExercises, "własne ćwiczenie", "własne ćwiczenia", "własnych ćwiczeń")}`);
    if (g.customFields) parts.push(`${g.customFields} ${plWord(g.customFields, "własny parametr pomiarów", "własne parametry pomiarów", "własnych parametrów pomiarów")}`);
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">DANE Z TRYBU BEZ LOGOWANIA</p>
        {init.incompleteAccepted ? (
          <p className="text-amber-400 text-sm mb-2" data-testid="init-guest-incomplete">
            {ACCEPTED_INCOMPLETE_NOTE} Dlatego danych z trybu bez logowania nie można teraz przenieść na to konto — zostaną na tym urządzeniu bez zmian.
          </p>
        ) : (
          <p className="text-neutral-300 text-sm mb-2">To konto jest jeszcze puste. Na tym urządzeniu są dane zapisane w trybie bez logowania — możesz przenieść je na to konto.</p>
        )}
        {parts.length > 0 && <p className="text-neutral-500 text-xs mb-2" data-testid="init-guest-summary">W trybie bez logowania: {parts.join(", ")}</p>}
        {!init.incompleteAccepted && <p className="text-neutral-500 text-xs mb-3">Przed przeniesieniem zostanie zapisana kopia zapasowa tych danych.</p>}
        {init.guestDraft && <p className="text-neutral-400 text-xs mb-3" data-testid="init-guest-draft-note">Niedokończony trening nie zostanie przeniesiony — pozostanie w trybie bez logowania.</p>}
        {init.guestDamaged && (
          <p className="text-red-400 text-sm mb-3" data-testid="init-guest-damaged">
            Przenoszenie danych zostało zatrzymane, bo część danych w trybie bez logowania jest uszkodzona ({init.guestDamaged}). Nic nie zostało przeniesione ani wysłane, a dane na tym urządzeniu pozostają bez zmian (także uszkodzone — do późniejszej diagnozy).
          </p>
        )}
        {init.migrationBlocked && !init.guestDamaged && !init.incompleteAccepted && (
          <p className="text-amber-400 text-sm mb-3" data-testid="init-guest-blocked">
            Na tym koncie są już zmiany (np. edytowane ćwiczenia wbudowane, niewysłane zmiany albo dane z przerwanego przenoszenia), więc danych z trybu bez logowania nie można teraz bezpiecznie przenieść — łączenie danych to osobny, kolejny etap. Konto może zacząć bez nich; dane z trybu bez logowania zostaną na tym urządzeniu bez zmian.
          </p>
        )}
        {!init.migrationBlocked && btn("Przenieś dane na konto", onGuestMigrate, true, "init-guest-migrate")}
        {btn("Nie teraz", onGuestLater, !!init.migrationBlocked, "init-guest-later")}
        <p className="text-neutral-600 text-xs mt-2">
          {init.incompleteAccepted
            ? "„Nie teraz” — konto będzie używać danych z chmury (oznaczonych jako niekompletne), a dane z trybu bez logowania zostaną na tym urządzeniu bez zmian."
            : "„Nie teraz” — konto zacznie od pustych danych, a dane z trybu bez logowania zostaną na tym urządzeniu bez zmian."}
        </p>
        {errorLine}
      </>
    );
  }
  // Stage 4A.4 Part 2 (F-4): the guest data is bound to a transfer of ANOTHER account (or the marker cannot be
  // verified). Nothing is moved automatically; unbinding is an explicit, confirmed decision.
  if (init.status === "guest_bound_other") {
    const b = init.binding || {};
    const why = b.unverifiable
      ? "Nie da się ustalić, do którego konta były ostatnio przenoszone dane z trybu bez logowania."
      : b.status === "completed"
      ? "Dane z trybu bez logowania zostały już przeniesione na inne konto."
      : b.status === "abandoned_partial"
      ? "Dane z trybu bez logowania były przenoszone na inne konto — przenoszenie przerwano, część danych mogła tam trafić."
      : "Dane z trybu bez logowania są w trakcie przenoszenia na inne konto (przenoszenie nie zostało dokończone).";
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2" data-testid="init-guest-bound">DANE PRZYPISANE DO INNEGO KONTA</p>
        <p className="text-neutral-300 text-sm mb-2">{why}</p>
        <p className="text-neutral-400 text-sm mb-4">Dlatego nie zostaną automatycznie przeniesione na to konto. Dane w trybie bez logowania pozostają bez zmian.</p>
        {btn("Nie teraz", onGuestLater, true, "init-guest-later")}
        {!init.confirmRelease && btn("Odłącz dane od tamtego konta", onGuestRelease, false, "init-guest-release")}
        {init.confirmRelease && (
          <>
            <p className="text-amber-400 text-sm mb-2" data-testid="init-guest-release-warning">
              Po odłączeniu te same dane będzie można przenieść na to konto. Jeśli tamto konto już je ma (całe lub część), będą na obu kontach. Tamto przenoszenie nie będzie mogło zostać dokończone.
            </p>
            {btn("Tak, odłącz dane", onGuestReleaseConfirm, false, "init-guest-release-confirm")}
          </>
        )}
        {errorLine}
      </>
    );
  }
  // Stage 4A.4 Part 2 (F-5): the transfer reached the cloud partly — it is never shown as normal account data.
  if (init.status === "guest_partial") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2" data-testid="init-guest-partial">CZĘŚĆ DANYCH JEST JUŻ W CHMURZE</p>
        <p className="text-neutral-300 text-sm mb-2">
          {init.partialUnknown
            ? "Nie udało się sprawdzić, czy część przenoszonych danych trafiła już do chmury."
            : "Część danych z trybu bez logowania została już wysłana na to konto, ale przenoszenie nie zostało dokończone."}
        </p>
        <p className="text-neutral-400 text-sm mb-4">
          Ta niekompletna kopia nie zostanie użyta jako zwykłe dane konta. Dane w trybie bez logowania nie zostały zmienione, a ich kopia zapasowa jest zachowana.
        </p>
        {btn("Dokończ przenoszenie", onGuestMigrate, true, "init-guest-retry")}
        {init.partialUnknown && btn("Spróbuj ponownie wrócić bez przenoszenia", onGuestAbandon, false, "init-guest-abandon")}
        {!init.confirmAccept && btn("Zacznij konto bez tych danych", () => onConfirmStep({ confirmAccept: true }), false, "init-guest-start-without")}
        {init.confirmAccept && (
          <>
            <p className="text-red-400 text-sm mb-2" data-testid="init-guest-start-without-warning">
              Dane w chmurze tego konta zostaną świadomie przyjęte jako NIEKOMPLETNE — przenoszenie nie zostanie już dokończone, a kolejne przenoszenie danych na to konto będzie zablokowane do czasu łączenia danych (kolejny etap). Synchronizacja zostanie wznowiona, więc konto będzie używać niekompletnych danych z chmury. Pełne dane w trybie bez logowania i ich kopia zapasowa zostają na tym urządzeniu.
            </p>
            {btn("Tak, zacznij bez tych danych", onGuestStartWithout, false, "init-guest-start-without-confirm")}
            {btn("Anuluj", () => onConfirmStep({ confirmAccept: false }), false, "init-guest-start-without-cancel")}
          </>
        )}
        <p className="text-neutral-600 text-xs mt-2">„Zacznij konto bez tych danych” — konto nie przejmie lokalnej kopii danych z trybu bez logowania; po potwierdzeniu będzie używać tego, co już jest w chmurze (oznaczone na stałe jako niekompletne).</p>
        {errorLine}
      </>
    );
  }
  if (init.status === "guest_migration_error" || init.status === "guest_migration_interrupted") {
    const interrupted = init.status === "guest_migration_interrupted";
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">{interrupted ? "PRZENOSZENIE DANYCH ZOSTAŁO PRZERWANE" : "NIE UDAŁO SIĘ PRZENIEŚĆ DANYCH"}</p>
        <p className="text-neutral-300 text-sm mb-1">
          {interrupted
            ? "Przenoszenie danych z trybu bez logowania na to konto nie zostało dokończone — część danych mogła już trafić do chmury."
            : "Przenoszenie danych z trybu bez logowania na to konto nie powiodło się."}
        </p>
        <p className="text-neutral-400 text-sm mb-4">Dane w trybie bez logowania nie zostały zmienione, a ich kopia zapasowa jest zachowana. Synchronizacja tego konta pozostaje wyłączona.</p>
        {btn(interrupted ? "Dokończ przenoszenie" : "Spróbuj ponownie", onGuestMigrate, true, "init-guest-retry")}
        {btn("Wróć bez przenoszenia", onGuestAbandon, false, "init-guest-abandon")}
        {errorLine}
      </>
    );
  }
  if (init.status === "error_load") {
    return shell(
      <>
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">NIE UDAŁO SIĘ POBRAĆ DANYCH</p>
        <p className="text-neutral-300 text-sm mb-1">Pobieranie danych z chmury nie powiodło się.</p>
        <p className="text-neutral-400 text-sm mb-4">Dane na tym urządzeniu nie zostały zmienione.</p>
        {btn("Spróbuj ponownie", onChooseCloud, true, "init-retry-cloud")}
        {btn("Wróć do wyboru", onBack, false, "init-back")}
        {errorLine}
      </>
    );
  }
  // choice
  const { local, cloud } = init;
  const both = local.hasData && cloud.hasData;
  // F-5 (Etap 8, M1): data accepted as incomplete — never "an empty cloud", never a new upload
  const incomplete = !!init.incompleteAccepted;
  const snap = init.deviceSnapshot; // the device version from before the last "Wczytaj z chmury"
  const d = (snap && snap.details) || local.details || {};
  return shell(
    <>
      <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">
        {incomplete ? "W CHMURZE SĄ NIEKOMPLETNE DANE TEGO KONTA" : both ? "ZNALEŹLIŚMY DANE NA URZĄDZENIU I W CHMURZE" : local.hasData ? "ZNALEŹLIŚMY DANE NA TYM URZĄDZENIU" : "ZNALEŹLIŚMY TWOJE DANE W CHMURZE"}
      </p>
      {incomplete && (
        <p className="text-amber-400 text-sm mb-3" data-testid="init-incomplete-accepted">
          {ACCEPTED_INCOMPLETE_NOTE}
        </p>
      )}
      {incomplete && local.hasData && (
        <p className="text-neutral-300 text-sm mb-3" data-testid="init-incomplete-device">
          Dane z tego urządzenia nie mogą być teraz wysłane na konto. Możesz dalej z nich korzystać na tym urządzeniu — synchronizacja tego konta będzie wtedy wstrzymana, a nic nie zostanie wysłane, pobrane ani usunięte.
        </p>
      )}
      {!incomplete && both && <p className="text-neutral-300 text-sm mb-3">Wybierz, których danych chcesz używać:</p>}
      {!incomplete && !both && local.hasData && <p className="text-neutral-300 text-sm mb-3">Na tym urządzeniu znajdują się dane, których nie ma jeszcze na koncie w chmurze. Co chcesz zrobić?</p>}
      {!incomplete && !both && cloud.hasData && <p className="text-neutral-300 text-sm mb-3">Na tym urządzeniu nie ma jeszcze lokalnych danych tego konta. Czy chcesz pobrać dane z chmury?</p>}
      {snap && (
        <p className="text-neutral-400 text-xs mb-1">Dane z urządzenia: wersja sprzed wczytania z chmury ({fmtDMYHM(snap.createdAt)}).</p>
      )}
      {local.hasData && (
        <p className="text-neutral-500 text-xs mb-3">
          Na urządzeniu: {d.history || 0} {plWord(d.history || 0, "trening", "treningi", "treningów")}, {d.plans || 0} {plWord(d.plans || 0, "plan", "plany", "planów")}
          {d.measurements ? `, ${d.measurements} ${plWord(d.measurements, "pomiar", "pomiary", "pomiarów")}` : ""}
        </p>
      )}
      {local.hasData && !incomplete && btn("Wczytaj dane z urządzenia", onChooseLocal, !cloud.hasData, "init-local")}
      {local.hasData && incomplete && btn("Używaj danych z urządzenia", onChooseLocal, true, "init-use-device")}
      {cloud.hasData && init.partialGuestUpload && (
        <p className="text-amber-400 text-sm mb-3" data-testid="init-partial-warning">
          Uwaga: w chmurze tego konta jest niedokończone przeniesienie danych z trybu bez logowania. Dane z chmury mogą być niekompletne.
        </p>
      )}
      {(cloud.hasData || incomplete) && btn(init.partialGuestUpload || incomplete ? "Wczytaj niekompletne dane z chmury" : "Wczytaj dane z chmury", onChooseCloud, !init.partialGuestUpload && !incomplete, "init-cloud")}
      {btn("Zacznij od pustych danych", onChooseEmpty, false, "init-empty")}
      {both && (
        <p className="text-neutral-500 text-xs leading-relaxed mt-2">
          Dane z urządzenia pozostaną na tym urządzeniu. Dane z chmury są zapisane na Twoim koncie i mogą być dostępne na innych urządzeniach.
        </p>
      )}
      {init.error && (
        <p className="text-red-400 text-sm mt-2" data-testid="init-error">
          {init.error}
        </p>
      )}
    </>
  );
}

function AccountScreen({ onNavigate, authUser, authLoaded, reloadLocalData, isOnline, syncQueueState, onSyncQueueChange, onRechooseDataSource }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudMessage, setCloudMessage] = useState(null); // { ok: bool, text: string } | null
  const [migrationStatus, setMigrationStatusState] = useState(() => getMigrationStatus());
  const [migrationStage, setMigrationStage] = useState(null); // null | "preparing" | "exercises" | "plans" | "history" | "measurements" | "checking" | "done"
  const [migrationResult, setMigrationResult] = useState(null); // { ok: bool, text: string } | null
  const [syncNowRunning, setSyncNowRunning] = useState(false);
  const [syncNowMessage, setSyncNowMessage] = useState(null); // { ok: bool, text: string } | null
  const [pendingConflictCount, setPendingConflictCount] = useState(() => getPendingConflictCount());
  useEffect(() => {
    setPendingConflictCount(getPendingConflictCount());
  }, [syncQueueState]);
  // Stage 4A.4 F-5 (Etap 6): the server view of the account's migration attempts + this device's open manual run
  const accUid = authUser ? authUser.id : null;
  const [migGate, setMigGate] = useState(() => (accUid ? getLastMigrationGate(accUid) : null));
  const [openManual, setOpenManual] = useState(() => (accUid ? getOpenManualAttempt(accUid) : null));
  const [manualEnding, setManualEnding] = useState(false);
  useEffect(() => {
    if (!supabase || !accUid) return;
    setMigGate(getLastMigrationGate(accUid));
    setOpenManual(getOpenManualAttempt(accUid));
    const off = onMigrationGateChange((g) => {
      if (g && g.userId === accUid) {
        setMigGate(g);
        setOpenManual(getOpenManualAttempt(accUid));
      }
    });
    if (isOnline) readMigrationGate(accUid).catch(() => {});
    return off;
  }, [accUid, isOnline]);

  if (!supabase) {
    return (
      <div className="min-h-screen bg-app-depth font-body pb-28">
        <FontStyles />
        <TopBar title="MOJE KONTO" onBack={() => onNavigate("more")} />
        <div className="px-5 pt-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-start gap-3">
            <ShieldAlert size={20} className="text-neutral-500 flex-shrink-0 mt-0.5" />
            <p className="text-neutral-400 text-sm leading-relaxed">
              Konta nie są jeszcze skonfigurowane w tej wersji aplikacji. Możesz normalnie korzystać z NEXTREP bez
              logowania — wszystkie dane pozostają zapisane lokalnie na tym urządzeniu.
            </p>
          </div>
        </div>
        <BottomNav screen="more" onNavigate={onNavigate} />
      </div>
    );
  }

  if (!authLoaded) {
    return (
      <div className="min-h-screen bg-app-depth font-body pb-28 flex items-center justify-center">
        <FontStyles />
        <p className="text-neutral-500 text-sm">Sprawdzanie stanu logowania...</p>
      </div>
    );
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
  };

  const handleSaveToCloud = async () => {
    setCloudSaving(true);
    setCloudMessage(null);
    const { error } = await saveDataToCloud();
    setCloudSaving(false);
    setCloudMessage(error ? { ok: false, text: error } : { ok: true, text: "Dane zapisane w chmurze." });
  };

  const MIGRATION_STAGE_LABELS = {
    preparing: "Przygotowywanie...",
    exercises: "Ćwiczenia...",
    plans: "Plany...",
    history: "Historia treningów...",
    measurements: "Pomiary...",
    checking: "Sprawdzanie...",
    done: "Gotowe",
  };

  const handleMigrateToCloud = async () => {
    setMigrationStage("preparing");
    setMigrationResult(null);
    const result = await runManualMigrationV1((stage) => setMigrationStage(stage)); // Stage 4A.3: guarded repair tool
    // FIX 1 (A): only after a SUCCESSFUL migration — give every migrated record its sync_meta
    // baseline right away, so the first edit after migration bumps past the migrated version.
    // Logged-in/online checks live inside the bootstrap; any failure is silent and retried by
    // the next sync (bootstrap B / runSync).
    if (result.success) {
      try {
        await bootstrapSyncMetaForExistingData();
      } catch (e) {}
    }
    setMigrationStatusState(getMigrationStatus());
    setMigrationStage(null);
    setOpenManual(getOpenManualAttempt(authUser.id));
    readMigrationGate(authUser.id).catch(() => {});
    if (!result.success) {
      setMigrationResult({ ok: false, text: result.error ? authErrorText(result.error) : "Nie udało się przenieść danych do konta." });
      return;
    }
    setMigrationResult({
      ok: true,
      text: "Dane zostały bezpiecznie skopiowane do Twojego konta NEXTREP. Dane na tym urządzeniu pozostały bez zmian.",
    });
  };

  // F-5 (Etap 8, M3): why sync is not running — the account's own choice (marker) or the server migration lock
  const syncPausedReason = (() => {
    if (!authUser) return null;
    const m = getAccountInitMarker(authUser.id);
    if (!m || m.status !== "ready") return "not_initialized";
    if (m.syncPaused) return m.pausedReason === "incomplete_accepted" || m.incompleteAccepted ? "incomplete_accepted" : m.source === "empty" && getGuestPartialNote(authUser.id) ? "guest_partial" : "other_data";
    if (!isOnline) return null; // offline: the offline status says it better than a stale server check
    if (migGate && !migGate.ok) return "check_failed";
    if (migGate && migGate.blocking) return migGate.blocking.status === "abandoned" ? "migration_abandoned" : "migration_in_progress";
    return null;
  })();
  const syncStatus = computeSyncStatus({ authUser, isOnline, queue: syncQueueState || [], paused: syncPausedReason });
  const SYNC_PAUSED_TEXTS = {
    not_initialized: "Synchronizacja wstrzymana — najpierw wybierz źródło danych tego konta.",
    incomplete_accepted: "Synchronizacja wstrzymana — dane w chmurze przyjęto jako niekompletne, a to urządzenie używa innych danych niż chmura. Nic nie jest wysyłane ani pobierane do czasu łączenia danych (kolejny etap).",
    guest_partial: "Synchronizacja wstrzymana — w chmurze jest niedokończone przeniesienie danych z trybu bez logowania.",
    other_data: "Synchronizacja wstrzymana — w chmurze są inne dane niż te, których używasz na tym urządzeniu.",
    check_failed: "Synchronizacja wstrzymana — nie udało się sprawdzić, czy jest bezpieczna. Spróbuj ponownie później.",
    migration_in_progress: "Synchronizacja wstrzymana — trwa przenoszenie danych na to konto.",
    migration_abandoned: "Synchronizacja wstrzymana — przenoszenie danych na to konto zostało przerwane i czeka na rozstrzygnięcie.",
  };

  const SYNC_STATUS_LABELS = {
    upToDate: { icon: "✓", text: "Synchronizacja aktualna", className: "text-lime-400" },
    syncing: { icon: "↻", text: "Synchronizacja…", className: "text-sky-400" },
    offline: { icon: "◌", text: "Offline — zmiany zapisane na urządzeniu", className: "text-neutral-400" },
    pending: { icon: "↻", text: null, className: "text-orange-400" }, // text built below (needs count)
    willRetry: { icon: "⚠", text: "Synchronizacja zostanie ponowiona", className: "text-orange-400" },
    conflicts: { icon: "⚠", text: null, className: "text-red-400" }, // text built below (needs count)
    paused: { icon: "⏸", text: null, className: "text-amber-400" }, // F-5 (Etap 8, M3): text built below (reason)
  };

  const renderSyncStatusText = () => {
    if (syncStatus.kind === "paused") return `${SYNC_PAUSED_TEXTS[syncStatus.reason] || "Synchronizacja wstrzymana."}${syncStatus.pendingCount ? ` (${syncStatus.pendingCount} zmian czeka na urządzeniu)` : ""}`;
    if (syncStatus.kind === "pending") return `Oczekuje na synchronizację: ${syncStatus.count}`;
    if (syncStatus.kind === "offline" && syncStatus.pendingCount > 0) return `Offline — zmiany zapisane na urządzeniu (${syncStatus.pendingCount} oczekuje)`;
    if (syncStatus.kind === "conflicts") return `${syncStatus.count} konflikty wymagają decyzji`;
    return SYNC_STATUS_LABELS[syncStatus.kind]?.text || "";
  };

  // Checks login + connectivity, shows the right status, and only ever PREPARES the future
  // runSync() — never claims a completed sync, since no real push/pull exists yet.
  const handleSyncNow = async () => {
    if (!authUser) {
      setSyncNowMessage({ ok: false, text: "Musisz być zalogowany, aby synchronizować dane." });
      return;
    }
    if (!isOnline) {
      setSyncNowMessage({ ok: false, text: "Brak połączenia z internetem — zmiany pozostają zapisane lokalnie i zostaną zsynchronizowane później." });
      return;
    }
    setSyncNowRunning(true);
    setSyncNowMessage(null);
    const result = await runSync();
    setSyncNowRunning(false);
    setSyncNowMessage({
      ok: false, // never true — a stub run is never a completed sync
      text: result?.message || "Synchronizacja danych zostanie uruchomiona po aktywowaniu Sync Engine.",
    });
  };

  // Deleting a Supabase auth user cannot be done safely from browser code — it requires the
  // service_role key, which must never ship to a browser. The secure pattern is a Postgres
  // function (SECURITY DEFINER) the signed-in person can call to delete their own row; see the
  // setup notes delivered alongside this change for the exact SQL to run once in Supabase.
  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const deletedUserId = authUser ? authUser.id : null;
      const { error } = await supabase.rpc("delete_user");
      if (error) throw error;
      await supabase.auth.signOut();
      purgeDeletedAccountData(deletedUserId); // only after delete_user succeeded
      setConfirmDelete(false);
      onNavigate("more");
    } catch (e) {
      setDeleteError(
        "Nie udało się usunąć konta. Ta funkcja wymaga jednorazowej konfiguracji w panelu Supabase (patrz instrukcja) — albo spróbuj ponownie później."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar title="MOJE KONTO" onBack={() => onNavigate("more")} />
      <div className="px-5 pt-3">
        {authUser ? (
          <>
            <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Moje konto</p>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                <UserCircle2 size={24} className="text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-neutral-500 text-xs">Zalogowany jako:</p>
                <p className="text-neutral-100 font-semibold text-sm truncate">{authUser.email}</p>
                {!authUser.email_confirmed_at && (
                  <p className="text-orange-400 text-xs mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={11} className="flex-shrink-0" /> Potwierdź adres e-mail
                  </p>
                )}
              </div>
            </div>

            {(() => {
              // Stage 4A.2 — which data this account started with on this device
              const m = getAccountInitMarker(authUser.id);
              const label = !m ? "Nie wybrano (synchronizacja wyłączona do czasu wyboru)" : { new: "Nowe konto", device: "Dane z tego urządzenia", cloud: "Dane z chmury", empty: "Puste dane", guest: "Dane z trybu bez logowania" }[m.source] || m.source;
              return (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-2" data-testid="data-source-card">
                  <p className="text-neutral-100 font-semibold text-sm mb-1">Źródło danych</p>
                  <p className="text-neutral-400 text-xs">{label}</p>
                  {m && m.syncPaused && (
                    <p className="text-amber-400 text-xs mt-2 leading-relaxed" data-testid="data-source-paused">
                      {m.pausedReason === "incomplete_accepted" || m.incompleteAccepted
                        ? "Synchronizacja tego konta jest wstrzymana: dane w chmurze przyjęto jako niekompletne, a to urządzenie używa innych danych niż chmura. Nic nie zostało usunięte ani nadpisane; łączenie danych to kolejny etap."
                        : "Synchronizacja tego konta jest wstrzymana: w chmurze są inne dane niż te, których używasz na tym urządzeniu. Nic nie zostało usunięte ani nadpisane."}
                    </p>
                  )}
                  {onRechooseDataSource && (
                    <button
                      onClick={onRechooseDataSource}
                      disabled={!!openManual || !!migrationStage}
                      data-testid="rechoose-source"
                      className="w-full mt-3 py-2.5 rounded-xl bg-neutral-800 text-neutral-100 font-semibold text-sm disabled:opacity-50"
                    >
                      Wybierz ponownie źródło danych
                    </button>
                  )}
                  {onRechooseDataSource && openManual && (
                    <p className="text-neutral-500 text-xs mt-2 leading-relaxed">Najpierw dokończ albo przerwij przenoszenie danych z tego urządzenia (sekcja „Migracja danych”).</p>
                  )}
                </div>
              );
            })()}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-2">
              <p className="text-neutral-100 font-semibold text-sm flex items-center gap-2 mb-1.5">
                {isOnline ? <RefreshCw size={16} className="text-sky-400 flex-shrink-0" /> : <WifiOff size={16} className="text-neutral-500 flex-shrink-0" />}
                Synchronizacja
              </p>
              <p className={`text-xs mb-3 ${SYNC_STATUS_LABELS[syncStatus.kind]?.className || "text-neutral-400"}`} data-testid="sync-status" data-kind={syncStatus.kind}>
                {SYNC_STATUS_LABELS[syncStatus.kind]?.icon} {renderSyncStatusText()}
              </p>
              <button
                onClick={handleSyncNow}
                disabled={syncNowRunning}
                className="w-full py-3 rounded-xl bg-neutral-800 disabled:opacity-50 text-neutral-100 font-semibold text-sm"
              >
                {syncNowRunning ? "Sprawdzanie..." : "Synchronizuj teraz"}
              </button>
              {syncNowMessage && (
                <p className="text-neutral-500 text-xs mt-2 leading-relaxed">{syncNowMessage.text}</p>
              )}
              {pendingConflictCount > 0 && (
                <button
                  onClick={() => onNavigate("conflictCenter")}
                  className="w-full mt-2 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={16} className="flex-shrink-0" /> {formatConflictCountLabel(pendingConflictCount)}
                </button>
              )}
            </div>

            <button
              onClick={handleSaveToCloud}
              disabled={cloudSaving}
              className="w-full flex items-center gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 text-left active:scale-[0.98] mb-2 disabled:opacity-50"
            >
              <UploadCloud size={19} className="text-orange-400 flex-shrink-0" />
              <span className="text-orange-400 font-semibold text-sm">{cloudSaving ? "Zapisywanie..." : "Zapisz dane w chmurze"}</span>
            </button>
            {cloudMessage && (
              <p className={`text-xs mb-2 leading-relaxed ${cloudMessage.ok ? "text-lime-400" : "text-red-400"}`}>{cloudMessage.text}</p>
            )}

            {/* Stage 4A.3: the old "Pobierz / Przywróć dane z chmury" (legacy user_data) overwrote this device's
                data without a backup and outside source selection — removed from the UI. The safe way to use
                the cloud data is "Wybierz ponownie źródło danych" → "Wczytaj z chmury" (backup + confirmation). */}
            <p className="text-neutral-500 text-xs leading-relaxed mb-3 px-1" data-testid="cloud-load-hint">
              Aby wczytać dane z chmury, użyj „Wybierz ponownie źródło danych” — przed wczytaniem powstaje kopia danych z tego urządzenia.
            </p>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-2">
              <p className="text-neutral-100 font-semibold text-sm flex items-center gap-2 mb-1.5">
                <Database size={16} className="text-orange-400 flex-shrink-0" /> Migracja danych
              </p>
              <p className="text-neutral-500 text-xs leading-relaxed mb-3">
                Twoje dane treningowe są obecnie zapisane na tym urządzeniu. Możesz utworzyć ich kopię na swoim
                koncie NEXTREP.
              </p>

              {(() => {
                // Stage 4A.4 F-5 (Etap 6): accepted-incomplete data is a PERMANENT note here (server view or this
                // device's own record of it — also offline); locks and this device's open run are explained
                const m = getAccountInitMarker(authUser.id);
                const rec = getMigrationAttemptRecord(authUser.id);
                const incomplete = !!((migGate && migGate.ok && migGate.acceptedIncomplete) || (m && m.incompleteAccepted) || getIncompleteAcceptedNote(authUser.id) || getGuestPartialNote(authUser.id) || (rec && rec.status === "accepted_incomplete"));
                const lockShown = !!(migGate && (!migGate.ok || migGate.blocking));
                return (
                  <>
                    {incomplete && (
                      <p className="text-amber-400 text-xs leading-relaxed mb-3" data-testid="account-incomplete-accepted">
                        {ACCEPTED_INCOMPLETE_NOTE}
                      </p>
                    )}
                    {lockShown && (
                      <div className="mb-3">
                        <MigrationLockPanel userId={authUser.id} gate={migGate} onChanged={(g) => setMigGate(g)} onResumeOwn={openManual && migGate.own ? handleMigrateToCloud : null} testPrefix="account" />
                      </div>
                    )}
                    {openManual && !lockShown && !migrationStage && (
                      <div className="mb-3" data-testid="account-manual-open">
                        <p className="text-amber-400 text-xs leading-relaxed mb-2">Przenoszenie danych z tego urządzenia nie zostało dokończone — synchronizacja tego konta (także na innych urządzeniach) jest wstrzymana do jego zakończenia.</p>
                        <button onClick={handleMigrateToCloud} className="w-full py-2.5 rounded-xl bg-orange-500 text-neutral-950 font-semibold text-sm mb-2" data-testid="account-manual-resume">
                          Dokończ przenoszenie
                        </button>
                        <button
                          onClick={async () => {
                            setManualEnding(true);
                            const end = await endOwnMigrationAttempt({ attemptId: openManual.attemptId, deviceId: openManual.deviceId });
                            if (end.ok) noteMigrationAttemptStatus(authUser.id, openManual.attemptId, end.status);
                            setMigrationResult(end.ok ? null : { ok: false, text: end.error });
                            await readMigrationGate(authUser.id).catch(() => {});
                            setOpenManual(getOpenManualAttempt(authUser.id));
                            setManualEnding(false);
                          }}
                          disabled={manualEnding}
                          className="w-full py-2.5 rounded-xl bg-neutral-800 text-neutral-100 font-semibold text-sm disabled:opacity-50"
                          data-testid="account-manual-end"
                        >
                          Przerwij przenoszenie
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
              {migrationStatus.status === "completed" && !migrationStage ? (
                <p className="text-lime-400 text-xs leading-relaxed mb-2">Migracja danych została już wykonana.</p>
              ) : null}

              <button
                onClick={handleMigrateToCloud}
                disabled={!!migrationStage || !!(migGate && migGate.ok && migGate.acceptedIncomplete)}
                className="w-full py-3 rounded-xl bg-orange-500 disabled:opacity-50 text-neutral-950 font-bold text-sm"
              >
                {migrationStage ? MIGRATION_STAGE_LABELS[migrationStage] || "Przetwarzanie..." : "Przenieś dane do konta"}
              </button>

              {migrationResult && (
                <p className={`text-xs mt-2 leading-relaxed ${migrationResult.ok ? "text-lime-400" : "text-red-400"}`}>{migrationResult.text}</p>
              )}
            </div>

            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left active:scale-[0.98] mb-2 disabled:opacity-50"
            >
              <LogOut size={19} className="text-neutral-300 flex-shrink-0" />
              <span className="text-neutral-100 font-semibold text-sm">{signingOut ? "Wylogowywanie..." : "Wyloguj"}</span>
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-left active:scale-[0.98]"
            >
              <Trash2 size={19} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400 font-semibold text-sm">Usuń konto</span>
            </button>

            <p className="text-neutral-600 text-xs mt-4 leading-relaxed">
              Konto służy wyłącznie do logowania. Twoje ćwiczenia, plany, historia i pomiary pozostają zapisane
              lokalnie na tym urządzeniu — ani wylogowanie, ani usunięcie konta ich nie usuwa.
            </p>
          </>
        ) : (
          <>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-4">
              <p className="text-neutral-300 text-sm leading-relaxed">
                Nie jesteś zalogowany. Konto jest opcjonalne — możesz dalej normalnie korzystać z NEXTREP bez
                logowania, ze wszystkimi danymi zapisanymi lokalnie na tym urządzeniu.
              </p>
            </div>
            <button onClick={() => onNavigate("login")} className="w-full py-3.5 rounded-2xl bg-orange-500 text-neutral-950 font-bold mb-2.5">
              Zaloguj się
            </button>
            <button onClick={() => onNavigate("register")} className="w-full py-3.5 rounded-2xl bg-neutral-800 text-neutral-200 font-semibold">
              Załóż konto
            </button>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl text-neutral-50 tracking-wide mb-2">USUNĄĆ KONTO?</p>
            <p className="text-neutral-400 text-sm mb-2 leading-relaxed">
              Ta operacja jest nieodwracalna i usuwa Twoje konto logowania. Dane treningowe zapisane lokalnie na tym
              urządzeniu NIE zostaną usunięte.
            </p>
            {deleteError && <p className="text-red-400 text-xs mb-1 leading-relaxed">{deleteError}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold disabled:opacity-50"
              >
                Anuluj
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 rounded-xl bg-red-500 disabled:opacity-50 text-neutral-950 font-bold">
                {deleting ? "Usuwanie..." : "Usuń konto"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav screen="more" onNavigate={onNavigate} />
    </div>
  );
}

function PasswordField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative mt-1 mb-4">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 pr-11 text-neutral-100 outline-none focus:border-orange-500"
      />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function LoginScreen({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = email.trim() && password && supabase;

  const [networkError, setNetworkError] = useState(false);
  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setNetworkError(false);
    let error = null;
    try {
      ({ error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }));
    } catch (e) {
      error = e; // supabase-js / fetch can also throw (TypeError: Failed to fetch)
    }
    setLoading(false);
    if (error) {
      // Offline: Supabase did NOT confirm the identity → the user stays logged out (the app keeps
      // working with the data already on this device, outside any account).
      setNetworkError(isNetworkError(error));
      setError(authErrorText(error));
      return;
    }
    onNavigate("account");
  };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar title="ZALOGUJ SIĘ" onBack={() => onNavigate("account")} />
      <div className="px-5 pt-3">
        {!supabase && (
          <p className="text-neutral-500 text-xs mb-4 leading-relaxed">Konta nie są jeszcze skonfigurowane w tej wersji aplikacji.</p>
        )}
        <label className="text-neutral-500 text-xs uppercase font-semibold">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jan@example.com"
          autoCapitalize="none"
          className="w-full mt-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <label className="text-neutral-500 text-xs uppercase font-semibold">Hasło</label>
        <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

        <button onClick={() => onNavigate("forgotPassword")} className="text-orange-400 text-xs font-semibold mb-5 -mt-2 block">
          Nie pamiętam hasła
        </button>

        {error && <p className="text-red-400 text-xs mb-3" data-testid="login-error">{error}</p>}
        {networkError && (
          <button onClick={handleLogin} disabled={loading} data-testid="login-retry" className="w-full mb-3 py-3 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-100 font-semibold text-sm disabled:opacity-50">
            Spróbuj ponownie
          </button>
        )}
        {networkError && <p className="text-neutral-500 text-xs mb-3 leading-relaxed">Bez połączenia nie można się zalogować. Możesz dalej korzystać z aplikacji na tym urządzeniu bez logowania.</p>}

        <button onClick={handleLogin} disabled={!canSubmit || loading} className="w-full py-3.5 rounded-2xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold">
          {loading ? "Logowanie..." : "Zaloguj się"}
        </button>

        <button onClick={() => onNavigate("register")} className="w-full mt-4 text-neutral-400 text-sm text-center">
          Nie masz konta? <span className="text-orange-400 font-semibold">Zarejestruj się</span>
        </button>
      </div>
    </div>
  );
}

function RegisterScreen({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = email.trim() && password.length >= 6 && password === confirmPassword && supabase;

  const handleRegister = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: authRedirectUrl() },
    }).catch((e) => ({ error: e }));
    setLoading(false);
    if (error) {
      setError(authErrorText(error));
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-app-depth font-body pb-10 flex flex-col">
        <FontStyles />
        <TopBar title="REJESTRACJA" onBack={() => onNavigate("account")} />
        <div className="px-5 pt-6 flex-1 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center mb-4">
            <Mail size={24} className="text-orange-400" />
          </div>
          <p className="font-display text-xl text-neutral-50 tracking-wide mb-2">SPRAWDŹ SKRZYNKĘ E-MAIL</p>
          <p className="text-neutral-400 text-sm leading-relaxed">
            Wysłaliśmy link potwierdzający na adres <span className="text-neutral-200 font-medium">{email.trim()}</span>. Kliknij go, aby
            dokończyć zakładanie konta.
          </p>
          <button onClick={() => onNavigate("account")} className="w-full mt-8 py-3.5 rounded-2xl bg-neutral-800 text-neutral-200 font-semibold">
            Wróć do konta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar title="ZAŁÓŻ KONTO" onBack={() => onNavigate("account")} />
      <div className="px-5 pt-3">
        {!supabase && (
          <p className="text-neutral-500 text-xs mb-4 leading-relaxed">Konta nie są jeszcze skonfigurowane w tej wersji aplikacji.</p>
        )}
        <label className="text-neutral-500 text-xs uppercase font-semibold">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jan@example.com"
          autoCapitalize="none"
          className="w-full mt-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />

        <label className="text-neutral-500 text-xs uppercase font-semibold">Hasło</label>
        <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 6 znaków" />

        <label className="text-neutral-500 text-xs uppercase font-semibold">Powtórz hasło</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="powtórz hasło"
          className="w-full mt-1 mb-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />
        {password && confirmPassword && password !== confirmPassword && <p className="text-red-400 text-xs mb-2">Hasła się różnią.</p>}

        {error && <p className="text-red-400 text-xs mb-3 mt-2">{error}</p>}

        <button
          onClick={handleRegister}
          disabled={!canSubmit || loading}
          className="w-full mt-3 py-3.5 rounded-2xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold"
        >
          {loading ? "Zakładanie konta..." : "Załóż konto"}
        </button>

        <button onClick={() => onNavigate("login")} className="w-full mt-4 text-neutral-400 text-sm text-center">
          Masz już konto? <span className="text-orange-400 font-semibold">Zaloguj się</span>
        </button>
      </div>
    </div>
  );
}

function ForgotPasswordScreen({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!email.trim() || !supabase) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(),
    }).catch((e) => ({ error: e }));
    setLoading(false);
    if (error) {
      setError(authErrorText(error));
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar title="NIE PAMIĘTAM HASŁA" onBack={() => onNavigate("login")} />
      <div className="px-5 pt-3">
        {sent ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
            <p className="text-neutral-300 text-sm leading-relaxed">
              Jeśli konto o adresie <span className="text-neutral-100 font-medium">{email.trim()}</span> istnieje, wysłaliśmy na nie link do
              zresetowania hasła. Sprawdź skrzynkę e-mail.
            </p>
          </div>
        ) : (
          <>
            <p className="text-neutral-500 text-xs leading-relaxed mb-4">
              Podaj adres e-mail powiązany z kontem — wyślemy link do ustawienia nowego hasła.
            </p>
            <label className="text-neutral-500 text-xs uppercase font-semibold">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jan@example.com"
              autoCapitalize="none"
              className="w-full mt-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
            />
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button
              onClick={handleSend}
              disabled={!email.trim() || loading || !supabase}
              className="w-full py-3.5 rounded-2xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold"
            >
              {loading ? "Wysyłanie..." : "Wyślij link do resetu hasła"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ResetPasswordScreen({ onNavigate }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = password.length >= 6 && password === confirmPassword && supabase;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password }).catch((e) => ({ error: e }));
    setLoading(false);
    if (error) {
      setError(authErrorText(error));
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar title="NOWE HASŁO" />
      <div className="px-5 pt-3">
        {done ? (
          <>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-4">
              <p className="text-lime-400 text-sm font-semibold flex items-center gap-1.5">
                <Check size={15} className="flex-shrink-0" /> Hasło zostało zmienione.
              </p>
            </div>
            <button onClick={() => onNavigate("account")} className="w-full py-3.5 rounded-2xl bg-orange-500 text-neutral-950 font-bold">
              Wróć do konta
            </button>
          </>
        ) : (
          <>
            <p className="text-neutral-500 text-xs leading-relaxed mb-4">Ustaw nowe hasło do swojego konta.</p>
            <label className="text-neutral-500 text-xs uppercase font-semibold">Nowe hasło</label>
            <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 6 znaków" />

            <label className="text-neutral-500 text-xs uppercase font-semibold">Powtórz nowe hasło</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="powtórz hasło"
              className="w-full mt-1 mb-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
            />
            {password && confirmPassword && password !== confirmPassword && <p className="text-red-400 text-xs mb-2">Hasła się różnią.</p>}
            {error && <p className="text-red-400 text-xs mb-3 mt-2">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className="w-full mt-3 py-3.5 rounded-2xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold"
            >
              {loading ? "Zapisywanie..." : "Ustaw nowe hasło"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BackupModal({ onClose }) {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [backupList, setBackupList] = useState(() => [...loadBackupListForActiveNamespace()].reverse());
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const refreshList = () => setBackupList([...loadBackupListForActiveNamespace()].reverse());
  const lastBackup = backupList[0] || null;

  const exportData = () => {
    const bundle = {
      app: "NextRep",
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      data: readAllAppData(),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = toLocalDateStr(new Date());
    a.href = url;
    a.download = `nextrep-kopia-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMessage("Pobrano kopię zapasową.");
  };

  const handleManualBackup = () => {
    const snap = createBackupSnapshot("manual", { force: true });
    if (snap) {
      setMessage("Lokalna kopia zapasowa została utworzona.");
      refreshList();
    } else {
      setMessage("Nie udało się utworzyć lokalnej kopii zapasowej.");
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed?.data || parsed;
        // DES-01 / D1.5: recognise → check → backup → write, in one checked function (09-backups.jsx)
        const r = applyImportedAppData(data);
        if (!r.ok) {
          setMessage(
            r.code === "ATLAS_INCOMPATIBLE"
              ? "Ta kopia nie jest zgodna z atlasem NEXTREP 1.0 (ćwiczenia lub treningi spoza atlasu). Obecne dane nie zostały zmienione."
              : r.code === "USER_EXERCISES_INVALID"
              ? "Ta kopia zawiera niepoprawne dane ćwiczeń własnych lub ulubionych. Obecne dane nie zostały zmienione."
              : r.code === "STORAGE_FAILED"
              ? "Nie udało się zapisać wszystkich danych z kopii. Kopia stanu sprzed importu jest na liście kopii zapasowych."
              : "Nie udało się zaimportować danych. Obecne dane nie zostały zmienione."
          );
          setImporting(false);
          e.target.value = "";
          return;
        }

        setMessage("Zaimportowano! Aplikacja zaraz się odświeży...");
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        setMessage("Nie udało się zaimportować danych. Obecne dane nie zostały zmienione.");
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleRestore = (snapshot) => {
    setRestoring(true);
    createBackupSnapshot("before-restore", { force: true });
    const ok = restoreFromSnapshot(snapshot);
    if (ok) {
      setMessage("Przywrócono kopię. Aplikacja zaraz się odświeży...");
      setTimeout(() => window.location.reload(), 1200);
    } else {
      setMessage("Nie udało się przywrócić tej kopii. Obecne dane nie zostały zmienione.");
      setRestoring(false);
    }
    setConfirmRestore(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 pb-8 overflow-y-auto no-scrollbar" style={{ maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
        <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-1">KOPIA ZAPASOWA</h2>
        <p className="text-neutral-500 text-xs mb-4 leading-relaxed">
          Dane są przechowywane lokalnie na tym urządzeniu. NEXTREP tworzy lokalne kopie zapasowe, które pomagają chronić dane przed przypadkową utratą na tym urządzeniu — to nie jest kopia w chmurze. Jeśli usuniesz dane przeglądarki, odinstalujesz aplikację albo stracisz urządzenie, lokalna kopia też przepadnie, dlatego warto od czasu do czasu pobrać kopię JSON.
        </p>

        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 mb-4">
          <p className="text-neutral-400 text-xs">
            Ostatnia kopia: <span className="text-neutral-200 font-semibold">{lastBackup ? fmtBackupTime(lastBackup.createdAt) : "brak"}</span>
          </p>
          <p className="text-neutral-400 text-xs mt-1">
            Liczba lokalnych kopii: <span className="text-neutral-200 font-semibold">{backupList.length}</span>
          </p>
        </div>

        <button onClick={handleManualBackup} className="w-full mb-2 py-3 rounded-xl bg-neutral-800 text-neutral-200 font-semibold flex items-center justify-center gap-2">
          <Layers size={17} /> Utwórz kopię teraz
        </button>

        <button onClick={exportData} className="w-full mb-3 py-3.5 rounded-xl bg-orange-500 text-neutral-950 font-bold flex items-center justify-center gap-2">
          <Download size={18} /> Eksportuj dane JSON
        </button>

        <label className="w-full py-3.5 rounded-xl bg-neutral-800 text-neutral-200 font-semibold flex items-center justify-center gap-2 cursor-pointer">
          <Upload size={18} /> Importuj dane JSON
          <input type="file" accept="application/json" className="hidden" onChange={handleFile} disabled={importing} />
        </label>

        {message && <p className="text-neutral-400 text-xs text-center mt-3">{message}</p>}

        {backupList.length > 0 && (
          <div className="mt-5">
            <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Lokalne kopie</p>
            <div className="space-y-1.5">
              {backupList.map((b) => (
                <div key={b.backupId} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-neutral-200 text-xs font-semibold">{fmtBackupTime(b.createdAt)}</p>
                    <p className="text-neutral-600 text-xs mt-0.5">
                      {BACKUP_REASON_LABELS[b.reason] || b.reason} · wersja {b.appVersion}
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmRestore(b)}
                    disabled={restoring}
                    className="flex-shrink-0 text-orange-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-orange-500/30 disabled:opacity-40"
                  >
                    Przywróć
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-neutral-800/50 text-neutral-400 font-semibold text-sm">
          Zamknij
        </button>
      </div>

      {confirmRestore && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center px-6" onClick={() => setConfirmRestore(null)}>
          <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl text-neutral-50 tracking-wide mb-2">PRZYWRÓCIĆ KOPIĘ?</p>
            <p className="text-neutral-400 text-sm mb-5 leading-relaxed">
              Przywrócenie kopii zastąpi obecne dane aplikacji. Aktualny stan zostanie najpierw zabezpieczony lokalną kopią. Czy chcesz kontynuować?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRestore(null)} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
                Anuluj
              </button>
              <button onClick={() => handleRestore(confirmRestore)} disabled={restoring} className="flex-1 py-3 rounded-xl bg-orange-500 disabled:opacity-50 text-neutral-950 font-bold">
                Przywróć kopię
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

