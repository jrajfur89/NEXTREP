# NEXTREP — DESIGN STATUS

> **Update 2026-10-12 (K01-2):** design tool is Claude Design only; Stitch items below are historical.
> Approved since 2026-10-03: `DESIGN.md` §15 active workout, §16 photography (2026-10-10), §18 brand assets
> (2026-10-11). Next: DS1 — screens of the existing app in Claude Design (MASTER PLAN v3, section K).

Last updated: 2026-10-20 (proposal)

## Current phase

**PHASE 2 — Screen masters in Claude Design; Design System synchronization with approved masters**

## Status model

Four independent dimensions:

| Dimension | Values |
|---|---|
| UX/UI | DRAFT · IN REVIEW · APPROVED |
| Design System | NOT REGISTERED · PENDING SYNC · DS READY |
| Implementation | NOT IMPLEMENTED · IN PROGRESS · IMPLEMENTED |
| Verification | NOT TESTED · IN TESTING · VERIFIED |

Rules:
- UX APPROVED does not mean IMPLEMENTED.
- DS READY does not mean the component is implemented in the app.
- VERIFIED requires a named test and a reference to its evidence.
- Without evidence a dimension is UNKNOWN and the missing evidence is named.
- Historical approval decisions and dates are not changed.

Single sources of truth: components → COMPONENTS.md (register DS-C01–DS-C16); screens → SCREENS.md; tokens → DESIGN.md §2. This file only summarises and links.

## Overview (2026-10-20)

| Area | UX/UI | Design System | Implementation | Verification | Source |
|---|---|---|---|---|---|
| Screen masters (7) | APPROVED | — | NOT IMPLEMENTED | NOT TESTED | SCREENS.md |
| Components (16) | APPROVED | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED | COMPONENTS.md |
| Colour and typography updates | — | NOT REGISTERED (proposal pending owner approval) | UNKNOWN (not assessed) | NOT TESTED | DESIGN.md §2–§3, approval package v3 |
| Accessibility fixes G02 (DS-04a, K10, K11) | APPROVED (2026-10-21, visual) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED (contrast measured on master files only) | approval package v3 §6.4 |

## Phase 1 baseline (2026-10-03, historical)

**PHASE 1 — Design System foundations + Stitch setup**

Goal:
Create one coherent NEXTREP visual system in Stitch before designing the complete screen set.

## Status

| Area | Status |
|---|---|
| Colors | DONE |
| Typography | DONE |
| Spacing | DONE |
| Radius | DONE |
| Effects | DONE |
| Buttons | BASELINE |
| Cards | IN PROGRESS |
| Badges | TODO |
| Inputs | TODO |
| Tabs | TODO |
| Navigation | TODO |
| Stat / Metric | TODO |
| Progress | TODO |
| Exercise elements | TODO |
| Training elements | TODO |
| Premium elements | TODO |
| Stitch project | TODO |
| Reference screen | TODO |
| Full screen set | TODO |
| Prototype | TODO |
| Claude implementation handoff | TODO |

## Workflow

1. Establish design system baseline.
2. Create Stitch project.
3. Build one reference screen.
4. Validate visual language.
5. Define reusable components.
6. Design remaining screens.
7. Record accepted decisions in GitHub.
8. Hand off accepted design to Claude.
9. Implement without changing product architecture or business logic.

## Ownership

- User: final product/design decisions.
- ChatGPT: design architecture, consistency, specifications, review and documentation.
- Stitch: visual design and iteration.
- Claude: implementation in the existing application.
- GitHub: technical source of truth.

## Important rule

Generated Stitch output is exploratory until explicitly accepted and documented.
