# Cross-feature conflicts

| Systems | Risk | Evidence / disposition |
|---|---|---|
| VAT × returns × USD/LBP | Recompute with current rate or lose residual cents | Full return DB/allocation suites plus USD/LBP browser partial returns; original snapshots retained. |
| Mixed cash/debt × returns | Double refund or leave debt after relief | DB financial reconciliation and browser sale/return; refund and relief remain distinct. |
| Walk-in receipts × named customer reports | Null ownership pollutes customer balances | DB source triggers and receipt/report tests; browser checks customerId=null and one receipt. |
| Purchase × receiving × retries | Stock/cost doubled | DB suites and real API replay with DB stock assertion. UI-only receiving retry still a coverage gap. |
| Cost × manual/automatic pricing | Unexpected public price mutation | Manual 400 preserved after purchase; dedicated preset recalculation/audit tests. |
| Secret price × SKU/barcode × public price | Staff suffix becomes scanned identity | Resolver/encoder/renderer tests; browser prints preserve stored SKU, barcode and price. Physical scanner mandatory; browser suite does not decode printed bars. |
| VAT/currency × pricing cards | Incorrect advertised payable price | Calculation/resolver tests. Five category-labelled fixtures use the TV template; they do not certify every category default or LBP visual layout. |
| Product specifications × cards | Malformed persisted JSON crashes renderer | Initial audit fixture used key instead of required label, causing a real renderer exception. Fixture corrected to API-valid shape. Legacy malformed-data resilience is not established. |
| No pricing preset × product drawer | Background calculator request fails | Observed HTTP 400 on /pricing/calculate when opening a manual-priced fixture without a default preset. Not waived globally. Requires deliberate unavailable-preview handling. |
| Template migrations × existing customization | Seed updates overwrite operator choices | Legacy border update and icon refresh are keyed by seeded ID/code, not exact original content. Preserve/customization rehearsal required. |
| Thermal template × historical migration checksums | Applied migration edited in place | Stored checksum equals original 4aa36bc SQL, not HEAD. Forward-only repair/reconciliation needed. No metadata rewritten. |
| Electron startup monitor × production CSP | Inline monitor script blocked, retry controls inert | Reproduced with Playwright; file responses now keep monitor policy, HTTP renderer remains strict. Regression test added. |
| Electron timeout/retry × child lifecycle | Failed attempt leaves owned backend alive | Added cancellation on early exit, cleanup before retry and awaited quit cleanup; startup tests exercise owned port release. |
| CSV import × identity × categories | Empty existing-product selector for category-only conflict | UI only offers merge when actual matches exist and resolves category mapping first. Parser/service/route/component tests included. Real browser CSV review remains outstanding. |
| CSV import × inventory × audit | Unintended stock replacement or duplicate import | Persisted draft and transactional commit; reconciliation password gate. Real-DB concurrent import and audit after-stock snapshots need explicit follow-up. |
| Brand/icon uploads × Electron renderer | SVG script/XSS or blocked assets | Sanitizer/security suites; actual logo and fallback/icon physical output still require acceptance. Dependency audit has unresolved advisories. |
| Pricing print snapshots × printer cancellation | Snapshot does not prove physical print | Browser verifies print dispatch only; no printer/scanner success claim. |
| Fresh migration × seed | Sales fail without default tax profile | Fresh migrations precede users; required VAT seed/config bootstrap documented. Initial fixture omitted it and correctly received 404; fixed fixture mirrors seed. |
| Beirut business date × UTC timestamps × daily reports | Early-local-day activity excluded or receipt predates opening | Final post-midnight suite: three UTC fixture mismatches and return/activity newDebt 0 vs 50. Monthly report timestamp boundaries use UTC-midnight date conversion; unresolved. |

No inference that modules are independent. A passing unit suite does not close the migration, desktop startup, installation or physical printing gates.
