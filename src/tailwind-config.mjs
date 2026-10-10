// NEXTREP design tokens for Tailwind 3 — moved verbatim (F1.3) from the inline
// `tailwind.config = {...}` script that used to sit in index.html for the Tailwind CDN.
// tools/build-web.mjs passes it to the Tailwind CLI; tools/f1-baseline.json pins its value.
/*
 NEXTREP DESIGN SYSTEM — shared color tokens (Krok: wdrożenie Design Systemu NEXTREP).
     This remaps the existing Tailwind "neutral" / "orange" / "red" / "rose" / "green" / "amber"
     scales — already the dominant palette used across every screen in the app (~900 class
     usages) — onto the exact NEXTREP spec hex values. Because it's a config-level remap, every
     existing className in the app (bg-neutral-950, text-orange-500, border-neutral-800, etc.)
     picks up the new brand colors automatically, with zero changes to markup, state, or logic.
     This is the "wspólny system kolorów" the brief asks to build first, applied everywhere at once.
*/
export default {
    theme: {
      extend: {
        colors: {
          neutral: {
            50:  '#FFFFFF',
            100: '#F5F5F2', // Primary text
            200: '#ECEDEB',
            300: '#DEDFDD',
            400: '#C7C9C8',
            500: '#A7AAAD', // Secondary text
            600: '#6F7478', // Muted
            700: '#202428', // Surface 3 / input
            800: '#2C3034', // Border
            900: '#111315', // Surface / card
            950: '#08090A', // Background
          },
          orange: {
            300: '#FFB347', // Orange Highlight
            400: '#FF8A1F', // Orange Light
            500: '#FF6A00', // NEXTREP Orange
            600: '#E05F00', // pressed / active state
          },
          red: {
            400: '#FF7A7A',
            500: '#FF4D4D', // Danger
          },
          rose: {
            400: '#FF7A7A',
            500: '#FF4D4D', // Danger (shared with red — one consistent danger color)
          },
          green: {
            400: '#39D98A', // Success / progres
          },
          amber: {
            400: '#FFB347',
            500: '#FFB347', // Warning
          },
        },
        fontFamily: {
          display: ['"Barlow Condensed"', '"Bebas Neue"', 'Inter', 'sans-serif'],
        },
        boxShadow: {
          'brand-glow': '0 0 24px rgba(255,106,0,0.25)',
        },
      },
    },
  };
