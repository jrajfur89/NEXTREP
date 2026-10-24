# NEXTREP — SCREENS

## Screen map

### Primary navigation / main product areas

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

The duplicate “Pomiary” entry is intentionally preserved from the current user-provided list and must be clarified before implementation.

## Approved UX masters (status 2026-10-24)

Source of truth for screen status. Status model: DESIGN_STATUS.md. Bottom navigation B2 is a component: COMPONENTS.md, DS-C04.

| Screen / flow | Master | UX/UI | Implementation | Verification |
|---|---|---|---|---|
| Dashboard — returning user | Dashboard / Returning User / Master v1 | APPROVED (2026-10-11) | NOT IMPLEMENTED | NOT TESTED |
| Dashboard — new user | Dashboard / New User / Master v1 | APPROVED (2026-10-13) | NOT IMPLEMENTED | NOT TESTED |
| Dashboard — interrupted workout | Dashboard / Interrupted Workout / Master v1 | APPROVED (2026-10-13) | NOT IMPLEMENTED | NOT TESTED |
| Active workout | Active Workout / Cinematic / Master v1 | APPROVED (2026-10-13) | NOT IMPLEMENTED | NOT TESTED |
| Training entry flow | Training / Entry Flow / Master v1 | APPROVED (2026-10-14) | NOT IMPLEMENTED | NOT TESTED |
| Workout completion & summary | Workout / Completion & Summary / Cinematic / Master v1 | APPROVED (2026-10-17) | NOT IMPLEMENTED | NOT TESTED |
| Exercise details (atlas) | Atlas / Exercise Details / Compact Tabs v3 / Master v1 | APPROVED (2026-10-20) | NOT IMPLEMENTED | NOT TESTED |

Accessibility fix G02 (approved visually 2026-10-21) changes text and field-outline colours in the Active workout, Workout completion & summary and Exercise details (atlas) masters; the corrected version (working masters v2) is kept separately, is pending final audit and is not a new baseline; the approval dates above are unchanged.

Master documents and canvas references: claude/ux-master-registry.md (NextRep project). Implementation handoff of these seven masters was approved on 2026-10-24 (G02-CLOSEOUT, DESIGN_STATUS.md). Handoff does not mean the screen is implemented or tested.

## Screen design process

Each screen is designed in Claude Design using the accepted NEXTREP Design System (Stitch is historical, DESIGN.md §17).

For every accepted screen document:
- purpose
- primary user action
- information hierarchy
- component inventory
- states
- navigation
- empty/loading/error states where applicable
- responsive/mobile rules
- relationship to existing product functionality

## Recommended order

1. Dashboard
2. Ćwiczenia
3. Plany
4. Trening
5. Okno aktywnego treningu
6. Statystyki
7. Historia
8. Pomiary
9. NEXTREP PRO
10. remaining/clarified More item
