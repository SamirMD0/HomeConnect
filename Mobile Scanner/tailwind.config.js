/**
 * Tailwind (NativeWind) theme for the phone app. Every colour comes from the
 * PC theme through shared/design-tokens.json (run scripts/sync-design-tokens.mjs
 * after changing frontend/src/styles/index.css), so the phone and the PC use
 * one palette and the same shadcn role names (primary, card, muted, ...).
 */
const tokens = require('../shared/design-tokens.json');

const c = tokens.colors;
const scales = Object.fromEntries(
  Object.entries(c).filter(([, value]) => typeof value === 'object')
);
const role = (name) => c[name];

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...scales,
        background: role('background'),
        foreground: role('foreground'),
        border: role('border'),
        input: role('input'),
        ring: role('ring'),
        primary: { DEFAULT: role('primary'), foreground: role('primary-foreground') },
        card: { DEFAULT: role('card'), foreground: role('card-foreground') },
        popover: { DEFAULT: role('popover'), foreground: role('popover-foreground') },
        muted: { DEFAULT: role('muted'), foreground: role('muted-foreground') },
        accent: { DEFAULT: role('accent'), foreground: role('accent-foreground') },
        destructive: { DEFAULT: role('destructive'), foreground: '#ffffff' },
        secondary: { DEFAULT: c.slate['100'], foreground: c.slate['900'] },
        success: role('success'),
        warning: role('warning'),
        danger: role('danger'),
        info: role('info'),
      },
      // Same family as the PC; the regular face for body, bold faces by weight.
      // Named sans-<weight> so they never clash with Tailwind's font-bold weights.
      fontFamily: {
        sans: ['PlusJakartaSans_400Regular'],
        'sans-medium': ['PlusJakartaSans_500Medium'],
        'sans-semibold': ['PlusJakartaSans_600SemiBold'],
        'sans-bold': ['PlusJakartaSans_700Bold'],
        'sans-extrabold': ['PlusJakartaSans_800ExtraBold'],
      },
      borderRadius: { lg: 10, xl: 14, '2xl': 20 },
    },
  },
  plugins: [],
};
