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
| DS-C01 | Set card | Active Workout Master v1 | APPROVED (2026-10-13) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C02 | Set value format | Active Workout, Completion & Summary, Atlas Compact Tabs v3 | APPROVED (2026-10-13 / 2026-10-17 / 2026-10-20) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C03 | Dropset | Active Workout Master v1 | APPROVED (2026-10-13) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C04 | Bottom navigation B2 | Bottom Navigation B2 (icon-only mode is a variant) | APPROVED (2026-10-14) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C05 | Locked feature state (PRO lock) | Active Workout, Completion & Summary, Atlas Compact Tabs v3 | APPROVED (2026-10-13 / 2026-10-17 / 2026-10-20) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C06 | Context top bar | Completion & Summary, Atlas Compact Tabs v3 | APPROVED (2026-10-17 / 2026-10-20) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C07 | Save and sync status line | Completion & Summary (D3) | APPROVED (2026-10-17); syncing / willRetry / conflicts wording not designed | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C08 | Feedback message | Training Entry Flow | APPROVED (2026-10-14) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C09 | Confirmation bottom sheet | Completion & Summary, Training Entry Flow, Interrupted Workout | APPROVED (2026-10-13 / 2026-10-14 / 2026-10-17) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C10 | Primary CTA pill | Dashboard Returning User, New User, Interrupted Workout, Training Entry Flow | APPROVED (2026-10-11) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C11 | Metric tile with explanation sheet | Completion & Summary | APPROVED (2026-10-17) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C12 | Rest timer | Active Workout Master v1 | APPROVED (2026-10-13) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C13 | Superset label and capsules | Active Workout Master v1 | APPROVED (2026-10-13) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C14 | Sticky tabs | Atlas Compact Tabs v3 | APPROVED (2026-10-20) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C15 | Disclosure section | Atlas Compact Tabs v3 | APPROVED (2026-10-20) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |
| DS-C16 | History table with PRO line chart | Atlas Compact Tabs v3 | APPROVED (2026-10-20) | NOT REGISTERED | NOT IMPLEMENTED | NOT TESTED |

"Implementation: NOT IMPLEMENTED" refers to the version specified in the master; similar elements in the current production app are not assessed here. "Verification: NOT TESTED" means no recorded component test; contrast measurements of master files are not a component test.

Accessibility fix G02 (approved visually 2026-10-21) affects DS-C01 (empty RIR value #8E8E8E, default field outline #66666A), DS-C05 (PRO label #8E8E8E) and DS-C16 (secondary table and chart text #8E8E8E). The corrected masters are a new working version pending final audit; the statuses above are unchanged.

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
