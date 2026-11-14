/**
 * Home Connect mobile design tokens (Phase C, 2026-11-14).
 *
 * World: white working surfaces, light-blue filled fields, the logo blue as
 * the one accent, green only for money in or done. Style reference: Noble
 * POS-ERP mobile screens (see PRODUCT.md). Light theme only for now.
 *
 * Contrast (WCAG 2.x, measured on these exact pairs):
 * - text 16.3, muted 7.2, placeholder 5.3 on field, brand 4.6 on field,
 *   white on brand 5.1, white on success 4.7, successStrong 5.1 on successSoft.
 * - `subtle` (4.6 on white) is for captions on white only: 4.1 on field fails.
 * - Text on any tinted background uses the *Strong colours, never brand or success.
 *
 * Old keys (background, surface, muted, small, title, ...) stay so existing
 * screens keep compiling while Phase D moves them to the role tokens.
 */
const palette = {
  blue600: '#1A6FC9',
  blue700: '#155AA3',
  blue50: '#EEF5FD',
  blue100: '#EEF4FC',
  blue200: '#C9DCF3',
  blue300: '#B5D4F6',
  green600: '#078558',
  green700: '#06764F',
  green50: '#E8F7F1',
  green200: '#9FDFC7',
  red600: '#B81B38',
  red50: '#FDEEF1',
  red200: '#F4B3BF',
  amber700: '#A65A14',
  amber50: '#FEF4EA',
  amber200: '#FBCE9F',
  ink900: '#1B2124',
  ink600: '#4D595E',
  ink550: '#5B676C',
  ink500: '#6A787E',
  ink200: '#D6DFE3',
  ink100: '#EAF0F2',
  ink50: '#F5F9FE',
  white: '#FFFFFF',
} as const;

export const theme = {
  colors: {
    // Accent (the logo blue). One filled primary action per screen.
    brand: palette.blue600,
    brandStrong: palette.blue700,
    brandSoft: palette.blue50,
    brandBorder: palette.blue300,
    onBrand: palette.white,
    // Status. Fills use the base colour; text on a tint uses *Strong.
    success: palette.green600,
    successStrong: palette.green700,
    successSoft: palette.green50,
    successBorder: palette.green200,
    danger: palette.red600,
    dangerSoft: palette.red50,
    dangerBorder: palette.red200,
    warning: palette.amber700,
    warningSoft: palette.amber50,
    warningBorder: palette.amber200,
    // Surfaces.
    background: palette.white,
    surface: palette.white,
    /** Zebra rows, quiet section grounds. */
    surfaceMuted: palette.ink50,
    /** Filled inputs and segmented tracks. */
    field: palette.blue100,
    fieldBorder: palette.blue200,
    neutralSoft: palette.ink100,
    border: palette.ink200,
    overlay: '#1B212480',
    // Text.
    text: palette.ink900,
    muted: palette.ink600,
    placeholder: palette.ink550,
    /** Captions on white only. */
    subtle: palette.ink500,
    white: palette.white,
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },
  /** Legacy sizes; new code uses `text` roles below. */
  type: { caption: 12, small: 14, body: 16, title: 22, heading: 28 },
  /** Material-style type roles on the system face (Roboto). Sizes are sp. */
  text: {
    display: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
    headline: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
    title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
    titleSmall: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
    body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
    bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  },
  /** Offset + soft blur, blue-tinted. Android reads `elevation`. */
  elevation: {
    card: {
      shadowColor: '#0F3A6B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    raised: {
      shadowColor: '#0F3A6B',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 8,
    },
  },
  motion: { fast: 120, base: 200, slow: 300 },
  /** 48 dp minimum touch target. */
  touch: 48,
} as const;

export type Theme = typeof theme;
