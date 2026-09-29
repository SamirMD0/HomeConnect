# PHASE 4 — PROMPTS

Prepend the **Standing Rules** from `phases/phase-01-core-integrity/PROMPTS.md` to every implementation prompt.

**Phase 4 rule, in addition:** no new features. If you find a gap, record it in `PHASE_5_BACKLOG.md` and continue.

**Branch:** `develop` — continue only after an acceptable Phase 3 checkpoint.

---

## Git safety — prepend to every prompt that CHANGES CODE

Prompts 04 (migration rehearsal), 08 (UAT) and 09 (review) are investigative or facilitative and do not need this block — though 04 must still confirm it is operating on a **scratch** database, never production.

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

## Prompt 01 — Set up Playwright and the first journey

```
[STANDING RULES]

Goal: end-to-end proof that critical journeys work through the real UI.

Step 1 — Inspect. Confirm no E2E framework exists. Report how the app is
started for development (npm run dev), what ports are used, and how the
database is seeded (backend/prisma/seed.ts).

Step 2 — Add Playwright with a config that:
  - starts the backend and frontend
  - uses a THROWAWAY database, never the developer's real one
  - seeds known fixtures before each run
  Show me how you guarantee the real database cannot be touched. This is the
  most important safety property of the whole E2E setup.

Step 3 — Implement journey 1 only:
  login → create customer → create sales order → deduct stock → record payment
  → verify the customer balance is correct

Assert on real outcomes, not just that pages rendered: the stock quantity
actually decreased, the balance actually equals the expected value.

Step 4 — Run it ten times. Report how many passed. If it is not 10/10, fix the
flakiness before adding another journey. A flaky suite gets ignored, and an
ignored suite is worse than none.

Step 5 — Report the total runtime. If journey 1 alone exceeds 2 minutes, tell
me before proceeding.
```

---

## Prompt 02 — Add the remaining E2E journeys

```
[STANDING RULES]

Prerequisite: Prompt 01 complete and journey 1 passing 10/10.

Add these four journeys, one at a time, verifying 10/10 stability before moving
to the next:

  2. Receive stock from a supplier → verify quantity and payable increased →
     void the receiving → verify BOTH stock and payable reversed
  3. Create an installment plan → pay two installments → verify the schedule,
     the balance, and the overdue state of a third
  4. Print a sales invoice and a payment receipt; assert the document contains
     the correct totals (Phase 2)
  5. Run the profit report over a known set of seeded orders and assert the
     margin equals a hand-computed value (Phase 3)

Rules:
  - assert on data outcomes, not just UI presence
  - no journey may depend on another's leftover state
  - if a journey cannot be made reliable in reasonable time, DELETE IT and tell
    me. Do not commit a flaky test.

Then add the E2E suite to CI as a separate job from unit tests, so a flake does
not block the fast feedback loop.

Report: the number of journeys, the pass rate over 10 consecutive runs, and the
total CI runtime.
```

---

## Prompt 03 — Concurrency and failure tests

```
[STANDING RULES]

Goal: PROVE the concurrency guarantees rather than assuming them.

These must be genuinely concurrent — two real database transactions running at
once. A test that simulates concurrency by calling functions in sequence proves
nothing. Show me how you achieve real concurrency.

Add to the DB integration suites:

  1. INV-04: two simultaneous stock deductions of the same product. Assert
     exactly one succeeds, one fails with a 409, and the final quantity
     reflects exactly one deduction.
  2. Two simultaneous payments against the same debt. Assert both are recorded
     and the balance is correct (this SHOULD work — allocations are additive).
  3. INV-05: a transaction failing mid-operation. Assert no orphan movement, no
     orphan allocation, no changed quantity, no partial order.
  4. Concurrent receiving and sale of the same product. Assert the final
     quantity is correct regardless of ordering.
  5. INV-07/INV-08: two concurrent identical idempotent requests. Assert
     exactly one record is created.
  6. Database connection loss mid-transaction. Assert no partial state.

For each, state what invariant it proves and which risk in RISK_REGISTER.md it
closes.

IMPORTANT: if any test FAILS, that is a real bug in production code, not a
broken test. Report it and STOP. Do not adjust the test to pass.
```

---

## Prompt 04 — Rehearse all migrations against restored production data

```
Do not change production. This is a rehearsal on a scratch database.

Step 1 — Restore a current production backup to a scratch database. Confirm the
scratch database is separate and cannot affect production. State how you
verified that.

Step 2 — Apply every migration added in Phases 1-3, in order. Time each one.

Step 3 — After each migration, report: did it succeed, how long did it take,
did row counts change unexpectedly?

Step 4 — After all migrations, run all three integrity reports (inventory,
customer financial, supplier financial) against the migrated scratch database.
Report the results.

Step 5 — Compare key aggregates before and after: total customer outstanding,
total supplier payable, total stock units. Any change must be explained.

Step 6 — Write results to
docs/setup/MIGRATION_REHEARSAL_<today's date>.md including every duration, so
the real deployment window can be planned.

If ANY migration fails or any aggregate changes unexpectedly, that is a
release blocker. Report it and stop.
```

---

## Prompt 05 — Security closure

```
[STANDING RULES]

Step 1 — VERIFY Phase 1's fixes are still in place:
  - grep for 'fallback_secret' — must find nothing
  - the app refuses to start without JWT_SECRET
  - a deactivated user's token is rejected on both access and refresh paths
  - the production Electron CSP still has no unsafe-eval and no inline script
  Report evidence for each.

Step 2 — Add rate limiting to POST /auth/login using the existing rateLimit
helper from features/scanner/scanner-rate-limit.ts. Choose limits that cannot
lock out a legitimate user who mistypes a password twice — tell me what you
chose and why.

Step 3 — Add INV-14: a meta-test enumerating every registered route and
asserting that each non-GET route has an explicit role check or a documented
policy call. This must make it impossible to ship an unprotected endpoint by
omission. Report any route currently failing it.

Step 4 — Drop the dead branchId columns. FIRST confirm they are entirely null
in production:
  SELECT COUNT(*) FROM users WHERE "branchId" IS NOT NULL;
  (and the same for customers, transactions if it still exists, activity_logs)
If any is non-null, STOP and report. If all null, write a migration dropping
them from schema.prisma and the database.

Step 5 — Run the repository's security-review skill over the cumulative diff
from all four phases. Report every finding with your assessment of severity.

Step 6 — Confirm no secret appears in logs or the diagnostics export. Run the
redaction tests and report.
```

---

## Prompt 06 — Performance validation

```
[STANDING RULES]

Goal: confirm responsiveness at realistic and future data volume.

Step 1 — Seed a scratch database with roughly 5x current production volume.
Report the current production counts first (customers, products, sales orders,
payments, stock movements, audit rows), then the seeded counts.

Step 2 — Measure and report the time for each:
  - dashboard load (including the Phase 3 financial section)
  - a customer profile with a long transaction history
  - the profit report over a full year
  - product search (multi-word fuzzy)
  - the sales order list
  - the audit log viewer with filters
  - the three integrity reports

Step 3 — For anything over 2 seconds, get the query plan and identify the cause.

Step 4 — Add indexes ONLY where measurement shows a need. Report the before and
after timing for each index added. Do not add indexes speculatively — each one
costs write performance.

Step 5 — ABSOLUTELY FORBIDDEN: do not introduce a cached or stored balance
column. ADR-02 (derived balances) is non-negotiable and is the reason balance
drift is impossible in this system. If a balance read is slow, add an index or
propose a materialised view with an explicit refresh contract, and ask me first.

Step 6 — Write results to
.claude/home-connect-erp-upgrade/phases/phase-04-production-hardening/PERFORMANCE.md.
```

---

## Prompt 07 — Write the runbooks

```
Documentation only.

Write four documents. Each must be usable by a competent person who has never
seen this codebase.

1. docs/setup/RESTORE_RUNBOOK.md
   Expand the Phase 1 version with the tested timings. Include: how to find the
   latest verified backup, how to verify it before restoring, the exact restore
   steps, how to confirm the restore succeeded (the three integrity reports),
   and what to do if the restore fails. Include the real measured duration.

2. docs/setup/RELEASE_RUNBOOK.md
   Build, test, migrate, install, verify, roll back. Include the migration
   durations from Prompt 04 so a deployment window can be planned. Include the
   rollback procedure and how to decide to use it.

3. docs/project/OPERATOR_GUIDE.md
   For the people using the shop system daily: printing invoices, receipts, and
   statements; processing a return; recording expenses; reading the profit
   report. Bilingual where it helps, consistent with the app's EN/AR pairing.

4. docs/setup/INCIDENT_GUIDE.md
   What to do when: the app will not start; the database is unreachable; stock
   looks wrong; a balance looks wrong; a report looks wrong. Each entry points
   at the relevant diagnostic (preflight, diagnostics export, integrity
   reports) and states when to restore.

Then update README.md to reflect the system's final state, and update this
planning workspace's README.md to mark completed phases.

Verification: hand RESTORE_RUNBOOK.md to someone (or reason as if you were
someone) who has not done a restore. Can they follow it without asking a
question? Report any step that requires prior knowledge.
```

---

## Prompt 08 — Prepare and run UAT

```
Do not change code. Preparation and facilitation.

Step 1 — Write
.claude/home-connect-erp-upgrade/phases/phase-04-production-hardening/UAT_PLAN.md
covering these scenarios, each with the exact steps and the expected outcome:
  - a normal cash sale, with a printed invoice
  - a credit sale, with a printed statement later
  - taking a payment, with a printed receipt
  - a return of a delivered item
  - receiving stock from a supplier and recording the payable
  - recording an operating expense
  - the owner reading the profit report for a completed month

Step 2 — Create UAT_LOG.md with a table for: date, scenario, who, what
happened, severity (critical/high/medium/low), status.

Step 3 — After the UAT period, summarise: which scenarios passed, every issue
by severity, and which are release blockers.

Step 4 — THE DECISIVE CHECK: reconcile the profit report figure against the
owner's own sense of how the month went. If they diverge substantially, that is
a FINDING, not a rounding difference — investigate which is wrong before
declaring the phase complete. The owner's instinct about their own business is
evidence.

Step 5 — Report whether every critical and high issue is resolved.
```

---

## Prompt 09 — Final review and release readiness

```
Do not change any code. Review only.

Step 1 — Review against
.claude/home-connect-erp-upgrade/phases/phase-04-production-hardening/REVIEW.md.

Step 2 — Run and report the full output of:
  - npm run typecheck
  - npm run lint
  - npm run test:ci
  - the E2E suite
  - all three integrity reports against real data

Step 3 — Update
.claude/home-connect-erp-upgrade/PRODUCTION_READINESS.md with the current
verdict for each of the four scenarios, and state exactly what changed since
the original assessment.

Step 4 — Re-score the system against
.claude/home-connect-erp-upgrade/HOME_CONNECT_RATING.md. For every area whose
score changed, justify it from evidence. Be as strict as the original
assessment — do not inflate scores because effort was spent.

Step 5 — Confirm every Critical Problem CP-1 through CP-8 is closed, citing the
evidence for each. Any still open must be stated plainly.

Step 6 — List everything in PHASE_5_BACKLOG.md.

Step 7 — Answer the decisive question directly: is Home Connect now a better
system for this business than BIRD, and what evidence supports that? Answer
honestly — if it is not, say so and say what remains.

Step 8 — Confirm the process held across all four months:
  - main's recorded baseline tip remained unchanged throughout Phases 1–4
  - no upgrade commit landed directly on main
  - all four develop checkpoints have green CI, a REVIEW.md and a SUMMARY.md
  - no phase-specific branch was created under the revised policy

Classify as COMPLETE, COMPLETE WITH FOLLOW-UP, or NOT COMPLETE.

This is the release gate — its NOT COMPLETE conditions are release blockers,
not review notes.
```

---

## Prompt 10 — Prepare the final develop → main review and release

```
Do not change any code.

Prerequisite: Prompt 09 returned COMPLETE or COMPLETE WITH FOLLOW-UP.

Step 1 — git push origin develop

Step 2 — Draft the PR description using GIT_WORKFLOW.md §5. This is the release
PR, so it must also summarise the cumulative four-phase outcome:
  - database/schema changes: dropping the branchId columns (T4), with its full
    migration disclosure block — state plainly that it is NOT reversible by a
    down-migration and its rollback is a backup restore
  - the evidence that every branchId column was confirmed NULL before dropping
  - migration rehearsal results from T3 with every measured duration, so the
    deployment window can be planned
  - tests executed: full npm run test:ci output plus the E2E suite result
  - UAT summary: scenarios passed, issues by severity, and whether the owner
    found the profit figure credible
  - the updated PRODUCTION_READINESS.md verdicts and the re-scored rating
  - confirmation that CP-1 through CP-8 are all closed, with evidence for each
  - everything carried into PHASE_5_BACKLOG.md

Step 3 — Show me the draft before opening it.

Step 4 — After I merge, do NOT deploy automatically. Tell me the exact release
steps from docs/setup/RELEASE_RUNBOOK.md, including:
  - the pre-deployment verified backup
  - the expected migration duration from T3
  - the post-deployment validation (the three integrity reports)
  - the rollback trigger and procedure

Deployment is my decision, from main, after the merge.
```
