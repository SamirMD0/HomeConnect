# ERP Dashboard Analytics — Planning Document

**Status:** Plan only. No code written, no migrations, no version bump.
**Target version:** v1.1.0 (current release: v1.0.6, commit `ed04042`)
**Author role:** ERP product strategy / dashboard architecture / UX planning / technical planning
**Date:** 2026-08-01

---

## 0. What already exists (verified in repo, not assumed)

This plan is grounded in a targeted inspection of the repository. Everything below was read, not guessed.

| Area | Reality today |
|---|---|
| Dashboard backend | `backend/src/features/dashboard/` — `dashboard-financial.{controller,repository,routes,service,types}.ts` (~866 lines total incl. tests) |
| Legacy dashboard backend | `backend/src/routes/dashboard.routes.ts` + `backend/src/controllers/dashboard.controller.ts` serving `/summary` and `/recent-activity` |
| Mount point | `app.use('/api/v1/dashboard', requireAuth, dashboardRoutes)` in `backend/src/app.ts:108` |
| Live endpoints | `GET /api/v1/dashboard/financial-summary`, `/summary`, `/recent-activity` |
| Aggregation style | `DashboardFinancialRepository.loadFinancialRecords()` loads **all** debts, plans and payments into memory; `DashboardFinancialService` computes everything in JS with `Decimal` |
| Money domain | `backend/src/features/financial/domain/money.ts` — `sumMoney`, `subtractMoney`, `moneyToApiString`, `ZERO_MONEY`, `todayInBusinessTimezone`, `prismaDateToBusinessDate`, `compareBusinessDates` |
| Balance domain | `calculateDebtBalance`, `calculateInstallmentBalance`, `calculateInstallmentPlanSummary`, `determineDebtStatus`, `determineInstallmentStatus`, `isPaymentAllocationVoided` |
| Month-end precedent | `backend/src/features/reports/monthly-debts/` — SNAPSHOT-mode report with `cutoffDate`, `totalOutstanding`, `totalOverdueAtCutoff`, `totalPaymentsReceivedDuringMonth`; ADMIN-only via `requireRole(['ADMIN'])` |
| Service analytics | `GET /api/v1/service-jobs/summary` already exists (`service-jobs.routes.ts:14`) |
| Supplier analytics | **None.** `supplier-ledger.routes.ts` exposes a listing only — no aggregate endpoint |
| Product analytics | **None.** No summary endpoint on `products.routes.ts` |
| Frontend dashboard | `frontend/src/features/dashboard/{api,components,hooks,pages,types.ts}` — `StatCard`, `QuickActions`, `RecentActivity`, `RecentPaymentsPanel`, `UpcomingDueList`, `OverdueCustomersList` |
| Frontend deps (already installed) | `recharts@^3.10.0`, `lucide-react@^1.26.0`, `@tanstack/react-query@^5.101.4`, `tailwindcss@^4.3.3`, React 19 |
| Existing reuse | `ServiceDashboardCards` from `features/service/components/` is already rendered on the dashboard page |
| Query keys | Ad-hoc arrays (`['dashboard','financial-summary']`), `refetchInterval: 30000` |

**Three findings that shape this whole plan:**

1. **`recharts` and `lucide-react` are already dependencies.** No new charting or icon library is needed. Zero dependency risk for the visual layer.
2. **The current aggregator is a full-table in-memory scan.** It is correct but does not scale, and every new metric added to it multiplies the same load. The rebuild must move date-bucketed aggregation into SQL.
3. **The domain layer is already the source of truth for money and status.** Every new aggregator must call into `features/financial/domain/` rather than reimplement balance math. This is the single most important correctness constraint in the plan.

---

## 1. Version goal

Replace the current dashboard — a four-card strip plus three list panels — with a **backend-authoritative ERP command center**: KPI cards with icons and sparklines, meaningful charts, a month-end control section, an exception center, quick actions, and an ERP module map, laid out in clean sections that hold up on desktop and degrade gracefully on smaller screens.

**Definition of done for v1.1.0:**

- Every headline number on screen is computed by the backend. The frontend never sums a paginated page to produce a total.
- The dashboard answers all business questions listed in §2 without the user navigating away.
- Adding Inventory, Orders, Sales, or Finance later is a matter of adding a section and a data slice — not a redesign.
- The page loads its KPI strip fast and progressively fills heavier sections, rather than blocking on one large payload.

**Explicit non-goal:** this version does not implement inventory, orders, sales, or a finance engine. It builds the frame those will slot into.

---

## 2. Business objectives

The dashboard must let the owner answer these without running a report:

**Customer money**
- How much was collected today / this week / this month?
- How many distinct customers paid today?
- How much new debt was created today / this month?
- What is total outstanding customer debt right now?
- How many customers carry a balance? How many are overdue?
- Who are the largest debtors?
- What was the net movement of debt this month (created minus collected)?

**Supplier money**
- What is owed to suppliers in total?
- How much was paid to suppliers today / this month?
- Which suppliers carry the largest unpaid balances?

**Service / maintenance**
- How many jobs are open, at the company, waiting on a part, awaiting customer approval, ready for pickup?
- How many were completed this month? How many are aging past a threshold?

**Products / pricing**
- How many active products exist?
- How many are missing a barcode, a price, or a pricing preset?
- Which pricing presets are actually being used?

**Control**
- What is the month-end position for customers, suppliers, and service — opening, movement, closing?
- What needs my attention right now?

---

## 3. Dashboard vision

**The command-center principle:** the top of the page tells you the state of the business in five seconds; the middle tells you the trend; the bottom tells you what to do about it.

**Reading order, top to bottom:**

1. **State** — KPI strip. Where the business stands right now.
2. **Act** — quick actions. The eight things the user does all day.
3. **Attention** — alerts. What is wrong, ranked by money at risk.
4. **Trend** — charts, per domain. Why the state looks the way it does.
5. **Control** — month-end. The closing position.
6. **Context** — activity feed and ERP module map.

**Anti-patterns this plan explicitly forbids** (each maps to a requirement from the brief and to `dataviz/references/anti-patterns.md`):

| Forbidden | Rule enforced |
|---|---|
| A wall of raw tables | Tables appear only where a row identity matters (top debtors, aging jobs) and are capped at 5–8 rows with a "view all" link |
| Card soup | Hard cap: **8 KPI cards** in the global strip, max 4 per domain section. If a metric doesn't change a decision, it is not a card |
| Duplicated stats | Each number appears exactly once. "Outstanding debt" lives in the global strip and is *not* repeated in the customer section |
| Dual-axis charts | Banned outright. Two measures of different scale → two charts or index to a common base |
| Meaningless charts | Every chart must answer a named question from §2. A chart without a question is deleted |
| Tiny labels | Minimum 12px for axis/tick text, 14px for card labels |
| Rainbow palettes | Fixed categorical slot order, validated (§7.5) |

---

## 4. Information architecture

### 4.1 Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND  frontend/src/features/dashboard/                  │
│                                                             │
│  DashboardPage                                              │
│    ├─ DashboardFilterBar   (range, archived, refresh)       │
│    ├─ KpiStrip             ← useDashboardOverview()         │
│    ├─ QuickActionsRow                                       │
│    ├─ AlertsCenter         ← useDashboardAlerts()           │
│    ├─ CustomerAnalytics    ← useCustomerAnalytics(range)    │
│    ├─ SupplierAnalytics    ← useSupplierAnalytics(range)    │
│    ├─ ServiceAnalytics     ← useServiceAnalytics(range)     │
│    ├─ ProductAnalytics     ← useProductAnalytics()          │
│    ├─ MonthEndSnapshot     ← useMonthEnd(month)             │
│    ├─ ActivityFeed         ← useDashboardActivity()         │
│    └─ ErpModuleMap         (static config, no fetch)        │
└─────────────────────────────────────────────────────────────┘
                              │ HTTP  /api/v1/dashboard/*
┌─────────────────────────────────────────────────────────────┐
│ BACKEND  backend/src/features/dashboard/                    │
│                                                             │
│  routes → controller → dashboard.service (orchestrator)     │
│                            │                                │
│    ┌───────────────────────┼───────────────────────┐        │
│    ▼           ▼           ▼           ▼           ▼        │
│  customer   supplier    service    product     month-end    │
│  analytics  analytics   analytics  analytics   snapshot     │
│    │           │           │           │           │        │
│    └───────────┴───────────┴───────────┴───────────┘        │
│                            │                                │
│              dashboard-aggregation.repository               │
│              (SQL groupBy / aggregate — indexed)            │
│                            │                                │
│              features/financial/domain/                     │
│              (money.ts, statuses.ts — SINGLE source of      │
│               truth for balance & status. Never bypass.)    │
└─────────────────────────────────────────────────────────────┘
                              │
                          PostgreSQL (Prisma)
```

### 4.2 Module boundary rule

The dashboard feature **reads** from other domains but owns no business rules. It imports `features/financial` domain helpers, calls into the shape of `features/service` and `features/suppliers` data, and derives nothing on its own. If the dashboard needs a rule that doesn't exist (e.g. "supplier balance"), the rule is added to the **owning** feature and the dashboard consumes it.

This is what makes the dashboard future-ready: when Inventory ships with its own domain, the dashboard adds a slice that calls it — no new math in the dashboard.

### 4.3 Directory plan

```
backend/src/features/dashboard/
  dashboard.routes.ts                    ← new umbrella router
  dashboard.controller.ts                ← new
  dashboard.validator.ts                 ← new (zod query schemas)
  dashboard.types.ts                     ← new (shared meta/range types)
  shared/
    dashboard-range.ts                   ← range resolution (today/week/month/custom)
    dashboard-cache.ts                   ← in-process TTL cache
  customer/
    customer-analytics.{service,repository,types}.ts
  supplier/
    supplier-analytics.{service,repository,types}.ts
  service/
    service-analytics.{service,repository,types}.ts
  product/
    product-analytics.{service,repository,types}.ts
  month-end/
    month-end.{service,repository,types}.ts
  alerts/
    dashboard-alerts.{service,repository,types}.ts
  dashboard-financial.*                  ← KEPT, deprecated alias (see §12.6)
```

```
frontend/src/features/dashboard/
  pages/DashboardPage.tsx                ← rebuilt
  api/dashboard.api.ts                   ← extended
  hooks/useDashboard.ts                  ← extended
  hooks/dashboard.queryKeys.ts           ← new
  types.ts                               ← extended
  config/
    module-registry.ts                   ← icon + route + status per ERP module
    dashboard-labels.ts                  ← bilingual label map
  components/
    layout/{DashboardSection,SectionHeader,DashboardFilterBar}.tsx
    kpi/{KpiCard,KpiStrip,KpiSparkline}.tsx
    charts/{ChartFrame,PaymentsVsDebtsChart,MonthlyTrendChart,
            DebtMovementChart,ServiceStatusDonut,TopDebtorsBar,
            SupplierTrendChart}.tsx
    sections/{CustomerAnalytics,SupplierAnalytics,ServiceAnalytics,
              ProductAnalytics,MonthEndSnapshot,AlertsCenter,
              ActivityFeed,ErpModuleMap}.tsx
    QuickActions.tsx                     ← rebuilt
    StatCard.tsx                         ← kept for other pages, superseded by KpiCard here
```

---

## 5. Main dashboard sections

Layout is a single scrolling column of full-width sections on a 12-column grid. Section order is deliberate — it follows the reading order from §3, which differs slightly from the brief's suggested order (alerts moved **up**, above the analytics sections, because an exception the user can't see until they scroll past four charts is not an exception center).

| # | Section | Bilingual heading | Content | Grid (desktop) |
|---|---|---|---|---|
| 1 | Filter bar | — | Range presets, custom range, archived toggle, refresh, last-updated timestamp | Sticky, full width |
| 2 | KPI strip | *(no heading — it's the page header)* | 8 KPI cards with icon + value + delta + sparkline | 4 cols × 2 rows |
| 3 | Quick actions | Quick Actions / إجراءات سريعة | 9 icon buttons | 1 row, wraps |
| 4 | Alerts | Alerts / التنبيهات | Exception groups, ranked by money at risk | 12 cols, internal 3-up |
| 5 | Customer analytics | Customer Analytics / تحليلات الزبائن | Payments-vs-debts line, top debtors bar, debt distribution | 8 + 4 split |
| 6 | Supplier analytics | Supplier Analytics / تحليلات المورّدين | Supplier balance KPIs, payment trend, top balances | 8 + 4 split |
| 7 | Service analytics | Maintenance Analytics / تحليلات الصيانة | Status donut, throughput bar, aging list | 4 + 4 + 4 |
| 8 | Product analytics | Product Analytics / تحليلات المنتجات | Readiness meter, preset usage bar | 6 + 6 |
| 9 | Month-end | End of Month Status / حالة نهاية الشهر | Three-column control panel + movement chart | 12 cols |
| 10 | Activity | Recent Activity / النشاط الأخير | Timeline, 15 items | 7 cols |
| 11 | ERP map | System Modules / وحدات النظام | Module matrix with status chips | 5 cols (beside activity) |

Sections 10 and 11 share a row. Everything else is full width.

**Progressive rendering:** sections 1–3 render from a single fast endpoint. Sections 4–11 each own their query and render a skeleton until ready. One slow section never blocks the page.

---

## 6. KPI card plan

### 6.1 The card anatomy

```
┌──────────────────────────────────┐
│ ┌────┐                           │
│ │icon│  Payments Today           │  ← 14px label, bilingual
│ └────┘  دفعات اليوم               │  ← 11px secondary, muted ink
│                                   │
│  ٤٥٠٫٠٠٠  IQD          ╭─╮  ╭╮   │  ← 28px value + 40px sparkline
│                      ╭─╯ ╰──╯╰─  │
│  ▲ 12% vs yesterday               │  ← delta chip, status-colored
└──────────────────────────────────┘
```

Rules:
- Icon sits in a tinted rounded square (matches existing `StatCard` treatment — visual continuity with the rest of the app).
- The **value** is the hero. Proportional figures, `system-ui`, no tabular-nums (that's for table columns only).
- The **sparkline** is 7 or 30 points depending on range; it is decoration-with-meaning, never labeled, never axis'd.
- The **delta chip** carries an arrow icon *and* a word — never color alone. Direction of "good" is per-metric: rising payments is good, rising debt is not. This must be an explicit `goodDirection: 'up' | 'down' | 'neutral'` field on the card config, not inferred.
- Whole card is a link to the relevant module page with the filter pre-applied.

### 6.2 The eight cards (hard cap)

| # | English | Arabic | Source | Good direction | Links to |
|---|---|---|---|---|---|
| 1 | Collected Today | المبالغ المحصلة اليوم | customer analytics · `paymentsToday` | up | Ledger, today |
| 2 | Customers Paid Today | الزبائن الذين دفعوا اليوم | distinct payer count | up | Ledger, today |
| 3 | New Debts Today | ديون جديدة اليوم | obligations created today | neutral | Receivables |
| 4 | Outstanding Debt | الديون المتبقية | total outstanding balance | down | Receivables |
| 5 | Owed to Suppliers | المستحق للمورّدين | supplier net owed | down | Supplier ledger |
| 6 | Open Service Jobs | طلبات الصيانة المفتوحة | non-terminal job count | neutral | Service |
| 7 | Ready for Pickup | جاهز للاستلام | `READY_FOR_PICKUP` count | neutral | Service, filtered |
| 8 | Active Products | المنتجات النشطة | `isActive: true` count | neutral | Products |

Cards 1–4 are money and form row one. Cards 5–8 are operations and form row two. On tablet the strip becomes 2×4; on mobile it becomes a 2-column grid with the sparkline dropped.

**Metrics deliberately NOT given a card** (they live in their section instead, to avoid card soup): payments this month, debts this month, net change, total customers, customers with debt, overdue count, supplier payments this month, completed jobs this month.

---

## 7. Chart / diagram plan

### 7.1 The chart shortlist

Seven charts. Each is justified by a question from §2. Anything not on this list does not get built.

| Chart | Form | Question answered | Section |
|---|---|---|---|
| **Collections vs New Debt** | Two-series line, daily buckets | "Am I collecting faster than I'm lending?" | Customer |
| **Monthly Comparison** | Grouped bar, last 6 months | "Is this month better than last?" | Customer |
| **Top Debtors** | Horizontal bar, top 8 | "Who owes me the most?" | Customer |
| **Debt Age Distribution** | Stacked horizontal bar, single row | "How much of my book is overdue vs current?" | Customer |
| **Supplier Payment Trend** | Single-series area, daily/monthly | "What's my supplier payment run-rate?" | Supplier |
| **Service Status Distribution** | Donut with center total | "Where are my jobs stuck?" | Service |
| **Debt Movement** | Stacked/waterfall bar: opening → new → collected → adjusted → closing | "How did the book move this month?" | Month-end |

**Rejected forms and why:**
- Heatmap — no genuine two-dimensional density question exists in this data. Rejected per brief.
- Pie for anything other than service status — a donut is only defensible for status because the parts genuinely sum to a meaningful whole (every job is in exactly one state).
- Dual-axis "payments and count" — banned. Count of payers is a KPI card, not a second axis.
- Gauge / speedometer — no target values exist to gauge against.

### 7.2 Form decisions

- **Collections vs New Debt** is a *line*, not an area — two series that cross each other need overlap visibility. 2px strokes, ≥8px markers only on hover, 2px surface ring where they overlap.
- **Top Debtors** is *horizontal* because customer names are long and would clip on a vertical axis.
- **Debt Movement** uses a stacked bar with a 2px surface gap between segments, opening and closing shown as separate anchored bars flanking the movement bar. This reads as ERP control, which is the requirement.
- **Service donut** center holds the total job count as a hero figure — the donut hole is not decoration, it is the headline.

### 7.3 Shared chart chrome

All charts render inside a `ChartFrame` that provides: title (bilingual), optional subtitle, an overflow menu (view as table / export later), a fixed aspect ratio via recharts `ResponsiveContainer`, recessive hairline gridlines, and standard empty/loading/error states.

Grid and axis ink are deliberately recessive: gridline `#e1e0d9`, baseline `#c3c2b7`, tick labels `#898781` at 12px. Series color never bleeds into text — values and legends stay in `#0b0b0b` / `#52514e` with a colored swatch beside them.

### 7.4 Interaction (default, not optional)

- Line and area charts: **crosshair + shared tooltip** listing every series at that x.
- Bar, donut, cell: per-mark hover tooltip.
- Hit targets larger than the visual mark.
- Legend present whenever ≥ 2 series; direct labels on charts with ≤ 4 series so identity never depends on color alone. Single-series charts get no legend box — the title names the series.
- Every chart offers a "view as table" toggle. This is not a nice-to-have: three of the palette slots sit below 3:1 contrast on white (§7.5), and the table view is the documented relief.

### 7.5 Color — computed, not chosen

Series colors use a fixed slot order, assigned by entity and **never** by rank. A filter that removes a series must not repaint the survivors.

| Slot | Hue | Light | Assigned to |
|---|---|---|---|
| 1 | blue | `#2a78d6` | Collections / payments (customer) |
| 2 | orange | `#eb6834` | New debt / obligations |
| 3 | aqua | `#1baf7a` | Supplier payments |
| 4 | yellow | `#eda100` | Supplier debt |
| 5 | magenta | `#e87ba4` | Service / other |

Validated against the app's actual white surface (`#ffffff`, not the reference `#fcfcfb`):

```
Palette (light, surface #ffffff, categorical): 5 slots
  [PASS] Lightness band         all 5 inside L 0.43–0.77
  [PASS] Chroma floor           all 5 >= 0.1
  [PASS] CVD separation         worst adjacent #eda100↔#1baf7a ΔE 9.1 (protan)
  [PASS] Normal-vision floor    worst adjacent #e87ba4↔#eda100 ΔE 19.6
  [WARN] Contrast vs surface    below 3:1 — relief required:
                                #1baf7a 2.82 · #eda100 2.17 · #e87ba4 2.69
  → ALL CHECKS PASS
```

**The contrast WARN is binding, not dismissable.** Relief is already in the plan: every chart ships direct labels and a table view (§7.4). Do not skip this to save time.

Additional color rules:
- **Status colors are reserved** and never used as a series: good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b`. Each ships with an icon + label — warning and serious are sub-3:1 on white by design, and the icon+label pairing is the mitigation.
- **Sequential** (age buckets, readiness meter): single blue hue, light→dark, from the blue ramp. Never a rainbow.
- **Diverging** (net change, over/under): blue ↔ red with a neutral gray midpoint `#f0efec`. Never a hue at the midpoint.
- **Ninth series does not exist.** Top-debtors is capped at 8 with the remainder folded into "Other".

**Dark mode:** the desktop app is currently light-only. The plan defines chart colors as CSS custom properties on a `.viz-root` scope so a dark theme is a values swap, not a rewrite — but dark steps are **not** shipped in v1.1.0 and must be separately validated against the dark surface when they are. An automatic flip is explicitly forbidden.

---

## 8. Quick actions plan

A single row of icon-led buttons, wrapping on narrow screens. Each is a route push, not a modal on the dashboard — the dashboard stays a dashboard.

| Action | Arabic | Icon (lucide) | Target |
|---|---|---|---|
| Add Customer | إضافة زبون | `UserPlus` | `/customers/new` |
| Add Debt | إضافة دين | `FilePlus2` | `/customers?action=add-debt` |
| Record Payment | تسجيل دفعة | `HandCoins` | `/customers?action=record-payment` |
| Add Supplier | إضافة مورّد | `Truck` | `/suppliers/new` |
| Supplier Transaction | حركة مورّد | `ArrowLeftRight` | `/suppliers?action=add-transaction` |
| Add Product | إضافة منتج | `PackagePlus` | `/products/new` |
| Add Service Job | طلب صيانة جديد | `Wrench` | `/service/new` |
| View Ledger | عرض دفتر الحسابات | `BookOpen` | `/ledger` |
| View Reports | عرض التقارير | `FileBarChart` | `/reports` |

Rules:
- Actions are **role-filtered**. Admin-only destinations do not render as dead buttons for non-admin users.
- The existing `quick-action` feature at `frontend/src/features/quick-action/` must be inspected during CP1 — if it already provides an action registry, extend it rather than duplicating it.
- Buttons carry both the icon and the English label always; Arabic sits as a secondary line. Icon-only buttons are forbidden (unlabeled icons are the classic ERP usability failure).

---

## 9. Alerts / exceptions plan

The exception center is the section that most makes this feel like an ERP. It is placed **above** the analytics sections.

### 9.1 Alert catalog

| Alert | Severity | Rule | Drill-through |
|---|---|---|---|
| Overdue customer debts | critical | items with `status = OVERDUE` and remaining > 0 | Receivables, overdue filter |
| Large unpaid balances | serious | customers above a configurable outstanding threshold | Customer detail |
| Suppliers awaiting payment | warning | net owed > 0, ordered by amount | Supplier ledger |
| Aging service jobs | serious | non-terminal jobs older than N days (default 30 — matches the existing `overdue` metric in `ServiceDashboardCards`) | Service, aging filter |
| Jobs at company too long | warning | `SENT_TO_COMPANY` with `sentToCompanyDate` older than N days | Service, filtered |
| Ready but not collected | warning | `READY_FOR_PICKUP` older than N days | Service, filtered |
| Products missing barcode | warning | `isActive = true` and `barcode IS NULL` | Products, filtered |
| Products missing pricing | warning | `isActive = true`, `pricingPresetId IS NULL`, `useCustomPricing = false` | Products, filtered |
| Products missing cost price | warning | `isActive = true` and `costPrice IS NULL` | Products, filtered |

### 9.2 Presentation

Grouped cards, **ranked by money at risk** where money exists, then by count. Each card: severity icon + severity label (never color alone), count, total amount where applicable, and a drill-through link. Top 3 offending records shown inline as a micro-list; the rest behind "view all".

**Thresholds are configuration, not magic numbers.** Define them in one place (`dashboard.config.ts` on the backend) with sensible defaults, and note as an open decision (§19) whether they become admin-editable settings in a later version.

**Empty state matters.** "No alerts — everything is current / لا توجد تنبيهات" with a calm check icon. An empty exception center is good news and should look like it.

---

## 10. Recent activity plan

### 10.1 Source

`ActivityLog` (`schema.prisma:310`) already exists with `action`, `entityType`, `entityId`, `details` (Json), `userId`, `createdAt`, and an index on `createdAt`. The existing `/dashboard/recent-activity` endpoint already reads it.

**CP1 must verify write coverage.** The activity feed is only as good as what writes to it. Confirm whether payments, debts, supplier transactions, service jobs, products, and pricing presets all emit `ActivityLog` rows. Where a domain does not, the choice is:
- **(a)** add the write in that domain (preferred, but expands scope), or
- **(b)** union `ActivityLog` with per-domain `createdAt` reads in the dashboard repository (contained, but duplicates knowledge).

Recommendation: **(b) for v1.1.0**, with (a) tracked as follow-up. The dashboard should not be blocked on instrumenting six other features, and the union is a read-only concern that lives entirely in the dashboard repository.

### 10.2 Presentation

A timeline, 15 items, newest first, grouped by day with "Today / اليوم" and "Yesterday / أمس" headers. Each row: module icon (from the module registry, §15), a one-line human sentence, amount where relevant, relative time, and the acting user. Rows link to the underlying record.

Human sentences are built from a typed formatter map — never by string-concatenating raw `details` JSON. Untyped JSON rendered directly into the UI is how activity feeds turn into noise.

Coverage: customer payment recorded, debt created, installment plan created, supplier transaction added, service job created, service job status changed, service job delivered, product added, pricing preset updated.

---

## 11. End-of-month snapshot plan

This is the ERP control section and needs the most care — it is also where the plan's biggest correctness risk lives.

### 11.1 Layout

Three parallel control columns under one section header, plus a movement chart spanning the full width beneath them.

```
End of Month Status / حالة نهاية الشهر        [ ◀ July 2026 ▶ ]

┌── Customers ──────┐ ┌── Suppliers ──────┐ ┌── Service ────────┐
│ Opening    X      │ │ Opening    X      │ │ Opened      N     │
│ + New      X      │ │ + New      X      │ │ Completed   N     │
│ − Collected X     │ │ − Paid     X      │ │ Pending     N     │
│ ± Adjusted  X     │ │ ± Adjusted X      │ │ Cancelled   N     │
│ ─────────────     │ │ ─────────────     │ │ ─────────────     │
│ = Closing   X     │ │ = Closing   X     │ │ Net open    ±N    │
│                   │ │                   │ │                   │
│ With debt    N    │ │ With balance  N   │ │ Avg days open  N  │
│ Fully paid   N    │ │                   │ │                   │
│ Overdue      N    │ │                   │ │                   │
└───────────────────┘ └───────────────────┘ └───────────────────┘

┌── Debt Movement ──────────────────────────────────────────────┐
│  stacked bar: opening → +new → −collected → ±adjusted →       │
│  closing, with a reconciliation check indicator               │
└───────────────────────────────────────────────────────────────┘
```

### 11.2 Reconciliation invariant

The section must display an explicit **balance check**:

```
opening + new − collected + adjustments == closing
```

If it does not hold, show a visible reconciliation warning rather than silently displaying numbers that don't add up. In an ERP, an unreconciled control panel that *looks* fine is worse than one that admits a discrepancy. This check is also the single most valuable backend test in the whole feature (§16).

### 11.3 The retroactive-corrections problem — read this before implementing

Per the v1.0.4 design decision recorded in project memory, **admin corrections rewrite history by design**, and effective-dating was deliberately deferred. This has a direct and non-obvious consequence for month-end snapshots:

> A month-end snapshot computed live from current data will **change after the month has closed** if an admin corrects a record dated within that month.

Two possible responses:

**Option A — Live recomputation (recommended for v1.1.0).**
The snapshot is always derived from current data at request time. It is internally consistent and always reconciles, but is not immutable — July's closing balance viewed in September may differ from what was viewed in August.
- Pro: no new tables, no migration, consistent with how `monthly-debts` SNAPSHOT mode already works.
- Con: not an audit-grade close.
- **Mitigation: label it.** The section carries an explicit note — "Computed from current records. Retroactive corrections restate closed months." Bilingual. This is honest and cheap.

**Option B — Frozen snapshot rows.**
Persist a `MonthEndSnapshot` record when a month closes.
- Pro: audit-grade, immutable, fast reads.
- Con: requires a migration, a close/freeze workflow, a restatement policy, and an admin UI to trigger or unlock a close. This is its own feature.

**Recommendation: ship Option A in v1.1.0 with the disclosure label, and record Option B as the natural companion to effective-dating whenever that work is picked up.** Do not half-build Option B.

### 11.4 Reuse

`features/reports/monthly-debts/` already computes a SNAPSHOT-mode report with `cutoffDate`, `totalOutstanding`, `totalOverdueAtCutoff`, `totalPaymentsReceivedDuringMonth`, and `customersWithOverdueDebt`. The month-end aggregator should **reuse its balance-at-cutoff logic** rather than write a second implementation. Two independent implementations of "outstanding at cutoff" that drift apart is a guaranteed future bug.

Note that `monthly-debts` routes are `requireRole(['ADMIN'])`. See §19 for the authorization decision this forces.

---

## 12. Backend analytics API plan

### 12.1 Endpoint structure

Domain-sliced rather than one mega-endpoint. Rationale: independent caching, independent refetch intervals, and **partial degradation** — if the supplier aggregator is slow or errors, the customer section still renders. A single `/summary` returning everything makes the whole dashboard as slow and as fragile as its worst query.

All under `/api/v1/dashboard`, all behind `requireAuth` (already mounted at `app.ts:108`).

| Method | Path | Purpose | Refetch |
|---|---|---|---|
| GET | `/overview` | KPI strip only — the 8 headline numbers + sparkline series. Must be fast. | 30s |
| GET | `/customer-financial` | Customer charts, top debtors, age distribution | 60s |
| GET | `/supplier-financial` | Supplier balances, payment trend, top balances | 60s |
| GET | `/service-summary` | Status distribution, throughput, aging | 60s |
| GET | `/product-summary` | Counts, readiness, preset usage | 5 min |
| GET | `/month-end` | Month-end control snapshot | manual |
| GET | `/alerts` | Exception center | 60s |
| GET | `/activity` | Recent activity feed | 30s |

Kept for compatibility, deprecated: `/financial-summary`, `/summary`, `/recent-activity` (§12.6).

### 12.2 Common query contract

```
range          today | week | month | quarter | year | custom     (default: month)
from, to       YYYY-MM-DD, required when range=custom
month          YYYY-MM, /month-end only
includeArchived  boolean, default false
granularity    day | week | month  (chart bucketing; derived from range if omitted)
```

Validated with zod in `dashboard.validator.ts`, following the existing `validate(schema, 'query')` middleware pattern used by `monthly-debts.routes.ts`.

**Range resolution is centralized** in `shared/dashboard-range.ts` and uses `todayInBusinessTimezone()` from the financial domain. Every endpoint resolves the same way. Timezone drift between two dashboard endpoints would be a subtle, expensive bug — one resolver prevents it.

### 12.3 Response envelope

Matching the existing convention (`response.data.data` in `dashboard.api.ts`):

```jsonc
{
  "data": {
    "meta": {
      "businessDate": "2026-08-01",
      "range": { "from": "2026-08-01", "to": "2026-08-01", "preset": "today" },
      "generatedAt": "2026-08-01T09:14:22.000Z",
      "currency": "IQD"
    },
    // ...section payload
  }
}
```

**All money is a decimal string**, produced by `moneyToApiString`. Never a JS number. This is already the convention in `dashboard-financial.types.ts` and must not be broken — floating-point money in an ERP dashboard is a correctness failure, not a rounding annoyance.

### 12.4 Aggregation strategy — the key technical change

Today, `loadFinancialRecords()` pulls every debt, plan, and payment into memory. The rebuild must split aggregation into two classes:

**Class A — pushed to SQL** (`prisma.groupBy` / `aggregate`, indexed):
- Payments summed by `paymentDate` bucket → drives the collections line and the payments KPI
- Distinct payer count per day
- Debts/plans summed by creation date bucket → new-debt line
- Supplier transactions summed by `transactionDate` × `direction`, filtered `status = ACTIVE` → supplier balances and trend (indexes already exist: `@@index([transactionDate])`, `@@index([supplierId, status])`)
- Service jobs counted by `status` and by `serviceCreatedDate` (indexes exist: `@@index([status])`, `@@index([status, serviceCreatedDate])`)
- Product counts and null-field counts
- Preset usage via `groupBy(pricingPresetId)`

**Class B — must stay allocation-aware in the domain layer:**
- Outstanding balance per debt / installment / plan. This requires per-allocation void logic (`isPaymentAllocationVoided`) and cannot be a naive SQL sum.
- Debt and installment status (`OVERDUE` etc.) — derived from `determineDebtStatus` against the business date.
- The `DebtKind.PREPAID_PURCHASE` exclusion — prepaid purchases are excluded from outstanding debt (`dashboard-financial.service.ts:99`, `:223`). **This rule must be preserved in every new customer aggregator.** Getting this wrong silently inflates the headline debt number.

For Class B, scope the load: only load debts/plans that are plausibly open (not cancelled, not fully settled) rather than the entire table, and load allocations only for those. This alone is the bulk of the performance win.

### 12.5 Caching

An in-process TTL cache in `shared/dashboard-cache.ts`, keyed by `endpoint + resolved range + includeArchived`:

| Endpoint | TTL |
|---|---|
| `/overview` | 20s |
| `/customer-financial`, `/supplier-financial`, `/service-summary`, `/alerts` | 45s |
| `/product-summary` | 5 min |
| `/month-end` (closed months) | 15 min |
| `/month-end` (current month) | 60s |

The refresh button sends a cache-bypass header. This is a single-tenant desktop-backed app — an in-process cache is correct and sufficient; do not introduce Redis.

### 12.6 Migration of existing endpoints

- `/financial-summary` — **keep working.** Reimplement it as a thin adapter over the new customer aggregator so the response shape in `dashboard-financial.types.ts` is unchanged. Mark deprecated in code comments. Existing tests (`dashboard-financial.routes.test.ts`, `dashboard-financial.service.test.ts`) must continue to pass unmodified — they are the regression net for this refactor.
- `/summary`, `/recent-activity` — keep; `/recent-activity` becomes an alias for `/activity`.
- Removal is a later version's decision, not this one's.

---

## 13. Frontend UI/UX plan

### 13.1 Layout system

12-column grid, `gap-6`, max content width ~1600px, centered. Consistent with the existing Tailwind v4 setup and the `rounded-xl shadow-sm border border-gray-100` card treatment already used by `StatCard` — the new dashboard should look like an evolution of the app, not a foreign page.

### 13.2 Responsive behavior

| Breakpoint | KPI strip | Charts | Sections |
|---|---|---|---|
| ≥1536px (`2xl`) | 4 across × 2 | side by side, full detail | as specified |
| 1280–1536 (`xl`) | 4 across × 2 | side by side | as specified |
| 1024–1280 (`lg`) | 4 across × 2 | 2-up, reduced height | month-end columns stay 3-up |
| 768–1024 (`md`) | 2 across × 4 | stacked full width | month-end columns 3-up, tighter |
| <768 | 2 across, sparkline hidden | stacked, min 240px height | month-end columns stack; tables → cards |

Desktop-first, as specified. Tables never scroll horizontally on mobile — they become stacked cards.

### 13.3 Section header component

Every section uses the same header: icon + bilingual title + optional secondary count + right-aligned action link. Consistency here is what produces the "professional ERP" read; ad-hoc headings per section are what produces the "hobby project" read.

### 13.4 Icons

`lucide-react` is already a dependency. **Do not add a second icon library**, and do not hand-write inline SVG paths — the current `DashboardPage.tsx` embeds raw SVG path data inline (lines 34–67), which is exactly what the module registry replaces.

All module iconography flows from one registry (§15) so the same module wears the same icon in the KPI strip, the alerts panel, the activity feed, and the module map. That repetition is the visual identity requirement from the brief.

### 13.5 States

Every data-bound component implements four states explicitly:
- **Loading** — skeleton matching the final layout's shape (not a spinner; spinners cause layout shift).
- **Empty** — a sentence explaining what would appear here, bilingual, with a relevant quick action where one exists.
- **Error** — a contained message with a retry button. One failed section must not blank the page. An error boundary per section.
- **Populated** — the real thing.

Skeletons must match final dimensions to avoid cumulative layout shift as the eight queries resolve at different times.

### 13.6 Formatting

Money uses the existing `formatMoney` from `features/customer-financial/utils/financial-format` — do not write a second formatter. Signed values (net change) need a shared `formatSignedMoney`; note that this helper currently exists as a **local function at the bottom of `DashboardPage.tsx`** (line 115) and should be promoted into the shared utils during the rebuild rather than copied.

Dates use the business-date convention already established server-side. The frontend displays, it does not recompute.

### 13.7 Performance

- One `QueryClient` key namespace, `['dashboard', ...]`, so a global refresh is one `invalidateQueries`.
- Charts memoized on their data slice; recharts re-renders are not free.
- Sparkline data arrives with the overview payload — never a separate request per card.
- `refetchInterval` values mirror the backend TTLs in §12.5 so polling never outruns the cache.

---

## 14. Arabic + English label strategy

### 14.1 Approach

**Bilingual labels, not a localized app.** The app does not become RTL. Arabic sits alongside English as a secondary line or parenthetical, styled smaller and in muted ink.

### 14.2 Implementation

A single typed label map in `frontend/src/features/dashboard/config/dashboard-labels.ts`:

```ts
export interface BilingualLabel { en: string; ar: string }
export const dashboardLabels = {
  pageTitle:        { en: 'Dashboard',            ar: 'لوحة التحكم' },
  quickActions:     { en: 'Quick Actions',        ar: 'إجراءات سريعة' },
  customerAnalytics:{ en: 'Customer Analytics',   ar: 'تحليلات الزبائن' },
  supplierAnalytics:{ en: 'Supplier Analytics',   ar: 'تحليلات المورّدين' },
  serviceAnalytics: { en: 'Maintenance Analytics',ar: 'تحليلات الصيانة' },
  productAnalytics: { en: 'Product Analytics',    ar: 'تحليلات المنتجات' },
  monthEnd:         { en: 'End of Month Status',  ar: 'حالة نهاية الشهر' },
  alerts:           { en: 'Alerts',               ar: 'التنبيهات' },
  recentActivity:   { en: 'Recent Activity',      ar: 'النشاط الأخير' },
  systemModules:    { en: 'System Modules',       ar: 'وحدات النظام' },
  // ...KPI and action labels
} as const satisfies Record<string, BilingualLabel>;
```

A `<BilingualLabel>` component renders the pair with correct typography and puts `dir="rtl"` on **the Arabic span only** — never on the container. Scoping direction to the text node is what keeps the layout LTR while the Arabic renders correctly.

### 14.3 Where bilingual labels appear

| Appears | Does not appear |
|---|---|
| Section headings | Chart axis tick labels (space-constrained; would become unreadable) |
| KPI card titles | Tooltip bodies |
| Quick action buttons | Table column headers (English only) |
| Alert category names | Debug/technical strings |
| Month-end row labels | |
| ERP module names | |

### 14.4 User data

User-entered text (customer names, product names, notes, descriptions) keeps `dir="auto"` — already the established pattern. Mixed Arabic/English customer names then render correctly without the app guessing.

---

## 15. ERP roadmap / module map plan

### 15.1 Module registry — one config, many consumers

`frontend/src/features/dashboard/config/module-registry.ts` is the single source of module identity. It feeds the module map widget, the KPI card icons, the alert icons, the activity feed icons, and the quick actions.

```ts
type ModuleStatus = 'LIVE' | 'NEXT' | 'PLANNED';

interface ErpModule {
  key: string;
  label: BilingualLabel;
  icon: LucideIcon;
  status: ModuleStatus;
  route?: string;        // absent for non-live modules
  accent: string;        // module tint, from the categorical slots
}
```

### 15.2 Module map

| Module | Arabic | Icon | Status |
|---|---|---|---|
| Customers | الزبائن | `Users` | LIVE |
| Debts | الديون | `FileText` | LIVE |
| Payments | الدفعات | `HandCoins` | LIVE |
| Installment Plans | خطط التقسيط | `CalendarClock` | LIVE |
| Ledger | دفتر الحسابات | `BookOpen` | LIVE |
| Suppliers | المورّدون | `Truck` | LIVE |
| Supplier Ledger | دفتر المورّدين | `ClipboardList` | LIVE |
| Products | المنتجات | `Package` | LIVE |
| Pricing Presets | إعدادات التسعير | `Tags` | LIVE |
| Service Jobs | طلبات الصيانة | `Wrench` | LIVE |
| Reports | التقارير | `FileBarChart` | LIVE |
| **Inventory** | المخزون | `Warehouse` | **NEXT** |
| **Orders** | الطلبات | `ShoppingCart` | **NEXT** |
| Sales Management | إدارة المبيعات | `TrendingUp` | PLANNED |
| Finance Tracking | التتبع المالي | `Landmark` | PLANNED |

### 15.3 Widget presentation

A tile grid. LIVE tiles are full-color, clickable, and show a live count pulled from the overview payload. NEXT tiles are muted with a "Coming next / قريباً" chip. PLANNED tiles are outlined only, non-interactive.

This does double duty: it is a navigation surface *and* it visibly communicates that the system is a growing ERP — which was an explicit goal in the brief.

**Future-readiness test for the whole design:** adding Inventory later must be (1) flip one registry entry to LIVE, (2) add one analytics slice on the backend, (3) drop one `<DashboardSection>` into the page. If the implementation makes any of those three steps require touching unrelated code, the architecture drifted and should be corrected before shipping.

---

## 16. Testing strategy

Follow the existing vitest setup (`vitest.config.ts` at root; tests co-located as `*.test.ts` / `*.test.tsx`).

### 16.1 Backend — service/aggregation tests (the priority)

Mirroring the structure of `dashboard-financial.service.test.ts`:

**Customer aggregation**
- Payments bucketed to the correct business date across a timezone boundary
- Distinct payer count deduplicates a customer who paid twice in one day
- **Prepaid purchases excluded** from outstanding debt and from new-debt totals *(direct regression guard on the `DebtKind.PREPAID_PURCHASE` rule)*
- Cancelled debts and cancelled plans excluded from outstanding
- Voided payment allocations excluded from balance math
- Overdue classification respects the business date, not the server clock
- Top-debtors ordering is stable and ties break deterministically

**Supplier aggregation**
- `INCREASE_OWED` and `DECREASE_OWED` net correctly
- `status = REMOVED` transactions excluded
- Archived suppliers excluded unless `includeArchived=true`
- Supplier totals are fully independent of customer totals *(the separation test called for in the brief — assert a fixture with both produces no cross-contamination)*

**Service aggregation**
- Every `ServiceJobStatus` value maps to exactly one bucket, and the buckets sum to the total *(guards against a new enum value silently disappearing from the donut)*
- Completed-this-month counts by `completedAt`, not `updatedAt`
- Aging threshold boundary: exactly N days is not yet aging; N+1 is

**Product aggregation**
- Missing-barcode / missing-preset / missing-cost counts, including the `useCustomPricing = true` exclusion from the missing-preset alert
- Preset usage counts, with unused presets present at zero

**Month-end (highest-value tests in the feature)**
- **Reconciliation invariant:** `opening + new − collected + adjustments == closing`, asserted across several fixture months
- Prior-month closing equals current-month opening for a chain of months
- A month with zero activity returns opening == closing, not nulls
- Cross-month payment: a payment dated in month N applied to a debt created in month N−1 lands in the right month on both sides
- Customer counts (with debt / fully paid / overdue) partition the customer set without overlap

**Range resolution**
- Each preset resolves to the expected `from`/`to` against a fixed business date
- Custom range with `from > to` is rejected by the validator

### 16.2 Backend — route tests

Following `dashboard-financial.routes.test.ts` and `monthly-debts.routes.test.ts`:
- Each endpoint returns 200 with the documented envelope shape
- Auth is required (401 unauthenticated)
- Role enforcement matches the decision taken in §19
- Invalid query params return 400 with a useful message
- The deprecated `/financial-summary` returns a byte-compatible shape *(run the existing test file unmodified — this is the refactor's regression net)*

### 16.3 Frontend tests

Extending `dashboard-frontend.test.tsx` with mocked query data:
- Every section renders its heading
- KPI cards render the correct label and formatted value from mock data
- Chart components receive the expected data shape *(assert the transform's output, not the rendered SVG)*
- Quick actions render, and role-restricted actions are hidden for non-admin
- Changing the range filter triggers refetch with the new params
- Loading, empty, and error states render for at least one representative section each
- A failing section does not unmount the rest of the page (error boundary test)
- Bilingual labels render both strings; the Arabic span carries `dir="rtl"`

### 16.4 Explicitly not tested

Per the brief: no snapshot tests of chart SVG output, no pixel/visual regression, no assertions on spacing, shadow, or color class names. These break on every cosmetic change and catch nothing. Responsive behavior is verified manually against the breakpoint table in §13.2 rather than by asserting Tailwind class strings.

---

## 17. What is out of scope

**Not built in this version:**
- Inventory management logic (stock levels, movements, valuation)
- Orders management logic
- Sales workflow
- Finance/accounting engine, chart of accounts, journals
- Tax / VAT
- Payroll
- Branch management (note: `ActivityLog.branchId` exists in the schema but is unused — do not build on it)
- E-commerce sync
- Dashboard export (CSV/PDF) — designed for, not implemented
- Dark mode chart palette — scoped for, not shipped
- Frozen/immutable month-end snapshot tables (§11.3 Option B)
- Admin-editable alert thresholds
- Real-time push updates (polling only)
- Per-user dashboard customization / widget rearrangement

**Built to accommodate them:** the section architecture, the module registry, the analytics-slice pattern, and the range contract are all designed so each of the above is additive.

---

## 18. Implementation checkpoints

Twelve checkpoints, reordered from the brief's suggestion in two places (noted below). Each is independently reviewable and leaves the app working.

### CP1 — Inspect and confirm *(no production code)*
Read the current dashboard backend and frontend, `features/reports/monthly-debts/`, the service jobs summary endpoint, the supplier transactions repository, the products repository, and `frontend/src/features/quick-action/`. Confirm:
- which aggregates already exist and are reusable
- `ActivityLog` write coverage per domain (§10.1)
- whether `quick-action` provides a reusable registry
- the actual performance profile of `loadFinancialRecords()` against a realistic dataset

**Output:** a short findings note. Adjust CP2–CP12 if reality differs from this plan.

### CP2 — Shared dashboard infrastructure *(moved earlier — was implicit)*
`dashboard.types.ts`, `shared/dashboard-range.ts`, `shared/dashboard-cache.ts`, `dashboard.validator.ts`, `dashboard.config.ts` (thresholds). Tests for range resolution.
*Rationale for moving this first: every subsequent aggregator depends on range resolution. Building it inside CP3 and retrofitting the others is the predictable way this goes wrong.*

### CP3 — Customer financial aggregator
`customer/customer-analytics.{repository,service,types}.ts`. SQL-pushed date bucketing; domain-layer balance math; prepaid exclusion preserved. Full test suite per §16.1.

### CP4 — Supplier aggregator
`supplier/supplier-analytics.*`. Net-owed from `SupplierTransaction.direction`, `status = ACTIVE` only. Includes supplier/customer separation tests.

### CP5 — Service and product aggregators
`service/service-analytics.*` and `product/product-analytics.*`. Reuse or extend the existing `/service-jobs/summary` logic rather than forking it.

### CP6 — Month-end aggregator
`month-end/month-end.*`, reusing `monthly-debts` cutoff logic. Reconciliation invariant implemented and tested. Disclosure label text finalized (§11.3).

### CP7 — Alerts aggregator *(new checkpoint — the brief folded this into CP10)*
`alerts/dashboard-alerts.*`. Threshold-driven, config-backed, ranked by money at risk.
*Rationale: alerts are a backend aggregation concern, not a UI concern. Bundling them with the frontend widget work in CP10 would put untested aggregation logic on the critical path of a UI checkpoint.*

### CP8 — Dashboard API surface
`dashboard.routes.ts`, `dashboard.controller.ts`, wire all eight endpoints, apply caching, keep deprecated aliases working. Route tests. **Existing `dashboard-financial` tests must pass unmodified.**

### CP9 — Frontend data layer
`dashboard.queryKeys.ts`, extended `dashboard.api.ts`, extended `types.ts` mirroring backend response types, one hook per endpoint with TTL-matched `refetchInterval`. API-layer tests.

### CP10 — Layout, KPI strip, quick actions, module registry
`module-registry.ts`, `dashboard-labels.ts`, `DashboardSection`, `SectionHeader`, `DashboardFilterBar`, `KpiCard`, `KpiStrip`, rebuilt `QuickActions`. Page renders sections 1–3 with real data; remaining sections stubbed.

### CP11 — Charts and analytics sections
`ChartFrame` plus the seven charts from §7.1, and the four analytics sections. Palette applied as CSS custom properties. Crosshair/tooltip layer. Table-view toggle (this is the contrast relief — not optional).

### CP12 — Month-end, alerts, activity, ERP map, polish, docs
Remaining sections; bilingual pass; responsive pass against §13.2; loading/empty/error states everywhere; error boundaries per section; the three documentation artifacts from §21. Final verification.

**Suggested review gates:** after CP2 (contract), CP8 (backend complete and green), CP10 (visual direction confirmed before charts are built), CP12 (done).

---

## 19. Risks and open decisions

### 19.1 Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Aggregation performance.** The current in-memory approach is already the heaviest read in the app; eight endpoints on 30s polling multiplies it. | High | CP2 caching + CP3 SQL push-down. Measure in CP1 against a realistic dataset before building on top of it. |
| R2 | **Balance-math duplication.** A new aggregator that reimplements outstanding-balance logic will drift from the financial domain and produce two different "truths". | **Critical** | Hard rule: all balance/status math goes through `features/financial/domain/`. Enforce in code review. Any aggregator that imports `Decimal` and does its own subtraction is a review rejection. |
| R3 | **Prepaid-purchase exclusion lost.** The `DebtKind.PREPAID_PURCHASE` filter is easy to miss when writing a fresh aggregator; missing it silently inflates headline debt. | High | Explicit test in CP3. Called out in §12.4. |
| R4 | **Retroactive corrections restate closed months** (§11.3). | Medium | Option A + visible disclosure. Documented, not hidden. |
| R5 | **Activity feed gaps** if `ActivityLog` writes are incomplete. | Medium | CP1 audit; union approach (§10.1 option b) as the contained fallback. |
| R6 | **Chart contrast.** Three palette slots are below 3:1 on white. | Medium | Table view + direct labels, built in CP11. Validator output recorded in §7.5 — re-run if any hex changes. |
| R7 | **Scope creep into inventory/orders.** The module map makes future modules visible and therefore tempting. | Medium | §17 is binding. NEXT/PLANNED tiles are non-interactive by design. |
| R8 | **Electron/desktop rendering.** Charts and the 12-column grid are untested in the packaged desktop shell. | Low–Medium | Verify in the desktop app at CP11, not at CP12. A late discovery here is expensive. |
| R9 | **Eight parallel queries on load** could cause visible layout thrash as they resolve. | Low | Shape-matched skeletons (§13.5); fast `/overview` renders the above-the-fold content first. |

### 19.2 Open decisions — need a call

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Authorization.** `monthly-debts` is ADMIN-only, but the dashboard is the landing page for everyone. | (a) whole dashboard ADMIN-only; (b) all authenticated, financial sections ADMIN-only; (c) all authenticated | **(b)** — non-admins get operations (service, products, activity, quick actions); month-end and top-debtors require ADMIN, consistent with the existing report policy. Needs your confirmation because it changes what staff see on login. |
| D2 | **Month-end immutability** (§11.3) | Live recompute vs frozen snapshots | **Live + disclosure label** for v1.1.0 |
| D3 | **Alert thresholds** | Hardcoded defaults vs admin-configurable | Config constants in v1.1.0; settings UI is a later version |
| D4 | **Default date range on load** | Today vs this month | **This month** — today alone reads as empty most mornings, which makes the dashboard feel broken |
| D5 | **Does the dashboard replace `/reports` navigation?** | Merge vs keep separate | Keep separate; the dashboard links out to reports |
| D6 | **Currency display** | Where does the currency symbol/code come from? | Confirm during CP1 — `formatMoney` already encodes a convention; do not introduce a second one |
| D7 | **Supplier "balance"** — does a supplier credit reduce owed, or is it tracked separately? | Net vs separate | Confirm business intent in CP1 before CP4. `SUPPLIER_CREDIT` with `DECREASE_OWED` suggests netting, but this should be confirmed, not inferred from the enum. |

---

## 20. Exact files likely to change

### 20.1 Backend — new

```
backend/src/features/dashboard/dashboard.routes.ts
backend/src/features/dashboard/dashboard.controller.ts
backend/src/features/dashboard/dashboard.validator.ts
backend/src/features/dashboard/dashboard.types.ts
backend/src/features/dashboard/dashboard.config.ts
backend/src/features/dashboard/shared/dashboard-range.ts
backend/src/features/dashboard/shared/dashboard-range.test.ts
backend/src/features/dashboard/shared/dashboard-cache.ts
backend/src/features/dashboard/customer/customer-analytics.repository.ts
backend/src/features/dashboard/customer/customer-analytics.service.ts
backend/src/features/dashboard/customer/customer-analytics.service.test.ts
backend/src/features/dashboard/customer/customer-analytics.types.ts
backend/src/features/dashboard/supplier/supplier-analytics.{repository,service,types}.ts
backend/src/features/dashboard/supplier/supplier-analytics.service.test.ts
backend/src/features/dashboard/service/service-analytics.{repository,service,types}.ts
backend/src/features/dashboard/service/service-analytics.service.test.ts
backend/src/features/dashboard/product/product-analytics.{repository,service,types}.ts
backend/src/features/dashboard/product/product-analytics.service.test.ts
backend/src/features/dashboard/month-end/month-end.{repository,service,types}.ts
backend/src/features/dashboard/month-end/month-end.service.test.ts
backend/src/features/dashboard/alerts/dashboard-alerts.{repository,service,types}.ts
backend/src/features/dashboard/alerts/dashboard-alerts.service.test.ts
backend/src/features/dashboard/dashboard.routes.test.ts
```

### 20.2 Backend — modified

```
backend/src/routes/dashboard.routes.ts                              ← mount new umbrella router
backend/src/features/dashboard/dashboard-financial.service.ts       ← becomes adapter over new aggregator
backend/src/features/dashboard/dashboard-financial.repository.ts    ← scoped loading, not full-table
backend/src/controllers/dashboard.controller.ts                     ← /recent-activity → alias
backend/src/app.ts                                                  ← only if the mount path changes (likely not)
```

**Not modified** (dashboard reads them, does not change them): `features/financial/**`, `features/suppliers/**`, `features/service/**`, `features/pricing/**`, `prisma/schema.prisma`.

> If a Prisma index turns out to be missing for a hot aggregation query, **stop and raise it** rather than adding a migration — migrations are out of scope for this plan and need their own approval.

### 20.3 Frontend — new

```
frontend/src/features/dashboard/hooks/dashboard.queryKeys.ts
frontend/src/features/dashboard/config/module-registry.ts
frontend/src/features/dashboard/config/dashboard-labels.ts
frontend/src/features/dashboard/components/layout/DashboardSection.tsx
frontend/src/features/dashboard/components/layout/SectionHeader.tsx
frontend/src/features/dashboard/components/layout/DashboardFilterBar.tsx
frontend/src/features/dashboard/components/kpi/{KpiCard,KpiStrip,KpiSparkline}.tsx
frontend/src/features/dashboard/components/charts/ChartFrame.tsx
frontend/src/features/dashboard/components/charts/PaymentsVsDebtsChart.tsx
frontend/src/features/dashboard/components/charts/MonthlyTrendChart.tsx
frontend/src/features/dashboard/components/charts/DebtMovementChart.tsx
frontend/src/features/dashboard/components/charts/ServiceStatusDonut.tsx
frontend/src/features/dashboard/components/charts/TopDebtorsBar.tsx
frontend/src/features/dashboard/components/charts/SupplierTrendChart.tsx
frontend/src/features/dashboard/components/charts/DebtAgeDistribution.tsx
frontend/src/features/dashboard/components/sections/CustomerAnalytics.tsx
frontend/src/features/dashboard/components/sections/SupplierAnalytics.tsx
frontend/src/features/dashboard/components/sections/ServiceAnalytics.tsx
frontend/src/features/dashboard/components/sections/ProductAnalytics.tsx
frontend/src/features/dashboard/components/sections/MonthEndSnapshot.tsx
frontend/src/features/dashboard/components/sections/AlertsCenter.tsx
frontend/src/features/dashboard/components/sections/ActivityFeed.tsx
frontend/src/features/dashboard/components/sections/ErpModuleMap.tsx
frontend/src/features/dashboard/components/BilingualLabel.tsx
frontend/src/features/dashboard/styles/dashboard-viz.css        ← palette custom properties
```

### 20.4 Frontend — modified

```
frontend/src/features/dashboard/pages/DashboardPage.tsx        ← full rebuild
frontend/src/features/dashboard/api/dashboard.api.ts           ← + 6 methods
frontend/src/features/dashboard/hooks/useDashboard.ts          ← + 6 hooks
frontend/src/features/dashboard/types.ts                       ← + response types
frontend/src/features/dashboard/components/QuickActions.tsx    ← rebuilt on registry
frontend/src/features/dashboard/components/RecentActivity.tsx  ← superseded by ActivityFeed; keep or remove per CP12
frontend/src/features/dashboard/dashboard-frontend.test.tsx    ← extended
frontend/src/features/customer-financial/utils/financial-format.ts  ← promote formatSignedMoney here
```

`StatCard.tsx`, `UpcomingDueList.tsx`, `OverdueCustomersList.tsx`, `RecentPaymentsPanel.tsx` — check for use elsewhere before removing. If unused outside the dashboard, delete in CP12; if used, leave alone.

### 20.5 Docs

```
docs/ERP_DASHBOARD_INFORMATION_ARCHITECTURE.md    ← new
docs/ERP_MODULE_MAP.md                            ← new
docs/DASHBOARD_ANALYTICS_DATA_FLOW.md             ← new
README.md                                         ← feature list entry
```

---

## 21. Recommended diagrams and docs

Three documents, each with mermaid diagrams (renders in GitHub and in Claude artifacts without any external library).

### 21.1 `docs/ERP_DASHBOARD_INFORMATION_ARCHITECTURE.md`

Contents: section inventory, KPI catalog with source-of-truth per metric, chart catalog with the question each answers, responsive breakpoint table, bilingual label policy.

**Diagram 1 — Dashboard section hierarchy.** A `graph TD` from `DashboardPage` down through the eleven sections to their backing hooks. Purpose: onboarding — a new contributor sees the whole page structure at once.

**Diagram 3 — KPI / analytics data sources.** A `graph LR` mapping each KPI and chart to its endpoint, its aggregator, and its Prisma models. Purpose: when a number looks wrong, this diagram says where to look. This is the highest-value diagram of the five.

### 21.2 `docs/ERP_MODULE_MAP.md`

Contents: the module registry table (§15.2), icon and accent assignments, module-boundary rules, and the three-step recipe for adding a module (§15.3).

**Diagram 2 — ERP module map.** A `graph TB` grouping LIVE / NEXT / PLANNED with the dependency edges between them (e.g. Orders depends on Inventory and Customers; Sales depends on Orders).

**Diagram 4 — ERP roadmap.** A mermaid `timeline` or `gantt` showing v1.0.x → v1.1.0 (dashboard) → inventory → orders → sales → finance. Purpose: this is the artifact that makes the project read as a growing ERP rather than a set of features — an explicit goal in the brief.

### 21.3 `docs/DASHBOARD_ANALYTICS_DATA_FLOW.md`

Contents: the endpoint table, common query contract, response envelope, caching TTLs, the SQL-vs-domain aggregation split (§12.4), and the deprecation path for the legacy endpoints.

**Diagram 5 — Request/response data flow.** A `sequenceDiagram`: user changes range → hooks invalidate → parallel requests → range resolver → cache check → aggregator → repository (SQL) + financial domain (balances) → response envelope → section render. Purpose: makes the caching and the domain-layer boundary concrete.

**Diagram 6 — Month-end snapshot logic.** A `flowchart` for a given month: resolve boundaries → compute opening from prior cutoff → sum new obligations in range → sum collections in range → sum adjustments → compute closing → assert reconciliation → return, with the failure branch showing the reconciliation warning. Purpose: this is the most subtle logic in the feature and the one most likely to be reimplemented incorrectly later.

**Write these in CP12**, after the implementation settles — diagrams written against a plan rather than against shipped code go stale immediately.

---

## Appendix — quick reference for the implementer

**Five rules that, if violated, mean the implementation is wrong regardless of how it looks:**

1. All balance and status math goes through `backend/src/features/financial/domain/`. No exceptions.
2. `DebtKind.PREPAID_PURCHASE` is excluded from outstanding debt and new-debt totals.
3. Money crosses the API as a decimal string via `moneyToApiString`, never as a number.
4. The frontend never sums rows to produce a headline figure.
5. No dual-axis charts. Ever.

**Plan status:** ready for review. Nothing has been implemented, no files outside this document were modified, no tests were run, no version was bumped.
