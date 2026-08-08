# Lebanese Chart of Accounts — HomeConnect Review & Readiness Plan

**Status:** Review / planning only. No code, migrations, tests, builds, or version changes were made.
**Date:** 2026-08-08
**Repo version at review time:** 1.6.0
**Author role:** Software architecture / ERP-readiness review — **not** accounting, tax, or legal advice.

> **Scope disclaimer (read first).** This document is a *software design* review. Where it proposes account
> codes and Arabic account names, those are a **practical small-business structure inspired by common
> accounting categories**, not official Lebanese statutory codes. The repository contains no chart of
> accounts today, and none was supplied. Any account codes, tax treatment, or statutory report format
> must be confirmed by a Lebanese accountant before being treated as compliant. See §19.

---

## 1. Review goal

Answer four questions about HomeConnect as it stands at 1.6.0:

1. **What is missing** for a chart-of-accounts / structured finance foundation?
2. **What can be added** that is genuinely useful to the business now?
3. **What should be changed** in the current design before accounting structure is layered on?
4. **How does HomeConnect get there without breaking** the existing debt / payment / installment /
   customer workflows that the business runs on every day?

Non-goal: converting HomeConnect into a full statutory accounting package in one release.

---

## 2. Current HomeConnect financial state

### 2.1 How money is tracked today

HomeConnect has **no accounts**. It has *obligations* and *cash events*, joined by an allocation table:

| Concept | Table | Notes |
|---|---|---|
| Customer owes money | `debts` (`Debt`) | `originalAmount`, `dueDate`, `status`, `kind` (`STANDARD` \| `PREPAID_PURCHASE`) |
| Customer owes on a schedule | `installment_plans` + `installments` | `totalAmount`, per-installment `amountDue` |
| Customer paid | `payments` (`Payment`) | `totalAmount`, `paymentDate`, `paymentMethod`, `idempotencyKey` |
| Which obligation the payment settled | `payment_allocations` | links `paymentId` → `debtId` **or** `installmentId` |
| Business owes / pays supplier | `supplier_transactions` | `type` + `direction` (`INCREASE_OWED` / `DECREASE_OWED`) |
| Order-level money | `sales_orders` | `itemsSubtotal`, `deliveryFee`, `totalAmount`, `paidAmount`, `remainingAmount` |
| Service job money | `service_jobs` | `estimatedPrice`, `finalPrice` |
| Legacy | `transactions` (`Transaction`) | older model, still routed at `/api/v1/transactions` |

Everything money-shaped is `Decimal(12,2)` at the database level.

### 2.2 Current finance-like modules

Backend ([backend/src/features/](backend/src/features/)):

- `financial/domain` — money arithmetic, balances, statuses, allocation, installment schedule, business date,
  immutability policy. This is the accounting kernel that already exists.
- `financial/debts`, `financial/installment-plans`, `financial/payments`, `financial/prepaid`
- `financial/ledger` — the "financial ledger" screen feed (debts + plans + payments as rows)
- `financial/receivables` — AR-style aging/tiering per customer
- `financial/customer-summary` — per-customer financial totals
- `financial/corrections` + `financial/authorization` — admin-verified corrections
- `suppliers/*` — supplier transactions, supplier ledger, supplier audits
- `dashboard/dashboard-financial.*`, `dashboard/month-end`, `dashboard/supplier`, `dashboard/sales`
- `reports/monthly-debts`
- `sales/sales-orders`
- `pricing/*` — pricing calculator and presets (cost → price maths; not bookkeeping)

Frontend: [LedgerPage.tsx](frontend/src/pages/LedgerPage.tsx),
[AccountsReceivablePage.tsx](frontend/src/pages/AccountsReceivablePage.tsx),
[ReportsPage.tsx](frontend/src/pages/ReportsPage.tsx),
[PrepaidPurchasesPage.tsx](frontend/src/pages/PrepaidPurchasesPage.tsx),
suppliers, sales-orders, dashboard, customer-financial.

### 2.3 Is the backend authoritative for totals? — **Yes, and this is the project's biggest asset**

Balances are *derived*, not stored. [balances.ts](backend/src/features/financial/domain/balances.ts) computes
`totalPaid` / `remainingBalance` / `isFullyPaid` from non-voided allocations, and every screen consumes the
same serialized strings. The receivables types file even documents that the customers list and the
receivables page must never disagree about what a customer owes. Money crosses the API as **strings**
(`moneyToApiString` → `toFixed(2)`), so no float ever reaches the frontend.

### 2.4 Are money values Decimal-safe? — **Yes**

[money.ts](backend/src/features/financial/domain/money.ts) is a disciplined module: `parseMoney` rejects
non-finite values, >2 decimal places, and values beyond schema precision; add/subtract/multiply/divide/sum
all re-normalize to 2dp; explicit rounding mode on multiply/divide; `moneyToCents` refuses fractional cents.
This is already better than most small ERPs and is directly reusable for debit/credit lines.

### 2.5 Are corrections/audits protected? — **Yes, strongly**

- [immutable-policy.ts](backend/src/features/financial/domain/immutable-policy.ts) encodes the rules:
  payments are never deleted, allocations are never edited, corrections use cancellation/voiding,
  cancel/void require reason + user + timestamp, debts with payments require a dedicated reversal workflow.
- `FinancialCorrectionAudit` stores `beforeValues` / `afterValues` / `affectedTotals` / `reason` /
  `sourceScreen` / `ipAddress`, plus denormalized corrector name & username.
- `AdminVerificationLog` records every admin-password check (`SUCCESS` / `FAILURE` / `LOCKED`).
- Admin password verification ([account-password.ts](backend/src/features/financial/authorization/account-password.ts))
  uses bcrypt compare against the stored hash with attempt throttling; the password is never stored or logged.
- Parallel audit trails exist for sales (`SalesAudit`), service (`ServiceAudit`), suppliers (`SupplierAudit`).
- `PrepaidPurchase` is explicitly documented as delivery-state-only, leaving Debt/Payment/Allocation as the
  immutable financial record.

**Verdict:** the audit/immutability foundation needed for double-entry already exists in spirit. What is
missing is *classification*, not *integrity*.

### 2.6 Are there multiple / duplicated definitions of balance? — **Yes. Four of them.**

This is the central finding of the review.

1. **`sales_orders.paidAmount` is not backed by any `Payment` row.**
   In [sales-orders.service.ts](backend/src/features/sales/sales-orders/sales-orders.service.ts)
   `changePayment` writes `paidAmount` / `remainingAmount` / `paymentStatus` directly from admin input
   (audited and admin-verified, but still a plain column). A cash-at-counter sale therefore records money
   received in `sales_orders` that the `payments` table — and hence the dashboard's `paymentsToday` /
   `paymentsThisMonth` cards and the receivables module — **never sees**. Two answers to "how much cash came
   in today" already exist.
2. **`service_jobs.finalPrice` is financially orphaned.** A grep of `backend/src/features/service/` finds no
   reference to debts or payments. Maintenance revenue is priced but never enters the ledger unless someone
   manually creates a matching debt. Service revenue is currently invisible to finance.
3. **Legacy `Transaction` model** still exists and is still routed (`/api/v1/transactions`,
   [transactions.routes.ts](backend/src/routes/transactions.routes.ts)) with its own
   `TransactionType`/`TransactionStatus`/`amount`/parent-child payment structure — a second, older ledger
   shape parallel to Debt/Payment.
4. **Supplier balance** is a sum over `supplier_transactions.direction`, computed independently of anything
   in the customer-side financial domain. It shares `moneyToApiString` but not the balance engine.

### 2.7 Semantic mismatches with accounting meaning

- **Prepaid purchases are modelled as receivables.** `DebtKind.PREPAID_PURCHASE` creates a `Debt` the
  customer pays *into* before delivery. In accounting terms an undelivered prepayment is a **liability**
  (customer advance / دفعات مقدمة), not an asset. Today it lives in the same table as real receivables.
- **Revenue has no category.** A `Debt` is the de-facto revenue event, and its only classification is a free
  text `description`. Product sales, service revenue, and delivery income cannot be separated.
- **Cash has no location.** `PaymentMethod` (`CASH` / `CARD` / `BANK_TRANSFER` / `OTHER`) is a label on the
  payment, not a balance-carrying account. There is no cash box (صندوق) or bank balance in the system.
- **No expenses exist at all.** Grep for "expense" in the backend returns only pricing inputs
  (`expensePercent`, `customExpensePercent`) — a *margin assumption*, not a recorded cost. Rent, salaries,
  electricity, and delivery costs cannot be entered anywhere.
- **No COGS path.** `Product.costPrice` and `trackStock`/`stockQuantity` exist, but supplier transactions are
  pure money movements with no line items, so purchases never touch stock and stock never values inventory.
- **No fiscal period.** `dashboard/month-end` computes a month movement snapshot on the fly
  (`opening / newAmount / collected / adjustments / closing / reconciled`) — an excellent foundation — but
  nothing is persisted or locked.
- **Currency is implicit.** There is no currency column anywhere. In a Lebanese context USD/LBP dual-currency
  is the norm; this is an unresolved and potentially expensive assumption. See §17.

---

## 3. Lebanese Chart of Accounts direction

What "دليل الحسابات" implies for a system like this:

- A stable, numbered, hierarchical list of accounts, each classified as Asset / Liability / Equity /
  Revenue / Expense (أصول / خصوم / حقوق ملكية / إيرادات / مصاريف).
- Bilingual naming — Arabic is what the owner and the accountant will read; English is what the code and the
  developer will read. Both must be first-class columns, not one translated at render time.
- Every money event eventually expressible as at least one debit and one matching credit.
- The ability to hand an accountant a **trial balance / ميزان مراجعة** and an **account statement / كشف حساب**.

**Practical reading for HomeConnect:** the business does not need statutory reporting from the app today; it
needs the app to stop being the *obstacle* to producing it. That means: classify money events now, so the
history is usable later, rather than retrofitting classification onto years of uncategorised debts.

**Explicitly out of scope of this document:** VAT/TVA registration thresholds, statutory account numbering,
declaration formats, and any claim of compliance.

---

## 4. What is missing

### 4.1 Missing — structural (blocks any chart of accounts)

| # | Missing | Impact |
|---|---|---|
| M1 | `ChartAccount` table (code, nameEn, nameAr, type, parent, active, systemKey) | No accounts at all |
| M2 | Account type taxonomy + normal balance (debit/credit side) rules | Cannot validate direction of any entry |
| M3 | Mapping from HomeConnect event types → accounts | Nothing to post against |
| M4 | Cash / bank accounts as balance-carrying entities | Cannot answer "how much is in the box" |
| M5 | Revenue classification on debts / sales / service | Cannot split product vs service vs delivery income |
| M6 | Any expense recording capability | No P&L, no profit figure, at all |
| M7 | Customer-advance (prepaid) treated as liability, not receivable | AR is overstated by open prepaid balances |
| M8 | Fiscal period / month-close record | Month figures can silently change retroactively |
| M9 | Currency field + rate handling (if dual-currency) | Silent single-currency assumption |

### 4.2 Missing — reporting

| # | Missing |
|---|---|
| M10 | Account statement (كشف حساب) with opening / debit / credit / running balance |
| M11 | Cash movement report (money in vs money out, by method/account) |
| M12 | Expense summary |
| M13 | Revenue report split by source |
| M14 | Trial balance, income statement, balance sheet (later) |
| M15 | General ledger view |

### 4.3 Missing — deferred double-entry pieces (deliberately later)

`JournalEntry`, `JournalEntryLine`, balancing enforcement, entry numbering, posting/approval workflow,
reversal entries, period locking. **These are not needed in the first releases** (see §7).

### 4.4 Present already — do **not** rebuild

Decimal-safe money kernel · derived balances · allocation model · immutability policy · correction audit ·
admin verification + throttling · per-domain audit tables · month-end movement calculator · receivables
aging/tiering · repair/migration history infrastructure.

---

## 5. What can be added

Ordered by value-to-effort for *this* business.

### Tier 1 — pays for itself immediately

1. **Expense entry module (مصاريف).** A simple `Expense` record: date, amount, expense account, paid-from
   cash/bank account, description, attachment-free, admin-audited. This is the single largest missing piece
   of the profit picture and does not touch a single existing workflow.
2. **Cash / bank accounts (الصندوق / المصرف)** with real balances, and payment methods mapped onto them.
   Gives a daily "cash on hand" number that today does not exist.
3. **Chart of Accounts module (دليل الحسابات)** — table + admin page + seeded, editable defaults.
4. **Revenue classification on money-creating events** — a nullable `revenueAccountId` (or `revenueCategory`)
   on `Debt` / `SalesOrder` / `ServiceJob`, defaulted by mapping, editable by admin.

### Tier 2 — structure

5. **Account mapping settings (ربط الحسابات)** — one screen where each event type is bound to a debit and a
   credit account, with a "preview what this will post" panel.
6. **Financial event stream** — an append-only `AccountingEvent` row per money event, carrying
   `sourceType`/`sourceId`/`amount`/`date`/`debitAccountId`/`creditAccountId`. Cheap, additive, and it is the
   raw material for every report below.
7. **Account statement report (كشف حساب)** built on the event stream.
8. **Finance dashboard tab (لوحة المالية)** — cash on hand, collected today/month, receivables, payables,
   expenses this month, revenue this month, estimated profit.

### Tier 3 — later

9. **Monthly closing snapshot (إقفال الشهر)** — persist the existing `MonthEndData` shape per month,
   read-only first.
10. **Maintenance revenue integration** — service job `finalPrice` on completion creates a debt or a
    cash-sale event instead of dying in the service table.
11. **Delivery income / delivery expense** accounts (`SalesOrder.deliveryFee` already exists and is currently
    lumped into the order total).
12. **Journal entries + trial balance** (only after §7 Phase 3–5 are stable).
13. **Inventory / COGS**, once supplier purchases carry line items.

---

## 6. What should be changed

Ranked by risk. **C1–C3 should be fixed before or alongside any chart-of-accounts work**, because posting
rules built on top of them would inherit the defect.

| ID | Change | Why |
|---|---|---|
| **C1** | **Sales-order cash must produce a real cash event.** `sales_orders.paidAmount` should either create a `Payment` (with allocation) or, at minimum, emit an `AccountingEvent` debiting Cash and crediting Sales Revenue. Today it is an unbacked column. | Otherwise the system has two irreconcilable answers to "cash received today", and a chart of accounts built on `payments` alone would under-report revenue and cash. |
| **C2** | **Reclassify prepaid purchases as customer advances.** Keep the existing `Debt`+`PrepaidPurchase` mechanics (they work and are audited) but map them to a **liability** account until `DELIVERED`, and exclude open prepaid balances from receivables totals — or report them on a separate line. | An undelivered prepayment is money owed *by* the business, not *to* it. Today it inflates AR. |
| **C3** | **Give service jobs a financial exit.** On completion/delivery with a `finalPrice`, either create a debt (credit sale) or a cash event. Until then, maintenance revenue is invisible to every finance screen. | The service module is a revenue centre with no ledger connection. |
| **C4** | **Retire or fence the legacy `Transaction` model.** Decide: migrate remaining data into Debt/Payment and remove the route, or freeze it read-only and exclude it from all accounting mapping. | A second ledger shape guarantees a future "which number is right?" incident. Do **not** delete rows — archive/freeze. |
| **C5** | **Align supplier-transaction immutability with the customer side.** `SupplierTransactionStatus.REMOVED` plus a `SupplierAuditAction.DELETE` is weaker than "payments are never deleted". Move supplier corrections to void/reversal semantics with reason + admin verification, matching `immutable-policy.ts`. | Payables will become a mapped account; its history must be as tamper-evident as receivables. |
| **C6** | **One balance engine.** Supplier balances, sales-order remaining amounts, and customer balances should all be derived through shared domain helpers, not three separate summation paths. | Prevents the fourth definition of "outstanding". |
| **C7** | **Never let mapping changes rewrite history.** Account mappings must be *effective-dated or versioned*, and past events keep the accounts they were posted with. | Re-pointing "Sales Revenue" next year must not silently restate last year's reports. This mirrors the known v1.0.4 lesson that retroactive corrections rewriting history is a design decision that must be deliberate, not accidental. |
| **C8** | **Separate operational status from accounting status.** `fulfillmentStatus`, `ServiceJobStatus`, `PrepaidPurchaseStatus` are operational. Whether an event is *posted* is a different axis and needs its own field — do not overload the existing enums. | Otherwise every new operational status becomes an accounting migration. |
| **C9** | **No frontend-derived money.** Enforce as a review rule: any new finance card/report gets its figures from a backend endpoint returning `moneyToApiString` output. Audit `LedgerPage`, sales-order screens, and any new finance dashboard against this. | The backend is authoritative today; keep it that way. |
| **C10** | **No hidden financial side effects.** Mapping/posting must be observable: a preview before enabling, and an inspectable event row after. No silent auto-posting on unrelated actions. | Hidden postings are the classic source of "the numbers moved and nobody knows why". |
| **C11** | **Archive, never delete accounts.** Accounts with any event must be deactivatable only; system accounts (`systemKey` set) must be non-deletable and rename-only. | Deleting a mapped account orphans history. |
| **C12** | **Decide currency explicitly before seeding accounts.** If dual-currency is needed, it must be in the schema from the first migration, not bolted on. | Retrofitting currency onto posted history is one of the most expensive changes possible. |

---

## 7. Recommended accounting approach

**Recommendation: Option 1 (Lightweight Account Mapping Layer) first — with the event stream persisted.**

The repo has **no** journal system today (grep for `journal` / `chartOfAccount` returns nothing), so there is
nothing to preserve compatibility with. Given that, and given the business needs practical results:

### Chosen shape

```
Existing operational modules stay the source of truth
  debts · payments · allocations · installments · supplier transactions · sales orders · service jobs · expenses
                    │
                    ▼
        AccountMapping (eventType → debit account, credit account)   [versioned / effective-dated]
                    │
                    ▼
        AccountingEvent  (append-only, one row per money event, carries the resolved account ids)
                    │
                    ▼
        Account statements · cash report · finance dashboard · month snapshot
```

**Why this and not full double-entry now:**

- Zero behaviour change to the debt/payment workflows the business runs daily — the mapping layer is a
  *reader* of existing tables plus an appended event row.
- The `AccountingEvent` row carries `debitAccountId` + `creditAccountId` + `amount`, which **is** a
  balanced two-line journal entry in compressed form. Upgrading to real `JournalEntry`/`JournalEntryLine`
  later is a mechanical expansion (1 event → 2 lines), not a rewrite.
- It fails safe: if a mapping is missing, the operational workflow still succeeds and the event is flagged
  `UNMAPPED` for later classification, rather than blocking a sale.

**Do not** adopt Option 2 (full double-entry with posting/approval/period locks) until mappings have run
unmodified for at least one full month and the C1–C3 gaps are closed. Building double-entry on top of a
sales module that records cash in an unbacked column would just produce balanced wrong numbers.

---

## 8. Proposed account categories

> **These are a software design proposal, not official Lebanese statutory codes.** Codes are intentionally
> sparse (gaps of 10) so an accountant can insert real ones. All of it must be admin-editable, and the seed
> must be replaceable wholesale by an accountant-provided chart.

| Code | English | Arabic | Type | systemKey |
|---|---|---|---|---|
| **1000** | **Assets** | **الأصول** | ASSET | — |
| 1010 | Cash on Hand | الصندوق | ASSET | `CASH_DEFAULT` |
| 1020 | Bank | المصرف | ASSET | `BANK_DEFAULT` |
| 1100 | Customers Receivable | ذمم الزبائن | ASSET | `AR_DEFAULT` |
| 1200 | Inventory | المخزون | ASSET | *(later)* |
| 1300 | Prepaid Expenses | مصاريف مدفوعة مسبقاً | ASSET | — |
| **2000** | **Liabilities** | **الخصوم** | LIABILITY | — |
| 2010 | Suppliers Payable | ذمم الموردين | LIABILITY | `AP_DEFAULT` |
| 2020 | Customer Advances | دفعات مقدمة من الزبائن | LIABILITY | `CUSTOMER_ADVANCE` |
| 2030 | Taxes Payable | ضرائب مستحقة | LIABILITY | *(only with accountant)* |
| **3000** | **Equity** | **حقوق الملكية** | EQUITY | — |
| 3010 | Owner Capital | رأس المال | EQUITY | — |
| 3020 | Owner Drawings | مسحوبات المالك | EQUITY | — |
| **4000** | **Revenue** | **الإيرادات** | REVENUE | — |
| 4010 | Product Sales | مبيعات المنتجات | REVENUE | `SALES_REVENUE` |
| 4020 | Service Revenue | إيرادات الصيانة | REVENUE | `SERVICE_REVENUE` |
| 4030 | Delivery Income | إيرادات التوصيل | REVENUE | `DELIVERY_INCOME` |
| **5000** | **Cost of Goods Sold** | **تكلفة البضاعة المباعة** | COGS | — |
| 5010 | Product Cost | تكلفة المنتجات | COGS | *(later)* |
| 5020 | Purchase Cost | تكلفة المشتريات | COGS | `PURCHASES` |
| **6000** | **Expenses** | **المصاريف** | EXPENSE | — |
| 6010 | Rent | إيجار | EXPENSE | — |
| 6020 | Electricity | كهرباء | EXPENSE | — |
| 6030 | Salaries | رواتب | EXPENSE | — |
| 6040 | Delivery Expense | مصاريف التوصيل | EXPENSE | — |
| 6050 | Maintenance Expense | مصاريف الصيانة | EXPENSE | — |
| 6060 | Miscellaneous | مصاريف متنوعة | EXPENSE | `EXPENSE_DEFAULT` |
| **7000** | **Discounts & Adjustments** | **الحسومات والتسويات** | CONTRA_REVENUE | — |
| 7010 | Sales Discounts | حسومات المبيعات | CONTRA_REVENUE | `SALES_DISCOUNT` |
| 7020 | Debt Adjustments | تسويات الديون | CONTRA_REVENUE | `DEBT_ADJUSTMENT` |

`systemKey` marks accounts the code depends on: they may be **renamed and re-coded** by the admin, but not
deleted or deactivated while mapped.

---

## 9. Workflow-to-account mapping

Each row is a proposed default `AccountMapping`. "Exists?" says whether the triggering event already has a
clean hook in the current code.

| # | HomeConnect event | Debit | Credit | Exists? |
|---|---|---|---|---|
| 1 | Debt created (`Debt` STANDARD) | 1100 Receivable | 4010 / 4020 (by revenue category) | ✅ `DebtsService` create |
| 2 | Payment recorded + allocated to debt | 1010/1020 Cash or Bank (by `paymentMethod`) | 1100 Receivable | ✅ `PaymentsService` |
| 3 | Installment payment | 1010/1020 Cash | 1100 Receivable | ✅ same allocation path |
| 4 | Installment plan created | 1100 Receivable | 4010 Product Sales | ✅ plan create |
| 5 | Sales order — cash at counter | 1010 Cash | 4010 Product Sales | ⚠️ **C1** — `paidAmount` column only |
| 6 | Sales order — on credit | 1100 Receivable | 4010 Product Sales | ✅ via linked `Debt` |
| 7 | Sales order delivery fee | (part of #5/#6) | 4030 Delivery Income | ⚠️ currently folded into `totalAmount` |
| 8 | Prepaid purchase — money received before delivery | 1010 Cash | **2020 Customer Advances** | ⚠️ **C2** — today posts like a receivable |
| 9 | Prepaid purchase — delivered | 2020 Customer Advances | 4010 Product Sales | ⚠️ needs the `DELIVERED` transition to emit an event |
| 10 | Prepaid remainder debt created on delivery | 1100 Receivable | 4010 Product Sales | ✅ `remainderDebtId` path exists |
| 11 | Supplier debt / purchase | 5020 Purchases (or 1200 Inventory later) | 2010 Payable | ✅ `SUPPLIER_DEBT` |
| 12 | Supplier payment | 2010 Payable | 1010 Cash | ✅ `SUPPLIER_PAYMENT` |
| 13 | Supplier credit / return | 2010 Payable | 5020 Purchases | ✅ `SUPPLIER_CREDIT` |
| 14 | Supplier adjustment | direction-dependent | direction-dependent | ✅ `SUPPLIER_ADJUSTMENT` (needs explicit both-way mapping) |
| 15 | Service job completed with `finalPrice` | 1100 Receivable *or* 1010 Cash | 4020 Service Revenue | ❌ **C3** — no hook at all |
| 16 | Expense paid | 60xx Expense | 1010/1020 Cash | ❌ module does not exist |
| 17 | Debt cancelled (no payments) | reversal of #1 | reversal of #1 | ✅ `assertCanCancelDebt` |
| 18 | Payment voided | reversal of #2 | reversal of #2 | ✅ `assertCanVoidPayment`, `voidedAt` |
| 19 | Correction reducing an amount (discount) | 7010 / 7020 | 1100 Receivable | ✅ `FinancialCorrectionAudit` carries before/after |
| 20 | Owner draws cash | 3020 Owner Drawings | 1010 Cash | ❌ not modelled |

**Reading of this table:** 12 of 20 mappings can be implemented against existing, audited code hooks with no
workflow change. 3 are blocked on C1–C3. 3 need new modules (expenses, owner equity, delivery split).
2 need only a mapping decision.

---

## 10. Data model plan

### Phase 2 entities (now)

```prisma
model ChartAccount {
  id        String   @id @default(uuid()) @db.Uuid
  code      String   @unique              // editable; accountant may replace the whole scheme
  nameEn    String
  nameAr    String
  type      AccountType                   // ASSET LIABILITY EQUITY REVENUE COGS EXPENSE CONTRA_REVENUE
  parentId  String?  @db.Uuid
  parent    ChartAccount?  @relation("AccountTree", fields: [parentId], references: [id])
  children  ChartAccount[] @relation("AccountTree")
  isActive  Boolean  @default(true)
  systemKey String?  @unique              // set => protected from delete/deactivate
  openingBalance Decimal? @db.Decimal(12,2)
  openingBalanceDate DateTime? @db.Date
  notes     String?  @db.Text
  createdById String @db.Uuid
  updatedById String? @db.Uuid
  archivedAt  DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Follow existing repo conventions: `@db.Uuid` ids, `@@map` snake_case table names, `createdById`/`updatedById`
FKs with `onDelete: Restrict`, `archivedAt` + reason rather than deletion, `Decimal(12,2)` for money.

### Phase 3 entities

```prisma
model AccountMapping {
  id              String   @id @default(uuid()) @db.Uuid
  eventType       AccountingEventType   // enum mirroring §9 rows
  debitAccountId  String   @db.Uuid
  creditAccountId String   @db.Uuid
  effectiveFrom   DateTime @db.Date      // C7: versioned, never rewrites history
  effectiveTo     DateTime? @db.Date
  isActive        Boolean  @default(true)
  notes           String?  @db.Text
  createdById     String   @db.Uuid
  @@index([eventType, effectiveFrom])
}

model AccountingEvent {              // append-only. never updated, never deleted.
  id              String   @id @default(uuid()) @db.Uuid
  eventType       AccountingEventType
  sourceType      AccountingSourceType   // DEBT PAYMENT ALLOCATION SUPPLIER_TX SALES_ORDER SERVICE_JOB EXPENSE PREPAID CORRECTION
  sourceId        String   @db.Uuid
  eventDate       DateTime @db.Date
  amount          Decimal  @db.Decimal(12,2)
  debitAccountId  String?  @db.Uuid      // null while UNMAPPED
  creditAccountId String?  @db.Uuid
  status          AccountingEventStatus  // RECORDED | UNMAPPED | REVERSED
  reversesEventId String?  @db.Uuid      // reversal instead of edit
  description     String
  createdById     String   @db.Uuid
  createdAt       DateTime @default(now())
  @@index([eventDate]) @@index([sourceType, sourceId]) @@index([debitAccountId, eventDate]) @@index([creditAccountId, eventDate]) @@index([status])
}
```

### Phase 2/3 supporting entity (Tier-1 value)

```prisma
model Expense {
  id            String   @id @default(uuid()) @db.Uuid
  expenseDate   DateTime @db.Date
  amount        Decimal  @db.Decimal(12,2)
  accountId     String   @db.Uuid        // 60xx
  paidFromAccountId String @db.Uuid      // 1010/1020
  description   String
  reference     String?
  notes         String?  @db.Text
  voidedAt      DateTime?                 // void, never delete — mirrors Payment
  voidedById    String?  @db.Uuid
  voidReason    String?  @db.Text
  createdById   String   @db.Uuid
  createdAt     DateTime @default(now())
}
```

### Phase 6 entities (deferred — design now, build later)

`JournalEntry` (entryNumber, entryDate, sourceType/sourceId, description, status, createdBy, approvedBy) and
`JournalEntryLine` (journalEntryId, accountId, debit, credit, description) exactly as sketched in the brief.
**Do not build these in the same release as the chart of accounts.**

### Deliberately *not* added now

Fiscal period locking tables · multi-currency rate tables (unless §17-D says yes) · inventory movement
ledger · tax tables. Each is a separate decision.

---

## 11. UI/UX plan

Follow existing page conventions (bilingual labels via `frontend/src/shared/labels/`, admin-gated actions,
mobile card + desktop table pattern already used by `LedgerTable` / `LedgerMobileCard`).

### 11.1 Chart of Accounts — دليل الحسابات
New page under Settings or a new "Finance" section. Tree view by type with expand/collapse; search by code
or name (both languages); filter by type and active/inactive; badges for **system** accounts; create / edit /
archive; account detail drawer showing balance and recent events. Archive requires reason. System accounts
show a lock badge and disable the archive control.

### 11.2 Account Mapping — ربط الحسابات
One row per event type from §9, each with debit and credit account pickers, an effective-from date, and a
**"What this will post" preview** showing a worked example in both languages before saving. Defaults section
for: cash account, bank account, receivables, payables, sales revenue, service revenue, discount, default
expense. Admin password required to save (§13).

### 11.3 Account Statement — كشف حساب
Account picker + date range → opening balance, then rows of date / description / source link / debit /
credit / running balance, closing balance. Source link navigates back to the debt/payment/order. Print and
export reusing whatever the reports module already uses.

### 11.4 Finance Dashboard — لوحة المالية
New dashboard tab (existing dashboard already has financial/supplier/sales/month-end services to extend):
cash on hand, collected today, collected this month, receivables outstanding, payables outstanding,
expenses this month, revenue this month, estimated profit *(clearly labelled "estimate")*, top debtor
customers, supplier payable summary.

### 11.5 Month Closing — إقفال الشهر
**Read-only snapshot in v1.** Reuse the existing `MonthEndData` shape (`opening / newAmount / collected /
adjustments / closing / reconciled`), extended per account, persisted per month with a "generated at"
stamp. No locking, no irreversible close, until the user explicitly asks for it (§17-F).

### 11.6 Expenses — المصاريف
Simple list + add form. Date, amount, expense account, paid from, description. Void with reason; no delete.

---

## 12. Reports plan

**Near-term (achievable on existing + Phase 3 data):**

- Customer receivables report — *mostly exists* (`financial/receivables`); needs prepaid excluded (C2)
- Supplier payables report — extend `dashboard/supplier` analytics
- Cash movement report — **new**, requires C1 so counter sales appear
- Account statement — **new** (§11.3)
- Monthly collection report — extend `reports/monthly-debts`
- Monthly debt report — *exists*
- Sales revenue report — needs C1 + revenue categories
- Expense summary — needs the expense module
- **Profit estimate — only after** expenses exist *and* product costs are trusted; must be labelled
  "estimate / تقديري" in the UI

**Later:** trial balance · income statement · balance sheet · general ledger · any VAT/tax report
(accountant-guided only).

**Rule:** every report shipped before accountant validation carries a visible disclosure line — the
month-end module already does exactly this with its bilingual `disclosure` field. Reuse that pattern.

---

## 13. Admin / audit / safety plan

Reuse what exists rather than inventing a parallel mechanism:

- **Admin password required** for: editing account mappings, editing/archiving accounts, changing a system
  account, voiding an expense, and any manual accounting adjustment. Route through the existing
  `verifyAdminPasswordForCorrection` / `requireAdminVerification` path so attempts land in
  `AdminVerificationLog` with `SUCCESS`/`FAILURE`/`LOCKED`.
- **Reason required** on every account/mapping mutation, stored with before/after JSON — mirror
  `FinancialCorrectionAudit`. Add an `AccountingAudit` table following the `SupplierAudit` / `SalesAudit`
  shape rather than overloading the financial correction table.
- **Never store or log the admin password.** Already true; keep it true — do not add mapping-change logs that
  echo request bodies.
- **Archive, never delete.** Accounts with events are archive-only; system accounts are protected.
- **Append-only events.** `AccountingEvent` rows are never updated or deleted; corrections create a reversing
  event linked by `reversesEventId`. This extends `FINANCIAL_IMMUTABILITY_RULES` rather than contradicting it.
- **No hidden effects.** Mapping preview before save; every posted event traceable to `sourceType`/`sourceId`;
  an "unmapped events" queue visible to admins instead of silent drops.
- **Backend authoritative.** All balances and statements computed server-side and serialized via
  `moneyToApiString`.
- **No destructive SQL. No migration reset.** See §14.

---

## 14. Migration / release safety

Follow the existing convention (`backend/prisma/migrations/` + `backend/prisma/repair/*.sql` +
`manifest.json` + the `RepairHistory` append-only table, `RepairStatus` including `BLOCKED_NO_BACKUP`).

- **Additive migrations only** — new tables and nullable columns. No drops, no renames of existing money
  columns, no type changes on `Decimal(12,2)` fields.
- **No `prisma migrate reset`.** Ever.
- Any backfill (e.g. seeding default accounts, classifying historical debts) goes in a **repair SQL** with a
  checksum entry in `manifest.json`, is **idempotent**, and is verified by the existing SQL safety scanner
  (`backend/src/features/maintenance/sql-safety-scanner.ts`).
- **Backup before migration** — the repair pipeline already enforces `PRE_REPAIR` backup and records
  `backupPath`; do not bypass it.
- **Historical classification defaults to unmapped, not guessed.** Do not retro-assign revenue accounts to
  years of existing debts by heuristic. Leave them `UNMAPPED` and let the admin classify, or classify only
  from a chosen start date.
- **Do not mix this work with the scanner-hub / mobile-LAN branch** or with unrelated product/label changes.
  This is a schema-touching finance release and should ship on its own.
- **Business PC caution:** per project history, that machine's schema was built by hand-run repair scripts,
  so its migration state is not equivalent to a clean install. Verify its migration/repair history *before*
  shipping any accounting migration to it, and plan a repair-SQL path for it specifically.
- Final pre-bump review, then a single version bump at release — not per-phase.

---

## 15. Testing plan

### Backend
- Account code uniqueness; code format accepted/rejected
- Account tree: parent must exist, no cycles, type inheritance rules
- Cannot archive a system account; cannot archive an account with events; rename of system account allowed
- Mapping resolution picks the mapping effective on the **event date**, not today (C7)
- Event emitted for: debt create, payment + allocation, installment payment, supplier debt, supplier payment,
  sales order cash, sales order credit, prepaid receipt, prepaid delivery, expense, correction/discount
- Reversal: voiding a payment emits a reversing event; original event is unchanged
- Unmapped event path: workflow succeeds, event recorded with `UNMAPPED`, nothing is silently dropped
- Decimal safety: every new money path goes through `parseMoney`; reject 3dp, non-finite, over-precision
- Account statement running balance = opening + Σdebits − Σcredits, per account type sign convention
- Admin password required for mapping/account mutations; failure and lockout logged
- Audit row written with before/after for every account and mapping change
- **Regression guard (critical):** existing debt/payment/installment/receivables/ledger/supplier suites must
  pass unchanged — the mapping layer must not alter a single existing balance. Add an explicit test that
  receivables totals are byte-identical before and after events are enabled.
- Prepaid balances excluded from receivables totals (C2) with an explicit assertion

### Frontend
- Chart of Accounts tree renders, expands, filters by type and active state
- Create/edit form validates code, both names, type, parent
- System account shows lock badge and disabled archive
- Mapping settings render all event types; preview panel shows the worked example
- Account statement filters (account + date range) drive the request correctly
- Arabic and English account labels both render (RTL-safe)
- Finance dashboard cards render, including zero/empty states
- Money is rendered from API strings, never recomputed client-side

### Manual
Create account → edit → archive non-system → attempt to edit protected system account → set mappings →
add a debt → record a payment → check the account statement reflects both → record a cash sales order →
confirm it now appears in the cash report → add a supplier transaction and payment → add an expense →
open the monthly snapshot → export/print a statement → verify all existing screens still show the same
customer balances as before the release.

---

## 16. Implementation roadmap

| Phase | Content | Ships? |
|---|---|---|
| **P1 — Definitions & fixes** | Confirm §17 decisions. Fix **C1** (sales-order cash → real cash event), **C2** (prepaid = liability, out of AR), **C3** (service job financial exit). Decide **C4** legacy `Transaction`. No new tables. | Yes — valuable on its own |
| **P2 — Chart of Accounts** | `ChartAccount` table + seeded editable defaults + admin page + system-account protection + audit. No mappings, no events yet. | Yes |
| **P3 — Expenses + cash accounts** | `Expense` module, cash/bank accounts with balances, payment-method → account binding. First real profit inputs. | Yes |
| **P4 — Mappings + event stream** | `AccountMapping` (effective-dated) + `AccountingEvent` emission from all §9 hooks + unmapped queue + mapping preview UI. **Zero change to operational workflows.** | Yes |
| **P5 — Statements & finance dashboard** | Account statement, cash movement report, finance dashboard tab, expense summary, revenue report. | Yes |
| **P6 — Month snapshot** | Persist month-end per account, read-only. | Yes |
| **P7 — Journal entries** | Only if still wanted after P4–P6 run for a full month: `JournalEntry`/`JournalEntryLine`, trial balance, reversal entries, optional period lock. | Later |

Each phase is independently releasable and independently valuable. **P1 is a prerequisite for P4** — do not
build mappings on top of the unbacked `paidAmount` column.

---

## 17. Risks and open decisions

### Risks

| R | Risk | Mitigation |
|---|---|---|
| R1 | **Two cash truths** (`payments` vs `sales_orders.paidAmount`) get baked into accounting reports | Fix C1 in P1, before P4 |
| R2 | **Prepaid inflates receivables**, so AR-based reports are already overstated | C2 in P1, with an explicit test |
| R3 | **Retroactive mapping changes restate history** | Effective-dated mappings (C7); events store resolved account ids |
| R4 | **Currency assumption** — no currency column anywhere; dual-currency retrofit after posting is very expensive | Decide D-4 **before** P2 migration |
| R5 | Scope creep from "chart of accounts" into full statutory accounting | Phase gates; P7 explicitly deferred |
| R6 | Business PC schema drift (built via hand-run repairs) breaks the migration | Verify its repair history before release; dedicated repair SQL path |
| R7 | Reports shipped before accountant review are mistaken for compliant statements | Bilingual disclosure banner on every finance report, reusing the month-end `disclosure` pattern |
| R8 | Legacy `Transaction` model resurfaces as a third set of numbers | C4 decision in P1 |
| R9 | Regression in daily debt/payment work — the thing the business actually depends on | Mapping layer is read-plus-append only; full existing test suite must pass byte-identical balances |

### Open decisions for the user

| # | Decision | Recommendation |
|---|---|---|
| **D-1** | Full Chart of Accounts now, or mappings only? | **Chart of Accounts first (P2), mappings after (P4).** Accounts are cheap and are a prerequisite. |
| **D-2** | Should account codes follow accountant-provided Lebanese codes? | **Make codes fully editable and seed as a replaceable default.** Ask the accountant for their chart before P2 ships if possible. |
| **D-3** | Journal entries now or later? | **Later (P7).** The event stream upgrades into journal lines mechanically. |
| **D-4** | **Currency: USD only, LBP only, or both?** | **Must be answered before P2.** If both, currency and rate belong in the first accounting migration. This is the highest-cost decision on the list. |
| **D-5** | Which cash/bank accounts actually exist? (one cash box? a bank account? per-person floats?) | Needed to seed 1010/1020 meaningfully. |
| **D-6** | Should supplier purchases affect inventory now? | **No — later.** Supplier transactions have no line items; adding them is its own project. Post to 5020 Purchases for now. |
| **D-7** | Month closing: read-only snapshot or hard lock? | **Read-only first.** Locking is irreversible and premature. |
| **D-8** | Add expenses before full accounting reports? | **Yes — expenses are the highest-value single addition** and are independent of everything else. |
| **D-9** | Should reports be labelled estimate-only until accountant validation? | **Yes**, especially anything showing profit. |
| **D-10** | Legacy `Transaction` model: migrate, freeze, or keep? | **Freeze read-only and exclude from mapping**, unless it holds live data. |
| **D-11** | Should service-job revenue become a debt automatically, or stay manual with a prompt? | Suggest **prompt + one-click create**, not silent automation (C10). |

---

## 18. Files likely to inspect / change

*(For the future implementation work — nothing was modified in this review.)*

**Schema & migrations**
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — new models, new enums
- `backend/prisma/migrations/` — additive only
- [backend/prisma/repair/manifest.json](backend/prisma/repair/manifest.json) + new repair SQL — seeding/backfill
- [backend/prisma/seed.ts](backend/prisma/seed.ts) — default chart seed
- [backend/prisma/financial-domain-schema.test.ts](backend/prisma/financial-domain-schema.test.ts)

**Backend — new**
- `backend/src/features/accounting/` — `chart-accounts/`, `mappings/`, `events/`, `statements/`, `domain/`
- `backend/src/features/accounting/expenses/` (or `financial/expenses/`)

**Backend — modify**
- [backend/src/features/financial/domain/money.ts](backend/src/features/financial/domain/money.ts) — reuse as-is; add debit/credit sign helpers
- [backend/src/features/financial/domain/immutable-policy.ts](backend/src/features/financial/domain/immutable-policy.ts) — extend rules for events
- `backend/src/features/financial/debts/`, `payments/`, `prepaid/` — event emission hooks (C2)
- [backend/src/features/sales/sales-orders/sales-orders.service.ts](backend/src/features/sales/sales-orders/sales-orders.service.ts) — **C1**, delivery-fee split
- `backend/src/features/service/service-jobs/` — **C3** financial exit
- `backend/src/features/suppliers/transactions/` — event emission, **C5** immutability
- [backend/src/features/dashboard/dashboard-financial.*](backend/src/features/dashboard/) and `dashboard/month-end/` — finance cards, month snapshot
- `backend/src/features/reports/` — new report modules
- [backend/src/app.ts](backend/src/app.ts) — route registration; **C4** legacy `/api/v1/transactions`
- [backend/src/features/financial/authorization/](backend/src/features/financial/authorization/) — extend admin-verified action list

**Frontend**
- `frontend/src/features/accounting/` (new) — chart, mappings, statements, expenses
- [frontend/src/pages/settings/SettingsPage.tsx](frontend/src/pages/settings/SettingsPage.tsx) — entry points
- `frontend/src/features/dashboard/` — finance tab
- `frontend/src/features/reports/` — new reports
- `frontend/src/shared/labels/` — Arabic/English account and accounting terminology
- [frontend/src/App.tsx](frontend/src/App.tsx) + [frontend/src/layouts/DashboardLayout.tsx](frontend/src/layouts/DashboardLayout.tsx) — routes/nav

**Docs**
- [docs/README.md](docs/README.md), `claude/plans/` follow-up implementation plans

---

## 19. Accountant validation notes

Hand this section to the accountant before the chart is treated as authoritative.

1. **The account codes in §8 are a software placeholder.** They were designed for usability, not compliance.
   Please replace them with the codes you use, or confirm these are acceptable.
2. **Confirm the account type of prepaid customer money.** This plan treats an undelivered prepayment as a
   liability (2020 دفعات مقدمة من الزبائن) rather than a receivable. Please confirm.
3. **Confirm revenue recognition timing** — at debt creation (invoice date) vs at delivery vs at payment.
   The plan assumes recognition when the obligation is created, and for prepaid at delivery.
4. **Confirm the treatment of installment markup** — the pricing module adds an installment markup percent;
   whether that is revenue, finance income, or simply part of the sale price is an accounting call.
5. **Confirm discount handling** — contra-revenue account (7010) vs net-of-discount revenue.
6. **Currency** — confirm the reporting currency and whether dual USD/LBP presentation is required (D-4).
7. **VAT/TVA** — no tax handling is proposed. Confirm whether the business is registered and, if so, what is
   required; account 2030 is a placeholder only.
8. **Reporting deliverables** — confirm which of trial balance / income statement / balance sheet you want
   from the app versus from your own system, so P7 can be scoped or dropped.
9. **Opening balances** — confirm the cut-over date and the opening balances for cash, receivables, and
   payables; the plan does not assume the historical data is restated.

**Until items 1–9 are answered, every financial report produced by HomeConnect should carry a visible
bilingual disclosure that the figures are operational estimates and not accountant-validated statements** —
the same pattern the existing month-end module already uses.
