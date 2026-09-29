# PHASE 4 — PRODUCTION HARDENING

**Weeks 14–16 · Budget 110–130 hours**

---

## Branch and checkpoint

```
Required branch:  develop
Prerequisite:     acceptable Phase 3 REVIEW.md and SUMMARY.md checkpoint
```

**Do not implement this phase on `main` and do not create a Phase 4 branch.**

```bash
git checkout develop
git pull origin develop
git status
```

**Verify the checkpoint before starting** — this phase validates the cumulative work of Phases 1–3, so all three accepted checkpoints must be on `develop`:

```bash
git branch --show-current            # develop
git log --oneline -20                # should show three phase checkpoints
npm run test:ci                     # green, 0 skipped
# all three integrity reports clean against real data
```

**This phase's review is the release gate.** It decides whether a final `develop → main` merge may be proposed, so its `NOT COMPLETE` conditions are release blockers, not review notes.

---

## Objective

Turn "it works" into "we can prove it works, and we can recover when it does not."

## Governing principle

**No new features.** Every hour goes to proving, hardening, documenting, or recovering. The one temptation this phase must resist is finishing a feature that feels almost done — that is what Phase 3's buffer was for.

If a genuinely important gap is discovered, record it in a `PHASE_5_BACKLOG.md` and move on.

---

## T1 · End-to-end test suite

**Objective.** Prove the critical journeys work through the real UI against a real database.

**Existing implementation.** **None.** No Playwright or Cypress. 2,181 tests cover logic, services, routes, and components — nothing exercises a complete user journey.

**Problem.** Every layer is tested; the seams between them are not. An invoice that renders correctly in a snapshot but is unreachable from the sales order page passes every existing test.

**Proposed change.** Add Playwright. Cover **five journeys only**:

1. Login → create customer → create sales order → deduct stock → record payment → verify balance
2. Receive stock from supplier → verify quantity and payable → void receiving → verify both reversed
3. Create installment plan → pay two installments → verify schedule, balance, and overdue state
4. Print a sales invoice and a payment receipt (Phase 2)
5. Run the profit report and reconcile against a known order set (Phase 3)

**Deliberately not** broad coverage. **Five reliable journeys beat thirty flaky ones** — a flaky E2E suite gets ignored, and an ignored suite is worse than none because it manufactures false confidence.

**Files.** `e2e/` (new); `playwright.config.ts`; CI workflow update.

**Tests required.** The suite is the deliverable. It must run in CI against a seeded throwaway database.

**Dependencies.** Phases 1–3.

**Acceptance criteria.** Five journeys pass reliably; they run in CI; a deliberately broken journey fails.

**Effort.** 30–40 h · **Risk.** Medium — E2E is notoriously flaky. **Budget time for stabilisation, and delete any test that cannot be made reliable rather than tolerating a flake.**

---

## T2 · Concurrency and failure testing

**Objective.** Prove the system behaves correctly when things go wrong simultaneously.

**Existing implementation.** DB integration tests exist and now run in CI (Phase 1 T1). Concurrency coverage is thin.

**Problem.** The CAS design should make lost updates impossible — that is a claim, and claims about concurrency need proof.

**Proposed change.** Explicit tests for:
- Two simultaneous stock deductions of the same product (INV-04)
- Two simultaneous payments against the same debt
- A transaction failing mid-operation, leaving no partial state (INV-05)
- Concurrent receiving and sale of the same product
- A duplicate idempotent request under concurrency (INV-07, INV-08)
- Database connection loss mid-transaction

**Files.** Additions to the DB integration suites.

**Dependencies.** Phase 1 T1.

**Acceptance criteria.** Every concurrency invariant proven, not assumed; each test genuinely runs two concurrent transactions rather than simulating them.

**Effort.** 20–26 h · **Risk.** Low — tests only. **They may surface real bugs, which is the point; leave buffer in T7.**

---

## T3 · Migration rehearsal against restored production data

**Objective.** Prove every schema change in this plan applies safely to the real database.

**Existing implementation.** `npm run rehearse:migrations` exists. The in-app runner requires a verified backup and records `RepairHistory`.

**Problem.** Dev databases lack the data shapes that break migrations — nulls, duplicates, volume, and history that only real use produces.

**Proposed change.** Restore a current production backup to a scratch database and apply **every** migration from Phases 1–3 in order. Time each. Verify data integrity afterwards with all three integrity reports. Document the results.

**Files.** `docs/setup/MIGRATION_REHEARSAL_<date>.md`.

**Dependencies.** Phases 1–3; a current production backup.

**Acceptance criteria.** All migrations apply cleanly to real data; durations recorded; integrity reports clean afterwards.

**Effort.** 8–12 h · **Risk.** Low (scratch database) — **but a failure here is a critical finding that must block release.**

---

## T4 · Security review and closure

**Objective.** Close remaining security findings and verify Phase 1's fixes held.

**Existing implementation.** Phase 1 closed CP-1 (JWT gate) and CP-5 (session revocation). Remaining: no login rate limiting (R-19); no route-level authorization coverage test (R-20); dead `branchId` columns implying isolation that does not exist (R-21).

**Proposed change.**
1. Rate limiting on `/auth/login` using the existing `rateLimit` helper (currently used only by scanner and maintenance routes).
2. INV-14 — a meta-test asserting every mutating route carries an explicit role check, so a new endpoint cannot ship unprotected by omission.
3. **Drop the dead `branchId` columns.** Leaving scaffolding that implies branch isolation is worse than having nothing — it invites a future assumption that isolation exists.
4. Re-verify: no hardcoded secret, revoked sessions end, CSP intact, no secrets in logs or diagnostics.
5. Run the repository's `security-review` skill over the cumulative diff.

**Files.** `auth.routes.ts`; a new meta-test; a migration dropping `branchId`; `schema.prisma`.

**DB impact.** Dropping four nullable columns. **Confirm they are entirely null in production first.**

**Dependencies.** Phase 1.

**Acceptance criteria.** Login rate-limited; INV-14 green; `branchId` gone; every Phase 1 security fix verified still in place.

**Effort.** 14–18 h · **Risk.** Low

---

## T5 · Performance validation

**Objective.** Confirm the system stays responsive at realistic and future data volume.

**Existing implementation.** Deliberate composite indexes, `pg_trgm` search, dashboard caching. **No load testing.**

**Problem.** Phase 3 added expensive aggregates. Derived balances (ADR-02) recompute on every read. Neither has been measured at volume.

**Proposed change.** Seed a scratch database with ~5× current production volume. Measure: dashboard load, customer profile with a long history, profit report over a year, product search, sales order list, audit viewer. Add indexes where measurement — not intuition — shows a need.

**Explicitly forbidden:** introducing a cached balance column. ADR-02 is non-negotiable. If a balance read is slow, add an index or a materialised view with an explicit refresh contract.

**Files.** Possibly migrations adding indexes; a results document.

**Dependencies.** Phase 3.

**Acceptance criteria.** Every measured operation under 2 seconds at 5× volume, or a documented plan for those that are not.

**Effort.** 12–16 h · **Risk.** Low

---

## T6 · Documentation and runbooks

**Objective.** Make the system operable and recoverable by someone who is not its author.

**Existing implementation.** Strong developer docs (`docs/`), exceptional schema comments, a Phase 1 restore runbook. **Thin end-user documentation.**

**Problem.** R-27, bus factor. One developer holds the operational knowledge.

**Proposed change.**
1. **Restore runbook** — expand Phase 1 T3 with the tested timings and a decision tree.
2. **Release runbook** — build, test, migrate, install, verify, roll back.
3. **Operator guide** — daily use of the new documents, returns, expenses, and reports, bilingual where it helps.
4. **Incident guide** — what to do when the app will not start, the database is unreachable, stock looks wrong, or a balance looks wrong. Each pointing at the relevant diagnostic.
5. Update `README.md` and the planning workspace to final state.

**Files.** `docs/setup/`, `docs/project/`, `README.md`.

**Dependencies.** All phases.

**Acceptance criteria.** A competent person who has never seen the codebase can restore the database and cut a release using only the runbooks.

**Effort.** 16–22 h · **Risk.** None

---

## T7 · Real-business user acceptance testing

**Objective.** Confirm the system works for the people who actually use it.

**Existing implementation.** None formalised.

**Problem.** Every prior check verifies the system does what the *developer* intended. UAT verifies it does what the *business* needs — the only test that catches a correct feature nobody can use.

**Proposed change.** Two weeks of parallel real use covering: a normal sale with an invoice, a credit sale with a statement, a payment with a receipt, a return, a supplier receipt with payable, an expense, and the owner reading the profit report. Log every issue by severity.

**Then, the decisive check:** reconcile the profit figure against the owner's own sense of the month. **A large unexplained divergence is a finding, not a rounding difference.**

**Files.** `UAT_LOG.md` in the planning workspace.

**Dependencies.** All phases.

**Acceptance criteria.** All critical workflows completed by real users; every critical and high issue resolved; the owner confirms the profit figure is credible.

**Effort.** 16–24 h developer time (spread across the UAT period) · **Risk.** Medium — **UAT reliably finds things. That is its purpose, and T8 exists to absorb them.**

---

## T8 · Final hardening and buffer

Fix UAT findings, stabilise E2E flakes, close review items.

**Effort.** 20–30 h · **Do not compress this.** It is where the phase's discovered work lands.

---

## Summary

| Task | Effort | Risk | Delivers |
|---|---:|---|---|
| T1 E2E suite | 30–40 | Medium | Journey-level proof |
| T2 Concurrency tests | 20–26 | Low | Proof, not assumption |
| T3 Migration rehearsal | 8–12 | Low | Safe deployment |
| T4 Security closure | 14–18 | Low | R-19, R-20, R-21 |
| T5 Performance | 12–16 | Low | Confidence at volume |
| T6 Runbooks | 16–22 | None | R-27 bus factor |
| T7 UAT | 16–24 | Medium | Real-world validation |
| T8 Buffer | 20–30 | — | — |
| **Total** | **136–188 h** | | |

**Exceeds the 110–130 h budget.** This is expected and is why Phases 1–3 each carried slack. If time runs short:
- **Reduce T1** from five journeys to three (keep 1, 2, and 5).
- **Reduce T5** to spot checks rather than systematic load testing.
- **Never reduce T3, T7, or T8.** Migration rehearsal prevents a deployment disaster; UAT is the only check that the work was worth doing; the buffer is where their findings get fixed.

**Definition of done:** five (or three) E2E journeys green in CI · concurrency invariants proven · every migration rehearsed on real data · security findings closed · runbooks a stranger could follow · real users have used it and the owner believes the profit figure.

---

## Explicitly out of scope

No new features. No multi-branch. No multi-currency (unless it was decided pre-Phase 1 and planned accordingly). No POS. No accounting engine. No commercial/multi-tenant work.

**If something important is discovered, write it in `PHASE_5_BACKLOG.md` and keep going.** Shipping a hardened, proven system beats shipping one more feature onto an unproven one.

---

## Migration disclosure

One task changes the schema.

**T4 — drop the dead `branchId` columns**
```
Migration required:    Yes — DESTRUCTIVE
Backward compatible:   No. Drops branchId from users, customers, activity_logs
                       (and transactions, if Phase 1 T9 did not already drop it)
Existing data impact:  NONE ONLY IF every column is confirmed entirely NULL in
                       production. If any row has a value, STOP — that is a
                       business question about undocumented branch data
Rollback strategy:     NOT reversible by a down-migration. Re-adding the columns
                       restores the shape, not the data. Recovery = restore the
                       verified backup taken immediately before deployment
Backup required:       YES — mandatory, verified, immediately before deployment
Validation check:      SELECT COUNT(*) WHERE "branchId" IS NOT NULL = 0 on every
                       affected table BEFORE the drop; typecheck passes after
```

**The second of the plan's two destructive migrations.** Commit it alone. Everything else in this phase is tests, documentation, and configuration.

---

## Suggested commit sequence

```
test: add playwright end-to-end harness                      (T1)
test: add sale, receiving and installment journeys           (T1)
test: add concurrency and failure-path coverage              (T2)
docs: record migration rehearsal timings                     (T3)
fix: rate limit login attempts                               (T4)
test: assert every mutating route enforces a role check      (T4)
chore: drop unused branchId columns                          (T4)
perf: add indexes for financial reporting queries            (T5)
docs: add restore, release, operator and incident runbooks   (T6)
docs: record UAT results and phase-5 backlog                 (T7)
```

---

## Phase completion

```
1. REVIEW.md completed
2. Tests passing (npm run test:ci, 0 skipped)
3. CI passing
4. SUMMARY.md updated with cumulative evidence and verdict
5. Coherent work committed and pushed to develop
6. main tip confirmed unchanged
7. Final develop → main review prepared
8. Explicit owner approval obtained before any merge
```

Only after the final gate and explicit approval:

```bash
git checkout main
git pull origin main
git merge --no-ff develop                         # only after explicit approval
git tag -a v3.0.0 -m "Four-phase ERP upgrade"   # version per release runbook
```

Cut the release from `main`, following `docs/setup/RELEASE_RUNBOOK.md` (T6), using the migration durations measured in T3 to plan the deployment window.
