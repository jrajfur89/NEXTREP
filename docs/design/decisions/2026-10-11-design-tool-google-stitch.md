# Decision: Google Stitch jako główne narzędzie projektowania ekranów (F-2)

Date: 2026-10-11

> **Status: Superseded (K01-2, 12.10.2026)** — UX/UI wyłącznie w Claude Design:
> `2026-10-12-design-tool-claude-design.md`. Treść poniżej zostaje jako historia decyzji.

## Context

Decyzja F-2 (11.10.2026, po audycie MASTER PLAN): **Google Stitch** jest głównym narzędziem
projektowania ekranów, **`DESIGN.md`** jest dokumentem zasad wizualnych, **Claude** wykonuje
implementację. Polecenie: najpierw wskazać konflikt z `DESIGN.md` §17 i nie zmieniać samodzielnie
wartości Design Systemu.

Ten dokument tylko opisuje konflikty i proponuje zmiany tekstu. **Żaden plik `docs/design/` poza tym
nie został zmieniony**, a żadna wartość (kolor, czcionka, odstęp, promień, efekt) nie jest tu zmieniana.

## Stan dokumentów (sprawdzony 11.10.2026)

| Dokument | `main` (`01f1e8b`) | `release/1.0` |
| --- | --- | --- |
| `DESIGN.md` | wersja z 10–11.10: nowe wartości (np. brand `#FF6A00`, tło `#090909`, Barlow Condensed + Inter, przycisk z tekstem `#090909`, promień przycisku 10 px), §15 aktywny trening, §16 fotografia, §17 Claude Design, §18 zasoby marki | **starsza wersja** sprzed 10.10 (np. `#FF6A13`, `#0B0B0C`, tylko Inter, biały tekst przycisku, promień 12 px), bez §15–§18 |
| `STITCH.md` | Stitch jako główne środowisko; „Primary font: Inter. Do not introduce a new font…” | identyczny |
| `DESIGN_STATUS.md` | ostatnia aktualizacja 03.10; Stitch project TODO, ekrany TODO | identyczny |

## Konflikty

| # | Gdzie | Treść | Konflikt z F-2 |
| --- | --- | --- | --- |
| K1 | `DESIGN.md` §17 (`main`) | „Claude Design is the selected visual exploration environment… Prior Google Stitch workflow notes are historical, not a mandate to use Stitch.” | **wprost sprzeczne**: F-2 przywraca Stitch jako główne narzędzie |
| K2 | `DESIGN.md` nagłówek „Purpose” (`main`) | „visual source of truth for NEXTREP design work in Claude Design” | sprzeczne z F-2 |
| K3 | `DESIGN.md` §7 (`main`) | „Component details are developed iteratively in Claude Design” | sprzeczne z F-2 |
| K4 | `DESIGN.md` §12 (`main` i `release/1.0`) | „Stitch is used for visual exploration…” | zgodne z F-2, ale na `main` sprzeczne z §17 tego samego pliku |
| K5 | `STITCH.md` „Baseline” | „Primary font: Inter. Do not introduce a new font…” | sprzeczne z zatwierdzonym `DESIGN.md` §3 na `main` (Barlow Condensed jako krój nagłówków). Stitch prowadzony wg `STITCH.md` odrzuciłby zatwierdzony krój |
| K6 | `DESIGN_STATUS.md` | stan z 03.10; nie odnotowuje zatwierdzeń z 10–11.10 (§15, §16, §18, nowe wartości) | status nieaktualny wobec F-2 i wobec `DESIGN.md` |
| K7 | rozjazd gałęzi | `release/1.0` ma starszy `DESIGN.md` | implementacja 1.0 z tej gałęzi użyłaby nieaktualnych wartości |
| K8 | §17 i §18 (`main`) | „Approved screenshots… provide visual guidance”; kontrast 4.25:1 „reported by Claude Design” | zaakceptowane zrzuty z Claude Design nie są w repozytorium; nie wiadomo, które ekrany są wzorcem dla Stitch |

Nie jest konfliktem: podział ról w `STITCH.md` i `DESIGN_STATUS.md` (Stitch — ekrany, GitHub — źródło
prawdy, Claude — implementacja) jest zgodny z F-2.

## Decision

Przyjęte (F-2, 11.10.2026): Google Stitch — projektowanie ekranów; `DESIGN.md` — zasady wizualne;
Claude — implementacja w istniejącej aplikacji.

## Proponowane zmiany tekstu (do Twojej akceptacji, niewykonane)

1. `DESIGN.md` — oznaczyć §17 jako zastąpiony (nie usuwać historii) i dodać §19 „Design workflow update
   (2026-10-11)”: Stitch jako główne narzędzie ekranów; wartości, §15, §16 i §18 zatwierdzone w okresie
   pracy w Claude Design pozostają obowiązujące bez zmian; Claude implementuje.
2. `DESIGN.md` nagłówek „Purpose” i §7: „Claude Design” → „Google Stitch”.
3. `STITCH.md` „Baseline”: zamiast „Primary font: Inter. Do not introduce a new font…” — „Kroje i
   wartości wyłącznie wg `DESIGN.md` (§2–§9, §18)”.
4. `DESIGN_STATUS.md`: data, F-2, zatwierdzenia z 10–11.10, następny krok (projekt Stitch, ekran
   referencyjny).
5. `release/1.0`: przenieść aktualny `DESIGN.md` z `main` (tylko dokumentacja, bez zmiany wartości),
   żeby implementacja 1.0 korzystała z zatwierdzonych wartości.
6. Zapisać w `docs/design/` listę zaakceptowanych zrzutów (lub same zrzuty) z okresu Claude Design jako
   wzorzec dla Stitch.

Zmiany 1–4 dotyczą plików, których aktualna wersja jest na `main`. Ponieważ `main` nie zmieniam,
proponuję wykonać je na `release/1.0` po kroku 5, albo możesz je wprowadzić na `main` sam.

## Alternatives considered

- Zostawić Claude Design (stan `main` §17) — odrzucone decyzją F-2.
- Dwa narzędzia równolegle — ryzyko rozjazdu wzorców; nieproponowane.

## Consequences

- Etapy designu D1–D4 (MASTER PLAN, sekcja C) prowadzone w Stitch.
- Do sprawdzenia przy zakładaniu projektu Stitch: dostępność kroju Barlow Condensed i możliwość
  wprowadzenia dokładnych wartości tokenów.
- Zatwierdzone wcześniej wartości i zasady marki pozostają bez zmian.

## Status

Accepted (narzędzie, F-2) · zmiany tekstu 1–6: **Proposed**
