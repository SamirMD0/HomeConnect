# PHASE 2 — SUMMARY

**Reviewed:** 2026-09-16 · **Branch:** `develop` · **Verdict:** `NOT COMPLETE`

The bugs reproduced in the independent review are fixed and committed. Local CI, build, restored-copy reconciliation and the exercised return/print paths pass. This does not satisfy every literal checkpoint criterion: historical counter cash is intentionally unbackfilled, some manual acceptance evidence remains missing, and no hosted CI run covers these new commits. Phase 3 is not authorized by this checkpoint.

## Completed changes and commits

Phase 1 checkpoint `2f6088d` is an ancestor. Its accepted verdict was COMPLETE WITH DEPLOYMENT FOLLOW-UP.

| Commit | Scope |
|---|---|
| `c837bd6` | Print pipeline study |
| `6e8048e` | T1 bilingual invoice, delivery VAT and business settings |
| `00fb236` | T2 bilingual receipt |
| `33378f7` | T3 derived customer statement |
| `76f928d` | CI database-name guards and mandatory zero-skips gate |
| **`a2ad615`** | **T4 atomic returns and dependent financial projections** |
| **`717ebde`** | **T8 source-linked counter receipts and cash reporting** |
| `28aaa05` | T6 derived credit limits and ADMIN-only configuration |
| `bd46527` | T5 supplier due dates, aging and alerts |
| `d51c32c` | T7 category hierarchy, filters and report labels |

T4 and T8 are separate from categories, credit limits and supplier aging. Each includes its own migration, dependent code and tests. Both staged trees passed independent frontend/backend type checks with their own generated Prisma clients. Reverting after real transactions exist requires the data-compatibility precautions below.

All implementation is on develop. `main` and observed origin/main remain `ac6ae9f555dd69d61ca79be527cc1a80513643d9`; no commit was made to main. The pre-existing phase branch was preserved, with its commits incorporated into develop. Commits are local; this task does not publish, merge or deploy.

### Review defects closed

- Return relief now reaches receivables, aging, monthly balances/activity, customer movements, ledger, dashboard, debt/plan status and payment calculations. Credits are separate from new debt and cash collections.
- Gross sales, returns, net sales, refunds and store credit are separately reported. Counter receipts count once as collections and never again as debt settlement.
- Historical receipt balances respect return-credit timestamps. Returned financial records reject unsafe independent edits, cancellation, voiding and reallocation. Legitimate payments after partial returns use the remaining balance.
- Return stock offsets preserve the original fulfillment reversal constraint. The additive migration passes the unchanged SQL safety scanner; a DB regression still rejects invalid legacy cancellation.
- Return documents now serialize the original sale date correctly. Returns invalidate related cached views.
- EMPLOYEE customer edits can no longer set, raise or clear limits. An actual attempt to clear 100.00 returned 403; the stored limit stayed 100.00. Ordinary customer-edit permissions remain unchanged.
- CI recognizes safely delimited `ci` and `test` database names. A post-run gate rejects any skipped test or file.

## Verification and full output

Final `npm run test:ci` used isolated `homeconnect_ci_phase4_phase5_phase6_review_20260915`, with all CI DB flags enabled. [Full unabridged stdout/stderr](evidence/2026-09-16/phase2-final-ci.log):

```text
Test Files  308 passed (308)
     Tests  2458 passed (2458)
  Start at  13:09:04
  Duration  198.55s
CI gate passed: 308 files, 2458 tests, 0 skipped files, 0 skipped tests.
```

[Typecheck](evidence/2026-09-16/phase2-final-typecheck.log) and [production build](evidence/2026-09-16/phase2-final-build.log) passed. [Lint](evidence/2026-09-16/phase2-fix-lint.log): 0 errors, 70 warnings. Build retains the large-chunk warning. Subsequent staging separated the tested source; final schema/whitespace cleanup did not change semantics.

Earlier review failures and the four-file skip reproduction were real failures, superseded by this full run, not waived. No skipped-file or money-double-counting exception is used.

## Restored-data rehearsal and all three integrity reports

A read-only business backup was restored to `homeconnect_phase2_restored_review_20260915`. The application MigrationExecutor, including its normal safety scanner, applied all eight pending migrations (two Phase 1, six Phase 2). This was programmatic execution of the application migration path, not an invocation of the `rehearse:migrations` CLI. [Outcomes/durations](evidence/2026-09-16/migration-outcomes.json), [backup metadata](evidence/2026-09-16/phase2-restore-metadata.json), [final validation](evidence/2026-09-16/phase2-restored-validation.json).

Backup: 232,137 bytes; SHA-256 `22174bdcebe08b10e478944ccae38c7d46f311cee7cce642f3cd8fe8e3f5df55`. The private backup is not committed. Restore exit 0. Final state: 43 migrations; pending 0, failed 0, checksum mismatches 0; replay pending 0.

| Report on migrated restored copy | Result |
|---|---|
| Inventory | 0 rows, 0 mismatches; no tracked product rows in this business data. Nonempty inventory exercised below. |
| Customer financial | 105 checked, 105 OK, 0 mismatches; reported **22,114.00 USD** = independent **22,114.00 USD**, difference **0.00** |
| Supplier financial | 3 checked, 3 OK, 0 mismatches; reported **1,205,821.00 USD** = independent **1,205,821.00 USD**, difference **0.00** |

T8 before/after: pre-migration compatibility and post-migration current customer report both show 105 customers, 22,114.00 USD and no mismatches. Original read-only source and migrated copy agree on 107 customer records, 18 orders, 4,124.13 base sales, 15 Payments totaling 2,803.13 base, 17 stock movements and original-payment-field hash `b5e176e7961580de04d315c994b9c904`. No backfill or balance change. An initial whole-row JSON hash changed when nullable columns were added; final verification hashes the original fields and passes.

The business database remains unmigrated. Current Phase 2 reports require the new schema and run on the restored copy until controlled deployment. This does not claim they run on the old live schema.

## Printed documents: exact source comparisons

Actual React documents were rendered from DB-backed service payloads with application CSS, printed by Chromium, opened/rasterized and visually inspected on every page. [A4 dimensions](evidence/2026-09-16/phase2-fixed-print-check.json); [source/API evidence](evidence/2026-09-16/phase2-fix-evidence.json). These are disposable fixtures, not real customer documents.

| Document | Numbers compared exactly | Result |
|---|---|---|
| [Invoice PDF](evidence/2026-09-16/phase2-fixed-invoice.pdf), [image](evidence/2026-09-16/phase2-fixed-invoice-1.png) | 2 × 50.00 = **100.00**; **90.09 subtotal + 9.91 VAT = 100.00**; paid snapshot **50.00**, remaining snapshot **50.00**; delivery **0.00** | 1 A4 page; legible joined Arabic/RTL, no clipping |
| [Receipt PDF](evidence/2026-09-16/phase2-fixed-receipt.pdf), [image](evidence/2026-09-16/phase2-fixed-receipt-1.png) | **20.00** received = **10.00 + 10.00** allocations; receipt-time balances **40.00** and **90.00**; identical re-fetch after return | 1 A4 page; Arabic correct, no clipping |
| [Statement PDF](evidence/2026-09-16/phase2-fixed-statement.pdf), [first image](evidence/2026-09-16/phase2-fixed-statement-1.png) | **0 + 190.00 − 20.00 − 40.00 = 130.00**; all **45** running balances checked. LBP **89,500** at **89,500/USD** = **1.00 USD**. Counter receipt **50.00** has **0.00** receivable effect. | All 5 A4 pages inspected, intact rows/repeated headings, Arabic correct; closing = derived outstanding **130.00** |
| [Return PDF](evidence/2026-09-16/phase2-fixed-return.pdf), [image](evidence/2026-09-16/phase2-fixed-return-1.png) | **100.00 = 40.00 relief + 60.00 refund**; **90.09 net + 9.91 VAT**; original date **15/09/2026** | 1 A4 page; Arabic, amounts and date correct |

All pages measure approximately 209.89 × 297.01 mm. Statement images 2–5 are included beside page 1. This verifies Chromium print-to-PDF; physical printing and Electron's native Save dialog were not exercised. A separate real LBP invoice print remains unverified.

## Full return end to end

An authenticated ADMIN API action returned both sold units as SELLABLE. Replaying the request returned the same return ID. The form submits this single action; an interactive browser walkthrough is not claimed.

| Measurement | Before | After |
|---|---:|---:|
| Customer outstanding | 170.00 | **130.00** |
| Order obligation after intervening payment | 40.00 | **0.00** |
| Stock | 8 | **10** |
| Return stock movements | 0 | **1**, still 1 after replay |
| Return gross / relief / refund | 0 / 0 / 0 | **100.00 / 40.00 / 60.00**, unchanged after replay |
| Customer integrity mismatches / difference | 0 / 0.00 | **0 / 0.00** |

Statement, receivables, monthly and independent outstanding all equal **130.00**; stock movement sum equals **10**. All three integrity reports are clean before/after; supplier fixture rows are empty, so nonempty supplier evidence comes from the restored copy. Gross sales **100.00**, returns **100.00**, net **0.00**, cash refund **60.00**. Gross paid/unpaid snapshots remain history, not live receivable balances.

Nine real return DB tests cover rollback after an injected audit failure, retry, partial/full returns and original currency/VAT rounding. Another regression pays 10.00 after a 50.00 return credit on a 100.00 unpaid sale: receipt/outstanding **40.00**; a further **41.00** payment is rejected. Customer movements disclose new debt and return credits separately.

## Acceptance criteria

| Task | Evidence / remaining gap |
|---|---|
| T1 invoice | Exercised A4 totals/Arabic and snapshots pass. Native desktop export and universal-layout manual coverage unproven. |
| T2 receipt | Split/reprint above; VOID and customerless counter-receipt rendering tests pass. |
| T3 statement | 45 running balances and closing 130.00 match independent/receivable/monthly totals after return. |
| T4 return | API/DB atomicity, replay, stock/money/report reconciliation and print pass; interactive walkthrough pending. |
| T5 aging | `supplier-payables.test.ts`: 0/1/30/31/60/61/90/91-day and due-soon 0/7/8 boundaries, FIFO/credits/mixed currencies; DB and dashboard-alert tests pass; restored ledger reconciles. |
| T6 limits | Derived outstanding read in debt-creation transaction; null/zero/under/equal/over and audited ADMIN override tests pass. Configuration bypass now 403. Live warning visual check pending. |
| T7 categories | Hierarchy/filter/nullable/RESTRICT and seven DB tests pass. Later owner Prompt 12 brought categories forward from Phase 5; English-only, no seeded example taxonomy. |
| T8 cash | New receipts/deltas counted once; DB tests cover zero/double-count, replay, rollback. **All-history acceptance not met:** 12 legacy paid snapshots **983.00 USD**, **883.00** excluding draft/cancelled. Owner approved new receipts only, no backfill. |
| T10 currency/VAT | Phase 1 settles VAT-inclusive defaults. Services use selected currency/original rates. USD/LBP and original-VAT reversal tests, mixed-currency printed statement pass. Separate LBP invoice print pending. |
| T9 checkpoint | Local regression/migration/integrity pass; historical cash, manual evidence and hosted CI/PR remain open. |

### Remaining REVIEW.md checks

- **Branch/commits:** develop includes Phase 1 and all Phase 2 commits; main unchanged; T4/T8 separate. Implementation worktree was clean after the commits; this summary/evidence is committed separately.
- **Backend guards:** SalesReturnsService.create uses one serializable transaction. RETURN_TRACE mapping: ADMIN route/service check; transactional order existence/status; same-customer/currency financial source; available original fulfillment/quantity; reason/password validation; linked movements/allocations/audit. Original cancellation constraint remains; returns offset ACTIVE original fulfillment records.
- **Derived values:** statement running balances are server-side, never persisted. Template inspection found no financial-total arithmetic; snapshots bind figures to API values. Credit-limit checks/audit use the debt transaction.
- **Database:** additive tables/nullable fields, Decimal money, restrictive refund/credit/category FKs and real constraint tests pass. T8 intentionally allows nullable Payment customer only for source-validated sales. No backfill ran.
- **Documents/UI:** A4/Arabic/page boundaries/PDF rendering pass as above; VOID labels covered. Pending/loading state inspected across return/settings/credit/category/supplier forms; shared Button disables while loading. Warning amount and disabled-state component tests pass. Comprehensive interactive checks remain missing.
- **Authorization:** anonymous invoice/receipt/statement requests return 401; ADMIN return checks and endpoint auth tests pass. Existing shop-wide staff access lets another authenticated employee fetch the same documents (200). The literal owner-isolation wording is therefore **not met/proven**; no new ownership policy was silently invented. Credit configuration and audited override boundaries are enforced.
- **Logging:** generic redaction tests pass; inspected document request logs contain no document bodies. Dedicated per-document payload-redaction tests were not established.
- **Tests:** real DB mid-return rollback covers INV-05; counter-payment zero/double-count tests cover INV-09 for new receipts. Zero skipped files/tests; document snapshots exist. Historical task records describe red-first runs, but an independent complete archive of every pre-implementation failure was not reconstructed.
- **Scope:** VAT/currency approved in Phase 1/PLAN. No POS/till subsystem. Categories reintroduced by recorded owner instruction; T4/T8 not deferred. Currency pickers do not sit over unconditional USD creation writes.
- **Checkpoint:** full logs/screenshots/migration disclosures and review-ready PR text are included. No published PR or new hosted CI URL; old invoice-only green CI does not cover this work.

## Migration disclosures

All six Phase 2 migrations require a verified backup before business deployment. They passed restored-copy/test-DB validation. No business migration was applied in this task.

| Migration | Compatibility / existing data | Rollback |
|---|---|---|
| `20260909100000_add_delivery_vat_and_business_settings` | Adds delivery VAT snapshots and settings, preserving existing sale values | Retain schema/snapshots; compatible application |
| `20260911120000_add_atomic_sales_returns` | Adds constrained returns/lines/allocations/refunds/credits/enums/window; no old-sale backfill; original reversal constraint retained | **After posted returns, old code is unsafe:** retain compatible code or audited data migration/verified restore. Never drop posted returns |
| `20260914123000_add_supplier_due_dates` | Nullable date/index; no balance/date backfill | Revert code, retain column |
| `20260914140000_add_counter_payment_sources` | Nullable source/key metadata, validated nullable customer; old Payments untouched; new paid requests require keys | Before receipts, revert code/retain metadata; after customerless receipts, compatible release or approved reconciliation required |
| `20260914160000_add_customer_credit_limits` | Nullable Decimal(12,2), nonnegative; old customers unrestricted | Revert code, retain configured values |
| `20260914180000_add_product_categories` | Category table/nullable FK; RESTRICT; old products uncategorized | Revert code, retain assignments |

New money columns use Decimal(12,2); rates retain approved higher precision. Rehearsal also applied the two pending Phase 1 VAT migrations. Only the previously uncommitted return migration was corrected; applied business checksums were not rewritten. The old disposable DB with the earlier return checksum was left unused.

## Open items and Phase 1 carry-forward

| Item | Owner / target | Required action |
|---|---|---|
| Historical cash vs literal T8 acceptance | Business owner + engineering / Phase 2 close | Approve compatible remediation or explicitly revise acceptance. Recorded **no backfill** decision remains in force. |
| Staff-wide documents vs entity-isolation wording | Owner + reviewer / Phase 2 close | Decide whether review intends a new access boundary. |
| Manual acceptance | QA + shop owner / Phase 2 close | Native print/save, LBP invoice, interactive return, warning/pending UI and document redaction evidence. |
| Hosted CI/PR | Maintainer / Phase 2 close | Publish/review current commits and attach green run; PR_DESCRIPTION.md provides local review text. |
| Phase 1 C4 | Owner / before release | Legacy Ledger panel-removal sign-off. |
| Phase 1 C5 | Operator / before release | Off-machine backup, copied checksum and archive readability; same-disk backup insufficient. |
| Phase 1 C6 | Operator + QA / before release | Local real restore/migrations/integrity now demonstrated; timed full application launch and achieved recovery time still pending. |
| Controlled deployment | Operator + owner / final release | Business remains on old schema; backup, authorized migration, startup and all reports required. |

Risks: [RISK_REGISTER.md](../../RISK_REGISTER.md), especially R-12/R-15 (restore/backup), R-29 (main), R-32 (separate commits), R-33 (migration history), R-34/R-35 (review and zero-skip CI).

**Final verdict: NOT COMPLETE.** Identified implementation bugs are corrected and local checks pass. COMPLETE or COMPLETE WITH FOLLOW-UP would overstate literal all-money acceptance and missing checkpoint evidence. Any skipped file, double-counted money, failed reconciliation or unsafe unreviewed rollback remains a hard failure; none is waived.
