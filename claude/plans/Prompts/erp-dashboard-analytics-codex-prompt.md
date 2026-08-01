# Codex Implementation Prompt — ERP Dashboard Analytics

Copy everything below the line into Codex.

---

You are implementing a new feature in the **HomeConnect** repository (Node/Express + Prisma/Postgres backend, React 19 + TypeScript frontend, Electron desktop shell).

## Your source of truth

Read this file first and treat it as the specification:

```
claude/plans/erp-dashboard-analytics-plan.md
```

It contains the full design: information architecture, section layout, KPI catalog, chart catalog, API contract, aggregation strategy, caching, bilingual label strategy, tests, checkpoints, and the exact file list. **Do not redesign it.** If you believe part of it is wrong, stop and say so in your response before writing code — do not silently deviate.

## What you are building

A **backend-authoritative ERP dashboard / لوحة التحكم** that replaces the current four-card page. Eleven sections: filter bar, KPI strip, quick actions, alerts, four analytics sections (customer / supplier / service / product), month-end control panel, activity feed, and an ERP module map.

This version **reads and visualizes existing data only**. It creates no debts, payments, transactions, or jobs. It owns no business rules.

## Non-negotiable rules

1. **All balance and status math goes through `backend/src/features/financial/domain/`.** Use `calculateDebtBalance`, `calculateInstallmentBalance`, `calculateInstallmentPlanSummary`, `determineDebtStatus`, `determineInstallmentStatus`, `isPaymentAllocationVoided`, `sumMoney`, `subtractMoney`, `moneyToApiString`, `todayInBusinessTimezone`, `prismaDateToBusinessDate`, `compareBusinessDates`. Any new aggregator that imports `Decimal` and does its own balance arithmetic is wrong. There must be exactly one implementation of "outstanding balance" in this codebase.

2. **`DebtKind.PREPAID_PURCHASE` is excluded** from outstanding debt totals, from new-debt totals, and from overdue classification. This rule already exists at `dashboard-financial.service.ts:99`, `:223`, and `:249`. Losing it silently inflates the headline debt figure. Write a test that fails if it is lost.

3. **All money crosses the API as a decimal string**, produced by `moneyToApiString`. Never as `number`. No JavaScript float math on money, anywhere, at any layer.

4. **The frontend never computes a headline figure.** No summing a paginated page to produce a total, no deriving a KPI from a chart series, no client-side percentage of a partial list. If a number is on screen, the backend produced it.

5. **No dual-axis charts.** Ever. Two measures of different scale become two charts, small multiples, or an indexed common base. This is the single most common dashboard mistake and it is banned outright.

6. **The existing dashboard tests must pass untouched.** `backend/src/features/dashboard/dashboard-financial.service.test.ts` and `dashboard-financial.routes.test.ts` are your regression net for the aggregator refactor. Reimplement `/financial-summary` as a thin adapter over the new customer aggregator so its response shape in `dashboard-financial.types.ts` is byte-compatible. Do not modify those test files to make them pass.

7. **No new dependencies.** `recharts@^3.10.0` and `lucide-react@^1.26.0` are already installed — use them. Do not add a second chart library, a second icon library, a date library, or a state library.

8. **No Prisma migrations.** The schema is not changing. If a hot aggregation query turns out to need an index that doesn't exist, **stop and report it** — do not add a migration. (The indexes you need most likely already exist: `SupplierTransaction` has `@@index([transactionDate])` and `@@index([supplierId, status])`; `ServiceJob` has `@@index([status])` and `@@index([status, serviceCreatedDate])`; `ActivityLog` has `@@index([createdAt])`.)

9. **Do not convert the app to RTL.** Layout stays LTR. Bilingual labels render the Arabic as a secondary line with `dir="rtl"` on **the Arabic `<span>` only** — never on a container. User-entered text (customer/product names, notes) keeps `dir="auto"`. Numeric money values never get a `dir` attribute.

10. **The chart palette hexes are fixed and already validated** against the app's white surface. Use exactly these, assigned by entity and never by rank:
    ```
    slot 1 blue    #2a78d6  → collections / payments
    slot 2 orange  #eb6834  → new debt / obligations
    slot 3 aqua    #1baf7a  → supplier payments
    slot 4 yellow  #eda100  → supplier debt
    slot 5 magenta #e87ba4  → service / other
    ```
    Three of these sit below 3:1 contrast on white (`#1baf7a` 2.82, `#eda100` 2.17, `#e87ba4` 2.69). The documented relief is **direct labels plus a working "view as table" toggle on every chart** — that toggle is required, not optional. Status colors (`good #0ca30c`, `warning #fab219`, `serious #ec835a`, `critical #d03b3b`) are reserved and never used as a series; each ships with an icon **and** a text label so severity never depends on color alone. A filter that removes a series must not repaint the survivors.

11. **No hand-written inline SVG icon paths.** The current `DashboardPage.tsx` embeds raw SVG path data at lines 34–67 — that is exactly what you are replacing. All module iconography comes from one `lucide-react`-backed registry (`config/module-registry.ts`) so a module wears the same icon in the KPI strip, alerts, activity feed, and module map.

12. **Reuse existing formatters.** `formatMoney` lives in `frontend/src/features/customer-financial/utils/financial-format.ts`. Do not write a second one. `formatSignedMoney` currently exists as a local function at the bottom of `DashboardPage.tsx` (line 115) — **promote it into that shared utils file**, do not copy it.

13. **Range resolution is centralized** in `shared/dashboard-range.ts` and built on `todayInBusinessTimezone()`. Every endpoint resolves ranges through it. Two dashboard endpoints disagreeing about where "today" starts is a subtle and expensive bug.

14. **Hard caps, enforced.** Exactly **8 KPI cards** in the global strip (max 4 per domain section). Exactly the **7 charts** listed in §7.1 of the plan. Top-debtors caps at 8 with the remainder folded into "Other" — there is no 9th categorical series. If you want to add a metric, it goes in its section, not as a 9th card.

15. **Follow existing repo conventions rather than your own.** Mirror `backend/src/features/suppliers/` and `backend/src/features/reports/monthly-debts/` for feature layout (validator/repository/service/controller/routes + co-located `*.test.ts`), the `validate(schema, 'query')` middleware pattern for query validation, and `frontend/src/features/dashboard/` for the frontend feature shape. Card styling stays consistent with the existing `rounded-xl shadow-sm border border-gray-100` treatment — this should look like an evolution of the app, not a foreign page.

## Open decisions, already resolved for you

The plan's §19.2 lists seven. Implement these answers:

- **D1 Authorization — implement option (b):** the dashboard requires auth for everyone; **month-end and top-debtors data are ADMIN-only**, consistent with the existing `requireRole(['ADMIN'])` on `monthly-debts.routes.ts`. Non-admin staff see operations (service, products, activity, quick actions, and their own operational KPIs). Non-admins must not receive admin-only figures in the payload at all — do not send them and hide them client-side. Flag this in your CP8 summary so it can be revisited.
- **D2 Month-end immutability — live recomputation, with the disclosure label.** Do **not** build frozen snapshot tables. The section must carry a visible bilingual note that closed months are computed from current records and are restated by retroactive corrections.
- **D3 Alert thresholds — config constants** in `dashboard.config.ts` with sensible defaults. No settings UI.
- **D4 Default range on load — `month`**, not `today`.
- **D5** Dashboard does not absorb `/reports`; it links out.
- **D6 Currency** — confirm the existing `formatMoney` convention at CP1 and follow it. Do not introduce a second one.
- **D7 Supplier credit netting** — this is a business question, not a code question. Confirm at CP1 and **report your finding before CP4**. The enum pairing (`SUPPLIER_CREDIT` with `DECREASE_OWED`) suggests netting, but confirm rather than infer.

## How to work

Implement the checkpoints in §18 of the plan, **in order**. One checkpoint per commit. Do not start a checkpoint until the previous one's tests pass.

```
CP1   Inspect & confirm (read-only, no code) — report back before proceeding
CP2   Shared infra: types, range resolver, cache, validators, config
CP3   Customer financial aggregator + tests
CP4   Supplier aggregator + tests (incl. customer/supplier separation)
CP5   Service + product aggregators + tests
CP6   Month-end aggregator + reconciliation invariant + tests
CP7   Alerts aggregator + tests
CP8   Dashboard API surface, caching, deprecated aliases + route tests
CP9   Frontend data layer: query keys, api, hooks, types
CP10  Layout, KPI strip, quick actions, module registry, bilingual labels
CP11  ChartFrame + 7 charts + 4 analytics sections + table-view toggle
CP12  Month-end, alerts, activity, ERP map, polish, docs, final verification
```

**Stop and report after CP1.** Your CP1 report must answer, concretely:

1. Which aggregates already exist and are reusable — specifically `GET /api/v1/service-jobs/summary` and the SNAPSHOT-mode cutoff logic in `features/reports/monthly-debts/`.
2. **`ActivityLog` write coverage per domain.** Which of payments, debts, supplier transactions, service jobs, products, and pricing presets actually write `ActivityLog` rows today? Where coverage is missing, use the plan's §10.1 **option (b)** — union `ActivityLog` with per-domain `createdAt` reads inside the dashboard repository. Do **not** go instrument six other features; that is scope creep.
3. Whether `frontend/src/features/quick-action/` already provides a reusable action registry. If it does, extend it rather than duplicating it.
4. The real performance profile of `DashboardFinancialRepository.loadFinancialRecords()` against a realistic dataset. It currently loads **every** debt, plan, and payment into memory.
5. D6 and D7 above.

Then continue through the rest.

## Implementation details that are easy to get wrong

- **Aggregation split.** Push to SQL (`prisma.groupBy` / `aggregate`): payments by `paymentDate` bucket, distinct payer counts, obligations by creation date, supplier transactions by `transactionDate` × `direction`, service jobs by `status` and `serviceCreatedDate`, product counts, preset usage. Keep in the domain layer: per-record outstanding balance and status, which need per-allocation void logic and cannot be a naive SQL sum. For the domain-layer half, **scope the load** — fetch only plausibly-open debts/plans and their allocations, not the whole table. That scoping is most of the performance win.
- **Prisma columns are camelCase** — the schema has no `@map` on columns. Any raw SQL must quote them (`"paymentDate"`, `"transactionDate"`).
- **Supplier balance:** filter `status = ACTIVE` (exclude `REMOVED`), net `INCREASE_OWED` against `DECREASE_OWED`, exclude archived suppliers unless `includeArchived=true`.
- **Service:** count completed-this-month by `completedAt`, **not** `updatedAt`. Every one of the ten `ServiceJobStatus` values must map to exactly one bucket, and the buckets must sum to the total — write that test so a future enum value can't silently vanish from the donut.
- **Products:** the "missing pricing preset" alert must exclude products with `useCustomPricing = true`. Those are configured, not broken.
- **Month-end reconciliation** is the highest-value test in the feature. `opening + new − collected + adjustments == closing` must hold, and prior-month closing must equal current-month opening across a chain of months. If it does not reconcile at runtime, the UI shows a visible warning rather than displaying numbers that don't add up. Reuse the `monthly-debts` cutoff logic — a second independent implementation of "outstanding at cutoff" will drift.
- **Frontend `refetchInterval` values must mirror the backend cache TTLs** in §12.5 of the plan, so polling never outruns the cache. The refresh button sends a cache-bypass header.
- **Every data-bound section implements four states** — loading (shape-matched skeleton, not a spinner), empty, error (with retry), populated — and sits behind its own error boundary. One failed section must not blank the page.
- **Verify in the Electron desktop shell at CP11**, not CP12. A late discovery that charts or the 12-column grid misbehave in the packaged app is expensive.

## Do not

- Do not implement anything in §17 (out of scope): inventory, orders, sales, finance/accounting engine, tax/VAT, payroll, branch management, e-commerce sync, dashboard export, dark-mode chart palette, frozen month-end snapshot tables, admin-editable thresholds, real-time push, per-user widget customization.
- Do not build on `ActivityLog.branchId` — it exists in the schema but is unused.
- Do not make the NEXT/PLANNED module tiles (Inventory, Orders, Sales, Finance) clickable or give them fake data. They are outlined, muted, and inert.
- Do not delete `StatCard.tsx`, `UpcomingDueList.tsx`, `OverdueCustomersList.tsx`, or `RecentPaymentsPanel.tsx` without first checking whether they are used outside the dashboard.
- Do not remove the deprecated `/financial-summary`, `/summary`, or `/recent-activity` endpoints. Keep them working; mark them deprecated in comments.
- Do not add a spinner where a skeleton belongs — spinners cause cumulative layout shift as eight queries resolve at different times.
- Do not bump the version or generate an installer before CP12.

## Verification

Run per-checkpoint tests as you go. At CP12 only, run the full suite once:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

All five must pass. If any fail, fix the cause — do not skip, silence, or weaken a test to make it green. Report the actual output.

## Reporting

After each checkpoint, state briefly: what you built, which tests you ran and their result, and anything in the plan that turned out to be wrong or under-specified. If you had to deviate, say so explicitly and why.
