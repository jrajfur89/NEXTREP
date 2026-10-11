# Proposal: sześć poprawek tekstu dokumentacji designu (O-21)

Date: 2026-10-11

Status: **Proposed — czeka na akceptację. Żadna z poprawek nie jest wykonana.**

## Context

Decyzja O-21 (11.10.2026): przygotować propozycję sześciu poprawek. Google Stitch pozostaje głównym
workflow ekranów (F-2). **Wartości zatwierdzonego Design Systemu nie mogą się zmienić bez Twojej
zgody.** Konflikty K1–K8: `2026-10-11-design-tool-google-stitch.md`.

Bazą poprawek jest `DESIGN.md` z `main` (`01f1e8b`), bo to wersja z zatwierdzeniami z 10–11.10.

## Niezmiennik: wartości przed i po poprawkach muszą być identyczne

Zbiór wartości w `DESIGN.md` na `main` (wyciągnięty 11.10.2026):

- Kolory: `#090909`, `#0F0F10`, `#151515`, `#18181A`, `#1B1B1D`, `#222224`, `#2A2A2A`, `#42C98A`,
  `#4A4A4A`, `#777777`, `#B8B8B8`, `#CC4F00`, `#D94F00`, `#E5A63A`, `#E84B4B`, `#F5F5F5`, `#FF6A00`,
  `#FF8A2A`, `#FF9A3D`.
- Kroje: Barlow Condensed, Inter.
- Rozmiary, odstępy, promienie, krycia: bez zmian (każda wartość `px` i `%` z pliku).

Kontrola po wykonaniu poprawek (do uruchomienia przy commicie):

```sh
extract() { grep -oE '#[0-9A-Fa-f]{6}|[0-9]+(–[0-9]+)? ?px|[0-9]+%|Barlow Condensed|Inter' "$1" | sort -u; }
diff <(git show origin/main:docs/design/DESIGN.md | extract /dev/stdin) <(extract docs/design/DESIGN.md)
# wynik musi być pusty
```

## Poprawka 1 — `DESIGN.md` §17: oznaczyć jako zastąpiony

Przed:

> ## 17. Design workflow update (2026-10-10)
>
> Claude Design is the selected visual exploration environment with UI/UX Pro Max skill if actually
> available. Approved screenshots and this file provide visual guidance. […] Prior Google Stitch workflow
> notes are historical, not a mandate to use Stitch.

Po (treść §17 zostaje bez zmian, dochodzi jedna linia pod nagłówkiem):

> ## 17. Design workflow update (2026-10-10)
>
> **Superseded by §19 (2026-10-11) as to the design tool. All values and rules approved under this
> section remain valid.**
>
> *(oryginalna treść §17 bez zmian)*

## Poprawka 2 — `DESIGN.md`: nowa §19 i nagłówek „Purpose” oraz §7

Nagłówek, przed: `Purpose: visual source of truth for NEXTREP design work in Claude Design and later
implementation in the existing application.`

Po: `Purpose: visual source of truth for NEXTREP design work in Google Stitch and later implementation
in the existing application.`

§7, przed: `Component details are developed iteratively in Claude Design and documented here before
implementation.`

Po: `Component details are developed iteratively in Google Stitch and documented here before
implementation.`

Nowa sekcja na końcu pliku:

> ## 19. Design workflow update (2026-10-11)
>
> Google Stitch is the primary environment for screen and component design. This file is the source of
> visual rules and values. Claude implements accepted designs in the existing application.
>
> - All values in §2–§9 and all decisions in §15, §16 and §18 approved on 2026-10-10 and 2026-10-11
>   remain valid and unchanged. Changing any value requires the owner's explicit approval recorded here.
> - Rules carried over from §17: the existing PWA and its training, progression and data architecture
>   are not modified during visual exploration; start with shared foundations, then Dashboard and
>   Active Workout; each screen is reviewed before acceptance; the existing app icon remains unchanged.
> - Screens produced earlier in Claude Design and approved by the owner are reference material for
>   Stitch (list: `REFERENCES.md`).
> - A Stitch output is exploratory until accepted and documented (§12).

## Poprawka 3 — `STITCH.md` „Baseline”

Przed:

> Stitch must follow the values documented in DESIGN.md.
>
> Primary font: Inter.
>
> Do not introduce a new font, palette, spacing scale or radius system unless the change is explicitly
> reviewed and recorded in DESIGN.md.

Po:

> Stitch must follow the values documented in DESIGN.md (§2–§9, §15, §16, §18).
>
> Typefaces: as defined in DESIGN.md §3 (Barlow Condensed for display headings, Inter for UI and body).
>
> Do not introduce a new font, palette, spacing scale or radius system unless the change is explicitly
> approved by the owner and recorded in DESIGN.md.

## Poprawka 4 — `DESIGN_STATUS.md`

Zmiany: „Last updated: 2026-10-11”; nowa sekcja „Decisions since 2026-10-03”: wartości i typografia
(10.10), §15 aktywny trening (10.10), §16 fotografia (10.10), §18 zasoby marki (11.10), §19 Google Stitch
jako główne narzędzie (11.10); w tabeli statusu: „Stitch project: TODO”, „Reference screen: TODO”,
„Reference material from Claude Design: TO RECORD (`REFERENCES.md`)”. Rola „ChatGPT: design architecture,
consistency, specifications, review and documentation” bez zmian. Pozostałe statusy bez zmian (nie
oceniam postępu, którego nie widzę w repozytorium).

## Poprawka 5 — przeniesienie aktualnego `DESIGN.md` na `release/1.0`

`release/1.0` ma starszą wersję `DESIGN.md` (np. `#FF6A13`, tylko Inter). Proponuję skopiować plik
z `main` (`git checkout origin/main -- docs/design/DESIGN.md`) na `release/1.0` przed poprawkami 1–2.
To nie zmienia zatwierdzonych wartości, tylko wyrównuje gałąź do stanu zatwierdzonego. `main` pozostaje
bez zmian.

## Poprawka 6 — `docs/design/REFERENCES.md` (nowy plik)

Szablon listy materiałów wzorcowych:

| Ekran / element | Źródło (Claude Design / Stitch) | Data akceptacji | Plik lub link | Uwagi |
| --- | --- | --- | --- | --- |
| *(do uzupełnienia przez Ciebie)* | | | | |

Zrzutów z okresu Claude Design nie ma w repozytorium. Mogę je dodać, jeśli je przekażesz.

## Kolejność wykonania (po akceptacji)

5 → 1 → 2 → 3 → 4 → 6, jeden commit na `release/1.0`, kontrola niezmiennika wartości przed commitem.
Na `main` nic się nie zmienia; przeniesienie poprawek na `main` to Twoja osobna decyzja.
