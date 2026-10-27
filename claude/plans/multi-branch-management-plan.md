# Multi-Branch Management — Implementation Plan

Status: **PLAN ONLY** — nothing implemented, no data touched. Prepared 2026-10-17 against `develop` @ `2d3f040` (plus uncommitted working-tree changes unrelated to this feature).

Legend: **[V]** verified in source · **[A]** assumption that must be confirmed · **[D]** decision needed from the owner (see §7).

---

## 0. How this was inspected

- `CLAUDE.md` / `.claude/CLAUDE.md` read. Graphify: `graphify-out/graph.json` exists (10,728 nodes, rebuilt 2026-10-17 by hook) and was used for navigation (`graphify query` over sales, financial, dashboard, import modules). **Limitation [V]:** the graph does not index `backend/prisma/schema.prisma`, and `graphify explain "branch"` only resolves to git-branch sections of `docs/project/PROJECT_ROADMAP.md` — there is no `Branch` entity anywhere in code. All conclusions below were verified against source files, not graph edges.
- Read: schema models, financial domain (`balances.ts`, `money.ts`), financial/sales/supplier authorization, reports and dashboard routes, the product CSV importer (backend + dialog), mobile LAN gateway, auth middleware, backup/pre-migration guard, ERP-upgrade planning docs.

---

## 1. Current state

### 1.1 Branch support — essentially absent

| Item | State | Evidence |
|---|---|---|
| `Branch` table / entity | **Missing** | No `model Branch` in `backend/prisma/schema.prisma` (models listed L392–1927) [V] |
| `branchId` columns | **Dead scaffolding** — nullable UUID, no FK, no index, never written | `User.branchId` L404, `Customer.branchId` L514, `ActivityLog.branchId` L543 [V]; added in the first migrations `20260723075336_init`, `…091230_init_customers`, `…094305_init_ledger` [V] |
| Code reading `branchId` | Only echoed back on user reads | `users.repository.ts:17,41`, `auth.controller.ts:130` (`/auth/me` select), `frontend/src/features/dashboard/types.ts:68` [V] |
| Branch on JWT / request | **Missing** — token is `{ userId, role }` only | `backend/src/middleware/auth.middleware.ts:30-39` [V] |
| Branch on Supplier, SalesOrder, Payment, Debt, SupplierTransaction, etc. | **Missing** | Schema [V] |
| Planned direction | **Conflicting**: Phase 4 plan T4 says *drop* the dead `branchId` columns because they "imply isolation that does not exist" (R-21) | `.claude/home-connect-erp-upgrade/phases/phase-04-production-hardening/PLAN.md:127-142`, `RISK_REGISTER.md:191-194` [V]. Not yet executed — columns still in schema [V]. ERP positioning doc: "One site, one machine" (`claude/documentation/ERP_POSITIONING.md:319`) [V] |

**Conclusion:** there is nothing to extend. Multi-branch is a new feature that supersedes Phase 4 T4. The existing nullable columns should *not* be reused as-is (no FK, unknown contents); the new design replaces them deliberately (§2.1).

### 1.2 Accounting model — sound basis for branch scoping

| Fact | Evidence |
|---|---|
| Balances are **derived, never stored**: obligation − non-voided allocations − credits | `backend/src/features/financial/domain/balances.ts` (`calculateDebtBalance`, `calculateObligationBalance`) [V]; no balance column on `Customer` (L502-531) or `Supplier` (L1658-1686) [V] |
| Every money row stores original amount, `currency` (USD/LBP), `exchangeRate`, and a **base (USD) amount** fixed at posting time | `Debt` L550+, `Payment` L678+, `SalesOrder.base*` L1289+, `SupplierTransaction.baseAmount` L1840+ [V]; conversion in `money.ts:128 toBaseAmount` (LBP ÷ rate → USD) [V] |
| Totals are summed on base amounts | e.g. `suppliers/payables/supplier-payables.ts:67-89` sums `baseAmount` [V] |
| Supplier balance = Σ INCREASE_OWED − Σ DECREASE_OWED, `ACTIVE` only | `SupplierTransactionDirection`, `supplier-payables.ts` [V] |
| Walk-in sales and counter payments have **no customer** | `SalesOrder.customerId String?` L1295, `Payment.customerId String?` L680 [V] → branch cannot be inferred from the customer for these rows |
| Composite-key integrity pattern already used | `SupplierReceiving @@unique([id, supplierId])` + `SupplierTransaction` FK on `[supplierReceivingId, supplierId]` (L1700s/L1845) [V] — the same technique enforces "same branch" at DB level |
| Financial integrity reports exist (reported vs independently recomputed outstanding) | `reports/rows/report-rows.service.ts:404,436` slices `customers-financial-integrity`, `suppliers-financial-integrity` [V] — reusable as the reconciliation oracle |
| Financial mutations are ADMIN-only | `financial/authorization/financial-policy.ts` (`assertCanPerformFinancialMutation`) [V]; roles are only `ADMIN`/`EMPLOYEE` (schema L13) [V] |
| Phone uniqueness is **global and app-level only** (no DB constraint) | `services/customers.service.ts:10-12,124-126` via `CustomersRepository.findByPhone` [V] |
| Stock is **global per product** | `Product.stockQuantity` L868, no branch dimension [V] |
| Document numbers global unique | `SalesOrder.orderNumber @unique` L1291, `SalesReturn.returnNumber @unique` L1443 [V] |
| Shop identity is a singleton | `BusinessSettings` id `"primary"` L467 [V] |

### 1.3 Accounting features inventory (what must become branch-aware)

| Feature | Location [V] |
|---|---|
| Customer debts, installment plans, payments, allocations, prepaid purchases | `features/financial/{debts,installment-plans,payments,prepaid,ledger}` |
| Customer statement (opening balance + running balance) | `financial/customer-statement/customer-statement.service.ts:123-144` |
| Customer financial summary / activity | `financial/customer-summary/*` |
| Receivables list + tiers | `financial/receivables/*` |
| Credit limits | `financial/credit-limits/*` |
| Sales orders, counter payments, returns, cash refunds, customer credits | `features/sales/{sales-orders,returns}` |
| Supplier transactions, purchases, receivings, receipts, ledger, payables aging | `features/suppliers/*` |
| Report rows + CSV export (17 slices incl. receivables aging, payables aging, sales, unpaid, integrity) | `reports/rows/report-rows.routes.ts:10-32` |
| Monthly review, monthly debts, analysis (health, cashflow, sales-vs-debt, supplier position) | `reports/{monthly-review,monthly-debts,analysis}`; shape in `analysis.types.ts:21-70` |
| Dashboard: financial summary, overview, customer/supplier financial, sales, alerts, activity, month-end | `dashboard/dashboard-financial.routes.ts`, `dashboard/dashboard.routes.ts:9-19`, `routes/dashboard.routes.ts` |
| Profit / gross-margin report | **Not present** (no `grossProfit`/COGS fields anywhere in `features/`) [V] |
| Cash position | Only period cash-flow: `analysis.cashflow.collections`, `supplierPayments`, `netCollectionPosition`; month-end `collected` [V]. No cash-drawer/till ledger. |

**Raw SQL that a Prisma-level filter would miss [V]:** `reports/rows/report-rows.repository.ts`, `services/dashboard.service.ts`, `features/customers/customer-suggestions.service.ts`, `lib/search-query.ts`, `features/inventory/inventory.repository.ts`, `features/diagnostics/diagnostics-export.service.ts` (others in that list are maintenance/system and not tenant data).

### 1.4 Product CSV import — what actually exists

| Capability | State | Evidence [V] |
|---|---|---|
| Upload | Client reads file, posts `csvText` (≤750 KB, ≤2,000 rows) | `product-import.validator.ts:8-13`, `product-import.parser.ts:4-5` |
| **Column mapping** | **Not present.** The parser is hard-wired to one accounting-report layout (labels repeated on every row: `Family:`, `Code`, `Description`, `Qty`, `Cost USD`, `Total`). The only "mapping" is family → category. | `product-import.parser.ts:44-95`; `updateProductImportSchema` = `categoryMappings` only |
| Generic CSV tokenizer | Present, reusable | `parseCsvRecords` `product-import.parser.ts:102` |
| Durable draft → preview → commit | Present: `ProductImport` row stores parsed rows, mappings, decisions, result; status `DRAFT`/`COMMITTED` | schema L926-950; routes `products.routes.ts:31-34` |
| Validation & preview statuses | Per row `READY` / `CONFLICT` / `INVALID` with issue list and summary counts | `product-import.service.ts` `buildPreview` |
| Duplicate detection | In-file duplicate code; existing external identifier; same brand+model; same name+model | `buildPreview` conflict kinds `FILE_CODE/EXTERNAL_CODE/MODEL/NAME_MODEL` |
| Create/update behaviour | Per-row decision `CREATE` / `MERGE` (chosen `mergeFields`) / `COMBINE` / `EXCLUDE` | `importDecisionSchema` validator L21-37 |
| Repeat-import safety | (a) same `fileHash` already committed → warning `previousCommittedImport`; (b) stable identity via `ProductExternalIdentifier @@unique([sourceSystem, normalizedCode])`; (c) commit is idempotent (`COMMITTED` → returns stored result); (d) stale-conflict recheck inside the transaction (`assertCreateAvailable` → 409 `PRODUCT_IMPORT_STALE`) | service `commit`, schema L907-922 |
| Sensitive action gate | Account password + `AdminVerificationLog` for inventory reconciliation | `commit` → `verifyAdminPassword` |
| Audit | `writeServiceAudit` per created/merged product; opening stock via `StockMovement` (never by overwriting quantity) | service |
| Atomicity | Whole commit in `runFinancialTransaction` | service L95 |
| UI | `ProductCsvImportDialog.tsx` (787 lines) — upload, preview table, conflict resolution, previous-import banner (L321) | frontend |

### 1.5 Mobile integration [V]

The LAN gateway allow-lists exactly the supplier-facing endpoints the phone uses (`features/scanner/mobile-api-gateway.ts:7-23`): `GET /suppliers`, supplier purchases, receipt-check, `supplier-ledger`; `POST` purchases, supplier transactions, receipts. These are branch-owned data → the mobile app must become branch-aware. Product scan endpoints are catalog-level.

### 1.6 Deployment & migration safety [V]

- Two runtime modes: Electron desktop with local PostgreSQL (`docs/setup/ELECTRON_BUSINESS_PC_SETUP.md`), and hosted (`HOSTED_MODE`, `render.yaml` staging+production services running `prisma migrate deploy`).
- Desktop applies shipped migration SQL itself behind a pre-migration backup guard (`desktop/src/pre-migration-guard.ts` `runPreMigrationGuard`); backups via `pg_dump`/`pg_restore` with checksum and `--list` validation (`backup.service.ts:98-280`).
- 69 migrations so far; repair/data-fix infrastructure exists (`backend/prisma/repair`, `data-fixes`, `features/maintenance`).

---

## 2. Recommended design

### 2.1 Ownership model — **separate customer/supplier records per branch** (recommended)

| Option | Effect on existing code | Isolation | Verdict |
|---|---|---|---|
| **A. Per-branch records** (`Customer.branchId`, `Supplier.branchId` NOT NULL) | Every balance computation is already keyed by `customerId`/`supplierId`, so balances become per-branch **with zero changes to balance math** | Strong; DB-enforceable with composite FKs | **Recommended** |
| B. Shared identity + branch-specific accounts | Every debt/payment/order/allocation query must add an account dimension; statement, aging, credit limits, credits all rewritten | Weaker during transition; high regression risk on money paths | Rejected for now |

Same person/supplier in two branches = two records. Optional, later and read-only: a "also a customer at Branch X" hint matched by normalized phone, shown only to users who can see both branches. **Never net or merge balances across branches.**

### 2.2 Schema changes

```
model Branch {
  id        uuid PK
  code      String @unique     // short, used on labels/doc prefixes
  name      String @unique
  address, phone  String?      // printed on that branch's documents
  isActive  Boolean @default(true)
  createdAt/updatedAt, createdById
}

model UserBranchAccess {          // replaces dead User.branchId
  userId, branchId  (@@id([userId, branchId]))
  grantedById, grantedAt
}
```

`branchId uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT` + index on:

| Table | Source of truth for its branch | DB enforcement |
|---|---|---|
| `customers`, `suppliers` | Chosen at creation (or import batch) | `@@unique([id, branchId])` (enables composite FKs); `@@unique([branchId, phoneNormalized])` for customers **[D2: per-branch phone uniqueness]** |
| `debts`, `installment_plans`, `customer_credits` | = customer's branch | composite FK `(customerId, branchId) → customers(id, branchId)` |
| `sales_orders` | Selected branch at creation (walk-in has no customer) | composite FK on `(customerId, branchId)` when customer present (Postgres skips FK check when `customerId` is NULL — correct for walk-ins) |
| `payments` | = sales order's branch (counter payment) or customer's branch | composite FKs to customer and to sales order |
| `sales_returns`, `cash_refunds` | = original sales order's branch (books follow the sale) | composite FK `(salesOrderId, branchId) → sales_orders(id, branchId)`; refunds `(salesReturnId, branchId)` |
| `supplier_transactions`, `supplier_receivings` | = supplier's branch | composite FK `(supplierId, branchId)`; existing `[receivingId, supplierId]` FK then transitively guarantees same branch |
| `service_jobs` | = customer's branch | composite FK |
| `activity_logs` | acting branch (nullable for global admin actions) | plain FK |
| `customer_imports` (new) | batch destination | plain FK |

Child rows that only point at a branch-owned parent (`sales_order_items`, `installments`, `payment_allocations`, `sales_return_*_allocations`, `customer_credit_applications`, `supplier_purchase_lines`, receipts) **do not get their own column**; they inherit through the parent. Cross-parent links inside them (payment ↔ debt, credit ↔ order) are guarded by a service assertion **plus** a new integrity-report check (`branch_mismatch`) — proportionate, avoids triggers.

Global (unscoped) data stays global: products, categories, brands, tax, exchange rates, pricing cards, label settings, users. **Stock stays global in this project [D3]** — `Product.stockQuantity` is one number; per-branch stock is a separate, larger project.

Document numbers: keep the global unique sequence (no renumbering of history). Optional branch code prefix for new documents only — routine default: **no prefix change** in v1, branch name printed on the document instead.

### 2.3 Accounting invariants (tested, see §5)

1. **I-1 Branch closure:** a transaction's branch equals the branch of every customer/supplier/order/return/debt it references.
2. **I-2 Immutability:** `branchId` on any money row is never updated after posting. No API accepts `branchId` on update. (Moving a customer between branches is not in v1; if ever needed, it is a close-out in A + opening debt in B with audit, never a rewrite.)
3. **I-3 Additivity:** for every metric M and period, `M(all) = Σ M(branch)` exactly (base USD, 2dp, no re-rounding of sums).
4. **I-4 History preservation:** every historical customer/supplier balance, statement and report total is byte-identical before and after migration.
5. **I-5 Separation of sides:** receivables and payables are never netted. Unapplied customer credits (a liability) are reported separately from receivables.
6. **I-6 Currency rule unchanged:** totals use stored `base*` amounts (USD) converted at posting time (`toBaseAmount`). LBP is never added to USD raw; original-currency amounts are shown per record only.

### 2.4 Permissions & request scoping (backend-enforced)

- **Access:** `ADMIN` → all branches implicitly. `EMPLOYEE` → only branches in `UserBranchAccess` **[D4]** (default: each employee assigned exactly one branch).
- **Scope resolution middleware** (new `middleware/branch-scope.middleware.ts`, after `auth`): reads `X-Branch-Scope: <branchId> | all` (header so it applies uniformly to JSON, CSV export and mobile), loads the user's accessible branch set from DB (not from the JWT, so revocation is immediate), and sets `req.branchScope = { mode: 'single', branchId } | { mode: 'all', branchIds }`. Rejects with 403 if the branch is not accessible; `all` for employees resolves to *their* branches only.
- **Reads:** every repository function for branch-owned data takes `scope` as a **required parameter** (`where: { branchId: { in: scope.branchIds } }`). No implicit Prisma extension — it would not cover the raw-SQL files in §1.3 and hides the contract. Raw SQL gets an explicit `branch_id = ANY($n)` parameter.
- **By-id reads/writes:** `findById` becomes `findInScope(id, scope)` → 404 (not 403) when out of scope, so IDs from other branches do not leak existence.
- **Writes:** every mutation requires exactly one accessible branch, including actions whose branch can be derived from an existing record. A single scope is writable; `all` (including a missing header) is writable only when exactly one branch is accessible, preserving single-branch compatibility. Zero branches → `409 NO_BRANCH_AVAILABLE`; more than one → `409 BRANCH_SELECTION_REQUIRED`. Branch is **derived server-side** from the parent (customer/order/supplier) whenever one exists; parent-less creations use the resolved write branch. Any referenced entity outside that branch → 404.

**Phase 4 mutation context:** for any mutation started from the **All branches** view, the UI must send `X-Branch-Scope` set to the record’s branch. This includes updates, cancellations, voids, refunds, credit application, and receipt actions; deriving the branch from a record does not exempt the request from the single-branch write policy. Parent-less creates require the user to select a branch.
- **Guard rail test (like the planned INV-14 meta-test):** enumerate all registered routes under branch-owned prefixes and assert each passes through `branchScope`; a new endpoint cannot ship unscoped by omission.

### 2.5 Historical records (no guessing, no destructive reassignment)

Before migration the business must state **[D1]** whether every existing record was created in one physical shop. ERP docs describe a single site (`ERP_POSITIONING.md:319`) but that is documentation, not proof.

- **If yes (expected):** migration creates exactly one branch named by the owner (e.g. "Main") and fills `branchId` on existing rows in one transaction. This is a factual assignment, not a guess, and it changes no amounts.
- **If no / unsure:** migration creates a branch "Unassigned (pre-branch history)". Its records stay visible in "All branches" and to admins, can still be paid/settled, and can be moved **only** via an explicit admin tool that moves a whole customer (with all dependent rows) to a real branch, with password, audit row and a before/after balance check — never automatically.
- The dead `User.branchId` / `Customer.branchId` / `ActivityLog.branchId` columns are first checked to be entirely NULL (query recorded as evidence); if any are non-null the migration stops for review. Then they are replaced by the new FK columns.

---

## 3. UI behaviour

### 3.1 Branch selector
- Global selector in the app header: list of accessible branches + **"All branches"** (shown only when the user has ≥2). Persisted per user (localStorage, re-validated by the server on every request via the header).
- Employee with one branch: selector shows the branch name read-only.
- Changing scope invalidates all cached queries (React Query keys include scope).
- **Create actions are disabled in "All branches"** with the hint "Select a branch to create records". Opening a record from "All" shows its branch badge and switches mutations to that record's branch.

### 3.2 "All branches" view
- Every list (customers, suppliers, sales, payments, returns, supplier transactions, receivings) gets a **Branch** column/badge and a branch filter.
- Every total/KPI shows the consolidated figure with an expandable **per-branch breakdown** whose rows sum to the total (I-3).
- CSV exports include a `Branch` column in both scopes.

### 3.3 Accounting views by scope

| Feature | Single branch | All branches |
|---|---|---|
| Customer receivables (debt) | That branch's customers' outstanding (base USD) | Σ branches + breakdown; per-customer rows labelled with branch |
| Supplier payables | That branch's suppliers' owed | Σ + breakdown |
| **"Total debt"** | Shown as **two separate cards**: *Customers owe us* and *We owe suppliers*. No netted figure is introduced. Existing `netCollectionPosition` is a *period cash-flow* (collections − supplier payments), keeps its current label. | same, per side |
| Unapplied customer credit (from returns) | Separate liability line | Σ + breakdown |
| Receipts / customer payments | Payments of that branch | Σ + breakdown |
| Supplier payments | That branch's DECREASE_OWED payments | Σ + breakdown |
| Sales / unpaid sales | Orders of that branch (incl. walk-in) | Σ + breakdown |
| Purchases / receiving | That branch's supplier transactions/receivings | Σ + breakdown |
| Returns / refunds / credits | Returns against that branch's orders | Σ + breakdown |
| Receivables aging & payables aging | Buckets for that branch | Buckets summed + per-branch bucket table |
| Customer statement | Per customer (customer is single-branch) — unchanged math | N/A (statement is always one customer) |
| Monthly review / analysis / month-end | Scoped inputs | Consolidated + breakdown; "top debtors/suppliers" lists show branch |
| Inventory position in analysis | Global (stock is not branch-scoped, labelled "all branches stock") | same |
| Profit, cash drawer | Not present today — not added by this project | — |

### 3.4 Customer CSV import (UX mirrors product import)
1. **Choose destination branch** — required first field (preselected from the header scope if single; forced choice in "All"). Shown as a prominent banner on every subsequent step: *"Importing into: Branch X"*.
2. **Upload** CSV (same size/row limits).
3. **Map columns** — auto-detected from header aliases (English + Arabic aliases, e.g. `Name/الاسم`, `Phone/الهاتف`), user can adjust; stored on the draft.
4. **Preview** — rows `READY` / `CONFLICT` / `INVALID`, issue text, summary counts, banner if this exact file was already committed **to this branch**.
5. **Resolve** — per-row `CREATE` / `UPDATE` (choose fields) / `SKIP`.
6. **Confirm** — summary: "N new, M updated, K skipped, opening debts total $X across J customers, into **Branch X**"; account password required when opening debts are included.
7. **Result** — import summary, downloadable error/skip report CSV.

---

## 4. Phased implementation

Each phase is a separate PR into `develop`, with its own migration where applicable, and is releasable on its own (feature flag `MULTI_BRANCH_ENABLED` hides the UI until Phase 4 ships).

### Phase 0 — Decisions & preconditions (no code)
- Answer §7. Record the decision that this supersedes Phase 4 T4 ("drop `branchId`") in the ERP-upgrade docs and risk register (R-21 becomes "mitigated by design").
- Capture baseline evidence on a restored copy of the live DB: per-customer and per-supplier outstanding, integrity-report CSVs, all report totals for 3 sample periods (`scripts/` snapshot tool, read-only).
- Confirm dead `branchId` columns are all NULL.
- Timing: the snapshot tool is built in Phase 2, so this evidence is captured with it after Phase 2 code exists and **before** the Phase 2 migration is applied to any real or restored-production database. It gates the release, not the coding.

### Phase 1 — Branch entity & access (no data scoping yet)

> **Implemented 2026-10-18 (uncommitted on `develop`):** migration `20261017120000_add_branches` (two new tables only); `backend/src/features/branches/*` — `GET /branches/accessible` (any user), admin-only `GET/POST/PATCH /branches`, `GET /branches/access`, `GET/PUT /branches/users/:userId/access`, each mutation audited to `activity_logs`; Settings → Branches panel with staff access grid. Deviations: (1) accessible branches are served by `GET /branches/accessible` instead of extending `/auth/me` (keeps auth unchanged); (2) the header branch selector is **deferred to Phase 4** — an inert selector before data is scoped would recreate the R-21 "implied isolation" risk. The panel shows an explicit notice that records are not separated yet.
- **Files:** `schema.prisma` (+ migration: `branches`, `user_branch_access`), new `features/branches/*` (CRUD, admin-only), `controllers/auth.controller.ts` (`/me` returns accessible branches), `users.*` (assign branches), frontend branch admin page + header selector component (inert behind flag).
- **Acceptance:** admin can create/rename/deactivate branches; employees assigned; `/me` returns branches; no change to any financial output.
- **Risk:** low.

### Phase 2 — Ownership columns & historical backfill
- **Files:** `schema.prisma` + migration in three steps inside one migration file: add nullable `branch_id` columns → backfill per D1 → `SET NOT NULL`, composite uniques/FKs, indexes; drop dead columns. Ship the SQL in the desktop installer path used by the pre-migration guard; hosted runs `prisma migrate deploy`.
- Services set `branchId` on every create path (derived from parent): `financial/{debts,installment-plans,payments,prepaid}`, `sales/{sales-orders,returns}`, `suppliers/{transactions,purchases,receivings}`, `services/customers.service.ts`, service jobs.
- **Acceptance:** migration on a restored production copy completes; reconciliation script shows **zero** difference vs Phase 0 baseline for every customer, supplier and report total; integrity reports clean; creating any record without a resolvable branch fails.
- **Risk:** high (live money tables). Mitigations: pre-migration backup is mandatory (guard), dry run on restored copy, migration is additive until the final `NOT NULL` step, documented rollback (§4.8).

### Phase 3 — Backend scoping & authorization
- Add `branchId` to all branch-owned list and detail responses.
- **Files:** new `middleware/branch-scope.middleware.ts`; every repository/service for branch-owned data (`repositories/customers.repository.ts`, `features/financial/**`, `features/sales/**`, `features/suppliers/**`, `features/service/**` jobs); reports (`reports/rows/report-rows.repository.ts` raw SQL, `monthly-*`, `analysis`), dashboards (`features/dashboard/**`, `services/dashboard.service.ts` raw SQL), search (`lib/search-query.ts`, `customer-suggestions.service.ts`), documents (invoice/receipt/statement print branch name), CSV export (Branch column), diagnostics export.
- Customer phone duplicate check becomes per branch (D2).
- Mobile: scanner/LAN session binds to one branch chosen at pairing; gateway forwards the header; supplier endpoints scoped (`features/scanner/*`, `Mobile Scanner/src/api/hc-client.ts`, branch shown on mobile home).
- Route-coverage meta-test.
- **Acceptance:** isolation suite (§5.1) green; consolidated totals = Σ branches for every report/dashboard endpoint; out-of-scope IDs return 404; writes in `all` scope rejected.
- **Risk:** high (leakage by omission). Mitigation: required `scope` parameter makes omissions a type error; meta-test; raw-SQL files reviewed individually.

### Phase 4 — Frontend branch UX
- **Files:** API client adds `X-Branch-Scope`; header selector; React Query key scoping; Branch column/badges in customers, suppliers, sales orders, payments, returns, supplier ledger; KPI breakdown component; dashboard and reports pages; create dialogs disabled in "All".
- **Acceptance:** E2E (Playwright) for single vs all scope on customers, sales, reports; snapshot updates reviewed; flag removed.
- **Risk:** medium.

### Phase 5 — Customer CSV import (§4.7)
- **Acceptance:** §5.3–5.4 tests green.
- **Risk:** medium (opening debts touch money).

### Phase 6 — Release
- Upgrade smoke test & rollout checklist updates (`docs/releases/*`), migration-failure runbook update, backup/restore guide note, staged rollout: staging → one business PC copy → production.

### 4.7 Customer CSV import — detailed design

**Reuse (extract, don't reinvent):** move `parseCsvRecords` and `importFileHash` from `product-import.parser.ts` to `backend/src/lib/csv-import/` (product importer re-imports them, behaviour unchanged). Copy the draft → preview → commit shape, statuses, idempotent commit, stale recheck, audit and password gate. Do **not** build a generic import framework; product and customer importers stay separate services sharing helpers.

**New model**
```
model CustomerImport {
  id, branchId (FK, NOT NULL), fileName, fileHash, status DRAFT|COMMITTED,
  columnMapping Json, rows Json, decisions Json?, result Json?,
  createdById, committedById?, createdAt, updatedAt, committedAt?
  @@index([branchId, fileHash, status])
}
Debt.sourceCustomerImportId uuid? (FK)   // traceability for opening debts
```

**Supported fields** (from `Customer`, schema L502-531):

| CSV field | Target | Rule |
|---|---|---|
| Name | `name` | required, ≤ existing length rules of `customers` validator |
| Phone | `phone` | required, normalized (digits, leading `+`/country code rule same as UI); identity key |
| Address | `address` | optional |
| Notes | `notes` | optional |
| Credit limit | `creditLimit` | optional, decimal ≥ 0, USD |
| Active | `isActive` | optional, default true |
| Opening balance amount | → **Debt** row, not a customer field | optional, > 0 |
| Opening balance currency | Debt `currency` | USD (default) / LBP |
| Opening balance due date | Debt `dueDate` | optional, default import date |

Branch is **not** a CSV column — it is the batch destination (prevents a file from spraying rows across branches).

**Endpoints** (mirroring `products.routes.ts:31-34`): `POST /customers/imports` (`branchId`, `fileName`, `csvText`), `GET/PATCH /customers/imports/:id` (mapping, decisions), `POST /customers/imports/:id/commit` (`decisions`, `accountPassword?`). Admin-only (D4 may allow branch managers later).

**Backend branch validation:** on create, `branchId` must be in the user's accessible set and active; stored on the draft and immutable. On every get/patch/commit, the draft's branch must still be accessible (else 404) and active (else 409). All matching queries filter `branchId = draft.branchId`.

**Duplicate detection (branch-aware):**
- `FILE_PHONE`: same normalized phone twice in the file → conflict (pick one / skip).
- `EXISTING_PHONE`: phone matches a customer **in the destination branch** → default `UPDATE` (choose fields among name/address/notes/creditLimit) or `SKIP`. Never matches customers in other branches.
- `OTHER_BRANCH_PHONE` (informational only, admins): "also exists in Branch Y" — cannot be merged into; creating in this branch is allowed (D2).
- `NAME_SIMILAR` (warning): same normalized name, different phone in destination branch.
- Commit rechecks inside the transaction and fails with 409 `CUSTOMER_IMPORT_STALE` if a new conflict appeared.

**Opening debts — never balances:** each non-zero opening amount creates one `Debt` (`kind: STANDARD`, description `"Opening balance — import <fileName>"`, `currency`, `exchangeRate` = current rate for LBP via existing exchange-rate service, `baseOriginalAmount` via `toBaseAmount`, `sourceCustomerImportId`) through the existing `DebtsService/Repository` creation path in the same transaction, with financial audit. Requires account password (`verifyAdminPassword`, action `COMMIT_CUSTOMER_CSV_IMPORT`). For an `UPDATE` row whose customer already has any debt with a `sourceCustomerImportId`, the opening amount is a **conflict that blocks commit** of that row (choose: skip the opening amount, or exclude the row) — so a repeat import can never double a debt. No path writes to payments, allocations or any computed total.

**Safe repeat import:**
1. Same file hash already committed **to the same branch** → banner + every row resolves to existing customers → default `SKIP`.
2. Committing the same draft twice → returns stored result (idempotent).
3. Re-importing an edited file → only changed contact fields update when the user picks `UPDATE`; opening debts blocked as above.
4. Same file into a different branch → treated as new customers in that branch (allowed, intentional per-branch records) with the `OTHER_BRANCH_PHONE` hint visible.

**Frontend:** `frontend/src/features/customers/components/CustomerCsvImportDialog.tsx`, structured like `ProductCsvImportDialog.tsx` (shared preview-table/summary sub-components extracted only where they are already generic), entry button on the customers page.

### 4.8 Migration, backup, reconciliation, rollback
- **Backup:** mandatory verified backup (existing guard + `pg_restore --list` check) before Phase 2 migration; manual backup also recommended before first customer import into production.
- **Dry run:** restore latest production backup to a drill DB, run migration, run reconciliation; release only if zero diffs.
- **Reconciliation script** (read-only, new `scripts/branch-reconciliation.ts`): per customer outstanding, per supplier owed, every integrity-report row, every report/dashboard total for sample periods — compared to Phase 0 baseline; plus I-1 closure query (zero cross-branch references) and I-3 additivity check.
- **Rollback:** before `NOT NULL`, the down path is "drop new columns/tables" (no data lost, amounts untouched). After release, rollback = restore the pre-migration backup (documented in `docs/incident-runbooks/migration-failure.md`) — acceptable because amounts are never modified by the migration; any post-migration transactions would need re-entry, so rollback window is "before the shop opens on migration day".

---

## 5. Verification

Uses the existing DB integration test pattern (15 `*-db.integration.test.ts` files, e.g. `sales/sales-orders/counter-payments-db.integration.test.ts`).

### 5.1 Branch isolation
- Fixture: branches A, B; admin; employee-A; customer with same phone in A and B; supplier in each; sales (incl. walk-in), payments, returns, credits, supplier purchases in each.
- For **every** list/report/dashboard/export/mobile endpoint: employee-A sees zero B rows and B totals contribute nothing.
- By-id access to a B record as employee-A → 404 (GET, PATCH, payment against B debt, return against B order, credit application, supplier transaction for B supplier, mobile purchase for B supplier).
- Crafted cross-branch writes (payment in A allocating to B debt; sale in A for B customer) → rejected by service and, if bypassed, by DB composite FK.
- `X-Branch-Scope: B` from employee-A → 403; `all` from employee-A → A only.
- Route-coverage meta-test green.

### 5.2 Consolidated totals
- For each metric in §3.3: `all == A + B` exactly; breakdown rows sum to total; mixed USD/LBP fixture proves sums use stored base amounts (and a regression test that LBP original amounts are never summed with USD).
- Receivables and payables endpoints return separate figures; no endpoint returns a netted receivable-minus-payable balance.

### 5.3 Duplicate handling
- In-file duplicate phone → conflict; existing phone in destination branch → UPDATE/SKIP only; same phone in other branch → never matched/updated; stale conflict at commit → 409, nothing written.
- Import into A cannot change any B customer (assert B rows unchanged by checksum).

### 5.4 Repeat imports
- Commit same draft twice → one set of effects.
- Re-upload same file to same branch → all rows SKIP by default; zero new customers, zero new debts.
- Edited file with opening balances for already-imported customers → blocked; debt count unchanged.
- Branch access revoked between preview and commit → 404, nothing written.

### 5.5 Unchanged historical balances
- Reconciliation script on the restored production copy: zero diffs vs baseline for every customer, supplier, integrity row, and report total (sample periods: current month, previous month, a month with returns and LBP transactions).
- Existing full test suite (`npm run test:ci`) green; document snapshots updated only for the added branch name line.

---

## 6. Verified facts vs assumptions

**Verified:** everything tagged [V] above.

**Assumptions [A]:**
1. All historical data comes from one shop (D1 resolves it).
2. Branches will share **one database** (hosted or one central server). An "All branches" view across separate local desktop databases would require replication/sync — out of scope of this plan (D5).
3. The dead `branchId` columns contain only NULLs (checked in Phase 0).
4. Branch staff are entering their own branch's data on their own logins; there is no expectation of one employee acting for several branches without switching scope.

---

## 7. Decisions

> **Approved 2026-10-17:** the owner approved this plan with every recommended default below (D1 yes → single historical branch; D2 yes; D3 shared stock; D4 admins all / employees assigned, no manager role; D5 one central database; D6 returns booked to the original sale's branch). Phase 0 baseline evidence on a restored production copy is a **release gate** for Phase 2: it must exist before the Phase 2 migration runs against any real data (business PC, hosted production, or a restored production copy used for sign-off). It is **not** an implementation gate — Phase 2 code, the reconciliation script that captures the baseline, and seeded scratch-database tests are built first, and the script is then used to capture Phase 0 evidence.

Routine choices already defaulted above (header-based scope, explicit repository scope param, global document numbering, STANDARD-kind opening debts with import link, no CSV branch column, admin-only import). These need your answer:

- **D1 — Historical data:** was every existing customer, supplier, sale and payment created in one shop? *Recommended:* yes → assign all history to that branch (you name it). If not sure → "Unassigned (pre-branch history)" bucket with a manual, audited move tool.
- **D2 — Same phone in two branches:** allow the same customer phone to exist as separate customers in different branches (unique only within a branch)? *Recommended:* yes.
- **D3 — Stock:** keep one shared stock count for all branches in this project (per-branch inventory as a later separate project)? *Recommended:* yes, shared for now — but if branches are physically separate stores with separate shelves, tell me, because shared stock would then be wrong from day one.
- **D4 — Who sees what:** admins see all branches; each employee sees only their assigned branch(es)? Do you need a "branch manager" role (e.g. can import customers / see branch reports but not other branches)? *Recommended:* admins all, employees one branch, no new role in v1.
- **D5 — Where the branches run:** will all branches use the same central database (hosted/Render or one server reachable from each branch), rather than each branch keeping its own local PC database? *Recommended:* one central database; this plan assumes it.
- **D6 — Returns at another branch:** if a customer returns an item at branch B that was sold at branch A, should the return/refund be booked to A (the original sale)? *Recommended:* yes, books follow the original sale.
