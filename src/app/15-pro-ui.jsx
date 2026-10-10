// NEXTREP PRO — value communication. Every point describes something the app really does today
// (progression engine, PRO report, statistics); nothing promises specific kg increments.
const PRO_CARD_POINTS = [
  { icon: TrendingUp, text: "Zobacz trend, nie tylko pojedynczy wynik" },
  { icon: HistoryIcon, text: "Porównujesz się do właściwego punktu odniesienia" },
  { icon: Dumbbell, text: "Progres analizowany jest z powtórzeń, RIR, objętości i stabilizacji ciężaru" },
  { icon: LineChart, text: "Zobacz, jak zmieniają się Twoje ćwiczenia w czasie" },
];
const PRO_SECTIONS = [
  {
    title: "Zobacz trend, nie tylko pojedynczy wynik",
    body: [
      "PRO analizuje historię kolejnych wykonań i rozpoznaje trend — zamiast wyciągać wnioski z jednego treningu. Analiza może obejmować do 10 ostatnich wykonań danego ćwiczenia.",
      "Jeden słabszy dzień nie definiuje regresu. Jeden dobry wynik nie tworzy jeszcze trendu.",
    ],
  },
  {
    title: "Porównujesz się do właściwego punktu odniesienia",
    body: [
      "PRO zestawia trening z wcześniejszymi wykonaniami tego samego typu, dzięki czemu widzisz rzeczywistą zmianę, a nie przypadkowe porównanie z innym treningiem. Push porównujesz z wcześniejszym Push.",
      "Chcesz szerszego obrazu? Przełączasz analizę na wszystkie treningi.",
    ],
  },
  {
    title: "Progres to nie tylko większy ciężar",
    body: [
      "Więcej powtórzeń. Lepszy zapas. Wyższa objętość. Stabilizacja nowego ciężaru.",
      "PRO rozpoznaje różne formy progresu i nie uznaje samej zmiany ciężaru automatycznie za progres.",
    ],
  },
  {
    title: "Jakość wykonania to nie to samo co gotowość do progresji ciężarem",
    body: [
      "Ciężki, dobry trening — także do upadku (RIR 0) — jest wartościową pracą. RIR 0 nie jest błędem, regresją ani powodem do zmniejszenia ciężaru. Samo w sobie nie oznacza jednak gotowości do zwiększenia ciężaru.",
      "PRO analizuje kolejne wykonania i sprawdza, czy obecny ciężar jest ustabilizowany i czy pojawia się odpowiedni zapas (RIR 1–2 lub 2). Dopiero wtedy może pojawić się sygnał: „Można rozważyć zwiększenie ciężaru”.",
    ],
  },
  {
    title: "Zobacz, dokąd naprawdę zmierza Twój progres",
    body: [
      "Przy każdym ćwiczeniu: objętość, ciężar roboczy, powtórzenia, RIR, liczba serii, porównanie dziś vs poprzednie wykonanie i wykres ostatnich wykonań. Wszystko w jednym raporcie.",
    ],
  },
  {
    title: "Twój trening w szerszym obrazie",
    body: ["Statystyki tygodnia, miesiąca i całej historii, sygnały progresu, rekordy i pełne raporty treningów."],
  },
];

const PREMIUM_PLANS = {
  monthly: { key: "monthly", label: "Miesięcznie", price: "12,99 zł", period: "/ mies.", billedAs: "Rozliczane co miesiąc." },
  yearly: { key: "yearly", label: "Rocznie", price: "59,99 zł", period: "/ rok", billedAs: "To ok. 5,00 zł/mies. — oszczędzasz ok. 61% względem planu miesięcznego.", badge: "NAJLEPSZA OFERTA" },
};

// Everything here is local and honest about what it is: there is no payment processor and no ad
// SDK connected to this app. "Kontynuuj" just flips a local flag so the gating logic can be
// built and tested now; a real purchase flow would replace it later. "Obejrzyj reklamę" does not
// show a real ad — nothing here claims it does — it only demonstrates the unlock mechanic that a
// real rewarded-ad SDK (e.g. AdMob) would trigger once integrated.
function ProUnlockModal({ proStatus, serverPro = null, onClose, onSetManualPro, onGrantAdUnlock }) {
  const [selectedPlan, setSelectedPlan] = useState("yearly");
  const isPro = hasProAccess(proStatus) || !!serverPro;
  const adActive = proStatus.adUnlockExpiresAt && Date.now() < proStatus.adUnlockExpiresAt;
  const plan = PREMIUM_PLANS[selectedPlan];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 pb-8 overflow-y-auto no-scrollbar" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
        <h2 className="font-display text-3xl text-neutral-50 tracking-wide mb-2">NEXTREP PRO</h2>
        <p className="text-neutral-200 text-sm leading-snug">Za darmo widzisz, co zrobiłeś dzisiaj.</p>
        <p className="text-orange-400 text-sm font-semibold leading-snug mb-4">Z PRO rozumiesz, dokąd zmierza Twój progres.</p>

        <div className="space-y-3 mb-4">
          {PRO_SECTIONS.map((sec, i) => (
            <div key={i} className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
              <p className="font-display text-lg text-neutral-50 tracking-wide leading-tight mb-1">{sec.title}</p>
              {sec.body.map((t, j) => (
                <p key={j} className={`text-neutral-400 text-xs leading-relaxed ${j ? "mt-1.5" : ""}`}>
                  {t}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div className="mb-5 px-1">
          <p className="text-neutral-200 text-xs font-bold uppercase tracking-wide mb-1">Twoje dane. Twój trening. Twój rzeczywisty progres.</p>
          <p className="text-neutral-500 text-xs leading-relaxed">
            Wszystko liczone wyłącznie z zapisanych treningów. Gdy danych jest za mało, NEXTREP mówi to wprost — zamiast rysować trend, którego jeszcze nie ma.
          </p>
          <p className="text-neutral-500 text-xs leading-relaxed mt-1.5">Free mówi, co zrobiłeś. PRO mówi, co to znaczy w czasie.</p>
        </div>

        {isPro ? (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-4">
            <p className="text-orange-400 text-sm font-semibold">
              {serverPro
                ? `NEXTREP PRO jest aktywne na Twoim koncie${serverPro.expires_at ? ` do ${fmtDate(serverPro.expires_at)}` : " (bezterminowo)"}.`
                : proStatus.manualPro ? "NEXTREP PRO jest aktywne." : `Odblokowane tymczasowo do ${new Date(proStatus.adUnlockExpiresAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}.`}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.values(PREMIUM_PLANS).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setSelectedPlan(p.key)}
                  className={`relative text-left rounded-xl border p-3 ${selectedPlan === p.key ? "border-orange-500 bg-orange-500/10" : "border-neutral-800 bg-neutral-950"}`}
                >
                  {p.badge && (
                    <span className="absolute -top-2 left-2 bg-orange-500 text-neutral-950 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{p.badge}</span>
                  )}
                  <p className="text-neutral-400 text-xs font-semibold">{p.label}</p>
                  <p className="text-neutral-50 font-display text-xl tracking-wide mt-1">
                    {p.price} <span className="text-neutral-500 text-xs font-body">{p.period}</span>
                  </p>
                </button>
              ))}
            </div>
            <p className="text-neutral-500 text-xs px-1 mb-4">{plan.billedAs}</p>
          </>
        )}

        {!serverPro && (
        <div className="space-y-2">
          <button
            onClick={() => onSetManualPro(!proStatus.manualPro)}
            className={`w-full py-3 rounded-xl font-bold text-sm ${proStatus.manualPro ? "bg-neutral-800 text-neutral-300" : "bg-orange-500 text-neutral-950"}`}
          >
            {proStatus.manualPro ? "Wyłącz NEXTREP PRO" : `Odblokuj NEXTREP PRO — ${plan.price}${plan.period}`}
          </button>
          <p className="text-neutral-600 text-xs px-1">
            Tryb testowy — do tej aplikacji nie jest podłączony żaden system płatności, więc ten przycisk po prostu włącza dostęp lokalnie, bez żadnej opłaty.
          </p>

          {!proStatus.manualPro && (
            <>
              <button
                onClick={onGrantAdUnlock}
                disabled={adActive}
                className="w-full mt-2 py-3 rounded-xl bg-neutral-800 disabled:opacity-50 text-neutral-200 font-bold text-sm flex items-center justify-center gap-2"
              >
                <PlayCircle size={16} /> {adActive ? "Odblokowane na 24h" : "Obejrzyj reklamę — odblokuj na 24h"}
              </button>
              <p className="text-neutral-600 text-xs px-1">
                Żaden dostawca reklam (np. AdMob) nie jest jeszcze podłączony, więc żadna reklama się nie pokaże — ten przycisk od razu odblokowuje NEXTREP PRO na 24 godziny, żebyś mógł przetestować, jak to będzie działać.
              </p>
            </>
          )}
        </div>
        )}

        <p className="text-neutral-600 text-[11px] leading-relaxed mt-5 pt-4 border-t border-neutral-800">
          Subskrypcję możesz anulować w dowolnym momencie. Odnawia się automatycznie na kolejny okres rozliczeniowy, chyba że zostanie anulowana co najmniej 24 godziny przed końcem bieżącego okresu.
        </p>

        <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-400 font-semibold text-sm">
          Zamknij
        </button>
      </div>
    </div>
  );
}

// Shown instead of a PRO-only screen when the person doesn't currently have access.
function ProPaywall({ onNavigate, onOpenUnlock, title, onBack, navScreen }) {
  return (
    <div className="min-h-screen bg-app-depth font-body pb-10">
      <FontStyles />
      <TopBar title={title || "NEXTREP PRO"} onBack={onBack} />
      <div className="px-5 pt-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center mb-4">
          <TrendingUp size={26} className="text-orange-400" />
        </div>
        <p className="font-display text-2xl text-neutral-50 tracking-wide">ZOBACZ, DOKĄD NAPRAWDĘ ZMIERZA TWÓJ PROGRES</p>
        <p className="text-neutral-400 text-sm mt-2 mb-5 max-w-xs">NEXTREP PRO analizuje historię Twoich treningów i pokazuje nie tylko wynik, ale kierunek zmian.</p>
        <div className="space-y-2.5 mb-6 text-left w-full max-w-xs">
          {PRO_CARD_POINTS.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Icon size={17} className="text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-neutral-300 text-sm leading-snug">{text}</p>
            </div>
          ))}
        </div>
        <button onClick={onOpenUnlock} className="w-full max-w-xs bg-orange-500 text-neutral-950 font-bold py-3.5 rounded-2xl">
          Poznaj NEXTREP PRO
        </button>
      </div>
      {navScreen && <BottomNav screen={navScreen} onNavigate={onNavigate} />}
    </div>
  );
}

