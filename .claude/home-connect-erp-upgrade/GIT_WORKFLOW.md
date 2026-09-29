# GIT WORKFLOW

How the four-phase upgrade is developed, reviewed, and released.

**Repository:** `https://github.com/SamirMD0/HomeConnect.git` (remote `origin`)  
**Stable production/reference branch:** `main`  
**Upgrade integration branch:** `develop`

This document is the authority on branching, commits, checkpoints, and release gates. Every `phases/*/PLAN.md`, `PROMPTS.md`, and `REVIEW.md` defers to it.

---

## 1. Branch policy

All implementation for Phases 1–4 happens directly on `develop`:

```text
main
└── develop
    ├── Phase 1
    ├── Phase 2
    ├── Phase 3
    └── Phase 4
```

`main` remains stable and untouched throughout the upgrade. Do not commit or cherry-pick upgrade work to it, merge `develop` into it, deploy unfinished `develop`, or run destructive migration experiments against it. Do not create a phase-specific branch or any other branch unless the owner explicitly asks.

Before implementation work:

```bash
git checkout develop
git pull origin develop
git status
git branch --show-current
```

Stop before editing if the current branch is not `develop`. Preserve unrelated local changes.

---

## 2. Phase workflow and checkpoints

```text
develop
  ├── Phase 1 → tests → REVIEW.md → SUMMARY.md → commit → push
  ├── Phase 2 → tests → REVIEW.md → SUMMARY.md → commit → push
  ├── Phase 3 → tests → REVIEW.md → SUMMARY.md → commit → push
  └── Phase 4 → full release review → SUMMARY.md → commit → push
                                      │
                                      └── final develop → main merge only
                                          after explicit approval
```

Each `SUMMARY.md` is a durable checkpoint. It records objectives, completed work, schema/database/backend/frontend/security/integrity changes, VAT and currency effects where applicable, migrations, tests and CI evidence, remaining issues, known risks, deferred work, and one verdict:

```text
COMPLETE
COMPLETE WITH FOLLOW-UP
NOT COMPLETE
```

A build alone never makes a phase complete. `NOT COMPLETE` blocks implementation of the next phase until its blocking conditions are resolved or the owner explicitly changes the gate.

---

## 3. Commits

Using one branch does not mean using giant commits. Commit each coherent change separately so it can be understood and reverted alone.

Good examples:

```text
fix: enforce purchase receiving idempotency
feat: add VAT snapshot to finalized invoice lines
feat: print bilingual payment receipt
test: add return transaction rollback coverage
docs: add phase 2 completion summary
```

Rules:

- One logical change per commit.
- Tests may accompany the behavior they cover or follow immediately.
- A schema migration and the code that requires it belong together.
- Do not mix unrelated refactors with money, stock, or migration changes.
- Use the repository convention: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `build:`.
- Never overwrite, revert, stage, or commit unrelated user work.

---

## 4. CI and validation

CI on `develop` is the automated checkpoint gate. It runs, where applicable:

```text
dependency install → typecheck → lint → database startup → migrations →
unit tests → integration tests → security checks → build
```

`npm run test:ci` must exercise the database suites and report zero skipped tests. A red CI run, an unjustified skip, or a migration failure blocks the checkpoint.

Before every phase push, record the complete local result and the resulting `develop` CI link in that phase's `SUMMARY.md`. Phase 4 also requires the E2E suite and the cumulative release checks.

---

## 5. Database migration rule

Every schema-changing task documents this in its commit body and phase summary:

```text
Migration required:    Yes / No
Backward compatible:   Yes / No
Existing data impact:  what changes for existing rows
Rollback strategy:     the exact recovery path
Backup required:       Yes / No
Validation check:      the query or report proving success
```

- Prefer additive, nullable columns; null must preserve existing behavior.
- A dropped table or column is not recoverable with a down-migration. Recovery is the verified pre-deployment backup.
- Rehearse migrations against a restored copy of production, never production or merely a seeded development database.
- Record durations and validate inventory, customer-financial, and supplier-financial reconciliation afterward.
- Never reset, drop, recreate, or force-push schema changes against production.

The plan contains two destructive tasks: Phase 1 T9 (`transactions`) and Phase 4 T4 (`branchId` columns). Both require the documented empty-data proof, a verified backup, and explicit sign-off.

---

## 6. Phase review gate

Every phase `REVIEW.md` produces the same vocabulary as its `SUMMARY.md`: `COMPLETE`, `COMPLETE WITH FOLLOW-UP`, or `NOT COMPLETE`.

The verdict is `NOT COMPLETE` if tests fail, database suites are skipped without justification, migrations are unvalidated, an integrity report fails, duplicate submission can duplicate money or stock, permissions are bypassable, a critical business rule is ambiguous, rollback/reversal is unsafe, or a high-impact corruption risk remains.

`COMPLETE WITH FOLLOW-UP` is only for named non-blocking work with an owner and target phase. It cannot defer a failing gate.

---

## 7. Implementation-prompt safety block

Every code-changing prompt includes this exact block. Read-only prompts do not need unnecessary Git operations.

```text
Git safety:
- Confirm current branch is develop.
- Do not modify code on main.
- Check git status before editing.
- Preserve unrelated local changes.
- Commit completed coherent work to develop.
- Do not create a new branch unless explicitly instructed.
```

The implementer then inspects the existing behavior, makes the smallest coherent change, updates tests, runs relevant validation, and summarizes both files and business behavior.

---

## 8. Final release gate

Only after all four summaries and reviews are acceptable may a final `develop → main` merge be considered. It additionally requires:

- full regression and E2E testing passing;
- migrations validated against restored production-shaped data;
- timed backup/restore proof;
- financial and inventory reconciliation passing;
- security review passing;
- real-user acceptance testing complete; and
- explicit final owner approval.

The final integration is reviewed as one cumulative release. Merging is not deploying; deployment remains a separate owner decision from `main` using the release runbook.

---

## 9. Planning workspace

`.claude/home-connect-erp-upgrade/` is versioned alongside the implementation. Plans, reviews, evidence, and summaries are tracked so every checkpoint can be audited from Git history.
