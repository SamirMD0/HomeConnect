# Financial and inventory integrity

## Realistic restored business data

Read-only report execution on `hc_audit_test_restored_20260926124725`; evidence/integrity-restored.json.

| Reconciliation | Reported | Independent | Difference | Rows |
|---|---:|---:|---:|---:|
| Customers (USD base) | 22,550.00 | 22,550.00 | 0.00 | 105 OK, 0 mismatch |
| Suppliers (USD base) | 1,205,821.00 | 1,205,821.00 | 0.00 | 3 OK, 0 mismatch |

Inventory: 97 products, 14 OK, 82 not in inventory, 1 pending onboarding, 0 mismatches. This is not a claim that all 97 products have physically verified quantities. Maintenance integrity service reports available=true.

Original/restored before and after raw monetary sums are identical: debts.originalAmount 16,025.13; payments.totalAmount 3,603.13; sales_orders.totalAmount 5,360.13; supplier_transactions.amount 1,297,221.00. These raw column sums are preservation checks, not a valid sum across arbitrary mixed native currencies. Original payment-field hash remains `2153bc621922a1a914b70874811172e7`. No historical receipt backfill or repair was performed.

## Cross-feature execution

- USD: product cost 370/public 400; quantity 2 sale total 800, paid 600, initial debt 200; deduct two units, return one SELLABLE with CASH_OUT destination, restore one unit. Original FX/VAT snapshots preserved; replay returns same return ID without a second record. Financial attachments in Playwright JSON retain exact posted result.
- LBP: product cost 33,115,000/public 35,800,000; quantity 2 gross 71,600,000, paid 53,700,000; same deduction/partial-return/replay path, whole-LBP API amounts and original FX snapshots retained.
- Purchasing: 3 × 380 VAT-inclusive = 1,140 payable; effective unit cost 342.34 ex VAT; manual public price remains 400; replay adds no duplicate stock. Browser reports reconcile the resulting synthetic accounts.
- Walk-in: a 400 cash sale produces one Payment linked to sale with customerId=null.

The zero-skip integration run also executes real-DB complete returns, damaged disposition, cumulative $50 inclusive 11% partials, exact final residuals, later receipt printing after relief, and rollback of stock/finance/refund/audit on a final audit-write failure. Calculation/validator suites cover LBP cumulative base anchors, quantity bounds, return windows/overrides, stock dispositions, zero/exclusive VAT and delivery treatment. See evidence/vitest-report.json for individual assertions; do not confuse mocked service tests with the explicitly enabled DB suites.

Not certified: implementation-specific profit/COGS not present in this release's tested workflows; physical stock counts; accountant sign-off; all edge cases repeated through the browser UI. Reconciliation passing does not resolve migration-history risk.

Final regression qualification: the later post-midnight full run has four failures (evidence/test-ci.log). Two receiving/purchase tests date the receipt using UTC today while opening movements use actual timestamps interpreted in Beirut. The new-product validator fixture also uses UTC today against the intentional business-today restriction. A fourth, return/report integration assertion expects newDebt=50 but receives 0, with closingBalance=0 and returnCredits=50 still correct. Monthly activity selects timestamp createdAt using businessDateToPrisma UTC-midnight boundaries; this can exclude early-local-day debt creation. Treat this as a reporting/date-boundary defect requiring a deterministic midnight regression and a reviewed fix. Do not claim all financial regressions pass from the earlier run.

Synthetic browser dataset reconciliation after all exploratory runs: customers 200.00 versus 200.00; suppliers 3,420.00 versus 3,420.00; six tracked products all OK, zero inventory mismatches. The accumulated dataset includes an earlier sale whose test stopped before return; it is not a clean single-scenario balance. Evidence/integrity-browser.json.

## Backup recovery

Fresh recovery rehearsal: custom archive 612,752 bytes, SHA-256 `0e04336167155646b08969830bba2d2d0d32a6fc31279dcfd763dad69d75b769`. Dump 9.716 s, archive list validation 0.242 s, isolated restore 5.080 s, migration status/apply check 0.716 s, current backend DB-health readiness 4.470 s. Evidence/recovery-rehearsal.json and recovery-*.log. Migration checksum gate remains nonzero. Backup is local, not an independently verified off-machine copy. Installer/upgrade and interactive restored-data workflows remain open.
