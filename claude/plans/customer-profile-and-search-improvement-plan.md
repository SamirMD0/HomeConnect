# Customer Profile & Arabic Search Improvement Plan

Status: **Planning only.** No code, migrations, tests, builds, version bumps, or installers are produced by this document.

Repo version at time of writing: root `package.json` = `1.4.0`, with `docs/phases/phase-1-5-0/` in flight. This work is proposed as the **next customer-focused release after 1.5.0 lands** (candidate `1.6.0`). Do not bump anything as part of this plan.

---

## 0. Approved decisions (locked)

Settled by the user; treat as constraints, not options. The checkpoint order in §15 follows the approved priority list.

| # | Decision |
|---|---|
| A1 | **Do not rebuild Arabic token search.** `findSearchMatchIds` + `hc_search_normalize` + the customer `tokenMode: 'AND'` target already satisfy the multi-token requirement. Extend only. |
| A2 | **No `secondaryPhone`, no customer code this phase.** No schema change to `model Customer`. Every UI slot for a second phone is dropped, not stubbed. (Closes D1, D2.) |
| A3 | **No Arabic-Indic digit folding now.** `hc_search_normalize` stays byte-identical to its SQL twin; no `_v2`, no reindex. (Closes D3.) |
| A4 | **Did-you-mean = backend pg_trgm `word_similarity()`**, fired **only when the primary customer search returns zero results**, **max 3** suggestions, **names only**, and **never for phone-shaped queries**. No new extension, no new table, no migration. |
| A5 | **Priority order:** (1) kill the per-row balance requests and feed the list from the existing receivables aggregation → (2) fix receivables search to use the existing Arabic normalization → (3) unify the two `CustomerPicker`s / extract shared customer search logic → (4) then Customer Profile UI and Financial Profile depth. |

One consequence of A5 worth stating up front: unification (3) now lands **before** the search-history and did-you-mean UI, which inverts the original sequencing. This is an improvement — the shared component gets built once, then enhanced once, so history and suggestions reach the Customers page and all four selector call sites in the same change instead of being retrofitted twice.

---

## 1. Version goal

Turn the customer area into the operational centre of HomeConnect.

Three outcomes, in priority order:

1. **The Customer Profile becomes the daily workstation.** An employee opens one screen and can answer "who is this, what do they owe, what is late, what did they pay last" without navigating away — and can add a debt, take a payment, or start an installment plan in place.
2. **The Customers list stops being a name/phone directory.** It shows money: outstanding, overdue, next due, last payment, counts — sortable and filterable, from one backend-authoritative call instead of one request per row.
3. **Arabic search behaves like the names are Arabic.** Token search already works on the main customer list; this release closes the remaining gaps (fields covered, receivables search, selectors) and adds recent-search history plus a conservative "هل تقصد …؟ / Did you mean …?" suggestion.

Non-goals for this version: no external search engine, no accounting rewrite, no change to money math or authorization rules.

---

## 2. Current customer workflow review

This section is what the repository actually does today. Everything below is verified against source, not assumed.

### 2.1 What already exists and is good

**Arabic search infrastructure is already built and is better than the brief assumes.**

- `backend/src/lib/search-normalize.ts` implements lowercase → strip tashkeel `U+064B–U+0652` + tatweel `U+0640` → fold `أ إ آ ٱ → ا`, `ى → ي`, `ة → ه`. It is byte-pinned to the SQL function `hc_search_normalize` from migration `20260801091000_add_search_normalization`, with `search-normalize.test.ts` guarding the contract.
- `backend/src/lib/search-query.ts` (`findSearchMatchIds`) resolves a term to matching row ids using a **frozen target allowlist**, bind parameters only, escaped LIKE metacharacters, an explicit `ESCAPE`, a `MAX_SEARCH_IDS = 2000` cap, and a documented ban on `$queryRawUnsafe`. The `customer` target uses `tokenMode: 'AND'` — every query word must match, any field may satisfy it.
- pg_trgm is enabled (`20260801090000_enable_pgtrgm`) and `customers` has four GIN indexes: `name`, `phone`, `hc_search_normalize(name)`, `hc_phone_normalize(phone)` (`20260801092000_add_search_indexes`).
- `backend/src/lib/search-query.customer.test.ts` already pins `محمد عمار → محمد سالم عمار`, `عمار محمد → محمد سالم عمار`, extra whitespace, and `إحمَد عَمّـار → احمد سالم عمار`.

**Conclusion: the "محمد عمار must find محمد سالم عمار" requirement is already satisfied on `GET /api/v1/customers`.** This plan must not rebuild it. It extends it.

**The per-customer financial summary is already rich.**
`GET /api/v1/customers/:customerId/financial-summary` (`backend/src/features/financial/customer-summary/`) returns `customer`, `summary` (totalOutstanding, singleDebtOutstanding, installmentPlanOutstanding, totalPrepaidAdminDebt, totalPaid, activeDebtCount, activePrepaidCount, activePlanCount, overdueDebtCount, overdueInstallmentCount, nextDueDate, nextDueAmount), `debts[]`, `installmentPlans[]` (with schedule summary), `overdueItems[]` (with `daysOverdue`), `nextDue`, `recentPayments[]` — with query knobs `includeCancelled`, `includePayments`, `paymentLimit`, `debtLimit`, `planLimit`.

**A per-customer receivables aggregation already exists.**
`backend/src/features/financial/receivables/` computes, per customer: `tier` (NO_ACTIVITY → CRITICAL), `tierReason`, `maxOverdueDays`, `totalObligated`, `totalPaid`, `outstanding`, `overdueAmount`, `paidRatioPercent`, `billsTotal`/`billsPaid`, `openDebtCount`, `activePlanCount`, `overdueItemCount`, `nextDueDate`, `lastPaymentDate`, `daysSinceLastPayment`, `paymentCount` — with `search`, `month` (YYYY-MM), `tier[]`, `onlyWithBalance`, `includeInactive`, pagination, and `sortBy` of `standing | outstanding | overdue | name | lastPayment`.

**This is almost exactly the row shape the Customers table needs.** It must be reused, not reinvented.

**The financial profile already has tabs and dialogs.**
`frontend/src/features/customer-financial/components/CustomerFinancialProfile.tsx` (474 lines) has tabs `overview | debts | plans | payments | overdue | legacy` and ships `AddFinancialObligationDialog`, `RecordDebtPaymentDialog`, `RecordPlanPaymentDialog`, `CreateInstallmentPlanForm`, `CancelDebtDialog`, `VoidPaymentDialog`, `ReallocatePaymentDialog`, `FinancialSummaryCards`, `NextDueCard`, `OverdueItemsList`, `RecentPaymentsList`, plus loading/empty/error states.

### 2.2 Real gaps

| # | Gap | Evidence |
|---|-----|----------|
| G1 | **Customers list balance is an N+1 fetch.** Each row mounts `CustomerBalanceCell`, which calls `useCustomerBalance(customerId)` — one HTTP request per visible customer, against the *legacy transactions* balance, not the financial-summary source. | `frontend/src/pages/customers/components/CustomerBalanceCell.tsx` |
| G2 | **Customers table carries no financial signal** beyond that single balance badge. No overdue, no next due, no last payment, no counts. No filters, no sort control, no responsive cards, no bilingual labels (headers are hardcoded English strings). | `frontend/src/pages/customers/CustomersListPage.tsx` |
| G3 | **Receivables search bypasses Arabic normalization entirely.** It filters in memory with `query.search.toLowerCase()` + `haystack.includes(needle)`. `أحمد` will not find `احمد` there. | `backend/src/features/financial/receivables/receivables.service.ts` (`matchesBaseFilters`) |
| G4 | **Customer search covers only `name` + `phone`.** `address` and `notes` are not searchable; the `SEARCH_TARGETS.customer` entry lists `textColumns: [name]`, `phoneColumns: [phone]`. | `backend/src/lib/search-query.ts` |
| G5 | **No secondary phone and no customer code exist in the data model.** `model Customer` has `id, name, phone, address, notes, isActive, createdAt, updatedAt, deletedAt, createdBy, branchId`. The brief assumes both. | `backend/prisma/schema.prisma` |
| G6 | **No search history, no suggestions anywhere.** No "recent searches", no "did you mean". | grep: no matches |
| G7 | **Two divergent CustomerPicker components.** `features/customers/components/CustomerPicker.tsx` (with quick-create) and `features/financial-ledger/components/CustomerPicker.tsx` (simpler, and it does **not debounce** — it queries on every keystroke). Consumers: `GlobalAddObligationDialog`, `GlobalReceivePaymentDialog`, `CreateSalesOrderDialog`, `CreateServiceJobDialog`. | grep for `CustomerPicker` |
| G8 | **Profile header is thin.** No quick actions (only Edit/Delete), no copy-phone, no financial context above the fold, no alerts panel, no unified timeline. Financial actions live *inside* the financial section, below two full-width cards of contact detail. | `frontend/src/pages/customers/CustomerProfilePage.tsx` (202 lines) |
| G9 | **No "this month" view per customer.** Month scoping exists in receivables (`monthToRange`) but is not exposed on the customer summary. | `receivables.service.ts` vs `customer-financial-summary.validator.ts` |
| G10 | **`sortBy` on the customers list is limited to `name | createdAt | updatedAt`.** No financial sorts. | `backend/src/validators/customers.validator.ts` |
| G11 | Debounce is inconsistent: 500 ms on the list page, 300 ms in one picker, 0 ms in the other. | list page / pickers |

### 2.3 Architectural note that shapes several decisions

`ReceivablesRepository.loadReceivableRecords` loads **all** live customers, debts (with allocations), plans (with installments and allocations), and payments into memory on every request, then computes. That is correct and safe at single-shop scale, and it is where the authoritative per-customer aggregates already live. It is also the reason the Customers table must *not* naively call it per keystroke without the existing debounce, and the reason §9 proposes a narrower projection rather than widening this loader.

---

## 3. Customer profile improvement plan

Target layout for `CustomerProfilePage.tsx`, top to bottom:

### 3.1 Header band (`CustomerProfileHeader`)

One card, sticky on scroll at `lg` and up:

- Avatar/initial, **name** (`dir="auto"`, `user-text` class — the existing convention), active/inactive badge, and a **standing badge** reusing the receivables tier vocabulary (`StandingChip` already exists in `features/receivables/components/`).
- Phone with a **copy button** (`navigator.clipboard`, toast confirmation via the existing `react-hot-toast`). Address inline, `dir="auto"`.
- Right side: primary quick actions (§3.3), then an overflow menu holding Edit and Delete so destructive actions stop sitting next to money actions.
- Secondary phone: **dropped** (A2). No placeholder, no conditional slot — the field does not exist and this phase does not add it.

### 3.2 Financial summary strip

A row of compact stat cards directly under the header, fed **only** by `GET /customers/:id/financial-summary` (never computed in the browser):

| Card | Source field |
|---|---|
| Outstanding / الرصيد المتبقي | `summary.totalOutstanding` |
| Total paid / مجموع المدفوع | `summary.totalPaid` |
| Total debt created / إجمالي الديون | **new** `summary.totalObligated` (§9.3) |
| Overdue / متأخر | **new** `summary.overdueAmount` (§9.3) |
| Active debts / الديون النشطة | `summary.activeDebtCount` |
| Active plans / خطط التقسيط | `summary.activePlanCount` |
| Next due / الاستحقاق القادم | `summary.nextDueDate` + `nextDueAmount` |
| Last payment / آخر دفعة | **new** `summary.lastPaymentDate` (§9.3) |

`FinancialSummaryCards.tsx` already exists — extend it rather than adding a parallel component. Keep it to one row that wraps to a 2-column grid on mobile; do not exceed 8 tiles.

### 3.3 Quick actions

Always visible in the header band, permission-gated exactly as today via `isFinancialAdmin(user?.role)` (`features/customer-financial/utils/financial-auth.ts`):

- Add Debt / إضافة دين → opens the existing `AddFinancialObligationDialog` pre-scoped to this customer
- Record Payment / تسجيل دفعة → existing `RecordDebtPaymentDialog` / `RecordPlanPaymentDialog` selection step
- Add Installment Plan / خطة تقسيط → existing `CreateInstallmentPlanForm` path
- View Ledger / عرض دفتر الحسابات → scrolls to / activates the ledger tab
- Edit Customer / تعديل الزبون (overflow)
- Print statement / طباعة كشف — **deferred**, but leave the button slot and a `TODO` anchor; do not build a printer in this release.

Rule: quick actions **reuse the existing dialogs**. No new mutation paths, no new endpoints, no new validation.

### 3.4 Alerts panel (`CustomerAttentionPanel`)

A single amber/red panel that renders only when it has something to say. Each alert derives from summary data the backend already returns — the frontend maps, it does not calculate money:

| Alert | Condition (from summary) |
|---|---|
| Overdue balance | `overdueDebtCount + overdueInstallmentCount > 0` |
| Missed installment | any `overdueItems[]` entry with `type === 'INSTALLMENT'` |
| Long silence | `daysSinceLastPayment > 30` (from the receivables projection, §9.4) |
| Due soon | `nextDueDate` within 7 days of `businessDate` |
| High balance | tier is `SEVERE` or `CRITICAL` (reuse `receivables.tier.ts` — do not invent a second threshold rule) |

Cap at 3 visible alerts + "n more".

### 3.5 Tabs

Consolidate today's six financial tabs and the page's separate sections into one tab strip on the profile:

`Overview` · `Debts` · `Installments` · `Payments` · `Ledger` · `Activity` · `Details & Notes`

- **Overview** — alerts, next due, overdue list, recent payments, month status (§4F).
- **Debts / Installments / Payments** — today's tabs, unchanged behaviour.
- **Ledger** — today's `legacy` tab (`TransactionList`) plus the financial-ledger view; rename the user-facing label, keep the component.
- **Activity** — the new timeline (§3.6).
- **Details & Notes** — the contact/account cards currently occupying prime vertical space move here, freeing the fold for money.
- Service jobs and sales orders sections stay, rendered under Overview or as their own tabs only if they already have content (`CustomerServiceJobsSection`, `CustomerSalesOrdersSection` stay as-is — out of deep scope).

Tab state in the URL query (`?tab=debts`) so a refresh after a mutation returns to the same place.

### 3.6 Timeline / activity

Chronological merged feed built **server-side** (§9.5): debt created, payment recorded, installment paid, plan created, correction/cancellation, void. Each row: date, icon, bilingual event label, amount, actor, and a link to the underlying record. Read-only. Reuse `FinancialCorrectionAudit` for corrections rather than inferring them.

### 3.7 Post-mutation refresh contract

Every quick action must invalidate, on success:
`['customer', id]`, `['customer-financial-summary', id]`, `['customers']`, `['receivables']`, and the new `['customer-activity', id]`. Today `useFinancialMutations.ts` owns this — extend the existing invalidation list; do not add ad-hoc `refetch()` calls in components.

---

## 4. Customer financial profile detail plan

Backend stays authoritative for every number. Frontend formats and groups only.

**A. Balance overview** — the strip in §3.2. Add a "payment health" line reusing the receivables tier + `paidRatioPercent`; no new scoring rule.

**B. Debts** — existing `CustomerDebtsList` gains: grouping by status (Active → Overdue → Paid → Cancelled when `includeCancelled`), an explicit `original / paid / remaining` triplet per row, due date with overdue day count, and row actions (record payment, edit, cancel) already implemented. Add a status filter chip row; keep `includeCancelled` as the existing toggle.

**C. Installments** — plan cards showing `totalAmount`, `totalPaid`, `remainingBalance`, a progress bar from `scheduleSummary.completedInstallments / totalInstallments`, `overdueInstallmentCount`, and `scheduleSummary.nextInstallment`. Expanding a plan shows the schedule (`InstallmentSchedulePreview` / `InstallmentPlanDetails` exist).

**D. Payment history** — `recentPayments[]` with allocation targets (`PaymentAllocationTargetType` already models `DEBT | INSTALLMENT | UNKNOWN`), method, notes, and void state. Show "allocated to" explicitly so a single payment split across obligations reads as one payment, not several.

**E. Ledger / timeline** — one chronological list; a payment appears exactly once with its allocations nested. This is the main defence against the "duplicate payment confusion" the brief calls out.

**F. Month status** — new card on Overview, powered by the new `?month=YYYY-MM` parameter (§9.3):
debt added this month · payments this month · remaining this month · "fully settled this month" flag · last payment date. Month arithmetic must use the existing `monthToRange` / `business-date.ts` helpers on the backend, **not** `Date` math in the browser.

---

## 5. Customers table / list improvement plan

### 5.1 Data source (the key decision)

Replace `CustomerBalanceCell`'s per-row request with **one list call that already carries the money**.

Recommended: extend `GET /api/v1/customers` with `include=financial` (opt-in). When present, the controller enriches the page's customers — and only that page's customers, max 100 — with a financial projection computed by a **new narrow function in the receivables feature** that accepts a customer-id filter. Rationale: the tier/outstanding/overdue rules must have exactly one implementation, and it already lives in `receivables.service.ts` / `receivables.tier.ts`.

Rejected alternatives: a second aggregation in `customers.repository.ts` (two sources of financial truth — unacceptable); pointing the Customers page at `/receivables` wholesale (that page is receivables-shaped, excludes cancelled/inactive by default, and would change the meaning of "the customers list").

### 5.2 Columns

| Column | Notes |
|---|---|
| Name / الاسم | `dir="auto"`, `user-text`; phone as secondary line on narrow screens |
| Phone / الهاتف | copy-on-click |
| Outstanding / الرصيد المتبقي | `BalanceBadge` (exists) |
| Overdue / متأخر | amount + `StandingChip` tier (exists) |
| Debts / الديون | `openDebtCount` |
| Plans / الخطط | `activePlanCount` |
| Last payment / آخر دفعة | relative + absolute date |
| Next due / الاستحقاق القادم | date + amount |
| Status / الحالة | active/inactive |
| Actions | View profile; quick "Record payment" for financial admins |

Ten columns is the ceiling. Anything deeper belongs in the profile or in a row-expand drawer (`ReceivableExpandedPanel` is a working precedent).

### 5.3 Controls

- Search bar with history + suggestions (§6, §8).
- Filter chips: All · With balance · Overdue · No debt · Inactive.
- Sort control: name · outstanding · overdue · last payment · date added. Requires widening `customerQuerySchema.sortBy` (§9.2).
- Page size selector (10/25/50), preserving existing `Pagination`.

### 5.4 Responsive

Below `md`, swap the table for stacked cards: name + status on line one, phone on line two, outstanding + overdue badges on line three, next due / last payment as a muted footer, tap anywhere → profile. `ReceivableMobileCard.tsx` is the pattern to follow.

---

## 6. Search history plan

Scope: **device-local, no database, no new table.** There is no user-preferences table today and this does not justify creating one.

- Module: `frontend/src/features/customers/utils/customer-search-history.ts`, following the existing localStorage convention in `features/products/utils/product-label-settings.ts` — namespaced key, `try/catch` around `JSON.parse`, validate on read, silently fall back to `[]` on malformed data.
- Key: `homeconnect.customer-search-history`.
- Shape: `Array<{ query: string; at: number }>`, newest first, **max 10**, de-duplicated case- and normalization-insensitively (reuse a frontend copy of the normalizer, §7.3), only persisted for queries of length ≥ 2 that actually ran (post-debounce), never for in-flight keystrokes.
- **Stores the query string and timestamp only.** No customer ids, names, balances, or result payloads. This is deliberate: the history must not become an offline copy of customer data.
- UI: chips in a dropdown when the input is focused and empty; each chip re-runs the search; an `×` per chip and a "Clear history / مسح السجل" action. Keyboard: `↓`/`↑` to move through chips, `Enter` to apply, `Esc` to dismiss.
- Where: the Customers page search, and the shared picker (§11). Same module, same key, so a term typed in the picker shows up on the list page.

Do not add per-user server-side history, cross-device sync, or analytics.

---

## 7. Arabic search normalization plan

### 7.1 Do not touch the existing normalizer

`hc_search_normalize` is documented **append-only**: four GIN indexes depend on it, and editing the function body silently invalidates them. Any rule change requires an `hc_search_normalize_v2` plus index migration. **No rule change is proposed in this release.** The existing rules (tashkeel, tatweel, alef variants, `ى→ي`, `ة→ه`) already cover the brief's list.

The one rule the brief raises that is *not* implemented is Arabic-Indic digit folding (`٠١٢٣…` → `0123…`) for phone search. That would require the `_v2` path. **Not in this phase** (A3).

### 7.2 What does change (backend)

1. **Widen the customer search target** (`SEARCH_TARGETS.customer` in `search-query.ts`): add `address` and `notes` to `textColumns`. Cost: `notes` is `@db.Text` and has no trigram index — add one in a small additive migration, or accept the sequential scan at current data size. Recommendation: add the index in the same additive style as `20260805092000_add_product_search_indexes`.
   *Caveat to flag:* adding `notes` means a note mentioning "أحمد" surfaces a differently-named customer. Keep `notes` matching but exclude it from suggestion generation (§8) and consider showing a "matched in notes" hint on the result row.
2. **Fix receivables search** (G3): replace the in-memory `toLowerCase().includes()` in `matchesBaseFilters` with `findSearchMatchIds('customer', search)` resolved once per request into an id set, or — if the in-memory shape must be kept — at minimum apply `normalizeSearchTerm` + `tokenizeSearchTerm` to both needle and haystack with AND-across-tokens. Prefer the first: it makes the Customers list, the profile picker, and receivables agree on what "matching" means.
3. **Phone**: `looksLikePhoneQuery` + `hc_phone_normalize` already give partial, separator-insensitive phone search. No change.
4. **Order-insensitive names**: already delivered by `tokenMode: 'AND'`. No change. Add regression tests only (§13).

### 7.3 Frontend normalization

Add `frontend/src/features/customers/utils/arabic-normalize.ts` mirroring the backend rules, used **only** for: de-duplicating search history, highlighting matched substrings in results, and client-side suggestion ranking if Option B is ever taken. It must never be used to filter results — the server decides matches. Add a test asserting it agrees with the documented rule set so the two copies cannot silently drift.

---

## 8. Did-you-mean suggestion plan

### 8.1 Approach: **backend pg_trgm `word_similarity()`** (locked, A4)

pg_trgm is already installed and `customers` already has a GIN index on `hc_search_normalize(name)`. `similarity()` and `word_similarity()` are therefore available with **zero new dependencies, zero new tables, zero migrations**. Levenshtein would need `fuzzystrmatch`; trigram similarity is sufficient for the target typos and is already indexed.

Option B (frontend Levenshtein over fetched names) is rejected: it requires shipping the name list to the client, which does not scale and leaks data unnecessarily. `fuzzystrmatch` is also rejected — it is a new extension for a capability trigram similarity already provides on an existing index.

### 8.2 Endpoint

`GET /api/v1/customers/search-suggestions?q=<term>&limit=3`

Behaviour:

1. Normalize + tokenize `q` using the existing helpers.
2. **Only run when the primary search returned zero results** (the client passes nothing extra — the controller performs the ordinary `findSearchMatchIds` first and returns `{ suggestions: [] }` immediately if it matched anything). This is the single most important noise control.
3. For each token, compute `word_similarity(token, hc_search_normalize(name))` against live customers, keeping candidates above a threshold.
4. Return at most **3** suggestions: the corrected term plus the count of customers it would find.
5. Never suggest from `notes` or `address` — names only, per the brief.
6. Never suggest for phone-shaped queries (`looksLikePhoneQuery`) — a digit typo must not point at a different person's account. This mirrors the existing rule in `search-query.ts` that phone matching is substring-only and never fuzzy.

Safety: same rules as `search-query.ts` — allowlisted identifiers, bind parameters only, `$queryRawUnsafe` forbidden, hard `LIMIT`.

### 8.3 Thresholds

Start at `word_similarity ≥ 0.45`, require the token to be ≥ 3 characters (`MIN_TRIGRAM_LENGTH` already exports this), and require the suggested term to actually return ≥ 1 customer. Tune against the real seed/customer set during CP4 — the threshold is a constant with a comment, not a config surface.

Expected: `اخمد → احمد`, `مححد → محمد`, `عماؤ → عمار`. Expected non-result: an unrelated query returns nothing rather than the nearest name in the database.

### 8.4 UI

Under the search input, above the empty state:

> No customers found / لم يتم العثور على زبائن
> Did you mean **أحمد**؟ / هل تقصد **أحمد**؟ (12)

Click applies the suggestion, runs the search, and records the *applied* term in history (not the typo). One line, max three suggestions, never shown when results exist.

---

## 9. Backend API / search plan

All changes are additive. No response field is removed or renamed.

**9.1 `SEARCH_TARGETS.customer`** — add `address`, `notes` to `textColumns` (§7.2). Optional additive index migration for `hc_search_normalize(notes)`.

**9.2 `customerQuerySchema`** (`backend/src/validators/customers.validator.ts`) — add:
- `sortBy`: extend to `name | createdAt | updatedAt | outstanding | overdue | lastPayment`
- `include`: optional `'financial'`
- `filter`: optional `withBalance | overdue | noDebt | inactive`
When a financial sort or filter is requested, the request is served through the receivables projection (§5.1); otherwise the existing Prisma path is unchanged.

**9.3 Customer financial summary** — extend `FinancialSummaryTotals` with:
`totalObligated` (total debt created), `overdueAmount`, `lastPaymentDate`, `daysSinceLastPayment`, and an optional `month` block (`debtAdded`, `paid`, `remaining`, `isSettled`) gated behind a new `?month=YYYY-MM` query param validated with the same regex used in `receivablesQuerySchema`. Reuse `monthToRange` and `business-date.ts` — do not write new date logic.

**9.4 Batch financial projection** — new function in the receivables feature: `computeReceivableProjections({ customerIds })`, returning the subset of `ReceivableItemView` the list needs. `receivables.service.ts` and the customers list both call it, so tier and outstanding have exactly one definition. Note the loader currently reads the whole dataset; scoping it by customer id is part of this work and is also a small win for the receivables page itself.

**9.5 Activity timeline** — `GET /api/v1/customers/:customerId/activity?limit=50&cursor=`, merging debts, payments (with allocations), installment payments, plan lifecycle events, and `FinancialCorrectionAudit` rows into one ordered feed. Read-only. If this proves large, it can slip to a follow-up without blocking the rest (see CP7).

**9.6 Suggestions** — §8.2.

**Non-negotiables:** parameterized SQL only; no `$queryRawUnsafe`; identifiers never derived from input; every new endpoint behind `requireAuth`; no change to debt/payment/installment/cancellation business rules.

---

## 10. Frontend UI/UX plan

- **Shared search component** `CustomerSearchInput`: debounced at a single shared constant (**300 ms**, replacing 500/300/0), loading spinner, clear button, history dropdown, suggestion line, `dir="auto"`, `user-text-input` class, full keyboard support, `aria-live` on result-count changes.
- **States**: skeleton rows on first load, `placeholderData` preserved across pages (already in `useCustomers`), explicit empty state distinguishing "no customers yet" from "no match for X", and an error state with retry (`FinancialErrorState` is the precedent).
- **Bilingual labels** go in `frontend/src/shared/labels/business-labels.ts` under the existing `customer` group — never inline in JSX. New keys: outstanding, totalPaid, totalDebt, overdue, nextDue, lastPayment, activeDebts, activePlans, recentSearches, clearHistory, didYouMean, noCustomersFound, addDebt, recordPayment, addInstallmentPlan, viewLedger, copyPhone, thisMonth.
- **Direction**: keep the app LTR. `dir="auto"` on every user-entered value (names, addresses, notes, search input) — the codebase already does this consistently and it must not regress.
- **Visual language**: reuse `components/ui` primitives (`Card`, `Button`, `Table`, `Pagination`, `EmptyState`, `Modal`, `BalanceBadge`, `FormField`, `Input`) and the receivables components (`StandingChip`, `ReceivableMobileCard`, `BillsPaidMeter`). No new design system, no animation library.
- **Anti-goals**: no more than one modal open at a time; no totals recomputed in the browser; no duplicate "outstanding" figure rendered from two different sources on the same screen.

---

## 11. Customer selector reuse plan

Consolidate to **one** `CustomerPicker` in `features/customers/components/`, built on the shared `CustomerSearchInput`:

- Keep the richer component's quick-create flow and duplicate-phone guard.
- Delete `features/financial-ledger/components/CustomerPicker.tsx` and repoint its two consumers (`GlobalAddObligationDialog`, `GlobalReceivePaymentDialog`). It is the un-debounced one, so this also removes a per-keystroke request storm.
- Repoint `CreateSalesOrderDialog` and `CreateServiceJobDialog` — **import swap only**, no behaviour change in those modules (they are out of deep scope).
- The consolidated picker gains, for free: history chips, did-you-mean, consistent debounce, and optional inline balance on each result row (`showBalance` prop, off by default so pickers stay light).
- Preserve the existing `locked` display mode and the `customer-picker.search.test.tsx` contract.

Sequencing (revised per A5): this is now **CP3**, before the history/suggestion UI. Unify first with behaviour held constant — the only intentional change at CP3 is that the ledger call sites gain the shared 300 ms debounce they never had. History and did-you-mean then land once, in CP5, and reach the Customers page and all four selector call sites simultaneously. `customer-picker.search.test.tsx` is the contract that must stay green across CP3.

---

## 12. Admin / permission considerations

No policy changes. Explicitly:

- Financial mutations stay gated by `isFinancialAdmin(user?.role)` on the client and by `financial-policy.ts` / `account-password.ts` on the server. Quick actions on the profile are **presentation only** — they open the same dialogs and hit the same endpoints, so the same admin-password and reason prompts apply.
- Corrections keep flowing through `features/financial/corrections/` with `FinancialCorrectionAudit` written as today. The timeline **reads** audit rows; it never writes them.
- Cancellation and void rules are untouched.
- New endpoints are read-only and require `requireAuth`. Suggestions return name fragments of existing customers to an already-authenticated user — no new exposure — but must still not leak soft-deleted customers (`deletedAt IS NULL` is already the `customer` target's `baseFilter`).
- Search history is device-local and stores query strings only; on a shared workstation a previous employee's typed name could be visible, which is why "Clear history" is a required control and no customer data beyond the typed term is stored.

---

## 13. Testing strategy

### Backend

*Search (extend `search-query.customer.test.ts`)*
- `محمد عمار` → `محمد سالم عمار` ✔ (exists — keep)
- `عمار محمد` → same ✔ (exists — keep)
- extra/collapsed whitespace ✔ (exists — keep)
- `احمد` ↔ `أحمد`, tatweel and diacritics ✔ (exists — keep)
- **new**: match on `address` and `notes`; SQL still contains no raw term
- **new**: partial phone `70123` finds `70 123-456`; phone stays non-fuzzy

*Suggestions (new `customer-suggestions.test.ts`)*
- `اخمد` suggests `احمد` with count > 0
- `مححد` → `محمد`, `عماؤ` → `عمار`
- unrelated query (`زززز`) returns `[]`
- suggestions are empty when the primary search matched
- phone-shaped queries never produce suggestions
- suggestions never draw from `notes`
- max 3 results; parameterized SQL only

*Receivables*
- `أحمد` matches a customer stored as `احمد` (regression for G3)
- token search: `محمد عمار` matches `محمد سالم عمار`

*Customers list*
- `include=financial` returns outstanding/overdue/counts/nextDue/lastPayment
- financial sorts order correctly; filters narrow correctly
- totals from the list projection equal the per-customer summary for the same customer (one source of truth)

*Summary*
- `totalObligated`, `overdueAmount`, `lastPaymentDate` present and correct
- `?month=` scopes the month block only, never the lifetime totals
- existing `customer-financial-summary.service.test.ts` and the DB integration test stay green unchanged

### Frontend

- Customers page renders financial columns and does **not** fire one balance request per row
- Sort/filter controls drive query params
- History: saves after a debounced search, shows on focus, re-runs on click, clears; never stores fewer-than-2-character or non-executed terms
- "هل تقصد أحمد؟" renders for `اخمد`; clicking applies and records the corrected term
- No suggestion line rendered when results exist
- Profile: header quick actions render (and are hidden for non-financial-admin roles); summary cards render from API values; alerts panel appears only with alerts
- Profile refreshes totals after debt / payment / plan mutations
- Arabic names carry `dir="auto"` on list, profile, picker, and search input
- Mobile card layout renders below `md`
- Consolidated picker keeps `customer-picker.search.test.tsx` green

### Manual smoke (run at CP10)

`محمد عمار` → `عمار محمد` → `اخمد` + click suggestion → phone `70123` → open profile → add debt → record payment → create plan → confirm every total moved consistently on profile, list, and receivables → resize to phone width → confirm recent searches persist across a reload and clear correctly.

---

## 14. What is out of scope

Meilisearch / Typesense / Elasticsearch · any global cross-entity search · any cloud or AI service for name correction · `fuzzystrmatch` / Levenshtein extension · **any rebuild of the working Arabic token search (A1)** · **`secondaryPhone` and customer code — no `model Customer` schema change (A2)** · **Arabic-Indic digit folding / `hc_search_normalize_v2` (A3)** · accounting rewrite or new money-calculation engine · changes to debt / payment / installment / cancellation business rules · changes to admin password or audit policy · server-side or cross-device search history · products, suppliers, inventory, POS, dashboard, Electron packaging · deep changes to sales orders and service jobs (import swaps only) · customer statement printing (slot reserved, not built).

---

## 15. Codex implementation checkpoints

Ordered per A5. Each checkpoint is independently reviewable and leaves the app working. Priority-fix checkpoints are CP1–CP3; everything after is the profile work.

**CP1 — Kill the per-row balance requests.** *(Priority fix 1.)*
- Backend: add `computeReceivableProjections({ customerIds })` to the receivables feature — a narrow projection over the existing tier/outstanding computation, scoped by customer id rather than the whole dataset. Add `customerIds` filtering to `loadReceivableRecords`.
- Backend: `include=financial` on `GET /api/v1/customers` (validator + controller + repository), enriching only the current page, max 100 rows.
- Frontend: list columns read from the single list response; **delete `CustomerBalanceCell.tsx`** and its `useCustomerBalance` usage.
- Tests: enrichment shape; list projection equals the per-customer summary for the same customer; page renders with exactly one list request.
- Note: this is the only checkpoint that touches how the list gets money. Do not add filters or sorts here — CP6 owns controls, so a regression here is unambiguous.

**CP2 — Receivables search uses the real normalizer.** *(Priority fix 2.)*
Replace `matchesBaseFilters`' `toLowerCase().includes()` with the existing search behaviour — preferably resolving `findSearchMatchIds('customer', search)` once per request into an id set, so receivables, the customers list, and the pickers agree on what "matching" means. Also widen `SEARCH_TARGETS.customer` with `address` + `notes` (D4 pending, §16) and add the additive `hc_search_normalize(notes)` trigram index. Tests: `أحمد` matches stored `احمد`; `محمد عمار` matches `محمد سالم عمار` through the receivables path.

**CP3 — One CustomerPicker, one search core.** *(Priority fix 3.)*
Extract the shared search logic (`useCustomerSearch` hook + `CustomerSearchInput` shell with the single 300 ms debounce constant). Keep the richer picker's quick-create and duplicate-phone guard; **delete `features/financial-ledger/components/CustomerPicker.tsx`**; repoint `GlobalAddObligationDialog`, `GlobalReceivePaymentDialog`, `CreateSalesOrderDialog`, `CreateServiceJobDialog` — import swaps only. No history, no suggestions yet: this checkpoint is a consolidation, and holding behaviour constant is what makes it safe. `customer-picker.search.test.tsx` stays green.

**CP4 — Did-you-mean endpoint.** `GET /customers/search-suggestions` using pg_trgm `word_similarity()` per A4: zero-result gating in the controller, similarity floor (start `0.45`, tune against real data), `MIN_TRIGRAM_LENGTH` guard, names only, `looksLikePhoneQuery` exclusion, hard cap of 3, suggestion must itself return ≥ 1 customer. Parameterized SQL only. Tests include the noise cases (unrelated query → `[]`, suggestions empty when primary search matched).

**CP5 — Search history + suggestion UI.** `customer-search-history.ts` (localStorage, 10 items, query + timestamp only), `arabic-normalize.ts` for de-duplication and match highlighting, history chips and the did-you-mean line added to the **shared** `CustomerSearchInput` from CP3 — so the Customers page and all four selector call sites get it at once. Tests per §13.

**CP6 — Customers list controls.** Widen `customerQuerySchema.sortBy` with `outstanding | overdue | lastPayment`, add `filter`, then the sort control, filter chips, page-size selector, and the responsive card layout below `md`.

**CP7 — Profile shell.** *(Priority 4 begins.)* Header band with quick actions and copy-phone, summary strip, alerts panel, tab strip with URL state, contact details demoted to their own tab. Layout only — no financial logic, no API change.

**CP8 — Financial profile depth.** Summary API additions (`totalObligated`, `overdueAmount`, `lastPaymentDate`, `daysSinceLastPayment`, `?month=YYYY-MM`), the month-status card, and the richer debts / installments / payments sections. Data only — layout already landed in CP7. Keeping CP7 and CP8 separate is deliberate: never change layout and money display in the same reviewable step.

**CP9 — Activity timeline.** `GET /customers/:customerId/activity` merging debts, payments with allocations, installment payments, plan lifecycle, and `FinancialCorrectionAudit`, plus the Activity tab. **Droppable** — if it proves large, ship the release without it; nothing else depends on it.

**CP10 — Test sweep, docs, verification.** Fill any §13 gap, confirm existing financial suites are untouched and green, update `claude/documentation/` for the new endpoints and params, add the phase folder entry, run the manual smoke list. Version bump / installer only if the user asks.

---

## 16. Risks and open decisions

**Closed decisions:** D1 (secondary phone — **no**, A2), D2 (customer code — **no**, A2), D3 (Arabic-Indic digits — **not this phase**, A3), and the suggestion engine (**pg_trgm `word_similarity()`**, A4).

- **D4 — `notes` in customer search — CLOSED: include it, with an explainable hint.** `notes` joins `textColumns` for matching. Any row matched *only* via notes renders a "matched in notes / مطابقة في الملاحظات" hint so the hit is explainable. `notes` is excluded from did-you-mean generation entirely (A4 already restricts suggestions to names). Lands in CP2.

**No open decisions remain.**

**Risks:**

| Risk | Mitigation |
|---|---|
| Two definitions of "outstanding" appear (list vs profile) | Single `computeReceivableProjections` used by both; a test asserts they agree for the same customer |
| Editing `hc_search_normalize` silently invalidates 4 GIN indexes | Plan forbids editing it; `_v2` path documented but deferred |
| Receivables loader reads the whole dataset per request; the list page now depends on it | Scope the loader by customer id in CP1 — this is the first thing built, before anything depends on it; keep the shared debounce; page size capped at 100 |
| Noisy suggestions erode trust faster than no suggestions | Zero-result gating + similarity floor + max 3 + must-return-results + names only + no phone suggestions |
| Profile becomes crowded — the exact failure the brief warns about | Details/notes demoted to a tab, ≤8 summary tiles, ≤3 visible alerts, one modal at a time |
| Search history readable by the next employee on a shared PC | Query strings only, 10-item cap, prominent clear action |
| Big refactor of a 474-line financial component regresses money display | CP7 changes layout only; CP8 changes data only; never both in one checkpoint |
| Picker consolidation (now early, CP3) breaks sales-order / service-job dialogs | Behaviour held constant at CP3 — import swaps only, enhancements deferred to CP5; `customer-picker.search.test.tsx` is the contract |

---

## 17. Exact files likely to change

**Backend — modify**
- `backend/src/lib/search-query.ts` — customer target gains `address`, `notes`
- `backend/src/lib/search-query.customer.test.ts` — extend
- `backend/src/validators/customers.validator.ts` — sorts, `include`, `filter`
- `backend/src/repositories/customers.repository.ts` — financial-enriched list path
- `backend/src/services/customers.service.ts` — pass-through for new params
- `backend/src/controllers/customers.controller.ts` — enrichment + suggestions handler
- `backend/src/routes/customers.routes.ts` — `/search-suggestions`, `/:id/activity`
- `backend/src/features/financial/receivables/receivables.service.ts` — normalized search; id-scoped projection
- `backend/src/features/financial/receivables/receivables.repository.ts` — `customerIds` filter
- `backend/src/features/financial/receivables/receivables.types.ts` — projection type
- `backend/src/features/financial/customer-summary/customer-financial-summary.{validator,service,repository,controller}.ts` — new totals + `?month=`
- corresponding `*.test.ts` beside each

**Backend — new**
- `backend/src/features/customers/customer-suggestions.{service,test}.ts` (or `backend/src/lib/search-suggestions.ts` alongside `search-query.ts` — pick the one matching the reviewer's preference at CP4)
- `backend/src/features/financial/customer-summary/customer-activity.{service,controller,routes,test}.ts`
- optional additive migration: `hc_search_normalize(notes)` trigram index

**Frontend — modify**
- `frontend/src/pages/customers/CustomersListPage.tsx`
- `frontend/src/pages/customers/CustomerProfilePage.tsx`
- `frontend/src/pages/customers/components/CustomerBalanceCell.tsx` — remove (superseded)
- `frontend/src/features/customers/api/customers.api.ts` — new params, suggestions, activity
- `frontend/src/features/customers/hooks/useCustomers.ts` — new query params + hooks
- `frontend/src/features/customers/components/CustomerPicker.tsx` — build on shared input
- `frontend/src/features/financial-ledger/components/CustomerPicker.tsx` — delete
- `frontend/src/features/financial-ledger/components/GlobalAddObligationDialog.tsx`, `GlobalReceivePaymentDialog.tsx` — repoint import
- `frontend/src/features/sales-orders/components/CreateSalesOrderDialog.tsx`, `frontend/src/features/service/components/CreateServiceJobDialog.tsx` — repoint import
- `frontend/src/features/customer-financial/components/CustomerFinancialProfile.tsx` — tab set, month card
- `frontend/src/features/customer-financial/components/FinancialSummaryCards.tsx` — new tiles
- `frontend/src/features/customer-financial/components/{CustomerDebtsList,InstallmentPlansList,RecentPaymentsList}.tsx` — detail depth
- `frontend/src/features/customer-financial/types/customer-financial.types.ts` — new fields
- `frontend/src/features/customer-financial/hooks/{useCustomerFinancialSummary,useFinancialMutations}.ts` — `month` param, invalidation list
- `frontend/src/shared/labels/business-labels.ts` — new bilingual keys

**Frontend — new**
- `frontend/src/features/customers/utils/customer-search-history.ts` (+ test)
- `frontend/src/features/customers/utils/arabic-normalize.ts` (+ test)
- `frontend/src/features/customers/components/CustomerSearchInput.tsx` (+ test) — shared shell, built at CP3, enhanced at CP5
- `frontend/src/features/customers/hooks/useCustomerSearch.ts` (+ test) — the one search core the list page and every selector call
- `frontend/src/pages/customers/components/{CustomerProfileHeader,CustomerAttentionPanel,CustomerMonthStatusCard,CustomerActivityTimeline,CustomerRowCard}.tsx` (+ tests)

**Docs**
- `claude/documentation/` — new/changed endpoints and query params
- `docs/phases/<next-phase>/` — release notes entry, when the release is actually cut
