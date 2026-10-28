1. **Commits.** Phase 3A baseline: 6d33f0e. Worktree: D:\User\Documents\HomeConnect-mb-phase3; branch: feature/multi-branch-phase-3. Implementation commits (the final isolation/coverage/evidence commit follows these):

```text
a3ce40e fix(branches): guard global search and document write policy
42e772d feat(branches): scope financial routes and guard record actions
37befe6 feat(branches): scope sales orders returns and counter receipts
7005f82 feat(branches): scope service job lists and customer links
5d61deb feat(branches): scope supplier ledger purchases and receivings
f5f815f refactor(branches): remove legacy creation branch resolver
517cc0d fix(branches): include ownership in sales and service audit lists
```

2. **Routes.** [routes.md](routes.md) lists all 68 method/path pairs under the 3B prefixes and the receiving subrouter, with their enforcement. [route-inventory.json](route-inventory.json) contains the actual Express registry walk, including the existing customer/supplier parent routers. A branch-only guard runs before route validators and role checks, loads ownership and calls assertInScope. Lists, searches and summaries receive explicit scopes. Mutations call writeBranch even for record-derived ownership. Receipt photo IDs refer to receivings, while purchase detail IDs refer to transactions. Every registry prefix is pinned; every inventory endpoint must match the explicit scoped/global inventory lists.

3. **Global inventory allow-list (D3).**

```text
GET /api/v1/inventory/onboarding/pending
POST /api/v1/inventory/onboarding/batch
GET /api/v1/inventory/summary
GET /api/v1/inventory/low-stock
GET /api/v1/inventory/movements
```

4. **Raw SQL.** No production SQL statement changed: [raw-sql.diff](raw-sql.diff). The existing parameterized, table-qualified Prisma.sql UUID-array predicates from 3A are reused by passing scope into all financial-ledger, receivable and supplier search calls. [search-guard.diff](search-guard.diff) shows C1: branch-owned target metadata and an early programming error for scoped product search, including blank terms and empty scope. Raw inserts/reads in the new test fixture are synthetic test plumbing only.

5. **Cross-record checks.** All applicable checks use the existing assertInScope/writeBranch primitives through the shared parent/record guard and assertRecordInScope; composite FKs remain unchanged. Integration test names below are in backend/src/features/branches/branch-financial-scope-db.integration.test.ts unless a different file is named.

| Link | Enforcement | Test name |
| --- | --- | --- |
| Debt/plan payment parent | recordScopeGuard before handlers; DebtsService.recordDebtPayment / InstallmentPlansService.recordPlanPayment inside the financial transaction; replay scope checks | POST debts/:id/payments hides B before validation/roles and leaves all records unchanged; corresponding installment-plans case |
| Payment and existing debt/installment allocations | PaymentsService void/correct/reallocate check the root before verification; assertPaymentReferencesInScope checks existing allocation parents in the transaction | POST payments/:id/void and POST payments/:id/corrections hides B... |
| Requested installment allocation | PaymentsService.reallocatePayment checks all requested installment IDs before password-verification logs, then retains existing accounting validation | rejects B installment allocation before verification logs or financial writes |
| Sale customer at create/update | SalesOrdersService.create/update assert customer scope in the transaction; repository derives ownership from parent | creates parent-owned sales and service jobs in A and hides B customers; backend/prisma/branch-ownership-db.integration.test.ts: hides an out-of-scope customer before attempting an order customer change |
| Return order, linked debt/plan and item | root guard; SalesReturnsService.create checks order/debt/plan scope and existing prepareLines checks each item belongs to the order before writing | POST sales-orders/:id/return hides B...; rejects B sales-order line on an A return without writes |
| Service-job customer | ServiceJobsService.create/update check the chosen customer inside the transaction | creates parent-owned sales and service jobs in A and hides B customers |
| Supplier payment/transaction parent and receiving | supplierParentGuard, SupplierTransactionsService.create scope-checks supplier and optional receiving before existing link validation | rejects A supplier transaction linked to B receiving without writes |
| Supplier purchase parent and replay | supplierParentGuard; SupplierPurchasesService.create checks supplier and replay ownership; postSupplierReceiving receives the same scope | creates customer financial and supplier records in selected branch A; rejects every available create in multi-branch all before any write |
| Receiving supplier / no supplier | SupplierReceivingsService.create and postSupplierReceiving check supplier; repository uses writeBranch for no supplier | creates parent-owned sales and service jobs in A and hides B customers (includes B supplier receiving denial); creates walk-in sales and supplier-less receivings in header A and sole accessible no-header scope |
| Receipt photo parent | recordScopeGuard selects receiving for receipt URLs; storeReceipt asserts scope before directory/file creation | denies B receipt upload before creating a file and permits an A upload |
| Customerless correction / prepaid audit ownership | CorrectionAuditRepository restricts each polymorphic record type to scoped root or inherited parent IDs, including CUSTOMER_BILLING and PREPAID_PURCHASE | keeps walk-in counter receipts and customerless correction ownership in the ledger; corrections filters A, admin A and admin all with branchId metadata |

All denied-mutation cases compare all rows in 27 financial, sales, stock and audit tables before/after. Successful A writes and explicit-grant employee access use real Prisma clients, with no branchFixture grants or branch-access mocks in the new fixture. Revocation and deactivation are checked on the next request for financial, sales, service, suppliers and receivings.

6. **Validation.** Latest successful results across the exact 95-file manifest: **824 passed, 0 failed, 0 skipped, no suite errors**. The entire set ran once; retries contained only failed files. A final response-metadata gap was then verified in that same focused integration file without rerunning the broader set. All 113 new real-database isolation cases pass. [isolation-test-names.json](isolation-test-names.json) lists their exact expanded names. The final response audit also added inherited branchId to sales/service audit lists, proved by adds inherited branchId to sales and service audit history in the same integration file. The unit additions also cover product-scope rejection, shared record/receipt/prepaid/collection guards, explicit creation scopes, and inventory registry classification.

| Run | Files | Passed | Failed | Skipped | Suite errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial targeted set | 95 | 669 | 42 | 112 | 2 (seed + cleanup) |
| Failed files retry 1 | 14 | 101 | 0 | 112 | 1 (counter snapshot seed) |
| Failing isolation file retry 2 | 1 | 107 | 5 | 0 | 0 |
| Failing isolation file retry 3 | 1 | 112 | 0 | 0 | 1 (cleanup FK order) |
| Failing isolation file retry 4 | 1 | 112 | 0 | 0 | 0 |
| Audit metadata follow-up (same isolation file) | 1 | 113 | 0 | 0 | 0 |
| Latest result per file | 95 | 824 | 0 | 0 | 0 |

Exact Vitest launcher commands are in [commands.txt](commands.txt) and [retry-1-command.txt](retry-1-command.txt). The first was:

```text
node docs/releases/evidence/multi-branch-phase3b/run-targeted-tests.cjs
```

It invokes npx vitest run --no-file-parallelism --reporter=default --reporter=json --outputFile.json=node_modules/.cache/home-connect/phase3b-targeted.json followed by the exact sorted paths in [test-files.json](test-files.json). Retry 1 used the 14 explicit paths in retry-1-command.txt. Retries 2–4 used:

```text
node docs/releases/evidence/multi-branch-phase3b/run-targeted-tests.cjs backend/src/features/branches/branch-financial-scope-db.integration.test.ts
```

The tracked launcher reads backend/.env without printing it, explicitly sets the child DATABASE_URL, refuses every database except homeconnect_test_phase4_phase5_phase6, prints the confirmed name before spawning Vitest, sets NODE_ENV=test and all nine RUN_*_DB_TESTS flags (listed in its source), and fails on any skipped/pending/todo test. The existing migration suite additionally provisioned and dropped its own guarded homeconnect_test_mb_* scratch database. Failed fixture remnants were cleaned by task-owned IDs after confirming the database name; the final fixture cleanup passes.

npm run typecheck: PASS. Supplemental migration-test typecheck: PASS. ESLint: 84 changed TypeScript files, 0 errors, 2 existing no-explicit-any warnings in sales-returns-db.integration.test.ts, 0 new warnings. [lint-files.json](lint-files.json) pins the files; the two any assertions are identical to baseline 6d33f0e. graphify update .: PASS (13566 nodes, 36385 edges). The initial graph query stalled, so source reads were used after that attempted query; the final graph was rebuilt successfully. Full test:ci, reconciliation and rehearsal were not run in 3B.

7. **Scope decisions and edges.** No schema/migration, money formula, balance algorithm, report/dashboard, scanner/mobile LAN, printed-header, product/category, exchange-rate or pricing behavior was changed. Migration SHA-256 remains 776a8bb45e18c487cf8841c4f53416f7faba327c44e43e67e42327e98ca55ee5. New branchId fields are response metadata only. Existing by-ID APIs are protected at the shared HTTP boundary; collection and cross-link services take explicit scopes. The old creation resolver has no remaining callers and is deleted. The correction activity adapter remains customer-parent restricted, and receivable projections remain restricted by their supplied customer IDs, avoiding changes in 3C consumers.

The owner explicitly approved testing existing operations and documenting absent examples: no customer-credit application route/service, receipt download route, or purchaseId input on receiving creation exists in this baseline. Credits/cash refunds are exercised through return detail responses; the supported supplier transaction → receiving link is tested. Payment reallocation accepts installment IDs only, so the available B-installment allocation and B-debt payment paths cover that boundary. Debts, installment plans, payments and returns lack global collection routes: existing parent lists, ledger and by-ID routes are covered rather than adding endpoints. Corrections remain admin-only: employees get the existing 403 on their own scope; a B header is also rejected, and admin A/all list isolation is proved. Walk-in sales remain admin-only, with header A and a real single-active-branch no-header case; employee supplier-less receiving remains compatible with no header. The migration test's earlier CUSTOMER_BRANCH_MISMATCH expectation becomes the required privacy-preserving 404 while retaining its unchanged-row assertion. Existing accounting assertions were preserved; legacy tests gained explicit scope fixtures/mocks and changed mock call contracts only.

C2's write policy is documented on writeBranch and in plan §2.4: every mutation needs exactly one branch, including record-derived writes; Phase 4 must send the record branch for mutations from All branches. Production configuration was not enabled. Main checkout content and dirty work were untouched. No push, merge or Phase 3C work was performed. Generated graphify-out remains local and untracked.
