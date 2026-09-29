# CURRENT SYSTEM AUDIT

Domain-by-domain audit against the code. Each section states what exists, what does not, and what is actually risky.

Verification baseline: commit `ac6ae9f` (v2.0.0), working tree clean. `npx vitest run` on 2026-08-25 → **2,181 passed, 10 skipped, exit 0**.

---

## 1. Customers

| Capability | Status | Evidence |
|---|---|---|
| CRUD, soft delete | ✔ | `Customer.deletedAt`, `customers.service.ts` |
| Name, phone, address, notes, active flag | ✔ | [schema.prisma:393-418](backend/prisma/schema.prisma#L393) |
| Fuzzy multi-word search | ✔ | `pg_trgm`, `search-normalize.ts`, `search-query.customer.test.ts` |
| Credit sales (debt) | ✔ | `Debt` model |
| Partial payments | ✔ | `PaymentAllocation` |
| Payment history | ✔ | `/customers/:id/financial-summary` |
| Customer balance | ✔ | **Derived, never stored** |
| Due dates & overdue | ✔ | `Debt.dueDate`, receivables aging tiers |
| Activity timeline | ✔ | `/customers/:id/activity` |
| **Credit limit** | ✘ | zero matches repo-wide |
| **Printable statement** | ✘ | no statement/PDF endpoint |
| **Customer-specific pricing** | ✘ | pricing is per-product/preset only |

**Verdict.** Customer management is complete for how this business works, with two real gaps: nothing stops an employee from extending unlimited credit, and there is no document you can hand a customer showing what they owe and why.

---

## 2. Suppliers

| Capability | Status | Evidence |
|---|---|---|
| CRUD, archive/restore | ✔ | `suppliers.routes.ts` |
| Supplier ledger | ✔ | `/supplier-ledger` |
| Payable balance | ✔ | **Derived** from transaction directions — [suppliers.repository.ts:41-52](backend/src/features/suppliers/suppliers/suppliers.repository.ts#L41) |
| Purchase history with priced lines | ✔ | `SupplierPurchaseLine` |
| Payments, partial payments | ✔ | `SUPPLIER_PAYMENT` + `DECREASE_OWED` |
| Amount override + reason | ✔ | `amountOverride`, `amountOverrideReason` |
| Duplicate receipt warning | ✔ | `/receipt-check` |
| Audit trail | ✔ | `SupplierAudit` |
| **Due dates on payables** | ✘ | `SupplierTransaction` has `transactionDate`, **no `dueDate`** |
| **Supplier aging** | ✘ | no aging tiers for payables (customers have them) |
| **Printable statement** | ✘ | |

**Verdict.** Payables are modelled well and the balance is derived, so it cannot drift. But the asymmetry with receivables is stark: **you can see who owes you and how late, but not what you owe and when it is due.** For a shop that buys on supplier credit, that is a real cash-flow blind spot.

---

## 3. Products

| Capability | Status |
|---|---|
| Product, model, SKU (unique, sequence-generated), manufacturer barcode (unique) | ✔ |
| Categories | ✘ — **no category model or field** |
| Brands | ~ — plain indexed string, no `Brand` table; normalization/dedupe endpoint added v2.0.0 |
| Units of measure | ✘ |
| Cost price, selling price, discount | ✔ (`Decimal(12,2)`) |
| **Price history** | ✘ — current price only; `ServiceAudit` records *that* price changed, not a queryable series |
| Variants, serial numbers | ✘ |
| Min stock (`lowStockThreshold`) | ✔ |
| Max stock | ✘ |
| Active/inactive, archive/restore | ✔ |
| Images | ✔ (separate table — lists never load bytes) |
| Specifications (ordered JSON, searchable) | ✔ |
| **Supplier relationship on the product** | ✘ — reachable only historically via receiving/purchase lines |
| Pricing formula engine | ✔ — the standout feature of this module |

**Verdict.** The richest module in the system (24 endpoints). The pricing engine — expense/profit/discount-buffer/installment-markup/down-payment percentages, compound vs simple, four rounding modes — is a genuine domain asset. Gaps are **categories** (browsing 1,000 products with only brand and text search gets painful) and **no default supplier per product** (reordering means remembering).

---

## 4. Inventory — the most important section

### Source of truth: a deliberate, defensible hybrid

`Product.stockQuantity` (`Int`) is the **authoritative current value**. `StockMovement` is an **append-only ledger** recording `quantityChange`, `quantityBefore`, and `quantityAfter` for every change.

That is two representations of the same fact — normally a drift hazard. Here it is defended three ways:

**1. Compare-and-set on every write.** [inventory.repository.ts:177-187](backend/src/features/inventory/inventory.repository.ts#L177):

```ts
return tx.product.updateMany({
  where: { id: productId, trackStock: true, stockQuantity: quantityBefore },
  data: { stockQuantity: quantityAfter },
});
```

Every caller checks the result: `if (updated.count !== 1) throw staleStock(before)`. If another transaction moved the stock, the update matches zero rows and the whole transaction aborts with a 409. **Lost updates are structurally impossible.**

**2. Every path is funnelled through it.** Verified across all four stock-moving domains:

| Path | Enforcement |
|---|---|
| Sales fulfillment + reversal | [sales-order-inventory.service.ts:116,213](backend/src/features/sales/sales-orders/sales-order-inventory.service.ts#L116) |
| Supplier receiving + void | [supplier-receivings.service.ts:81,265](backend/src/features/inventory/receiving/supplier-receivings.service.ts#L81) |
| Manual adjustments | [inventory.service.ts:373](backend/src/features/inventory/inventory.service.ts#L373) |
| Product settings | **cannot write stock at all** — [products.service.ts:584](backend/src/features/service/products/products.service.ts#L584) documents this |

**3. Reconciliation is a first-class feature.** [inventory.repository.ts:135-136](backend/src/features/inventory/inventory.repository.ts#L135) verifies `ledgerSum === stockQuantity && lastQuantityAfter === stockQuantity`, surfaced as a Receiving Reconciliation report. **The system can prove its own stock arithmetic.** Most small ERPs cannot.

### Double-application is unrepresentable

`SalesOrderStockFulfillment.stockMovementId` and `SupplierReceivingItem.stockMovementId` are both `@unique`, and `SupplierPurchaseLine.receivingItemId` is `@unique`. A second stock increase for the same purchase line cannot be written — the database rejects it. This is exactly the right way to enforce an invariant.

### Reversal preserves history

Voiding a receiving does not edit or delete anything. It writes a **compensating movement** of a reserved type (`PURCHASE_RECEIPT_REVERSAL`, which no user can select) and flips a status flag. Original document and original movements remain exactly as posted.

| Other capability | Status |
|---|---|
| Stock per warehouse | ✘ — **no warehouse concept exists** |
| Negative stock protection | ✔ — shortfall check before void |
| Opening balances / onboarding | ✔ — dedicated admin page |
| Low/out-of-stock detection | ✔ |
| **Inventory valuation** | ✘ — `costPrice` exists but no stock-value report |

**Verdict: this is the strongest part of the system, and it is genuinely well-engineered.** The one caveat is that the CAS-conflict and rollback behaviour is only *directly* proven by the DB integration tests — which are **skipped by default** (see §12).

---

## 5. Warehouses and branches

**Neither exists.**

- `warehouse` in the codebase matches **only the lucide-react icon** used as a glyph on the Inventory page.
- `branchId` columns exist on `User`, `Customer`, `Transaction`, `ActivityLog` — all nullable, **no `Branch` model, no foreign key, no filtering, no isolation, no UI.**

This is dead scaffolding from an early design. Multi-branch support is **0% implemented**, not partially implemented. The `branchId` columns are actively misleading: they suggest a capability the code does not have.

Given the loopback-bound single-machine deployment, a second branch would today mean a second independent database with no consolidation. **If two branches are a real near-term plan, that is an architecture project, not a feature.**

---

## 6. Sales

| Capability | Status | Notes |
|---|---|---|
| Sales orders, 3 channels | ✔ | SHOP_DIRECT / SHOP_DELIVERY / PHONE_ORDER |
| Draft → final workflow | ✔ | 8 states, validated transition table |
| Order numbers | ✔ | `@unique` |
| Multi-line items + snapshots | ✔ | name/model/SKU snapshotted at sale time — renaming a product never rewrites history |
| Stock deduction / restore | ✔ | explicit, audited, double-deduction unrepresentable |
| Payment status, partial payment | ✔ | derived from totals |
| Credit sale → Debt / Installment | ✔ | **explicit user action, never implicit** |
| Delivery fee | ✔ | |
| Cancel / restore | ✔ | with admin verification |
| Return | ~ | **3-step manual dance — see below** |
| **Per-line discount** | ✘ | column exists, "the current UI always submits zero" ([schema.prisma:968](backend/prisma/schema.prisma#L968)) |
| **Tax** | ✘ | |
| **Refunds / credit notes** | ✘ | |
| **Invoice printing** | ✘ | no sales invoice document at all |
| **Receipt printing** | ✘ | |

### Finding 6.1 — Cash taken on a sales order never becomes a `Payment`

`SalesOrder.paidAmount` is a stored `Decimal` column. When a customer pays cash at the counter, `changePayment` writes that amount to the order and creates a `Debt` **only for the remainder** ([sales-orders.service.ts:334-355](backend/src/features/sales/sales-orders/sales-orders.service.ts#L334)).

The boundary is well-designed — `assertNoFinancialLink` freezes the order's payment fields once a debt exists, so the two never disagree. **But the cash itself is never recorded as a `Payment` row.**

Verified consequence: `customer-financial-summary.repository.ts` contains **zero references to sales orders**. So money collected on a sales order:

- does not appear in the customer's payment history;
- does not appear in the "Customer Payments" or "Customers Who Paid" reports;
- does not appear in the `collected` movement metric that feeds Monthly Review and the Analysis Portal.

**Impact scales with how much of the business is cash sales.** If most sales are credit, this is minor. If the shop takes cash across the counter routinely, then a substantial share of revenue is invisible to every financial report. *Confidence: High on the structure, Medium on the business impact — it depends on real usage.*

### Finding 6.2 — Return requires three manual steps and reverses no money

[sales-orders.service.ts:376-408](backend/src/features/sales/sales-orders/sales-orders.service.ts#L376). Marking an order `RETURNED` throws unless the operator has already (1) unlinked/cancelled the financial record and (2) restored the stock. The guards are *correct* — they refuse to create silent inconsistency. But there is no atomic return, and **no refund or credit-note concept anywhere in the system**. Getting a customer's money back out is entirely manual.

---

## 7. Purchases

| Capability | Status |
|---|---|
| Purchase invoices with priced lines | ✔ |
| Supplier link, warehouse receiving | ✔ receiving / ✘ warehouse |
| Payable created | ✔ |
| Partial payment | ✔ |
| Receiving void with compensating movements | ✔ |
| PRODUCT vs MANUAL line kinds | ✔ — good modelling: manual lines are description-only money that never touch stock |
| **Automatic cost-price update on receipt** | ✘ — `unitPrice` lands on the purchase line; `Product.costPrice` is **not** updated |
| **Due dates on payables** | ✘ |
| **Purchase returns to supplier** | ✘ — you can void a receiving, but there is no "return goods to supplier" flow |
| **Expenses (non-stock operating costs)** | ✘ — MANUAL purchase lines are the closest thing; rent/salaries/utilities have no home |
| Tax | ✘ |

**Verdict.** The receiving-and-payable spine is solid and auditable. Two things bite in practice: **cost prices go stale** (so the pricing engine computes from an old cost), and **there is nowhere to record operating expenses**, which — combined with the missing COGS — is why the system cannot say whether the business is profitable.

---

## 8. POS

**There is no POS.** No cart, no tender screen, no cash drawer, no shift open/close, no X/Z report, no receipt printer integration, no concurrent-checkout model.

What exists instead — and it is genuinely useful — is the **Scanner Hub**:

| Capability | Status |
|---|---|
| Barcode scanning (PC keyboard-wedge) | ✔ — scanner-mode toggle on the products page |
| **Phone-as-scanner over LAN** | ✔ — pairing code, hashed session tokens, TTLs, 3-session cap, rate limits |
| Product search | ✔ — excellent multi-word fuzzy search |
| Scan → identify → preview | ✔ |
| Scan → quick sales order | ✔ (v2.0.0) |
| Cart / multi-item tender | ✘ |
| Multiple payment methods per sale | ✘ — `PaymentMethod` exists but one method per payment |
| Cash drawer / shift close | ✘ |
| Receipt printing | ✘ |
| Keyboard shortcuts | ~ partial |
| Concurrent checkout safety | ✔ — via stock CAS, though there is one till |

The scanner security deserves specific credit: SHA-256 token hashes, `timingSafeEqual` comparison, pairing TTL, idle **and** absolute session TTLs, and deliberate in-memory-only storage so restarting the backend invalidates every paired phone ([scanner.store.ts:1-15](backend/src/features/scanner/scanner.store.ts#L1)).

**Verdict.** As a *lookup and order-entry* tool this is strong. As a *point of sale* it does not exist. Whether that matters depends entirely on whether the shop wants a counter till — an appliance business where each sale involves discussion, delivery scheduling, and credit terms may genuinely not need one.

---

## 9. Ledger and debts — what "ledger" actually means here

### Definition

"Ledger" in Home Connect means a **filterable register of obligations**: `DEBT | INSTALLMENT_PLAN | PAYMENT`, with allocations attached ([financial-ledger.types.ts](backend/src/features/financial/ledger/financial-ledger.types.ts)). It is **not** an accounting ledger and **not** a running-balance statement — there is no `runningBalance` field.

### Balances are derived, and that is the single best decision in the codebase

[balances.ts:93-107](backend/src/features/financial/domain/balances.ts#L93):

```ts
const totalPaid = calculateTotalPaidFromAllocations(allocations);   // non-voided only
const remainingBalance = subtractMoney(originalAmount, totalPaid);
```

**No balance is stored anywhere.** Not on `Customer`, not on `Debt`. Every balance is recomputed from non-voided `PaymentAllocation` rows.

**Therefore balance drift is not a risk that needs mitigating — it is structurally impossible.** Supplier balances are derived the same way. This eliminates the single most common failure mode in small-business ERPs, and it should not be "improved."

### Immutability and reversal

- `Payment.voidedAt` — voided, never deleted.
- `PaymentAllocation.voidedAt` + `correctionId` — links the reversal to the correction that caused it.
- `Debt.cancelledAt` + `cancelReason` + `cancelledById`.
- `FinancialCorrectionAudit` — 9 action types, mandatory reason, before/after JSON, actor name **and** username snapshotted, source screen, request ID, IP.
- A dedicated `immutable-policy.ts` module enforces what may change.

| Capability | Status |
|---|---|
| Running balance column | ✘ |
| Aging (customers) | ✔ |
| Aging (suppliers) | ✘ |
| Reversals, adjustments, audit history | ✔ |
| **Money precision** | ✔ `Decimal(12,2)` everywhere; **zero float money columns repo-wide** |

**Verdict: 8.7/10.** The strongest financial core I would expect to find in an owner-built ERP. Its gaps are presentational (no statement, no running balance) rather than structural.

---

## 10. Accounting

**Searched exhaustively. Nothing exists.**

`journal`, `chart of account`, `trial balance`, `debit`, `credit` (as an accounting term), `COGS`, `gross profit`, `margin`, `VAT`, `tax` — **all zero matches** in `backend/src` and `frontend/src`.

The only `profitAmount` in the codebase is in [pricing-calculator.ts:45](backend/src/features/pricing/domain/pricing-calculator.ts#L45) — a **forward-looking pricing formula output** (target markup used to compute a selling price), not realized profit on anything sold.

### The consequence, stated plainly

Home Connect knows, precisely and reliably:
- what every customer owes and how late they are;
- what is owed to every supplier;
- exactly what stock exists and every movement that produced it.

Home Connect **cannot** tell the owner:
- how much money the business made this month;
- the margin on any product, order, or category;
- what the stock on hand is worth;
- what the business spent on anything that is not inventory.

`Product.costPrice` and `SupplierPurchaseLine.unitPrice` both exist, and `SalesOrderItem` snapshots the sale price. **The raw material for margin reporting is already in the database and is simply not being used.** This is the highest-value, lowest-risk gap in the entire audit.

See `GENERAL_LEDGER_DECISION.md` for the recommendation.

---

## 11. Employees, users, permissions

| Capability | Status |
|---|---|
| User accounts, active flag, soft delete | ✔ |
| Roles | ~ — **only `ADMIN` and `EMPLOYEE`** |
| Password hashing | ✔ bcrypt cost 12 |
| Account lockout | ✔ 5 attempts / 15 min, persisted |
| Admin-approved user creation | ✔ requires an existing admin's password |
| Password change | ✔ |
| **Step-up re-authentication** | ✔ — sensitive actions re-prompt for the admin password, logged to `AdminVerificationLog` |
| Sales attribution | ✔ — `createdById` on every business record |
| **Granular permissions** | ✘ — no permission table, no role editor |
| **Password reset (forgotten)** | ✘ — only authenticated change |
| **Branch assignment** | ✘ — `branchId` is dead |
| **MFA** | ✘ |
| **Employee records** (HR: hire date, wage, contact) | ✘ — `User` is a login, not an employee |

### Finding 11.1 — Two roles is a real ceiling

49 `requireRole` call sites plus per-domain policy modules (`financial-policy.ts`, `sales-policy.ts`, `supplier-policy.ts`, `service-policy.ts`, `pricing-policy.ts`). The *implementation* is careful and consistent. The *model* has only two levels.

Practical consequences: every employee can see every customer's full debt and every product's cost price; nobody can be given reports access without being made a full admin; there is no "senior salesperson" who can discount but not void.

### Finding 11.2 — A revoked user's token stays valid until expiry

[auth.middleware.ts:19-35](backend/src/middleware/auth.middleware.ts#L19) verifies the JWT signature and nothing else. It does **not** re-check `isActive` or `deletedAt`. Deactivating an employee therefore does not end their current session — their access token works until it expires, and their refresh cookie may mint more. For a shop where an employee leaves mid-shift on bad terms, this is a real gap.

---

## 12. Testing

### The headline number is real, and so is the caveat

Verified run, 2026-08-25:

```
Test Files  256 passed | 10 skipped (266)
     Tests  2181 passed | 10 skipped (2191)
   Duration  108.30s                            exit code 0
```

~34,300 lines of test against ~69,500 lines of production code — a **0.49 ratio**, which is genuinely good.

### But the 10 skipped files are exactly the ones that matter most

Every DB integration suite is gated behind an opt-in environment flag:

```ts
const runDatabaseTests = process.env.RUN_FINANCIAL_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;
```

Five separate flags: `RUN_FINANCIAL_DB_TESTS`, `RUN_INVENTORY_DB_TESTS`, `RUN_SALES_FULFILLMENT_DB_TESTS`, `RUN_SUPPLIER_PURCHASE_DB_TESTS`, `RUN_SUPPLIER_RECEIVING_DB_TESTS`.

So a green `npm test` proves the **pure domain logic** is correct — money arithmetic, allocation, schedules, status derivation, policy — which is real and valuable. It does **not** prove that CAS conflicts abort correctly, that transactions roll back cleanly, that unique constraints hold under concurrency, or that a failed write leaves no partial state.

| Test type | Present |
|---|---|
| Unit (domain, pure) | ✔ excellent |
| Service (mocked repos) | ✔ extensive |
| Route/API (supertest) | ✔ good |
| Frontend component | ✔ 80 files |
| Database integration | ~ **written but skipped by default** |
| Concurrency | ~ same |
| **E2E** | ✘ no Playwright/Cypress |
| **CI** | ✘ **no `.github/`, no pipeline anywhere** |

**Verdict.** The tests protect logic well and infrastructure barely. Combined with no CI, the practical guarantee is "whatever the developer remembered to run before committing."

---

## 13. Reports

16 reports across 5 categories, every one with a CSV export, all ADMIN-only. Full list in `FEATURE_INVENTORY.md` §B.

**Reconciliation.** Reports derive from the same domain functions as the screens (payment allocations, transaction directions, movement sums) rather than from separate SQL, so they reconcile with source transactions by construction. The Receiving Reconciliation report goes further and actively verifies inventory arithmetic.

**Missing:** any profit, margin, or COGS report; inventory valuation; cash-flow; supplier aging; employee performance. And because of Finding 6.1, **cash collected on sales orders is absent from every "collected" metric.**

---

## 14. Dashboard

Seven backend analytics domains (overview, customer, supplier, sales, product, service, activity) plus an alerts service and live-recomputed month-end controls, with in-process caching.

Judged on **usefulness, not polish**:

| Owner question | Answered? |
|---|---|
| Who owes me money and who is overdue? | ✔ — with deep links to the specific customers |
| What do I owe suppliers? | ✔ |
| What is running out of stock? | ✔ |
| Which service jobs are stuck? | ✔ |
| What happened today/this month? | ✔ |
| **Did I make money?** | ✘ |
| **What is my stock worth?** | ✘ |
| **What is my cash position?** | ✘ |

The alerts service is the best-designed part: three severities, sorted by severity then amount, each alert carrying up to three named offenders with routes straight to them. It tells the owner *who* to chase, not just that a number is bad.

**Verdict.** Strong operational dashboard, absent financial dashboard.

---

## 15. Notifications

| Channel | Status |
|---|---|
| In-app alerts (low stock, overdue debt, supplier balances, aging jobs) | ✔ |
| **WhatsApp** | ✔ — prefilled `wa.me` deep link from the customer profile (manual send) |
| Email / SMS | ✘ |
| Scheduled reminders | ✘ — alerts are pull-only; nothing runs on a schedule except backups |

Appropriate for a desktop app. The WhatsApp link is a smart, low-cost fit for the region.

---

## 16. Backup and recovery — a genuine strength

| Capability | Status | Evidence |
|---|---|---|
| Scheduled automatic backups | ✔ | node-cron `BackupScheduler` |
| Manual backup | ✔ | |
| **Checksum recorded and re-verified** | ✔ | SHA-256, [backup.service.ts:426](backend/src/features/backup/backup.service.ts#L426) |
| **Archive readability verified** | ✔ | `pg_restore --list` before trusting a file |
| **Automatic pre-restore safety backup** | ✔ | [backup.service.ts:236-238](backend/src/features/backup/backup.service.ts#L236) |
| **Writes blocked during restore** | ✔ | `blockWritesDuringRestore` is app-wide middleware |
| Admin password required to restore | ✔ | |
| Post-restore verification | ✔ | `verifyRestoredDatabase()` |
| Compatibility check before restore | ✔ | refuses incompatible archives |
| Retention / maintenance | ✔ | |
| Import external backup | ✔ | |
| **Documented, rehearsed restore drill** | ✘ | the *capability* is tested; the *procedure* is not rehearsed on real data |

**Verdict: 8.5/10** — well above what this class of application normally achieves. The remaining gap is procedural, not technical: nobody has timed a real restore of the real database and confirmed the business could resume.

---

## 17. Code quality and architecture

### Backend — 8.0/10

Vertical feature slices with genuine layering: routes → validate → controller → service → repository, with pure `domain/` logic that has no Prisma import. Transaction boundaries are explicit via a single `runFinancialTransaction` helper. The `tx` client is threaded through repositories (`tx?: Prisma.TransactionClient` is the house signature), so nothing escapes a transaction by accident. Typed errors map to a uniform response envelope. Logging is redacted.

Deductions: the legacy `controllers/services/repositories` layer still exists alongside; the orphaned transactions module is live-mounted; **idempotency covers only payments**.

### Database — 8.5/10

28 models, 33 migrations, `Decimal(12,2)` for all money with **zero float money columns**, pervasive `onDelete: Restrict`, unique constraints used to make bad states unrepresentable, purpose-built composite indexes, `pg_trgm` search. The schema comments explain *rejected* alternatives, which is rare and valuable.

Deductions: inconsistent soft-delete conventions (`deletedAt` / `archivedAt` / `cancelledAt` / `voidedAt` / status enums) with no single "is live" predicate; dead `branchId` columns; `Json` specifications trade queryability for flexibility.

### Frontend — 7.5/10

20 feature slices each with `api/`, `components/`, `hooks/`, `types/`. React Query for server state (no hand-rolled cache). react-hook-form + Zod resolvers. Shared `components/ui/` primitives. 80 test files including snapshots. Bilingual throughout. `Button` disables itself while `isLoading` ([Button.tsx:83](frontend/src/components/ui/Button.tsx#L83)), so the common double-submit is guarded.

Deductions: some very long single-line JSX (the sales order dialog footer is one ~600-character line); a 6-step wizard for creating a sales order; accessibility beyond `aria-busy` and focus rings is not systematically addressed; no evidence of responsive/mobile work (reasonable for a desktop app).

### Security — 7.0/10

**Strong:** in-memory access token (never `localStorage`); httpOnly refresh cookie with single-flight refresh; bcrypt 12; account lockout; step-up admin re-auth with its own audit table; strict Electron CSP with no `unsafe-eval` and no inline script in production; helmet; CORS allowlist; Zod validation at every route; redacted logs and diagnostics; loopback-only binding; careful scanner crypto.

**Weak — three findings:**

1. **Hardcoded JWT fallback secret.** [auth.middleware.ts:5](backend/src/middleware/auth.middleware.ts#L5) and [auth.service.ts:7](backend/src/services/auth.service.ts#L7):
   ```ts
   const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
   ```
   `preflight.checks.ts` lists `JWT_SECRET` as required — but preflight is an **admin API endpoint, not a startup gate**. If `production.env` exists but lacks the key, the app boots on a publicly-known secret and **anyone able to reach the port can forge an admin token**.
   *Mitigating:* `Setup-HomeConnect.ps1` generates a CSPRNG secret, and the server binds loopback. *Residual:* dev runs, hand-edited configs, and any future non-loopback bind.

2. **Revoked users keep working sessions** (Finding 11.1).

3. **No rate limiting on login.** Rate limiting exists — but only for scanner and maintenance routes. Login relies solely on per-account lockout, so username enumeration and distributed guessing across accounts are unthrottled.

**Not applicable / low risk:** SQL injection (all `$queryRawUnsafe` is in the maintenance/migration runner over developer-authored bundled SQL, never user input); IDOR and branch leakage (single-tenant, single-site — every authenticated user is staff of one shop by design); CSRF (auth is a Bearer header, not cookie-driven, and the origin is a local Electron renderer).
