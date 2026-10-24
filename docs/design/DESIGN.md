# NEXTREP — DESIGN SYSTEM

Status: APPROVED VISUAL DIRECTION / COMPONENTS IN PROGRESS  
Version: 1.0  
Purpose: visual source of truth for NEXTREP design work in Claude Design and later implementation in the existing application.

## 1. Design direction

NEXTREP uses a dark, premium, sporty, modern and minimalist visual language. It should feel like a professional strength-training product, not a gaming interface.

Visual hierarchy:
- dark base
- graphite surfaces
- white information
- orange action/progress/focus/brand
- subtle orange light/glow

Orange must not be used for every highlighted element. It primarily communicates ACTION, PROGRESS, FOCUS and BRAND.

Approximate visual balance:
- 70% near-black/dark surfaces
- 20–25% white/gray typography
- 5–10% orange

## 2. Colors

### Brand
- primary: #FF6A00
- warm-highlight: #FF851B (approved 2026-10-11; accent of the approved masters: section headings, icons, active navigation, card edge light, focus ring)
- light: #FF8A2A
- bright: #FF9A3D
- dark: #CC4F00
- gradient-end: #D94F00

### Background
- base: #090909
- elevated: #0F0F10

### Surface
- default: #151515
- secondary: #1B1B1D
- tertiary: #222224

### Border
- default: #2A2A2A
- subtle: #1E1E20 (decorative separators only: table rows, section dividers)
- control: #66666A (default outline of inputs and selects; 3.28:1 against the field fill #121213, 3.44:1 against the card #0B0B0C; the active state keeps 2 px warm-highlight #FF851B) — approved 2026-10-21

### Text
- display: #FFFFFF (display typography only: greetings, workout and exercise titles, key metric values)
- primary: #F5F5F5
- secondary: #B8B8B8
- tertiary: #9A9A9A (labels, column headers)
- muted: #8E8E8E (captions, de-emphasised hints, empty field values; replaces #777777)
- disabled: #4A4A4A (disabled controls only; never for information)

### Rest timer
- rest: #5EC2FF (rest-timer accent from the approved Active Workout master: dock label, icon and progress; dock fill #0E1114, border rgba(94,194,255,.30); 9.59:1 on #0E1114) — decision G02-CLOSEOUT 2026-10-24

### Status
- success: #42C98A
- warning: #FFB547 (icons, text, borders and tints of caution states; replaces #E5A63A)
- danger: #F2555A (destructive fills, borders and tints; replaces #E84B4B)
- danger-text: #FF6B60 (error and destructive text and icons on dark surfaces)

Status usage rules (NEXTREP visual rules):
- A destructive button filled with danger #F2555A uses a #090909 label.
- Error and destructive text and icons on dark surfaces use danger-text #FF6B60.
- danger-text #FF6B60 is not used as a button fill and danger #F2555A is not used as a text colour. These are NEXTREP consistency rules (one red for surfaces, one red for content), not WCAG findings.
- Status colours are always paired with a word or an icon.

### Contrast assessment
- Every real text/background pair is assessed separately against WCAG 2.2 SC 1.4.3: 4.5:1 for normal text, 3:1 for large text (at least 24 px, or at least 18.66 px bold).
- Non-text contrast (SC 1.4.11, 3:1) applies only to graphics needed to understand content and to visual indicators needed to identify a control or its state. Decorative separators and surfaces have no contrast requirement; a control identified by its text label does not need a visible boundary.
- Text and non-text contrast are reported separately. Measured pairs and their results are kept in the Design System approval package (token register), not restated here.

### Proposed tokens — not in force
The values below appear in approved masters but their name, role or accessibility assessment is pending. They are not tokens yet: do not reference these names in code until they are approved and moved to the sections above.

| Proposed name | Value | Observed role in masters | Open point |
|---|---|---|---|
| card-deep | #0B0B0C | card and list fills; stop of the bottom-navigation gradient | name and role |
| surface-control | #121213 | input, select and secondary-button fills | name and role (field boundary is provided by border control) |
| surface-tile | #141415 | metric tiles and tile buttons | name and role |
| surface-on-sheet | #1A1A1B | rows, icon wells and secondary buttons on #151515 sheets | name and role |
| border-card | #232325 | table regions, sections, metric tiles | name and role |

## 3. Typography

Barlow Condensed is the UI typeface of every approved master (2026-10-11 → 2026-10-20): screen titles, headings, body copy, labels, buttons, navigation, dates written as words and all other text.
- Screen title: 32/36, weight 600, sentence case.
- Section heading: 15/18, weight 500, UPPERCASE, letter spacing 0.03em (gradient warm text where the master uses it).
- Card / workout / exercise title: 23–29/26–34, weight 500, sentence case (exercise names never uppercase).
- Body: 16/20 (16–19 in controls), weight 400; label: 14–15/16–19; caption: 12–13.
- Buttons: 17–19, weight 500–600.

Inter is used only for numeric values: weight, repetitions, RIR values in inputs, times, timers, volume and table cells with numbers ("80 kg × 8", "01:12", "4 200 kg"), always with font-variant-numeric: tabular-nums. Inter is not replaced in these places.

The previous rule (Inter for buttons, forms, dates; Barlow Condensed bold uppercase for all headings) is superseded by the approved masters.

## 4. Spacing

- XS: 4 px
- SM: 8 px
- MD: 12 px
- LG: 16 px
- XL: 24 px
- 2XL: 32 px
- 3XL: 40 px
- 4XL: 48 px

## 5. Radius

- SM: 8 px
- MD: 12 px
- LG: 16 px
- XL: 20 px
- FULL: 100 px

Usage:
- small elements: 8
- buttons/inputs: 12
- cards: 16
- large containers: 20
- pills/badges: full

## 6. Effects

### Orange Glow
- color: #FF6A00
- blur: 20–40 px
- opacity: 15–30%
- X: 0
- Y: 4 for CTA glow; 0 for ambient glow

Use selectively under:
- timer
- logo
- primary CTA
- selected action/progress elements

### Card Shadow
- X: 0
- Y: 4
- Blur: 16
- Spread: 0
- black
- opacity: 50%

Effects must remain subtle.

## 7. Components

Baseline component families:
- Buttons
- Cards
- Badges
- Inputs
- Tabs
- Navigation
- Stat / Metric
- Progress
- Exercise elements
- Training elements
- Premium elements

Component details are developed iteratively in Claude Design and documented here before implementation.

## 8. Buttons

### Primary
- background: #FF6A00 (default); optional brand gradient #FF9A3D → #FF6A00 → #D94F00 at 135° for selected branded elements
- radius: 12 px
- height: 48–52 px
- Barlow Condensed, button style (17–19, weight 500–600; section 3)
- text: #090909
- decision G02-CLOSEOUT 2026-10-24: replaces radius 10 px and the Inter label; consistent with sections 3 and 5

### Primary CTA pill (approved masters: Dashboard, New User, Interrupted Workout, Entry Flow)
- visible pill 192 × 36 (min-width 192, grows with text), radius 8, touch target 44 px high
- fill: linear-gradient(180deg, #FF851B 0%, #FF6A00 55%, #FF6A00 100%), inner highlight + glow-cta
- label: Barlow Condensed 600 18/20, #090909, trailing arrow icon

### Destructive
- full-width 48–52 px, radius 10–12, fill danger #F2555A, label #090909 Barlow Condensed 19 px
- secondary destructive: transparent, border rgba(242,85,90,.45), label danger-text #FF6B60

### Secondary
- transparent or #18181A
- 1 px border using #2A2A2A or orange where appropriate

### Ghost
- no visible background
- text-focused

### Disabled
- subdued surface
- muted text
- no strong orange emphasis

## 9. Cards

- radius: 16 px
- surface: #151515 or #1B1B1D according to hierarchy
- border: #2A2A2A
- subtle shadow

Cards are used for workouts, exercises, history, stats, progress and PRO elements.

## 10. Photography

Preferred:
- strength training / bodybuilding
- dark and high contrast
- premium and professional
- strong silhouettes
- gradient into the dark background

Avoid bright images that visually break the dark theme.

## 11. Core principles

1. Preserve the established design tokens.
2. Do not invent new colors without an explicit design decision.
3. Do not change typography, spacing or radius values merely because a generated screen suggests another value.
4. Prefer hierarchy through spacing, scale, typography and surface levels rather than excessive borders.
5. Orange is an intentional accent, not a default text color.
6. Exercise names and important content must remain readable and must not clip.
7. Mobile-first layouts are the primary target.
8. Design must support the existing NEXTREP product and logic; it must not redesign the application architecture.

## 12. Relationship with Stitch and Claude

Stitch is used for visual exploration and screen/component design.

GitHub documentation is the source of truth for accepted design decisions.

Claude implements accepted designs in the existing NEXTREP application. Claude must not independently replace the established design system.

A Stitch exploration is not automatically an accepted design. It becomes authoritative only after review and documentation.

## 13. Screens

Current screen map:

### Primary
1. Dashboard — start
2. Ćwiczenia
3. Plany
4. Trening
5. Okno aktywnego treningu
6. Statystyki
7. Historia

### More
8. Pomiary
9. NEXTREP PRO
10. Pomiary

Note: the user supplied “Pomiary” twice. This duplicate is preserved for now and should be resolved before screen implementation.

## 14. Design status

Foundations:
- Colors: DONE
- Typography: DONE
- Spacing: DONE
- Radius: DONE
- Effects: DONE

Components:
- Buttons: preliminary baseline exists
- Cards: started
- Badges: TODO
- Inputs: TODO
- Tabs: TODO
- Navigation: TODO
- Stat / Metric: TODO
- Progress: TODO
- Exercise elements: TODO
- Training elements: TODO
- Premium elements: TODO

Screens:
- not yet designed in Stitch

Prototype:
- TODO

Implementation handoff:
- TODO

## 15. Active workout — approved UI direction (2026-10-10)

SUPERSEDED (header and menu) by "Active Workout / Cinematic / Master v1 — Approved" (2026-10-13), see section 19. The remaining bullets stay valid unless section 19 says otherwise.

- [superseded] Center workout timer in header; top-right overflow menu includes Add exercise / End workout / Abandon workout / Instructions.
- Current exercise name is prominent white text; no redundant orange exercise-name pill.
- Today's recommendations are descriptive and specific to the current exercise. They may suggest increasing load or repetitions but must NOT prescribe a mandatory numeric load.
- Previous workout performance is a separate section below recommendations, with a prominent “Zobacz poprzednie wykonanie treningu” action and access to full history.
- Sets allow manual weight, repetitions and RIR entry; RIR options: 0, 0–1, 1–2, 2 (dropdown, not slider). Bodyweight exercise omits kg; added-load variants display added load. Timed exercises provide start/stop and manual correction.
- Supersets use compact labels and independently maintained values for each exercise.
- Adding/canceling an exercise must return safely to the active workout without resetting or ending it.
- Mobile-first: readable text, accessible controls, no clipping or bottom-navigation overlap.

## 16. Workout photography — approved direction (2026-10-10)

- Create a curated catalog of approximately five cinematic, realistic images per muscle group: chest, back, shoulders, biceps, triceps, legs, glutes and abs (40 images total as an initial target).
- The image should match the active exercise's muscle group; chest exercises may use bench-press photography.
- Rotate/select imagery when transitioning to another exercise, not while entering sets; keep an exercise's image stable within a workout session.
- Dark high-contrast gym photography, restrained orange rim light, dark overlay ensuring white text legibility; no excessive gaming neon.
- Images are decorative and must never compromise form readability or performance.

## 17. Design workflow update (2026-10-10)

Claude Design is the selected visual exploration environment with UI/UX Pro Max skill if actually available. Approved screenshots and this file provide visual guidance. The existing PWA and its training/progression/data architecture must not be modified during visual exploration. Start with shared foundations, then Dashboard and Active Workout, and review each screen before accepting it. Existing app icon remains unchanged. Prior Google Stitch workflow notes are historical, not a mandate to use Stitch.

## 18. Brand Assets — approved (2026-10-11)

Official supplied transparent PNG assets:
- NEXTREP Symbol: standalone geometric N.
- NEXTREP Logotype: geometric N plus NEXTREP wordmark.

Both assets are immutable: preserve the supplied artwork, proportions, geometry, gradient, colors, alpha transparency and original file bytes. Do not redraw, regenerate or apply effects to the artwork itself.

Placement:
- Logotype: splash, onboarding, login, Dashboard header, NEXTREP PRO, About, exported reports.
- Symbol: compact top bar where appropriate, square slots, static loading state and report footers.
- Neither logo is required in the Active Workout header; the workout time takes priority (position superseded by section 19: small, top-left).
- Stacked logo variant is not approved pending separate review.
- Existing production PWA app icon remains unchanged; neither asset automatically replaces it.

Sizing and clear space:
- Clear-space unit X = one quarter of visible artwork height, measured from the actual artwork rather than the PNG canvas; account for uneven built-in transparent margins.
- Minimum displayed logotype image size: 90 × 36 px; below this, use the Symbol.
- Minimum displayed Symbol image size: 24 × 24 px; below this, use the existing app icon or a suitable standard UI icon.
- Preserve aspect ratio and adequate clear space. Verify legibility in the final context.

Background and glow:
- Preferred background #090909; other sufficiently dark approved surfaces may be used after contrast verification.
- Optional subtle orange ambient glow is a separate background layer behind the logo, never a filter or modification of the logo artwork. This clarifies §6.
- Contrast statement of 4.25:1 on #090909 was reported by Claude Design and has not been independently verified here; validate on final rendered screens.

Older opaque-on-black logos from the production app are reference-only within the design project. Any replacement of production brand assets is a separate implementation decision requiring explicit approval.

## 19. Active workout header — approved master (2026-10-13)

Status: see SCREENS.md (Active workout). Visual approval is not implementation.

- Header with workout photography and restrained orange light; workout time small in the top-left corner (secondary information, Inter tabular).
- ⋮ overflow menu top-right: Dodaj ćwiczenie, Zamień, Film, Zakończ, Przerwij. No back arrow and no visible "Zakończ" button.
- Below: plan name · "Ćwiczenie x z n", exercise name large (wraps, never clipped), segmented progress bar.
- Compact header when space is short (mockups: < 280 px working area): row 1 time · progress · ⋮; row 2 exercise name. At 100% and 120% text the photo header is always used.
- "Zalecenie na dziś" expanded by default for PRO, no status label; Free sees the locked card.
- Rest timer: colour as in the master, rest #5EC2FF (section 2) — decision 2026-10-24.
- Set comment: as in the master, an inline field inside the set card, opened from the comment icon — decision 2026-10-24.
- Deferred to implementation: compact-header threshold and hysteresis, iOS exit path without back gesture.

## 20. Bottom navigation B2 — approved (2026-10-14)

Status: see COMPONENTS.md, DS-C04. Visual approval is not implementation.

- 7 destinations from production, unchanged order and targets: Start · Ćwiczenia · Plany · Trening · Statystyki · Historia · Więcej (Lucide icons).
- Normal text: 7 icons + 7 labels in one row. Enlarged text: 7 icons in one row without visible labels; names in aria-label, aria-current and visible keyboard focus kept.
- Detailed values (row 62 px, icon 24 px, label 13/15, gradient #121213 → #0B0B0C → #090909, separator rgba(255,133,27,.45), active #FF851B, inactive #B8B8B8, indicator 28 × 2 px, safe area max(env(safe-area-inset-bottom), 8px), content padding = bar height + 16 px): project document claude/bottom-navigation-b2-master-v1.md.
- Not adopted: 2-row layout, "Active Label Only".
