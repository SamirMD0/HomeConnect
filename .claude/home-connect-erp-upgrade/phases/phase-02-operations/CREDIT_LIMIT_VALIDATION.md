# Final review correction — 2026-09-16

The authorized fix pass closed the configuration bypass: only ADMIN can set, raise, or clear creditLimit. An EMPLOYEE API request to clear a configured 100.00 limit returned 403 and the stored limit remained 100.00. Service regression tests cover non-admin configuration. Final CI: 308 files, 2,458 passing tests, zero skipped files/tests. The additive return migration now passes the unchanged safety scanner. See SUMMARY.md for current evidence.

The following is the chronological pre-fix validation record; its unresolved-policy and failing-suite statements are superseded by this correction.

# Prompt 11 — customer credit-limit verification

Date: 2026-09-14. Branch: `upgrade/phase-02-operations`. Owner approved a warning requiring audited ADMIN step-up override. Design and migration disclosure: [CREDIT_LIMIT_DESIGN.md](CREDIT_LIMIT_DESIGN.md).

## Implementation

Customers can be configured with a nullable base-USD credit limit in their existing form/API. Clearing the form sends NULL; zero permits no positive new credit. Existing customers have no assigned default and there is no backfill. Non-negative USD precision/range is validated and the database also rejects negative limits.

The direct debt route remains route → validator → controller → `DebtsService.createDebt`; that service now starts a serializable `runFinancialTransaction` when a caller does not supply one. Sales remainder creation, explicit sales-to-debt conversion and eligible automatic sales mutations already supply their transaction and pass explicit override fields to the same service. Existing sales financial-link guards are preserved.

`CreditLimitService.check` calls the existing customer-profile calculation with the caller transaction. `CustomerFinancialSummaryRepository` uses that transaction for all underlying customer/debt/installment/payment reads. The projection is:

```text
currentOutstanding = existing profile's derived lifetime USD outstanding
newBaseDebt = original new debt amount converted using its stored/effective FX snapshot
projectedOutstanding = currentOutstanding + newBaseDebt
overage = projectedOutstanding - creditLimit
```

Equality is permitted. No cached balance, customer-provided outstanding, current-price repricing, or frontend arithmetic is involved. NULL exits without a financial projection query. Serializable predicate reads/writes ensure concurrent credit requests re-evaluate on retry.

The actual projection code in [credit-limit.service.ts](../../../../backend/src/features/financial/credit-limits/credit-limit.service.ts) is:

```ts
const summary = await CustomerFinancialSummaryService.getCustomerFinancialSummary(
  customer.id, customerFinancialSummaryQuerySchema.parse({ includePayments: 'false' }), tx
);
const outstanding = parseMoney(summary.summary.totalOutstanding, Currency.USD);
const projected = outstanding.plus(newBaseDebt);
if (projected.lessThanOrEqualTo(customer.creditLimit)) return null;
```

An over-limit request returns 409 `CREDIT_LIMIT_EXCEEDED` with the authoritative current/limit/projected/overage amounts. Only an explicit ADMIN acknowledgment, reason and successful existing rate-limited password verification permits the write. The resulting `CREDIT_LIMIT_OVERRIDE` ActivityLog references the real customer/debt and records reason, amounts, actor and timestamp in the same transaction. Passwords are excluded from the audit and new sales replay fingerprints.

The reusable bilingual warning renders those exact server amounts. Debt creation, sale creation, scanner quick sale and sales debt/payment/item dialogs can resubmit an explicit ADMIN override. Employees see the warning and requirement for ADMIN approval but no override controls. The customer form labels the limit as USD and explains blank versus zero.

Override credentials/acknowledgment are cleared after successful debt creation and dialog closure, including external scanner closure or selecting a different scanned product. Override fields belong to the sale/debt action, not to immutable sale-line input.

## Verification

The guard tests were written before its implementation; their initial run failed because the new service did not yet exist. Subsequent unit, database and rendered-document tests cover NULL/under/equal/over/zero limits, non-void allocation-derived balances despite stale stored status, cancelled debts, existing installment outstanding, original USD/LBP sale remainder snapshots, ADMIN role/password/reason, source-linked cash not double-added, transactional override audit, sequential sale replay, concurrent debt serialization, and complete rollback on rejected sale or failed audit.

All ten new database integration tests passed in the isolated database after correcting two fixture-shape errors (required Arabic tax names and an allocation field not present in the schema). Those fixture errors are not claimed as pre-implementation business-rule failures.

The first full run also caught an existing SSR label fixture that lacked authentication context, newly required by the debt form's ADMIN controls. The test now uses the real AuthProvider while retaining every original label assertion; its focused rerun passed (2 files, 6 tests). Focused warning/sales-validator/component verification after the credential reset cleanup also passed (3 files, 28 tests).

`npm run typecheck`: PASS, frontend and backend, including the final credential reset changes. `npm run lint`: exit 0, 0 errors, 66 existing warnings; targeted lint after the final frontend cleanup also exited 0 with no output. Prisma client generation and schema validation passed. Whitespace checks passed. The additive migration `20260914160000_add_customer_credit_limits` was applied successfully only to `homeconnect_test_phase4_phase5_phase6`; 42 bundled migrations were present.

Final full command: `npm run test:ci`, with the isolated test DATABASE_URL, all CI database flags enabled and file parallelism disabled:

```text
Test Files  1 failed | 299 passed (300)
     Tests  1 failed | 2414 passed (2415)
  Duration  184.75s
Exit code: 1
Skipped tests: 0
```

The sole remaining failure is the inherited `sql-safety-scanner.test.ts` assertion accepting `20260911120000_add_atomic_sales_returns`: its existing DROP_CONSTRAINT is rejected. All new credit-limit tests pass; the new credit-limit migration is accepted by the scanner. No skip, scanner weakening, or applied-migration checksum edit was used.

## Remaining owner policy decision

Customer CRUD currently permits EMPLOYEE editing. The new field currently follows that existing access, which would permit raising/clearing a limit instead of obtaining an ADMIN override. The owner was asked whether limit configuration should be ADMIN-only (recommended). Approval of the debt override alone was not assumed to settle this separate configuration policy. Prompt 11 is NOT COMPLETE until this choice is confirmed and any required field-specific authorization is implemented/tested. Do not deploy the current configuration field.

## Read-only business evidence

`npx tsx backend/scripts/verify-counter-payment-readonly.ts`, using the privately loaded existing business URL and a single connection with `default_transaction_read_only=on`, returned:

```text
Database homeconnect; readOnly true
Phase 1 compatibility check: 105 customers; 0 mismatches
Reported outstanding 22114.00 USD = independent outstanding 22114.00 USD
Before/after Payments: 15 rows; 2803.13 USD
Before/after Payment checksum: 170fcbfc3ebdbcb8812fd098744d7d30
Historical Payments unchanged: true
Obligation/allocation evidence unchanged: true
```

This is the committed Phase 1 independent SQL plus existing receivables projections. The current Phase 2 integrity report remains blocked on the unmigrated business database because the separately blocked return migration is absent. No business credit limits were assigned; no business migration or historical row rewrite occurred. NULL semantics are verified in the additive DDL and new test fixtures, not fabricated as a query against a production column that does not yet exist.

## Deliberately unchanged

This task enforces the Prompt 11 debt creation/sales-to-debt paths. New installment-plan creation, existing-principal correction, and prepaid held-item/delivery conversion policies were not silently expanded. Existing installments still count in the derived current outstanding used for new debt checks. No customer permissions, return/void business logic, historical backfill, or balance source of truth changed.

No merge, main edit, business deployment or commit/push occurred. `main` remains `ac6ae9f555dd69d61ca79be527cc1a80513643d9`. The inherited return migration safety blocker is not bypassed; review it separately before business deployment, along with the existing backup/restore prerequisites.
