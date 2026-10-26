/* ---------------------------------------------------------------------- */
/* I5.1 — ATLAS-UX-01: view model of the module „Ćwiczenia” (no React)       */
/* I5.2 — its components P1–P9 (end of this file), not yet on any screen.   */
/*                                                                           */
/* Pure functions over the bundled atlas release (ATLAS_RELEASE) and its     */
/* navigation hierarchy (ATLAS_NAVIGATION). Search, facets and the hierarchy */
/* come from the existing engines (buildAtlasIndex, buildHierarchyIndex) —   */
/* nothing is re-implemented, nothing is written, nothing is hard-coded:      */
/* every count follows the data of the release. Handoff: claude/atlas-ux-01-  */
/* i5-handoff.md §3.2.                                                       */
/* ---------------------------------------------------------------------- */

// Polish plural forms of the module's counters (one function for every text).
const ATLAS_PLURALS = {
  exercise: ["ćwiczenie", "ćwiczenia", "ćwiczeń"],
  result: ["wynik", "wyniki", "wyników"],
  subregion: ["podpartia", "podpartie", "podpartii"],
  series: ["seria", "serie", "serii"],
};
function plPlural(n, kind) {
  const f = ATLAS_PLURALS[kind];
  return f ? plWord(n, f[0], f[1], f[2]) : "";
}

// D05 — the short load-model label: the part of the app's existing label before „ — ”.
function shortLoadModelLabel(code) {
  const full = ATLAS_LOAD_MODEL_LABELS[code];
  if (!full) return code == null ? "" : String(code);
  return full.split(" — ")[0];
}

// Sheet E04 dimensions in board order; family and measurementType are not filters (Q5).
const ATLAS_SHEET_DIMENSIONS = Object.freeze([
  { dimension: "equipment", label: "Sprzęt" },
  { dimension: "loadModel", label: "Rodzaj obciążenia" },
  { dimension: "angle", label: "Kąt ławki" },
  { dimension: "grip", label: "Chwyt" },
  { dimension: "position", label: "Pozycja" },
  { dimension: "laterality", label: "Jednostronność" },
]);
// D04 — at most 2 chips per row, in this order; `execution` never.
const ATLAS_ROW_CHIP_DIMENSIONS = Object.freeze(["laterality", "angle", "grip", "position"]);

function atlasBrowseFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) atlasBrowseFreeze(v);
  }
  return value;
}
const atlasScopeKey = (scope) => `${(scope && scope.categoryCode) || ""}|${(scope && scope.subregionCode) || ""}`;

// The whole view model of one atlas release + hierarchy. Validation or index failure → { ok: false }
// (E07-Blad), never an exception into the app.
function createAtlasBrowse(atlas, navigation) {
  let check;
  try {
    check = validateHierarchy(navigation, { atlas });
  } catch (e) {
    return atlasBrowseFreeze({ ok: false, error: String((e && e.message) || e) });
  }
  if (!check || !check.ok) {
    const first = check && (check.issues || []).find((i) => i.level === "error");
    return atlasBrowseFreeze({ ok: false, error: first ? `${first.code}: ${first.message}` : "Hierarchia nieprawidłowa." });
  }
  try {
    const hierarchy = buildHierarchyIndex(navigation);
    const fullIndex = buildAtlasIndex(atlas);
    const dict = (atlas && atlas.dictionaries) || {};
    const equipmentDict = new Map((dict.equipment || []).map((e) => [e.code, e]));
    const attrDict = new Map((dict.variantAttributes || []).map((v) => [v.code, v]));
    const active = (atlas.exercises || []).filter((e) => e && e.status === "active");
    const byId = new Map(active.map((e) => [e.exerciseId, e]));
    const catOrder = (navigation.categories || []).map((c) => c.code);
    const catLabel = new Map((navigation.categories || []).map((c) => [c.code, c.labelPl]));

    // nodes of every active exercise: its sub-regions and categories (primary muscles), conditioning
    const nodes = new Map(
      active.map((e) => {
        const n = hierarchy.nodesForMuscles(e.primaryMuscles || []);
        const categories = [...n.categories];
        if (hierarchy.isConditioning(e) && hierarchy.conditioningCategory && !categories.includes(hierarchy.conditioningCategory)) categories.push(hierarchy.conditioningCategory);
        return [e.exerciseId, { categories, subregions: n.subregions }];
      })
    );
    const inScope = (e, scope) => {
      const n = nodes.get(e.exerciseId);
      if (scope && scope.subregionCode) return n.subregions.includes(scope.subregionCode);
      if (scope && scope.categoryCode) return n.categories.includes(scope.categoryCode);
      return true;
    };

    const categories = (navigation.categories || []).map((c) => {
      const count = active.filter((e) => inScope(e, { categoryCode: c.code })).length;
      // D03: sub-regions with 0 (also without muscles, e.g. Łydki) stay listed, disabled
      const subregions = (c.subregions || []).map((s) => {
        const n = active.filter((e) => inScope(e, { subregionCode: s.code })).length;
        return { code: s.code, label: s.labelPl, count: n, enabled: n > 0 };
      });
      return { code: c.code, label: c.labelPl, kind: c.kind, count, enabled: count > 0, subregions };
    });

    const scopeCache = new Map();
    const scopeOf = (scope) => {
      const key = atlasScopeKey(scope);
      if (!scopeCache.has(key)) {
        const exercises = active.filter((e) => inScope(e, scope));
        scopeCache.set(key, { exercises, index: buildAtlasIndex({ ...atlas, exercises }) });
      }
      return scopeCache.get(key);
    };

    // name-only and alias-only indexes of the same engine: an alias hit = the name does not match
    // the query, one alias does (same normalisation as the search itself)
    const nameIndex = buildAtlasIndex({ ...atlas, exercises: active.map((e) => ({ ...e, aliasesPl: [] })) });
    const aliasRows = [];
    for (const e of active) (e.aliasesPl || []).forEach((alias, k) => aliasRows.push({ ...e, exerciseId: `${e.exerciseId}#${k}`, namePl: alias, aliasesPl: [], _of: e.exerciseId, _alias: alias }));
    const aliasIndex = buildAtlasIndex({ ...atlas, exercises: aliasRows });
    const aliasOf = new Map(aliasRows.map((r) => [r.exerciseId, r]));

    const plName = (a, b) => String(a.namePl).localeCompare(String(b.namePl), "pl");

    function scopeExercises(scope) {
      return scopeOf(scope).exercises;
    }
    function scopeIndex(scope) {
      return scopeOf(scope).index;
    }
    function browseResults(scope, query = "", selection = {}, sort = "az") {
      const s = scopeOf(scope);
      let items = s.index.filter(selection, { query });
      if (sort !== "best") items = items.slice().sort(plName);
      return { items, total: items.length, inScope: s.exercises.length };
    }
    function optionLabel(dimension, opt) {
      if (dimension === "loadModel") return shortLoadModelLabel(opt.code);
      if (dimension === "laterality") return ATLAS_LATERALITY_LABELS[opt.code] || opt.code;
      return opt.label || opt.code;
    }
    function sheetFacets(scope, query = "", selection = {}) {
      const idx = scopeOf(scope).index;
      const base = idx.facets({});
      const live = idx.facets(selection, { query });
      const out = [];
      for (const d of ATLAS_SHEET_DIMENSIONS) {
        const baseOpts = base[d.dimension] || [];
        if (!baseOpts.length) continue; // a dimension without options in the scope is hidden
        const liveBy = new Map((live[d.dimension] || []).map((o) => [o.code, o]));
        const chosen = new Set((selection && selection[d.dimension]) || []);
        let options = baseOpts.map((o) => {
          const count = liveBy.has(o.code) ? liveBy.get(o.code).count : 0;
          const selected = chosen.has(o.code);
          return { code: o.code, label: optionLabel(d.dimension, o), count, enabled: count > 0 || selected, selected, baseCount: o.count };
        });
        if (d.dimension === "equipment") options.sort((a, b) => b.baseCount - a.baseCount || a.label.localeCompare(b.label, "pl"));
        else options.sort((a, b) => a.label.localeCompare(b.label, "pl") || a.code.localeCompare(b.code));
        options = options.map(({ baseCount, ...o }) => o);
        out.push({ dimension: d.dimension, label: d.label, options });
      }
      return out;
    }
    function rowChips(ex) {
      const attrs = ((ex && ex.variantAttributes) || []).map((code) => attrDict.get(code)).filter(Boolean);
      const chips = [];
      for (const dim of ATLAS_ROW_CHIP_DIMENSIONS) for (const a of attrs) if (a.dimension === dim) chips.push({ code: a.code, dimension: dim, label: a.labelPl });
      return chips.slice(0, 2);
    }
    // the equipment line of a row: load equipment first, then the rest in atlas order; none → „Bez sprzętu”
    function rowEquipment(ex) {
      const list = ((ex && ex.equipment) || []).map((code) => equipmentDict.get(code) || { code, labelPl: code, role: null });
      const ordered = [...list.filter((e) => e.role === "load"), ...list.filter((e) => e.role !== "load")];
      return ordered.length ? ordered.map((e) => e.labelPl).join(" · ") : "Bez sprzętu";
    }
    // global results (E05): „Partia · sprzęt” — the first category of the exercise in hierarchy order
    function rowCategoryLabel(ex) {
      const n = ex && nodes.get(ex.exerciseId);
      const code = n && [...n.categories].sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b))[0];
      return code ? catLabel.get(code) : "";
    }
    function aliasHit(ex, query) {
      if (!ex || !String(query || "").trim()) return null;
      if (nameIndex.search(query).some((e) => e.exerciseId === ex.exerciseId)) return null;
      const hit = aliasIndex.search(query).find((r) => aliasOf.get(r.exerciseId)._of === ex.exerciseId);
      return hit ? aliasOf.get(hit.exerciseId)._alias : null;
    }
    // D08 — the only suggestion: the query without its last word, counted by the same engine
    function searchSuggestion(scope, query, selection = {}) {
      const words = String(query || "").trim().split(/\s+/).filter(Boolean);
      if (words.length < 2) return null;
      const shorter = words.slice(0, -1).join(" ");
      const count = browseResults(scope, shorter, selection).total;
      return count > 0 ? { query: shorter, count } : null;
    }
    function relaxFiltersCount(scope, query = "") {
      return browseResults(scope, query, {}).total;
    }
    function exercise(id) {
      return byId.get(id) || null;
    }

    return {
      ok: true,
      error: null,
      atlasVersion: fullIndex.atlasVersion,
      hierarchyVersion: hierarchy.hierarchyVersion,
      total: active.length,
      categories: atlasBrowseFreeze(categories),
      scopeExercises,
      scopeIndex,
      browseResults,
      sheetFacets,
      rowChips,
      rowEquipment,
      rowCategoryLabel,
      aliasHit,
      searchSuggestion,
      relaxFiltersCount,
      exercise,
    };
  } catch (e) {
    return atlasBrowseFreeze({ ok: false, error: String((e && e.message) || e) });
  }
}

// The app's model: built from the bundled release; „Spróbuj ponownie” (E07) rebuilds it.
// DES-01 / D2.6: the private names of the active account are the names shown, sorted and searched (the atlas
// name stays findable as the first alias — displayAtlasRecord); the model is rebuilt when the names or the
// account change (key), so another account's names are never shown. Counts are the atlas counts as before.
let atlasBrowseMemo = null;
let atlasBrowseMemoKey = null;
function atlasBrowseNamesKey() {
  return `${getActiveDataNamespace()}\u0000${rawUserStore(STORAGE_KEYS.exerciseNames) ?? ""}`;
}
function atlasBrowseDisplayAtlas() {
  const names = loadCustomExerciseNames();
  if (!Object.keys(names).length) return ATLAS_RELEASE;
  return { ...ATLAS_RELEASE, exercises: ATLAS_RELEASE.exercises.map((e) => displayAtlasRecord(e, names[e.exerciseId] && names[e.exerciseId].name)) };
}
function atlasBrowseModel() {
  const key = atlasBrowseNamesKey();
  if (!atlasBrowseMemo || atlasBrowseMemoKey !== key) {
    atlasBrowseMemoKey = key;
    atlasBrowseMemo = Object.freeze(createAtlasBrowse(atlasBrowseDisplayAtlas(), ATLAS_NAVIGATION));
  }
  return atlasBrowseMemo;
}
function atlasBrowseRetry() {
  atlasBrowseMemo = null;
  return atlasBrowseModel();
}
// DES-01 / D2: the model of a user list (Ulubione / Moje ćwiczenia) — the same view model (search, E04 filters,
// sort, rows) over the exercises of that list: display records (private names applied, own exercises as
// they are); archived ones shown with their badge (status taken as active only for the view). Cached per list
// and data. → { model, ids }
const atlasUserListMemo = new Map();
function atlasUserListModel(kind, view = "active") {
  const cat = getUserExerciseCatalog();
  const key = `${kind}|${view}|${userExerciseCatalogKey()}|${kind === "favourites" ? rawUserStore(STORAGE_KEYS.favourites) ?? "" : ""}`;
  const hit = atlasUserListMemo.get(kind);
  if (hit && hit.key === key) return hit.value;
  let entries;
  if (kind === "favourites") entries = loadFavouriteExercises().map((f) => cat.resolve(f.exerciseId)).filter(Boolean);
  else entries = cat.list({ sources: ["private"], includeArchived: true }).filter((e) => (view === "archived" ? e.archived : !e.archived));
  const exercises = entries.map((e) => ({ ...cat.displayRecord(e.exerciseId), status: "active" }));
  const value = { model: Object.freeze(createAtlasBrowse({ ...ATLAS_RELEASE, exercises }, ATLAS_NAVIGATION)), ids: entries.map((e) => e.exerciseId) };
  atlasUserListMemo.set(kind, { key, value });
  return value;
}
// Counts of the „Twoje” tiles (E01): favourites that resolve (archived too, decision 8); ACTIVE own exercises.
function atlasUserCounts() {
  const cat = getUserExerciseCatalog();
  return {
    favourites: loadFavouriteExercises().filter((f) => cat.resolve(f.exerciseId)).length,
    mine: cat.list({ sources: ["private"] }).length,
  };
}
// Origin / status badges of an exercise (N2): "own" (Własne), "name" (Twoja nazwa), "archived" (Zarchiwizowane).
function atlasBadgesOf(exerciseId) {
  const r = getUserExerciseCatalog().resolve(exerciseId);
  if (!r) return [];
  const b = [];
  if (r.source === "private") b.push("own");
  if (r.customName) b.push("name");
  if (r.archived) b.push("archived");
  return b;
}
// The card entry of any catalog exercise (D2.4): the atlas card entry as it is, or an own exercise read into
// the same shape (buildAtlasCatalog of a one-record atlas; its own content only, AT3-D12). null → unknown id.
function atlasCardEntry(exerciseId) {
  if (!exerciseId) return null;
  const fromAtlas = ATLAS_CATALOG.exercises.find((e) => e.exerciseId === exerciseId);
  if (fromAtlas) return fromAtlas;
  const cat = getUserExerciseCatalog();
  const r = cat.resolve(exerciseId);
  if (!r) return null;
  const record = { ...(r.source === "private" ? cat.displayRecord(exerciseId) : r.exercise), status: "active" };
  return buildAtlasCatalog({ ...ATLAS_RELEASE, exercises: [record] }).exercises[0] || null;
}

/* ---------------------------------------------------------------------- */
/* I5.2 — components P1–P9 of ATLAS-UX-01 (design package v2 §4, boards     */
/* E01–E07). Presentational: data comes from the view model above; nothing  */
/* here is wired to a screen yet (I5.3).                                    */
/* ---------------------------------------------------------------------- */
// Colours: Design System tokens from NR (11-ui-shared) — surface-control, surface-raised, surface-tertiary,
// text-chip, brand-bright (DS-SYNC ATLAS-UX-01, DS-D17; I5.6). Values unchanged.
const ATLAS_UI = Object.freeze({
  num: "Inter, 'Barlow Condensed', sans-serif",
  focus: "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]",
  muted: "#9A9A9A",
  divider: "#1E1E20",
  dashed: "#2A2A2A",
  tileSurface: "radial-gradient(90% 80% at 100% 0%, rgba(255,133,27,.06) 0%, rgba(255,133,27,0) 60%), linear-gradient(180deg, #151515 0%, #0F0F10 55%, #090909 100%)",
  subSurface: "linear-gradient(180deg, #151515 0%, #0F0F10 55%, #090909 100%)",
});
const ATLAS_SR = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
const AtlasNum = ({ children, style }) => <span style={{ fontFamily: ATLAS_UI.num, fontVariantNumeric: "tabular-nums", ...style }}>{children}</span>;

// P1 — search field: role=search, hidden label, Enter → blur (keeps results), „Wyczyść” keeps the
// focus and the keyboard, optional „Anuluj” (E05) and a trailing slot (P9).
// V5 / BUG-V5-03: the global search hint and its shorter forms for a large system font
const ATLAS_SEARCH_HINTS = ["Szukaj po nazwie lub aliasie", "Nazwa lub alias", "Szukaj"];
function AtlasSearchField({ value, onChange, label, placeholder = "", onCancel, onFocus, onBlur, inputRef, disabled = false, children, testId = "atlas-search" }) {
  const own = useRef(null);
  const ref = inputRef || own;
  const [focused, setFocused] = useState(false);
  // V5 / BUG-V5-03: `placeholder` may list shorter fallbacks; the first one that fits the field on one
  // line is shown (a large system font cut "Szukaj po nazwie lub ali…"). The field's name stays the
  // hidden label; the placeholder is only a hint.
  const options = (Array.isArray(placeholder) ? placeholder : [placeholder]).filter(Boolean);
  const optionsKey = options.join("|");
  const [hint, setHint] = useState(0);
  const meterRef = useRef(null);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      const meter = meterRef.current;
      if (!el || !meter || options.length < 2) return setHint(0);
      const cs = window.getComputedStyle(el);
      const room = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      let pick = options.length - 1;
      for (let i = 0; i < options.length; i++) {
        meter.textContent = options[i];
        const w = meter.getBoundingClientRect().width;
        if (!(w > 0) || !(room > 0) || w <= room) {
          pick = i;
          break;
        }
      }
      meter.textContent = "";
      setHint(pick);
    };
    fit();
    let ro = null;
    try {
      if (typeof ResizeObserver !== "undefined" && ref.current) {
        ro = new ResizeObserver(fit);
        ro.observe(ref.current);
      }
    } catch {}
    window.addEventListener("resize", fit);
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    try {
      if (fonts && fonts.ready) fonts.ready.then(fit).catch(() => {});
    } catch {}
    return () => {
      window.removeEventListener("resize", fit);
      if (ro) ro.disconnect();
    };
  }, [optionsKey]);
  return (
    <div role="search" data-testid={testId} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <style>{`[data-atlas-search]::-webkit-search-cancel-button{display:none;-webkit-appearance:none}[data-atlas-search]::placeholder{color:#8E8E8E;opacity:1}`}</style>
      <label style={{ flex: "1 1 auto", minWidth: 0, position: "relative", display: "flex", alignItems: "center" }}>
        <span style={ATLAS_SR}>{label}</span>
        <span ref={meterRef} data-placeholder-measure="" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, visibility: "hidden", pointerEvents: "none", width: "max-content", fontFamily: NR.font, fontSize: "18px", lineHeight: "22px" }} />
        <Search aria-hidden="true" size={20} color={ATLAS_UI.muted} style={{ position: "absolute", left: "14px", pointerEvents: "none" }} />
        <input
          ref={ref}
          data-atlas-search=""
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          placeholder={options[Math.min(hint, options.length - 1)] || ""}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur(); // hides the keyboard, results stay
            }
          }}
          onFocus={(e) => {
            setFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            if (onBlur) onBlur(e);
          }}
          style={{ width: "100%", minHeight: "48px", boxSizing: "border-box", padding: value ? "0 48px 0 44px" : "0 14px 0 44px", borderRadius: "12px", border: focused ? `2px solid ${NR.warm}` : `1px solid ${NR.control}`, background: NR.surfaceControl, color: NR.textPrimary, fontFamily: NR.font, fontSize: "18px", lineHeight: "22px", outline: "none", WebkitAppearance: "none", appearance: "none", opacity: disabled ? 0.5 : 1 }}
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label="Wyczyść wyszukiwanie"
            data-testid={`${testId}-clear`}
            onMouseDown={(e) => e.preventDefault()} // the field keeps the focus (and the keyboard stays open)
            onClick={() => {
              onChange("");
              if (ref.current && ref.current.focus) ref.current.focus();
            }}
            className={ATLAS_UI.focus}
            style={{ position: "absolute", right: "2px", width: "44px", height: "44px", border: 0, borderRadius: "22px", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <XCircle aria-hidden="true" size={18} color={NR.textSecondary} />
          </button>
        )}
      </label>
      {onCancel && (
        <button type="button" onClick={onCancel} data-testid={`${testId}-cancel`} className={ATLAS_UI.focus} style={{ flexShrink: 0, minHeight: "48px", padding: "0 6px", border: 0, background: "transparent", display: "flex", alignItems: "center", color: NR.brandBright, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
          Anuluj
        </button>
      )}
      {children}
    </div>
  );
}

// P2 — filter chip (toggle): aria-pressed; an option with 0 that is not selected is disabled (dashed).
function AtlasFilterChip({ label, count, selected = false, enabled = true, onToggle, testId = "atlas-filter-chip" }) {
  const off = !enabled && !selected;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={off}
      onClick={onToggle}
      data-testid={testId}
      className={ATLAS_UI.focus}
      style={{ minHeight: "44px", padding: "0 12px", borderRadius: "100px", border: off ? `1px dashed ${ATLAS_UI.dashed}` : selected ? `1px solid ${NR.warm}` : `1px solid ${NR.surfaceTertiary}`, background: off ? "transparent" : selected ? "rgba(255,133,27,.14)" : NR.surfaceTertiary, color: off ? NR.textMuted : NR.textPrimary, display: "flex", alignItems: "center", gap: "6px", fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", cursor: off ? "default" : "pointer" }}
    >
      {selected && <Check aria-hidden="true" size={16} color={NR.brandBright} />}
      {label}
      {count != null && <AtlasNum style={{ fontSize: "14px", color: off ? NR.textMuted : NR.textSecondary }}>{count}</AtlasNum>}
    </button>
  );
}

// P3 — active filter chip: removes one value.
function AtlasActiveFilterChip({ dimensionLabel, label, onRemove, testId = "atlas-active-chip" }) {
  return (
    <button type="button" aria-label={`Usuń filtr ${dimensionLabel}: ${label}`} onClick={onRemove} data-testid={testId} className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 8px 0 12px", borderRadius: "100px", border: "1px solid rgba(255,133,27,.55)", background: "rgba(255,133,27,.10)", display: "flex", alignItems: "center", gap: "6px", color: NR.textPrimary, fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", cursor: "pointer" }}>
      {label}
      <X aria-hidden="true" size={16} color={NR.brandBright} />
    </button>
  );
}

// P4 — category tile 3:2. The photo layer is always rendered (empty in 1.0, no assets — NR-01 later);
// `photo` ({ src, srcSet, focus }) is supported: lazy, alt="", scrim only with a photo, failure → no photo.
function AtlasCategoryTile({ label, count, enabled = true, onOpen, photo = null, testId = "atlas-category-tile" }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const withPhoto = Boolean(enabled && photo && photo.src && !photoFailed);
  const photoLayer = (
    <span data-layer="photo" aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden" }}>
      {withPhoto && <img src={photo.src} srcSet={photo.srcSet} alt="" loading="lazy" onError={() => setPhotoFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: photo.focus || "50% 50%" }} />}
    </span>
  );
  // V5 / BUG-V5-02: the 3:2 box is the tile's minimum, not a clip — with a large system font the text
  // stays in the flow and the tile grows (aspect-ratio + overflow visible = content-based minimum);
  // the photo and scrim keep the rounded corners on their own layers. At 100 % nothing moves.
  const body = { position: "relative", boxSizing: "border-box", padding: "12px 12px 10px 14px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px" };
  const box = { position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", flex: "1 0 auto", width: "100%", aspectRatio: "3 / 2", padding: 0, borderRadius: "16px" };
  if (!enabled) {
    return (
      <button type="button" disabled aria-label={`${label}, ${count} ${plPlural(count, "exercise")}, brak w tym wydaniu Atlasu`} data-tile="category" data-photo="none" data-testid={testId} style={{ ...box, border: `1px dashed ${ATLAS_UI.dashed}`, background: "#0F0F10", color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "default" }}>
        {photoLayer}
        <span style={body}>
          <span style={{ fontSize: "20px", lineHeight: "23px", fontWeight: 500, color: NR.textSecondary, overflowWrap: "anywhere" }}>{label}</span>
          <span style={{ fontSize: "15px", lineHeight: "18px", color: NR.textMuted }}>
            <AtlasNum>{count}</AtlasNum> {plPlural(count, "exercise")} · brak w tym wydaniu
          </span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} data-tile="category" data-photo={withPhoto ? "photo" : "none"} data-testid={testId} className={ATLAS_UI.focus} style={{ ...box, border: 0, background: ATLAS_UI.tileSurface, boxShadow: NR.cardShadow, color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "pointer" }}>
      {photoLayer}
      {withPhoto && <span aria-hidden="true" data-layer="scrim" style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: "linear-gradient(180deg, rgba(9,9,9,0) 35%, rgba(9,9,9,.55) 62%, rgba(9,9,9,.88) 100%)" }} />}
      <span style={body}>
        <span style={{ fontSize: "20px", lineHeight: "23px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
          <span style={{ fontSize: "15px", lineHeight: "18px", color: withPhoto ? NR.textChip : NR.textSecondary }}>
            <AtlasNum>{count}</AtlasNum> {plPlural(count, "exercise")}
          </span>
          <ChevronRight aria-hidden="true" size={16} color={NR.warm} />
        </span>
      </span>
    </button>
  );
}

// P5 — exercise row: the whole row is one button (by exerciseId); name and line wrap, never cut;
// optional „Też jako”; at most 2 chips (D04).
// DES-01 / D2 — N2 origin / status badge: always an icon AND a word (never colour alone).
const ATLAS_BADGES = Object.freeze({
  own: { label: "Własne", icon: UserRound, color: NR.brandBright, border: "rgba(255,133,27,.55)" },
  name: { label: "Twoja nazwa", icon: Tag, color: NR.textChip, border: NR.surfaceTertiary },
  archived: { label: "Zarchiwizowane", icon: Archive, color: NR.textSecondary, border: NR.control },
});
function AtlasOriginBadge({ kind, testId }) {
  const b = ATLAS_BADGES[kind];
  if (!b) return null;
  const Icon = b.icon;
  return (
    <span data-badge={kind} data-testid={testId || `atlas-badge-${kind}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "1px 8px", borderRadius: "100px", border: `1px solid ${b.border}`, background: kind === "name" ? NR.surfaceTertiary : "transparent", fontFamily: NR.font, fontSize: "14px", lineHeight: "18px", fontWeight: 500, color: b.color, whiteSpace: "normal", overflowWrap: "anywhere" }}>
      <Icon aria-hidden="true" size={13} color={b.color} style={{ flexShrink: 0 }} />
      {b.label}
    </span>
  );
}
function AtlasBadges({ kinds = [], testId = "atlas-badges" }) {
  if (!kinds.length) return null;
  return (
    <span data-testid={testId} style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
      {kinds.map((k) => (
        <AtlasOriginBadge key={k} kind={k} />
      ))}
    </span>
  );
}
function AtlasExerciseRow({ exerciseId, name, line, alias = null, chips = [], badges = [], onOpen, testId = "atlas-row" }) {
  return (
    <li style={{ borderBottom: `1px solid ${ATLAS_UI.divider}`, listStyle: "none" }}>
      <button type="button" onClick={() => onOpen && onOpen(exerciseId)} data-exercise-id={exerciseId} data-testid={testId} className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "64px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px 10px 21px", border: 0, background: "transparent", color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "pointer" }}>
        <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "19px", lineHeight: "23px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{name}</span>
          {line && <span style={{ fontSize: "15px", lineHeight: "19px", color: NR.textSecondary, overflowWrap: "anywhere" }}>{line}</span>}
          {alias && <span style={{ fontSize: "15px", lineHeight: "19px", color: ATLAS_UI.muted, overflowWrap: "anywhere" }}>Też jako: {alias}</span>}
          <AtlasBadges kinds={badges} />
          {chips.length > 0 && (
            <span style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
              {chips.slice(0, 2).map((c) => (
                <span key={c.code} style={{ padding: "2px 8px", borderRadius: "100px", background: NR.surfaceTertiary, fontSize: "14px", lineHeight: "18px", color: NR.textChip }}>
                  {c.label}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronRight aria-hidden="true" size={16} color={ATLAS_UI.muted} style={{ flexShrink: 0 }} />
      </button>
    </li>
  );
}
// Row props from the view model (D04 / D12 / D13): a scoped list shows equipment + chips; global
// results show „Partia · sprzęt” and „Też jako” instead.
// DES-01 / D2: the name is the display name (a private name of an atlas exercise); badges N2 (Własne, Twoja
// nazwa, Zarchiwizowane) from the user catalog.
function atlasRowProps(model, ex, { global = false, query = "" } = {}) {
  if (!model || !model.ok || !ex) return null;
  const equipment = model.rowEquipment(ex);
  return {
    exerciseId: ex.exerciseId,
    name: ex.namePl,
    line: global ? [model.rowCategoryLabel(ex), equipment].filter(Boolean).join(" · ") : equipment,
    alias: query ? model.aliasHit(ex, query) : null,
    chips: global ? [] : model.rowChips(ex),
    badges: atlasBadgesOf(ex.exerciseId),
  };
}

// P6 — sub-region tile: 2 columns, min. 80, no photo; 0 → disabled „Brak w tym wydaniu”.
function AtlasSubregionTile({ label, count, enabled = true, onOpen, testId = "atlas-subregion-tile" }) {
  const base = { width: "100%", minHeight: "80px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "8px", padding: "12px 12px 10px 14px", borderRadius: "16px", textAlign: "left", fontFamily: NR.font };
  if (!enabled) {
    return (
      <button type="button" disabled aria-label={`${label}, ${count} ${plPlural(count, "exercise")}, brak w tym wydaniu Atlasu`} data-tile="subregion" data-testid={testId} style={{ ...base, border: `1px dashed ${ATLAS_UI.dashed}`, background: "#0F0F10", cursor: "default" }}>
        <span style={{ fontSize: "19px", lineHeight: "22px", fontWeight: 500, color: NR.textSecondary, overflowWrap: "anywhere" }}>{label}</span>
        <span style={{ fontSize: "15px", lineHeight: "18px", color: NR.textMuted }}>
          <AtlasNum>{count}</AtlasNum> {plPlural(count, "exercise")}
          <br />
          Brak w tym wydaniu
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} data-tile="subregion" data-testid={testId} className={ATLAS_UI.focus} style={{ ...base, border: 0, background: ATLAS_UI.subSurface, boxShadow: NR.cardShadow, color: "inherit", cursor: "pointer" }}>
      <span style={{ fontSize: "19px", lineHeight: "22px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
        <span style={{ fontSize: "15px", lineHeight: "18px", color: NR.textSecondary }}>
          <AtlasNum>{count}</AtlasNum> {plPlural(count, "exercise")}
        </span>
        <ChevronRight aria-hidden="true" size={16} color={NR.warm} />
      </span>
    </button>
  );
}

// P7 — results bar: the counter is a polite status („N z M ćwiczeń”, „N wyników w całym Atlasie”,
// „N ćwiczenia”); the sort button only when a sort can change.
const ATLAS_SORT_LABELS = Object.freeze({ az: "Nazwa A–Z", best: "Najlepsze dopasowanie" });
function AtlasResultsBar({ count, of = null, noun = "exercise", suffix = "", sort = null, onToggleSort, testId = "atlas-results" }) {
  return (
    <div data-testid={testId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "44px", paddingLeft: "9px" }}>
      <p role="status" aria-live="polite" data-testid={`${testId}-count`} style={{ margin: 0, fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>
        <AtlasNum style={{ color: NR.textPrimary, fontWeight: 500 }}>{count}</AtlasNum>
        {of != null ? (
          <>
            {" z "}
            <AtlasNum>{of}</AtlasNum> {ATLAS_PLURALS[noun][2]}
          </>
        ) : (
          ` ${plPlural(count, noun)}`
        )}
        {suffix}
      </p>
      {sort && onToggleSort && (
        <button type="button" aria-label={`Sortowanie: ${ATLAS_SORT_LABELS[sort]}. Zmień`} onClick={onToggleSort} data-testid={`${testId}-sort`} className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 6px 0 10px", border: 0, background: "transparent", display: "flex", alignItems: "center", gap: "6px", color: NR.textPrimary, fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", cursor: "pointer" }}>
          <ArrowUpDown aria-hidden="true" size={18} color={ATLAS_UI.muted} />
          {ATLAS_SORT_LABELS[sort]}
        </button>
      )}
    </div>
  );
}

// P8 — empty state / message. Error: neutral, role=alert. Texts of E07 verbatim (constants below).
const ATLAS_MESSAGES = Object.freeze({
  noResultsTitle: (q) => `Nie znaleźliśmy „${q}”`,
  noResultsText: "Sprawdź pisownię albo wpisz mniej słów. Szukamy w polskich nazwach i aliasach ćwiczeń z Atlasu.",
  suggestion: (q) => `Szukaj „${q}”`,
  clearSearch: "Wyczyść wyszukiwanie",
  filtersZeroTitle: "Brak ćwiczeń dla tych filtrów",
  removeFilters: "Usuń filtry",
  errorTitle: "Nie udało się wczytać Atlasu ćwiczeń",
  errorText: "Katalog jest chwilowo niedostępny. Spróbuj ponownie",
  retry: "Spróbuj ponownie",
});
function AtlasMessage({ variant = "empty", title, text, primary = null, link = null, marginTop = 28, testId = "atlas-message", icon = null, extra = null }) {
  const error = variant === "error";
  const content = (
    <div data-testid={testId} data-variant={variant} style={{ marginTop: `${marginTop}px`, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "0 20px", textAlign: "center", fontFamily: NR.font }}>
      <span aria-hidden="true" style={{ width: "56px", height: "56px", borderRadius: "16px", background: error ? NR.surfaceRaised : "rgba(255,133,27,.10)", border: error ? `1px solid ${ATLAS_UI.dashed}` : "1px solid rgba(255,133,27,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {error ? <RefreshCcw size={26} color={NR.textSecondary} /> : icon ? React.createElement(icon, { size: 26, color: NR.warm, fill: icon === Heart ? NR.warm : "none" }) : <Search size={26} color={NR.warm} />}
      </span>
      <p style={{ margin: 0, fontSize: "23px", lineHeight: "26px", fontWeight: 500, color: NR.textDisplay }}>{title}</p>
      {text && <p style={{ margin: 0, fontSize: "17px", lineHeight: "21px", color: NR.textSecondary }}>{text}</p>}
      {extra}
      {(primary || link) && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginTop: "6px" }}>
          {primary && (
            <button type="button" onClick={primary.onClick} data-testid={`${testId}-primary`} className={ATLAS_UI.focus} style={{ minHeight: "52px", boxSizing: "border-box", border: 0, borderRadius: "12px", padding: "8px 20px", background: NR.surfaceRaised, color: NR.textPrimary, fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 500, cursor: "pointer" }}>
              {primary.label}
              {primary.count != null && (
                <>
                  {" · "}
                  <AtlasNum>{primary.count}</AtlasNum> {plPlural(primary.count, "result")}
                </>
              )}
            </button>
          )}
          {link && (
            <button type="button" onClick={link.onClick} data-testid={`${testId}-link`} className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 8px", border: 0, background: "transparent", color: NR.brandBright, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
              {link.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
  return error ? <div role="alert">{content}</div> : content;
}

// P9 — „Filtry” button 48 × 48 with the number of active filters.
function AtlasFiltersButton({ count = 0, onOpen, buttonRef, testId = "atlas-filters-button" }) {
  const active = count > 0;
  return (
    <button ref={buttonRef} type="button" aria-label={active ? `Filtry, aktywne: ${count}` : "Filtry"} aria-haspopup="dialog" onClick={onOpen} data-testid={testId} className={ATLAS_UI.focus} style={{ position: "relative", flexShrink: 0, width: "48px", height: "48px", boxSizing: "border-box", borderRadius: "12px", border: active ? `2px solid ${NR.warm}` : `1px solid ${NR.control}`, background: NR.surfaceControl, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      <SlidersHorizontal aria-hidden="true" size={20} color={active ? NR.warm : NR.textPrimary} />
      {active && (
        <span aria-hidden="true" data-testid={`${testId}-badge`} style={{ position: "absolute", top: "-7px", right: "-7px", minWidth: "20px", height: "20px", boxSizing: "border-box", padding: "0 5px", borderRadius: "100px", background: NR.brand, color: NR.bg, fontFamily: ATLAS_UI.num, fontVariantNumeric: "tabular-nums", fontSize: "12px", lineHeight: "20px", fontWeight: 600, textAlign: "center" }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/* I5.3 / I5.4 — screens E01 „Ćwiczenia”, E02 (partia → podpartie), E03     */
/* (lista), E04 (filtry), E05 (wyszukiwanie), E07 (stany) and the existing  */
/* card Compact Tabs v3 (E06) opened by exerciseId.                         */
/* Back stack E06 → E03 → (E02) → E01: every level in pushes a history      */
/* entry and exercisesOverlayRef steps back ONE level (popstate in 21-app   */
/* as is). Steps inside a level (the E04 sheet, the keyboard, E05 on E01)   */
/* push nothing: Back undoes them and puts the popped entry back.           */
/* ---------------------------------------------------------------------- */

// D06 — state of the module, process memory only (no storage). Kept on Back from the card (and
// after a workout opened from the card, I4.6 D7); reset to E01 on every entry from B2 (goToScreen),
// also on a tap of the active „Ćwiczenia” tab (Q1).
// sort: null = automatic (A–Z without a query, „Najlepsze dopasowanie” with one); "az" / "best" = chosen
// DES-01 / D2: levels "favourites" and "mine" (D02 / D04; "own" stays the OLD list of 17-exercises-plans);
// mineView = the „Aktywne · Zarchiwizowane” switch; saved = the E01 / E03 selection and sort put aside while a
// user list is open (its filters are its own); favUndo = a favourite removed on a card opened from Ulubione —
// the list offers „Cofnij” when it is back (D02b).
const ATLAS_BROWSE_HOME = Object.freeze({ level: "home", categoryCode: null, subregionCode: null, query: "", sort: null, scrollY: 0, openExerciseId: null, mineView: "active", saved: null, favUndo: null });
const atlasBrowseMemory = { ...ATLAS_BROWSE_HOME, selection: {} };
function atlasBrowseReset() {
  Object.assign(atlasBrowseMemory, ATLAS_BROWSE_HOME, { selection: {} });
}
const atlasBrowsePush = () => {
  try {
    window.history.pushState({ trainapp: true }, "", "");
  } catch {}
};
const atlasScrollTo = (y) => {
  try {
    window.scrollTo(0, y || 0);
  } catch {}
};
// a category goes to E02 only when it has more than one sub-region (Klatka → straight to E03)
const atlasHasSubregionScreen = (cat) => Boolean(cat && cat.subregions && cat.subregions.length > 1);

const ATLAS_SCREEN_STYLE = { minHeight: "100vh", boxSizing: "border-box", position: "relative", overflowX: "clip", background: NR.bg, color: NR.textPrimary, fontFamily: NR.font, display: "flex", flexDirection: "column" };
const ATLAS_PAD_BOTTOM = "calc(var(--nr-nav-h, 57px) + 16px)"; // the last element ends 16 px above B2
const ATLAS_H1 = { margin: 0, fontFamily: NR.font, fontSize: "32px", lineHeight: "35px", fontWeight: 600, color: NR.textDisplay, overflowWrap: "anywhere" };
const ATLAS_NOTE = { fontFamily: NR.font, fontSize: "15px", lineHeight: "19px", color: NR.textMuted };

// Bar of E02 / E03: back (44 × 44) + the label of the level it returns to.
function AtlasBackBar({ label, backLabel, onBack, testId = "atlas-back" }) {
  return (
    <div style={{ margin: "0 -12px", padding: "max(env(safe-area-inset-top, 0px), 12px) 6px 0 2px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "2px", minHeight: "44px" }}>
        <button type="button" aria-label={backLabel} data-testid={testId} onClick={onBack} className={ATLAS_UI.focus} style={{ ...AW_ICON_BTN, borderRadius: "22px" }}>
          <ChevronLeft aria-hidden="true" size={22} color={NR.textPrimary} />
        </button>
        <span style={{ flex: "1 1 auto", minWidth: 0, fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: NR.textSecondary, overflowWrap: "anywhere" }}>{label}</span>
      </header>
    </div>
  );
}

// „Wszystkie ćwiczenia” row of E01 / E02 (min. 64, card surface, list icon tile).
function AtlasAllRow({ title = "Wszystkie ćwiczenia", sub, onOpen, icon: Icon = ListIcon, testId = "atlas-all" }) {
  return (
    <button type="button" onClick={onOpen} data-testid={testId} className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "64px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "14px", padding: "10px 12px 10px 14px", border: 0, borderRadius: "16px", background: NR.cardSurface, boxShadow: NR.cardShadow, color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "pointer" }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "12px", background: "rgba(255,133,27,.10)", border: "1px solid rgba(255,133,27,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={22} color={NR.warm} />
      </span>
      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ fontSize: "21px", lineHeight: "24px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{title}</span>
        <span style={{ fontSize: "15px", lineHeight: "19px", color: NR.textSecondary, overflowWrap: "anywhere" }}>{sub}</span>
      </span>
      <ChevronRight aria-hidden="true" size={18} color={NR.warm} style={{ flexShrink: 0 }} />
    </button>
  );
}

const atlasSectionHead = (text, id) => (
  <h2 id={id} style={{ ...nrHeadText, margin: "6px 0 0 9px" }}>
    {text}
  </h2>
);
const ATLAS_GRID = { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" };

// E02 — a category with its sub-regions (P6); empty ones stay as disabled tiles (D03).
function AtlasCategoryView({ category, onBack, onOpenAll, onOpenSubregion }) {
  const n = category.subregions.length;
  return (
    <div data-testid="atlas-category" data-screen="exercises-category" data-category={category.code} style={{ ...ATLAS_SCREEN_STYLE, gap: "12px", padding: `0 12px ${ATLAS_PAD_BOTTOM}` }}>
      <AtlasBackBar label="Ćwiczenia" backLabel="Wróć do Ćwiczeń" onBack={onBack} />
      <section style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "2px 2px 4px 9px" }}>
        <h1 style={ATLAS_H1}>{category.label}</h1>
        <p data-testid="atlas-category-summary" style={{ margin: 0, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>
          <AtlasNum>{category.count}</AtlasNum> {plPlural(category.count, "exercise")} · <AtlasNum>{n}</AtlasNum> {plPlural(n, "subregion")}
        </p>
      </section>
      <AtlasAllRow sub={<><AtlasNum>{category.count}</AtlasNum> w partii {category.label}</>} onOpen={onOpenAll} />
      {atlasSectionHead("Podpartie", "atlas-subs-h")}
      <ul aria-labelledby="atlas-subs-h" style={ATLAS_GRID}>
        {category.subregions.map((s) => (
          <li key={s.code} style={{ minWidth: 0 }}>
            <AtlasSubregionTile label={s.label} count={s.count} enabled={s.enabled} onOpen={() => onOpenSubregion(s)} testId={`atlas-subregion-${s.code}`} />
          </li>
        ))}
      </ul>
      <p style={{ ...ATLAS_NOTE, margin: "0 9px" }}>Ćwiczenie z kilkoma mięśniami głównymi liczy się w każdej ich podpartii, więc liczby podpartii nie sumują się do liczby partii.</p>
    </div>
  );
}

// ---- helpers of the list state (D06) -----------------------------------------------------------
const atlasSelectionCount = (sel) => Object.values(sel || {}).reduce((n, v) => n + ((v && v.length) || 0), 0);
const atlasEffectiveSort = (sort, query) => sort || (String(query || "").trim() ? "best" : "az");
// the soft keyboard is open — the app's one detector (11-ui-shared nrSoftKeyboardOpen, I5.5); without
// visualViewport (old WebView, tests) a focused search field counts as open, so Back only leaves it
function atlasKeyboardOpen() {
  if (typeof window === "undefined") return false;
  if (!window.visualViewport) return true;
  return nrSoftKeyboardOpen();
}
const atlasFocusedSearch = () => (typeof document !== "undefined" && document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-atlas-search]") ? document.activeElement : null);
// selected options with their labels, in the order of the sheet (for P3 and the texts)
function atlasActiveFilters(model, scope, query, selection) {
  if (!atlasSelectionCount(selection)) return [];
  const out = [];
  for (const d of model.sheetFacets(scope, query, selection)) for (const o of d.options) if (o.selected) out.push({ dimension: d.dimension, dimensionLabel: d.label, code: o.code, label: o.label });
  return out;
}
// a selection keeps only the values that exist in the scope it is used in (no invisible filter)
function atlasPruneSelection(model, scope, selection) {
  if (!model.ok || !atlasSelectionCount(selection)) return selection || {};
  const base = model.scopeIndex(scope).facets({});
  const out = {};
  for (const [dim, codes] of Object.entries(selection)) {
    const have = new Set((base[dim] || []).map((o) => o.code));
    const kept = (codes || []).filter((c) => have.has(c));
    if (kept.length) out[dim] = kept;
  }
  return out;
}
const ATLAS_USER_SCOPE_PHRASES = { favourites: "w Ulubionych", mine: "w Moich ćwiczeniach", archived: "w zarchiwizowanych ćwiczeniach" }; // DES-01 / D2
const atlasScopePhrase = (scopeKind, label) => (ATLAS_USER_SCOPE_PHRASES[scopeKind] || (scopeKind === "global" ? "w całym Atlasie" : scopeKind === "subregion" ? `w podpartii ${label}` : `w partii ${label}`));
// E07-FiltryZero: „smith” w partii Klatka piersiowa z filtrem Hantel nie daje wyników.
function atlasFiltersZeroText(query, scopeKind, scopeLabel, filters) {
  const q = String(query || "").trim();
  const f = filters.map((x) => x.label).join(", ");
  const s = `${q ? `„${q}” ` : ""}${atlasScopePhrase(scopeKind, scopeLabel)} z ${filters.length > 1 ? "filtrami" : "filtrem"} ${f} nie daje wyników.`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const ATLAS_ALIAS_NOTE = "Szukamy w polskich nazwach i aliasach z Atlasu. Gdy pasuje tylko alias, widać go pod nazwą.";

// P3 group: the active filters + „Wyczyść filtry” (not when the message offers „Usuń filtry”)
function AtlasActiveFilters({ filters, onRemove, onClearAll }) {
  if (!filters.length) return null;
  return (
    <div role="group" aria-label="Aktywne filtry" data-testid="atlas-active-filters" style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
      {filters.map((f) => (
        <AtlasActiveFilterChip key={`${f.dimension}:${f.code}`} dimensionLabel={f.dimensionLabel} label={f.label} onRemove={() => onRemove(f)} testId={`atlas-active-${f.dimension}-${f.code}`} />
      ))}
      {onClearAll && (
        <button type="button" onClick={onClearAll} data-testid="atlas-clear-filters" className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 8px", border: 0, background: "transparent", color: NR.brandBright, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
          Wyczyść filtry
        </button>
      )}
    </div>
  );
}

// Results of a list or a search: P7 (or the bare status when empty) + rows P5 / E07 message.
function AtlasResults({ model, scope, scopeKind, scopeLabel, query, selection, sort, onToggleSort, listLabel, onOpenExercise, onQuery, onClearSelection, endNote = false, noResultsText = ATLAS_MESSAGES.noResultsText }) {
  const q = String(query || "").trim();
  const eff = atlasEffectiveSort(sort, q);
  const { items, total, inScope } = model.browseResults(scope, q, selection, eff);
  const nSel = atlasSelectionCount(selection);
  const global = scopeKind === "global";
  const rowGlobal = global || Boolean(ATLAS_USER_SCOPE_PHRASES[scopeKind]); // DES-01 / D2: user lists show „Partia · sprzęt”
  const searchCounter = global && q; // E05: „N wyników w całym Atlasie”
  const narrowed = Boolean(q || nSel);
  const bar = searchCounter ? { count: total, noun: "result", suffix: " w całym Atlasie" } : narrowed ? { count: total, of: inScope } : { count: total };
  if (total === 0) {
    const filters = atlasActiveFilters(model, scope, q, selection);
    const relax = nSel ? model.relaxFiltersCount(scope, q) : 0;
    const status = (
      <p role="status" aria-live="polite" data-testid="atlas-results-count" style={{ margin: 0, minHeight: "44px", display: "flex", alignItems: "center", paddingLeft: "9px", fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>
        <span>
          <AtlasNum style={{ color: NR.textPrimary, fontWeight: 500 }}>{total}</AtlasNum>
          {bar.of != null ? (
            <>
              {" z "}
              <AtlasNum>{bar.of}</AtlasNum> {ATLAS_PLURALS.exercise[2]}
            </>
          ) : (
            ` ${plPlural(total, bar.noun || "exercise")}${bar.suffix || ""}`
          )}
        </span>
      </p>
    );
    if (nSel && relax > 0) {
      return (
        <>
          {status}
          <AtlasMessage
            variant="filters"
            marginTop={8}
            title={ATLAS_MESSAGES.filtersZeroTitle}
            text={atlasFiltersZeroText(q, scopeKind, scopeLabel, filters)}
            primary={{ label: ATLAS_MESSAGES.removeFilters, count: relax, onClick: onClearSelection }}
            link={q ? { label: ATLAS_MESSAGES.clearSearch, onClick: () => onQuery("") } : null}
            testId="atlas-filters-zero"
          />
        </>
      );
    }
    const sug = q ? model.searchSuggestion(scope, q, selection) : null;
    return (
      <>
        {status}
        <AtlasMessage
          title={q ? ATLAS_MESSAGES.noResultsTitle(q) : ATLAS_MESSAGES.filtersZeroTitle}
          text={q ? noResultsText : null}
          primary={sug ? { label: ATLAS_MESSAGES.suggestion(sug.query), count: sug.count, onClick: () => onQuery(sug.query) } : nSel ? { label: ATLAS_MESSAGES.removeFilters, onClick: onClearSelection } : null}
          link={q ? { label: ATLAS_MESSAGES.clearSearch, onClick: () => onQuery("") } : null}
          testId="atlas-no-results"
        />
      </>
    );
  }
  const filters = nSel ? atlasActiveFilters(model, scope, q, selection) : [];
  const label = `${listLabel}${filters.length ? `, ${filters.length > 1 ? "filtry" : "filtr"} ${filters.map((f) => f.label).join(", ")}` : ""}`;
  const rowsProps = items.map((ex) => atlasRowProps(model, ex, { global: rowGlobal, query: q }));
  return (
    <>
      <AtlasResultsBar {...bar} sort={eff} onToggleSort={() => onToggleSort(eff === "az" ? "best" : "az")} />
      <ul aria-label={label} data-testid="atlas-list-items" style={{ listStyle: "none", margin: "0 -12px", padding: 0, borderTop: `1px solid ${ATLAS_UI.divider}` }}>
        {rowsProps.map((r) => (
          <AtlasExerciseRow key={r.exerciseId} {...r} onOpen={onOpenExercise} />
        ))}
      </ul>
      {rowsProps.some((r) => r.alias) && (
        <p data-testid="atlas-alias-note" style={{ ...ATLAS_NOTE, margin: "6px 9px 0" }}>
          {ATLAS_ALIAS_NOTE}
        </p>
      )}
      {endNote && (
        <p data-testid="atlas-list-end" style={{ ...ATLAS_NOTE, margin: "2px 9px 0" }}>
          To wszystkie ćwiczenia: <AtlasNum>{total}</AtlasNum>.
        </p>
      )}
    </>
  );
}

// P1 + P9 row (E01 / E03 / E05); in E05 „Anuluj” replaces P9 while the field has the focus.
function AtlasSearchRow({ search, label, placeholder, cancel = false, filtersCount, onOpenFilters, filtersRef, inputRef }) {
  return (
    <AtlasSearchField value={search.query} onChange={search.onQuery} label={label} placeholder={placeholder} onFocus={search.onFocus} onBlur={search.onBlur} onCancel={cancel ? search.onCancel : undefined} inputRef={inputRef}>
      {!cancel && <AtlasFiltersButton count={filtersCount} onOpen={onOpenFilters} buttonRef={filtersRef} />}
    </AtlasSearchField>
  );
}

// E01 — „Ćwiczenia”: header, P1 + P9, „Wszystkie ćwiczenia”, the categories (P4) in 2 columns, the
// person's own exercises when there are any. E05 (search on E01) replaces everything under the field.
function AtlasHomeView({ model, onOpenAll, onOpenCategory, onRetry, ownCount = 0, onOpenOwn, search = null, results = null, searching = false, userCounts = null, onOpenFavourites, onOpenMine }) {
  // one root for E01 and E05: the field keeps its place in the tree, so focusing it (which turns E01
  // into E05) never remounts the input and the keyboard stays open
  const e05 = Boolean(model.ok && searching && search);
  return (
    <div data-testid={e05 ? "atlas-search-screen" : "atlas-home"} data-screen={e05 ? "exercises-search" : "exercises-home"} style={{ ...ATLAS_SCREEN_STYLE, gap: e05 ? "8px" : "12px", padding: `max(env(safe-area-inset-top, 0px), 12px) 12px ${ATLAS_PAD_BOTTOM}` }}>
      {!e05 && (
        <header style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "4px 0 4px 9px" }}>
          <h1 style={{ ...ATLAS_H1, lineHeight: "36px" }}>Ćwiczenia</h1>
          {model.ok && (
            <p data-testid="atlas-home-total" style={{ margin: 0, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>
              Atlas NEXTREP · <AtlasNum>{model.total}</AtlasNum> {plPlural(model.total, "exercise")}
            </p>
          )}
        </header>
      )}
      {!model.ok && <AtlasMessage variant="error" title={ATLAS_MESSAGES.errorTitle} text={ATLAS_MESSAGES.errorText} primary={{ label: ATLAS_MESSAGES.retry, onClick: onRetry }} testId="atlas-error" />}
      {model.ok && search && search.row}
      {e05 && search.filters}
      {e05 && results}
      {model.ok && !e05 && (
        <>
          <AtlasAllRow sub={<><AtlasNum>{model.total}</AtlasNum> · alfabetycznie</>} onOpen={onOpenAll} />
          {userCounts && (
            <>
              {atlasSectionHead("Twoje", "atlas-yours-h")}
              <ul aria-labelledby="atlas-yours-h" data-testid="atlas-yours" style={ATLAS_GRID}>
                <li style={{ minWidth: 0 }}>
                  <AtlasShortcutTile icon={Heart} filled label="Ulubione" count={userCounts.favourites} onOpen={onOpenFavourites} testId="atlas-tile-favourites" />
                </li>
                <li style={{ minWidth: 0 }}>
                  <AtlasShortcutTile icon={UserRound} label="Moje ćwiczenia" count={userCounts.mine} onOpen={onOpenMine} testId="atlas-tile-mine" />
                </li>
              </ul>
            </>
          )}
          {atlasSectionHead("Partie mięśniowe", "atlas-cats-h")}
          <ul aria-labelledby="atlas-cats-h" style={ATLAS_GRID}>
            {model.categories.map((c) => (
              <li key={c.code} style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                <AtlasCategoryTile label={c.label} count={c.count} enabled={c.enabled} onOpen={() => onOpenCategory(c)} testId={`atlas-category-${c.code}`} />
              </li>
            ))}
          </ul>
        </>
      )}
      {/* the old list of the old model (Q6: kept with its access path; renamed in D2 — „Moje ćwiczenia” is the new list) */}
      {!e05 && ownCount > 0 && (
        <AtlasAllRow title="Ćwiczenia zapisane wcześniej" sub={<><AtlasNum>{ownCount}</AtlasNum> {plPlural(ownCount, "exercise")} · poprzednia lista</>} icon={Dumbbell} onOpen={onOpenOwn} testId="atlas-own" />
      )}
    </div>
  );
}

// E03 — the list of a scope (whole atlas / category / sub-region): P1 + P9, active filters, P7,
// rows P5; E07 states in place of the rows.
function AtlasListView({ title, barLabel, backLabel, onBack, search, results }) {
  return (
    <div data-testid="atlas-list" data-screen="exercises-list" data-scope={search.scopeKey} style={{ ...ATLAS_SCREEN_STYLE, gap: "10px", padding: `0 12px ${ATLAS_PAD_BOTTOM}` }}>
      <AtlasBackBar label={barLabel} backLabel={backLabel} onBack={onBack} />
      <h1 data-testid="atlas-list-title" style={{ ...ATLAS_H1, margin: "0 0 0 9px" }}>{title}</h1>
      {search.row}
      {search.filters}
      {results}
    </div>
  );
}

// E04 — the filter sheet: OR inside a dimension, AND between them (engine); counts from the facets
// without the dimension's own choice; 0 → disabled; the choice works at once (closing keeps it);
// „Pokaż N ćwiczeń” live, N = 0 → disabled „Brak wyników”. role=dialog + aria-modal, focus inside,
// Tab stays in the sheet, Escape / Back / ✕ / the dimmed background close it.
const ATLAS_SHEET_EQUIPMENT_VISIBLE = 7;
function AtlasFilterSheet({ model, scope, scopeLine, query, selection, onChange, onClose }) {
  const ref = useRef(null);
  const [allEquipment, setAllEquipment] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const first = ref.current && ref.current.querySelector("[data-sheet-close]");
    if (first && first.focus) first.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab" && ref.current) {
        const els = [...ref.current.querySelectorAll("button, [href], input")].filter((el) => !el.disabled);
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
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const dims = model.sheetFacets(scope, query, selection);
  const n = model.browseResults(scope, query, selection).total;
  const toggle = (dim, code) => {
    const cur = new Set(selection[dim] || []);
    if (cur.has(code)) cur.delete(code);
    else cur.add(code);
    const next = { ...selection };
    if (cur.size) next[dim] = [...cur];
    else delete next[dim];
    onChange(next);
  };
  return (
    <div data-testid="atlas-filter-sheet" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div aria-hidden="true" onClick={onClose} data-testid="atlas-filter-scrim" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.72)" }} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="atlas-flt-t" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "calc(100% - 48px)", display: "flex", flexDirection: "column", boxSizing: "border-box", borderRadius: "20px 20px 0 0", background: "linear-gradient(180deg, #151515 0%, #0F0F10 100%)", borderTop: "1px solid rgba(255,133,27,.35)", fontFamily: NR.font, color: NR.textPrimary }}>
        <div aria-hidden="true" style={{ flexShrink: 0, width: "40px", height: "4px", borderRadius: "2px", background: "#3A3A3A", margin: "10px auto 6px" }} />
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", padding: "0 6px 6px 16px" }}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <h2 id="atlas-flt-t" style={{ margin: 0, fontSize: "25px", lineHeight: "28px", fontWeight: 600, color: NR.textDisplay }}>Filtry</h2>
            <p data-testid="atlas-filter-scope" style={{ margin: "2px 0 0", fontSize: "16px", lineHeight: "20px", color: NR.textSecondary, overflowWrap: "anywhere" }}>{scopeLine}</p>
          </div>
          <button type="button" onClick={() => onChange({})} data-testid="atlas-filter-clear" className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 8px", border: 0, background: "transparent", color: NR.brandBright, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
            Wyczyść
          </button>
          <button type="button" aria-label="Zamknij filtry" data-sheet-close="" data-testid="atlas-filter-close" onClick={onClose} className={ATLAS_UI.focus} style={{ ...AW_ICON_BTN, borderRadius: "22px" }}>
            <X aria-hidden="true" size={22} color={NR.textPrimary} />
          </button>
        </div>
        <div tabIndex={0} data-testid="atlas-filter-body" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "14px", borderTop: `1px solid ${ATLAS_UI.divider}`, outline: "none" }}>
          {dims.map((d) => {
            const many = d.dimension === "equipment" && d.options.length > ATLAS_SHEET_EQUIPMENT_VISIBLE && !allEquipment;
            const shown = many ? d.options.filter((o, i) => i < ATLAS_SHEET_EQUIPMENT_VISIBLE || o.selected) : d.options;
            return (
              <section key={d.dimension} data-dimension={d.dimension} aria-labelledby={`atlas-flt-${d.dimension}`} style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "10px" }}>
                <h3 id={`atlas-flt-${d.dimension}`} style={{ ...nrHeadText, margin: 0 }}>{d.label}</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {shown.map((o) => (
                    <AtlasFilterChip key={o.code} label={o.label} count={o.count} selected={o.selected} enabled={o.enabled} onToggle={() => toggle(d.dimension, o.code)} testId={`atlas-chip-${d.dimension}-${o.code}`} />
                  ))}
                  {many && (
                    <button type="button" onClick={() => setAllEquipment(true)} data-testid="atlas-filter-more" className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 8px", border: 0, background: "transparent", color: NR.brandBright, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
                      Pokaż wszystkie ({d.options.length})
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <div style={{ flexShrink: 0, padding: "12px 16px max(env(safe-area-inset-bottom, 0px), 12px)", borderTop: `1px solid ${ATLAS_UI.divider}` }}>
          <button type="button" disabled={n === 0} onClick={onClose} data-testid="atlas-filter-show" className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "52px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", border: 0, borderRadius: "12px", padding: "8px 14px", background: n === 0 ? NR.surfaceRaised : NR.ctaFill, boxShadow: n === 0 ? "none" : NR.ctaShadow, color: n === 0 ? NR.textMuted : NR.bg, fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 600, cursor: n === 0 ? "default" : "pointer" }}>
            {n === 0 ? (
              "Brak wyników"
            ) : (
              <span>
                Pokaż{" "}
                <AtlasNum>{n}</AtlasNum>
                {" "}
                {plPlural(n, "exercise")}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* DES-01 / D2 — „Twoje”: Ulubione (D02, D03) and Moje ćwiczenia (D04, D05),  */
/* the card's heart, „Więcej” menu and private names (D09, D11), the     */
/* feedback message with „Cofnij” (DS-C08 variant) and the action sheets  */
/* (DS-C09 variant). Data: the D1 layer (05b) only.                       */
/* ---------------------------------------------------------------------- */
// N1 — shortcut tile: the sub-region tile (DS-C22) with an icon; always active (also with 0).
function AtlasShortcutTile({ icon: Icon, filled = false, label, count, onOpen, testId }) {
  return (
    <button type="button" onClick={onOpen} data-tile="shortcut" data-testid={testId} aria-label={`${label}, ${count} ${plPlural(count, "exercise")}`} className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "80px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "8px", padding: "12px 12px 10px 14px", border: 0, borderRadius: "16px", background: ATLAS_UI.subSurface, boxShadow: NR.cardShadow, color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "pointer" }}>
      <span style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <Icon aria-hidden="true" size={20} color={NR.warm} fill={filled ? NR.warm : "none"} style={{ flexShrink: 0, marginTop: "1px" }} />
        <span style={{ fontSize: "19px", lineHeight: "22px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "break-word", hyphens: "none", minWidth: 0 }}>{label}</span>
      </span>
      <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
        <span data-testid={`${testId}-count`} style={{ fontSize: "15px", lineHeight: "18px", color: NR.textSecondary }}>
          <AtlasNum>{count}</AtlasNum> {plPlural(count, "exercise")}
        </span>
        <ChevronRight size={16} color={NR.warm} />
      </span>
    </button>
  );
}

// DS-C08 variant — the ≈4 s feedback message above B2 (role=status), optionally with „Cofnij”.
function AtlasToast({ text, actionLabel = null, onAction = null, onDone, ms = 4000, testId = "atlas-toast" }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => doneRef.current && doneRef.current(), ms);
    return () => clearTimeout(t);
  }, [text, ms]);
  return (
    <div role="status" aria-live="polite" data-testid={testId} style={{ position: "fixed", left: "12px", right: "12px", bottom: "calc(var(--nr-nav-h, 57px) + 12px)", zIndex: 40, display: "flex", alignItems: "center", gap: "10px", minHeight: "52px", boxSizing: "border-box", padding: "6px 6px 6px 14px", borderRadius: "14px", background: `linear-gradient(180deg, ${NR.surfaceRaised}, ${NR.surfaceControl})`, border: "1px solid rgba(66,201,138,.45)", boxShadow: "0 12px 28px -8px rgba(0,0,0,.9)", fontFamily: NR.font }}>
      <Check aria-hidden="true" size={20} strokeWidth={2.5} color={NR.success} style={{ flexShrink: 0 }} />
      <span data-testid={`${testId}-text`} style={{ flex: "1 1 auto", minWidth: 0, fontSize: "17px", lineHeight: "21px", color: NR.textPrimary, overflowWrap: "anywhere" }}>{text}</span>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} data-testid={`${testId}-undo`} className={ATLAS_UI.focus} style={{ flexShrink: 0, minHeight: "44px", minWidth: "44px", padding: "0 10px", border: 0, borderRadius: "10px", background: "transparent", color: NR.brandBright, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 600, cursor: "pointer" }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// The Back of the card's sheets (menu, private name): while a sheet of the card is open, the module's Back
// step closes that sheet first (or hides the keyboard first) — set by the card, read by AtlasBrowseScreen.
const atlasCardOverlay = { current: null };

// DS-C09 variant — a bottom sheet: role=dialog + aria-modal, focus inside (Tab stays in it), Escape and the
// dimmed background close it; the caller returns the focus to the element that opened it.
function AtlasSheet({ titleId, title, sub = null, onClose, children, footer = null, testId = "atlas-sheet" }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const first = ref.current && (ref.current.querySelector("[data-autofocus]") || ref.current.querySelector("[data-sheet-close]"));
    if (first && first.focus) first.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab" && ref.current) {
        const els = [...ref.current.querySelectorAll("button, [href], input")].filter((el) => !el.disabled);
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
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div data-testid={testId} style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div aria-hidden="true" onClick={onClose} data-testid={`${testId}-scrim`} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.72)" }} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "calc(100% - 48px)", display: "flex", flexDirection: "column", boxSizing: "border-box", borderRadius: "20px 20px 0 0", background: "linear-gradient(180deg, #151515 0%, #0F0F10 100%)", borderTop: "1px solid rgba(255,133,27,.35)", fontFamily: NR.font, color: NR.textPrimary }}>
        <div aria-hidden="true" style={{ flexShrink: 0, width: "40px", height: "4px", borderRadius: "2px", background: "#3A3A3A", margin: "10px auto 6px" }} />
        <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", gap: "4px", padding: "0 6px 8px 16px" }}>
          <div style={{ flex: "1 1 auto", minWidth: 0, paddingTop: "8px" }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: "25px", lineHeight: "28px", fontWeight: 600, color: NR.textDisplay, overflowWrap: "anywhere" }}>{title}</h2>
            {sub && <p style={{ margin: "2px 0 0", fontSize: "16px", lineHeight: "20px", color: NR.textSecondary, overflowWrap: "anywhere" }}>{sub}</p>}
          </div>
          <button type="button" aria-label="Zamknij" data-sheet-close="" data-testid={`${testId}-close`} onClick={onClose} className={ATLAS_UI.focus} style={{ ...AW_ICON_BTN, borderRadius: "22px" }}>
            <X aria-hidden="true" size={22} color={NR.textPrimary} />
          </button>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "4px 16px 12px", borderTop: `1px solid ${ATLAS_UI.divider}` }}>{children}</div>
        {footer && <div style={{ flexShrink: 0, padding: "12px 16px max(env(safe-area-inset-bottom, 0px), 12px)", borderTop: `1px solid ${ATLAS_UI.divider}` }}>{footer}</div>}
      </div>
    </div>
  );
}

// One action of the „Więcej” sheet. `soon` = the action comes in a later stage: shown disabled with „Wkrótce”
// (never an active button that does nothing).
function AtlasSheetAction({ icon: Icon, label, sub = null, onClick, soon = false, danger = false, testId }) {
  const disabled = soon || !onClick;
  return (
    <button type="button" disabled={disabled} aria-disabled={disabled ? "true" : undefined} onClick={disabled ? undefined : onClick} data-testid={testId} data-soon={soon ? "" : undefined} className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "56px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "12px", padding: "8px 4px", border: 0, borderBottom: `1px solid ${ATLAS_UI.divider}`, background: "transparent", color: disabled ? NR.textMuted : danger ? NR.dangerText : NR.textPrimary, textAlign: "left", fontFamily: NR.font, cursor: disabled ? "default" : "pointer" }}>
      <Icon aria-hidden="true" size={20} color={disabled ? NR.textMuted : danger ? NR.dangerText : NR.textSecondary} style={{ flexShrink: 0 }} />
      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
        <span style={{ fontSize: "19px", lineHeight: "22px", fontWeight: 500, overflowWrap: "anywhere" }}>{label}</span>
        {sub && <span style={{ fontSize: "15px", lineHeight: "19px", color: NR.textMuted, overflowWrap: "anywhere" }}>{sub}</span>}
      </span>
      {soon && (
        <span style={{ flexShrink: 0, padding: "1px 8px", borderRadius: "100px", border: `1px solid ${NR.control}`, fontSize: "14px", lineHeight: "18px", color: NR.textSecondary }}>Wkrótce</span>
      )}
    </button>
  );
}

// D11 / D13 — „Więcej” of the card, by kind. D2: only the private-name actions work; the rest is shown as
// unavailable until its stage (variant / edit → D3; archive, delete, restore → D5).
function AtlasCardMenu({ info, onRename, onRemoveName, onClose }) {
  const atlas = info.source === "atlas";
  return (
    <AtlasSheet titleId="atlas-menu-t" title="Więcej" sub={info.displayName} onClose={onClose} testId="atlas-card-menu">
      {atlas ? (
        <>
          <AtlasSheetAction icon={Tag} label={info.customName ? "Zmień własną nazwę" : "Nadaj własną nazwę"} sub="Ćwiczenie i jego historia zostają te same" onClick={onRename} testId="atlas-menu-rename" />
          {info.customName && <AtlasSheetAction icon={Eraser} label="Usuń własną nazwę" sub={`Wróci nazwa z Atlasu: ${info.atlasName}`} onClick={onRemoveName} testId="atlas-menu-remove-name" />}
          <AtlasSheetAction icon={CopyPlus} label="Utwórz własny wariant" sub="Dostępne w kolejnej aktualizacji" soon testId="atlas-menu-variant" />
        </>
      ) : (
        <>
          <AtlasSheetAction icon={Pencil} label="Edytuj ćwiczenie" sub="Dostępne w kolejnej aktualizacji" soon testId="atlas-menu-edit" />
          {info.archived ? (
            <AtlasSheetAction icon={ArchiveRestore} label="Przywróć ćwiczenie" sub="Dostępne w kolejnej aktualizacji" soon testId="atlas-menu-restore" />
          ) : (
            <AtlasSheetAction icon={Archive} label="Archiwizuj lub usuń" sub="Dostępne w kolejnej aktualizacji" soon testId="atlas-menu-archive" />
          )}
        </>
      )}
    </AtlasSheet>
  );
}

// D09 — the private name of an atlas exercise: the atlas name read-only, the field, three rules. Saved through
// the D1 layer; the exerciseId, plans, history and snapshots stay as they are.
const ATLAS_NAME_ERRORS = {
  NAME_EMPTY: "Wpisz nazwę albo zamknij bez zmian.",
  NAME_TYPE: "Wpisz nazwę albo zamknij bez zmian.",
  NAME_TOO_LONG: "Nazwa może mieć najwyżej 80 znaków.",
  NAME_SAME_AS_ATLAS: "To jest nazwa z Atlasu. Wpisz inną nazwę albo usuń własną nazwę.",
  STORE_UNREADABLE: "Nie udało się zapisać nazwy. Spróbuj ponownie.",
  STORAGE_FAILED: "Nie udało się zapisać nazwy. Spróbuj ponownie.",
};
function AtlasNameSheet({ info, onSaved, onClose }) {
  const [value, setValue] = useState(info.customName || "");
  const [error, setError] = useState(null);
  const save = () => {
    const r = setCustomExerciseNameFor(info.exerciseId, value);
    if (!r.ok) return setError(ATLAS_NAME_ERRORS[r.code] || ATLAS_NAME_ERRORS.STORAGE_FAILED);
    onSaved(value.trim());
  };
  return (
    <AtlasSheet
      titleId="atlas-name-t"
      title={info.customName ? "Zmień własną nazwę" : "Nadaj własną nazwę"}
      onClose={onClose}
      testId="atlas-name-sheet"
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button type="button" onClick={save} data-testid="atlas-name-save" className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "52px", border: 0, borderRadius: "12px", background: NR.ctaFill, boxShadow: NR.ctaShadow, color: NR.bg, fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 600, cursor: "pointer" }}>
            Zapisz nazwę
          </button>
          <button type="button" onClick={onClose} data-testid="atlas-name-cancel" className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "48px", border: 0, borderRadius: "12px", background: "transparent", color: NR.textPrimary, fontFamily: NR.font, fontSize: "18px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
            Anuluj
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "8px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "15px", lineHeight: "19px", color: NR.textMuted }}>Nazwa w Atlasie</p>
          <p data-testid="atlas-name-atlas" style={{ margin: "2px 0 0", fontSize: "19px", lineHeight: "23px", color: NR.textSecondary, overflowWrap: "anywhere" }}>{info.atlasName}</p>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "16px", lineHeight: "20px", fontWeight: 500, color: NR.textPrimary }}>Twoja nazwa</span>
          <input
            data-autofocus=""
            data-testid="atlas-name-input"
            type="text"
            value={value}
            maxLength={120}
            autoComplete="off"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "atlas-name-err atlas-name-rules" : "atlas-name-rules"}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            style={{ width: "100%", minHeight: "48px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: error ? `2px solid ${NR.danger}` : `1px solid ${NR.control}`, background: NR.surfaceControl, color: NR.textPrimary, fontFamily: NR.font, fontSize: "18px", lineHeight: "22px", outline: "none" }}
          />
        </label>
        {error && (
          <p id="atlas-name-err" role="alert" data-testid="atlas-name-error" style={{ margin: 0, fontSize: "16px", lineHeight: "20px", color: NR.dangerText }}>
            {error}
          </p>
        )}
        <ul id="atlas-name-rules" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          {["To nadal to samo ćwiczenie — historia i statystyki się nie zmieniają.", "Nie tworzymy kopii ćwiczenia.", "Nazwa z Atlasu zawsze będzie widoczna na karcie."].map((t) => (
            <li key={t} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", gap: "8px", fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>
              <Check aria-hidden="true" size={18} color={NR.textSecondary} style={{ marginTop: "1px" }} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </AtlasSheet>
  );
}

// The user part of the card (D11 / D13 / D09 / D15c): heart, „Więcej”, badges, „W Atlasie: …”, the archived
// state, the sheets and the feedback message. The card's tabs, history, variants and pinning are untouched.
// `info` = the user catalog entry (null → the card is shown as before, without the user actions).
function useAtlasCardUser(exerciseId) {
  const [rev, setRev] = useState(0);
  const refresh = () => setRev((n) => n + 1);
  const info = getUserExerciseCatalog().resolve(exerciseId);
  const favourite = info ? isFavouriteExercise(exerciseId) : false;
  return { info, favourite, refresh, rev };
}
function AtlasCardHeart({ favourite, onToggle }) {
  return (
    <button type="button" aria-label="Ulubione" aria-pressed={favourite ? "true" : "false"} data-testid="atlas-detail-heart" onClick={onToggle} className={ATLAS_UI.focus} style={{ ...AW_ICON_BTN, borderRadius: "22px", flexShrink: 0 }}>
      <Heart aria-hidden="true" size={22} color={favourite ? NR.warm : NR.textPrimary} fill={favourite ? NR.warm : "none"} />
    </button>
  );
}
function AtlasCardMoreButton({ onOpen, buttonRef }) {
  return (
    <button ref={buttonRef} type="button" aria-label="Więcej działań" aria-haspopup="dialog" data-testid="atlas-detail-more" onClick={onOpen} className={ATLAS_UI.focus} style={{ ...AW_ICON_BTN, borderRadius: "22px", flexShrink: 0 }}>
      <MoreVertical aria-hidden="true" size={22} color={NR.textPrimary} />
    </button>
  );
}
// Header part under the name: badges, „W Atlasie: …”, the archived state (D15c, restore comes in D5).
function AtlasCardUserHeader({ info }) {
  if (!info) return null;
  const kinds = [];
  if (info.source === "private") kinds.push("own");
  if (info.customName) kinds.push("name");
  if (info.archived) kinds.push("archived");
  return (
    <>
      <AtlasBadges kinds={kinds} testId="atlas-detail-badges" />
      {info.customName && (
        <p data-testid="atlas-detail-atlas-name" style={{ margin: 0, fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textMuted, overflowWrap: "anywhere" }}>
          W Atlasie: {info.atlasName}
        </p>
      )}
      {info.archived && (
        <div role="note" data-testid="atlas-detail-archived" style={{ marginTop: "4px", display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "12px", border: `1px solid ${NR.control}`, background: NR.surfaceRaised }}>
          <Archive aria-hidden="true" size={20} color={NR.textSecondary} style={{ flexShrink: 0, marginTop: "1px" }} />
          <span style={{ fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>
            <strong style={{ display: "block", fontWeight: 600, color: NR.textPrimary }}>Ćwiczenie zarchiwizowane</strong>
            Nie pojawia się w wyszukiwaniu ani przy tworzeniu planów. Historia zostaje bez zmian. Przywracanie będzie dostępne w kolejnej aktualizacji.
          </span>
        </div>
      )}
    </>
  );
}

// D02 / D04 — the user lists. The E03 pattern: back bar, title, P1 + P9, active filters, P7, rows P5 with N2
// badges; empty states D03 / D05; „Moje ćwiczenia” adds „+ Dodaj ćwiczenie” (available from D3: shown
// disabled with an explicit note), the „Aktywne · Zarchiwizowane” switch and the private names section.
const ATLAS_ADD_SOON = "Dodawanie własnych ćwiczeń będzie dostępne w kolejnej aktualizacji.";
function AtlasAddExerciseSoon({ testId = "atlas-mine-add" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <button type="button" disabled aria-describedby={`${testId}-note`} data-testid={testId} style={{ width: "100%", minHeight: "52px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", border: `1px dashed ${NR.control}`, borderRadius: "12px", padding: "8px 14px", background: NR.surfaceRaised, color: NR.textMuted, fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 600, cursor: "default" }}>
        <Plus aria-hidden="true" size={20} color={NR.textMuted} />
        Dodaj ćwiczenie
        <span style={{ marginLeft: "4px", padding: "1px 8px", borderRadius: "100px", border: `1px solid ${NR.control}`, fontSize: "14px", lineHeight: "18px", fontWeight: 500, color: NR.textSecondary }}>Wkrótce</span>
      </button>
      <p id={`${testId}-note`} data-testid={`${testId}-note`} style={{ ...ATLAS_NOTE, margin: "0 9px" }}>{ATLAS_ADD_SOON}</p>
    </div>
  );
}
function AtlasViewSwitch({ value, onChange }) {
  const opts = [
    ["active", "Aktywne"],
    ["archived", "Zarchiwizowane"],
  ];
  const onKey = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? "active" : e.key === "End" ? "archived" : value === "active" ? "archived" : "active";
    onChange(next);
    setTimeout(() => {
      const el = document.querySelector(`[data-testid="atlas-mine-view-${next}"]`);
      if (el && el.focus) el.focus();
    }, 0);
  };
  return (
    <div role="radiogroup" aria-label="Pokaż ćwiczenia" data-testid="atlas-mine-view" style={{ display: "flex", gap: "6px" }}>
      {opts.map(([k, label]) => {
        const on = value === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={on ? "true" : "false"} tabIndex={on ? 0 : -1} onClick={() => onChange(k)} onKeyDown={onKey} data-testid={`atlas-mine-view-${k}`} className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 14px", borderRadius: "100px", border: on ? `1px solid ${NR.warm}` : `1px solid ${NR.control}`, background: on ? "rgba(255,133,27,.12)" : NR.surfaceControl, color: on ? NR.textDisplay : NR.textSecondary, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: on ? 600 : 500, cursor: "pointer" }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
// „Twoje nazwy ćwiczeń z Atlasu” (D04, decision 5): atlas exercises with a private name — not own exercises.
function AtlasCustomNamesSection({ query, onOpenExercise }) {
  const q = normalizeAtlasText(query);
  const all = getUserExerciseCatalog().customNames();
  const rows = q ? all.filter((r) => normalizeAtlasText(`${r.name} ${r.atlasName}`).includes(q)) : all;
  if (!all.length) return null;
  return (
    <section aria-labelledby="atlas-names-h" data-testid="atlas-mine-names" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
      {atlasSectionHead("Twoje nazwy ćwiczeń z Atlasu", "atlas-names-h")}
      <p style={{ ...ATLAS_NOTE, margin: "0 9px" }}>To ćwiczenia z Atlasu pod Twoją nazwą — nie są osobnymi ćwiczeniami.</p>
      {rows.length ? (
        <ul aria-labelledby="atlas-names-h" style={{ listStyle: "none", margin: "0 -12px", padding: 0, borderTop: `1px solid ${ATLAS_UI.divider}` }}>
          {rows.map((r) => (
            <AtlasExerciseRow key={r.exerciseId} exerciseId={r.exerciseId} name={r.name} line={`W Atlasie: ${r.atlasName}`} badges={["name"]} onOpen={onOpenExercise} testId="atlas-name-row" />
          ))}
        </ul>
      ) : (
        <p data-testid="atlas-mine-names-none" style={{ ...ATLAS_NOTE, margin: "0 9px" }}>Żadna z Twoich nazw nie pasuje do wyszukiwania.</p>
      )}
    </section>
  );
}
// the normalisation of the atlas search (case, Polish letters) for the plain filters of D2
function normalizeAtlasText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function AtlasUserListView({ kind, view, onView, model, count, onBack, search, results, onOpenExercise, onBrowseAtlas, toast }) {
  const fav = kind === "favourites";
  const title = fav ? "Ulubione" : "Moje ćwiczenia";
  const q = String(search.query || "").trim();
  const empty = count === 0 && !q;
  const hasNames = !fav && view === "active" && getUserExerciseCatalog().customNames().length > 0;
  return (
    <div data-testid={fav ? "atlas-favourites" : "atlas-mine"} data-screen={fav ? "exercises-favourites" : "exercises-mine"} data-view={fav ? undefined : view} style={{ ...ATLAS_SCREEN_STYLE, gap: "10px", padding: `0 12px ${ATLAS_PAD_BOTTOM}` }}>
      <AtlasBackBar label="Ćwiczenia" backLabel="Wróć do Ćwiczeń" onBack={onBack} />
      <h1 data-testid="atlas-list-title" style={{ ...ATLAS_H1, margin: "0 0 0 9px" }}>{title}</h1>
      {!fav && <AtlasAddExerciseSoon />}
      {!fav && <AtlasViewSwitch value={view} onChange={onView} />}
      {!fav && view === "archived" && (
        <p data-testid="atlas-mine-archived-note" style={{ ...ATLAS_NOTE, margin: "0 9px" }}>
          Zarchiwizowane ćwiczenia nie pojawiają się w wyszukiwaniu ani przy tworzeniu planów. Ich historia zostaje bez zmian.
        </p>
      )}
      {empty && !hasNames ? (
        fav ? (
          <AtlasMessage icon={Heart} title="Nie masz jeszcze ulubionych ćwiczeń" text="Dotknij serca na karcie ćwiczenia, a pojawi się tutaj." primary={{ label: "Przeglądaj Atlas", onClick: onBrowseAtlas }} testId="atlas-favourites-empty" />
        ) : view === "archived" ? (
          <AtlasMessage icon={Archive} title="Brak zarchiwizowanych ćwiczeń" text="Ćwiczenia, które zarchiwizujesz, znajdziesz tutaj." testId="atlas-mine-archived-empty" />
        ) : (
          <AtlasMessage icon={UserRound} title="Nie masz jeszcze własnych ćwiczeń" text="Własne ćwiczenie dodasz, gdy w Atlasie brakuje tego, które wykonujesz." extra={<p style={{ ...ATLAS_NOTE, margin: 0 }}>Możesz też nadać własną nazwę ćwiczeniu z Atlasu — na jego karcie, w menu „Więcej”.</p>} testId="atlas-mine-empty" />
        )
      ) : (
        <>
          {count > 0 || q || hasNames ? (
            <>
              {search.row}
              {search.filters}
              {count > 0 ? results : null}
            </>
          ) : null}
          {!fav && view === "active" && count === 0 && !q && (
            <p data-testid="atlas-mine-none" style={{ ...ATLAS_NOTE, margin: "0 9px" }}>Nie masz jeszcze własnych ćwiczeń.</p>
          )}
          {hasNames && <AtlasCustomNamesSection query={search.query} onOpenExercise={onOpenExercise} />}
        </>
      )}
      {toast}
    </div>
  );
}

// The module „Ćwiczenia” (S1). Levels E01 / E02 / E03 + the card on top of the list; E04 / E05 / E07.
function AtlasBrowseScreen({ onNavigate, history = [], isPro = false, onOpenUnlock, onOpenSession, ownCount = 0, onOpenOwn }) {
  const [, setRetry] = useState(0);
  const read = () => ({
    level: atlasBrowseMemory.level,
    categoryCode: atlasBrowseMemory.categoryCode,
    subregionCode: atlasBrowseMemory.subregionCode,
    openExerciseId: atlasBrowseMemory.openExerciseId,
    query: atlasBrowseMemory.query,
    selection: atlasBrowseMemory.selection,
    sort: atlasBrowseMemory.sort,
    mineView: atlasBrowseMemory.mineView,
    favUndo: atlasBrowseMemory.favUndo,
  });
  const [nav, setNavState] = useState(read);
  const [focused, setFocused] = useState(false);
  const [sheet, setSheet] = useState(false);
  const pendingScroll = useRef(null);
  const filtersRef = useRef(null);
  const inputRef = useRef(null);
  const bgRef = useRef(null);
  const setNav = (patch, scrollY = 0) => {
    Object.assign(atlasBrowseMemory, patch);
    pendingScroll.current = scrollY;
    setNavState(read());
  };
  const patch = (p) => {
    Object.assign(atlasBrowseMemory, p);
    setNavState(read());
  };

  // DES-01 / D2: a user list (Ulubione / Moje ćwiczenia) runs on its own view model; the atlas levels on the
  // atlas model (both cached; rebuilt only when their data changes)
  const userLevel = nav.level === "favourites" || nav.level === "mine";
  const userList = userLevel ? atlasUserListModel(nav.level, nav.level === "mine" ? nav.mineView : "active") : null;
  const atlasModel = atlasBrowseModel();
  const model = userList ? userList.model : atlasModel;
  const categoryOf = (code) => (atlasModel.ok && code ? atlasModel.categories.find((c) => c.code === code) || null : null);
  const card = nav.openExerciseId ? atlasCardEntry(nav.openExerciseId) : null;
  const searching = nav.level === "home" && (focused || Boolean(String(nav.query).trim()));

  // the scope of the current list / search
  const cat = categoryOf(nav.categoryCode);
  const sub = cat && nav.subregionCode ? cat.subregions.find((s) => s.code === nav.subregionCode) || null : null;
  const scope = nav.level === "list" ? { categoryCode: nav.categoryCode, subregionCode: nav.subregionCode } : {};
  const scopeKind = nav.level === "favourites" ? "favourites" : nav.level === "mine" ? (nav.mineView === "archived" ? "archived" : "mine") : nav.level === "list" && sub ? "subregion" : nav.level === "list" && cat ? "category" : "global";
  const scopeLabel = sub ? sub.label : cat && nav.level === "list" ? cat.label : "";

  const restoreFocusToFilters = () =>
    setTimeout(() => {
      try {
        if (filtersRef.current && filtersRef.current.focus) filtersRef.current.focus();
      } catch {}
    }, 0);
  const closeSheet = () => {
    setSheet(false);
    const m = atlasBrowseMemory;
    // E01: the choice made in the sheet opens the whole-atlas list with it (E04 → „lista z filtrami”)
    if (m.level === "home" && !String(m.query).trim() && atlasSelectionCount(m.selection) && !m.openExerciseId) {
      atlasBrowsePush();
      setNav({ level: "list", categoryCode: null, subregionCode: null, query: "", scrollY: 0, openExerciseId: null });
      return;
    }
    restoreFocusToFilters();
  };
  // one step back (hardware / gesture / on-screen Back through popstate → exercisesOverlayRef)
  const stepBackOne = () => {
    const m = atlasBrowseMemory;
    if (m.openExerciseId && atlasCardOverlay.current) {
      atlasBrowsePush(); // a sheet of the card (menu, private name) is a step inside the card
      return atlasCardOverlay.current();
    }
    const input = atlasFocusedSearch();
    if (sheetRef.current) {
      atlasBrowsePush(); // the sheet is a step inside the level: put the popped entry back
      return closeSheet();
    }
    if (input && atlasKeyboardOpen()) {
      atlasBrowsePush(); // E05: Back first hides the keyboard
      input.blur();
      return;
    }
    if (input) input.blur();
    if (input && m.level === "home" && !String(m.query).trim()) {
      atlasBrowsePush(); // an empty E05 (field focused, keyboard already down): Back only leaves the field
      return;
    }
    if (m.openExerciseId) return setNav({ openExerciseId: null }, m.scrollY); // E06 → the list, where it was
    // D2: Ulubione / Moje ćwiczenia → E01; the E01 selection and sort put aside on the way in come back
    if (m.level === "favourites" || m.level === "mine") return setNav({ level: "home", query: "", scrollY: 0, selection: (m.saved && m.saved.selection) || {}, sort: m.saved ? m.saved.sort : null, saved: null, favUndo: null, mineView: "active" });
    if (m.level === "list") {
      const c = categoryOf(m.categoryCode);
      const toCategory = Boolean(m.subregionCode) || atlasHasSubregionScreen(c);
      // D06: selection and sort stay between E03 and E02, the query belongs to the list it was typed in
      return setNav(toCategory ? { level: "category", subregionCode: null, query: "", scrollY: 0 } : { level: "home", categoryCode: null, subregionCode: null, query: "", scrollY: 0 });
    }
    if (m.level === "category") return setNav({ level: "home", categoryCode: null, subregionCode: null, query: "", scrollY: 0 });
    if (m.level === "home" && String(m.query).trim()) {
      atlasBrowsePush(); // E05 is a state of E01: Back ends the search, the module stays
      return setNav({ query: "", sort: null });
    }
  };
  const sheetRef = useRef(false);
  sheetRef.current = sheet;
  const stepBackRef = useRef(stepBackOne);
  stepBackRef.current = stepBackOne;
  const onScreenBack = () => window.history.back(); // pops the entry pushed on the way in → one step

  const atRoot = nav.level === "home" && !nav.openExerciseId && !searching && !sheet;
  useEffect(() => {
    exercisesOverlayRef.current = atRoot ? null : () => stepBackRef.current();
    return () => {
      exercisesOverlayRef.current = null;
    };
  }, [atRoot]);
  useEffect(() => {
    if (pendingScroll.current == null) return;
    const y = pendingScroll.current;
    pendingScroll.current = null;
    atlasScrollTo(y);
  }, [nav]);
  // E04: the screen behind the sheet is inert and hidden from assistive technology
  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    if (sheet) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    } else {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  }, [sheet]);

  const openList = (sc) => {
    atlasBrowsePush();
    setNav({ level: "list", categoryCode: sc.categoryCode || null, subregionCode: sc.subregionCode || null, query: "", scrollY: 0, openExerciseId: null, selection: atlasPruneSelection(model, sc, atlasBrowseMemory.selection) });
  };
  const openCategory = (c) => {
    if (!c.enabled) return;
    if (!atlasHasSubregionScreen(c)) return openList({ categoryCode: c.code });
    atlasBrowsePush();
    setNav({ level: "category", categoryCode: c.code, subregionCode: null, query: "", scrollY: 0, openExerciseId: null });
  };
  // D2: Ulubione / Moje ćwiczenia (one level below E01; their filters are their own)
  const openUserList = (kind) => {
    const input = atlasFocusedSearch();
    if (input) input.blur();
    atlasBrowsePush();
    setNav({ level: kind, categoryCode: null, subregionCode: null, query: "", scrollY: 0, openExerciseId: null, saved: { selection: atlasBrowseMemory.selection, sort: atlasBrowseMemory.sort }, selection: {}, sort: null, mineView: "active", favUndo: null });
  };
  const openExercise = (id) => {
    const input = atlasFocusedSearch();
    if (input) input.blur();
    atlasBrowseMemory.scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0; // D06: back to the same place
    atlasBrowsePush();
    Object.assign(atlasBrowseMemory, { openExerciseId: id });
    pendingScroll.current = 0; // the card starts at the top, wherever the list was scrolled
    setNavState(read());
  };

  if (card)
    return (
      <AtlasExerciseDetail
        key={card.exerciseId}
        exercise={card}
        onBack={onScreenBack}
        onNavigate={onNavigate}
        history={history}
        isPro={isPro}
        onOpenUnlock={onOpenUnlock}
        onOpenSession={onOpenSession}
        // a variant opens its own card in place of this one (Back → the list), as in AT2
        onOpenVariant={(id) => {
          Object.assign(atlasBrowseMemory, { openExerciseId: id });
          pendingScroll.current = 0;
          setNavState(read());
        }}
      />
    );

  // search + filters of the current level (E01 / E05 / E03)
  const nSel = atlasSelectionCount(nav.selection);
  // results at every character (55 records — no delay); the automatic sort follows the query
  const onQuery = (q) => patch({ query: q });
  const searchCtl = {
    query: nav.query,
    onQuery,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onCancel: () => {
      // „Anuluj”: the query is cleared and E01 is back as before the search
      if (inputRef.current) inputRef.current.blur();
      setFocused(false);
      patch({ query: "", sort: null });
    },
    scopeKey: atlasScopeKey(scope),
  };
  const filtersCtl = model.ok && (nav.level === "list" || nav.level === "home") ? atlasActiveFilters(model, scope, nav.query, nav.selection) : [];
  const removeFilter = (f) => {
    const next = { ...nav.selection, [f.dimension]: (nav.selection[f.dimension] || []).filter((c) => c !== f.code) };
    if (!next[f.dimension].length) delete next[f.dimension];
    patch({ selection: next });
  };
  const clearSelection = () => patch({ selection: {} });
  const openFilters = () => {
    const input = atlasFocusedSearch();
    if (input) input.blur();
    setSheet(true);
  };
  const resultsFor = (listLabel, endNote) => {
    if (!model.ok) return null;
    return (
      <AtlasResults
        model={model}
        scope={scope}
        scopeKind={scopeKind}
        scopeLabel={scopeLabel}
        query={nav.query}
        selection={nav.selection}
        sort={nav.sort}
        onToggleSort={(s) => patch({ sort: s })}
        listLabel={listLabel}
        onOpenExercise={openExercise}
        onQuery={(q) => patch({ query: q })}
        onClearSelection={clearSelection}
        endNote={endNote}
      />
    );
  };
  const zeroWithMessage = model.ok && nav.level !== "category" && nSel > 0 && model.browseResults(scope, nav.query, nav.selection).total === 0;
  // D02b: „Usunięto z ulubionych: … · Cofnij” on the list after a card removed the favourite
  const favUndo = nav.level === "favourites" ? nav.favUndo : null;
  const listToast = favUndo ? (
    <AtlasToast
      key={`${favUndo.removed.exerciseId}:${favUndo.at}`}
      text={`Usunięto z ulubionych: ${favUndo.name}`}
      actionLabel="Cofnij"
      onAction={() => {
        restoreFavouriteExercise(favUndo.removed);
        patch({ favUndo: null });
      }}
      onDone={() => patch({ favUndo: null })}
      testId="atlas-list-toast"
    />
  ) : null;
  const activeGroup = <AtlasActiveFilters filters={filtersCtl} onRemove={removeFilter} onClearAll={zeroWithMessage ? null : clearSelection} />;

  let view;
  if (userLevel) {
    const fav = nav.level === "favourites";
    const row = (
      <AtlasSearchRow
        search={searchCtl}
        label={fav ? "Szukaj w Ulubionych" : "Szukaj w Moich ćwiczeniach"}
        placeholder={["Szukaj w tej liście", "Szukaj"]}
        filtersCount={nSel}
        onOpenFilters={openFilters}
        filtersRef={filtersRef}
        inputRef={inputRef}
      />
    );
    view = (
      <AtlasUserListView
        kind={nav.level}
        view={nav.mineView}
        onView={(v) => setNav({ mineView: v, selection: {}, scrollY: 0 })}
        model={model}
        count={userList.ids.length}
        onBack={onScreenBack}
        onBrowseAtlas={onScreenBack}
        onOpenExercise={openExercise}
        search={{ ...searchCtl, row, filters: activeGroup }}
        results={model.ok ? (
          <AtlasResults
            model={model}
            scope={scope}
            scopeKind={scopeKind}
            scopeLabel=""
            query={nav.query}
            selection={nav.selection}
            sort={nav.sort}
            onToggleSort={(s) => patch({ sort: s })}
            listLabel={fav ? "Ulubione" : nav.mineView === "archived" ? "Zarchiwizowane ćwiczenia" : "Moje ćwiczenia"}
            onOpenExercise={openExercise}
            onQuery={(q) => patch({ query: q })}
            onClearSelection={clearSelection}
            noResultsText="Sprawdź pisownię albo wpisz mniej słów."
          />
        ) : null}
        toast={listToast}
      />
    );
  } else if (model.ok && nav.level === "list") {
    const fromCategory = Boolean(sub) || atlasHasSubregionScreen(cat);
    const title = sub ? sub.label : cat ? cat.label : "Wszystkie ćwiczenia";
    const row = (
      <AtlasSearchRow
        search={searchCtl}
        label={scopeKind === "global" ? "Szukaj w całym Atlasie" : scopeKind === "subregion" ? `Szukaj w podpartii ${title}` : `Szukaj w partii ${title}`}
        placeholder={scopeKind === "global" ? ATLAS_SEARCH_HINTS : [scopeKind === "subregion" ? "Szukaj w tej podpartii" : "Szukaj w tej partii", "Szukaj"]}
        filtersCount={nSel}
        onOpenFilters={openFilters}
        filtersRef={filtersRef}
        inputRef={inputRef}
      />
    );
    view = (
      <AtlasListView
        title={title}
        barLabel={fromCategory ? cat.label : "Ćwiczenia"}
        backLabel={fromCategory ? `Wróć do partii ${cat.label}` : "Wróć do Ćwiczeń"}
        onBack={onScreenBack}
        search={{ ...searchCtl, row, filters: activeGroup }}
        results={resultsFor(`Ćwiczenia: ${title}`, true)}
      />
    );
  } else if (model.ok && nav.level === "category" && cat) {
    view = <AtlasCategoryView category={cat} onBack={onScreenBack} onOpenAll={() => openList({ categoryCode: cat.code })} onOpenSubregion={(s) => s.enabled && openList({ categoryCode: cat.code, subregionCode: s.code })} />;
  } else {
    const row = <AtlasSearchRow search={searchCtl} label="Szukaj ćwiczenia" placeholder={ATLAS_SEARCH_HINTS} cancel={searching && focused} filtersCount={nSel} onOpenFilters={openFilters} filtersRef={filtersRef} inputRef={inputRef} />;
    const hasQuery = Boolean(String(nav.query).trim());
    view = (
      <AtlasHomeView
        model={model}
        onOpenAll={() => openList({})}
        onOpenCategory={openCategory}
        onRetry={() => {
          atlasBrowseRetry();
          setRetry((n) => n + 1);
        }}
        userCounts={model.ok ? atlasUserCounts() : null}
        onOpenFavourites={() => openUserList("favourites")}
        onOpenMine={() => openUserList("mine")}
        ownCount={ownCount}
        onOpenOwn={onOpenOwn}
        searching={searching}
        search={{ row, filters: searching ? activeGroup : null }}
        results={hasQuery ? resultsFor("Wyniki wyszukiwania", false) : null}
      />
    );
  }
  const scopeLine = scopeKind === "favourites" ? "Ulubione" : scopeKind === "mine" ? "Moje ćwiczenia" : scopeKind === "archived" ? "Zarchiwizowane ćwiczenia" : scopeKind === "global" ? "Cały Atlas" : scopeKind === "subregion" ? `Podpartia: ${scopeLabel}` : `Partia: ${scopeLabel}`;
  return (
    <>
      <FontStyles />
      <div ref={bgRef}>
        {view}
        <BottomNav screen="exercises" onNavigate={onNavigate} />
      </div>
      {sheet && model.ok && <AtlasFilterSheet model={model} scope={scope} scopeLine={scopeLine} query={String(nav.query).trim()} selection={nav.selection} onChange={(sel) => patch({ selection: sel })} onClose={closeSheet} />}
    </>
  );
}
