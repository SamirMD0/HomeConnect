# Phase 2 operations: documents, atomic returns and reconciled reporting

## Problem and resulting behavior

Customers can receive bilingual invoices, receipts and derived statements. Returns now post stock restoration, receivable relief, refund/credit and audit atomically; all affected projections recognize the return. Counter receipts are immutable source-linked Payments counted once, while debt collections and non-receivable cash remain distinct. Credit-limit configuration cannot be bypassed through employee customer edits. Supplier aging and protected product categories complete the implemented operational work.

## Business rules and scope

- Partial/full returns retain original currency/VAT snapshots and require ADMIN verification. Cash refunds and store credit are separate from receivable relief.
- Only ADMIN can configure customer limits; over-limit debt needs audited ADMIN password/reason approval.
- Counter-cash scope is new receipts only. The owner-approved no-historical-backfill decision remains; the historical omission prevents literal all-history acceptance.
- Payable aging uses report-only FIFO and exposes unscheduled balances/excess credit; it does not rewrite the ledger.
- Categories were brought forward by the later recorded owner request and use English labels.
- Existing shop-wide staff document-read permissions remain; no owner-only policy is inferred.

## Commit structure

Return: `a2ad615`. Counter cash: `717ebde`. These are separate from CI `76f928d`, credit limits `28aaa05`, aging `bd46527`, and categories `d51c32c`. Invoice/receipt/statement: `6e8048e`, `00fb236`, `33378f7`. All are on develop; main is unchanged at `ac6ae9f`.

## Database migration disclosure

Migration required: **Yes**, six Phase 2 migrations plus two pending Phase 1 VAT migrations on the tested business copy. See [SUMMARY.md migration table](SUMMARY.md#migration-disclosures) for each filename and exact impact.

Backward compatible: Additive tables/nullable settings and dueDate/creditLimit/categoryId; existing named Payments preserved. New client/code requires the migrated schema. Positive-paid submissions require idempotency keys; customerless receipts require the new nullable/source-validated Payment model.

Existing data impact: No historical return/counter-payment backfill or business database mutation. Restored-copy legacy Payment fields and aggregate balances are unchanged.

Rollback strategy: Keep additive data. Before feature use, code rollback can leave metadata. After posted returns/customerless receipts, older application assumptions are unsafe; use a compatible release or an approved audited reconciliation/restore plan. Never discard posted money/stock events.

Backup required: **Yes** before deployment. Local restored-copy rehearsal used a verified 232,137-byte backup; off-machine operational backup remains a release prerequisite.

Validation: All eight pending migrations applied via the application executor with the safety scanner; replay has zero pending/failed/mismatched. Customer 22,114.00 USD and supplier 1,205,821.00 USD reconcile exactly; inventory zero mismatches. Nonempty return stock fixture reconciles at 10 units.

## Validation

- Full test:ci: **308 files, 2,458 passed, 0 skipped files/tests**. [Unabridged output](evidence/2026-09-16/phase2-final-ci.log).
- Frontend/backend typecheck and production build pass; lint 0 errors/70 warnings.
- Isolated return and counter-cash staged trees each typecheck with their own schema.
- Full authenticated return: outstanding 170.00 to 130.00, stock 8 to 10, return 100.00 = 40.00 relief + 60.00 refund; replay changes nothing; all integrity reports clean.
- A4 PDFs opened and every page visually checked for Arabic and clipping. Invoice 100.00, split receipt 20.00, statement closing 130.00 match source data exactly.

## Screenshots and documents

- [Invoice](evidence/2026-09-16/phase2-fixed-invoice-1.png) / [PDF](evidence/2026-09-16/phase2-fixed-invoice.pdf)
- [Receipt](evidence/2026-09-16/phase2-fixed-receipt-1.png) / [PDF](evidence/2026-09-16/phase2-fixed-receipt.pdf)
- [Statement first page](evidence/2026-09-16/phase2-fixed-statement-1.png) / [all five pages](evidence/2026-09-16/phase2-fixed-statement.pdf)
- [Return](evidence/2026-09-16/phase2-fixed-return-1.png) / [PDF](evidence/2026-09-16/phase2-fixed-return.pdf)

## Risks, follow-up and checkpoint verdict

**NOT COMPLETE.** Local bug fixes pass; historical cash omission, literal document-isolation wording, remaining manual evidence and hosted checkpoint evidence are unresolved. No published PR or green hosted CI run for these commits is claimed. This file is a review-ready local description, not evidence that a PR exists.

[SUMMARY.md](SUMMARY.md) lists owners, target gates, acceptance evidence, migration restrictions and carried-forward Phase 1 C4/C5/C6 deployment requirements. [Risk register](../../RISK_REGISTER.md): R-12/R-15, R-29, R-32 through R-35. Do not merge to main, deploy, or treat this as permission to start Phase 3.
