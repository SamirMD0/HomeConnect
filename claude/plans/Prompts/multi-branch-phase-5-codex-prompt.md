# Codex Implementation Prompt — Multi-Branch Phase 5 / Customer CSV Import

Copy everything below the line into Codex.

---

You are implementing **Phase 5 of the multi-branch plan** in the **HomeConnect** repository (Express + Prisma + PostgreSQL backend, React frontend, Electron desktop shell). This is a real shop's accounting system. An import that creates a duplicate opening debt, or writes a customer into the wrong branch, is a real financial error.

Claude is the planner and reviewer. You are the builder. When you finish, stop and report (format at the end). **Do not merge into `develop` and do not push.**

## Your source of truth

```
claude/plans/multi-branch-management-plan.md
```

Read §1.4 (product import as it exists), §3.4 (customer import UX), §4 "Phase 5", **§4.7 (detailed design — follow it)** and §5.3–5.4 (acceptance tests) before writing code.

Phases 1–4 are merged into `develop`:
- **Phase 2/3:** every customer, debt and payment has a `NOT NULL`, immutable `branchId` with composite foreign keys enforcing parent/child branch closure. Reads are scoped by `X-Branch-Scope` through `backend/src/features/branches/branch-scope.ts` (`BranchScope`, `scopeWhere`, `writeBranch`, `assertInScope`) and `parent-branch.ts` (`customerBranch`, `assertRecordInScope`). Customer phone uniqueness is already **per branch** (`CustomersRepository.findByPhone(phone, branchId, tx)` in `backend/src/services/customers.service.ts`).
- **Phase 4:** the header branch selector, "All branches" view, and `frontend/src/features/branches/scope/branch-ui.tsx` (`useCreateGuard`, `useShowBranchColumn`, `useRecordBranch`, `BranchBadge`). Creating records is blocked in multi-branch "All branches" until the user picks a branch.

Read those files first. Your work builds on them; do not re-derive scoping.

**Approved business decisions (binding):**
- **D2:** the same phone may exist in different branches. An import never matches, merges into, or updates a customer in another branch.
- **D4:** customer import is **ADMIN-only** in this phase.
- Opening balances are imported as **debts**, never as a stored balance. Balances stay derived.
- **Never net** customer receivables against supplier payables anywhere.

## Workspace — mandatory

The user works in the main checkout. **Do not touch, stage, stash or revert anything there.** In particular `CSV/ALLPRODUCTS.csv` is the user's untracked business data: never read it into fixtures, commit it, or copy it. Create an isolated worktree from `develop`:

```bash
git worktree add ../HomeConnect-mb-phase5 -b feature/multi-branch-phase-5 develop
```

Do all work there and commit on `feature/multi-branch-phase-5`.

Repository navigation rules (from `CLAUDE.md`): `graphify-out/graph.json` exists. Use `graphify query "<question>"` (scoped with `--seed` / `--budget`) before broad greps. It does **not** index `schema.prisma`, so read that file directly. After code changes, run `graphify update .`.

## What Phase 5 is — and is not

**Is:** an admin can import customers from a CSV into **one chosen branch**, with column mapping, a preview with per-row conflicts, per-row decisions, optional opening debts, an idempotent password-gated commit, and safe repeat imports.

**Is not (do not do any of this):** no supplier import, no generic "import framework", no behaviour change to the product importer (only the helper extraction below), no mobile changes, no stock changes, no changes to branch scoping or the `MULTI_BRANCH_SCOPING_ENABLED` guard, no release docs (Phase 6).

## Non-negotiable rules

1. **One import = one branch.** Branch is the batch destination chosen in the UI, never a CSV column. The server validates it on create (in the user's accessible set and active) and stores it immutably on the draft. On every get/patch/commit the draft's branch must still be accessible (else **404**) and active (else **409**). Every lookup filters `branchId = draft.branchId`.

2. **No existing money row changes.** The only financial writes are new `Debt` rows for opening balances, created through the existing debt creation path (`DebtsService.createDebt` in `backend/src/features/financial/debts/debts.service.ts`, or the repository function it uses) inside the commit transaction, with the usual financial audit. If that path cannot take a transaction client or `sourceCustomerImportId`, extend it minimally and keep every existing caller's behaviour identical. No writes to payments, allocations, or any computed total.

3. **A repeat import can never double a debt.** For an `UPDATE` row whose customer already has any debt with a non-null `sourceCustomerImportId`, a non-zero opening amount is a **blocking conflict** for that row (resolve by skipping the amount or excluding the row).

4. **Commit is atomic and idempotent.** Whole commit in `runFinancialTransaction`. A `COMMITTED` draft returns its stored result. Conflicts are rechecked inside the transaction; a new conflict fails with **409 `CUSTOMER_IMPORT_STALE`** and writes nothing.

5. **Opening debts require the account password** (`verifyAdminPassword` from `backend/src/lib/admin-verification.ts`, action `COMMIT_CUSTOMER_CSV_IMPORT`). LBP amounts use the current rate from the existing exchange-rate service and the existing base-amount helper. Do not invent a conversion.

6. **The migration must be safe for the desktop updater.** One additive, transaction-safe SQL file (no `CONCURRENTLY`, no `DROP` or `RENAME`), deterministic, with clear `RAISE EXCEPTION` messages if any precondition fails. Additive-only matters: the in-app "resolve update history" check verifies a migration by the objects it creates.

7. **Never connect to a business or production database.** The developer's local `homeconnect` database holds real data. Integration and migration tests run only against throwaway databases matching the existing guard (`isIsolatedTestDatabase` in `backend/src/test/database.ts`).

## Shared helpers (extract, don't reinvent)

Move `parseCsvRecords` and `importFileHash` from `backend/src/features/service/products/product-import.parser.ts` into `backend/src/lib/csv-import/`. The product importer re-imports them with **no behaviour change**: its existing tests must pass unmodified. Product and customer importers stay separate services.

## Schema (`backend/prisma/schema.prisma`) and migration

Add `CustomerImport` and `Debt.sourceCustomerImportId` exactly as §4.7 specifies (`branchId` FK NOT NULL, `fileName`, `fileHash`, `status DRAFT|COMMITTED`, `columnMapping`, `rows`, `decisions?`, `result?`, `createdById`, `committedById?`, timestamps, `@@index([branchId, fileHash, status])`). Migration folder name must sort after `20261027120000_add_branch_ownership`. Opening debts must satisfy the existing Phase 2 composite FK: the debt's branch equals its customer's branch.

## Backend

Endpoints, mirroring the product import routes: `POST /customers/imports` (`branchId`, `fileName`, `csvText`; same size/row limits as product import), `GET` and `PATCH /customers/imports/:id` (mapping, decisions), `POST /customers/imports/:id/commit` (`decisions`, `accountPassword?`). ADMIN-only; validators in the existing style.

- **Column mapping:** auto-detect from header aliases in English and Arabic (`Name/الاسم`, `Phone/الهاتف`, `Address/العنوان`, `Notes/ملاحظات`, `Credit limit/سقف الدين`, `Opening balance/رصيد افتتاحي`, `Currency/العملة`, `Due date/تاريخ الاستحقاق`, `Active/نشط`); user-adjustable; stored on the draft.
- **Fields and rules:** use the table in §4.7. Normalize and validate phone and name with the **same functions the customer create path uses**. Find them; do not write new ones. Credit limit follows the existing credit-limit permission rule.
- **Duplicate detection:** `FILE_PHONE`, `EXISTING_PHONE` (destination branch only; default `UPDATE` with chosen fields among name/address/notes/creditLimit, or `SKIP`), `OTHER_BRANCH_PHONE` (informational only, never mergeable), `NAME_SIMILAR` (warning). Row statuses `READY` / `CONFLICT` / `INVALID` with issue text and summary counts.
- **Repeat imports:** same `fileHash` already committed **to the same branch** → previous-import warning, and matching rows default to `SKIP`. The same file into a different branch is allowed (new per-branch customers) and shows the `OTHER_BRANCH_PHONE` hint.
- **Result:** counts (created, updated, skipped, opening debts and their USD total) plus a downloadable CSV of skipped and invalid rows with reasons.

## Frontend

`frontend/src/features/customers/components/CustomerCsvImportDialog.tsx`, structured like `frontend/src/features/products/components/ProductCsvImportDialog.tsx` (extract a shared sub-component only where it is already generic). Steps per §3.4: choose destination branch (preselected from a single-branch header scope; forced choice in "All branches") → upload → map columns → preview → resolve → confirm (summary, plus the password field when opening debts exist) → result. Show **"Importing into: <branch>"** on every step. Entry button on `frontend/src/pages/customers/CustomersListPage.tsx`, ADMIN-only, consistent with `useCreateGuard`. Keep bilingual labels (English / Arabic) like the rest of the app, and use `dir="auto"` for user text.

## Tests (all required)

- **§5.3 duplicate handling** and **§5.4 repeat imports**, every bullet, as DB integration tests (`*-db.integration.test.ts`, gated by the existing `RUN_*_DB_TESTS` flags). Include: import into branch A leaves every branch-B customer and debt unchanged (compare checksums); access revoked between preview and commit → 404 and nothing written; inactive branch → 409; stale conflict → 409 and nothing written; same draft committed twice → one set of effects; same file to the same branch → zero new customers and zero new debts; edited file with opening amounts for already-imported customers → blocked, debt count unchanged.
- **Money:** USD and LBP opening debts have the correct `baseOriginalAmount`, branch, `sourceCustomerImportId` and audit rows; customer balances computed by the existing services equal the imported amounts.
- **Unit:** alias mapping (English and Arabic), phone normalization reuse, every conflict kind, decision validation.
- **Product importer:** existing tests pass unchanged after the helper extraction.
- **Frontend:** dialog steps, the forced branch choice in "All branches", the destination banner, the password gate, and the result summary.
- **Migration:** additive-only, applies on a scratch database at the current `develop` schema, and is recognized as present afterwards by `classifyPresence` (`backend/src/features/maintenance/migration-presence.ts`).
- Run **targeted tests per checkpoint**. Run the full `npm run test:ci` **once at the end**, against a test database, with **zero skips** (`scripts/assert-zero-skips.mjs`), plus `npm run typecheck`, `npm run lint` and the frontend build.

## Commits

Small, reviewable commits on `feature/multi-branch-phase-5`, e.g. (1) CSV helper extraction (no behaviour change), (2) schema + migration + migration test, (3) import service, preview and conflicts + unit tests, (4) commit, opening debts and repeat-import safety + DB integration tests, (5) frontend dialog + tests. Conventional messages (`feat(customers): …`, `test(customers): …`). Run `graphify update .` before the final commit.

## When you stop, report exactly this

1. Branch name, commit list (hash + subject).
2. The full final `migration.sql`.
3. The endpoints with their validators and the role and branch checks each applies (file:line).
4. How opening debts are created: file:line of the creation path, transaction, audit, and the double-debt block.
5. Test results: command and pass/fail/skip counts for `typecheck`, `lint`, the frontend build and `test:ci`, plus the §5.3–5.4 test names.
6. Anything that contradicts the plan, any rule you could not satisfy, and every assumption you made. **If a rule cannot be met, stop and report rather than working around it.**

Do not start Phase 6.
