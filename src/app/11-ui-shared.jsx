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

// I4 — bottom navigation B2 (master NAV-B2 v1, approved 14.10.2026; canvas v81 boards NavB2-*, NavIcon-*).
// 7 production targets, same order and routing. Active tab: #FF851B, line 2.25 vs 1.75, label 500 vs 400,
// 28 × 2 indicator, glow limited to the tab, aria-current. Safe area: max(inset, 8 px). When the labels
// no longer fit (enlarged text / page zoom) the bar shows the 7 icons only (row 56 px, NavIcon boards),
// names in aria-label, visible keyboard focus. The bar height is published as --nr-nav-h.
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
  useEffect(() => {
    const check = () => {
      const nav = navRef.current;
      if (!nav) return;
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
  return (
    <nav
      ref={navRef}
      aria-label="Nawigacja główna"
      data-variant="B2"
      data-layout={iconOnly ? "icons" : "1row"}
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        background: "linear-gradient(180deg, #121213 0%, #0B0B0C 55%, #090909 100%)",
        borderTop: "1px solid rgba(255,133,27,.45)",
        boxShadow: "0 -10px 22px -14px rgba(255,133,27,.3)",
        fontFamily: "'Barlow Condensed', Inter, sans-serif",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${NAV_B2_ITEMS.length}, minmax(0, 1fr))`, gridAutoRows: iconOnly ? "56px" : "62px" }}>
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
              style={{ gap: "4px", padding: "0 2px", color: active ? "#FF851B" : "#B8B8B8", background: "transparent" }}
            >
              {active && (
                <span aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
                  <span style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 46% 58% at 50% 0%, rgba(255,133,27,.11) 0%, rgba(255,133,27,.04) 55%, rgba(255,133,27,0) 100%)" }} />
                  <span style={{ position: "absolute", top: 0, left: "50%", width: "28px", height: "2px", marginLeft: "-14px", borderRadius: "0 0 2px 2px", background: "linear-gradient(90deg, #FF9A3D, #FF6A00)", boxShadow: "0 0 5px rgba(255,133,27,.4)" }} />
                </span>
              )}
              <Icon
                aria-hidden="true"
                size={24}
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

