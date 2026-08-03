# UI Component & Style Direction — Planning Document

**Status:** Plan only. No code written, no packages installed, no files modified.
**Scope:** Frontend UI direction, design system, and component sourcing policy.
**Date:** 2026-08-01

---

## 1. UI direction verdict

**Verdict: do not adopt shadcn/ui — or any other library — as a wholesale base. HomeConnect already has a coherent visual language. What it lacks is primitives, behavior, and token discipline.**

The inspection found a consistent, professional aesthetic already in place: **slate neutrals + emerald accent**, `rounded-xl`, `shadow-sm`, `border-slate-200`, white surfaces on a `slate-50` page. That language appears across 144 files (slate) and 86 files (emerald). It is not an accident and it does not need replacing — replacing it would be a large, risky, zero-business-value change.

The real gaps are narrower and more fixable:

1. **There is almost no shared component layer.** Five primitives exist (`Table`, `Modal`, `EmptyState`, `Pagination`, `BalanceBadge`). There is **no `Button`, no `Card`, no `Badge`, no `Input`, no `Select`, no `PageHeader`**. Every page re-declares those styles inline, which is why drift happens.
2. **`Modal` looks right but behaves incompletely** — no focus trap, no focus restore, no `role="dialog"`, no `aria-modal`, no `aria-labelledby`.
3. **The theme tokens are not wired up** (see §2.2 — this is a live bug).

So the recommendation is:

> **Keep the existing visual language. Adopt shadcn's *method* rather than its *components*. Add Radix primitives surgically, only where behavior and accessibility are genuinely hard.**

This is a consolidation plan, not a redesign.

---

## 2. Current UI assessment

### 2.1 What is already installed

| Package | Version | Status |
|---|---|---|
| `react` / `react-dom` | 19.2 | Current |
| `tailwindcss` + `@tailwindcss/postcss` | 4.3.3 | **v4** — CSS-first config |
| `lucide-react` | 1.26 | Already the de facto icon set |
| `recharts` | 3.10 | Installed, **not yet used** |
| `framer-motion` | 12.42 | Used in `DashboardLayout` + `Modal` |
| `clsx` + `tailwind-merge` | 2.1 / 3.6 | **Both installed** — the `cn()` prerequisites are already there |
| `react-hook-form` + `@hookform/resolvers` + `zod` | — | Form stack settled |
| `@tanstack/react-query` | 5.101 | Data layer settled |
| `react-hot-toast` | 2.6 | Notifications settled |
| `jsbarcode`, `jspdf`, `xlsx` | — | Print/export |

**Not installed and not needed as a base:** shadcn/ui, Radix, Headless UI, Flowbite, Material, Ant, Chakra, DaisyUI.

The important observation: `clsx` and `tailwind-merge` are already dependencies. That combination has exactly one common purpose — the `cn()` class-merging helper that shadcn-style component authoring depends on. **The project is already set up for this approach and hasn't taken the last step.**

### 2.2 Live finding — the Tailwind theme is not wired up

`frontend/tailwind.config.js` exists, but:

- `frontend/src/styles/index.css` starts with `@import "tailwindcss"` — **Tailwind v4 syntax**.
- Tailwind v4 does **not** auto-load `tailwind.config.js`. It requires an explicit `@config` directive.
- There is **no `@config`, no `@theme`, and no `@plugin`** anywhere in `index.css`.
- The config's `theme.extend` is `{}` anyway.

Consequence: `tailwind.config.js` is **dead configuration**, and any custom color name silently resolves to nothing. This is not theoretical — it is already broken in two files:

```
frontend/src/features/dashboard/components/StatCard.tsx:23
  primary: 'bg-primary-50 text-primary-600',        ← renders unstyled

frontend/src/features/dashboard/components/RecentPaymentsPanel.tsx:18
  className="text-sm font-medium text-primary-700"  ← renders unstyled
```

`primary` is not a Tailwind default color, so the `StatCard` "primary" variant currently has **no background and no text color**. Nobody noticed because only two files use it.

This is the single highest-value, lowest-effort fix in this plan, and it must be settled before any token work: either add a `@theme` block to `index.css` defining the palette, or delete the dead config and stick to Tailwind's built-in scales. **Recommendation: `@theme` block** (§7.1).

### 2.3 Palette reality — measured, not guessed

Files referencing each color family:

```
slate    144   ← the neutral system
emerald   86   ← the accent system
blue      19   ← mostly the sidebar
indigo     6
gray       5   ← stray; index.css body uses bg-gray-50
sky        1
teal       1
violet     1
```

**Read:** slate + emerald *is* the design system. Everything else is drift.

Two concrete inconsistencies worth naming:

- **The sidebar is a different app.** `DashboardLayout` uses `bg-blue-950` with `bg-sky-600` active states, while the entire content area is slate + emerald. The navigation reads as bolted on.
- **`bg-gray-50` vs `bg-slate-50`.** `index.css` sets the body to `gray-50`; `DashboardLayout` sets its wrapper to `slate-50`. These are visibly different (gray is neutral, slate is blue-tinted), and both are on screen at once.

### 2.4 Component-layer assessment

| Component | Verdict |
|---|---|
| `EmptyState` | **Good.** Slate-based, dashed border, icon well, optional action. Keep as the pattern for the rest. |
| `Table` | **Good foundation.** Generic, `overflow-x-auto`, `rounded-xl` shell, empty-state slot. Needs sorting, sticky header, density. |
| `Modal` | **Styled well, behaves incompletely.** Has Escape + scroll lock + overlay click. **Missing focus trap, focus restore, `role="dialog"`, `aria-modal`, `aria-labelledby`.** This is the strongest argument for Radix. |
| `Pagination` | Adequate. |
| `BalanceBadge` | **Two problems.** Hardcodes `currency: 'USD'` with `toLocaleString`, and takes `balance: number` — a float — which contradicts the decimal-string money convention used everywhere on the backend. |
| **Missing entirely** | `Button`, `Card`, `Badge`, `Input`, `Select`, `Textarea`, `PageHeader`, `SectionHeader`, `Skeleton`, `Tabs`, `Dropdown`, `Tooltip` |

### 2.5 Incidental finding

`index.css` already contains `@page { size: 50mm 30mm; margin: 2mm; }`.

**This resolves open decision D1 in the product label plan** — the label stock is 50mm × 30mm, already configured. That plan flagged the dimension as the one thing that couldn't be determined from the repo; it can, and this is it. Worth confirming against physical stock, but the assumption was correct.

---

## 3. Recommended free UI stack

| Layer | Choice | Status |
|---|---|---|
| **Styling** | Tailwind CSS v4 with a `@theme` token block | Installed; needs wiring |
| **Component method** | shadcn-style: own the source, compose with `cn()` | `clsx` + `tailwind-merge` already installed |
| **Behavioral primitives** | **Radix UI**, selectively — Dialog, Dropdown, Select, Tabs, Tooltip, Popover | To add, ~6 small packages |
| **Icons** | `lucide-react` | Installed, already standard |
| **Charts** | `recharts` | Installed, unused |
| **Animation** | `framer-motion`, restrained | Installed |
| **Forms** | `react-hook-form` + `zod` | Installed |
| **Notifications** | `react-hot-toast` | Installed |

**Net new dependencies: Radix primitives only.** Everything else is already there. That is a deliberately small ask.

### 3.1 Why Radix, specifically

Radix is the only genuinely hard-to-replace item. Focus trapping, focus restoration, scroll locking, `aria-*` wiring, typeahead in listboxes, collision-aware popover positioning, and correct keyboard navigation are each individually subtle and collectively a large amount of code that is easy to get 80% right and never notice the missing 20%.

The current `Modal` is a fair example: it handles Escape and scroll lock — the visible parts — and misses focus management entirely. A keyboard user can Tab out of the open dialog into the page behind it.

Radix is MIT, unstyled, tree-shakeable, and per-primitive, so `@radix-ui/react-dialog` can be adopted without taking anything else.

### 3.2 Why not shadcn/ui as a base

shadcn/ui is excellent, and its **method** is the right one — components live in your repo, you own and edit them, there is no version-locked black box. Adopt that.

Adopting its **components** wholesale is a different matter. shadcn ships its own visual language (`zinc`/`neutral`, its own radius scale, its own focus rings, CSS variables named `--background`/`--foreground`/`--muted`). Dropping that into an app already committed to slate + emerald means either restyling every shadcn component to match, or restyling the app to match shadcn. The first is most of the work with none of the benefit; the second is a full redesign of 230+ files for no business reason.

**Use shadcn as a reference implementation.** When building `Button` or `Dialog`, read theirs, understand the structure and the Radix wiring, then write the HomeConnect version in HomeConnect's language. That is the intended use of a copy-paste library.

---

## 4. UI sources comparison

| Source | Free? | React/TW fit | Maintenance risk | Perf risk | Verdict |
|---|---|---|---|---|---|
| **shadcn/ui** | Yes, MIT | Excellent | **None** — you own the code | None | **Reference for structure, not a base** |
| **Radix UI** | Yes, MIT | Excellent (unstyled) | Low, well-maintained | Negligible | **Adopt selectively** — Dialog, Dropdown, Select, Tabs, Tooltip, Popover |
| **lucide-react** | Yes, ISC | Excellent | Low | Low (tree-shakes) | **Already standard — formalize it** |
| **Recharts** | Yes, MIT | Excellent | Low | Medium (SVG-heavy) | **Adopt for dashboard** |
| **HyperUI** | Yes, MIT | Excellent — plain Tailwind markup | **None** — it's snippets | None | **Best snippet source.** Adapt markup, restyle to tokens |
| **Flowbite React** | Core MIT; **Flowbite Blocks/Pro is paid** | Good, but opinionated | Medium — its own theming layer | Low | **Skip.** Would fight the existing language. Never touch Blocks/Pro. |
| **TailAdmin free** | Free tier exists; **Pro is paid** | Good | Medium — it's a template, not a library | Low | **Layout inspiration only.** Do not import. |
| **Uiverse.io** | Yes, MIT — **but per-component; verify each** | Mixed — often raw CSS, not Tailwind | **High** — orphan CSS blocks | Medium — heavy keyframes | **Inspiration only, heavily filtered** |
| **Aceternity UI** | Yes, free | Good, but needs framer-motion | Medium | **High** — animated backgrounds, blur, transforms | **Avoid in workflows.** Maybe one dashboard flourish |
| **Magic UI** | Yes, MIT | Good | Medium | **High** — same class of effects | **Avoid.** Marketing-page library, wrong genre |
| **ReactBits** | Yes | Mixed | Medium–High | High | **Avoid.** Same category as above |

### 4.1 The genre problem

Aceternity, Magic UI, and ReactBits are excellent at what they are for: **landing pages and marketing sites**, where a visitor spends 30 seconds and the goal is to impress. Spotlight effects, animated gradients, meteor showers, and text that assembles itself all serve that goal.

HomeConnect is the opposite context: staff use it **all day**, on modest Windows hardware, inside Electron, to do repetitive work quickly. In that setting, animation is friction. A card that fades in over 400ms is 400ms of waiting, every time, forever. An animated gradient background is a permanent GPU cost on a machine that also runs a Postgres instance.

This is not a reason to have no motion. It is a reason to have motion with a job (§7.9).

---

## 5. What to use from each source

### shadcn/ui
**Use for:** structural reference when building `Button`, `Dialog`, `Select`, `Tabs`, `Badge`, `Card`. Read their Radix wiring and variant approach. Their `cn()` utility — `clsx` + `tailwind-merge` — is already installed and should be added as `frontend/src/lib/cn.ts`.
**Do not:** run `npx shadcn init`, import their CSS variable scheme, or adopt their `zinc`/`neutral` palette.

### Radix UI
**Use for:** `Dialog` (replaces `Modal`'s internals, keeps its look), `DropdownMenu` (row actions), `Select` (form selects), `Tabs` (product details, customer profile), `Tooltip` (icon buttons), `Popover` (date range, filters).
**Do not:** adopt Radix `Form`, `Toast` (react-hot-toast is settled), or `Table` (the existing one is fine).

### HyperUI
**Use for:** markup patterns for stat cards, filter bars, form layouts, pricing-style panels. It is plain Tailwind — copy the structure, then replace every color class with a token.
**Do not:** paste its colors, its arbitrary values, or its spacing scale verbatim.

### lucide-react
**Use as:** the single icon set. Everything, everywhere.
**Do not:** add a second icon library, or hand-write inline SVG paths — `DashboardPage.tsx:34-67` currently does exactly that, and it should be the last of it.

### Recharts
**Use for:** every dashboard chart. Wrap in a single `ChartFrame` so chrome, empty states, and colors are declared once.
**Do not:** use it for sparklines inside dense table rows — at 50+ instances the SVG cost is real; use a small inline path there.

### Uiverse.io
**Use for:** *inspiration only* — a loading spinner shape, a toggle treatment, a button hover idea. Look, understand, rebuild in Tailwind with project tokens.
**Do not:** paste a component's CSS. Uiverse components are typically raw CSS with generated class names, arbitrary keyframes, and hardcoded colors — they land in the codebase as orphan CSS nobody can maintain, and they will not respond to the token system. Licensing is **per-component** (usually MIT), so it must be checked individually rather than assumed.

### Aceternity / Magic UI / ReactBits
**Use for:** possibly one considered flourish — e.g. a subtle border-gradient on the dashboard's ERP module map, where the page is glanceable rather than transactional.
**Do not:** use in any form, dialog, table, or workflow screen. No animated backgrounds, no spotlight-follows-cursor, no meteors, no infinite marquees.

### Flowbite React / TailAdmin
**Use for:** layout ideas only — how a sidebar collapses, how a filter bar composes.
**Do not:** install either. Both bring their own theming layer that would compete with the token system, and both have paid tiers whose components must never be copied.

---

## 6. What to avoid

**Never copy from any UI site:**

1. **Raw CSS blocks with generated class names.** They can't be themed, can't be searched, and nobody will dare delete them.
2. **Hardcoded hex colors.** Every color goes through a token. A stray `#10b981` is invisible until the day the accent changes.
3. **Arbitrary Tailwind values** (`w-[347px]`, `mt-[13px]`). They defeat the spacing scale.
4. **Animated backgrounds, particles, spotlights, gradient meshes.** Permanent cost, no function.
5. **Components with their own state management or data-fetching.** They will fight React Query.
6. **Anything from a paid tier** — Flowbite Blocks, TailAdmin Pro, Tailwind UI. Not free, not usable, not negotiable.
7. **Glassmorphism / heavy backdrop-blur on large surfaces.** `backdrop-blur` is expensive to composite; the existing `backdrop-blur-sm` on the modal *overlay* is fine because it's transient, but it should not spread to cards or the sidebar.
8. **Multiple competing icon sets.** One outline weight, one library.
9. **Neon, gaming, or "AI startup" aesthetics.** Wrong genre for a business system.
10. **Components requiring a peer library the project doesn't have** — no styled-components, no emotion, no CSS-in-JS.

**Also avoid, specific to this codebase:**

11. **Adding more accent colors.** The palette is slate + emerald + semantic status. `indigo`, `sky`, `teal`, and `violet` are already drift and should shrink, not grow.
12. **New inline SVG icon paths.** lucide covers it.
13. **`toLocaleString` for money.** `BalanceBadge` does this with a hardcoded `USD`; money formatting belongs in one shared formatter fed by backend decimal strings.

---

## 7. HomeConnect design system proposal

Deliberately small: tokens, eleven primitives, and a set of rules. Not a component encyclopedia.

### 7.1 Color tokens

Define once in `index.css` via a Tailwind v4 `@theme` block (which also fixes §2.2):

```css
@theme {
  /* Brand accent — the emerald already in 86 files */
  --color-brand-50:  #ecfdf5;
  --color-brand-100: #d1fae5;
  --color-brand-600: #059669;
  --color-brand-700: #047857;

  /* Semantic status — reserved, never used as decoration */
  --color-success: #0ca30c;
  --color-warning: #fab219;
  --color-danger:  #d03b3b;
  --color-info:    #2a78d6;
}
```

Rules:

- **Neutral = `slate`.** Tailwind's built-in scale. Ban `gray` — fix `index.css`'s `bg-gray-50` to `bg-slate-50` so the body and layout agree.
- **Accent = `brand`** (emerald). Primary buttons, active nav, links, focus rings.
- **Status colors are reserved.** Success/warning/danger/info mean state, never decoration. Always paired with an icon and a text label — never color alone.
- **Delete the `primary-*` references** in `StatCard.tsx` and `RecentPaymentsPanel.tsx`, or define `primary` as an alias of `brand`. Either is fine; leaving them broken is not.
- **Chart series colors** come from the validated categorical palette in the dashboard plan — distinct from status colors so a series never impersonates a state.

**Sidebar decision (D2, §12):** the `blue-950` sidebar against a slate+emerald body is the app's most visible inconsistency. Recommended fix is `slate-900` with `brand-600` active states — a one-file change that makes the navigation belong to the app. This is a visual change to the most-looked-at surface, so it needs sign-off rather than being slipped in.

### 7.2 Spacing & radius

- Spacing: Tailwind's 4px scale. Section gap `gap-6`, card padding `p-6` (dense `p-4`), form field gap `gap-4`.
- Radius: `rounded-xl` for cards/panels, `rounded-lg` for buttons/inputs/badges, `rounded-2xl` for modals, `rounded-full` for avatars and icon buttons only. **Three values, no more.**
- Elevation: `shadow-sm` at rest, `shadow-md` on hover for interactive cards, `shadow-xl` for modals. Nothing heavier.

### 7.3 Card

The pattern already in use, formalized:

```
bg-white rounded-xl border border-slate-200 shadow-sm
```

Variants: `default`, `interactive` (adds `hover:shadow-md hover:border-brand-300 transition-shadow`), `flush` (no padding, for tables). Optional `<CardHeader>` with title + action slot.

### 7.4 Button

Five variants, three sizes. No more.

| Variant | Use |
|---|---|
| `primary` | `bg-brand-600 text-white hover:bg-brand-700` — one per screen |
| `secondary` | `bg-white border-slate-300 text-slate-700 hover:bg-slate-50` |
| `ghost` | `text-slate-600 hover:bg-slate-100` — toolbars, row actions |
| `danger` | `bg-red-600 text-white` — destructive only |
| `link` | `text-brand-700 underline-offset-4 hover:underline` |

Sizes `sm` / `md` / `lg`. Every button supports `isLoading` (spinner + disabled) and optional leading icon. **Icon-only buttons require an `aria-label` and a tooltip** — unlabeled icons are the classic ERP usability failure.

### 7.5 Form

- Label above input, always. No placeholder-as-label.
- Input: `rounded-lg border-slate-300 focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500`.
- Error: red border + message below with an icon. Never color alone.
- Required marked with `*` **and** `aria-required`.
- Help text below in `text-slate-500 text-xs`.
- Two-column grid on desktop, single column under `md`.
- Money inputs right-aligned, tabular figures.
- **User-entered text fields get `.user-text-input`** — the existing utility that sets `unicode-bidi: plaintext`. This is already the right pattern; apply it consistently.

### 7.6 Table

Extend the existing `Table`, don't replace it:

- Sticky header on tall tables.
- Sortable column headers with an indicator.
- Zebra off; `hover:bg-slate-50` on.
- Row click opens detail; a trailing actions column uses a Radix dropdown.
- Numeric columns right-aligned with `tabular-nums`.
- **Under `md`, tables become cards** — never horizontal scroll on small screens.
- Loading = skeleton rows matching column widths, not a spinner.
- Empty = the existing `EmptyState` inside the table shell.

### 7.7 Status badge

```
inline-flex items-center gap-1.5 rounded-md px-2 py-1
text-xs font-medium ring-1 ring-inset
```

This is `BalanceBadge`'s existing shape — generalize it. Every badge carries an **icon + text**, never color alone. Tones: `neutral`, `success`, `warning`, `danger`, `info`, `brand`.

Domain badges (`DebtStatus`, `ServiceJobStatus`, stock status) map to tones through **one shared map per domain**, so a status wears the same color in every module.

### 7.8 Dialog

Keep the current look — `rounded-2xl`, white, `shadow-xl`, `border-slate-200`, header with title + close, scrollable body, `max-h-[90vh]`. Replace the **internals** with Radix Dialog to gain focus trap, focus restore, `role="dialog"`, `aria-modal`, and `aria-labelledby`.

Sizes `sm` / `md` / `lg` / `xl` replacing the free-form `maxWidth` string. Footer slot with actions right-aligned, primary last. Destructive confirmations require typed confirmation or an admin password where policy already demands it.

### 7.9 Motion policy

`framer-motion` is installed and used well in two places. Formalize the boundary:

**Allowed:** dialog enter/exit (already there, 200ms), sidebar collapse (already there), toast enter/exit, skeleton shimmer, hover transitions on `shadow`/`border`/`background` (150ms).

**Not allowed:** entrance animations on lists, tables, or cards; staggered reveals; animated backgrounds; parallax; scroll-triggered animation; number count-ups; anything over 300ms.

**Rule of thumb:** motion may explain a state change (a thing appeared, a panel opened). It may not decorate a thing that is simply present.

Respect `prefers-reduced-motion` globally.

### 7.10 Loading / empty / error

- **Loading:** skeletons shaped like the final content. Spinners only inside buttons. Skeletons must match final dimensions — mismatched ones cause layout shift as queries resolve at different times.
- **Empty:** the existing `EmptyState`, always with a next action where one exists.
- **Error:** contained in the section that failed, with a retry. One failed panel never blanks a page. Error boundaries per major section.

### 7.11 Print / label

Already established in `index.css` and correct: `@media print` hides `aside`, `header`, `.no-print`; `@page { size: 50mm 30mm; margin: 2mm }`; Tahoma for print.

Rules: printed output is **English-only** (per the label plan), pure black on white, no shadows, no rounded corners, no background colors. Reports get their own print stylesheet with A4 sizing — the 50mm page rule is label-specific and must not leak into report printing. **Flagged as a risk in §12**, since a global `@page` currently applies to both.

### 7.12 Bilingual labels

See §11.

---

## 8. Module-by-module UI recommendations

### Customers
- Profile header: name, phone, status badge, balance badge, primary actions inline.
- A 3–4 card financial summary strip (outstanding, paid this month, open plans, last payment).
- Tabs (Radix) for Debts / Payments / Plans / Service Jobs.
- Table → cards under `md`.

### Ledger
- Filter bar as a sticky `Card` above the table: date range, type, status, search.
- Professional dense table, sticky header, right-aligned tabular money, running balance column.
- **Expandable rows** for payment allocations — a real win here, since allocation detail is exactly the "show me why" case.
- Status badges from the shared domain map.
- Totals in a footer row **supplied by the backend**, never summed from the visible page.

### Products
- Card grid *or* table, user-toggleable — products are visual, and the existing image support makes a grid genuinely useful.
- Product card: image, name, model, brand, SKU chip, stock badge, price.
- Detail drawer with tabs: Info / Pricing / Stock / Specifications / Label.
- **Pricing preview as a distinct panel**, visually separated — it's derived data, not input.
- **Label preview must render the real label component**, not a mock.
- Specifications as a clean definition list; stock as a badge + fields.

### Suppliers
- Mirror the customer layout deliberately — same header shape, same card strip, same tab pattern. Two ledgers that behave the same way are easier to learn than two clever ones.
- Balance badge with direction (owed vs credit).
- Supplier ledger table matching the customer ledger exactly.

### Maintenance / Service
- **Status cards row** — already exists as `ServiceDashboardCards` and is good; align it to tokens.
- Optional kanban-style status columns as a view toggle. Genuinely useful for a repair workflow, but **defer past the primitives work**.
- **Job detail as a vertical timeline** — received → inspected → routed → in workshop / at company → ready → delivered. This is the single highest-value module-specific UI in the app: it turns a status field into a story.
- Workflow buttons as clear primary actions, one per available transition, disabled with a tooltip explaining why when unavailable.

### Dashboard
See §9.

### Reports
- Report-like layout: white sheet on slate background, clear header with title/date range/generated-at.
- Filter bar above, hidden on print via `.no-print`.
- Print stylesheet targeting **A4** (§12 risk).
- Export buttons (`xlsx`/`jspdf` are installed).
- Simple and polished — a report is read, not interacted with. Restraint is the design.

---

## 9. Dashboard visual design plan

The dashboard has its own full plan at `claude/plans/erp-dashboard-analytics-plan.md`. This section only records the **UI-layer** decisions that plan depends on:

1. **KPI cards** — icon in a tinted rounded square (the existing `StatCard` treatment), value as hero, delta chip with arrow + word, optional sparkline. Cap: 8.
2. **Section headers** — icon + bilingual title + right-aligned action link. Same component everywhere; per-section improvisation is what makes a dashboard look homemade.
3. **Charts** — Recharts in a shared `ChartFrame`. Seven charts, each answering a named business question. No dual-axis, ever.
4. **Quick actions** — icon + label buttons. Never icon-only.
5. **Alerts** — severity icon + label + count + money at risk, ranked. Calm empty state.
6. **Month-end** — three control columns with a reconciliation indicator.
7. **ERP module map** — tiles from the module registry; LIVE full-color and clickable, NEXT muted, PLANNED outlined and inert.
8. **Progressive rendering** — fast KPI strip first, heavier sections fill in behind skeletons.

**Primitive dependency:** the dashboard needs `Card`, `Badge`, `Button`, `SectionHeader`, `EmptyState`, and `Skeleton` to exist first. Building the dashboard before the primitives means building them inline inside dashboard components, where the rest of the app can't reach them. **The primitives work (CP2) should land before the dashboard rebuild.**

---

## 10. Component priority list

Ranked by leverage, not by visibility.

### Tier 1 — unblocks everything else
| # | Component | Why |
|---|---|---|
| 1 | **`cn()` helper** | 5 lines; `clsx` + `tailwind-merge` already installed |
| 2 | **`@theme` tokens + fix `primary-*`** | Fixes a live rendering bug (§2.2) |
| 3 | **`Button`** | Most-repeated inline style in the app |
| 4 | **`Card` / `CardHeader`** | Second-most-repeated |
| 5 | **`Badge`** | Generalizes `BalanceBadge`; every module needs it |
| 6 | **`Dialog`** (Radix internals, current look) | Fixes the focus-trap accessibility gap |

### Tier 2 — consistency
| # | Component | Why |
|---|---|---|
| 7 | `PageHeader` / `SectionHeader` | Every page currently improvises |
| 8 | `Input` / `Select` / `Textarea` / `FormField` | Forms are the daily surface |
| 9 | `Skeleton` | Prerequisite for good loading states |
| 10 | `Table` upgrades | Sorting, sticky header, card fallback |
| 11 | `DropdownMenu` (Radix) | Row actions |
| 12 | `Tabs` (Radix) | Product & customer detail |

### Tier 3 — module polish
| # | Component |
|---|---|
| 13 | `KpiCard` + `ChartFrame` |
| 14 | `FilterBar` |
| 15 | `Timeline` (service jobs) |
| 16 | `Tooltip` (Radix) |
| 17 | `StatusBadge` domain maps |

### What should stay simple
- `EmptyState` — already right, don't over-engineer.
- `Pagination` — adequate.
- Print/label CSS — working; touch only for A4 report separation.
- The data layer — React Query is settled; no UI change should touch it.
- `react-hot-toast` — settled.
- **Do not build:** a theme switcher, a component playground, a design-token documentation site, or dark mode (see §12).

---

## 11. Arabic + English UI guidance

The app already has a working bilingual approach. Formalize it; don't expand it.

### 11.1 The rule

**The app is LTR. Arabic appears as label text, not as a layout direction.** Do not convert to RTL.

### 11.2 What exists and works

- `frontend/src/shared/labels/business-labels.ts` — the bilingual label source.
- `DashboardLayout` nav items already use `"Customers / الزبائن"`.
- `.user-text`, `.user-text-pre`, `.user-text-input` utilities set `unicode-bidi: plaintext` — the correct mechanism for mixed-direction user content.

### 11.3 Where bilingual labels belong

| Bilingual | English only |
|---|---|
| Sidebar nav | Table column headers |
| Page titles | Chart axis ticks |
| Section headers | Tooltips, help text |
| KPI card titles | Validation messages |
| Quick actions | Technical/debug strings |
| Primary buttons | **Printed labels — hard rule** |
| Status badge labels | Report internals |

### 11.4 Presentation

Two forms: inline `Customers / الزبائن` for compact surfaces (nav, buttons), stacked for cards and headers — English primary, Arabic below in smaller muted type.

A shared `<BilingualLabel>` component renders both and puts `dir="rtl"` on **the Arabic span only**. Never on a container: a container-level `dir` flips layout, and `Model: SJ-PV69G` can render as `SJ-PV69G :Model`.

### 11.5 User-entered text

Always `.user-text` (or `dir="auto"`) — customer names, product names, notes, descriptions. **Never** on numbers, money, dates, SKUs, or barcodes: a `dir="auto"` money value can reorder a minus sign.

### 11.6 Printed output

**Labels are English-only, no `dir` anywhere in the subtree** (per the label plan). Reports may stay bilingual in headers but keep data columns English.

---

## 12. Performance and maintainability risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Dead `tailwind.config.js`** silently voids custom tokens (§2.2) | **High** | `@theme` block in `index.css`; delete or wire the config. Fix the two broken `primary-*` usages. |
| R2 | **Copied CSS from Uiverse-style sites** becomes unmaintainable orphan code | High | Inspiration only; rebuild in Tailwind tokens. Policy in §5. |
| R3 | **Animation cost in Electron** on modest shop hardware | Medium | Motion policy §7.9; no animated backgrounds; honor `prefers-reduced-motion`. |
| R4 | **Recharts weight** — many charts on one page | Medium | One `ChartFrame`; memoize on data slice; no Recharts sparklines in table rows. |
| R5 | **Big-bang redesign** stalling feature work | **High** | Incremental: tokens → primitives → module-by-module. Never a global restyle in one pass. |
| R6 | **Palette drift** — indigo/sky/teal/violet already present | Medium | Ban new accents; migrate strays opportunistically. |
| R7 | **`@page { size: 50mm 30mm }` is global** — reports would print on label-sized pages | Medium | Scope the label `@page` to a label print context; give reports their own A4 rule. **Verify current report printing behavior before changing anything.** |
| R8 | **`BalanceBadge` hardcodes USD and takes a float** | Medium | Route through one shared money formatter fed by backend decimal strings. |
| R9 | **Radix bundle growth** if adopted indiscriminately | Low | Six primitives only; each is separately installable and tree-shakes. |
| R10 | **Modal a11y gap** — no focus trap today | Medium | Radix Dialog internals, keeping the current visual design. |
| R11 | **Dark mode** — tempting, and a large hidden cost | Low | **Do not build it.** A shop-floor ERP on fixed desktop hardware gains nothing, and every token, chart palette, and print style would need a second validated variant. |

---

## 13. Free / license notes

| Source | License | Notes |
|---|---|---|
| Tailwind CSS | MIT | Free. Tailwind **UI** is paid — different product, do not copy. |
| Radix UI | MIT | Fully free. |
| shadcn/ui | MIT | Free. Copy-in by design — no runtime dependency. |
| lucide-react | ISC | Free, permissive. |
| Recharts | MIT | Free. |
| framer-motion | MIT | Free. |
| HyperUI | MIT | Free. Snippets, attribution not required. |
| Flowbite React | MIT **core** | **Flowbite Blocks / Pro is paid — never copy from it.** |
| TailAdmin | Free tier + **paid Pro** | Free tier usable; **Pro is paid.** Inspiration only. |
| Uiverse.io | **Per-component, usually MIT** | **Check each component individually.** Do not assume site-wide licensing. |
| Aceternity UI | Free | Verify per component; recommendation is to avoid regardless. |
| Magic UI | MIT | Free but wrong genre. |
| ReactBits | Free | Verify per component; avoid. |

**Policy:** anything copied — not installed — gets a source comment and a license check at copy time. Since the recommendation is to *rebuild from inspiration* rather than paste, this mostly stays theoretical. That is deliberate: rebuilt code carries no license question at all.

**Never touch:** Tailwind UI, Flowbite Blocks/Pro, TailAdmin Pro, or any "premium" tier.

---

## 14. Codex implementation checkpoints

Ordered by dependency. Each leaves the app working and shippable.

### CP1 — Inspect & confirm *(read-only)*
Verify: the Tailwind v4 / dead-config finding (§2.2) and whether any custom token is silently broken beyond the two `primary-*` cases; current report printing behavior against the global `@page` rule (R7); whether `framer-motion` is used beyond `DashboardLayout` and `Modal`; the full set of inline-styled buttons/cards that the primitives will replace.
**Output:** findings note. Stop and report.

### CP2 — Tokens & the `cn()` helper
`@theme` block, `brand` + status tokens, fix or alias `primary-*`, unify `gray-50` → `slate-50`, add `frontend/src/lib/cn.ts`, resolve the dead `tailwind.config.js`. **No visual redesign** — this is plumbing, and the app should look unchanged apart from the two fixed `StatCard`/`RecentPaymentsPanel` spots.

### CP3 — Core primitives
`Button`, `Card`/`CardHeader`, `Badge`, `PageHeader`, `SectionHeader`, `Skeleton`. Built in the existing slate + emerald language. **Do not migrate call sites yet** — land the primitives, then adopt incrementally.

### CP4 — Dialog on Radix
Add `@radix-ui/react-dialog`. Rebuild `Modal` internals; keep the exact current appearance. Gain focus trap, focus restore, `aria-*`. Add size variants. Migrate existing modal call sites — the API should stay close enough that this is mechanical.

### CP5 — Form primitives
`Input`, `Select` (Radix), `Textarea`, `FormField` wrapper with label/error/help. Wire to `react-hook-form` + `zod` as already used. Apply `.user-text-input` consistently.

### CP6 — Icon standardization
Sweep for inline SVG paths — starting with `DashboardPage.tsx:34-67` — and replace with lucide. Establish the module→icon registry so a module wears one icon everywhere.

### CP7 — Table upgrades & filter bar
Sorting, sticky header, `tabular-nums` on numeric columns, skeleton rows, card fallback under `md`. Shared `FilterBar`. Apply to Ledger first as the proving ground.

### CP8 — Module adoption pass
Migrate module by module to the primitives: Products → Suppliers → Customers → Service. One module per commit. Purely mechanical; no behavior changes.

### CP9 — Charts
`ChartFrame` + Recharts wrappers with the validated palette. Only after CP2–CP3, since charts consume tokens.

### CP10 — States pass
Loading skeletons, empty states, error boundaries per section across all modules.

### CP11 — Bilingual & motion polish
`<BilingualLabel>`, audit `dir` usage (Arabic span only, never containers, never on numbers), apply the motion policy, add `prefers-reduced-motion`.

### CP12 — Sidebar & docs
The sidebar recolor **if approved** (§7.1, D2). A short `docs/UI_GUIDELINES.md` — tokens, primitives, do/don't. One page, not a design-system site.

**Sequencing rule:** CP2 and CP3 gate everything else. The dashboard rebuild should land after CP3, or its components will inline primitives the rest of the app can't reach.

---

## 15. Exact files likely to inspect / change later

### Tokens & config
```
frontend/src/styles/index.css              ← @theme block, gray→slate, scope label @page
frontend/tailwind.config.js                ← wire via @config or delete (currently dead)
frontend/postcss.config.js                 ← verify v4 plugin wiring
```

### New primitives
```
frontend/src/lib/cn.ts
frontend/src/components/ui/Button.tsx
frontend/src/components/ui/Card.tsx
frontend/src/components/ui/Badge.tsx
frontend/src/components/ui/Dialog.tsx           ← Radix internals, current look
frontend/src/components/ui/Input.tsx
frontend/src/components/ui/Select.tsx
frontend/src/components/ui/Textarea.tsx
frontend/src/components/ui/FormField.tsx
frontend/src/components/ui/Skeleton.tsx
frontend/src/components/ui/PageHeader.tsx
frontend/src/components/ui/SectionHeader.tsx
frontend/src/components/ui/DropdownMenu.tsx     ← Radix
frontend/src/components/ui/Tabs.tsx             ← Radix
frontend/src/components/ui/Tooltip.tsx          ← Radix
frontend/src/components/ui/FilterBar.tsx
frontend/src/components/ui/BilingualLabel.tsx
frontend/src/components/ui/Timeline.tsx         ← service jobs
```

### Existing components to modify
```
frontend/src/components/ui/Modal.tsx            ← → Radix Dialog
frontend/src/components/ui/Table.tsx            ← sorting, sticky, card fallback
frontend/src/components/ui/BalanceBadge.tsx     ← generalize; fix USD/float
frontend/src/components/ui/EmptyState.tsx       ← token alignment only
frontend/src/components/ui/Pagination.tsx       ← token alignment only
frontend/src/layouts/DashboardLayout.tsx        ← sidebar recolor (if approved)
frontend/src/features/dashboard/components/StatCard.tsx          ← broken primary-*
frontend/src/features/dashboard/components/RecentPaymentsPanel.tsx ← broken primary-*
frontend/src/features/dashboard/pages/DashboardPage.tsx          ← inline SVG → lucide
frontend/src/shared/labels/business-labels.ts   ← feed BilingualLabel
```

### Module surfaces (CP8, one per commit)
```
frontend/src/features/products/components/*.tsx
frontend/src/features/suppliers/**
frontend/src/features/customers/**
frontend/src/features/service/**
frontend/src/features/financial-ledger/**
frontend/src/pages/LedgerPage.tsx
frontend/src/pages/ReportsPage.tsx
frontend/src/pages/AccountsReceivablePage.tsx
```

### Docs
```
docs/UI_GUIDELINES.md                      ← new, one page
```

---

## Appendix — answers to the ten review questions

1. **What UI style fits best?** Clean business/ERP: slate neutrals, one emerald accent, reserved status colors, `rounded-xl` cards, generous spacing, restrained motion. **It already exists** — it needs consolidating, not replacing.
2. **shadcn/ui as the base?** **No.** Use its *method* (own the source, `cn()`) and read it as reference. Adopting its components means restyling them to match the app, or restyling the app to match them — neither is worth it.
3. **Uiverse only for small polish?** **Yes, and even then only as inspiration.** Never paste its CSS.
4. **Aceternity / Magic UI animations?** **Avoid in workflows.** Marketing-page libraries. Perhaps one flourish on the dashboard module map; nothing in forms, tables, or dialogs.
5. **Chart library?** **Recharts** — already installed, React-native API, MIT, sufficient for all seven planned charts.
6. **Icon library?** **lucide-react** — already installed and already the de facto standard. Formalize it and remove the remaining inline SVG paths.
7. **Redesign first?** `cn()` → tokens (fixing the live `primary-*` bug) → `Button` → `Card` → `Badge` → `Dialog`. Highest leverage, lowest risk.
8. **What stays simple?** `EmptyState`, `Pagination`, print CSS, the React Query data layer, `react-hot-toast`. No theme switcher, no dark mode, no playground.
9. **Never copy?** Raw CSS blocks, hardcoded hex, arbitrary values, animated backgrounds, paid-tier components, anything bringing its own state layer or CSS-in-JS.
10. **How to stay consistent?** One token source in `@theme`; one primitive per concept in `components/ui/`; one icon library; one status→tone map per domain; a one-page `UI_GUIDELINES.md`; and a review rule — **if a screen declares a color or a button style inline, it should be using a primitive instead.**

---

**Plan status:** ready for review. Nothing implemented, no packages installed, no files outside this document modified.
