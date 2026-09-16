# Prompt 11 — customer credit limits

Owner approved warning with ADMIN step-up override. Cumulative branch: `develop`; leave main untouched.

## Rules and assumptions

The nullable `Customer.creditLimit` is expressed in base USD, matching the existing customer-profile derived outstanding. Blank/null means unrestricted; zero deliberately permits no positive new credit. No historical limits are backfilled. The normal customer editing permissions remain unchanged.

Limit configuration is ADMIN-only. The review reproduced an EMPLOYEE clearing a limit through ordinary customer editing; the authorized bug-fix pass now rejects that field with HTTP 403 for non-admin actors, including null/clear values. Ordinary customer-field permissions remain unchanged. Both the service and the UI enforce the field boundary; API tests protect against bypass.

Enforce at `DebtsService.createDebt`, shared by direct debt creation, new sale remainder debts, explicit sales debt conversion, and automatic sales debt creation during eligible mutations. Convert only the new debt from its original currency/rate snapshot to base USD. Compare `current derived outstanding + new base debt` with the limit; equality is allowed. Reuse the customer profile's existing debt/installment/return-allocation computation, with the caller transaction, rather than introducing a cached balance or second balance calculator.

Direct creation gets a serializable `runFinancialTransaction`; callers already inside a financial transaction reuse it without nesting. Predicate reads and writes share that transaction so concurrent extensions of credit must serialize/retry and re-evaluate the projection. No balance or running total is stored.

An over-limit request without an approved override returns 409 `CREDIT_LIMIT_EXCEEDED` with server-computed current outstanding, limit, projected outstanding and overage. An explicit override requires the current actor to be ADMIN, a non-empty reason of at least five characters, and successful existing rate-limited ADMIN password verification. Audit the reason, customer, new debt, projection and actor in the SAME transaction; never log the password. Failure at any step rolls back debt/sale/payment/override audit together.

Frontend warnings use those server-returned amounts, not frontend balance arithmetic. Offer override fields only to ADMIN actors. Existing old clients remain valid for unrestricted/under-limit customers; over-limit submissions must explicitly acknowledge and verify the exception. Receipt/sale replay fingerprints exclude password secrets while retaining the non-secret override decision/reason.

Scope is the debt creation and sales-to-debt paths required by Prompt 11. New installment-plan creation, editing an existing debt principal, and the separate prepaid delivery/remainder conversion need their own policy review; do not silently change those existing workflows. A prepaid purchase held by the business is not profile outstanding (its paid cash is an admin liability), so the held-item creation remains unchanged.

## Migration disclosure

Migration required: Yes, one nullable Decimal(12,2) `creditLimit` column and non-negative check on customers.

Backward compatible: Yes; no default limit and no data update. Existing customers remain NULL/unrestricted. New code requires the additive migration before business deployment.

Existing data impact: None. No backfill, balance rewrite, or business-database migration. Apply only to the isolated test database for verification.

Rollback strategy: Revert code while retaining the additive nullable column; removing configured limits later must be separately reviewed, not an automatic production DROP.

Backup required: Yes, standard verified business backup before separately authorized deployment.

Validation: tests first; under/equal/over/null/zero limits, ADMIN role/password/reason, derived allocation and historical FX, sales atomicity/replay, concurrent creation and audit rollback; full CI suite/typecheck/lint. The return migration safety issue was fixed without weakening the scanner; see SUMMARY.md for the final passing suite.
