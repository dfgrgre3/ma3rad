/**
 * Tailwind colors are semantic aliases of the CSS tokens declared in
 * src/styles/design-tokens.css. Change a color there (light + .dark), never here.
 * Usage: bg-primary, text-muted, border-line, bg-danger-soft, ...
 *
 * Note: token values are hex, so opacity modifiers such as bg-primary/50
 * are not supported. Use a token variant (e.g. bg-surface-muted) instead.
 */
// rgb triplets (--cerami-<name>-rgb) make opacity modifiers work: bg-primary/50.
const token = (name) => `rgb(var(--cerami-${name}-rgb) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          pressed: token('primary-pressed'),
          text: token('primary-text'),
          readable: token('primary-readable'),
        },
        surface: {
          DEFAULT: token('surface'),
          muted: token('surface-muted'),
          sunken: token('surface-sunken'),
          text: token('surface-text'),
        },
        canvas: token('canvas'),
        line: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        ink: {
          DEFAULT: token('text'),
          secondary: token('text-secondary'),
        },
        muted: token('muted'),
        accent: {
          soft: token('accent-soft'),
          border: token('accent-border'),
          text: token('accent-soft-text'),
        },
        success: {
          DEFAULT: token('success'),
          soft: token('success-soft'),
          border: token('success-border'),
        },
        danger: {
          DEFAULT: token('danger'),
          soft: token('danger-soft'),
          border: token('danger-border'),
        },
        warning: {
          DEFAULT: token('warning'),
          soft: token('warning-soft'),
          border: token('warning-border'),
        },
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
