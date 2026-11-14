# Design

Home Connect Mobile design system. Revised 2026-11-14: the phone now uses the **PC's theme** and **shadcn** components.

## World

The phone matches the PC ERP: Plus Jakarta Sans (with Noto Sans Arabic loaded), the PC's cool blue-grey neutrals and logo blue, and the PC's **glass shell**: a grey gradient backdrop with light beams and a soft blue glow, a frosted-glass header and tab bar, and solid white panels for content. Green means money in or done, amber needs attention, red means overdue or destructive. There is no explanation text on screens: labels, icons and data do the work.

## One source of colour

`frontend/src/styles/index.css` (the PC `@theme` block) is the only place colours are defined. `node scripts/sync-design-tokens.mjs` copies it into `shared/design-tokens.json`, and `Mobile Scanner/tailwind.config.js` reads that file. It holds every scale (slate, brand, emerald, amber, orange, red, sky) and the shadcn roles (`background`, `foreground`, `primary`, `card`, `popover`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`). Run `--check` to verify the two match.

## Stack

- **NativeWind 4 + Tailwind 3**: `className` on React Native components (`babel.config.js`, `metro.config.js`, `global.css`).
- **shadcn for React Native** (react-native-reusables shape) in `src/components/ui`: `Text` (with `TextClassContext`), `Button` (default, success, destructive, outline, secondary, ghost, link; sizes sm, default, lg, icon), `Card` family, `Input` (label, required, icon, password eye, error), `Badge`, `Select`, `DropdownMenu`, `ToggleGroup`, `Separator`, `Skeleton`, `ProductImage`, and `GlassBackdrop` / `GlassPanel`.
- Select and DropdownMenu run on `@rn-primitives`. Their visible parts are our own views passed with `asChild`, so styling never depends on a library forwarding `className`.
- Icons: `lucide-react-native` (the same set the PC uses). Older screens still use Ionicons until they are moved over.
- Weights come from font families (`font-sans-semibold`, `font-sans-bold`, ...), because Android doesn't synthesise weights for custom fonts.

## Shell

- **Header** (frosted glass): logo mark, a **branch dropdown** that switches straight away, the **To do bell** (bills to link, overdue customers, unsent photos), and an **account menu** (initials) with Reports, Settings, Connection and **Sign out**. There's no wordmark next to the branch: "HOME CONNECT" used to wrap vertically on long branch names.
- **Tab bar** (frosted glass): Home · Customers · Scan (centre) · Stock · Suppliers. Labels shrink to fit and are never cut.
- **Connect / Sign in / Branch**: the logo on the backdrop and one white card, with no subtitles. The buttons say **Scan QR** and **Enter address**, with IP and port side by side and an optional second IP. The branch is a dropdown with Continue, and Sign out sits in the corner.
- Screens are transparent so the backdrop shows. Content sits in white cards. On wide screens, reading and list screens cap at 760 dp and centre.

## Reports

`shared/report-columns.ts` holds the PC's columns and headline figures for every report as data, and `cellFor()` formats each cell (money, dates, humanised statuses, tones always paired with words). A frontend test keeps it equal to the PC (`report-columns-parity.test.ts`). The phone shows the period pills (or a month dropdown), the headline figures (the first money figure as the blue hero), then a **table that scrolls sideways**, 50 rows at a time. **PDF** export (A4 landscape) prints the same title, branch, period, figures and table, and opens the share sheet.

## Rules

- Show useful data, never a dump of raw fields: reuse the PC's column and summary choices.
- One filled primary button per screen.
- Colour never carries meaning alone.
- No tutorial text, eyebrows or explanations on screens.
- Forms use `FormScreen` (keyboard-safe). Nothing sits under the keyboard.
- New native modules mean a new APK. Over-the-air updates only reach the APK version (`runtimeVersion` = app version).
