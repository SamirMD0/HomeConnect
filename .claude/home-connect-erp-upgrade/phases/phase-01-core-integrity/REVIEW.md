# PHASE 1 — REVIEW

**This is the Phase 1 checkpoint gate on `develop`. `main` remains untouched.**

Run it before recording and pushing the Phase 1 checkpoint. Every item needs **evidence**, not an assertion. The verdict determines whether Phase 2 may begin.

---

## Branch and commit hygiene

| Check | Evidence |
|---|---|
| All cumulative upgrade work is on `develop` | `git branch --show-current` |
| **Nothing was committed directly to `main`** | `git log main --oneline` unchanged from `BASELINE.md` |
| `develop` contains the recorded baseline | `git merge-base --is-ancestor ac6ae9f HEAD` |
| Commits are coherent and separate, not one giant commit | Phase 1 commit list in `SUMMARY.md` |
| **No commit bundles an unrelated refactor with a financial or inventory change** | Commit-by-commit review |
| The destructive T9 migration was committed alone | Its commit touches only the legacy removal |
| Working tree is clean | `git status` |
| Stale `feature/phase-N-*` branches deleted | `git branch -a` |

---

## Business correctness

| Check | Evidence required |
|---|---|
| Customer balances still equal their ledger transactions | Financial integrity report clean on production data |
| Supplier balances still equal their transactions | Supplier integrity report clean on production data |
| Stock still equals the movement ledger | Inventory reconciliation clean, compared against the T4 baseline |
| No balance was converted to a stored column | Grep for a balance column on Customer/Supplier/Debt — must find none |
| Cost price updates are correct and audited | Sample 5 recent purchases; verify cost and audit entry for each |
| Selling-price changes from T8 were reported to the owner | The affected-product list exists and was communicated |
| Payments, debts, and allocations behave unchanged | Full financial test suite green |
| Returns, cancels, and voids still preserve history | Audit rows present for each sampled action |

**Specific to this phase:** T8 changes selling prices for preset-priced products. **Confirm the owner was told before it shipped.** A silent price change is a business incident, not a deployment.

---

## Database

| Check | Evidence required |
|---|---|
| Every migration is additive or reversible | Read each; state which |
| Migrations rehearsed against restored production data | `npm run rehearse:migrations` output, on a real restore |
| Idempotency columns are unique and nullable | Schema + migration SQL |
| Dropped tables were confirmed empty first | `LEGACY_TRANSACTIONS_AUDIT.md` |
| A verified backup existed before any drop | Backup record with checksum |
| Money columns are still `Decimal(12,2)` | Grep for Float/Double — must find none |
| Concurrency holds | DB integration tests green in CI |
| No new unique constraint blocks a legitimate business action | Review each; specifically confirm no `(supplierId, receiptNumber)` constraint was added |

---

## Backend

| Check | Evidence |
|---|---|
| New writes are inside `runFinancialTransaction` | Read each; no bare `prisma.$transaction` |
| Repositories accept and use the passed `tx` | A repository ignoring `tx` silently escapes the boundary — check each |
| Validation on every new/changed endpoint | Zod schema present |
| Role checks on every mutating route | INV-14 meta-test green |
| Idempotency returns the original record on replay, not a new one | Test evidence |
| Errors are typed and mapped to the standard envelope | Read the handlers |
| No secret is logged | Redaction tests green |

---

## Frontend

| Check | Evidence |
|---|---|
| **Idempotency key generated once per form, not per submit** | Read the code. **The most likely error in this phase** |
| Submit buttons disable while pending | `isLoading` wired on every financial form |
| 409 conflicts render an intelligible message | Manually trigger a stale-stock conflict |
| Loading and error states present on new screens | Visual check |
| No financial totals recomputed client-side | Totals come from the API |

---

## Security

| Check | Evidence |
|---|---|
| App refuses to start without `JWT_SECRET` | Test + a manual attempt |
| No hardcoded secret fallback remains | Grep for `fallback_secret` — must find nothing |
| Production config confirmed to contain the secret **before** shipping T5 | Explicit confirmation recorded |
| Deactivated users cannot use existing tokens | Test evidence, access **and** refresh paths |
| Admin self-lockout is prevented or documented | Prompt 05 Step 5 finding |
| No new endpoint lacks authorization | INV-14 green |
| `/api/v1/transactions` returns 404 | Manual check |

---

## Testing

| Check | Evidence |
|---|---|
| CI runs on every commit | Pipeline history |
| **`test:ci` runs all 266 files with 0 skipped** | Output |
| CI has been observed going red | The deliberate-break evidence from Prompt 02 Step 4 |
| Every new behaviour has a test that failed before the change | Per-task evidence |
| INV-01, 02, 03, 04, 05, 08, 14 all covered and green | Test names mapped to invariants |
| Integrity reports detect injected corruption | Test evidence — not just a clean run |
| Full run under 10 minutes | Timing |

---

## Operational readiness (specific to Phase 1)

| Check | Evidence |
|---|---|
| A restore was performed on real data and timed | `RESTORE_RUNBOOK.md` with a duration |
| Backups confirmed on separate physical media | A file verified off-machine |
| Reconciliation baseline recorded with a date | T4 result |
| A rollback plan exists for this phase's release | Written down |

---

## Checkpoint readiness

| Check | Evidence |
|---|---|
| PR description complete per [GIT_WORKFLOW.md §5](../../GIT_WORKFLOW.md) | Every section filled |
| Full `npm run test:ci` output included, with the **skipped** count | Not a summary — the output |
| CI run linked and green | Run URL |
| Both migrations disclosed with rollback strategy and validation check | T7 and T9 blocks |
| **T9 stated as NOT reversible by down-migration** | Rollback = backup restore, said plainly |
| **T8's selling-price change flagged, and the owner confirmed before merge** | Recorded confirmation + affected-product list |
| Restore rehearsal duration recorded | From T3 |
| Unresolved risks cross-referenced to `RISK_REGISTER.md` | Listed |

---

## Phase verdict

**COMPLETE** — every check has evidence; CI green with **0 skipped**; all three integrity reports clean on production data; restore rehearsed and timed; backups off-machine; no hardcoded secret; commit history coherent; nothing landed on `main`.

**COMPLETE WITH FOLLOW-UP** — the above hold, and named non-blocking items are carried forward, each with an owner and target phase. Acceptable: partial liveness-predicate migration, cost-change report needing UI polish. **Not** a way to defer a failing gate below.

**NOT COMPLETE** — any of the following:
- tests are failing
- **database integration tests were skipped without justification** (`test:ci` reporting any skipped files)
- migrations were not validated
- stock reconciliation fails
- customer or supplier balances do not reconcile
- a duplicate submission can duplicate money or stock
- permissions are bypassable
- critical business rules remain ambiguous
- rollback or reversal behaviour is unsafe
- a known high-impact data corruption risk remains

Phase-1-specific `NOT COMPLETE` additions:
- CI not running on `develop`
- Restore not rehearsed on real data
- Backups only on the business PC's disk
- The hardcoded secret fallback still present
- A table dropped without confirming it was empty
- Work was committed directly to `main`

---

## The question that decides it

> **If the business PC failed tomorrow morning, could the business be trading again today — and would the restored numbers be provably correct?**

Phase 1 is complete when the answer is yes, with evidence for both halves, and its reviewed `SUMMARY.md` checkpoint is committed and pushed to `develop`.

---

## After an acceptable checkpoint

```bash
git checkout develop
git pull origin develop
git status
```

Continue Phase 2 on `develop`. Do not create a phase branch or merge into `main`.

Delete only after confirming the merge landed. Never `git branch -D`.
