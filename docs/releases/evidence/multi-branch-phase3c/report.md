1. **Commits.** Approved 3B baseline: 9c57b6f. Worktree D:\User\Documents\HomeConnect-mb-phase3, branch feature/multi-branch-phase-3. The implementation commits below are followed by the final isolation/coverage/evidence commit (its hash is in the final handoff).

```text
174c612 feat(branches): require shared scopes and add aggregate breakdowns
78c835a feat(branches): isolate dashboards caches and activity feeds
882b44a feat(branches): scope report rows and tag branch exports
080f754 feat(branches): scope monthly reports and analysis breakdowns
```

2. **Endpoint table.** [endpoints.md](endpoints.md) lists every actual method/path pair: 42 report routes and 12 dashboard routes, 54 total. Each row records data scope, JSON branchBreakdown behavior and CSV Branch-column behavior. The table is generated from the actual Express coverage walk, saved in [route-inventory.json](route-inventory.json). Both prefixes, including the legacy dashboard summary and every report/CSV router, are behind requireAuth and branchScopeMiddleware. Reports/month-end keep their ADMIN guards; other dashboard endpoints retain their prior authenticated-user access. Dashboard cache keys now include the sorted accessible branch IDs and the role, preventing cache reuse between A, B, All or a revoked grant set.

3. **Raw SQL.** [raw-sql.diff](raw-sql.diff) contains the exact changes in report-rows.repository.ts and the legacy dashboard service.

- Customer integrity: parameterized, table-qualified UUID-array predicates on the owned roots/payment inputs and the final customer read; labels come from the customer branch.
- Supplier integrity: parameterized supplier-transaction and final supplier predicates; labels come from the supplier branch.
- Both use Prisma.sql with bound scope.branchIds values and ::uuid[] casts. No scope IDs are concatenated into SQL.
- Product cost-change SQL stays global under D3, with its existing date parameters and selection. It also uses the explicit Prisma.sql wrapper.
- The legacy dashboard's two transactions-table SQL queries were removed under the owner's explicit clarification: migration 20260830183000_remove_legacy_transactions drops that table. /dashboard/summary now adapts the existing scoped current-ledger financial calculation into the same seven legacy response fields and number types. It does not invent a replacement financial formula.

4. **Breakdown approach and single-branch choice.** Shared withBranchBreakdown computes the existing total with the full scope, then reruns exactly the same calculation with one branch at a time. It never derives or rounds the total from the breakdown. withEnvelopeBranchBreakdown retains report metadata and places the array alongside the existing data fields. Each row contains branchId, branchCode, branchName and the same calculated fields. **Zero or one accessible branch consistently omits branchBreakdown.** Global stock/product-only views and nonaggregate activity feeds omit it as well.

Stored base USD amounts remain the inputs to aggregate money. Customer receivables and supplier payables stay separate. analysis.cashflow.netCollectionPosition retains its period cash-flow meaning and calculation. Under the owner's explicit approval, supplier dashboard/month-end and supplier report summary inputs now use stored baseAmount instead of summing raw LBP amounts; the aggregation algorithms are unchanged.

Seeded GET /api/v1/dashboard/supplier-financial with X-Branch-Scope: all (excerpt; the full captured synthetic example is [all-example.json](all-example.json)):

```json
{
  "totals": {
    "owed": "240.00",
    "paid": "80.00"
  },
  "branchBreakdown": [
    {
      "branchId": "bdc8f89a-1fc0-45a5-836c-09090e899468",
      "branchCode": "3CAed9b9b78",
      "branchName": "3C A ed9b9b78c53947a1a729f8b708f969c2",
      "totals": {
        "owed": "80.00",
        "paid": "30.00"
      }
    },
    {
      "branchId": "0d47b474-0c6b-4ac8-89c9-9c558a60745b",
      "branchCode": "3CBed9b9b78",
      "branchName": "3C B ed9b9b78c53947a1a729f8b708f969c2",
      "totals": {
        "owed": "160.00",
        "paid": "50.00"
      }
    }
  ]
}
```

Owed: 80.00 + 160.00 = 240.00. Paid: 30.00 + 50.00 = 80.00. The same fixture proves customer outstanding 425.00 + 660.00 = 1085.00 and checks each aging bucket independently. LBP originals are large enough that adding them raw would fail these checks.

Inventory and product figures remain global and carry inventoryScope: all-branches on the relevant view/component. Rates/averages, oldest/largest representatives and top-N samples retain their original selection/calculation and are not summed as if they were totals. Mixed risk.total still includes global product alerts once in the full-scope total, while each branch calculation repeats that labelled global component; its explicit regression check is All = A + B - the shared global count. Branch-owned money/count figures are checked for ordinary exact additivity. This preserves the existing total calculations and D3 simultaneously.

Row-level CSVs prepend Branch using each record's branchName. All previous columns, their order, BOM/CRLF encoding and value formatting remain intact. Aggregate analysis/review CSVs prepend the selected branch name or All branches as a scope label; their JSON responses carry the full branchBreakdown arrays. Global inventory/products CSVs have no Branch column.

5. **Activity rule and write sites.** Branch-owned activity writes use the record's server-derived branchId. A read shows branchId in the effective scope, plus NULL-branch history/global rows only for ADMIN users. NULL history is not guessed/backfilled. The same rule applies to activity and recent-activity; service audits are restricted through their service-job parent. Global product/pricing activity sources are admin-only, matching NULL/global event visibility. The rule is recorded in plan §3.

| Site changed | Behavior |
| --- | --- |
| backend/src/features/financial/debts/debts.controller.ts, createDebt | The HTTP create composes the existing debt service and a DEBT_CREATED activity row in one runFinancialTransaction. The log uses created.branchId, never a client-supplied value. |
| backend/src/features/financial/credit-limits/credit-limit.service.ts, audit | CREDIT_LIMIT_OVERRIDE resolves the customer's immutable branch in the existing transaction and stores it on the log. |
| backend/src/features/branches/branches.service.ts, audit | Branch/access administration explicitly writes branchId: null. |

These are all production activityLog.create sites found by the sweep. DashboardActivityRepository scopes the legacy log source and each branch-owned source; service audits use serviceJob: scopeWhere(scope). The unmounted legacy recent-activity service also requires scope and role and applies the same NULL rule.

6. **Validation and exact commands.** Latest successful result across the exact 52-file manifest: **512 passed, 0 failed, 0 skipped, no suite errors**. The full set ran once; the five failing files alone were retried. Counts are not accumulated across repeated tests.

| Run | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Initial targeted set | 52 | 502 | 10 | 0 |
| Retry of failed files only | 5 | 88 | 0 | 0 |
| Latest result per file | 52 | 512 | 0 | 0 |

The failures corrected a missing supplier branch-name relation, new scope/CSV mock expectations, and test assumptions that representative rows or shared global counts were additive. All existing accounting assertions were retained; fixture/mock contracts gained explicit scopes and expected CSV bytes gained only the first Branch column.

Executed launchers:

```text
node docs/releases/evidence/multi-branch-phase3c/run-targeted-tests.cjs
node docs/releases/evidence/multi-branch-phase3c/run-targeted-tests.cjs backend/src/features/branches/branch-report-scope-db.integration.test.ts backend/src/features/financial/receivables/receivables.projection.test.ts backend/src/features/reports/metrics/reports-metrics.repository.test.ts backend/src/features/reports/monthly-debts/monthly-debts.service.test.ts backend/src/features/reports/monthly-review/monthly-review.service.test.ts
```

[vitest-commands.txt](vitest-commands.txt) records both complete expanded npx vitest commands, with all 52 and five explicit paths respectively. [commands.txt](commands.txt) also records typecheck, the exact 82-file ESLint command, and graphify commands. The manifest is [test-files.json](test-files.json); latest individual outcomes are [per-file-results.json](per-file-results.json).

The tracked launcher loads the worktree backend/.env privately, explicitly passes its DATABASE_URL to the child, checks its decoded database name before starting Vitest and refuses every name except homeconnect_test_phase4_phase5_phase6. It never prints the URL or credentials. It sets NODE_ENV=test and all nine RUN_*_DB_TESTS flags to 1, including the financial/return/fulfilment/receiving/purchase and phase-guarded flags required by included suites. Skipped/pending/todo tests fail the launcher. The database target was confirmed at the start of both commands; no live database was accessed. MULTI_BRANCH_SCOPING_ENABLED=true is stubbed only inside isolation tests and restored afterwards.

New tests comprise 62 real-database report/dashboard isolation cases, four breakdown-helper cases, one type-level required-scope contract and one legacy-summary compatibility case. Their exact expanded names/statuses are in [new-test-names.json](new-test-names.json). They cover every dashboard, all 17 row slices, monthly reports/analysis, role and branch denials, cache separation, activity A/B/NULL visibility, grant revocation/deactivation, USD/LBP additivity, aging buckets, separate receivables/payables, branch-labelled CSVs, global stock equivalence and transactional debt activity writes. The existing report read-only meta-test and a before/after database-state assertion also pass.

npm run typecheck: PASS. ESLint on 82 changed TypeScript files: 0 errors, 5 existing warnings, 0 new warnings. Three existing unused destructured variables are in report-rows.service.ts, and two pre-existing any warnings are in sales-returns-db.integration.test.ts; their details are in [validation.json](validation.json). graphify query succeeded before broad navigation; final graphify update . succeeded (13640 nodes, 36763 edges). Full test:ci, reconciliation and migration rehearsal were not run in 3C, per the targeted-only instruction.

7. **Decisions, assumptions and edges.**

- The two owner-approved baseline corrections are explicit above: use stored supplier base inputs with unchanged arithmetic, and repair the dead legacy dashboard by adapting existing current-ledger calculations while preserving its response fields/types.
- Existing role differences remain: employees do not gain admin top-debtor detail, admin-only report/month-end access or historical NULL activity. Isolation comparisons use the same figures available to each role.
- D3 keeps global product/stock evidence global, including ReportRowsRepository.receivedProducts, receivedQuantityTotal and receivingReconciliation. stockMovements, soldQuantityByProduct, productCategories and productCostChanges also remain global. They serve explicitly labelled inventory/products views, not branch money. ProductAnalyticsRepository/Service and InventoryService keep their global inputs. The scoped supplier-position receiving count is obtained separately through supplierReceivings(period, scope).
- Diagnostics and preflight remain global and admin-only; plan §4 Phase 3 records the decision. Their implementation was not modified.
- The required-scope sweep covers ReceivablesRepository.loadReceivableRecords, ReceivablesService.computeReceivableProjections, CorrectionAuditRepository.listCorrectionAudits, CustomerActivityService.list, supplierTransactionWhere, SupplierReceivingsRepository.findDuplicate and SupplierPayablesService.get, plus all 3C owned readers/callers. Existing ID/parent-keyed helpers inherited from approved 3A/3B remain behind those parent guards and immutable ownership; no new ambient scope is introduced.
- **Only one optional scope declaration remains:** backend/src/lib/search-query.ts:findSearchMatchIds, its fourth argument. This is the existing general search library, which also serves global product search; product callers must omit scope and C1 rejects supplying one. Branch-owned 3A–3C callers pass their required scope. No repository/service BranchScope parameter remains optional. [scope-audit.txt](scope-audit.txt) records the grep result.
- No schema/migration or stored business values were changed. Migration SHA-256 remains 776a8bb45e18c487cf8841c4f53416f7faba327c44e43e67e42327e98ca55ee5. No new receivable-minus-payable balance was introduced.
- Scanner/mobile LAN binding, printed headers and enabling production multi-branch scoping remain Phase 3D. Production configuration was not enabled. The main checkout and its dirty files were untouched. No push, merge or Phase 3D work was performed. Generated graphify-out remains local and untracked.
