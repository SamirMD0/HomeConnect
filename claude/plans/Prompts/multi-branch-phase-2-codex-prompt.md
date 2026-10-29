# Codex Implementation Prompt — Multi-Branch Phase 2 / Ownership Columns & Historical Backfill

Copy everything below the line into Codex.

---

You are implementing **Phase 2 of the multi-branch plan** in the **HomeConnect** repository (Express + Prisma + PostgreSQL backend, React frontend, Electron desktop shell). This is a real shop's accounting system: customer balances, supplier balances, sales and payments must not change by a single cent.

Claude is the planner and reviewer. You are the builder. When you finish, stop and report (format at the end). **Do not merge into `develop` and do not push.**

## Your source of truth

```
claude/plans/multi-branch-management-plan.md
```

Read §1.2, §2.1–2.3, §2.5, §4 "Phase 2" and §4.8 before writing code. Phase 1 is already committed (`8189f20`): the `Branch` and `UserBranchAccess` models, `backend/src/features/branches/*`, migration `20261017120000_add_branches`. Read those files first. Your work builds directly on them.

**Approved business decisions (binding):**
- **D1:** every existing record was created in one shop, so all history goes to a single branch.
- **D2:** the same phone may exist in different branches. Do **not** change the global phone check in this phase; Phase 3 changes it.
- **D3:** stock stays global. Do not add a branch to products or stock movements.
- **D6:** returns, refunds and credits belong to the original sale's branch.

## Workspace — mandatory

The main checkout has ~70 unrelated uncommitted files owned by the user. **Do not touch, stage, stash or revert them.** Create an isolated worktree from `develop`:

```bash
git worktree add ../HomeConnect-mb-phase2 -b feature/multi-branch-phase-2 develop
```

Do all work there and commit on `feature/multi-branch-phase-2`.

Repository navigation rules (from `CLAUDE.md`): `graphify-out/graph.json` exists. Use `graphify query "<question>"` before broad greps. It does **not** index `schema.prisma`, so read that file directly. After code changes, run `graphify update .`.

## What Phase 2 is — and is not

**Is:** every branch-owned money/record table gets a `branchId` that is `NOT NULL`, foreign-keyed, filled for all history, enforced by the database to match its parent, immutable, and set by the server on every create path.

**Is not (do not do any of this):** no read filtering, no scope middleware, no `X-Branch-Scope` header, no header branch selector, no report or dashboard changes, no per-branch phone uniqueness, no customer import, no mobile changes, no stock-per-branch. Every user still sees all records after Phase 2. That is intended.

## Non-negotiable rules

1. **No amount, date, status, balance input or existing column value of any existing row may change.** The migration only adds and fills `branchId`, adds constraints, and removes the dead `branchId` scaffolding columns (rule 5). If any step would rewrite money data, stop and report.

2. **Branch is derived server-side whenever a parent exists.** The client never supplies `branchId` for a record that has a customer, supplier, sales order or sales return parent. Only parent-less creations use the creation-branch rule (§ "Creation branch" below).

3. **The database enforces branch closure, not just the services.** Composite foreign keys (below) must make it impossible to insert a debt, payment, sale, return, refund, credit, supplier transaction, receiving or service job whose branch differs from its parent's, even through raw SQL.

4. **`branchId` is immutable on every owned table** once a row exists, enforced by a trigger (see "Immutability trigger"). There is no branch-transfer feature in this phase.

5. **Dead scaffolding is verified before it is touched.** `users."branchId"`, `customers."branchId"` and `activity_logs."branchId"` (added in the July init migrations, never written) must be checked to be entirely NULL **inside the migration**. If any row is non-null, the migration raises an exception and aborts. Never guess what a non-null value meant.

6. **The migration must be safe on a business PC.** The desktop app applies bundled migration SQL itself behind `desktop/src/pre-migration-guard.ts`, which takes a verified backup first. The migration must be one transaction-safe SQL file with deterministic results and clear `RAISE EXCEPTION` messages a support person can act on. No `CONCURRENTLY` index builds (they cannot run in a transaction).

7. **Never connect to a business or production database.** Integration, migration and rehearsal tests run only against throwaway databases matching the existing guards (`isIsolatedTestDatabase` in `backend/src/test/database.ts`; names `homeconnect_(test|ci|rehearsal|reconcile)` or `hc_audit*`).

## Schema changes (`backend/prisma/schema.prisma`)

Add `branchId String @db.Uuid` + `branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)` + `@@index([branchId])` to:

| Model | Branch comes from |
|---|---|
| `Customer` | creation branch (reuse the existing column, see migration) |
| `Supplier` | creation branch |
| `SalesOrder` | customer's branch, or creation branch for walk-in (`customerId` NULL) |
| `Debt`, `InstallmentPlan` | customer's branch |
| `Payment` | sales order's branch when `salesOrderId` is set, else customer's branch |
| `SalesReturn` | original sales order's branch |
| `CashRefund`, `CustomerCredit` | the sales return's branch |
| `SupplierTransaction` | supplier's branch |
| `SupplierReceiving` | supplier's branch, or creation branch when `supplierId` is NULL |
| `ServiceJob` | customer's branch |

`ActivityLog.branchId` stays **nullable** but gets a real FK + relation (most audit rows are not branch-specific). `User.branchId` is **removed** (replaced by `UserBranchAccess`): update `backend/src/repositories/users.repository.ts`, `backend/src/controllers/auth.controller.ts` (`/me` select), `backend/src/services/users.service.test.ts` and `frontend/src/features/dashboard/types.ts` accordingly. In the worktree these files are clean.

Add `@@unique([id, branchId])` to `Customer`, `Supplier`, `SalesOrder`, `SalesReturn` (targets for composite FKs). Add the back-relations on `Branch`.

Do **not** model the composite FKs as Prisma relations. Keep every existing Prisma relation exactly as it is, so no existing `connect`/`include` code changes. Add the composite FKs as raw SQL in the migration, following the precedent of the raw `CHECK`s and triggers in `backend/prisma/migrations/20260914140000_add_counter_payment_sources/migration.sql`. Add a `///` comment on each affected model naming the raw-SQL constraint, so the next reader knows it exists.

Child tables (`sales_order_items`, `installments`, `payment_allocations`, `sales_return_receivable_allocations`, `customer_credit_applications`, `supplier_purchase_lines`, receiving items/receipts, stock fulfillments) get **no** branch column. They inherit through their parent.

## Migration (`backend/prisma/migrations/<timestamp after 20261017120000>_add_branch_ownership/migration.sql`)

Generate the DDL skeleton with `npx prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel backend/prisma/schema.prisma --script`, then hand-edit it into this order:

1. **Guard dead columns:** `RAISE EXCEPTION` if any of `users."branchId"`, `customers."branchId"`, `activity_logs."branchId"` is non-null.
2. **Resolve the historical branch** (in a `DO` block):
   - more than one `isActive = true` branch → `RAISE EXCEPTION` ("Multiple active branches exist; deactivate all but the branch that holds pre-branch history, then retry");
   - exactly one active branch → use it;
   - none, and at least one user exists → insert `code 'MAIN'`, `name 'Main branch'`, `createdById` = the earliest-created non-deleted `ADMIN` (fall back to the earliest-created user). The owner can rename it in Settings → Branches;
   - none, and no users (fresh install) → create nothing; the owned tables are necessarily empty, which you must assert. Fresh installs get their branch from the setup flow (below).
3. Add nullable `branchId` to every owned table (`customers` already has the column: keep it, do not drop and re-add).
4. Backfill every existing row with the historical branch. Order matters only for readability. All rows get the same branch.
5. Assert zero NULL `branchId` rows remain in every owned table, then `SET NOT NULL`.
6. Plain FKs to `branches(id) ON DELETE RESTRICT`, indexes, and the `(id, "branchId")` unique constraints.
7. **Composite FKs** (`ON DELETE RESTRICT ON UPDATE RESTRICT`; Postgres `MATCH SIMPLE` skips the check when the nullable parent id is NULL, which is the correct behaviour for walk-ins and supplier-less receivings):
   - `debts`, `installment_plans`, `customer_credits`, `service_jobs`, `sales_orders`, `payments`, `sales_returns`, `cash_refunds`: `("customerId","branchId") → customers("id","branchId")`
   - `payments`, `sales_returns`: `("salesOrderId","branchId") → sales_orders("id","branchId")`
   - `cash_refunds`, `customer_credits`: `("salesReturnId","branchId") → sales_returns("id","branchId")`
   - `supplier_transactions`, `supplier_receivings`: `("supplierId","branchId") → suppliers("id","branchId")`
8. **Immutability trigger:** one `prevent_branch_change()` plpgsql function raising `'branchId cannot be changed once a record exists'` when `NEW."branchId" IS DISTINCT FROM OLD."branchId"`, attached `BEFORE UPDATE` to every owned table (not `activity_logs`).
9. Drop `users."branchId"`.

Before relying on them, check whether the existing triggers in `20260914140000_add_counter_payment_sources` (`validate_counter_payment_customer`, `protect_counter_sale_customer`) interact with the new FKs. They must keep working unchanged.

## Creation branch (parent-less creates)

Add `backend/src/features/branches/creation-branch.ts`:

```ts
resolveCreationBranch(user, tx): Promise<string>
```

Rule for Phase 2: the user's accessible active branches (reuse `BranchesService.accessibleBranches` logic, transaction-aware). Exactly one → return it. Zero → `AppError(409, 'NO_BRANCH_AVAILABLE', 'No active branch is available for this user. An administrator must assign one in Settings → Branches.')`. More than one → `AppError(409, 'BRANCH_SELECTION_REQUIRED')`. That case cannot occur in production because of the guard below; Phase 3 replaces it with the request scope.

**Single-active-branch guard:** until branch scoping ships, `BranchesService.create` and `update` (when activating) must reject with `409 BRANCH_SCOPING_NOT_RELEASED` if another active branch already exists. Gate it on a `MULTI_BRANCH_SCOPING_ENABLED` env flag (default off) read in one place (`backend/src/features/branches/branch-config.ts`). This keeps parent-less creation unambiguous and stops the UI implying separation that does not exist. Update the Phase 1 tests accordingly.

**Fresh installs:** find the first-admin setup path (`POST /api/v1/auth/setup` → `AuthController.setup`) and create the default `MAIN` branch in the same transaction if no branch exists. Do the same in `backend/prisma/seed.ts`.

## Create paths to update (all 13; verify none are missing with a grep)

| Record | File |
|---|---|
| Customer | `backend/src/repositories/customers.repository.ts` (+ `services/customers.service.ts` resolves the branch) |
| Supplier | `backend/src/features/suppliers/suppliers/suppliers.repository.ts` |
| SalesOrder | `backend/src/features/sales/sales-orders/sales-orders.repository.ts` |
| Payment | `financial/debts/debts.repository.ts`, `financial/installment-plans/installment-plans.repository.ts`, `financial/payments/payments.repository.ts` (2 sites) |
| Debt | `financial/debts/debts.repository.ts` |
| InstallmentPlan | `financial/installment-plans/installment-plans.repository.ts` |
| SalesReturn | `features/sales/returns/sales-returns.repository.ts` |
| CashRefund, CustomerCredit | `features/sales/returns/sales-returns.service.ts` |
| SupplierTransaction | `features/suppliers/transactions/supplier-transactions.repository.ts` |
| SupplierReceiving | `features/inventory/receiving/supplier-receivings.repository.ts` |
| ServiceJob | `features/service/service-jobs/service-jobs.repository.ts` |

Load the parent's `branchId` inside the same transaction that writes the child (most services already load the parent; extend the `select`). **Sales order customer change:** where an existing order's customer can be changed (see `protect_counter_sale_customer`), choosing a customer from a different branch must fail with a clear `409 CUSTOMER_BRANCH_MISMATCH` from the service, before the database FK would reject it. Add `branchId` to API responses for these records (read-only), without changing any other response field.

## Reconciliation tooling (Phase 0 + Phase 2 proof)

Add `scripts/branch-reconciliation.ts` (`tsx`), refusing any database not matching the throwaway-name guard:

- `snapshot --out <file.json>`: per-customer outstanding and per-supplier owed (independently recomputed in SQL from obligations, allocations and credits, mirroring `reports/rows/report-rows.service.ts` `customers-financial-integrity` / `suppliers-financial-integrity`); the integrity-report rows themselves via the existing service; row counts per owned table; and totals from `reports/analysis`, `reports/monthly-review` and receivables/payables aging for the current month, the previous month and one supplied `--period`. Use the existing services for report totals. Do not re-implement report math.
- `compare --before <a.json> --after <b.json>`: exits non-zero on any difference. Also runs the **closure checks**: zero owned rows with NULL `branchId`, zero rows whose branch differs from the parent's (one query per composite relation), and zero `payment_allocations` / `customer_credit_applications` / `sales_return_receivable_allocations` linking records of different branches (`branch_mismatch`).

Document the run procedure in `docs/releases/upgrade-smoke-test.md` and the rollback in `docs/incident-runbooks/migration-failure.md`: restore the latest production backup into `homeconnect_reconcile`, snapshot, migrate, snapshot, compare. Rollback = restore the pre-migration backup taken by the guard.

## Tests (all required)

- **Migration tests** (follow `backend/prisma/shop-profile-logo.migration.test.ts` / `backend/src/features/categories/category-migration.test.ts`): on a scratch DB at the pre-Phase-2 schema with seeded customers, suppliers, walk-in and customer sales, payments, returns, credits, supplier transactions and supplier-less receivings, in both USD and LBP. Cases: zero branches + users → `MAIN` created and every row assigned; one active branch → that branch used; two active branches → migration aborts and nothing changes; non-null dead column → aborts; every amount column byte-identical before/after.
- **DB integration** (`*-db.integration.test.ts` pattern, gated by the existing `RUN_*_DB_TESTS` flags): composite FKs reject a cross-branch debt, payment, sale, return, refund, credit, supplier transaction and service job inserted via raw SQL; the trigger rejects a `branchId` update on each owned table; walk-in sale and supplier-less receiving get the creation branch; changing an order's customer to another branch's customer → 409.
- **Unit:** `resolveCreationBranch` (0/1/many), the single-active-branch guard (flag off/on), setup creates `MAIN`.
- **Fixtures:** 12 existing test files create owned rows directly. Add one helper (`backend/src/test/branch-fixture.ts`) and update those fixtures. Do not weaken any assertion.
- `npm run typecheck`, `npm run lint`, and `npm run test:ci` against a test database with **zero skips** (`scripts/assert-zero-skips.mjs`), plus `npm run rehearse:migrations -- --confirm-scratch`.

## Commits

Small, reviewable commits on `feature/multi-branch-phase-2`, e.g. (1) schema + migration + migration tests, (2) creation-branch rule + guard + setup, (3) create paths + integration tests, (4) fixture updates, (5) reconciliation script + docs. Conventional messages (`feat(branches): …`, `test(branches): …`), each ending with the repo's usual co-author line if you use one. Run `graphify update .` before the final commit.

## When you stop, report exactly this

1. Branch name, commit list (hash + subject).
2. The full final `migration.sql`.
3. A table of all 13 create paths: file:line and how `branchId` is derived.
4. Test results: command, pass/fail/skip counts for `typecheck`, `lint`, `test:ci`, `rehearse:migrations`.
5. Reconciliation: the `compare` output from a seeded scratch DB run (before vs after migration).
6. Anything you found that contradicts the plan, any rule you could not satisfy, and every assumption you made. **If a rule cannot be met, stop and report rather than working around it.**

Do not start Phase 3.
