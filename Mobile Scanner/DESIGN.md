# Design

Home Connect Mobile design system. Recorded 2026-11-14 at Phase C. Phase D restyles screens with it.

## World

White working surfaces, light-blue filled fields, and the Home Connect logo blue as the only accent. Green appears only for money in or done; red for overdue, errors and destructive actions. Dense numbers, big targets. The style reference is the Noble POS-ERP mobile design, used as a reference and not copied (see PRODUCT.md). Light theme only. System font (Roboto), so Arabic renders natively.

## Tokens (`src/theme/index.ts`)

| Role | Token | Value | Use |
|---|---|---|---|
| Accent | `brand` / `brandStrong` / `brandSoft` | #1A6FC9 / #155AA3 / #EEF5FD | One filled primary action; titles in stack headers; text on tints uses `brandStrong` |
| Money in, done | `success` / `successStrong` / `successSoft` | #078558 / #06764F / #E8F7F1 | Fills (Save & print), positive trends; text on tint uses `successStrong` |
| Overdue, destructive | `danger` / `dangerSoft` | #B81B38 / #FDEEF1 | Overdue rows, errors, delete, the bell dot |
| Caution | `warning` / `warningSoft` | #A65A14 / #FEF4EA | Late standings, unsent photos |
| Ground | `background`, `surface` | #FFFFFF | Screens and cards |
| Quiet ground | `surfaceMuted` | #F5F9FE | Zebra rows, stat rows |
| Field | `field` / `fieldBorder` | #EEF4FC / #C9DCF3 | Inputs, segmented track |
| Text | `text` / `muted` / `placeholder` / `subtle` | #1B2124 / #4D595E / #5B676C / #6A787E | `subtle` is for captions on white only |

Type roles (`theme.text`, sp): display 32/800, headline 26/800, title 20/700, titleSmall 17/700, body 16/400, bodyStrong 16/600, label 14/600, caption 12/500. Money always uses `fontVariant: ['tabular-nums']`.

Spacing 4/8/12/16/24/32. Radius: fields and buttons 8; tiles and rows 12; cards 16; sheets 20; pills full. Elevation: `card` (offset 0,2, blur 8) and `raised` (bars and sheets, offset 0,-2, blur 12), both blue-tinted. Touch targets are at least 48 dp.

Measured contrast: placeholder 5.3 on field, brand 4.6 on field, white on brand 5.1, white on success 4.7, successStrong 5.1 on successSoft. These fail and are therefore not allowed: subtle on field (4.1), success text on its tint (4.2), brand text on neutralSoft (4.4).

## Components (`src/ui`, import from `src/ui`)

- **ScreenHeader**: back chevron, centred blue title, optional right slot. Used by every stack screen through `TabStack`.
- **PageTitle**: large left-aligned title with a grey subtitle, for forms and landing screens.
- **TextField** (and the legacy `AppInput`): label above, red asterisk when required, filled light-blue box that turns white with a blue border on focus, leading icon, show/hide eye for passwords, error replaces the hint.
- **AppButton**: `primary` (one per screen), `success`, `danger` (soft by default, `solid` in action bars), `tonal`, `secondary` (outlined), `ghost`; `iconOnly` gives a 52 dp square button.
- **HeroCard**: blue card holding the one number a screen is about, with a white trend pill. One per screen.
- **StatRow**: tinted icon tile, title and detail, amount on the right, optional trend chip.
- **QuickGrid / IconTile**: a four-column grid of tinted tiles with short labels and an optional red count.
- **Segmented**: 2–4 pills on a light-blue track (Today · Yesterday · Week).
- **DataTable**: zebra rows, right-aligned tabular money columns, red ground for alert rows, scrolls sideways.
- **Badge / TrendChip**: tone pills, always with words.
- **FormScreen + ActionBar**: the keyboard-safe scroll (`react-native-keyboard-controller`) with a sticky bottom bar that rides above the keyboard (red reset · wide green Save & print · blue save).
- **ActionBell**: a header bell with a red dot. Its To do sheet lists bills to link, overdue customers and bill photos not sent.
- **Sheet**: bottom sheet with a drag handle, title, close button, 20 dp corners.
- **Tab bar**: Material 3 navigation bar with a soft pill behind the filled active icon, and the round Scan button in the centre.

`More → Design preview` (admins only) shows every component with sample figures, for checking a new APK.

## Rules

- One filled primary per screen. Peers use tonal or outlined buttons.
- Colour never carries meaning alone: badges have words, trends have arrows.
- No eyebrow labels above headings, no tutorial text. Labels and icons do the work.
- Forms use FormScreen; nothing may sit under the keyboard.
- Native modules (keyboard controller, reanimated) ship in APK 2.1.0. An over-the-air update can only reach 2.1.0 phones.
