# NEXTREP — DESIGN SYSTEM

Status: BASELINE / IN PROGRESS  
Version: 1.0  
Purpose: visual source of truth for NEXTREP design work in Google Stitch and later implementation by Claude.

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
- primary: #FF6A13
- bright: #FF7A18
- deep: #D94B00

### Background
- base: #0B0B0C
- elevated: #0B0B0C

### Surface
- default: #151516
- secondary: #1B1C1E
- tertiary: #1B1C1E

### Border
- default: #28292D

### Text
- primary: #FFFFFF
- secondary: #A1A1A6
- muted: #686868

### Status
- success: #42C98A
- warning: #E5A63A
- danger: #E84B4B

## 3. Typography

Primary typeface: Inter.

- H1: Inter, 24 px, Bold / ExtraBold
- H2: Inter, 18 px, Semi Bold
- Body: Inter, 14 px, Regular
- Body Medium: Inter, 14 px, Medium
- Label: Inter, 11 px, Semi Bold, uppercase, letter spacing approximately +0.5 to +1 px
- Timer: Inter, 40 px, Bold, stable/tabular figures

No secondary display font is part of the baseline system.

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
- color: #FF6A13
- blur: approximately 30 px
- opacity: approximately 25%
- X: 0
- Y: 0

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

Component details are developed iteratively in Stitch and documented here before implementation.

## 8. Buttons

### Primary
- orange gradient: #FF7A18 → #E04000
- radius: 12 px
- height: approximately 48 px
- Inter Semi Bold 14 px
- white text in the current baseline

### Secondary
- transparent or #18181A
- 1 px border using #28292D or orange where appropriate

### Ghost
- no visible background
- text-focused

### Disabled
- subdued surface
- muted text
- no strong orange emphasis

## 9. Cards

- radius: 16 px
- surface: #151516 or #1B1C1E according to hierarchy
- border: #28292D
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
