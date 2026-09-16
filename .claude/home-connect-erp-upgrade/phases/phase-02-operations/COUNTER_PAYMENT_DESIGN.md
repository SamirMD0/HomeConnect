# Prompt 10 — new counter receipts in the normal Payment model

Owner approvals: new receipts only; no historical backfill; nullable customer IDs for genuine customerless sales; no synthetic customer. Branch: `upgrade/phase-02-operations`.

## Monetary boundary

Counter cash is a normal Payment linked to its source SalesOrder. It is income, not an allocation against unrelated customer debt. A named partial sale still creates a debt for the unpaid remainder only; its counter payment has no receivable allocation. Existing balances and statements continue to derive effects only from real obligation allocations. Walk-in receipts are included in collection/report totals but excluded from named-customer history, payer counts, balances, and statements.

SalesOrder paid snapshots remain invoice settlement information, never an additional collected-money source. Reports sum Payment base snapshots once; they do not add sales paid totals. Original VAT/sale/currency/rate data is retained in the receipt's immutable source snapshot.

Monthly collections include counter Payments, but they must not be subtracted from outstanding receivables as if they settled debt. Disclose counter cash separately (`counterReceipts` / `nonReceivableCollected`); the month-end identity is opening + new obligations - collected + non-receivable collected + adjustments = closing. The disclosure is omitted when zero, preserving existing document and report layouts.

## Atomicity and retry

Creation of the sale, optional remainder debt, counter Payment, and audit occurs inside the existing serializable financial transaction. Positive-paid submissions require a caller idempotency key. Store the original canonical command fingerprint on the new sale, and a namespaced unique key on the Payment. Same command retries return the persisted sale without resolving current prices/tax/rates or creating a Payment again; conflicting reuse is rejected. Concurrent unique-key races replay the committed command after transaction rollback.

An additional cash receipt through the existing unlinked-order payment action records only the positive delta, with its own key/fingerprint, not the full cumulative paid snapshot again. Existing debt/plan linkage guards are preserved. Posted counter receipts protect monetary/identity rewrites; negative snapshot corrections must not silently rewrite recognized cash. Direct void/amount correction/reallocation of new counter receipts is not introduced here: these operations require a coherent sale/receivable correction design and must fail safely rather than alter only one side. Existing non-counter Payment correction behavior remains unchanged. Return/refund records stay separate negative transactions.

## Source validation and nullable customers

Payment.customerId is nullable only with a source sale. The payment customer must exactly match the source sale customer; there is no approved mismatch exception. Application validation and database checks/triggers protect this rule, including a later change to source customer identity. Named-customer payment endpoints keep their required real customer IDs. A null customer is rendered with bilingual walk-in labeling, not a fake customer entity.

## Currency

Sales creation/payment/totals/VAT use transaction currency, with USD two-decimal and LBP whole-unit precision. Store one effective/explicit exchange-rate snapshot; receipt and sale share it. Base snapshots use existing deterministic USD conversion helpers. Follow-on monetary item changes use the original sale currency/rate; they must not resolve a current rate to restate history. Partial remainder debts use the original currency/rate.

## Migration disclosure

Migration required: Yes — nullable Payment customer; optional sales-order FK, immutable receipt source snapshot and fingerprint on Payment; nullable unique creation key/fingerprint on SalesOrder; source-validation checks/triggers. No new money ledger.

Backward compatible: Existing named Payments are untouched; new columns are nullable. Positive-paid new submissions require an idempotency key. New client/UI requires migration before deployment.

Existing data impact: No Payment backfill, repricing, old-row rewrite, or business-database migration. Test migration and fixture writes use only the isolated test database.

Rollback strategy: Roll back code only before accepting new counter Payments. Retain additive metadata; reverting customer nullability after customerless receipts exist requires a separately approved reconciliation plan, never a fake customer or destructive cleanup.

Backup required: Standard verified backup before business deployment; production deployment is outside this task.

Validation check: tests first; full/partial USD/LBP creation, named/walk-in ownership, sequential/concurrent replay, conflicting keys, audit failure rollback, source validation, untouched historical Payments, report/history/collection inclusion, independently derived customer outstanding, full test suite/typecheck/lint. The inherited Prompt 07 migration-safety blocker is not bypassed.

Recorded implementation and verification results: [COUNTER_PAYMENT_VALIDATION.md](COUNTER_PAYMENT_VALIDATION.md).
