# HomeConnect UI Guidelines

One page. Read it before adding UI.

The full rationale lives in `claude/plans/ui-component-style-direction-plan.md`.

---

## The rule

**If a screen is declaring its own button, card, badge, or input classes, it should be using a primitive instead.**

That is the whole consistency mechanism. Everything below is detail.

---

## Tokens

Defined in `frontend/src/styles/index.css` under `@theme`.

| Role | Token | Notes |
|---|---|---|
| Neutral | `slate-*` | Tailwind built-in. **Do not use `gray-*`** — it is visibly different and both on screen at once looks like a bug. |
| Accent | `brand-*` (`50`–`900`) | Emerald. Primary buttons, active nav, links, focus rings. |
| Status | `success` `warning` `danger` `info` | Reserved for **state**. Never decoration, never a chart series. |
| Chart series | `--viz-*` in `.viz-root` | Validated categorical palette. Separate from status so a series never impersonates a state. |

**Tailwind v4 does not read `tailwind.config.js`.** That file was deleted because it was dead — a token added there silently resolves to nothing, which is exactly the bug that left `bg-primary-50` rendering unstyled for two files. All tokens go in the `@theme` block.

**The app is light-only.** Fixed shop-floor desktops gain nothing from a dark theme, and every token, chart colour, and print rule would need a second validated variant. Do not add `prefers-color-scheme` blocks.

### Scale

- Spacing: Tailwind's 4px scale. Section gap `gap-6`, card padding `p-6` (dense `p-4`), form gap `gap-4`.
- Radius: `rounded-lg` (controls, badges), `rounded-xl` (cards), `rounded-2xl` (modals), `rounded-full` (avatars, icon buttons). **Four values, no more.**
- Elevation: `shadow-sm` at rest, `shadow-md` on interactive hover, `shadow-xl` for modals. Nothing heavier.

---

## Primitives

`import { Button, Card, Badge } from '@/components/ui'` — or the relative path `../../components/ui`.

| Primitive | Use for |
|---|---|
| `Button` / `IconButton` | All actions. Variants: `primary` `secondary` `ghost` `danger` `link`. Sizes `sm` `md` `lg`. |
| `buttonClasses()` | Giving a router `Link` or `<a>` the button look. |
| `Card` / `CardHeader` | Every panel. Variants: `default` `interactive` `flush` (flush = no padding, for tables). |
| `Badge` | Status and counts. Tones: `neutral` `brand` `success` `warning` `danger` `info`. |
| `Skeleton` / `SkeletonText` / `SkeletonTable` | Loading states. |
| `PageHeader` | Page title block. One per page. |
| `SectionHeader` | Section title within a page. `divided` adds the top rule. |
| `FormField` | Label + control + hint + error, wired for accessibility. |
| `Input` / `Textarea` / `Select` | Form controls. |
| `Modal` | Dialogs. |
| `EmptyState` | Empty results. |
| `BilingualLabel` | English + Arabic label pairs. |
| `Table` / `Pagination` | Data tables. |

### Buttons

- **One `primary` per screen.** More than one and neither reads as primary.
- `IconButton` **requires** a `label` — an icon with no accessible name is unusable with a screen reader, and unlabeled icons are the classic ERP usability failure.
- `isLoading` disables the button and shows a spinner. Use it; do not hand-roll.

### Forms

- Label above the control, always. **No placeholder-as-label** — the label vanishes the moment the user types, which is when they need it.
- Use `FormField`; it wires `htmlFor`, `aria-describedby`, `aria-invalid`, and `aria-required` for you.
- Errors get an icon **and** text. Never colour alone.
- Money and quantity inputs: `<Input numeric />` (right-aligned, tabular figures).
- Free-text the user types: `<Input userText />`. **Not** for money, dates, SKUs, or barcodes — bidi reordering can move a minus sign or split a code.

### Status

Every badge carries an **icon and text**. Colour is never the only cue.

Map a domain status to a tone through **one shared map per domain**, so a status wears the same colour in every module.

---

## States

Every data-bound view implements four:

1. **Loading** — `Skeleton`, shaped like the real content. Spinners only inside buttons. A skeleton with different dimensions than the real thing just relocates the layout shift.
2. **Empty** — `EmptyState`, with a next action where one exists.
3. **Error** — contained in the section that failed, with a retry. One failed panel never blanks a page.
4. **Populated.**

---

## Motion

`framer-motion` is available. The boundary:

**Allowed:** dialog enter/exit, sidebar collapse, toasts, skeleton pulse, hover transitions on shadow/border/background (≤200ms).

**Not allowed:** entrance animations on lists, tables, or cards; staggered reveals; animated backgrounds; parallax; scroll-triggered animation; number count-ups; anything over 300ms.

**Rule of thumb:** motion may explain a state change. It may not decorate something that is simply present. Staff use this app all day — a 400ms fade is 400ms of waiting, every time, forever.

---

## Bilingual labels

The app is **LTR**. Arabic is label text, not a layout direction. Do not convert to RTL.

- `<BilingualLabel label={{ en: 'Customers', ar: 'الزبائن' }} />`
- `dir="rtl"` goes on the **Arabic span only**. On a container it flips the line, and `Model: SJ-PV69G` can render as `SJ-PV69G :Model`.
- **Bilingual:** nav, page titles, section headers, KPI titles, quick actions, primary buttons, status labels.
- **English only:** table headers, chart axis ticks, tooltips, validation messages, technical strings, and **printed labels** (hard rule).
- User-entered text: `.user-text` / `dir="auto"`. **Never** on numbers, money, dates, SKUs, or barcodes.

---

## Never copy from UI sites

Raw CSS blocks with generated class names · hardcoded hex · arbitrary values (`w-[347px]`) · animated backgrounds, particles, spotlights · components with their own state or data fetching · anything from a paid tier (Tailwind UI, Flowbite Blocks/Pro, TailAdmin Pro) · heavy `backdrop-blur` on large surfaces · a second icon library.

**Icons are `lucide-react`.** One library, one outline weight. No inline SVG paths.

**Charts are `recharts`**, wrapped in `ChartFrame`. No dual-axis charts, ever — two measures of different scale become two charts or an indexed common base.

Uiverse / Aceternity / Magic UI / ReactBits are **inspiration only**. Look, understand, rebuild in Tailwind with these tokens. Their licences are per-component and their genre is marketing pages, not systems people use all day.

---

## Print

`@media print` already hides `aside`, `header`, and `.no-print`.

Printed output is **English-only**, pure black on white, no shadows, no rounded corners, no background colours. Product labels are 50mm × 30mm; reports need their own A4 rule — do not let the label `@page` size leak into report printing.
