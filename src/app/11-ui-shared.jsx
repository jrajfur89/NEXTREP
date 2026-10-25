function FontStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap');
      .font-display { font-family: 'Barlow Condensed', 'Inter', sans-serif; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
      .font-body { font-family: 'Inter', sans-serif; }
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      /* Maksymalnie czarne tło ekranów głównych, z delikatną głębią — subtelna poświata u góry
         i lekkie pociemnienie u dołu, żeby nie było płasko, ale kolor pozostał praktycznie czarny. */
      .bg-app-depth {
        background-color: #000000;
        background-image:
          radial-gradient(ellipse 90% 35% at 50% 0%, rgba(255,255,255,0.035), transparent 65%),
          radial-gradient(ellipse 70% 45% at 50% 100%, rgba(0,0,0,0.55), transparent 70%);
      }
      @keyframes pulseRing { 0% { box-shadow: 0 0 0 0 rgba(249,115,22,0.45);} 100% { box-shadow: 0 0 0 14px rgba(249,115,22,0);} }
      .pulse-ring { animation: pulseRing 1.8s ease-out infinite; }
    `}</style>
  );
}

// The person's own brand asset, supplied directly as an image — this is NOT redrawn, vectorized,
// reconstructed, or approximated in any way. Every place the app shows the NEXTREP symbol or
// logo renders this exact source image, only resized (never re-cropped, recolored, or altered).
const NEXTREP_SYMBOL_SRC = __asset_nextrep_symbol;
const NEXTREP_LOGO_SRC = __asset_nextrep_logo;
const NEXTREP_LOGO_STACKED_SRC = __asset_nextrep_logo_stacked;

// Symbol_N.jpg is a 1024x1024 square source image — `size` sets both width and height.
function NextRepSymbol({ size = 32, className = "" }) {
  return (
    <img
      src={NEXTREP_SYMBOL_SRC}
      alt="NEXTREP"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
}

// Horizontal brand lockup (symbol left, "NEXTREP" wordmark right) — 1983x793 source (~2.501:1).
// `height` scales it proportionally, matching the original SVG component's API so every call
// site is unaffected.
function NextRepLogo({ height = 40, className = "" }) {
  const width = Math.round((1983 / 793) * height);
  return (
    <img
      src={NEXTREP_LOGO_SRC}
      alt="NEXTREP — Trenuj. Śledź. Analizuj. Progresuj."
      width={width}
      height={height}
      className={className}
      style={{ width, height, objectFit: "contain", display: "block" }}
    />
  );
}

// Stacked brand lockup (symbol above the "NEXTREP" wordmark) — 1536x1024 source (1.5:1) — used
// where a taller, more vertical mark fits better than the horizontal lockup above.
function NextRepLogoStacked({ height = 80, className = "" }) {
  const width = Math.round((1536 / 1024) * height);
  return (
    <img
      src={NEXTREP_LOGO_STACKED_SRC}
      alt="NEXTREP — Trenuj. Śledź. Analizuj. Progresuj."
      width={width}
      height={height}
      className={className}
      style={{ width, height, objectFit: "contain", display: "block" }}
    />
  );
}


// Maps a level label to a 0/1/2 tier (beginner/intermediate/advanced), covering both the 2-level
// and 3-level template splits used across READY_PLAN_TEMPLATES.
function levelTier(label) {
  if (label === "Zaawansowany") return 2;
  if (label === "Średniozaawansowany") return 1;
  return 0;
}

// Splits the exercise's single free-text `notes` field into a short description and a technique
// bullet list — no data model change, just a display-time parse. A line starting with •, - or *
// is a technique bullet; everything before the first bullet is the description. Content is
// whatever was actually stored for that exercise (static, per-exercise) — never generated.
function parseExerciseNotes(notes) {
  if (!notes) return { description: "", bullets: [] };
  const lines = notes.split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletRe = /^[•\-*]\s*/;
  const descLines = [];
  const bullets = [];
  for (const line of lines) {
    if (bulletRe.test(line)) bullets.push(line.replace(bulletRe, ""));
    else if (bullets.length === 0) descLines.push(line);
  }
  return { description: descLines.join(" "), bullets };
}

// System thumbnail for a plan card — a minimal, outlined athlete silhouette in the app's own dark
// / orange palette (never a stock photo, never a comic/cartoon style). `tier` (0/1/2) very subtly
// increases muscle-definition linework for higher levels; `variant` "ready" tints it orange for
// ready-made templates, "own" keeps it neutral gray for the person's own plans (a single shared
// "system thumbnail" look, per spec — no per-plan photography needed).
function PlanThumbnail({ tier = 0, variant = "ready", size = 48, planKey = null }) {
  const accent = variant === "ready" ? "#F97316" : "#9CA3AF";
  const bg = variant === "ready" ? "bg-orange-500/10 border-orange-500/20" : "bg-neutral-800 border-neutral-700";
  const image = variant === "ready" && planKey ? TEMPLATE_IMAGES[planKey] : null;
  if (image) {
    return (
      <div className="rounded-xl border border-orange-500/20 overflow-hidden flex-shrink-0" style={{ width: size, height: size }}>
        <img src={image} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`rounded-xl border flex items-center justify-center flex-shrink-0 ${bg}`} style={{ width: size, height: size }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="6.5" r="3.4" stroke={accent} strokeWidth="1.6" />
        <path d="M9 26 L10.5 15.5 Q11 12 16 12 Q21 12 21.5 15.5 L23 26" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 15.5 L5.5 20.5 M21.5 15.5 L26.5 20.5" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
        {tier >= 1 && <path d="M13 17.5 L19 17.5" stroke={accent} strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />}
        {tier >= 2 && <path d="M13.5 20.5 L18.5 20.5" stroke={accent} strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />}
      </svg>
    </div>
  );
}

// I5.5 (ATLAS-UX-01, D07 / Q2) — the soft keyboard, ONE detector for the whole app (moved out of the
// Active Workout, behaviour unchanged): the keyboard counts as open when a text field (input /
// textarea) has the focus and the visual viewport is more than 120 px shorter than without the
// keyboard. „Without the keyboard” = the largest visual viewport seen while nothing was typed (an
// Android WebView with adjustResize shrinks window.innerHeight too, so the window is not the base).
// Without visualViewport (old WebView, jsdom) the keyboard is never reported open.
const NR_KEYBOARD_GAP = 120;
let nrViewportBase = 0;
const nrIsTextField = (a) => Boolean(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"));
// the instant check (also for Back handlers): root = only fields inside it count; false = no root yet
function nrSoftKeyboardOpen(root = null) {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return false;
  const a = typeof document !== "undefined" ? document.activeElement : null;
  const typing = nrIsTextField(a) && root !== false && (!root || root.contains(a));
  if (!typing) {
    nrViewportBase = Math.max(nrViewportBase, vv.height);
    return false;
  }
  return vv.height < (nrViewportBase || window.innerHeight || vv.height) - NR_KEYBOARD_GAP;
}
// the hook: re-checks on viewport resize and on focus changes; onOpen(field) runs when it opens
function useSoftKeyboard(rootRef = null, onOpen = null) {
  const [open, setOpen] = useState(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    nrViewportBase = Math.max(nrViewportBase, vv.height);
    const check = () => {
      const now = nrSoftKeyboardOpen(rootRef ? rootRef.current || false : null);
      setOpen(now);
      if (now && onOpenRef.current) onOpenRef.current(document.activeElement);
    };
    const later = () => setTimeout(check, 0);
    vv.addEventListener("resize", check);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", check);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return open;
}

// I4 — bottom navigation B2 (master NAV-B2 v1, approved 14.10.2026; canvas v81 boards NavB2-*, NavIcon-*).
// 7 production targets, same order and routing. Active tab: #FF851B, line 2.25 vs 1.75, label 500 vs 400,
// 28 × 2 indicator, glow limited to the tab, aria-current. When the labels no longer fit (enlarged text /
// page zoom) the bar shows the 7 icons only, names in aria-label, visible keyboard focus. The bar height
// is published as --nr-nav-h.
// I5.5 — Compact B2 (ATLAS-UX-01 §6, proposal DS-C04 / master NAV-B2 v2 — DS-SYNC pending): row 56 px
// in both modes, icon 22, icon–label gap 2, bottom padding = the system safe area only (56 + inset;
// fallback of --nr-nav-h 57 = 56 + 1 px border). Hidden (display: none, --nr-nav-h 0) while the soft
// keyboard is open, on every screen (D07, Q2).
const NAV_B2_ITEMS = [
  { key: "dashboard", label: "Start", icon: Home },
  { key: "exercises", label: "Ćwiczenia", icon: Dumbbell },
  { key: "plans", label: "Plany", icon: ClipboardList },
  { key: "startWorkout", label: "Trening", icon: PlayCircle },
  { key: "stats", label: "Statystyki", icon: TrendingUp },
  { key: "history", label: "Historia", icon: HistoryIcon },
  { key: "more", label: "Więcej", icon: MoreHorizontal },
];
function BottomNav({ screen, onNavigate }) {
  const navRef = useRef(null);
  const [iconOnly, setIconOnly] = useState(false);
  const keyboard = useSoftKeyboard();
  const hiddenRef = useRef(false);
  hiddenRef.current = keyboard;
  const checkRef = useRef(null);
  useEffect(() => {
    const check = () => {
      const nav = navRef.current;
      if (!nav) return;
      if (hiddenRef.current) {
        // hidden with the keyboard: nothing to measure, the content may use the whole height
        try {
          document.documentElement.style.setProperty("--nr-nav-h", "0px");
        } catch {}
        return;
      }
      // every label keeps its natural width (absolute + hidden in the icon mode), so the same
      // measurement decides both ways: a label wider than its tab (minus 2 × 2 px) → icons only
      const labels = [...nav.querySelectorAll("[data-nav-label]")];
      const tooWide = labels.some((l) => {
        const tab = l.parentElement;
        const w = l.getBoundingClientRect().width;
        return tab && w > 0 && tab.clientWidth > 0 && w > tab.clientWidth - 4;
      });
      setIconOnly(tooWide);
      try {
        document.documentElement.style.setProperty("--nr-nav-h", `${Math.round(nav.getBoundingClientRect().height)}px`);
      } catch {}
    };
    checkRef.current = check;
    check();
    let ro = null;
    try {
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(check);
        if (navRef.current) ro.observe(navRef.current);
      }
    } catch {}
    window.addEventListener("resize", check);
    // the label widths change when Barlow Condensed has loaded — measure again then
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    try {
      if (fonts && fonts.ready) fonts.ready.then(check).catch(() => {});
      if (fonts && fonts.addEventListener) fonts.addEventListener("loadingdone", check);
    } catch {}
    return () => {
      window.removeEventListener("resize", check);
      try {
        if (fonts && fonts.removeEventListener) fonts.removeEventListener("loadingdone", check);
      } catch {}
      if (ro) ro.disconnect();
    };
  }, []);
  useEffect(() => {
    if (checkRef.current) checkRef.current(); // hide → --nr-nav-h 0; show → measured again
  }, [keyboard]);
  return (
    <nav
      ref={navRef}
      aria-label="Nawigacja główna"
      data-variant="B2"
      data-size="compact"
      data-layout={iconOnly ? "icons" : "1row"}
      data-keyboard={keyboard ? "open" : undefined}
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{
        display: keyboard ? "none" : undefined,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        background: "linear-gradient(180deg, #121213 0%, #0B0B0C 55%, #090909 100%)",
        borderTop: "1px solid rgba(255,133,27,.45)",
        boxShadow: "0 -10px 22px -14px rgba(255,133,27,.3)",
        fontFamily: "'Barlow Condensed', Inter, sans-serif",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${NAV_B2_ITEMS.length}, minmax(0, 1fr))`, gridAutoRows: "56px" }}>
        {NAV_B2_ITEMS.map((it) => {
          const Icon = it.icon;
          const active = screen === it.key;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onNavigate(it.key)}
              aria-current={active ? "page" : undefined}
              aria-label={iconOnly ? it.label : undefined}
              data-testid={`nav-${it.key}`}
              className="relative flex flex-col items-center justify-center min-w-0 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FF851B]"
              style={{ gap: "2px", padding: "0 2px", color: active ? "#FF851B" : "#B8B8B8", background: "transparent" }}
            >
              {active && (
                <span aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
                  <span style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 46% 58% at 50% 0%, rgba(255,133,27,.11) 0%, rgba(255,133,27,.04) 55%, rgba(255,133,27,0) 100%)" }} />
                  <span style={{ position: "absolute", top: 0, left: "50%", width: "28px", height: "2px", marginLeft: "-14px", borderRadius: "0 0 2px 2px", background: "linear-gradient(90deg, #FF9A3D, #FF6A00)", boxShadow: "0 0 5px rgba(255,133,27,.4)" }} />
                </span>
              )}
              <Icon
                aria-hidden="true"
                size={22}
                strokeWidth={active ? 2.25 : 1.75}
                style={{ position: "relative", flex: "none", filter: active ? "drop-shadow(0 0 2.5px rgba(255,133,27,.28))" : "none" }}
              />
              <span
                data-nav-label=""
                style={{
                  position: iconOnly ? "absolute" : "relative",
                  visibility: iconOnly ? "hidden" : "visible",
                  fontSize: "13px",
                  lineHeight: "15px",
                  fontWeight: active ? 500 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TopBar({ title, onBack, right }) {
  return (
    <div className="sticky top-0 z-20 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center gap-3">
      {onBack ? (
        <button onClick={onBack} className="p-1 -ml-1 text-neutral-300 active:text-orange-500">
          <ArrowLeft size={22} />
        </button>
      ) : (
        <div className="w-6" />
      )}
      {/* Long titles (e.g. ready-plan names) scale down on narrow phones so a long word isn't split
          mid-word at 360 px; from ~417 px wide this is exactly text-3xl (30 px / 1.2) again. */}
      <h1
        className={`font-display tracking-wide text-neutral-50 flex-1 min-w-0 break-words ${
          typeof title === "string" && title.length > 20 ? "text-[clamp(1.375rem,7.2vw,1.875rem)] leading-[1.2]" : "text-3xl"
        }`}
      >
        {title}
      </h1>
      {right}
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle, compact }) {
  return (
    <div className={`flex flex-col items-center text-center px-6 ${compact ? "py-6" : "py-14"}`}>
      <div className={`rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center ${compact ? "w-11 h-11 mb-2" : "w-16 h-16 mb-4"}`}>
        <Icon size={compact ? 18 : 26} className="text-neutral-600" />
      </div>
      <p className={`text-neutral-300 font-semibold ${compact ? "text-sm" : ""}`}>{title}</p>
      {subtitle && <p className={`text-neutral-500 mt-1 max-w-xs ${compact ? "text-xs" : "text-sm"}`}>{subtitle}</p>}
    </div>
  );
}

function EquipmentBadge({ exercise }) {
  const kind = getExerciseKind(exercise);
  const map = {
    weight: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    bodyweight: "bg-lime-500/15 text-lime-400 border-lime-500/30",
    bodyweightPlus: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    time: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    sets: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    cardio: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${map[kind] || map.weight}`}>
      {exercise.isTimeBased && <Clock size={11} />}
      {exercise.isSetsOnly && <Layers size={11} />}
      {(exercise.equipment || []).join(" + ")}
    </span>
  );
}

function KindBadge({ kind }) {
  const map = {
    weight: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    bodyweight: "bg-lime-500/15 text-lime-400 border-lime-500/30",
    bodyweightPlus: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    time: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    sets: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    cardio: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[kind] || map.weight}`}>
      {KIND_LABELS[kind]?.label || "Ćwiczenie"}
    </span>
  );
}

function CategoryBadge({ category }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-400 font-medium">
      {category}
    </span>
  );
}

function CategoryBadges({ categories }) {
  return (
    <>
      {(categories || []).map((c) => (
        <CategoryBadge key={c} category={c} />
      ))}
    </>
  );
}

function CategoryTiles({ categories, onSelect, includeAll, countFor }) {
  const list = categories;
  return (
    <div className="grid grid-cols-2 gap-3">
      {list.map((cat) => {
        const image = CATEGORY_IMAGES[cat] || CATEGORY_IMAGES[categoryVisualKey(cat)];
        const count = countFor ? countFor(cat) : null;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden active:scale-95 active:border-orange-500/50 text-left"
          >
            {image ? (
              <img src={image} alt={cat} className="w-full aspect-square object-cover" />
            ) : (
              <div className="w-full aspect-square bg-neutral-800 flex items-center justify-center">
                <Dumbbell size={28} className="text-neutral-500" />
              </div>
            )}
            <div className="px-3 py-2.5">
              <span className="text-neutral-100 font-semibold text-sm block">{cat}</span>
              {count != null && <span className="text-neutral-500 text-xs">{count} {plWord(count, "ćwiczenie", "ćwiczenia", "ćwiczeń")}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FilterPickerSheet({ title, options, selected, onSelect, onClose, includeAll = true }) {
  const list = includeAll ? ["Wszystkie", ...options] : options;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 overflow-y-auto no-scrollbar" style={{ maxHeight: "75vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
        <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-4">{title}</h2>
        <div className="flex flex-wrap gap-2 pb-2">
          {list.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onSelect(opt);
                onClose();
              }}
              className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${
                selected === opt ? "bg-orange-500 border-orange-500 text-neutral-950" : "bg-neutral-950 border-neutral-800 text-neutral-300"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterTrigger({ label, value, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-between gap-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-left"
    >
      <span className="min-w-0">
        <span className="block text-neutral-600 text-xs uppercase font-semibold leading-none">{label}</span>
        <span className="block text-neutral-200 text-sm font-medium break-words mt-0.5">{value}</span>
      </span>
      <CaretDown size={15} className="text-neutral-500 flex-shrink-0" />
    </button>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6" onClick={onCancel}>
      <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={20} className={danger ? "text-red-400" : "text-orange-400"} />
          <p className="font-display text-2xl text-neutral-50 tracking-wide">{title}</p>
        </div>
        <p className="text-neutral-400 text-sm mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
            Anuluj
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl font-bold text-neutral-950 ${danger ? "bg-red-500" : "bg-orange-500"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Welcome Screen                                                          */
/* ---------------------------------------------------------------------- */

// Startup intro — a short (~3s), skippable placeholder for the future NEXTREP video. Dark
// cinematic scene fades out while the logo glows in, then hands off to whatever screen the app
// would normally show first (Welcome or Dashboard) — this component has no opinion about that,
// it only delays showing it briefly.
//
// FUTURE: replace intro animation with local NEXTREP video
// When a real clip exists (e.g. assets/video/nextrep-intro.mp4 or .webm), swap the JSX below for:
//   <video className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline
//          onEnded={onFinish} src="assets/video/nextrep-intro.mp4" />
// and keep the same onFinish contract — nothing else in the app needs to change.
// NEXTREP animated splash intro (~2.8s). Every asset here is the existing approved brand asset
// NEXTREP startup intro — plays the brand's official MP4 splash (nextrep-intro.mp4, a local,
// offline-cached asset — never a remote URL, never re-encoded, never converted to base64 or
// rebuilt from CSS/canvas/frames) before routing to onboarding or the dashboard. Autoplays
// muted + playsInline (required for mobile/PWA autoplay), has zero UI of its own (no controls,
// no skip button, no text, no header), fills the screen without distorting the video's own
// aspect ratio, and hands off to onFinish exactly once — on the video's real `ended` event, not
// a fixed timeout. A short safety fallback (slightly longer than the clip) and an `onError`
// handler both also call onFinish, so a device that can't play the file is never stuck here.
function IntroAnimation({ onFinish }) {
  const videoRef = useRef(null);
  const firedRef = useRef(false);

  const finishOnce = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.muted = true;
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    // Safety fallback: the clip is ~4s — if `ended` (or `error`) never fires for any reason,
    // don't leave the person stuck on the splash.
    const fallback = setTimeout(finishOnce, 8000);
    return () => clearTimeout(fallback);
  }, [finishOnce]);

  return (
    <div className="h-screen w-full bg-black relative overflow-hidden">
      <video
        ref={videoRef}
        src="./nextrep-intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        controls={false}
        disablePictureInPicture
        className="absolute inset-0 w-full h-full object-cover"
        onEnded={finishOnce}
        onError={finishOnce}
      />
    </div>
  );
}

function OnboardingFlow({ userName, onSaveName, onComplete }) {
  const [step, setStep] = useState(0);
  const [nameInput, setNameInput] = useState(userName || "");
  const [slogan] = useState(randomSlogan);

  if (step === 0) {
    return (
      <div className="h-screen relative flex flex-col font-body overflow-hidden bg-neutral-950">
        <FontStyles />
        <div className="relative w-full overflow-hidden flex-shrink-0" style={{ height: "44%" }}>
          <img src={WELCOME_BG_IMAGE} alt="Trening siłowy" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/30 via-transparent to-neutral-950" />
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full bg-orange-500/25 blur-3xl pointer-events-none" />
        </div>

        <div className="flex-1 min-h-0 flex flex-col px-6 pt-3">
          <NextRepLogo height={26} className="flex-shrink-0" />
          <p className="font-display text-3xl text-neutral-50 tracking-wide mt-3 leading-tight" style={{ maxWidth: "17rem" }}>
            "Your next rep starts with your last."
          </p>
          <p className="text-orange-400 text-sm mt-2 font-medium" style={{ maxWidth: "15rem" }}>
            Twój poprzedni trening wyznacza kolejny cel.
          </p>

          <div className="flex-1" />

          <p className="text-neutral-400 text-sm font-semibold tracking-wide" style={{ letterSpacing: "0.05em" }}>
            Trenuj. Śledź. Analizuj. Progresuj.
          </p>

          <button
            onClick={() => setStep(1)}
            className="mt-4 mb-3 w-full bg-orange-500 active:bg-orange-600 text-neutral-950 font-bold text-lg py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 flex-shrink-0"
          >
            ZACZYNAMY <ChevronRight size={22} strokeWidth={3} />
          </button>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="h-screen flex flex-col font-body bg-neutral-950 px-6">
        <FontStyles />
        <div className="flex-1" />
        <p className="font-display text-3xl text-neutral-50 tracking-wide leading-tight">Jak mamy się do Ciebie zwracać?</p>
        <p className="text-neutral-500 text-sm mt-2">Możesz to pominąć i podać imię później.</p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Twoje imię"
          autoFocus
          className="w-full mt-6 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-4 text-neutral-100 text-lg outline-none focus:border-orange-500"
        />
        <div className="flex-1" />
        <button
          onClick={() => {
            if (nameInput.trim()) onSaveName(nameInput.trim());
            setStep(2);
          }}
          className="mb-3 w-full bg-orange-500 active:bg-orange-600 text-neutral-950 font-bold text-lg py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
        >
          DALEJ <ChevronRight size={22} strokeWidth={3} />
        </button>
        <button onClick={() => setStep(2)} className="mb-8 text-neutral-500 text-sm font-medium py-2">
          Pomiń
        </button>
      </div>
    );
  }

  const chain = [
    { label: "POPRZEDNI TRENING", icon: Dumbbell },
    { label: "ANALIZA", icon: TrendingUp },
    { label: "NASTĘPNY CEL", icon: Target },
  ];
  return (
    <div className="h-screen flex flex-col font-body bg-neutral-950 px-6">
      <FontStyles />
      <div className="flex justify-end pt-5 flex-shrink-0">
        <button onClick={onComplete} className="text-neutral-500 text-sm font-medium py-1">
          Pomiń
        </button>
      </div>
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-1.5 mb-6">
        {chain.map(({ label, icon: Icon }, i) => (
          <React.Fragment key={label}>
            <div className="w-full flex items-center gap-3 rounded-xl py-3 px-4 border bg-neutral-900 border-neutral-800">
              <Icon size={18} className="text-orange-400 flex-shrink-0" />
              <span className="text-neutral-300 font-semibold text-sm tracking-wide">{label}</span>
            </div>
            <ChevronDown size={18} className="text-neutral-600" />
          </React.Fragment>
        ))}
        <div className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 border-2 bg-neutral-900 border-orange-500">
          <NextRepSymbol size={20} />
          <span className="text-sm tracking-wide font-bold text-orange-500">NEXT REP</span>
        </div>
      </div>
      <p className="font-display text-2xl text-neutral-50 tracking-wide leading-tight text-center">Każdy trening jest informacją dla następnego.</p>
      <p className="text-neutral-500 text-sm mt-3 text-center leading-relaxed">
        NEXTREP wykorzystuje Twoją historię, żeby pomóc Ci podejść do kolejnego treningu z konkretnym celem.
      </p>
      <div className="flex-1" />
      <button
        onClick={onComplete}
        className="mb-8 w-full bg-orange-500 active:bg-orange-600 text-neutral-950 font-bold text-lg py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
      >
        ZACZYNAMY TRENING <ChevronRight size={22} strokeWidth={3} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                               */
/* ---------------------------------------------------------------------- */

function fmtBackupTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const timeStr = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `dzisiaj, ${timeStr}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `wczoraj, ${timeStr}`;
  return `${fmtDateShort(iso)}, ${timeStr}`;
}

function MoreMenu({ onNavigate, isPro, onOpenUnlock, authUser, isAdmin = false }) {
  const [backupOpen, setBackupOpen] = useState(false);
  const items = [
    {
      key: "account",
      label: "Moje konto",
      subtitle: authUser ? `Zalogowano: ${authUser.email}` : "Zaloguj się lub załóż konto (opcjonalnie)",
      icon: UserCircle2,
      action: () => onNavigate("account"),
    },
    { key: "measurements", label: "Pomiary", subtitle: "Śledź wagę, obwody i inne parametry", icon: Ruler, action: () => onNavigate("measurements") },
    { key: "backup", label: "Kopia zapasowa", subtitle: "Zapisz lub przywróć dane lokalnie na tym urządzeniu", icon: Download, action: () => setBackupOpen(true) },
    { key: "feedback", label: "Zgłoś problem lub sugestię", subtitle: "Napisz do nas bezpośrednio", icon: MessageSquare, action: () => onNavigate("feedback") },
    {
      key: "premium",
      label: "NEXTREP PRO",
      subtitle: isPro ? "Masz aktywny dostęp" : "Zobacz, dokąd zmierza Twój progres",
      icon: TrendingUp,
      action: onOpenUnlock,
      highlight: true,
    },
    ...(isAdmin
      ? [{ key: "admin", label: "NEXTREP ADMIN", subtitle: "Panel administracyjny", icon: Lock, action: () => onNavigate("admin") }]
      : []),
  ];
  return (
    <div className="min-h-screen bg-app-depth font-body pb-28">
      <FontStyles />
      <TopBar title="WIĘCEJ" />
      <div className="px-5 pt-3 space-y-2">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={it.action}
              className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left active:scale-[0.98] ${
                it.highlight ? "bg-orange-500/10 border-orange-500/30" : "bg-neutral-900 border-neutral-800"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${it.highlight ? "bg-orange-500/20" : "bg-neutral-800"}`}>
                <Icon size={19} className={it.highlight ? "text-orange-400" : "text-neutral-300"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-neutral-100 font-semibold text-sm">{it.label}</p>
                <p className="text-neutral-500 text-xs mt-0.5">{it.subtitle}</p>
              </div>
              <ChevronRight size={18} className="text-neutral-600 flex-shrink-0" />
            </button>
          );
        })}
      </div>
      {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}
      <BottomNav screen="more" onNavigate={onNavigate} />
    </div>
  );
}

// ===== NEXTREP ADMIN (Etap 1: fundament ról) =====
// Authorisation is NEVER decided in the browser: the role comes from Supabase
// (nextrep_my_role / nextrep_admin_session — SECURITY DEFINER functions over the RLS-protected
// nextrep_user_roles table). Nothing about the role is stored in localStorage or cached; it's
// re-read for every signed-in user id and dropped the moment the session ends or changes.
const ADMIN_HASH = "#/admin";


/* ---------------------------------------------------------------------- */
/* I4 — building blocks of the approved UI masters (canvas v81)             */
/* Values copied from the master boards (Dashboard, New User, Interrupted,  */
/* Training Entry Flow, Active Workout, Completion & Summary). Colours are  */
/* the DESIGN.md §2 tokens incl. the G02 fixes (text-muted #8E8E8E,          */
/* border-control #66666A).                                                  */
/* ---------------------------------------------------------------------- */
const NR = {
  bg: "#090909",
  card: "#0B0B0C",
  textDisplay: "#FFFFFF",
  textPrimary: "#F5F5F5",
  textSecondary: "#B8B8B8",
  textMuted: "#8E8E8E",
  warm: "#FF851B",
  brand: "#FF6A00",
  success: "#42C98A",
  danger: "#F2555A",
  dangerText: "#FF6B60",
  hairline: "#2A2A2A",
  control: "#66666A",
  // DS-SYNC ATLAS-UX-01 / DS-D17 (Design System v18): tokens used by the atlas components (I5.6)
  brandBright: "#FF9A3D", // brand-bright — also the atlas text-link colour
  surfaceTertiary: "#222224", // surface-tertiary — chip surface (D16)
  surfaceControl: "#121213", // surface-control — fields, „Filtry” button
  surfaceRaised: "#1A1A1B", // surface-raised — static raised fill (secondary button, icon well)
  textChip: "#D9D9D9", // text-chip — text of row chips
  font: "'Barlow Condensed', Inter, sans-serif",
  cardSurface:
    "radial-gradient(90% 70% at 0% 0%, rgba(255,133,27,.07) 0%, rgba(255,133,27,0) 60%), linear-gradient(180deg, #151515 0%, #0F0F10 55%, #090909 100%)",
  cardShadow: "inset 0 1px 0 rgba(255,255,255,.05), 0 10px 22px -6px rgba(0,0,0,.9)",
  heroBorder:
    "linear-gradient(#0B0B0C, #0B0B0C) padding-box, linear-gradient(160deg, #FF9A3D 0%, rgba(255,133,27,.9) 18%, rgba(255,106,0,.55) 50%, rgba(255,106,0,.32) 100%) border-box",
  ctaFill: "linear-gradient(180deg, #FF851B 0%, #FF6A00 55%, #FF6A00 100%)",
  ctaShadow: "inset 0 1px 0 rgba(255,214,170,.45), 0 4px 18px 0 rgba(255,106,0,.35)",
};
// 3 120 / 12 450 — thousands separated by a non-breaking space from 1 000 on (pl-PL groups only
// from 10 000), as on the masters
function fmtThousands(n) {
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return v < 0 ? `−${s}` : s;
}
const nrHeadText = {
  fontWeight: 500,
  fontSize: "15px",
  lineHeight: "18px",
  letterSpacing: ".03em",
  textTransform: "uppercase",
  background: "linear-gradient(180deg,#FF9A3D 0%,#FF6A00 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};
function NrSectionHead({ icon: Icon, children, as = "span", id }) {
  const Tag = as;
  return (
    <Tag id={id} style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
      {Icon && <Icon aria-hidden="true" size={18} color={NR.warm} strokeWidth={2.25} style={{ flexShrink: 0 }} />}
      <span style={nrHeadText}>{children}</span>
    </Tag>
  );
}
// Primary pill CTA (Dashboard / New User / Interrupted): 192 × 36 pill in a 44 px touch target.
function NrPillCta({ children, onClick, testId, ariaLabel }) {
  return (
    <button
      type="button"
      data-cta="primary"
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onClick}
      className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]"
      style={{ alignSelf: "flex-start", minHeight: "44px", padding: "4px 0", border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
    >
      <span
        style={{
          minWidth: "192px",
          minHeight: "36px",
          boxSizing: "border-box",
          padding: "6px 18px",
          borderRadius: "8px",
          background: NR.ctaFill,
          boxShadow: NR.ctaShadow,
          color: NR.bg,
          fontFamily: NR.font,
          fontWeight: 600,
          fontSize: "18px",
          lineHeight: "20px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          whiteSpace: "nowrap",
        }}
      >
        {children}
        <ArrowRight aria-hidden="true" size={17} strokeWidth={2.5} color={NR.bg} style={{ flexShrink: 0 }} />
      </span>
    </button>
  );
}
// Decorative warm border of a card (top + sides, no bottom; the sides run 12 px below and fade).
function NrFadeBorder({ alpha = 0.5 }) {
  const mask = "linear-gradient(180deg, #000 0%, #000 calc(100% - 30px), rgba(0,0,0,0) 100%)";
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: "-12px",
        border: `1px solid rgba(255,133,27,${alpha})`,
        borderBottom: 0,
        borderRadius: "16px 16px 0 0",
        pointerEvents: "none",
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  );
}
// Hero card with the gradient border, photo on the right and warm light in the top-left corner.
// The photo is TEMPORARY (masters: "zdjęcia tymczasowe"): the app's own existing image.
function NrHeroCard({ children, labelledBy, testId, photo = WELCOME_BG_IMAGE, photoPos = "50% 28%", bottomShade = "linear-gradient(0deg, rgba(9,9,9,.6) 0%, rgba(9,9,9,0) 30%)" }) {
  return (
    <section
      aria-labelledby={labelledBy}
      data-testid={testId}
      style={{ position: "relative", borderRadius: "16px", overflow: "hidden", border: "1px solid transparent", background: NR.heroBorder, boxShadow: "0 12px 28px -8px rgba(0,0,0,.85)" }}
    >
      <img src={photo} alt="" data-photo="temporary" style={{ position: "absolute", top: 0, right: 0, width: "220px", height: "100%", objectFit: "cover", objectPosition: photoPos }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(55% 80% at 82% 32%, rgba(255,133,27,.24) 0%, rgba(255,133,27,0) 70%)", mixBlendMode: "screen" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #0B0B0C 0%, #0B0B0C 34%, rgba(11,11,12,.7) 48%, rgba(11,11,12,0) 64%)" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "15px", overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(130px 100px at 0 0, rgba(255,154,61,.42) 0%, rgba(255,106,0,.16) 45%, rgba(255,106,0,0) 100%)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "20px", background: "linear-gradient(90deg, rgba(255,133,27,.40) 0%, rgba(255,106,0,.14) 40%, rgba(255,106,0,0) 72%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, rgba(0,0,0,0) 100%)", maskImage: "linear-gradient(180deg, #000 0%, rgba(0,0,0,0) 100%)" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "20px", background: "linear-gradient(180deg, rgba(255,133,27,.40) 0%, rgba(255,106,0,.14) 40%, rgba(255,106,0,0) 78%)", WebkitMaskImage: "linear-gradient(90deg, #000 0%, rgba(0,0,0,0) 100%)", maskImage: "linear-gradient(90deg, #000 0%, rgba(0,0,0,0) 100%)" }} />
      </div>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: bottomShade }} />
      {children}
    </section>
  );
}
// Decorative photo in the top-right of the Dashboard screens (temporary photo, faded to #090909).
function NrHeaderPhoto() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: "80px", right: 0, width: "204px", height: "140px", overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 70% at 72% 40%, rgba(255,133,27,.24) 0%, rgba(255,133,27,0) 70%)" }} />
      <img src={WELCOME_BG_IMAGE} alt="" data-photo="temporary" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #090909 0%, rgba(9,9,9,.35) 12%, rgba(9,9,9,0) 26%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, #090909 0%, rgba(9,9,9,0) 22%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #090909 0%, rgba(9,9,9,0) 12%)" }} />
    </div>
  );
}
// Screen frame of the Dashboard-family masters: #090909, Barlow, 12 px gutters, 12 px gaps, content
// ending 16 px above the B2 bar (--nr-nav-h).
function NrScreen({ children, testId, screen }) {
  return (
    <div
      data-testid={testId}
      data-screen={screen}
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        background: NR.bg,
        color: NR.textPrimary,
        fontFamily: NR.font,
        padding: "max(env(safe-area-inset-top, 0px), 12px) 12px calc(var(--nr-nav-h, 57px) + 16px)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {children}
    </div>
  );
}
// Bottom sheet dialog of the masters (IWM options, TEFM confirmations): dark gradient, warm top
// edge, grab handle, role=dialog + aria-modal, Escape closes, focus moves into the sheet and back.
function NrSheet({ children, onClose, labelledBy, testId, ariaLabel, menu = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = typeof document !== "undefined" ? document.activeElement : null;
    const first = ref.current && ref.current.querySelector("button, [href], input, select, textarea");
    if (first && first.focus) first.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && onClose) onClose();
      if (e.key === "Tab" && ref.current) {
        const els = [...ref.current.querySelectorAll("button, [href], input, select, textarea")].filter((el) => !el.disabled);
        if (!els.length) return;
        const a = els[0];
        const z = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      try {
        if (prev && prev.focus) prev.focus();
      } catch {}
    };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div aria-hidden="true" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.7)" }} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        data-testid={testId}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          boxSizing: "border-box",
          padding: menu ? "10px 8px max(env(safe-area-inset-bottom, 0px), 12px)" : "10px 16px max(env(safe-area-inset-bottom, 0px), 8px)",
          borderRadius: "20px 20px 0 0",
          background: "linear-gradient(180deg, #151515 0%, #0F0F10 100%)",
          borderTop: "1px solid rgba(255,133,27,.35)",
          fontFamily: NR.font,
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <div aria-hidden="true" style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#3A3A3A", margin: menu ? "0 auto 10px" : "0 auto 16px" }} />
        <div style={{ paddingBottom: menu ? "8px" : "16px" }}>{children}</div>
      </div>
    </div>
  );
}
// Buttons of the sheets: primary (orange gradient), neutral, danger text, danger fill.
function NrSheetButton({ variant = "neutral", children, onClick, testId, disabled, noRearm = false }) {
  const base = { minHeight: "48px", width: "100%", border: 0, borderRadius: "10px", fontFamily: NR.font, fontSize: "19px", fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 };
  const v =
    variant === "primary"
      ? { background: NR.ctaFill, boxShadow: NR.ctaShadow, color: NR.bg }
      : variant === "dangerFill"
      ? { background: NR.danger, color: NR.bg }
      : variant === "dangerText"
      ? { background: "#1A1A1B", color: NR.dangerText, fontWeight: 500 }
      : variant === "dangerOutline"
      ? { background: "transparent", color: NR.dangerText, border: `1px solid ${NR.danger}`, fontWeight: 500 }
      : { background: "#1A1A1B", color: NR.textPrimary, fontWeight: 500 };
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} data-no-rearm={noRearm ? "" : undefined} className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]" style={{ ...base, ...v }}>
      {children}
    </button>
  );
}
