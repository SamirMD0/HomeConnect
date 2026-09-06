# PHASE 4 — REVIEW

**This is the Phase 4 checkpoint on `develop` and the release gate for the whole four-month plan.**

The final gate. This review decides whether Home Connect is a system the business can rely on — not whether the code is good. Its `NOT COMPLETE` conditions are release blockers, not review notes.

---

## Branch and process hygiene — cumulative

| Check | Evidence |
|---|---|
| All cumulative work is on `develop` | `git branch --show-current` |
| The accepted Phase 3 checkpoint is present | Phase 3 `SUMMARY.md` and commit evidence |
| **The recorded `main` tip is unchanged throughout all four phases** | Git log comparison |
| All four phase checkpoints have green CI and a recorded verdict | Four summaries and CI links |
| Every phase has a completed `REVIEW.md` and `SUMMARY.md` | The eight documents |
| The three stale `feature/phase-N-*` branches were deleted | `git branch -a` |
| No phase-specific branch was created under the revised policy | `git branch -a` |
| **T4 (drop `branchId`) was committed alone** | Commit review |
| Working tree clean | `git status` |

---

## Business correctness

| Check | Evidence |
|---|---|
| All three integrity reports clean on production data | Report outputs |
| Aggregates unchanged by migrations except where intended | Before/after from the rehearsal |
| Profit figure credible to the owner | UAT Step 4 — the decisive check |
| Every UAT scenario completed by a real user | `UAT_LOG.md` |
| Every critical and high UAT issue resolved | Log status |
| Invoice, receipt, and statement totals match source records | UAT evidence |
| A return leaves stock and money both correct | E2E journey 2 + UAT |

---

## Database

| Check | Evidence |
|---|---|
| Every Phase 1–3 migration rehearsed against **restored production data** | `MIGRATION_REHEARSAL_<date>.md` |
| Every migration duration recorded | Same — needed to plan the deployment window |
| No unexplained row-count or aggregate change | Before/after comparison |
| `branchId` columns confirmed null before dropping | Query output |
| Indexes added only where measurement justified them | `PERFORMANCE.md` before/after timings |
| **No cached or stored balance column introduced** | Grep — ADR-02 is non-negotiable |
| Money still `Decimal(12,2)` everywhere | Schema; zero Float/Double |

---

## Backend

| Check | Evidence |
|---|---|
| No new features added in this phase | Diff review |
| INV-14 green — every mutating route authorized | Test output |
| Login rate limiting cannot lock out a legitimate mistype | The chosen limits, justified |
| Every concurrency test genuinely runs concurrent transactions | Read them — sequential calls prove nothing |
| No concurrency test was adjusted to pass | If one failed, it was fixed in production code |

---

## Frontend

| Check | Evidence |
|---|---|
| All five (or three) E2E journeys pass | Suite output |
| Journeys assert data outcomes, not just page rendering | Read the assertions |
| No flaky test was committed | 10-run pass rate per journey |
| Documents print correctly, Arabic included | UAT evidence |
| Error and loading states behave under real use | UAT feedback |

---

## Security

| Check | Evidence |
|---|---|
| No hardcoded secret | Grep for `fallback_secret` — nothing |
| App refuses to start without `JWT_SECRET` | Manual attempt |
| Revoked sessions end on access **and** refresh | Test evidence |
| Login rate-limited | Test evidence |
| INV-14 green | Test output |
| `branchId` scaffolding removed | Migration |
| Production CSP intact — no `unsafe-eval`, no inline script | File inspection |
| No secrets in logs or the diagnostics export | Redaction tests |
| `security-review` skill run over the cumulative four-phase diff | Findings + assessments |

---

## Testing

| Check | Evidence |
|---|---|
| `npm run test:ci` green with **0 skipped** | Output |
| E2E suite green in CI | Pipeline |
| CI runs on every commit and has been seen to fail | Pipeline history |
| INV-01 through INV-15 all covered | Invariant-to-test mapping |
| Concurrency invariants proven, not assumed | Test list |
| Performance measured at 5× volume | `PERFORMANCE.md` |

---

## Operational readiness

| Check | Evidence |
|---|---|
| Restore runbook includes a **real measured duration** | Document |
| Release runbook includes migration durations | Document |
| Incident guide covers the five common failures | Document |
| Operator guide covers the new workflows | Document |
| **A person unfamiliar with the codebase could follow the restore runbook** | The Prompt 07 verification |
| Backups confirmed off-machine and still arriving | Check a recent file |

---

## Scope discipline

| Check | Evidence |
|---|---|
| No new features in Phase 4 | Diff review |
| No multi-branch, multi-currency, POS, or accounting work | Grep |
| Discovered gaps recorded in `PHASE_5_BACKLOG.md`, not built | The backlog exists and is non-empty |

---

## Final scoring

Re-score every area in `HOME_CONNECT_RATING.md`. **Be as strict as the original assessment.** Effort spent is not evidence of improvement — a score moves only when the underlying evidence moves.

Expected movement if all four phases succeeded:

| Area | Before | Expected after | Driver |
|---|---:|---:|---|
| Testing | 6.0 | 8.0–8.5 | CI, DB tests running, E2E, concurrency proven |
| Reliability | 7.0 | 8.0–8.5 | Proven rather than assumed |
| Production readiness | 6.0 | 8.0–8.5 | Rehearsed restore, CI, runbooks, UAT |
| Security | 7.0 | 8.0–8.5 | CP-1, CP-5, R-19, R-20, R-21 closed |
| Reporting | 7.0 | 8.5 | Profit, margin, valuation, cash flow |
| Dashboard | 7.0 | 8.5 | Financial section |
| Sales invoices | 6.5 | 8.0 | Printable invoice; CP-2 resolved |
| Returns / refunds | 3.0 | 7.0–7.5 | Atomic return with refund/credit |
| Printing | 5.0 | 8.0 | Invoice, receipt, statement |
| Supplier management | 7.5 | 8.0 | Due dates and aging |
| Purchase invoices | 7.0 | 8.0 | Cost price updates |
| **Overall** | **7.1** | **8.0–8.3** | |

**If the re-scored overall is below 7.8, the phases did not deliver what was planned** — investigate why before declaring completion.

---

## Final develop → main review readiness

| Check | Evidence |
|---|---|
| PR description complete per [GIT_WORKFLOW.md §5](../../GIT_WORKFLOW.md) | Every section filled |
| Full `npm run test:ci` output plus the E2E suite result | The output |
| CI run linked and green, both jobs | Run URLs |
| T4 migration disclosed | **Stated as NOT reversible by down-migration; rollback = backup restore** |
| Evidence every `branchId` column was NULL before dropping | Query output |
| **Migration rehearsal durations from T3**, so the deployment window can be planned | The timings |
| UAT summary: scenarios, issues by severity, owner's verdict on the profit figure | `UAT_LOG.md` |
| Updated `PRODUCTION_READINESS.md` verdicts | The four scenarios |
| Re-scored `HOME_CONNECT_RATING.md` with justifications | The scores |
| CP-1 through CP-8 each confirmed closed with evidence | The list |
| `PHASE_5_BACKLOG.md` contents | Listed |

---

## Final phase verdict

**COMPLETE** — `test:ci` green with **0 skipped** · E2E green in CI · every migration rehearsed on real data · all three integrity reports clean · CP-1 through CP-8 closed · runbooks usable by a stranger · UAT complete with all critical and high issues resolved · the owner finds the profit figure credible · `main` remained untouched.

**COMPLETE WITH FOLLOW-UP** — the above hold with named non-blocking items in `PHASE_5_BACKLOG.md`, each with an owner. Acceptable: reduced E2E coverage (three journeys), performance items with a documented plan, medium/low UAT issues.

**NOT COMPLETE** — any of the following:
- tests are failing
- **database integration tests were skipped without justification**
- migrations were not validated
- stock reconciliation fails
- customer or supplier balances do not reconcile
- a duplicate submission can duplicate money or stock
- permissions are bypassable
- critical business rules remain ambiguous
- rollback or reversal behaviour is unsafe
- a known high-impact data corruption risk remains

Phase-4-specific `NOT COMPLETE` additions:
- **Any migration failing against restored production data**
- Any Critical Problem CP-1 to CP-8 still open
- No rehearsed restore with a measured duration
- UAT incomplete, or a critical issue unresolved
- **The owner does not find the profit figure credible**
- A cached balance column was introduced
- `branchId` dropped without confirming every column was NULL
- Upgrade work was found committed directly to `main` in any phase

---

## The final question

> **If this system were handed to the business tomorrow as their only ERP, and BIRD were switched off — would that be a responsible decision, and could you show the evidence for it?**

That is the whole point of the four months. Answer it honestly. If the answer is no, say what remains and how long it would take — an honest "not yet" is far more valuable than a confident sign-off that a real transaction later disproves.

---

## After explicit approval — the release

There is no next phase branch. Only after explicit final approval:

```bash
git checkout main
git pull origin main
git merge --no-ff develop
git tag -a v3.0.0 -m "Four-phase ERP upgrade"
```

**Merging is not deploying.** Cut the release from `main` following `docs/setup/RELEASE_RUNBOOK.md`, using the T3 migration durations to plan the window:

1. Verified backup, immediately before deployment
2. Apply migrations, expecting the rehearsed durations
3. Validate with the three integrity reports
4. Roll back per the runbook if any check fails

Deployment is the owner's decision, from `main`, after the merge.
