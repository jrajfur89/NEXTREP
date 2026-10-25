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

// The app's model: built once from the bundled release; „Spróbuj ponownie” (E07) rebuilds it.
let atlasBrowseMemo = null;
function atlasBrowseModel() {
  if (!atlasBrowseMemo) atlasBrowseMemo = Object.freeze(createAtlasBrowse(ATLAS_RELEASE, ATLAS_NAVIGATION));
  return atlasBrowseMemo;
}
function atlasBrowseRetry() {
  atlasBrowseMemo = null;
  return atlasBrowseModel();
}

/* ---------------------------------------------------------------------- */
/* I5.2 — components P1–P9 of ATLAS-UX-01 (design package v2 §4, boards     */
/* E01–E07). Presentational: data comes from the view model above; nothing  */
/* here is wired to a screen yet (I5.3).                                    */
/* ---------------------------------------------------------------------- */
// Colours of the boards that are not DS tokens yet (DS-3): one place, to be replaced after DS-SYNC.
const ATLAS_PROPOSED_DS = Object.freeze({
  surfaceS2: "#121213", // PROPOSED DS — S2 (input / filter button surface)
  surfaceS4: "#1A1A1B", // PROPOSED DS — S4 (secondary button, error icon tile)
  textChip: "#D9D9D9", // PROPOSED DS — chip text in rows
});
const ATLAS_UI = Object.freeze({
  num: "Inter, 'Barlow Condensed', sans-serif",
  focus: "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]",
  muted: "#9A9A9A",
  chip: "#222224",
  divider: "#1E1E20",
  dashed: "#2A2A2A",
  link: "#FF9A3D",
  tileSurface: "radial-gradient(90% 80% at 100% 0%, rgba(255,133,27,.06) 0%, rgba(255,133,27,0) 60%), linear-gradient(180deg, #151515 0%, #0F0F10 55%, #090909 100%)",
  subSurface: "linear-gradient(180deg, #151515 0%, #0F0F10 55%, #090909 100%)",
});
const ATLAS_SR = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
const AtlasNum = ({ children, style }) => <span style={{ fontFamily: ATLAS_UI.num, fontVariantNumeric: "tabular-nums", ...style }}>{children}</span>;

// P1 — search field: role=search, hidden label, Enter → blur (keeps results), „Wyczyść” keeps the
// focus and the keyboard, optional „Anuluj” (E05) and a trailing slot (P9).
function AtlasSearchField({ value, onChange, label, placeholder = "", onCancel, onFocus, onBlur, inputRef, disabled = false, children, testId = "atlas-search" }) {
  const own = useRef(null);
  const ref = inputRef || own;
  const [focused, setFocused] = useState(false);
  return (
    <div role="search" data-testid={testId} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <style>{`[data-atlas-search]::-webkit-search-cancel-button{display:none;-webkit-appearance:none}[data-atlas-search]::placeholder{color:#8E8E8E;opacity:1}`}</style>
      <label style={{ flex: "1 1 auto", minWidth: 0, position: "relative", display: "flex", alignItems: "center" }}>
        <span style={ATLAS_SR}>{label}</span>
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
          placeholder={placeholder}
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
          style={{ width: "100%", minHeight: "48px", boxSizing: "border-box", padding: value ? "0 48px 0 44px" : "0 14px 0 44px", borderRadius: "12px", border: focused ? `2px solid ${NR.warm}` : `1px solid ${NR.control}`, background: ATLAS_PROPOSED_DS.surfaceS2, color: NR.textPrimary, fontFamily: NR.font, fontSize: "18px", lineHeight: "22px", outline: "none", WebkitAppearance: "none", appearance: "none", opacity: disabled ? 0.5 : 1 }}
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
        <button type="button" onClick={onCancel} data-testid={`${testId}-cancel`} className={ATLAS_UI.focus} style={{ flexShrink: 0, minHeight: "48px", padding: "0 6px", border: 0, background: "transparent", display: "flex", alignItems: "center", color: ATLAS_UI.link, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
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
      style={{ minHeight: "44px", padding: "0 12px", borderRadius: "100px", border: off ? `1px dashed ${ATLAS_UI.dashed}` : selected ? `1px solid ${NR.warm}` : `1px solid ${ATLAS_UI.chip}`, background: off ? "transparent" : selected ? "rgba(255,133,27,.14)" : ATLAS_UI.chip, color: off ? NR.textMuted : NR.textPrimary, display: "flex", alignItems: "center", gap: "6px", fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", cursor: off ? "default" : "pointer" }}
    >
      {selected && <Check aria-hidden="true" size={16} color={ATLAS_UI.link} />}
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
      <X aria-hidden="true" size={16} color={ATLAS_UI.link} />
    </button>
  );
}

// P4 — category tile 3:2. The photo layer is always rendered (empty in 1.0, no assets — NR-01 later);
// `photo` ({ src, srcSet, focus }) is supported: lazy, alt="", scrim only with a photo, failure → no photo.
function AtlasCategoryTile({ label, count, enabled = true, onOpen, photo = null, testId = "atlas-category-tile" }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const withPhoto = Boolean(enabled && photo && photo.src && !photoFailed);
  const photoLayer = (
    <span data-layer="photo" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
      {withPhoto && <img src={photo.src} srcSet={photo.srcSet} alt="" loading="lazy" onError={() => setPhotoFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: photo.focus || "50% 50%" }} />}
    </span>
  );
  const body = { position: "absolute", inset: 0, boxSizing: "border-box", padding: "12px 12px 10px 14px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px" };
  if (!enabled) {
    return (
      <button type="button" disabled aria-label={`${label}, ${count} ${plPlural(count, "exercise")}, brak w tym wydaniu Atlasu`} data-tile="category" data-photo="none" data-testid={testId} style={{ position: "relative", display: "block", width: "100%", aspectRatio: "3 / 2", padding: 0, borderRadius: "16px", overflow: "hidden", border: `1px dashed ${ATLAS_UI.dashed}`, background: "#0F0F10", color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "default" }}>
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
    <button type="button" onClick={onOpen} data-tile="category" data-photo={withPhoto ? "photo" : "none"} data-testid={testId} className={ATLAS_UI.focus} style={{ position: "relative", display: "block", width: "100%", aspectRatio: "3 / 2", padding: 0, border: 0, borderRadius: "16px", overflow: "hidden", background: ATLAS_UI.tileSurface, boxShadow: NR.cardShadow, color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "pointer" }}>
      {photoLayer}
      {withPhoto && <span aria-hidden="true" data-layer="scrim" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(9,9,9,0) 35%, rgba(9,9,9,.55) 62%, rgba(9,9,9,.88) 100%)" }} />}
      <span style={body}>
        <span style={{ fontSize: "20px", lineHeight: "23px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
          <span style={{ fontSize: "15px", lineHeight: "18px", color: withPhoto ? ATLAS_PROPOSED_DS.textChip : NR.textSecondary }}>
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
function AtlasExerciseRow({ exerciseId, name, line, alias = null, chips = [], onOpen, testId = "atlas-row" }) {
  return (
    <li style={{ borderBottom: `1px solid ${ATLAS_UI.divider}`, listStyle: "none" }}>
      <button type="button" onClick={() => onOpen && onOpen(exerciseId)} data-exercise-id={exerciseId} data-testid={testId} className={ATLAS_UI.focus} style={{ width: "100%", minHeight: "64px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px 10px 21px", border: 0, background: "transparent", color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "pointer" }}>
        <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "19px", lineHeight: "23px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{name}</span>
          {line && <span style={{ fontSize: "15px", lineHeight: "19px", color: NR.textSecondary, overflowWrap: "anywhere" }}>{line}</span>}
          {alias && <span style={{ fontSize: "15px", lineHeight: "19px", color: ATLAS_UI.muted, overflowWrap: "anywhere" }}>Też jako: {alias}</span>}
          {chips.length > 0 && (
            <span style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
              {chips.slice(0, 2).map((c) => (
                <span key={c.code} style={{ padding: "2px 8px", borderRadius: "100px", background: ATLAS_UI.chip, fontSize: "14px", lineHeight: "18px", color: ATLAS_PROPOSED_DS.textChip }}>
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
function atlasRowProps(model, ex, { global = false, query = "" } = {}) {
  if (!model || !model.ok || !ex) return null;
  const equipment = model.rowEquipment(ex);
  return {
    exerciseId: ex.exerciseId,
    name: ex.namePl,
    line: global ? [model.rowCategoryLabel(ex), equipment].filter(Boolean).join(" · ") : equipment,
    alias: query ? model.aliasHit(ex, query) : null,
    chips: global ? [] : model.rowChips(ex),
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
function AtlasMessage({ variant = "empty", title, text, primary = null, link = null, marginTop = 28, testId = "atlas-message" }) {
  const error = variant === "error";
  const content = (
    <div data-testid={testId} data-variant={variant} style={{ marginTop: `${marginTop}px`, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "0 20px", textAlign: "center", fontFamily: NR.font }}>
      <span aria-hidden="true" style={{ width: "56px", height: "56px", borderRadius: "16px", background: error ? ATLAS_PROPOSED_DS.surfaceS4 : "rgba(255,133,27,.10)", border: error ? `1px solid ${ATLAS_UI.dashed}` : "1px solid rgba(255,133,27,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {error ? <RefreshCcw size={26} color={NR.textSecondary} /> : <Search size={26} color={NR.warm} />}
      </span>
      <p style={{ margin: 0, fontSize: "23px", lineHeight: "26px", fontWeight: 500, color: NR.textDisplay }}>{title}</p>
      {text && <p style={{ margin: 0, fontSize: "17px", lineHeight: "21px", color: NR.textSecondary }}>{text}</p>}
      {(primary || link) && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginTop: "6px" }}>
          {primary && (
            <button type="button" onClick={primary.onClick} data-testid={`${testId}-primary`} className={ATLAS_UI.focus} style={{ minHeight: "52px", boxSizing: "border-box", border: 0, borderRadius: "12px", padding: "8px 20px", background: ATLAS_PROPOSED_DS.surfaceS4, color: NR.textPrimary, fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 500, cursor: "pointer" }}>
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
            <button type="button" onClick={link.onClick} data-testid={`${testId}-link`} className={ATLAS_UI.focus} style={{ minHeight: "44px", padding: "0 8px", border: 0, background: "transparent", color: ATLAS_UI.link, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", fontWeight: 500, cursor: "pointer" }}>
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
    <button ref={buttonRef} type="button" aria-label={active ? `Filtry, aktywne: ${count}` : "Filtry"} aria-haspopup="dialog" onClick={onOpen} data-testid={testId} className={ATLAS_UI.focus} style={{ position: "relative", flexShrink: 0, width: "48px", height: "48px", boxSizing: "border-box", borderRadius: "12px", border: active ? `2px solid ${NR.warm}` : `1px solid ${NR.control}`, background: ATLAS_PROPOSED_DS.surfaceS2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      <SlidersHorizontal aria-hidden="true" size={20} color={active ? NR.warm : NR.textPrimary} />
      {active && (
        <span aria-hidden="true" data-testid={`${testId}-badge`} style={{ position: "absolute", top: "-7px", right: "-7px", minWidth: "20px", height: "20px", boxSizing: "border-box", padding: "0 5px", borderRadius: "100px", background: NR.brand, color: NR.bg, fontFamily: ATLAS_UI.num, fontVariantNumeric: "tabular-nums", fontSize: "12px", lineHeight: "20px", fontWeight: 600, textAlign: "center" }}>
          {count}
        </span>
      )}
    </button>
  );
}
