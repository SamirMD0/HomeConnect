# Claude review prompt — HomeConnect Inventory v1.9.0

Paste the text below into Claude while its working directory is the HomeConnect repository.

```text
BEGIN V1.9.0 INVENTORY IMPLEMENTATION REVIEW.

You are reviewing the uncommitted HomeConnect v1.9.0 document-linked sales inventory work in a
Windows Electron + Express + Prisma + PostgreSQL + React repository.

This is a REVIEW-ONLY checkpoint. Do not edit files, generate migrations, run database writes,
stage, commit, bump versions, build an installer, push, or touch the business PC. Do not apply
repairs. Read-only repository inspection and read-only validation commands are allowed. If you
believe a fix is necessary, describe the exact fix but do not implement it.

Read these documents completely first:

1. claude/plans/inventory-v1.9.0-document-linked-movements-plan.md
2. claude/plans/inventory-v1.9.0-implementation-summary.md
3. claude/prompts/codex-inventory-v1.9.0-build.md
4. docs/phases/Versions/phase-1-9-0/RELEASE_NOTES_V1_9_0.md

Then inspect the complete tracked and untracked v1.9.0 implementation diff. Do not limit the
review to filenames mentioned in the summary. Preserve and ignore unrelated untracked planning
files and stash@{0}.

The intended release contract is:

- v1.9.0 covers sales-order stock deduction and restoration only.
- Supplier receiving is wholly deferred to v1.9.1.
- No stock movement occurs automatically on order creation, status, delivery, payment, debt,
  cancellation, or return.
- Deduction is explicit, ADMIN or EMPLOYEE, and password-free.
- Restoration is explicit, ADMIN-only, password-free, and requires a typed reason.
- Product, quantity, order-line reference, and deduction reason come from server-owned data.
- Fulfillment is whole-line and multi-line requests are atomic.
- Orders predating the verified opening count cannot be deducted.
- Repeated lines for one product must chain balances safely.
- Exactly one ACTIVE fulfillment per order line is enforced in PostgreSQL.
- Active fulfillment blocks line edit/removal and order cancellation/return until restoration.
- Manual inventory permissions and password rules remain unchanged.
- Customer debts, payments, installments, order settlement fields, supplier transactions,
  supplier balances, and financial dashboard figures must not change through new inventory paths.
- No valuation, COGS, FIFO, weighted average, margin, or profit behavior is allowed.
- Report SQL is read-only and the migration is additive with no backfill.
- Existing business rows and product quantities must remain unchanged during migration.

Review these areas carefully:

1. Schema and migration integrity
   - Prisma relations and nullability match the SQL.
   - Three CHECK constraints and all seven RESTRICT foreign keys are coherent.
   - Partial unique ACTIVE-line index truly prevents concurrent double deduction.
   - Enum additions are safe and migration ordering is valid for PostgreSQL.
   - No destructive SQL, backfill, supplier-receiving schema, or protected-table mutation exists.

2. Backend correctness and concurrency
   - Validators reject duplicates, empty selections, blank restoration reasons, and oversized
     requests without accepting forged authority fields.
   - Route permissions and service-level permissions fail closed.
   - All validation occurs before the first write for multi-line deduction/restoration.
   - Stable lock order and same-product running balances are correct.
   - Compare-and-set failures and partial-index P2002 collisions map to appropriate client errors.
   - Transactions cannot leave stock, movements, fulfillments, or audit rows partially updated.
   - Restoration handles multiple selected fulfillments, repeated products, overflow, concurrent
     retries, foreign IDs, and already-reversed rows safely.
   - Order edit/remove/cancel/return guards have the intended precedence.

3. Opening-count and date correctness
   - @db.Date order dates and timestamp opening-count dates are compared in the business timezone.
   - The Beirut midnight-boundary test exercises the unsafe off-by-one direction.
   - Historical orders cannot be double-counted after onboarding.

4. API and serialization
   - The backend, frontend types, and response shape agree for all nine inventory states.
   - Active fulfillment IDs exposed to the browser cannot authorize a different order's restore.
   - Query parsing for awaitingStockDeduction is strict and pagination/count behavior is correct.

5. Frontend behavior
   - The client renders server states and does not re-derive eligibility.
   - Eligible deduction lines and individual active restorations can be selected correctly.
   - EMPLOYEE can deduct but cannot see/use restore.
   - No account-password field is sent by either new action.
   - Deducted lines cannot be edited or removed through the visible controls.
   - Errors remain visible and bilingual labels accurately explain each state.
   - Query invalidation refreshes orders, inventory, products, and dashboard without stale state.

6. Dashboard and movement history
   - “Orders awaiting stock deduction” exactly matches non-draft/non-terminal orders with at least
     one AVAILABLE line, including opening-date, stock, tracking, and active-fulfillment rules.
   - The dashboard count and filtered list cannot disagree.
   - Movement links resolve through authoritative fulfillment relations in both directions.
   - No financial or valuation arithmetic was introduced.

7. Tests and operational safety
   - Identify important contract cases claimed by the plan but absent or weakly asserted in tests.
   - Verify report-only SQL cannot write.
   - Evaluate the restored-backup evidence in the implementation summary.
   - Confirm the local missing-table incident was ordering-related and is resolved by applying
     migrations before application startup; flag any packaging/startup path that could violate
     that ordering on the business PC.

8. Scope and release readiness
   - Root version must remain 1.8.1 during this review.
   - Mobile Scanner must remain 1.0.0.
   - No v1.9.1 supplier receiving, WhatsApp, Financial Truth Foundation, scanner expansion,
     installer, or unrelated cleanup belongs in this diff.
   - Review documentation for stale checkpoint status or contradictions as well as code defects.

You may run the smallest useful read-only verification set, such as typechecks, targeted tests,
lint, npm test, Prisma validate with a harmless validation URL, git diff --check, and SQL source
scans. Do not connect to or modify the business PC. Do not mutate the retained rehearsal database.

Report findings first, ordered by severity:

- BLOCKER: corrupts data, violates financial boundaries, unsafe migration, or makes release
  unusable.
- HIGH: incorrect stock behavior, authorization failure, concurrency/idempotency defect, or
  business-PC deployment risk.
- MEDIUM: meaningful workflow/API/test/documentation defect.
- LOW: minor maintainability, copy, or coverage concern.

For every finding provide:

- severity and concise title;
- exact file and line reference;
- evidence and a concrete failure scenario;
- which release contract is violated;
- recommended correction;
- whether it blocks version bump/package/commit.

Do not invent findings merely to fill categories. Distinguish confirmed defects from questions or
residual risks.

Finish with:

1. Findings summary by severity
2. Validation commands run and results
3. Schema/migration verdict
4. Backend transaction/concurrency verdict
5. Frontend/API verdict
6. Financial and supplier-ledger isolation verdict
7. Restored-backup rehearsal verdict
8. Scope-contamination verdict
9. Documentation-consistency verdict
10. Explicit decision: ACCEPT CP-1908 or REJECT CP-1908
11. Explicit decision: safe or not safe to authorize the v1.9.0 bump/package/commit

Stop after the report. Do not fix anything.

END V1.9.0 INVENTORY IMPLEMENTATION REVIEW.
```
