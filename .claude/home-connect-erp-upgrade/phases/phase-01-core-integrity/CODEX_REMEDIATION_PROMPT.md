# Codex prompt — Phase 1 blocker remediation

> Historical remediation prompt. Its branch/PR state snapshot records the situation when it
> was written. Any future code changes follow the current `GIT_WORKFLOW.md`: work only on
> `develop`, create no phase branch, and do not merge into `main` before the final gate.

> Paste everything below the line into Codex. It is written to be self-contained;
> Codex should not need this file's surrounding context.

---

You are working in the Home Connect ERP repository at `d:\User\Documents\Home Connect`
on branch `develop`.

Git safety:
- Confirm current branch is develop.
- Do not modify code on main.
- Check git status before editing.
- Preserve unrelated local changes.
- Commit completed coherent work to develop.
- Do not create a new branch unless explicitly instructed.

A merge-gate review of Phase 1 was just completed against
`.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/REVIEW.md`. The phase
**failed the gate**. Your job is to fix the blockers so the branch can pass its own gate.
You are not re-running the review and you are not deciding the verdict — a separate review
pass will do that after you finish.

Read these before you touch anything:

- `.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/REVIEW.md` — the gate. Authoritative.
- `.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/PLAN.md` — task definitions T1–T14 and their acceptance criteria.
- `.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/BASELINE.md` — the pre-phase control measurement.
- `.claude/home-connect-erp-upgrade/GIT_WORKFLOW.md` — defines the current checkpoint process.

## Ground truth about the current state

Verified by inspection; do not re-derive, but do re-confirm anything you are about to act on.

- Branch `upgrade/phase-01-core-integrity` has **7 commits** ahead of `main`:
  `b725b48` (T1 CI), `44d2ac9` (T5 JWT), `8fa5cd8` (T6 sessions), `8a6f787` (T7 idempotency),
  `77aedeb` (docs), `1c3d608` (T10 integrity reports), `1fce2dd` (T9a legacy removal).
- `main` is at `ac6ae9f555dd69d61ca79be527cc1a80513643d9`, **identical to BASELINE.md**.
  Nothing was committed to `main`. **Keep it that way.**
- The working tree is **not clean**: 95 modified tracked files and 9 untracked paths.
  That uncommitted work contains three Phase 1 deliverables and one bug fix:
  - **T8** — cost price updated from receipts (`supplier-purchases.service.ts:342-356`, `products.repository.ts`, a cost-change report slice, frontend).
  - **T13** — dual currency foundation (untracked migration `20260901090000_add_dual_currency_foundation`, `backend/src/features/financial/exchange-rates/`, `frontend/src/features/exchange-rates/`, `money.ts`, `currency-allocation.ts`).
  - **T14** — VAT foundation (untracked migration `20260903120000_add_vat_foundation`, `backend/src/features/tax/`, pricing calculator, sales order totals).
  - **A JWT env-loading fix** — untracked `backend/src/load-env.ts` and `load-env.test.ts`, plus a modified `backend/src/index.ts`. Import hoisting meant `auth.service.ts` and `auth.middleware.ts` read `process.env.JWT_SECRET` before `dotenv` ran. Belongs with T5.
- **The branch has never been pushed.** `git ls-remote origin` shows only `develop`,
  `feature/phase-1-foundation`, `main`. `.github/workflows/ci.yml` was added in `b725b48`,
  which is unpushed — so **CI has never executed on a single Phase 1 commit** and no PR exists.
- `backend/.env` points `DATABASE_URL` at `localhost:5433/homeconnect` — **the live business
  database**. `scripts/assert-test-database.mjs` refuses to let `npm run test:ci` run against it.

## Hard constraints

1. **Never write to `localhost:5433/homeconnect`.** It is live business data. Read-only
   queries are fine. `npm run test:ci` needs a throwaway database whose name contains
   `test`, `ci`, or `phaseN` — and it must contain `phase4`, `phase5` and `phase6` to
   satisfy the three name-guarded suites in one pass, e.g.
   `homeconnect_test_phase4_phase5_phase6`. Create that database if it does not exist;
   never repoint an existing one.
2. **Never commit to `main`.** All new work stays on `develop`.
3. **Never force-push, never rewrite the 7 existing commits.** They are reviewed and coherent.
4. **Never fabricate evidence.** Several items below are business or physical actions you
   cannot perform. Where you cannot produce real evidence, write the document with the
   evidence section explicitly marked `NOT YET PERFORMED — BLOCKED ON OWNER` and stop.
   A runbook that claims a restore happened when it did not is worse than no runbook.
5. **No unrelated refactors.** REVIEW.md fails any commit that bundles an unrelated refactor
   with a financial or inventory change. Do not reformat, do not fix lint warnings you were
   not asked to fix, do not rename things in passing.

## Task 1 — commit the uncommitted Phase 1 work, split coherently

This is the hardest task. Do it first and do it carefully.

**The split is hunk-level, not file-level.** T8, T13 and T14 changes are interleaved inside
the same files. `backend/prisma/schema.prisma` carries all three. So does
`backend/src/features/suppliers/purchases/supplier-purchases.service.ts`.
`pricing-calculator.controller.ts` carries T13 and T14 and T8-adjacent changes.
`git add <file>` will therefore bundle concerns and fail the gate — use `git add -p`.

Target commit sequence, in dependency order:

| # | Commit | Scope |
|---|---|---|
| 1 | `fix: load environment before modules read it` | `load-env.ts`, `load-env.test.ts`, `index.ts`. Independent of the rest — land it first. |
| 2 | `feat: update product cost price from receipts` | T8 only: cost write + `ServiceAudit` entry + cost-change report slice + frontend. |
| 3 | `feat: add dual currency foundation` | T13 only: currency migration, `exchange-rates/` back and front, `money.ts`, `currency-allocation.ts`. |
| 4 | `feat: add VAT foundation` | T14 only: VAT migration, `tax/`, VAT fields on pricing and sales order totals. |

Rules for the split:

- After **each** commit, the tree must typecheck and the suite must pass. Run
  `npm run typecheck` and `npm test` between commits. If commit 2 cannot stand without part
  of commit 3, that is a real dependency — reorder, or state plainly in the commit body that
  the two are inseparable and why. Do not silently merge them.
- If a file's changes genuinely cannot be separated by hunk, do not fake it. Put the file in
  the earliest commit that needs it and explain the entanglement in that commit's body.
- Commit bodies should say what changed and why, not narrate the split.
- Untracked directories still need `git add` — check `git status` shows nothing left over
  when you are done, including the two untracked migration folders.

**Before committing the migrations, verify against the live database (read-only) whether
`20260901090000_add_dual_currency_foundation` and `20260903120000_add_vat_foundation` have
already been applied** — query `_prisma_migrations`. If they were applied to live from an
untracked local folder, say so in the PR description; it means production schema ran ahead of
version control and that fact belongs in the record.

## Task 2 — make `test:ci` green with zero skips

REVIEW.md: *"`test:ci` runs all 266 files with 0 skipped"*, and **any skipped test file is a
DO NOT MERGE**. BASELINE.md recorded 266 files / 2,191 tests with **10 skipped** — the ten
environment-gated DB integration suites listed in BASELINE.md's table. T1 exists to end that.

```
createdb homeconnect_test_phase4_phase5_phase6      # or equivalent
DATABASE_URL=<throwaway> npx prisma migrate deploy --schema backend/prisma/schema.prisma
DATABASE_URL=<throwaway> npm run test:ci
```

Then read `node_modules/.cache/home-connect/vitest-report.json` and confirm
`numPendingTests + numTodoTests === 0` and `numFailedTests === 0` — that is exactly what the
CI job's own assertion step checks. Record the wall-clock duration; REVIEW.md wants the full
run under 10 minutes.

If tests fail, fix the code, not the test, unless the test is provably asserting the wrong
thing — in which case explain why in the commit body.

## Task 3 — push the checkpoint and get CI green

1. `git push origin develop`.
2. Confirm the CI workflow actually triggers. `ci.yml` is on `push` and `pull_request`, but
   it has never run once — **expect first-run failures that are pipeline bugs rather than
   code bugs** (Prisma generate, migration ordering, the `pg_trgm` extension in
   `20260801090000_enable_pgtrgm` needing superuser on the CI postgres image, Node version).
   Fix the workflow until it is genuinely green. Each workflow fix is its own commit.
3. Update `SUMMARY.md` with the complete checkpoint evidence. It must include:
   - the **full `npm run test:ci` output**, not a summary, **with the skipped count**;
   - the CI run URL;
   - both migrations disclosed with rollback strategy and validation check (T7 and T9);
   - **T9 stated plainly as NOT reversible by down-migration** — rollback is a backup restore;
   - **T8's selling-price change flagged** with the affected-product list (see Task 5);
   - the restore rehearsal duration from T3 (see Task 4);
   - unresolved risks cross-referenced to `RISK_REGISTER.md`.
4. REVIEW.md also wants evidence that **CI has been observed going red** (the deliberate-break
   evidence from Prompt 02 Step 4). If that evidence does not exist, produce it: push a commit
   on a scratch branch that breaks a test, screenshot/record the red run, revert it. Do not do
   this on the Phase 1 branch.

## Task 4 — the missing operational evidence

These are Phase-1-specific DO NOT MERGE conditions. **Three of the four you cannot complete
alone.** Create each document, fill in everything you can, and mark the rest blocked.

| Item | What exists | What you can do |
|---|---|---|
| `RESTORE_RUNBOOK.md` (T3) | **Nothing. The file does not exist anywhere on disk.** | Write the runbook — exact commands to restore a backup into a fresh database and bring the app up. **You cannot perform the rehearsal on real data or record its duration.** Mark that section blocked on the owner. |
| T4 reconciliation baseline | **No baseline document found.** Only REVIEW.md's requirement line. | You *can* produce this: run the `inventory-reconciliation` report against the live database read-only and record the result with today's date. This becomes the baseline the review compares against. |
| Off-machine backup evidence (T2) | Not found. | Physical/owner action. Document what is required and mark blocked. |
| Rollback plan for this release | Not found. | You can draft this. T9 is not reversible by migration — the rollback is a verified backup restore. Say so. |

Put these in `.claude/home-connect-erp-upgrade/phases/phase-01-core-integrity/`.

**Note:** `.gitignore:19` ignores `.claude/`, so every phase document except
`SUPPLIER_BALANCE_REVIEW.md` (force-added in `77aedeb`) is untracked. The Phase 1 evidence
trail currently lives only on the machine whose failure Phase 1 exists to survive. Raise this
with the owner and propose either force-adding the phase evidence documents or moving them to
a tracked `docs/` path. **Do not change `.gitignore` unilaterally** — it is a deliberate
project-wide decision and changing it would sweep in unrelated files.

## Task 5 — the T8 owner sign-off

REVIEW.md, verbatim: *"T8 changes selling prices for preset-priced products. Confirm the
owner was told before it shipped. A silent price change is a business incident, not a
deployment."*

You cannot give this sign-off. What you can do:

1. Generate the **affected-product list**: every product with a preset-derived price whose
   selling price changes once cost updates from receipts. Query read-only against live data.
2. Write it to a dated document alongside the other phase evidence.
3. **Stop and report.** Do not merge, and do not mark T8 complete, until the owner has
   confirmed in writing. Same for T9a, which per PLAN.md *"requires explicit owner sign-off"*
   because it removes a visible panel from the Customer Profile screen.

## Task 6 — branch hygiene

Stale branches `feature/phase-1-foundation` and `feature/phase-2-auth` still exist locally,
and `feature/phase-1-foundation` also exists on origin. REVIEW.md requires stale
`feature/phase-N-*` branches deleted. **Confirm they are fully merged or genuinely abandoned
before deleting, and ask the owner first.** Use `git branch -d`, never `-D`.

## Definition of done

Report against this list, with evidence per line. Do not claim a line without pasting the
command output that proves it.

- [ ] `git status` clean; all Phase 1 work committed in coherent, single-concern commits
- [ ] `npm run typecheck` and `npm run lint` clean (89 pre-existing warnings, 0 errors, per BASELINE.md)
- [ ] `npm run test:ci` green with **0 skipped**, duration recorded, JSON report confirms it
- [ ] Branch pushed; PR open against `main`; CI run green and linked
- [ ] `main` still at `ac6ae9f` — verify with `git log main --oneline`
- [ ] `RESTORE_RUNBOOK.md`, T4 baseline, rollback plan written; owner-blocked items marked as blocked
- [ ] T8 affected-product list produced; owner sign-off obtained or explicitly pending
- [ ] No commit bundles unrelated concerns — verify with `git log main..HEAD --stat`

Where something is blocked on the owner, list it separately as **BLOCKED**, name what is
needed and from whom, and do not work around it.
