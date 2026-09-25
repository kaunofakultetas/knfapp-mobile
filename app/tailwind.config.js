// -----------------------------------------------------------
//  [*] Tailwind — semantic token mapping
//
//  Color classes resolve to CSS variables (--canvas, --ink…)
//  supplied at runtime by the themeVars style on the root View
//  (see constants/theme.ts and app/_layout.tsx), so bg-surface
//  or text-ink flip automatically with the active scheme.
//
//  Screens use ONLY these semantic tokens: no raw hex, no
//  default tailwind grays, no dark: variants. The spacing,
//  radius and font scales below are the design system's units;
//  arbitrary values in classNames are a code smell.
// -----------------------------------------------------------

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './packages/chatuikit/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './context/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  // Theming runs on CSS variables (constants/theme.ts), never on
  // dark: variants; 'class' just keeps NativeWind's web runtime
  // from throwing when its own observer calls the scheme setter
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: {
          DEFAULT: 'var(--surface)',
          soft: 'var(--surface-soft)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          faint: 'var(--ink-faint)',
        },
        'on-brand': 'var(--on-brand)',
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          strong: 'var(--brand-strong)',
          soft: 'var(--brand-soft)',
          header: 'var(--brand-header)',
          text: 'var(--brand-text)',
        },
        accent: 'var(--accent)',
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
        },
        info: 'var(--info)',
        scrim: 'var(--scrim)',
        'chat-canvas': 'var(--chat-canvas)',
        'bubble-in': 'var(--bubble-in)',
        'bubble-out': 'var(--bubble-out)',
        'quote-wash': 'var(--quote-wash)',
        'menu-surface': 'var(--menu-surface)',
        'on-brand-wash': 'var(--on-brand-wash)',
      },
      // Where one hex cannot serve as both text and fill (see
      // constants/theme.ts), the TEXT and BACKGROUND utilities
      // part ways here, so no call site has to know:
      //   - text-brand is brand-AS-TEXT — the AA-checked
      //     brandText (the fill pink read 3.1–3.9:1 as text on
      //     every dark surface); bg-/border-brand keep the fill;
      //   - text-brand-fill is the fill hue AS text, for labels
      //     on a white bg-on-brand pill, where the lighter
      //     brandText would drop to 2.8:1 in dark mode;
      //   - bg-danger is dangerFill, the red a white label can
      //     sit on; text-/border-danger keep the text red.
      // Both light values are unchanged by the split.
      textColor: {
        brand: {
          DEFAULT: 'var(--brand-text)',
          fill: 'var(--brand)',
        },
      },
      backgroundColor: {
        danger: {
          DEFAULT: 'var(--danger-fill)',
        },
      },
      fontFamily: {
        raleway: ['Raleway-Regular'],
        'raleway-medium': ['Raleway-Medium'],
        'raleway-semibold': ['Raleway-SemiBold'],
        'raleway-bold': ['Raleway-Bold'],
        mono: ['SpaceMono'],
      },
      fontSize: {
        xs: '12px',
        sm: '14px',
        base: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
        '4xl': '32px',
        '5xl': '36px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
