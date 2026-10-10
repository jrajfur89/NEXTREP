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

### Text
- primary: #F5F5F5
- secondary: #B8B8B8
- muted: #777777
- disabled: #4A4A4A

### Status
- success: #42C98A
- warning: #E5A63A
- danger: #E84B4B

## 3. Typography

Display: Barlow Condensed, bold, uppercase, short athletic headings; H1 32–36 px, H2 24–28 px, H3 18–22 px; tight letter spacing (H1 0 to -0.5%, H2/H3 0).

UI/body: Inter, weights 400/500/600/700; Body Large 17 px, Body 15–16 px, Body Small 13–14 px, Caption 11–12 px. Use Inter for buttons, forms, data, dates, weights, repetitions and RIR. Timer uses tabular numerals.

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
- radius: 10 px
- height: 48–52 px
- Inter Semi Bold/Bold
- text: #090909

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

- Center workout timer in header; top-right overflow menu includes Add exercise / End workout / Abandon workout / Instructions.
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
