# Decision: Claude Design jako jedyne narzędzie UX/UI (K01-2)

Date: 2026-10-12

## Context

Decyzja K01-2 (12.10.2026, korekta strategii K01): UX/UI NEXTREP 1.0 jest projektowane wyłącznie
w **Claude Design**. NEXTREP 1.0 to istniejąca aplikacja `src/app/` (K01-1), więc projekty dotyczą jej
ekranów; Claude wdraża zaakceptowane ekrany bez zmiany logiki aplikacji.

To przywraca kierunek z `DESIGN.md` §17 na `main` (10.10.2026) i zastępuje decyzję F-2 (Google Stitch,
11.10.2026).

## Decision

- Narzędzie projektowania ekranów i komponentów: **Claude Design**.
- Źródło wartości (kolory, typografia, odstępy, promienie, efekty, §15 aktywny trening, §16 fotografia,
  §18 zasoby marki): `docs/design/DESIGN.md` w wersji z `main` (`01f1e8b`), przeniesionej na
  `release/1.0` bez zmian w etapie K02. Kontrola: `git diff origin/main -- docs/design/DESIGN.md` jest
  pusty.
- Projekt z Claude Design staje się obowiązujący dopiero po Twojej akceptacji i zapisaniu w `docs/design/`.
- Wartości Design Systemu nie zmieniają się bez Twojej zgody.

## Consequences

- `2026-10-11-design-tool-google-stitch.md` (F-2) i `2026-10-11-design-docs-text-proposal.md` (O-21):
  Superseded. Treść zostaje jako historia; poprawka 5 z propozycji (przeniesienie `DESIGN.md` z `main`)
  wykonana.
- `STITCH.md`: dokument historyczny.
- W `DESIGN.md` z `main` zostały wzmianki o Stitch w §12 („Relationship with Stitch and Claude”) i §14
  („not yet designed in Stitch”), sprzeczne z §17. Propozycja zmiany tekstu (bez zmiany wartości), do
  Twojej akceptacji przed DS1:
  - §12 tytuł: „Relationship with Claude Design and Claude”; zdania o Stitch → „Claude Design is used for
    visual exploration and screen/component design.” i „A Claude Design exploration is not automatically
    an accepted design…”;
  - §14: „not yet designed in Claude Design”.
- Etapy designu: DS1 (projekty w Claude Design) i DS2 (wdrożenie w `src/app/`) — MASTER PLAN v3 sekcja K.

## Status

Accepted (K01-2, 12.10.2026). Zmiany tekstu §12 i §14: Proposed.
