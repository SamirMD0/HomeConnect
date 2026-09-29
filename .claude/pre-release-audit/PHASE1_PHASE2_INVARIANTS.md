# Phase 1 / Phase 2 invariant review

Reviewed the actual MASTER_PLAN, ARCHITECTURE_DECISIONS, RISK_REGISTER, TESTING_STRATEGY, PRODUCTION_READINESS and PLAN/PROMPTS/REVIEW/SUMMARY for both phases. Planning claims are not substitutes for current evidence. The full-suite JSON records individual test names and outcomes.

| Invariant | Current evidence / limitation |
|---|---|
| Customer balance is derived, never a mutable stored balance | Restored customer report: 105/105 match, USD-base 22,550.00, difference 0.00. Debt/installment/payment DB suites enabled. |
| Supplier balance derives from purchases, payments and credits | 3/3 suppliers match, USD-base 1,205,821.00, difference 0.00; purchase and receiving DB suites enabled. |
| Financial money uses Decimal; no floating-point posting | Currency, VAT, return allocation and financial DB suites pass in the recorded zero-skip run. |
| Posting is atomic, serializable and idempotent | DB tests cover payment replay, receiving retries, return rollback on final audit failure, debt and installment transactions. Browser purchase replay checks unchanged result and stock. |
| Counter receipts have valid source ownership | Nullable customerId constrained to a source sale; trigger enforces matching customer identity. Browser creates one customerless receipt. No historical receipt fabrication. |
| Inventory is append-only movements with concurrency protection | Inventory/receiving/fulfillment/returns DB suites; restored mismatch=0. 82 products intentionally outside inventory and one pending onboarding are not certified stock counts. |
| Purchasing updates cost, not manual selling price | Browser verifies stock +3 once, cost 342.34 from 380 inclusive / 1.11, public price remains 400.00. Automatic pricing has dedicated audit/rollback tests. |
| VAT snapshots do not change with configuration | VAT and return suites exercise original rates, zero-rated/inclusive/exclusive calculations, delivery treatment and cumulative residuals. USD/LBP browser partial returns preserve original VAT and FX. |
| Historical FX snapshots drive reports and reversals | Currency services and return tests; browser checks original exchangeRate unchanged. No today's-rate rewrite authorized. |
| Partial returns cannot exceed sold quantity | Return validation/allocation/service/DB suites. SELLABLE changes stock; DAMAGED/QUARANTINE do not increase sellable stock. |
| Debt relief, cash refund and store credit are separate offsets | Atomic return tables and FK constraints; dedicated DB rollback tests. Browser exercises mixed relief/refund; exact amounts retained in attachments. |
| Due dates and aging do not rewrite ledger | Additive supplier due date; FIFO aging is reporting allocation, not new payments. Aging/report suites pass. |
| Printed documents use immutable snapshots | Renderer/snapshot tests included; physical invoice, receipt, barcode and thermal-paper acceptance still required. |
| Audit records remain attributable | Actor snapshots and transaction-bound audit tests; CSV-import inventory after-value completeness still needs focused review. |
| Authentication rechecks disabled users | Middleware/security suites; Playwright UI login/logout, disabled login, invalid bearer. |
| Financial and configuration mutations retain permissions/password gates | Route/security suites run. No password gates removed by this audit. Dependency advisories remain a separate security gate. |

Historical Phase 1 acceptance items (owner review of legacy screens, off-machine backup, restore/startup recovery objective) are not automatically closed by these automated tests. The documented historical counter-cash gap (983 USD, or 883 excluding draft/cancelled orders) remains an explicitly unbackfilled legacy limitation, not a new reconciliation difference. No COGS/profit capability is claimed solely from future phase plans.

The earlier 2,815-test run passed with zero skips. The final rerun after Beirut midnight supersedes that overall result: **2,812 passed, 4 failed, 0 skipped (2,816 total)**. Three failures use UTC fixture dates against Beirut business-date rules; the return/report test also reports newDebt=0 instead of 50 for the local day. That reporting boundary needs investigation, not an assumption that every failure is merely a fixture problem. The passing assertions and restored reconciliation above remain evidence, but the full regression gate is now FAIL. See FINAL_RELEASE_REVIEW.md.
