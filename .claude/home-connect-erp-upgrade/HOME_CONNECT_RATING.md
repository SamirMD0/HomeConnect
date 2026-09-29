# HOME CONNECT RATING

Strict assessment. Scores are justified from code, not from volume or polish.

**Scale**

```
0–2  absent or fundamentally broken
3–4  very weak / prototype
5    usable but incomplete
6    functional with meaningful weaknesses
7    solid
8    very strong
9    mature professional implementation
10   exceptional / difficult to improve materially
```

**A scoring note.** Absent capabilities are scored as absent. Where a capability is absent *and this business does not need it*, the score is still low but is marked **[N/A-ish]** and is **excluded from the aggregate scores** — otherwise the system would be punished for correctly declining to build a warehouse module for a shop with one stockroom.

---

## Scores

| Area | Score | Confidence | Justification |
|---|---:|---|---|
| **Architecture** | **8.0** | High | Real vertical slices; genuine layering; pure `domain/` with no ORM import; explicit transaction boundaries via one helper; `tx` threaded through repositories. Deductions: legacy layer coexists, orphaned live-mounted transactions module. |
| **Database design** | **8.5** | High | 28 models, 33 migrations, `Decimal(12,2)` throughout with **zero float money columns**, pervasive `onDelete: Restrict`, unique constraints used to make bad states unrepresentable, purpose-built composite indexes, `pg_trgm` search. Deductions: five inconsistent soft-delete conventions, dead `branchId` columns. |
| **Customer management** | **8.0** | High | Complete CRUD, excellent fuzzy search, derived balances, activity timeline, corrections. Missing credit limit and printable statement. |
| **Supplier management** | **7.5** | High | Full CRUD, derived payables, priced purchase lines, audit, duplicate-receipt warning. Missing due dates and aging on payables. |
| **Customer ledger / debt** | **8.7** | High | Balances derived from non-voided allocations — **drift is structurally impossible**. Immutable records, void-not-delete, 9-action correction audit with before/after JSON. Deductions: no running balance, no statement. |
| **Supplier payable tracking** | **7.5** | High | Same derived-balance discipline. Deductions: no due dates → cannot answer "what must I pay this week". |
| **Inventory** | **8.5** | High | Append-only movement ledger + compare-and-set on **every** path with 409 on conflict + `@unique` movement links making double-application unrepresentable + a self-reconciliation report. Deduction: the CAS/rollback behaviour is only directly proven by skipped tests. |
| **Warehouses** | **0.0** | High | **[N/A-ish]** Does not exist. `warehouse` matches only a lucide icon. Not needed for one stockroom. *Excluded from aggregates.* |
| **Multi-branch support** | **0.5** | High | Nullable `branchId` columns with no model, FK, filtering, or UI. Not "partial" — **dead scaffolding that misleadingly implies a capability**. The 0.5 is for the columns existing at all. |
| **Sales invoices** | **6.5** | High | Strong order model: 3 channels, 8-state validated workflow, line snapshots, explicit debt/installment linking, full audit. Deductions: **no printable invoice**, no tax, per-line discount disabled, and Finding 6.1 (cash never becomes a `Payment`). |
| **Purchase invoices** | **7.0** | High | Priced lines, PRODUCT vs MANUAL kinds, payable creation, receiving void via compensating movements. Deductions: **cost price never updates from receipts**, no due dates, no supplier returns, no expense capture. |
| **POS** | **3.0** | High | No cart, tender, drawer, shift close, or receipt. Scanner Hub is a strong *lookup and order-entry* tool with a working scan→quick-order path — that earns the 3.0, not more. |
| **Barcode workflow** | **8.0** | High | Unique SKU + unique manufacturer barcode, EAN-13/UPC-A/EAN-8 detection, PC wedge mode, and **phone-as-scanner over LAN with careful crypto**. Above expectation. |
| **Printing** | **5.0** | High | Product labels are genuinely good — auto-fit, native symbology, bulk A4 tiled sheets with PDF export. But **no invoice, no receipt, no customer statement**, and no thermal printer support. Half the printing a shop needs. |
| **Returns / refunds** | **3.0** | High | A `RETURNED` state exists with correct guards, but the return is a 3-step manual dance and **no refund or credit-note concept exists anywhere**. |
| **Reporting** | **7.0** | High | 16 reports, 5 categories, CSV on all, derived from the same domain functions as the screens so they reconcile by construction. Deductions: **no profit/margin/COGS**, no valuation, no cash-flow, no supplier aging, plus the Finding 6.1 blind spot. |
| **Dashboard** | **7.0** | High | Seven analytics domains, cached, plus a genuinely well-designed alerts centre (3 severities, sorted, each with up to 3 named offenders and deep links). Rated on usefulness: it answers every operational question and **no financial one**. |
| **Multi-currency** | **0.0** | High | `currency: 'USD'` is a hardcoded literal type. No rates, no conversion, no second currency. Scored as absent as of the audit. **Dual USD/LBP approved 2026-08-26** — Phases 1–3 target 8.0+. See CURRENCY_AND_VAT_DECISION.md. |
| **Security** | **7.0** | Medium-High | Strong: in-memory access token, httpOnly refresh, bcrypt 12, lockout, step-up admin re-auth with audit, strict Electron CSP, helmet, CORS allowlist, Zod everywhere, redacted logs, loopback bind. Weak: **hardcoded JWT fallback secret**, revoked users keep sessions, no login rate limiting. Medium confidence: no penetration testing was performed. |
| **Permissions** | **5.5** | High | Implementation is careful and consistent — 49 `requireRole` sites plus five per-domain policy modules. The **model** is only ADMIN/EMPLOYEE with no permission table and no role editor. Good execution of an insufficient model. |
| **Auditability** | **9.0** | High | Five purpose-built audit tables. Mandatory reasons. Before/after JSON. Actor name **and** username snapshotted so a later rename never rewrites history. Request ID and IP. Void-not-delete throughout. Compensating movements rather than edits. **This is mature professional work.** |
| **Backup / recovery** | **8.5** | High | Scheduled + manual, SHA-256 checksums, `pg_restore --list` readability verification, **automatic pre-restore safety backup**, app-wide write blocking during restore, admin password gate, post-restore verification, retention, import. Deduction: no rehearsed restore drill on real data. |
| **Testing** | **6.0** | High | 2,181 passing tests, 0.49 test:code ratio, excellent pure-domain coverage — verified by running it. But **all 10 DB integration files are skipped by default** behind eight env flags, there is **no E2E framework**, and there is **no CI at all**. Logic is well protected; infrastructure is barely protected. |
| **Reliability** | **7.0** | Medium | Strong by design: derived balances, CAS on stock, ACID boundaries, idempotent payments, graceful shutdown, verified backups. But no production telemetry exists, the concurrency guarantees are only proven by skipped tests, and there is no CI to catch a regression. Medium confidence — no observed production failure data. |
| **UX** | **7.0** | Medium | Coherent design system, bilingual EN/AR throughout, React Query so screens stay fresh, loading/disabled states handled, alerts that name who to chase. Deductions: a 6-step wizard to create a sales order, some unreadable single-line JSX, accessibility only partly addressed. Medium confidence — assessed from code, not from watching a user. |
| **Maintainability** | **7.5** | High | Consistent slice conventions, colocated tests, pure domain modules, exceptional schema comments. Deductions: legacy layer, orphaned module, ~69.5k lines maintained by one person. |
| **Production readiness** | **6.0** | High | It genuinely runs a real business today. But: no CI, integration tests skipped, JWT fallback secret, no rehearsed restore, and — for a *financial* system — no profit visibility. |

---

## Aggregate scores

Warehouses excluded as legitimately not-needed. Multi-branch and multi-currency **included** — they are real absences whose relevance is a business decision, not a settled one.

| Aggregate | Score | Composition |
|---|---:|---|
| **Operational ERP score** | **6.8 / 10** | Customers, suppliers, ledger, payables, inventory, sales, purchases, POS, barcode, printing, returns, reporting, dashboard, multi-branch, multi-currency |
| **Technical quality score** | **8.0 / 10** | Architecture, database, security, permissions, auditability, maintainability |
| **Production readiness score** | **6.5 / 10** | Testing, reliability, backup/recovery, production readiness |
| **Overall score** | **7.1 / 10** | Weighted: operational 40%, technical 30%, readiness 30% |

### Reading the spread

The 1.2-point gap between technical quality (8.0) and operational completeness (6.8) is the story of this system.

**The engine is better than the car.** The transactional core — derived balances, append-only ledgers, compare-and-set concurrency, audit trails, verified backups — is built to a standard well above what the finished feature set delivers. Nothing needs to be rebuilt. What is missing is *surface*: documents to hand people, profit figures to make decisions with, and a few operational flows (returns, cost updates, payable due dates) that stop short of complete.

**This is the good problem to have.** Adding surface to a sound core is ordinary work with predictable effort. Repairing a rotten core under a polished surface is not.

---

## Critical Problems

Only issues that could realistically cause wrong debt, wrong stock, lost data, duplicate financial records, a security breach, incorrect financial reports, or an inability to recover.

### CP-1 — Hardcoded JWT fallback secret · Severity: HIGH

[auth.middleware.ts:5](backend/src/middleware/auth.middleware.ts#L5), [auth.service.ts:7](backend/src/services/auth.service.ts#L7)

```ts
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
```

If `JWT_SECRET` is unset, the app boots on a secret published in the source. Anyone who can reach the port can forge an admin token. `preflight.checks.ts` lists it as required but **preflight is an admin API endpoint, not a startup gate** — so the failure is silent.

*Mitigating:* `Setup-HomeConnect.ps1` generates a CSPRNG secret; the server binds `127.0.0.1`. *Residual:* dev runs, hand-edited configs, restored/copied configs, any future non-loopback bind. **The mitigation is procedural; the defect is structural.**

**Fix:** fail startup when the variable is missing. One-line change, ~1 hour with tests.

---

### CP-2 — Cash on sales orders never becomes a `Payment` · Severity: HIGH

`SalesOrder.paidAmount` records money received, but no `Payment` row is created, and `customer-financial-summary.repository.ts` contains **zero references to sales orders**. Money taken at the counter is therefore absent from customer payment history, from the "Customer Payments" and "Customers Who Paid" reports, and from the `collected` metric feeding Monthly Review and the Analysis Portal.

**This does not corrupt data** — the boundary is well-guarded and the two stores never disagree. **It makes financial reports incomplete**, which for an owner reading a monthly review is materially the same problem.

*Confidence: High on the structure, Medium on the magnitude — it scales with how much of the business is cash sales.* **This should be confirmed against real data before it is designed.**

---

### CP-3 — No idempotency outside payments · Severity: MEDIUM-HIGH

`normalizeIdempotencyKey` and the fingerprint machinery exist and are used only for customer payments. **Sales order creation, supplier purchase creation, and receiving posting have no idempotency key.**

`Button` disables on `isLoading`, which stops the common double-click. It does not stop a network retry, a hung request the user resubmits, or a client crash between send and response. The consequence is a **duplicate supplier purchase invoice (duplicate payable) or a duplicate receiving (duplicate stock increase)** — both of which then require an admin void and leave permanent noise in the audit trail.

The pattern to copy already exists in the codebase.

---

### CP-4 — DB integration tests are skipped by default, and there is no CI · Severity: MEDIUM-HIGH

All 10 integration files sit behind `RUN_*_DB_TESTS` env flags (eight different ones, three of which also require a specific database name). Verified: `npx vitest run` reports `256 passed | 10 skipped`.

So the guarantees this system's safety rests on — CAS conflict aborts, transaction rollback leaving no partial state, unique constraints holding under concurrency — are **written but not routinely executed**. With no `.github/` and no pipeline, nothing runs them but memory.

This is not a hypothetical: it is precisely the class of regression an AI-assisted change would introduce, and precisely the class that unit tests with mocked repositories cannot catch.

---

### CP-5 — Revoked users retain working sessions · Severity: MEDIUM

[auth.middleware.ts:19-35](backend/src/middleware/auth.middleware.ts#L19) verifies the signature only. `isActive` and `deletedAt` are never re-checked. Deactivating an employee does not end their session.

**Fix:** a user lookup in `requireAuth` (or a short-TTL cache). Half a day.

---

### CP-6 — Legacy transaction system is live and user-facing · Severity: MEDIUM

> **CORRECTED 2026-08-30.** Originally titled "orphaned … live-mounted" and rated *Risk Low, 4–8 h, mostly verification*. All three were wrong.
>
> The module is **reachable and rendered**: `CustomerProfilePage.tsx:10` imports `TransactionList`, `transactions.api.ts` calls the router, `customers.controller.ts` uses `TransactionsService`, and `dashboard-activity.repository.ts:9` reads `activity_logs` (I grepped writers only).
>
> Both surfaces are **live but permanently empty** — 0 rows, nothing writes them. So the hazard is not "invisible money records" as originally stated; it is two blank panels plus a table that cannot be dropped without breaking a dashboard endpoint.
>
> **Revised: 10–16 h, Risk Medium**, split into T9a (remove the UI + `Transaction`, keep `activity_logs`) and T9b (decide the fate of dashboard Recent Activity). See `FEATURE_INVENTORY.md` §E.

### Original finding (retained for the record — see correction above)

`app.use('/api/v1/transactions', requireAuth, transactionsRoutes)` at [app.ts:128](backend/src/app.ts#L128) exposes a **second, parallel customer-money system** to any authenticated user, with no UI reaching it. Two hazards: an API caller can write money records invisible to every screen, and any future report joining `transactions` would double-count against `debts`.

**Fix:** confirm the table is empty, then delete the module and the model. Half a day, mostly verification.

---

### CP-7 — No rehearsed restore · Severity: MEDIUM

The backup *system* is excellent and its code is tested. But **nobody has restored the real database on the real hardware and timed it.** An untested restore is a hypothesis. The memory note that the business PC now carries more data than the laptop makes this sharper: restore duration on real volume is unknown.

**Fix:** one scheduled drill, documented. Half a day, and it converts the project's best safety feature from "believed to work" into "known to work."

---

### CP-8 — Cost prices go stale · Severity: MEDIUM

`SupplierPurchaseLine.unitPrice` records what was actually paid. `Product.costPrice` is **never updated from it**. The pricing engine then computes selling prices from a cost that may be months old — so in a period of rising prices, the shop silently under-prices.

This is a *wrong-money* risk that produces no error and no audit entry. It is invisible until margins are checked — which, per §10 of the audit, cannot currently be done at all.

---

## Not critical — ordinary technical debt

Recorded so it is not confused with the above: legacy `controllers/services/repositories` layer coexisting with feature slices; five inconsistent soft-delete conventions; dead `branchId` columns; very long single-line JSX; the 6-step sales-order wizard; `Json` specifications limiting queryability; incomplete accessibility; the disabled per-line discount column.

None of these can cause wrong money, wrong stock, or lost data.

---

## What Home Connect Already Does Well

**Do not rewrite any of this.** Each item below is at or above professional standard and represents the project's accumulated value.

### 1. Derived balances — 9/10
No balance is stored anywhere. Every customer and supplier balance is recomputed from non-voided allocations and transaction directions. **The single most common failure mode in small-business ERPs — balance drift — is structurally impossible here.** Many commercial systems, BIRD very likely included, store balances and reconcile them with nightly jobs. This is better.

### 2. Money precision — 10/10
`Decimal(12,2)` for every monetary column, a dedicated `money.ts` that rejects >2 decimal places and enforces explicit rounding modes, and **zero float money columns repo-wide**. There is nothing left to improve here.

### 3. Inventory concurrency and integrity — 9/10
Compare-and-set on every stock path with an explicit 409; `@unique` movement links making double-application unrepresentable at the database level; an append-only movement ledger; and a reconciliation report that **proves** `stockQuantity` equals the movement sum. The system can audit its own arithmetic.

### 4. Audit trails — 9/10
Five purpose-built audit tables, mandatory reasons, before/after JSON, actor name *and* username snapshotted so a later rename cannot rewrite history, request ID and IP. Void-not-delete and compensating-movement reversal throughout. Better than most commercial small-business ERPs.

### 5. Backup and restore — 8.5/10
Checksums, archive readability verification, an **automatic pre-restore safety backup**, app-wide write blocking during restore, admin password gate, post-restore verification. Well above class.

### 6. Immutability discipline — 9/10
A posted receiving is never edited — voiding writes a compensating movement of a *reserved type no user can select*, and the original document survives untouched. A prepaid delivery is reversible without rewriting the financial record. This philosophy is applied consistently, which is harder than applying it once.

### 7. Schema comments — 10/10
Several comments explain **rejected alternatives and why** — see [schema.prisma:1261-1268](backend/prisma/schema.prisma#L1261-L1268) on why a proposed unique constraint would have broken the very failure path the table exists to record, and [schema.prisma:1202-1205](backend/prisma/schema.prisma#L1202) on why supplier receipt numbers are deliberately not unique. This is documentation of *reasoning*, which is what actually decays. Exceptional.

### 8. Session security — 8.5/10
Access token in memory only — **never `localStorage`** — httpOnly refresh cookie, single-flight refresh guard, bcrypt 12, account lockout, step-up admin re-authentication with its own audit table. Better than the typical React ERP by a clear margin.

### 9. Electron hardening — 9/10
Strict production CSP with no `unsafe-eval` and no inline script, documented against an actual bundle inspection, `connect-src` limited to the loopback backend.

### 10. Scanner security — 9/10
SHA-256 token hashes, `timingSafeEqual` comparison, pairing TTL, idle *and* absolute session TTLs, a 3-session cap, rate limiting, and deliberate in-memory-only storage so a restart invalidates every paired phone. For a convenience feature, this is exceptional care.

### 11. Domain purity — 8.5/10
`money.ts`, `balances.ts`, `payment-allocation.ts`, `installment-schedule.ts`, `business-date.ts` have no Prisma import and are independently testable — which is exactly why the 2,181 tests are meaningful rather than decorative.

### 12. In-app maintenance — 8/10
Migrations and repairs applied from inside the app behind a verified backup, with append-only `RepairHistory`. No pasting SQL into pgAdmin on a live business database. Directly addresses the real operational risk of a non-technical operator on a production machine.
