# NEXTREP — COMPONENTS

This document defines the component inventory. Detailed specifications are added as components are designed and accepted.

## Core components

### Buttons
- Primary
- Secondary
- Ghost
- Disabled

### Cards
- Default
- Active
- Training
- Exercise
- Premium

### Badges
- Orange
- Success
- Neutral

### Inputs
- Text
- Number
- Search
- Select / Dropdown
- Form field states

### Navigation
- Primary navigation
- More navigation
- Header
- Back navigation

### Tabs
- Default
- Active
- Disabled

### Data / progress
- Stat / Metric
- Progress
- Progress comparison
- Trend indicator

### Training
- Exercise row
- Set row
- RIR selector
- Rest timer
- Superset indicator
- Workout summary
- Recommendation block

### Premium
- PRO badge
- Premium card
- Upgrade CTA
- Locked feature state

## Component register — approved in UX masters (DS-C01–DS-C16)

Source of truth for component status. Status model: DESIGN_STATUS.md. Variants, anatomy and dependencies of each entry: Design System approval package v3 (NextRep project, claude/ux-design-system-approval-package-v3.md), section DS-05. Variants and sub-elements belong to their entry and are not separate components. Migration order: DS-C01–DS-C09, then DS-C10–DS-C16.

| ID | Component | Source master | UX/UI | Design System | Implementation | Verification |
|---|---|---|---|---|---|---|
| DS-C01 | Set card | Active Workout Master v1 | APPROVED (2026-10-13) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C02 | Set value format | Active Workout, Completion & Summary, Atlas Compact Tabs v3 | APPROVED (2026-10-13 / 2026-10-17 / 2026-10-20) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C03 | Dropset | Active Workout Master v1 | APPROVED (2026-10-13) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C04 | Bottom navigation B2 — v2 Compact | NAV-B2 v2 (ATLAS-UX-01 v2, boards B2-*); v1 Bottom Navigation B2 (icon-only mode is a variant) | v2 APPROVED (2026-10-25); v1 APPROVED (2026-10-14) | v2 DS READY (2026-10-25); v1 superseded (history) | v2 IMPLEMENTED (I5.5) | IN TESTING |
| DS-C05 | Locked feature state (PRO lock) | Active Workout, Completion & Summary, Atlas Compact Tabs v3 | APPROVED (2026-10-13 / 2026-10-17 / 2026-10-20) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C06 | Context top bar | Completion & Summary, Atlas Compact Tabs v3 | APPROVED (2026-10-17 / 2026-10-20) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C07 | Save and sync status line | Completion & Summary (D3) | APPROVED (2026-10-17); syncing / willRetry / conflicts wording not designed | PARTIAL (PENDING SYNC; missing states deferred to implementation) | NOT IMPLEMENTED | NOT TESTED |
| DS-C08 | Feedback message | Training Entry Flow | APPROVED (2026-10-14) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C09 | Confirmation bottom sheet | Completion & Summary, Training Entry Flow, Interrupted Workout | APPROVED (2026-10-13 / 2026-10-14 / 2026-10-17) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C10 | Primary CTA pill | Dashboard Returning User, New User, Interrupted Workout, Training Entry Flow | APPROVED (2026-10-11) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C11 | Metric tile with explanation sheet | Completion & Summary | APPROVED (2026-10-17) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C12 | Rest timer | Active Workout Master v1 | APPROVED (2026-10-13) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C13 | Superset label and capsules | Active Workout Master v1 | APPROVED (2026-10-13) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C14 | Sticky tabs | Atlas Compact Tabs v3 | APPROVED (2026-10-20) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C15 | Disclosure section | Atlas Compact Tabs v3 | APPROVED (2026-10-20) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C16 | History table with PRO line chart | Atlas Compact Tabs v3 | APPROVED (2026-10-20) | DS READY | NOT IMPLEMENTED | NOT TESTED |
| DS-C17 | Search field (P1) | ATLAS-UX-01 v2 (Main, E03, E05) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2 / I5.4) | IN TESTING |
| DS-C18 | Filter chip (P2) | ATLAS-UX-01 v2 (E04; D16) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2 / I5.4) | IN TESTING |
| DS-C19 | Active filter chip (P3) | ATLAS-UX-01 v2 (E03-Filtry, E07-FiltryZero) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2 / I5.4) | IN TESTING |
| DS-C20 | Category tile 3:2, future photo variant (P4) | ATLAS-UX-01 v2 (Main, E01-Kafel) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED without photos (I5.2 / I5.3) | IN TESTING |
| DS-C21 | Exercise row (P5) | ATLAS-UX-01 v2 (E03, E05) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2–I5.4) | IN TESTING |
| DS-C22 | Sub-region tile (P6) | ATLAS-UX-01 v2 (E02) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2 / I5.3) | IN TESTING |
| DS-C23 | Results bar (P7) | ATLAS-UX-01 v2 (E03, E05) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2–I5.4) | IN TESTING |
| DS-C24 | Empty state / message (P8, E07) | ATLAS-UX-01 v2 (E07) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2 / I5.4) | IN TESTING |
| DS-C25 | „Filtry” button (P9) | ATLAS-UX-01 v2 (Main, E03, E04; D15) | APPROVED (2026-10-25) | DS READY | IMPLEMENTED (I5.2 / I5.4) | IN TESTING |

"Implementation: NOT IMPLEMENTED" refers to the version specified in the master; similar elements in the current production app are not assessed here. "Verification: NOT TESTED" means no recorded component test; contrast measurements of master files are not a component test.

Design System status (G02-CLOSEOUT, 2026-10-24): registered in the active Design System (Claude Design). DS-C01 includes the set-comment pattern of the approved master (inline field in the card); DS-C12 uses the master's rest colour (DESIGN.md §2, rest #5EC2FF); DS-C07 stays PARTIAL with its syncing / willRetry / conflicts states deferred to the implementation stage. Implementation and verification are unchanged.

DS-SYNC ATLAS-UX-01 (approved by the owner 2026-10-25, Design System version 15 `1792958771-4f40` and its follow-up): DS-C04 v2 Compact and DS-C17–DS-C25 are DS READY; tokens surface-control, surface-raised (renamed from surface-control-hover, DS-D17) and text-chip are active (DESIGN.md §2); the photo variant of DS-C20 is approved, release 1.0 ships without photos (package: NextRep project, claude/ds-sync-atlas-ux-01-package.md). "IN TESTING": automated tests on release/1.0; device checks belong to V5.

Accessibility fix G02 (approved visually 2026-10-21) affects DS-C01 (empty RIR value #8E8E8E, default field outline #66666A), DS-C05 (PRO label #8E8E8E) and DS-C16 (secondary table and chart text #8E8E8E). The corrected masters are a separate working version (v2) pending final audit; they are not a new baseline and the UX approval dates above are unchanged.

## Component rules

Every accepted component should document:
- purpose
- anatomy
- dimensions
- spacing
- typography
- colors
- states
- interactions
- mobile behaviour
- usage restrictions
