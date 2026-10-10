function AdminAccessMessage({ title, text, onExit }) {
  return (
    <div className="min-h-screen bg-app-depth font-body flex flex-col items-center justify-center px-6 text-center" data-testid="admin-denied">
      <FontStyles />
      <Lock size={30} className="text-neutral-600 mb-3" />
      <p className="font-display text-2xl text-neutral-50 tracking-wide">{title}</p>
      <p className="text-neutral-400 text-sm mt-2 mb-6 max-w-xs">{text}</p>
      <button onClick={onExit} className="w-full max-w-xs bg-orange-500 text-neutral-950 font-bold py-3 rounded-2xl">
        Przejdź do NEXTREP
      </button>
    </div>
  );
}

// Back inside NEXTREP ADMIN (Szczegóły → Lista → Dashboard) before leaving the panel.
const adminBackRef = { current: null };

// All admin data comes ONLY from server functions that re-check admin rights on every call
// (nextrep_admin_* — SECURITY DEFINER, identity from the session JWT). The UI never filters,
// counts or derives these numbers itself, and never invents a value that isn't in the response.
const adminErrorKind = (error) =>
  error && (error.code === "42501" || /nextrep_not_admin|permission denied/i.test(error.message || "")) ? "denied" : "error";

function useAdminQuery(fn, args, deps) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ status: "loading", data: s.data }));
    supabase
      .rpc(fn, args)
      .then(({ data, error }) => {
        if (!alive) return;
        setState(error ? { status: adminErrorKind(error), data: null } : { status: "ok", data });
      })
      .catch(() => alive && setState({ status: "error", data: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

const adminDate = (iso) => (iso ? fmtDate(iso) : "Brak danych");

function AdminRoleBadge({ role }) {
  const admin = role === "admin";
  return (
    <span
      className={`text-[11px] font-bold rounded-full px-2 py-0.5 border flex-shrink-0 ${
        admin ? "text-orange-400 border-orange-500/40 bg-orange-500/10" : "text-neutral-300 border-neutral-700 bg-neutral-950"
      }`}
    >
      {admin ? "ADMIN" : "USER"}
    </span>
  );
}

function AdminStat({ label, value, note }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 min-w-0" data-testid="admin-stat">
      <p className="text-neutral-500 text-xs uppercase font-semibold leading-snug">{label}</p>
      {value != null ? (
        <p className="font-display text-2xl text-neutral-50 tracking-wide leading-none mt-1.5">{value}</p>
      ) : (
        <p className="text-neutral-400 text-xs leading-snug mt-1.5">{note}</p>
      )}
    </div>
  );
}

function AdminRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-neutral-800/70 last:border-0 text-sm">
      <span className="text-neutral-500 flex-shrink-0">{label}</span>
      <span className="text-neutral-100 text-right min-w-0 break-words">{value}</span>
    </div>
  );
}

function AdminLoadState({ q, emptyText }) {
  if (q.status === "loading" && !q.data) return <p className="text-neutral-500 text-sm py-6 text-center">Wczytywanie…</p>;
  if (q.status === "denied") return <p className="text-red-400 text-sm py-6 text-center">Brak dostępu — serwer odmówił (wymagana rola admin).</p>;
  if (q.status === "error")
    return (
      <div className="py-6 text-center">
        <p className="text-neutral-400 text-sm mb-3">Nie udało się pobrać danych.</p>
        <button onClick={q.reload} className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-200 text-sm font-semibold">
          Spróbuj ponownie
        </button>
      </div>
    );
  return emptyText ? <p className="text-neutral-500 text-sm py-6 text-center">{emptyText}</p> : null;
}

function AdminUserCard({ u, onOpen }) {
  return (
    <button onClick={() => onOpen(u.user_id)} className="w-full text-left bg-neutral-900 border border-neutral-800 rounded-xl p-3 active:border-orange-500" data-testid="admin-user-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-neutral-100 font-semibold text-sm break-all min-w-0">{u.email || "Brak e-maila"}</p>
        <AdminRoleBadge role={u.role} />
      </div>
      <p className="text-neutral-500 text-xs mt-1">
        Rejestracja: {adminDate(u.created_at)}
        {u.email_confirmed === false ? " · e-mail niepotwierdzony" : ""}
      </p>
      {"workouts" in u && (
        <p className="text-neutral-400 text-xs mt-1">
          {u.workouts} {plWord(u.workouts, "trening", "treningi", "treningów")} · {u.plans} {plWord(u.plans, "plan", "plany", "planów")} · ostatni trening:{" "}
          {u.last_workout_date ? fmtDate(u.last_workout_date) : "brak treningów"}
        </p>
      )}
      <p className="text-neutral-500 text-xs mt-1">Ostatnie logowanie: {adminDate(u.last_sign_in_at)}</p>
    </button>
  );
}

function AdminDashboard({ onOpenUsers, onOpenUser }) {
  const q = useAdminQuery("nextrep_admin_dashboard", undefined, []);
  const d = q.status === "ok" ? q.data : null;
  return (
    <div data-testid="admin-dashboard">
      {!d ? (
        <AdminLoadState q={q} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <AdminStat label="Użytkownicy" value={d.users_total} />
            <AdminStat label="Administratorzy" value={d.admins} />
            <AdminStat label="Treningi" value={d.workouts} />
            <AdminStat label="Plany" value={d.plans} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <AdminStat label={d.pro_available ? "Użytkownicy PRO" : "PRO"} value={d.pro_available ? d.pro : null} note="Niedostępne — brak serwerowego systemu subskrypcji" />
            <AdminStat label={d.pro_available ? "Użytkownicy Free" : "Free"} value={d.pro_available ? d.free : null} note="Niedostępne — status PRO jest dziś zapisywany tylko lokalnie na urządzeniu" />
          </div>
          {d.pro_available && typeof d.pro_expired === "number" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <AdminStat label="PRO wygasłe" value={d.pro_expired} />
            </div>
          )}
          <p className="text-neutral-500 text-xs uppercase font-semibold mt-5 mb-2">Ostatnio zarejestrowani</p>
          {d.recent.length === 0 ? (
            <p className="text-neutral-500 text-sm py-4 text-center">Brak użytkowników</p>
          ) : (
            <div className="space-y-2">
              {d.recent.map((u) => (
                <AdminUserCard key={u.user_id} u={u} onOpen={onOpenUser} />
              ))}
            </div>
          )}
          <button onClick={onOpenUsers} className="w-full mt-3 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 font-semibold text-sm">
            Zobacz wszystkich użytkowników
          </button>
        </>
      )}
    </div>
  );
}

const ADMIN_PAGE = 25;
function AdminUsers({ onOpenUser }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input.trim());
      setPages(1);
    }, 350);
    return () => clearTimeout(t);
  }, [input]);
  // Search + paging happen in the database (25 per page, real offset); the browser only ever
  // holds the pages actually requested.
  const q = useAdminQuery("nextrep_admin_users", { p_search: search || null, p_limit: ADMIN_PAGE, p_offset: (pages - 1) * ADMIN_PAGE }, [search, pages]);
  const [acc, setAcc] = useState({ key: null, items: [], total: 0 });
  useEffect(() => {
    if (q.status !== "ok" || !q.data) return;
    setAcc((prev) => {
      const fresh = pages === 1 || prev.key !== search;
      const base = fresh ? [] : prev.items;
      return { key: search, total: q.data.total, items: [...base, ...q.data.items.filter((n) => !base.some((p) => p.user_id === n.user_id))] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.status, q.data]);
  const d = acc.key === search && (q.status === "ok" || pages > 1) ? acc : null;
  return (
    <div data-testid="admin-users">
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Szukaj po e-mailu"
          type="search"
          autoComplete="off"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-neutral-100 text-sm placeholder-neutral-600 focus:outline-none focus:border-orange-500"
        />
      </div>
      {!d ? (
        <AdminLoadState q={q} />
      ) : d.items.length === 0 ? (
        <p className="text-neutral-500 text-sm py-6 text-center">{search ? `Brak wyników dla „${search}”` : "Brak użytkowników"}</p>
      ) : (
        <>
          <p className="text-neutral-500 text-xs mb-2">
            {search ? "Znaleziono" : "Wszystkich"}: {d.total} · pokazano {d.items.length}
          </p>
          <div className="space-y-2">
            {d.items.map((u) => (
              <AdminUserCard key={u.user_id} u={u} onOpen={onOpenUser} />
            ))}
          </div>
          {d.items.length < d.total && (
            <button
              onClick={() => setPages((p) => p + 1)}
              disabled={q.status === "loading"}
              className="w-full mt-3 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 font-semibold text-sm disabled:opacity-50"
            >
              {q.status === "loading" ? "Wczytywanie…" : "Pokaż więcej"}
            </button>
          )}
          {q.status === "denied" || q.status === "error" ? <AdminLoadState q={q} /> : null}
        </>
      )}
    </div>
  );
}

// ===== NEXTREP PRO w ADMIN (Stage 3) =====
// Every read and every change goes through server functions (nextrep_admin_pro_status /
// _grant_pro / _revoke_pro) that re-check admin rights, take the acting admin from the session
// and write the immutable audit. The UI never sends granted_by / revoked_by and never decides.
const adminModalCloseRef = { current: null };
const fmtDMY = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};
const fmtDMYHM = (iso) => {
  const d = new Date(iso);
  return `${fmtDMY(iso)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const PRO_SOURCE_LABEL = { admin: "ADMIN", stripe: "PŁATNOŚĆ", promo: "PROMOCJA", trial: "OKRES PRÓBNY" };
// Server error → safe, human message (never the raw database text).
function adminProErrorMessage(error) {
  const m = (error && error.message) || "";
  if (error && (error.code === "42501" || /nextrep_not_admin|permission denied/.test(m))) return "Brak uprawnień — operację może wykonać tylko administrator.";
  if (/nextrep_pro_already_active/.test(m)) return "PRO jest już aktywne dla tego użytkownika.";
  if (/nextrep_pro_not_active/.test(m)) return "Ten użytkownik nie ma aktywnego PRO.";
  if (/nextrep_pro_expiry_in_past/.test(m)) return "Data końca nie może być w przeszłości.";
  if (/nextrep_user_not_found/.test(m)) return "Nie znaleziono użytkownika.";
  return "Nie udało się wykonać operacji. Spróbuj ponownie.";
}
// "YYYY-MM-DD" → end of that day in local time (access lasts through the chosen day).
const endOfLocalDayIso = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
};
const todayYmd = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

function AdminModal({ title, children, onClose }) {
  useEffect(() => {
    adminModalCloseRef.current = onClose;
    return () => {
      adminModalCloseRef.current = null;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose} data-testid="admin-modal">
      <div
        className="w-full sm:max-w-md bg-neutral-900 border border-neutral-800 rounded-t-3xl sm:rounded-2xl p-5 pb-7 overflow-y-auto no-scrollbar"
        style={{ maxHeight: "90vh", paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-2xl text-neutral-50 tracking-wide mb-3">{title}</p>
        {children}
      </div>
    </div>
  );
}

function GrantProModal({ email, onClose, onSubmit }) {
  const [mode, setMode] = useState("forever"); // forever | date
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState("form"); // form | confirm | busy
  const [error, setError] = useState(null);
  const validation =
    mode === "date" && !date
      ? "Wybierz datę końca dostępu."
      : mode === "date" && new Date(endOfLocalDayIso(date)).getTime() <= Date.now()
      ? "Data końca nie może być w przeszłości."
      : null;
  const submit = async () => {
    setStep("busy");
    setError(null);
    const res = await onSubmit({ expiresAt: mode === "date" ? endOfLocalDayIso(date) : null, reason: reason.trim() || null });
    if (res && res.error) {
      setError(adminProErrorMessage(res.error));
      setStep("form");
    }
  };
  return (
    <AdminModal title="NADAJ DOSTĘP PRO" onClose={step === "busy" ? () => {} : onClose}>
      <p className="text-neutral-400 text-sm mb-3 break-all">{email}</p>
      {step === "form" ? (
        <>
          <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Dostęp PRO</p>
          <div className="space-y-2 mb-3" role="radiogroup">
            {[
              ["forever", "Bezterminowo"],
              ["date", "Do określonej daty"],
            ].map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={mode === k}
                onClick={() => setMode(k)}
                className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-xl border ${mode === k ? "border-orange-500 bg-orange-500/10" : "border-neutral-800 bg-neutral-950"}`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${mode === k ? "border-orange-500 bg-orange-500" : "border-neutral-600"}`} />
                <span className="text-neutral-100 text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
          {mode === "date" && (
            <label className="block mb-3">
              <span className="text-neutral-500 text-xs uppercase font-semibold">Data końca</span>
              <input
                type="date"
                value={date}
                min={todayYmd()}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-100 text-sm focus:outline-none focus:border-orange-500"
              />
            </label>
          )}
          <label className="block mb-3">
            <span className="text-neutral-500 text-xs uppercase font-semibold">Powód / notatka (opcjonalnie)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="np. Testowanie funkcji PRO"
              className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-100 text-sm placeholder-neutral-600 focus:outline-none focus:border-orange-500 resize-none"
            />
          </label>
          {(validation || error) && (
            <p className="text-red-400 text-sm mb-3" data-testid="admin-modal-error">
              {error || validation}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-200 font-semibold text-sm">
              Anuluj
            </button>
            <button
              onClick={() => !validation && setStep("confirm")}
              disabled={!!validation}
              className="flex-1 py-3 rounded-xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold text-sm"
            >
              Nadaj PRO
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="bg-neutral-950 border border-orange-500/30 rounded-xl p-3 mb-4">
            <p className="text-neutral-100 text-sm font-semibold">Nadajesz użytkownikowi dostęp NEXTREP PRO.</p>
            <p className="text-neutral-400 text-sm mt-1">{mode === "date" ? `Do: ${fmtDMY(endOfLocalDayIso(date))}` : "Bezterminowo"}</p>
            <p className="text-neutral-500 text-xs mt-2">Operacja zostanie zapisana w historii dostępu.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep("form")} disabled={step === "busy"} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-200 font-semibold text-sm disabled:opacity-50">
              Wróć
            </button>
            <button onClick={submit} disabled={step === "busy"} className="flex-1 py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold text-sm disabled:opacity-50">
              {step === "busy" ? "Zapisywanie…" : "Potwierdź"}
            </button>
          </div>
        </>
      )}
    </AdminModal>
  );
}

function RevokeProModal({ email, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await onSubmit({ reason: reason.trim() || null });
    if (res && res.error) {
      setError(adminProErrorMessage(res.error));
      setBusy(false);
    }
  };
  return (
    <AdminModal title="ODBIERZ NEXTREP PRO" onClose={busy ? () => {} : onClose}>
      <p className="text-neutral-400 text-sm mb-2 break-all">{email}</p>
      <p className="text-neutral-100 text-sm mb-3">Użytkownik straci dostęp do funkcji PRO.</p>
      <label className="block mb-3">
        <span className="text-neutral-500 text-xs uppercase font-semibold">Powód / notatka (opcjonalnie)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="np. Koniec testów"
          className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-100 text-sm placeholder-neutral-600 focus:outline-none focus:border-orange-500 resize-none"
        />
      </label>
      <p className="text-neutral-500 text-xs mb-3">Historia dostępu zostaje zachowana.</p>
      {error && (
        <p className="text-red-400 text-sm mb-3" data-testid="admin-modal-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-200 font-semibold text-sm disabled:opacity-50">
          Anuluj
        </button>
        <button onClick={submit} disabled={busy} className="flex-1 py-3 rounded-xl bg-red-500 text-neutral-950 font-bold text-sm disabled:opacity-50">
          {busy ? "Zapisywanie…" : "Odbierz PRO"}
        </button>
      </div>
    </AdminModal>
  );
}

function AdminProSection({ userId, email, onPushNav, onChanged }) {
  const q = useAdminQuery("nextrep_admin_pro_status", { p_user_id: userId }, [userId]);
  const [override, setOverride] = useState(null); // fresh status returned by a successful change
  const [modal, setModal] = useState(null); // null | "grant" | "revoke"
  const [notice, setNotice] = useState(null);
  useEffect(() => setOverride(null), [userId, q.data]);
  const s = override || (q.status === "ok" ? q.data : null);
  if (!s) return <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"><AdminLoadState q={q} /></div>;
  const cur = s.current || { active: false };
  const last = s.last_grant;
  const open = (m) => {
    if (onPushNav) onPushNav();
    setNotice(null);
    setModal(m);
  };
  const run = async (fn, args, okText) => {
    try {
      const { data, error } = await supabase.rpc(fn, { p_user_id: userId, ...args });
      if (error) return { error };
      setOverride(data);
      setModal(null);
      setNotice(okText);
      if (onChanged) onChanged(userId);
      return { ok: true };
    } catch {
      return { error: { message: "network" } };
    }
  };
  return (
    <div className="space-y-3">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4" data-testid="admin-pro-section">
        <p className="text-neutral-500 text-xs uppercase font-semibold mb-1">NEXTREP PRO</p>
        <AdminRow label="Status" value={<span className={cur.active ? "text-green-400 font-bold" : "text-neutral-300 font-bold"}>{cur.active ? "AKTYWNE" : "NIEAKTYWNE"}</span>} />
        {cur.active ? (
          <>
            <AdminRow label="Od" value={fmtDMY(cur.starts_at)} />
            <AdminRow label="Do" value={cur.expires_at ? fmtDMY(cur.expires_at) : "Bezterminowo"} />
            <AdminRow label="Źródło" value={PRO_SOURCE_LABEL[cur.source] || String(cur.source || "").toUpperCase()} />
          </>
        ) : last && last.status === "expired" ? (
          <AdminRow label="Ostatni dostęp" value={`wygasł ${fmtDMY(last.expires_at)}`} />
        ) : null}
        {notice && <p className="text-green-400 text-sm mt-3" data-testid="admin-pro-notice">{notice}</p>}
        {cur.active ? (
          <>
            <p className="text-neutral-500 text-xs mt-3">PRO jest już aktywne.</p>
            <button onClick={() => open("revoke")} className="w-full mt-2 py-3 rounded-xl bg-neutral-950 border border-red-500/50 text-red-400 font-bold text-sm">
              Odbierz PRO
            </button>
          </>
        ) : (
          <button onClick={() => open("grant")} className="w-full mt-3 py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold text-sm">
            Nadaj PRO
          </button>
        )}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4" data-testid="admin-pro-history">
        <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Historia dostępu PRO</p>
        {s.history.length === 0 ? (
          <p className="text-neutral-500 text-sm">Brak zmian dostępu PRO.</p>
        ) : (
          <div className="space-y-2">
            {s.history.map((h) => (
              <div key={h.id} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3" data-testid="admin-pro-event">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-bold ${h.action === "GRANT" ? "text-green-400" : "text-red-400"}`}>{h.action === "GRANT" ? "NADANO PRO" : "ODEBRANO PRO"}</p>
                  <p className="text-neutral-500 text-xs text-right">{fmtDMYHM(h.created_at)}</p>
                </div>
                {h.action === "GRANT" && <p className="text-neutral-300 text-xs mt-1">{h.expires_at ? `Do ${fmtDMY(h.expires_at)}` : "Bezterminowo"}</p>}
                <p className="text-neutral-500 text-xs mt-1">
                  Administrator: <span className="text-neutral-300 break-all">{h.actor_email || "Brak danych"}</span>
                </p>
                {h.reason && (
                  <p className="text-neutral-500 text-xs mt-1 break-words">
                    Powód: <span className="text-neutral-300">{h.reason}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === "grant" && (
        <GrantProModal
          email={email}
          onClose={() => setModal(null)}
          onSubmit={({ expiresAt, reason }) => run("nextrep_admin_grant_pro", { p_expires_at: expiresAt, p_reason: reason }, "Nadano dostęp NEXTREP PRO.")}
        />
      )}
      {modal === "revoke" && (
        <RevokeProModal email={email} onClose={() => setModal(null)} onSubmit={({ reason }) => run("nextrep_admin_revoke_pro", { p_reason: reason }, "Odebrano dostęp NEXTREP PRO.")} />
      )}
    </div>
  );
}

function AdminUserDetail({ userId, onBackToList, onPushNav, onProChanged }) {
  const q = useAdminQuery("nextrep_admin_user_detail", { p_user_id: userId }, [userId]);
  // while re-fetching after a PRO change keep showing the previous data (no flash, no lost notice)
  const u = q.status === "ok" || (q.status === "loading" && q.data && q.data.user_id === userId) ? q.data : null;
  return (
    <div data-testid="admin-user-detail">
      <button onClick={onBackToList} className="text-orange-400 text-sm font-semibold mb-3">
        ← Wróć do listy
      </button>
      {!u ? (
        <AdminLoadState q={q} />
      ) : (
        <div className="space-y-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-neutral-100 font-semibold break-all min-w-0">{u.email || "Brak e-maila"}</p>
              <AdminRoleBadge role={u.role} />
            </div>
            <p className="text-neutral-500 text-xs uppercase font-semibold mt-2 mb-1">Konto</p>
            <AdminRow label="User ID" value={<span className="text-xs break-all">{u.user_id}</span>} />
            <AdminRow label="Rejestracja" value={adminDate(u.created_at)} />
            <AdminRow label="Rola" value={u.role === "admin" ? "ADMIN" : "USER"} />
            <AdminRow label="E-mail potwierdzony" value={u.email_confirmed ? "Tak" : "Nie"} />
            <AdminRow label="Ostatnie logowanie" value={adminDate(u.last_sign_in_at)} />
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-neutral-500 text-xs uppercase font-semibold mb-1">Dane NEXTREP</p>
            <AdminRow label="Treningi" value={u.workouts} />
            <AdminRow label="Plany" value={u.plans} />
            <AdminRow label="Ćwiczenia" value={u.exercises} />
            <AdminRow label="Pomiary" value={u.measurements} />
            <AdminRow label="Ostatni trening" value={u.last_workout_date ? fmtDate(u.last_workout_date) : "Brak treningów"} />
            <AdminRow label="Ostatnia zmiana danych w chmurze" value={adminDate(u.last_cloud_change)} />
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-neutral-500 text-xs uppercase font-semibold mb-1">Status</p>
            <AdminRow label="Rola" value={u.role === "admin" ? "ADMIN" : "USER"} />
            <AdminRow label="Free / PRO" value={u.pro_available ? (u.pro ? "PRO" : "Free") : "Brak danych serwerowych (PRO jest dziś lokalne)"} />
          </div>
          {u.pro_available ? (
            <AdminProSection
              userId={u.user_id}
              email={u.email}
              onPushNav={onPushNav}
              onChanged={(id) => {
                q.reload();
                if (onProChanged) onProChanged(id);
              }}
            />
          ) : (
            <p className="text-neutral-600 text-xs px-1">Zarządzanie PRO pojawi się po wdrożeniu migracji Stage 3.</p>
          )}
          <p className="text-neutral-600 text-xs px-1">Dane treningowe użytkownika są tylko do odczytu.</p>
        </div>
      )}
    </div>
  );
}

function AdminScreen({ onExit, onPushNav, onProChanged }) {
  // Every entry is confirmed again by the server — a manipulated client state can at most
  // render this component, never make the server answer "admin".
  const [state, setState] = useState({ status: "verifying", data: null });
  useEffect(() => {
    let alive = true;
    supabase
      .rpc("nextrep_admin_session")
      .then(({ data, error }) => {
        if (!alive) return;
        setState(error || !data || data.role !== "admin" ? { status: "denied", data: null } : { status: "ok", data });
      })
      .catch(() => alive && setState({ status: "denied", data: null }));
    return () => {
      alive = false;
    };
  }, []);
  if (state.status === "verifying") return <AdminAccessMessage title="NEXTREP ADMIN" text="Sprawdzanie uprawnień…" onExit={onExit} />;
  if (state.status !== "ok") return <AdminAccessMessage title="BRAK DOSTĘPU" text="Ten obszar jest dostępny tylko dla administratorów NEXTREP." onExit={onExit} />;
  return <AdminPanel email={state.data.email} onExit={onExit} onPushNav={onPushNav} onProChanged={onProChanged} />;
}

function AdminPanel({ email, onExit, onPushNav, onProChanged }) {
  // Structure ready for later sections (PRO, Preview, Testy, Diagnostyka, Feature Flags);
  // Etap 2 implements only Dashboard and Użytkownicy (list + detail), all read-only.
  const [view, setView] = useState({ name: "dashboard" });
  const go = (next) => {
    if (onPushNav) onPushNav();
    setView(next);
  };
  useEffect(() => {
    const viewBack = view.name === "user" ? () => setView({ name: "users" }) : view.name === "users" ? () => setView({ name: "dashboard" }) : null;
    adminBackRef.current = () => {
      if (adminModalCloseRef.current) return adminModalCloseRef.current(); // Back closes an open admin modal first
      if (viewBack) viewBack();
    };
    adminBackRef.hasViewBack = !!viewBack;
    return () => {
      adminBackRef.current = null;
      adminBackRef.hasViewBack = false;
    };
  }, [view.name]);
  return (
    <div className="min-h-screen bg-app-depth font-body pb-10" data-testid="admin-panel">
      <FontStyles />
      <div className="px-5 pt-5 pb-3 border-b border-neutral-800">
        <button onClick={onExit} className="text-orange-400 text-sm font-semibold mb-2">
          ← Wróć do NEXTREP
        </button>
        <h1 className="font-display text-3xl text-neutral-50 tracking-wide leading-none">NEXTREP ADMIN</h1>
        <p className="text-neutral-400 text-sm mt-1">Centrum administracyjne NEXTREP</p>
        <p className="text-neutral-600 text-xs mt-0.5 break-all">Zalogowano jako administrator · {email}</p>
        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 mt-3" role="tablist">
          {[
            ["dashboard", "Dashboard"],
            ["users", "Użytkownicy"],
          ].map(([k, label]) => {
            const active = view.name === k || (k === "users" && view.name === "user");
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                onClick={() => !active && go({ name: k })}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${active ? "bg-orange-500 text-neutral-950" : "text-neutral-400"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-5 pt-4">
        {view.name === "dashboard" && <AdminDashboard onOpenUsers={() => go({ name: "users" })} onOpenUser={(id) => go({ name: "user", id })} />}
        {view.name === "users" && <AdminUsers onOpenUser={(id) => go({ name: "user", id })} />}
        {view.name === "user" && <AdminUserDetail userId={view.id} onBackToList={() => setView({ name: "users" })} onPushNav={onPushNav} onProChanged={onProChanged} />}
      </div>
    </div>
  );
}

// Route guard for "admin": the only place that decides what the admin route renders.
function AdminGate({ authUser, adminState, onExit, onPushNav, onProChanged }) {
  if (!supabase || !authUser) {
    return <AdminAccessMessage title="BRAK DOSTĘPU" text="Zaloguj się na konto administratora, żeby otworzyć NEXTREP ADMIN." onExit={onExit} />;
  }
  if (adminState.userId !== authUser.id || adminState.status === "checking") {
    return <AdminAccessMessage title="NEXTREP ADMIN" text="Sprawdzanie uprawnień…" onExit={onExit} />;
  }
  if (adminState.status !== "admin") {
    return <AdminAccessMessage title="BRAK DOSTĘPU" text="Ten obszar jest dostępny tylko dla administratorów NEXTREP." onExit={onExit} />;
  }
  return <AdminScreen key={authUser.id} onExit={onExit} onPushNav={onPushNav} onProChanged={onProChanged} />;
}

