# ARCHITECTURE DECISIONS

Decisions **already made and evidenced in the code** (ADR-01 to ADR-10) are recorded first so they are not accidentally undone. Decisions **this plan proposes** (ADR-11 to ADR-18) follow.

---

## ADR-01 · Inventory source of truth: stored quantity + append-only ledger, reconciled

**Status:** Implemented · **Keep**

**Context.** Stock must be readable instantly and auditable completely.

**Alternatives.** (a) Stored quantity only — fast, no history. (b) Ledger only, summed on read — auditable, slow, and every read scans. (c) Both, reconciled.

**Chosen.** `Product.stockQuantity` is authoritative for reads; `StockMovement` is an append-only ledger with `quantityBefore`/`quantityAfter`.

**Reason.** Two representations of one fact would normally be a drift hazard. Here it is defended three ways: compare-and-set on every write ([inventory.repository.ts:177-187](backend/src/features/inventory/inventory.repository.ts#L177)) with `count !== 1` → 409; `@unique` movement links making double-application unrepresentable; and a reconciliation report verifying `ledgerSum === stockQuantity === lastQuantityAfter`.

**Trade-offs.** Denormalised, so it *could* drift — but only via a write bypassing the repository, which product settings explicitly cannot do ([products.service.ts:584](backend/src/features/service/products/products.service.ts#L584)).

**Consequences.** Fast reads, complete history, provable correctness. **The reconciliation report is load-bearing and must be run regularly, not just when someone suspects a problem.**

---

## ADR-02 · Ledger source of truth: derived balances, never stored

**Status:** Implemented · **Keep — this is the project's best decision**

**Context.** Customer and supplier balances must always be right.

**Alternatives.** (a) Store a balance column, update on each transaction — fast, drifts. (b) Store and reconcile nightly — drifts between runs. (c) Derive on read.

**Chosen.** Derive. No balance is stored on `Customer`, `Debt`, or `Supplier`. Every balance is recomputed from non-voided `PaymentAllocation` rows ([balances.ts:93-107](backend/src/features/financial/domain/balances.ts#L93)) or from supplier transaction directions.

**Reason.** **Balance drift becomes structurally impossible rather than merely mitigated.** This is the single most common failure mode in small-business ERPs and it has been eliminated by construction.

**Trade-offs.** More computation per read. At this data volume, irrelevant.

**Consequences.** **Never introduce a cached balance column as a performance optimisation.** If reads ever become slow, add indexes or a materialised view with an explicit refresh contract — do not store a mutable balance.

---

## ADR-03 · Money as `Decimal(12,2)` end to end

**Status:** Implemented · **Keep**

**Chosen.** `@db.Decimal(12, 2)` for every monetary column, Prisma `Decimal` in the domain, `.toFixed(2)` strings over the API. `money.ts` rejects >2 decimal places, requires explicit rounding modes, and caps at schema precision.

**Reason.** Floats cannot represent money. Verified: **zero float money columns repo-wide.**

**Consequences.** A whole class of bug does not exist here. Never accept a JS `number` for money at any boundary.

---

## ADR-04 · Transaction boundaries via one helper

**Status:** Implemented · **Keep**

**Chosen.** `runFinancialTransaction` wraps every multi-write financial operation; the `tx` client is threaded through repositories (`tx?: Prisma.TransactionClient` is the house signature).

**Reason.** One place to change isolation level, timeout, or retry policy. Ad-hoc `prisma.$transaction` calls would make that impossible.

**Consequences.** New financial operations **must** use it. A repository that ignores the passed `tx` silently escapes the boundary — this is the highest-value thing for a code review to check.

---

## ADR-05 · Cancellation and reversal: never delete, always compensate

**Status:** Implemented · **Keep**

**Chosen.** Payments are voided (`voidedAt`), debts cancelled (`cancelledAt` + reason + actor), receivings voided by writing a **compensating movement of a reserved type** (`PURCHASE_RECEIPT_REVERSAL`, which no user can select) while the original document and movements stay exactly as posted.

**Reason.** History is evidence. An edited record cannot answer "what did we believe last Tuesday?"

**Consequences.** Queries must filter voided/cancelled state — and because there are five different conventions for this (ADR-14), that filtering is easy to get wrong.

---

## ADR-06 · Payment allocation as a first-class join

**Status:** Implemented · **Keep**

**Chosen.** `PaymentAllocation` links one `Payment` to many `Debt`s and `Installment`s with an explicit amount, its own void flag, and a link to the correction that voided it.

**Reason.** One payment settling several obligations partially is the normal case in this business. Storing a payment against a single debt could not represent it, and money would be silently lost or double-counted.

**Consequences.** **Allocations must always sum to the payment.** This is `INV-06` and it is non-negotiable.

---

## ADR-07 · Idempotency on payments only

**Status:** Implemented · **Extend — see ADR-11**

**Chosen.** `Payment.idempotencyKey @unique` plus a SHA-256 fingerprint; a replay with a different fingerprint raises a conflict rather than silently returning the old result.

**Trade-offs.** Correct and well-built — but **applied only to payments**. Sales orders, purchases, and receivings have no equivalent.

---

## ADR-08 · Two-role authorization

**Status:** Implemented · **Accept for now — revisit only on evidence**

**Chosen.** `ADMIN` / `EMPLOYEE`, enforced by 49 `requireRole` sites plus five per-domain policy modules.

**Trade-offs.** Every employee sees every customer's debt and every product's cost. Nobody can be given reports without full admin.

**Consequences.** Adequate for two trusted staff. **Do not build a permission system speculatively** — build it when a third employee makes it necessary. Doing it early costs weeks and complicates every endpoint.

---

## ADR-09 · Loopback-only single-machine deployment

**Status:** Implemented · **Keep unless the business needs remote access**

**Chosen.** Electron shell, Express on `127.0.0.1`, local PostgreSQL, `HashRouter`.

**Reason.** No network attack surface, no hosting cost, no latency, and **a network outage does not affect the business at all**.

**Trade-offs.** No remote access, no second site, no phone access beyond the LAN scanner.

**Consequences.** **If remote access or a second branch ever becomes real, that is an architecture project — not a feature.** Do not half-open the bind: making the server reachable off-loopback would immediately promote CP-1 (fallback JWT secret) and R-19 (no login rate limiting) from low to critical.

---

## ADR-10 · Audit as domain-specific tables, not a generic log

**Status:** Implemented · **Keep**

**Chosen.** Five purpose-built audit tables (`FinancialCorrectionAudit`, `ServiceAudit`, `SalesAudit`, `SupplierAudit`, `SupplierReceivingAudit`), each with typed actions, mandatory reason, before/after JSON, and actor name **and** username snapshotted.

**Reason.** Typed actions are queryable and reportable; a generic `ActivityLog` with a JSON blob is neither. Snapshotting the actor's name means a later rename cannot rewrite history.

**Consequences.** The generic `ActivityLog` table is now written **only** by the orphaned legacy transactions module. See ADR-13.

---

# Proposed decisions

---

## ADR-11 · Extend idempotency to purchases and receivings

**Status:** Proposed · Phase 1

**Context.** CP-3 / R-05. A retry or resubmit can create a duplicate payable or a **duplicate stock increase**. The `Button` disabled-on-`isLoading` guard stops the double-click, not the retry.

**Alternatives.** (a) UI guards only — insufficient. (b) Natural-key uniqueness on `(supplierId, receiptNumber)` — **rejected**, and the schema already explains why: suppliers reuse and re-issue numbers, so a hard constraint would block a genuine purchase at the counter ([schema.prisma:1202-1205](backend/prisma/schema.prisma#L1202)). (c) Client-generated idempotency key, as payments already do.

**Chosen.** (c) — reuse the existing pattern exactly.

**Reason.** The mechanism is proven in this codebase. Copying it is low-risk; inventing a second mechanism is not.

**Consequences.** Two additive nullable unique columns. The frontend must generate a key per form instance and reuse it across retries — **not regenerate it on each submit**, which would defeat the purpose.

---

## ADR-12 · Fail startup when `JWT_SECRET` is missing

**Status:** Proposed · Phase 1

**Context.** CP-1 / R-17. The `|| 'fallback_secret_key_change_in_production'` default means a missing secret produces a **silently insecure** running system.

**Alternatives.** (a) Keep the fallback. (b) Generate a random secret at boot — **rejected**: it would invalidate every session on every restart and mask the misconfiguration. (c) Refuse to start.

**Chosen.** (c). Throw at module load with an actionable message pointing at `Setup-HomeConnect.ps1`. `startup-failure-messages.ts` **already has a matcher for exactly this** — the plumbing exists.

**Trade-offs.** A developer with no `.env` gets a hard failure instead of a working app. That is the correct trade.

---

## ADR-13 · Remove the legacy transaction system — **revised 2026-08-30**

> **The premise below was wrong.** This module is not orphaned. It renders on the Customer Profile (`CustomerProfilePage.tsx:10` → `TransactionList`), its router is called by `transactions.api.ts`, `customers.controller.ts` uses `TransactionsService`, and `dashboard-activity.repository.ts:9` **reads** `activity_logs`.
>
> **Revised decision — split, and do not drop `activity_logs`:**
>
> - **T9a:** remove the Legacy Ledger panel, `features/transactions/`, the `/api/v1/transactions` router and backend files, the customer transaction/balance routes, and the `Transaction` model + table. `ActivityLog` has no FK to `Transaction`, so the two separate cleanly.
> - **T9b:** dashboard Recent Activity — retire the panel or reimplement it over the five audit tables (where the real activity data lives). Deferred product decision; `activity_logs` stays until it is made.
>
> Both tables hold 0 production rows, so nothing is lost — but T9a removes a visible panel from a daily-use screen and needs explicit owner sign-off.

### Original decision (retained for the record — see revision above)

**Status:** Proposed · Phase 1

**Context.** CP-6 / R-22. `Transaction` + routes + controller + service + repository exist, the router is **live-mounted**, and no UI reaches it. It is also the only writer of `ActivityLog`.

**Alternatives.** (a) Leave it. (b) Unmount the route, keep the code. (c) Delete module, route, model, and `ActivityLog` after confirming both tables are empty.

**Chosen.** (c), **strictly gated on confirming both tables are empty in the production database.** If rows exist, they must be understood and migrated or archived first — this is a data question before it is a code question.

**Reason.** A second parallel money system is a permanent hazard: it can be written to via the API invisibly to every screen, and any future report joining it would double-count against `debts`.

**Consequences.** Removes a model, a table, five files, and a route. Reduces the schema's apparent complexity to match its real complexity.

---

## ADR-14 · Adopt one "is this record live?" predicate per domain

**Status:** Proposed · Phase 1 (as a convention, applied opportunistically)

**Context.** Five conventions coexist: `deletedAt`, `archivedAt`, `cancelledAt`, `voidedAt`, and status enums. Each is defensible alone; together there is no single liveness test, and a forgotten filter silently includes cancelled money in a total.

**Alternatives.** (a) Migrate everything to one column name — **rejected**: high-churn, touches every query, and the words genuinely mean different things (a *voided* payment is not an *archived* supplier). (b) Keep the columns, add one exported predicate per domain, use it everywhere. (c) Leave as is.

**Chosen.** (b).

**Reason.** Captures the intent in one reviewable place without a risky rename across ~30 models.

**Consequences.** Cheap, incremental, and it makes the next filtering bug findable by grep.

---

## ADR-15 · Snapshot unit cost at fulfillment

**Status:** Proposed · Phase 3 · **Prerequisite for all margin reporting**

**Context.** Margin needs the cost *at the time of sale*. `Product.costPrice` changes, so computing margin live means **last month's profit silently rewrites itself** whenever a cost is updated.

**Alternatives.** (a) Compute live from `Product.costPrice` — **rejected**: historical profit is not allowed to change. (b) Weighted-average or FIFO costing — accurate, and a large subsystem. (c) Snapshot `unitCostSnapshot` on `SalesOrderStockFulfillment` at deduction time.

**Chosen.** (c).

**Reason.** One additive column makes historical margin immutable — the same discipline `SalesOrderItem`'s name/model/SKU snapshots already apply to product identity. It matches the codebase's existing philosophy exactly.

**Trade-offs.** Not true FIFO. For appliances bought and sold in small numbers, latest-cost is accurate enough and vastly simpler.

**Consequences.** Must ship **before** the profit report, and depends on ADR-16 — a snapshot of a stale cost is a precise record of a wrong number.

---

## ADR-16 · Update product cost price from receipts

**Status:** Proposed · Phase 1

**Context.** CP-8 / R-06. `SupplierPurchaseLine.unitPrice` records what was actually paid; `Product.costPrice` is never updated. The pricing engine then prices from a stale cost and the shop silently under-prices.

**Alternatives.** (a) Overwrite automatically on every receipt — simple, but a one-off odd purchase distorts pricing. (b) A review queue an admin approves. (c) Automatic update **with an audit entry**, plus a report of significant changes.

**Chosen.** (c).

**Reason.** Staleness is the bigger and more likely error; the audit entry preserves accountability, and the change report gives the owner oversight without blocking the counter.

**Consequences.** Selling prices derived from presets will shift when costs shift — which is the intended behaviour, but the owner must be told it now happens.

---

## ADR-17 · Documents rendered client-side, printed via the browser

**Status:** Proposed · Phase 2

**Context.** Invoices, receipts, and statements must be printable. None exist today.

**Alternatives.** (a) Server-side PDF (Puppeteer/PDFKit) — heavy, and bundling Chromium into Electron is painful. (b) Client-side jspdf, as bulk labels already use. (c) Print-stylesheet HTML via `window.print()`.

**Chosen.** (c) as primary, (b) for "save as PDF".

**Reason.** **The pattern already works in this codebase** — product labels prove the whole path, including Electron's print integration. It adds no dependency and no server load.

**Trade-offs.** Fine typographic control is harder than with a PDF library. Acceptable for a shop invoice.

**Consequences.** Document templates live in the frontend. **Totals must come from the API, never be recomputed in the template** — a template that does its own arithmetic is a second source of financial truth.

---

## ADR-18 · Add CI before adding features

**Status:** Proposed · Phase 1 · **First task in the plan**

**Context.** R-13 is the highest-probability high-impact risk. There is no `.github/`, no pipeline, and all 10 DB integration files are skipped by default behind eight env flags.

**Alternatives.** (a) Continue manual verification. (b) CI at the end, in Phase 4. (c) CI first, before any other change.

**Chosen.** (c).

**Reason.** Every subsequent task in this plan touches money or stock. Doing four months of AI-assisted work on a financial system with no automatic regression detection is the single largest avoidable risk in the project. **The integration tests that prove this system's core guarantees are already written — they are simply not being run.** Turning them on is the cheapest risk reduction available.

**Consequences.** ~8–12 hours up front, including a throwaway Postgres service for the DB suites. Everything after it is safer. **This is Phase 1, Task 1.**

---

## ADR-19 · Dual currency: rate snapshotted per transaction, allocations in the obligation's currency

**Status:** Approved 2026-08-26 · Phase 1 foundation, Phases 2-3 surface

**Context.** The business trades in USD and LBP. BIRD supports both. Currency touches ~30 money columns across 12 tables.

**Alternatives.**
(a) Store one amount, convert at read time using the current rate. **Rejected** - historical values would change every time the rate moved. This is the single worst thing a currency system can do.
(b) Store every amount twice, in both currencies, kept in sync. **Rejected** - two mutable representations of one fact is a drift engine, and it contradicts ADR-02.
(c) Store the transaction's own currency plus the rate used plus a base-currency snapshot. **Chosen.**

**Chosen.** Currency and rate live on the *document* (not on each money column). Every transaction stores `currency`, `exchangeRate`, and `baseAmount` in USD. `ExchangeRate` is an append-only rate table; correcting a rate adds a row, never edits one.

**Critically:** `PaymentAllocation.amount` stays denominated in the *obligation's* currency, with the payment's own amount and rate recorded alongside. Conversion happens once, at allocation time.

**Reason.** This keeps `calculateDebtBalance` unchanged. **ADR-02 (derived balances) survives dual currency completely untouched** - no balance is stored, none becomes currency-ambiguous, drift stays structurally impossible.

**Trade-offs.** More columns; every write path must supply a rate. Aggregation must use `baseAmount` - `Decimal(12,2)` caps at ~$111k equivalent in LBP, so summing in LBP would overflow (see CURRENCY_AND_VAT_DECISION.md A7).

**Consequences.** USD is the base and reporting currency. **No read path may ever look up a current rate to value a historical record.** LBP rounds to whole units.

---

## ADR-20 · VAT: configurable rate table, calculated per line, snapshotted on the line

**Status:** Approved 2026-08-26 · Default 11% (Lebanon), not hardcoded

**Context.** VAT is required. Rates change by legislation; historical invoices must not change with them.

### Decision 1 - configuration shape

**Alternatives.** (a) A `vat = 11` field or constant. **Rejected by the owner, correctly** - a future rate change would corrupt or require rewriting old invoices. (b) A single `TaxRate` table. (c) `TaxRate` + `TaxProfile`. **Chosen.**

`TaxRate` is what the law says (code, percent, effective dates). `TaxProfile` is what a product *is* (standard goods, exempt goods) and points at a rate. `Product.taxProfileId` is nullable and falls back to the default profile.

**Reason.** When Lebanon changes the rate, you add one `TaxRate` row and repoint the profile. **No product row is touched.** That is the difference between a rate change taking minutes and taking a migration.

### Decision 2 - line level vs document level

**Alternatives.**
(a) Document level, one rate on the invoice total. **Rejected** - cannot represent a mixed invoice containing taxable and exempt products, which is a stated requirement.
(b) Line level, VAT rounded once at document level from an unrounded line sum. **Rejected** - the printed invoice's visible line VAT amounts would not add up to its printed total. A customer checking the arithmetic would find it wrong.
(c) Line level, rounded per line, then summed. **Chosen.**

### Decision 3 - rounding strategy *(recorded here as requested)*

> **VAT is computed per line, rounded to the currency's precision at the line (`ROUND_HALF_UP`; USD 2 dp, LBP 0 dp), and document VAT is the exact sum of the rounded line amounts. The document total is never independently rounded - it is always the sum of its parts.**

VAT-inclusive pricing derives VAT **by subtraction** (`priceEx = round(priceInc / (1+rate))`, `vat = priceInc - priceEx`), so the price the customer was quoted is exact by construction rather than off by a cent.

### Decision 4 - snapshot on the line

`SalesOrderItem` and `SupplierPurchaseLine` store `taxRateSnapshot`, `taxCodeSnapshot`, `unitPriceExVat`, `vatAmount`, `lineTotalIncVat`, computed once at finalization.

**Reason.** No historical invoice reads `TaxRate`, so **changing a rate cannot alter one**. Same discipline as ADR-15's cost snapshot, applied to tax. It is also what makes a refund reverse the VAT actually charged rather than today's rate.

**Consequences.** Exempt and zero-rated are distinct (`TaxRate.code`, not rate value). A product with no profile inherits the default - it does **not** silently become exempt. VAT reporting is a **report over snapshotted line data and requires no General Ledger** - `GENERAL_LEDGER_DECISION.md` stands unchanged.

---

## ADR-21 · Currency x VAT: convert each component once, never re-derive

**Status:** Approved 2026-08-26

**Context.** A VAT-inclusive LBP invoice converted to USD is where rounding discrepancies hide.

**Alternatives.** (a) Convert the total, back-compute base VAT from it. **Rejected** - at ~90,000 LBP/USD a single cent of LBP rounding becomes a visible USD discrepancy that no one can explain. (b) Convert subtotal, VAT and total each once, and store all three. **Chosen.**

**Chosen.** VAT is computed in the transaction currency; `baseSubtotal`, `baseVatAmount`, `baseTotalAmount` are each converted once and stored.

**Consequences.** Base VAT is never re-derived from a converted total. This is invariant **INV-22**, and it is the reason "currency conversion must not cause unexplained VAT discrepancies" is testable rather than aspirational.
