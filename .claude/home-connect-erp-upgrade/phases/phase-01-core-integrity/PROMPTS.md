# PHASE 1 — PROMPTS

Small, individually executable prompts for Claude Code or Codex. Run them **in order** — several depend on earlier ones.

**Branch:** `develop` (`main` remains untouched)

---

## Git safety — prepend to every prompt that CHANGES CODE

Investigative prompts that change nothing (01, 03, 06, 07, 09, 11, 13, 15) do not need this block.

```
Git safety:
- Confirm current branch is develop.
- Do not modify code on main.
- Check git status before editing.
- Preserve unrelated local changes.
- Commit completed coherent work to develop.
- Do not create a new branch unless explicitly instructed.
```

---

## Standing rules — prepend to every implementation prompt

```
STANDING RULES FOR THIS TASK

0. GIT SAFETY (see the block above) applies before anything else.

1. INSPECT FIRST. Read the existing implementation before changing anything.
   Report what you found before proposing a change.
2. DO NOT REWRITE WORKING CODE. This codebase's financial and inventory cores
   are correct: balances are DERIVED and never stored; stock uses compare-and-set
   with a 409 on conflict; money is Decimal(12,2) everywhere. Preserve all three.
   If you believe one is wrong, STOP and explain rather than change it.
3. TRACE THE WHOLE TRANSACTION. For any change touching money or stock, trace
   the full path: route → validate → controller → service → runFinancialTransaction
   → repository → database. State where your change sits.
4. LIST YOUR ASSUMPTIONS explicitly before writing code.
5. PRESERVE BACKWARD COMPATIBILITY unless there is a stated reason not to.
   Existing API clients and existing data must keep working.
6. SMALLEST COHERENT CHANGE. No opportunistic refactoring, renaming, or
   reformatting of untouched code.
7. ADD OR UPDATE TESTS. Any money or stock change needs a test that fails
   before your change and passes after.
8. RUN VALIDATION: npm run typecheck && npm run lint && npm test.
   Report the actual output. Never claim a pass you did not observe.
9. REVIEW DATABASE INTEGRITY. For a schema change, state: is it additive? does
   it need a backfill? is it reversible? does it hold under concurrency?
10. STOP AND ASK if a business rule is ambiguous. Do not invent financial
    behaviour. Ambiguity here means real money is wrong.
11. FOR ANY SCHEMA CHANGE, state in your summary:
      Migration required:    Yes/No
      Backward compatible:   Yes/No
      Existing data impact:
      Rollback strategy:
      Backup required:       Yes/No
      Validation check:
    NEVER run prisma migrate reset, db push --force-reset, or any destructive
    shortcut against a database holding real data.
```

---

## Prompt 01 — Establish and record the baseline

```
Do not change any code.

Run and report the exact output of:
  npm run typecheck
  npm run lint
  npm test

Then report:
  - total test files and tests, passed vs skipped
  - the exact names of every skipped test file
  - the env var each skipped file checks to decide whether to run

Also report:
  - the current branch (git branch --show-current)
  - the current commit hash
  - git status (should be clean)
  - whether the three stale branches (develop, feature/phase-1-foundation,
    feature/phase-2-auth) still exist

Write the results to
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/BASELINE.md
with today's date, the branch, and the commit hash.

This is the control for all Phase 1 work. Do not fix anything you find —
report it.

Note: this prompt is investigative and may run read-only on `main`. Every prompt
that changes code must run on `develop`.
```

---

## Prompt 02 — Add CI running the database tests

```
[STANDING RULES]

Goal: every commit runs typecheck, lint, and the FULL test suite including the
database integration tests that are currently skipped.

Step 1 — Inspect. Find every test file gated behind a RUN_*_DB_TESTS env var.
List each file and its flag. Report how each decides to skip (the
describeDatabase pattern). Confirm there is no existing CI config anywhere.

Step 2 — Add a "test:ci" script to package.json that sets all EIGHT flags to 1
and runs vitest. Use cross-env or equivalent — this repo targets Windows, where
a bare VAR=x prefix does not work in PowerShell.

The eight flags:
  RUN_FINANCIAL_DB_TESTS, RUN_INVENTORY_DB_TESTS, RUN_SALES_FULFILLMENT_DB_TESTS,
  RUN_SUPPLIER_PURCHASE_DB_TESTS, RUN_SUPPLIER_RECEIVING_DB_TESTS,
  RUN_PHASE4_DEBT_DB_TESTS, RUN_PHASE5_INSTALLMENT_DB_TESTS,
  RUN_PHASE6_CUSTOMER_SUMMARY_DB_TESTS

Do NOT remove the flags from the test files: they let a developer without a
database run the fast suite, which is deliberate.

Step 2b — THE NON-OBVIOUS PART. Three suites also assert on the DATABASE NAME:
    const isIsolatedPhase4Database = databaseName.includes('phase4');
(and the same for phase5 and phase6). Setting the flag alone leaves these three
files skipped.

That guard exists to stop a destructive suite ever pointing at a real database —
sound reasoning, do not simply delete it. Either provision CI databases whose
names satisfy the guards, or relax the guards to something CI can satisfy while
keeping the protection. Tell me which you chose and why before implementing it.

Step 3 — Add .github/workflows/ci.yml:
  - triggers: push and pull_request
  - a postgres:16 service container
  - npm ci
  - npx prisma migrate deploy against the service database
  - npm run typecheck
  - npm run lint
  - npm run test:ci

Step 4 — VERIFY THE PIPELINE ACTUALLY FAILS. Temporarily break one assertion in
a DB integration test, confirm test:ci goes red locally, then revert. Report the
failure output you observed. A pipeline never seen to fail is not a pipeline.

Step 5 — Run npm run test:ci locally against a real database and report the
full output. If any previously-skipped test now FAILS, do not fix it — report
each failure with its file, test name, and error. Those failures are findings,
and they are the reason this task is first.

Acceptance: test:ci runs all 266 files with 0 skipped; CI is red on a broken
test and green when reverted.
```

---

## Prompt 03 — Trace and document the JWT secret path

```
Do not change any code. This is investigation only.

Trace exactly how JWT_SECRET reaches the running application:
  1. Every file reading process.env.JWT_SECRET, with line numbers.
  2. What happens when it is unset (quote the fallback).
  3. How production.env is created and whether a secret is generated
     (check scripts/Setup-HomeConnect.ps1).
  4. How the Electron main process passes env to the backend
     (desktop/src/backend-process.ts).
  5. Whether preflight.checks.ts's REQUIRED_VARS check BLOCKS startup or is
     only reported through an admin endpoint. Quote the evidence.
  6. Whether desktop/src/startup-failure-messages.ts already has a matcher
     for a missing secret.

Then answer precisely:
  - If production.env exists but has no JWT_SECRET line, does the app start?
  - If it starts, what secret does it use?
  - Who could exploit that, given the server binds 127.0.0.1?

Write the trace to
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/JWT_TRACE.md.
```

---

## Prompt 04 — Fail startup on a missing JWT secret

```
[STANDING RULES]

Prerequisite: read JWT_TRACE.md from Prompt 03.

Goal: the app must refuse to start rather than silently use the hardcoded
fallback secret.

BEFORE YOU START — confirm with me that the installed production.env on the
business PC contains a JWT_SECRET line. If it does not, this change will stop
the business from starting the app. Do not proceed without that confirmation.

Step 1 — Create backend/src/lib/env.ts exporting requireEnv(name: string): string
that throws a clear, actionable error naming the variable and pointing at
Setup-HomeConnect.ps1.

Step 2 — Replace the fallback in auth.middleware.ts and auth.service.ts.
Handle JWT_REFRESH_SECRET, which currently falls back to JWT_SECRET — decide
and state whether that fallback stays (it is defensible; the hardcoded string
is not).

Step 3 — Confirm the failure surfaces legibly in the Electron startup monitor
via startup-failure-messages.ts. Add a matcher if one is missing.

Step 4 — Tests: missing var throws with the actionable message; present var
boots normally; existing auth tests still pass (they may need the var set in
test setup — set it in the test config, do not reintroduce a fallback).

Report the full output of npm test.
```

---

## Prompt 05 — Re-check user status in requireAuth

```
[STANDING RULES]

Goal: deactivating or deleting a user ends their session. Today requireAuth
verifies only the JWT signature and never re-checks isActive or deletedAt.

Step 1 — Inspect. Read backend/src/middleware/auth.middleware.ts and the
refresh path in auth.service.ts. Report exactly what is validated today.

Step 2 — Add a user-status lookup in requireAuth rejecting inactive or deleted
users with 401. Use a short-TTL in-memory cache (30-60s) so this is not a
database query on every request. State your cache invalidation approach.

Step 3 — Apply the same check to the refresh path. A revoked user must not be
able to mint a new access token.

Step 4 — Tests: deactivated user with a valid token gets 401; deleted user gets
401; active user unaffected; refresh rejected for a revoked user; the cache
expires as designed.

Step 5 — CAREFULLY consider self-lockout: can an admin deactivate themselves
and lose the ability to fix it? Report your finding. If yes, either prevent
self-deactivation or document the recovery path.

Report the full output of npm test.
```

---

## Prompt 06 — Trace the supplier purchase transaction

```
Do not change any code. Investigation only.

Trace what happens when a user posts a supplier purchase, from the frontend form
to the database. Cover:
  1. The frontend form and its submit handler — what protects against
     double-submit today?
  2. The route, validators, and role checks.
  3. The service: what runs inside runFinancialTransaction and what runs
     outside it?
  4. Every row written and in what order (SupplierTransaction,
     SupplierPurchaseLine, SupplierReceiving, SupplierReceivingItem,
     StockMovement, audits).
  5. Where stock is changed and how compare-and-set is applied.
  6. What happens if the same request arrives twice.

Then answer: if the user's network drops after the request is sent but before
the response arrives, and they click submit again, what ends up in the
database? Be specific about duplicate payables and duplicate stock.

Write to
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/PURCHASE_TRACE.md.
```

---

## Prompt 07 — Review the existing payment idempotency implementation

```
Do not change any code. Investigation only.

Study how payment idempotency works so it can be reused exactly:
  1. backend/src/features/financial/infrastructure/idempotency.ts — every
     exported function and its purpose.
  2. The Payment.idempotencyKey unique constraint in the schema.
  3. How debts.service.ts uses findPaymentByIdempotencyKey and what it returns
     on replay.
  4. What createIdempotencyFingerprint hashes, and what happens on a key match
     with a DIFFERENT fingerprint.
  5. Where the frontend generates the key, and whether it is generated once per
     form or once per submit. Quote the code.
  6. The existing tests in idempotency-transaction.test.ts.

Then state the minimum set of changes needed to apply this same pattern to
SupplierTransaction and SupplierReceiving.

Write to
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/IDEMPOTENCY_PATTERN.md.
```

---

## Prompt 08 — Add idempotency to supplier purchases and receivings

```
[STANDING RULES]

Prerequisites: read PURCHASE_TRACE.md and IDEMPOTENCY_PATTERN.md.

Goal: a retried submission cannot create a duplicate payable or duplicate stock.

Reuse the payment pattern exactly. Do not invent a second mechanism.

Step 1 — Migration adding a nullable, unique idempotencyKey to
supplier_transactions and supplier_receivings. Additive only, no backfill.
State explicitly whether it is reversible.

Step 2 — Backend: normalize the key, look up an existing record inside the
transaction, compare fingerprints, return the existing record on an exact
replay, and raise a conflict on a fingerprint mismatch. Mirror the payment
service's structure.

Step 3 — Frontend: generate the key ONCE PER FORM INSTANCE (on mount) and reuse
it across retries. Do NOT generate it on submit — that defeats the entire
purpose and is the single most likely error in this task. Show me the code that
does this and explain when the key is regenerated.

Step 4 — Tests (add to the DB integration suites so CI runs them):
  - same key twice → exactly one payable, one stock increase
  - same key, different payload → conflict error
  - no key → still works (backward compatible)
  - two concurrent identical submissions → exactly one succeeds
  - a replay returns the ORIGINAL record, not a new one

Step 5 — Rehearse the migration with npm run rehearse:migrations and report the
output.

Report the full output of npm run test:ci.

Do NOT add a unique constraint on (supplierId, receiptNumber). The schema
comment at schema.prisma:1202-1205 explains why that was deliberately rejected —
read it before considering it.
```

---

## Prompt 09 — Review supplier balance update logic

```
Do not change any code. Investigation only.

Verify that supplier balances cannot drift.

  1. Read suppliers.repository.ts balances() and state exactly how a balance
     is computed.
  2. Confirm no supplier balance is stored on any table. Search for a balance
     column and report what you find.
  3. List every code path creating, modifying, removing, or restoring a
     SupplierTransaction.
  4. For each, confirm it is inside a transaction and cannot leave a partial
     state.
  5. Check that removed (status=REMOVED) transactions are excluded from the
     balance, and that restoring re-includes them.
  6. Check how an amountOverride interacts with the sum of purchase lines —
     which one drives the balance?
  7. Check what a voided receiving does to the linked supplier transaction.

Report anything that could make a supplier balance disagree with its
transactions. If you find nothing, say so plainly — a clean result is a
finding.

Write to
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/SUPPLIER_BALANCE_REVIEW.md.
```

---

## Prompt 10 — Add financial integrity reconciliation reports

```
[STANDING RULES]

Prerequisite: read SUPPLIER_BALANCE_REVIEW.md.

Goal: two reports that PROVE balances match their transactions, mirroring the
existing inventory reconciliation.

Step 1 — Study the existing inventory reconciliation report
(features/reports/rows, slice "inventory/reconciliation") and follow its
structure exactly.

Step 2 — Add a customer financial integrity report. For each customer compare
the reported outstanding against an INDEPENDENTLY computed
  Σ(non-cancelled obligations) − Σ(non-voided allocations)
and flag any mismatch. Compute it independently — do not call the same function
the screens use, or the report can only ever agree with itself.

Step 3 — Add the supplier equivalent.

Step 4 — Surface both in the reports registry and in Settings → Maintenance
beside inventory reconciliation. Both must be ADMIN-only, consistent with every
other report.

Step 5 — Tests: both report clean on correct fixtures, AND both DETECT a
deliberately corrupted fixture. A reconciliation report that cannot fail is
decoration — the detection test is the important one.

Step 6 — Run both against real data and report the result.
```

---

## Prompt 11 — Trace the product cost price lifecycle

```
Do not change any code. Investigation only.

Answer: where does Product.costPrice come from, and when does it change?

  1. Every write site for costPrice. Quote each.
  2. Whether posting a supplier purchase updates it (read
     supplier-purchases.service.ts and report plainly yes or no).
  3. What SupplierPurchaseLine.unitPrice records and how it differs from
     costPrice.
  4. Everywhere costPrice is READ — especially the pricing calculator.
  5. What happens to a selling price when costPrice changes on a product using
     a pricing preset.

Then answer: if a supplier raises a price by 20% and the shop receives stock at
the new price, what does Home Connect charge the customer, and how would anyone
notice the discrepancy?

Write to
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/COST_PRICE_TRACE.md.
```

---

## Prompt 12 — Update cost price from supplier receipts

```
[STANDING RULES]

Prerequisite: read COST_PRICE_TRACE.md.

Goal: Product.costPrice reflects what was actually last paid.

BUSINESS RULES TO CONFIRM WITH ME BEFORE CODING — do not guess:
  a) Should voiding a receiving revert costPrice? (My assumption: NO — the
     goods were genuinely purchased at that price.)
  b) Should a MANUAL purchase line ever affect cost? (My assumption: NO,
     by definition.)
  c) If one purchase has two lines for the same product at different prices,
     which cost wins?
Stop and ask. Do not invent an answer.

Step 1 — Inside the existing purchase transaction (same runFinancialTransaction,
not a separate one), update costPrice for each PRODUCT line.

Step 2 — Write a ServiceAudit entry per change recording old → new value, with
a reason naming the purchase.

Step 3 — Add a "cost changes" report listing products whose cost changed in a
period, with old, new, and percentage change.

Step 4 — Tests:
  - posting a purchase updates cost and writes an audit entry
  - MANUAL lines never touch cost
  - voiding a receiving behaves per the confirmed rule (a)
  - a multi-line purchase updates each product exactly once
  - the cost update is inside the transaction: if the purchase fails, cost is
    unchanged

Step 5 — Report which products' selling prices would change as a result, since
preset-priced products recompute from cost. THIS IS A BUSINESS-VISIBLE CHANGE —
list the affected products so the owner can be told.
```

---

## Prompt 13 — Verify the legacy transaction tables are empty

```
Do not change any code. This is a data question, and the answer decides whether
the next task can run at all.

  1. Confirm the Transaction model and ActivityLog model in schema.prisma.
  2. Confirm the routes mounted at /api/v1/transactions in app.ts.
  3. Search the ENTIRE frontend for any reference to /transactions or a
     transactions API. Report exactly what you find.
  4. Query the production database: SELECT COUNT(*) FROM transactions; and
     SELECT COUNT(*) FROM activity_logs;
  5. If either is non-empty, report the row count, the date range, and a sample
     of rows. DO NOT DELETE ANYTHING.
  6. Report every remaining backend file importing the transactions module.

Then state clearly: is it safe to remove this module and drop these tables?

Write to
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/LEGACY_TRANSACTIONS_AUDIT.md.
```

---

## Prompt 14 — Remove the legacy transaction system

```
[STANDING RULES]

Prerequisite: read LEGACY_TRANSACTIONS_AUDIT.md.

HARD GATE: proceed ONLY if both tables are confirmed empty. If either has rows,
STOP and report — that is a business data question, not a code change.

Also confirm a verified backup exists before dropping tables. Dropping a table
is irreversible.

Step 1 — Remove the route mount from app.ts.
Step 2 — Delete the transactions routes, controller, service, repository,
validator, and types files.
Step 3 — Remove the Transaction and ActivityLog models from schema.prisma and
the corresponding relation fields on User and Customer.
Step 4 — Generate a migration dropping both tables. State explicitly that this
is irreversible.
Step 5 — Run npm run typecheck to prove no dead imports remain.
Step 6 — Run npm run test:ci and report the full output.
Step 7 — Confirm /api/v1/transactions now returns 404.

If typecheck reveals an unexpected dependency on these models, STOP and report
rather than working around it.
```

---

## Prompt 16 - Design the dual currency data model

```
Do not write implementation code yet. Design only.

Read .claude/home-connect-erp-upgrade/CURRENCY_AND_VAT_DECISION.md Part A and
ARCHITECTURE_DECISIONS.md ADR-19 first. Those decisions are APPROVED - do not
re-litigate them. Your job is to turn them into a concrete schema.

Step 1 - Inspect. List EVERY money column in schema.prisma with its table.
Report the count. For each, state whether it needs a currency, inherits one
from its parent document, or is a derived/base amount.

Step 2 - Confirm the critical property. Read
backend/src/features/financial/domain/balances.ts and state precisely why
keeping PaymentAllocation.amount in the OBLIGATION's currency means
calculateDebtBalance does not change. Quote the function. If you believe it
DOES need to change, STOP and explain - that would contradict ADR-19 and I
need to know before any code is written.

Step 3 - Produce the schema design:
  - the ExchangeRate table
  - every column added to every table, with types
  - which entities carry currency+rate+baseAmount vs which inherit
  - the migration and its backfill (all existing rows -> USD, rate 1)

Step 4 - Rounding. Specify exactly how money.ts becomes currency-aware.
USD 2 dp, LBP 0 dp, both ROUND_HALF_UP. Show the function signatures.

Step 5 - ASK ME: should LBP round further, to the nearest 1,000, matching how
prices are actually quoted in the shop? Do not assume.

Step 6 - State the precision consequence. money.ts caps at 9999999999.99,
about $111k at LBP rates. Confirm that all aggregation must therefore use
baseAmount (USD) and say where in the codebase that rule must be enforced.

Write to phases/phase-01-core-integrity/CURRENCY_DESIGN.md and STOP for my
approval before implementing.
```

---

## Prompt 17 - Implement the dual currency foundation

```
[GIT SAFETY] [STANDING RULES]

Prerequisite: CURRENCY_DESIGN.md, approved by me.

This is the largest schema change in the plan. Work in small commits.

Step 1 - Migration: ExchangeRate table plus the currency/rate/baseAmount
columns. Additive only. Backfill every existing row to USD at rate 1,
baseAmount = amount. NO existing amount may be modified.

Step 2 - Make money.ts currency-aware. Keep every existing guarantee: still
reject >2 decimals, still require explicit rounding modes, still cap at
MAX_SCHEMA_MONEY. ADD: reject non-zero decimals on LBP.

Step 3 - PaymentAllocation gains paymentAmount + exchangeRate. amount STAYS
in the obligation's currency.

CRITICAL: after this step, run the existing financial domain tests. If
balances.ts needed ANY change, STOP and tell me - ADR-19 says it should not,
and if that is wrong the whole design needs revisiting.

Step 4 - Admin-only, audited exchange rate entry screen.

Step 5 - Tests (in the DB integration suites so CI runs them):
  INV-16 rounding is deterministic per currency
  INV-17 adding a new rate does NOT change any historical transaction
  INV-18 a 1000 USD debt paid 4,500,000 LBP at 90000 leaves exactly 950.00 USD
  INV-19 allocations sum exactly to the payment in the payment's own currency
  INV-25 aggregation uses baseAmount and cannot overflow

Step 6 - Rehearse the migration against a RESTORED COPY of production
(npm run rehearse:migrations). Report every duration.

Step 7 - Run all three integrity reports before and after the migration.
Report both. ANY change in a customer or supplier balance is a blocker -
the backfill must be value-neutral.
```

---

## Prompt 18 - Design the VAT model

```
Do not write implementation code yet. Design only.

Read CURRENCY_AND_VAT_DECISION.md Part B and ADR-20 first. These are APPROVED:
  - TaxRate + TaxProfile configuration, NOT a vat=11 field
  - VAT calculated PER LINE, rounded per line, document VAT = exact sum
  - taxRateSnapshot + vatAmount stored on each finalized line
  - inclusive pricing derives VAT BY SUBTRACTION
Do not re-litigate them.

Step 1 - Produce the schema: TaxRate, TaxProfile, Product.taxProfileId,
Product.priceIncludesVat, and the five snapshot columns on SalesOrderItem and
SupplierPurchaseLine.

Step 2 - Specify domain/vat.ts precisely. Show the exclusive and inclusive
formulas and the exact rounding points. Prove with a worked example that
inclusive pricing gives priceEx + vat == the quoted price EXACTLY.

Step 3 - Work a mixed invoice by hand: 3 lines, one standard 11%, one
zero-rated, one exempt, in LBP. Show every intermediate value and prove the
document VAT equals the sum of the rounded line amounts.

Step 4 - ASK ME:
  a) Should products default to VAT-inclusive pricing? (Lebanese retail
     usually quotes inclusive, but confirm.)
  b) Are there real exempt product categories in this shop, or only standard
     and zero-rated?

Step 5 - State how a return reverses VAT, and why it must read the line
snapshot rather than the current rate.

Write to phases/phase-01-core-integrity/VAT_DESIGN.md and STOP for approval.
```

---

## Prompt 19 - Implement the VAT foundation

```
[GIT SAFETY] [STANDING RULES]

Prerequisite: VAT_DESIGN.md, approved by me.

Step 1 - Migration: TaxRate, TaxProfile, Product.taxProfileId,
Product.priceIncludesVat, and the snapshot columns on the two line tables.

CRITICAL BACKFILL RULE: existing invoice lines get taxRateSnapshot = 0 and
vatAmount = 0. They were GENUINELY SOLD WITHOUT VAT. Backfilling 11% would
falsify history and misstate the first VAT return. Do not do it.

Step 2 - Seed LB_STANDARD at 11.000, plus a zero-rated and an exempt rate.
The 11 must live in seed data, NOT in any business logic. Grep your own diff
for a literal 11 outside the seed and report what you find.

Step 3 - Implement domain/vat.ts as a PURE module with no Prisma import,
matching the existing domain/ convention.

Step 4 - Wire it into sales order and supplier purchase line finalization.
Snapshot the rate, code, ex-VAT price, VAT amount and inclusive total. Compute
once, never recompute.

Step 5 - Tests:
  INV-20 change a TaxRate, assert every historical line is byte-identical
  INV-21 document VAT == exact sum of rounded line VAT; totals never
         independently rounded
  INV-24 inclusive: priceEx + vat == quoted price, exactly, across many values
  plus: mixed taxable/zero-rated/exempt invoice
  plus: a product with no taxProfileId uses the DEFAULT profile, not exempt

Step 6 - Confirm every historical invoice total is unchanged to the cent.
Report the before/after comparison.
```

---

## Prompt 20 — Phase 1 review

```
Do not change any code. Review only.

Review all Phase 1 work against
.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/REVIEW.md.

For each section — business correctness, database, backend, frontend, security,
testing — go through the checklist and give a verdict with evidence.

Then:
  1. Run npm run test:ci and report the full output.
  2. Run the inventory reconciliation report and both new financial integrity
     reports against real data. Report the results.
  3. Compare against BASELINE.md from Prompt 01. What changed?
  4. Confirm every Phase 1 acceptance criterion in PLAN.md is met, citing
     evidence per task.
  5. Review Phase 1's commit history on develop from its recorded baseline.
     Confirm commits are coherent and separate, and that no commit bundles an
     unrelated refactor with a financial or inventory change.
  6. Confirm nothing was committed directly to main: git log main --oneline
     should be unchanged from BASELINE.md.

Classify the phase as COMPLETE, COMPLETE WITH FOLLOW-UP, or NOT COMPLETE,
and justify it. Apply the NOT COMPLETE conditions in REVIEW.md
literally — in particular, a test:ci run reporting ANY skipped test files is a
NOT COMPLETE.

List any follow-up work explicitly, each with an owner and a target phase.
```

---

## Prompt 21 — Record and push the Phase 1 checkpoint

```
Do not change any code.

Prerequisite: Prompt 20 returned COMPLETE or COMPLETE WITH FOLLOW-UP.
If it returned NOT COMPLETE, stop and tell me what must be fixed first.

Step 1 — Confirm current branch is develop and push it:
    git push origin develop

Step 2 — Update SUMMARY.md from the actual Phase 1 evidence:
  - purpose, major changes, known limitations
  - database/schema changes: the idempotency columns (T7) and the dropped
    legacy tables (T9), each with its full migration disclosure block
  - migration impact, including that T9 is NOT reversible by a down-migration
    and its rollback is a backup restore
  - business rules changed — CALL OUT that T8 changes selling prices for
    preset-priced products, and confirm the owner was told before acceptance
  - tests executed: the FULL npm run test:ci output including passed, failed
    and skipped counts
  - CI result: link to the run
  - manual testing: the restore rehearsal (T3) with its measured duration, the
    inventory baseline (T4), the off-machine backup verification (T2)
  - backup/restore implications
  - unresolved risks, cross-referenced to RISK_REGISTER.md

Step 3 — Show me the summary checkpoint for review.

Step 4 — Do not open or merge a pull request to main. Record the develop CI
link and final verdict in SUMMARY.md before Phase 2 begins.

Do not merge into main. Continue only according to the checkpoint verdict.
```
