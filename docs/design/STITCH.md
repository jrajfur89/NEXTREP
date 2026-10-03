# NEXTREP — STITCH WORKFLOW

## Purpose

Google Stitch is the primary visual design environment for NEXTREP.

The goal is not to recreate the application architecture in Stitch. The goal is to create a coherent visual system and screen designs that can later be implemented in the existing NEXTREP application.

## Baseline

Stitch must follow the values documented in DESIGN.md.

Primary font: Inter.

Do not introduce a new font, palette, spacing scale or radius system unless the change is explicitly reviewed and recorded in DESIGN.md.

## Workflow

1. Create a new Stitch project for NEXTREP.
2. Provide the baseline design-system prompt.
3. Start with one reference screen.
4. Review the visual language before generating the complete screen set.
5. Extract reusable components and patterns.
6. Design the remaining screens.
7. Record accepted changes in GitHub.
8. Prepare implementation guidance for Claude.

## First reference screen

Recommended first screen:
**Dashboard**

Reason:
It can establish the overall visual language, navigation, card hierarchy, typography, CTA treatment, progress visualization and use of photography.

## Acceptance rule

A Stitch screen is not automatically the source of truth.

A screen becomes accepted when:
- it follows the documented design tokens,
- its hierarchy is intentional,
- it fits the existing NEXTREP product,
- reusable patterns have been identified,
- the user accepts the visual direction,
- the accepted decisions are recorded in GitHub.

## Separation of responsibilities

Stitch:
- visual exploration
- layouts
- components
- visual iteration

ChatGPT:
- system architecture
- design consistency
- specification
- review
- documentation

Claude:
- implementation
- integration with existing application
- preserving existing functionality

GitHub:
- accepted design documentation
