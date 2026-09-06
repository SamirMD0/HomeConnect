# Home Connect ERP Upgrade — Planning Workspace

An evidence-based audit of Home Connect as it exists today, a comparison against BIRD, and a four-month plan to make it clearly the better system for this business.

**Audit baseline:** commit `ac6ae9f` (v2.0.0), working tree clean, audited 2026-08-25.
**Verification:** `npx vitest run` → **2,181 passed, 10 skipped, exit 0** (the 10 skipped files are the DB integration suites, gated behind `RUN_*_DB_TESTS`).

---

## The finding in one paragraph

Home Connect is a **single-machine Electron desktop ERP** — not a web or cloud system — running PostgreSQL locally on loopback. Its transactional core is built well above the standard of its finished feature set: balances are **derived and never stored**, stock uses **compare-and-set on every path** with unique movement links that make double-application unrepresentable, money is `Decimal(12,2)` with zero float columns, and five audit tables record every change with a mandatory reason. What is missing is **surface**: no printed invoice, receipt, or statement; a three-step manual return; and — most importantly — **no way to tell the owner whether the business made money**, despite all the raw data for it already being in the database.

**Overall: 7.1/10 · Production-capable with limitations.**

---

## How the work is done

**All four phases are implemented on `develop`. Never implement upgrade work on `main`.**

```
main
└── develop
    ├── Phase 1
    ├── Phase 2
    ├── Phase 3
    └── Phase 4
```

Each phase ends with tests, a completed `REVIEW.md`, a durable `SUMMARY.md`, coherent commits, and a push to `develop`. `main` stays unchanged until all four phases pass the cumulative release gate and the owner explicitly approves the final `develop → main` merge. Full rules: **[GIT_WORKFLOW.md](GIT_WORKFLOW.md)**.

**Before implementation:**

```bash
git checkout develop
git pull origin develop
git status
```

---

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 0 | **[GIT_WORKFLOW.md](GIT_WORKFLOW.md)** | Branching, commits, PRs, CI, migration rules, merge gates |
| 1 | **[MASTER_PLAN.md](MASTER_PLAN.md)** | Start here. Assessment, scope, hours, critical path, definition of done, and the resolved schema decisions |
| 2 | [HOME_CONNECT_RATING.md](HOME_CONNECT_RATING.md) | 27 scored areas, 8 critical problems, 12 strengths not to rewrite |
| 3 | [BIRD_GAP_ANALYSIS.md](BIRD_GAP_ANALYSIS.md) | Where each system wins, and what BIRD features to deliberately **not** build |
| 4 | **[CURRENCY_AND_VAT_DECISION.md](CURRENCY_AND_VAT_DECISION.md)** | Dual USD/LBP and VAT design, rounding rules, and what it costs the schedule |
| 5 | [GENERAL_LEDGER_DECISION.md](GENERAL_LEDGER_DECISION.md) | Why the answer is margin reporting, not a general ledger |
| 6 | [CURRENT_SYSTEM_AUDIT.md](CURRENT_SYSTEM_AUDIT.md) | Domain-by-domain audit with file-level evidence |
| 7 | [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) | 89 features classified; what is absent; what was orphaned |
| 8 | [SYSTEM_DISCOVERY.md](SYSTEM_DISCOVERY.md) | Verified stack, structure, and a full request-to-UI trace |
| 9 | [RISK_REGISTER.md](RISK_REGISTER.md) | 37 risks with probability, impact, protection, and mitigation |
| 10 | [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) | 10 decisions already made (keep these) + 11 proposed |
| 11 | [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | 25 business invariants and the CI pipeline that must run them |
| 12 | [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | Four deployment scenarios, four separate verdicts |

---

## The phases

| Phase | Branch | Weeks | Budget | Focus |
|---|---|---|---:|---|
| [01 · Core Integrity](phases/phase-01-core-integrity/) | `develop` | 1–4 | 150–175 h | CI, restore drill, secrets, idempotency, cost prices, integrity reports |
| [02 · Operations](phases/phase-02-operations/) | `develop` | 5–9 | 170–200 h | Invoice, receipt, statement, atomic returns, payable due dates |
| [03 · Control & Intelligence](phases/phase-03-control-and-intelligence/) | `develop` | 10–13 | 140–165 h | Cost snapshots, expenses, **profit & margin**, valuation, financial dashboard |
| [04 · Production Hardening](phases/phase-04-production-hardening/) | `develop` | 14–16 | 110–130 h | E2E, concurrency, migration rehearsal, security, runbooks, UAT |

All phases continue sequentially on `develop`; no phase-specific branch is created.

Each phase folder contains:
- **PLAN.md** — the `develop` checkpoint prerequisite, then tasks with objective, existing implementation, problem, change, impact, tests, dependencies, acceptance criteria, effort, risk, and migration disclosure
- **PROMPTS.md** — small executable prompts to hand to Claude Code or Codex one at a time, each opening with a Git safety block
- **REVIEW.md** — the phase checkpoint gate: business correctness, database, backend, frontend, security, testing → **COMPLETE / COMPLETE WITH FOLLOW-UP / NOT COMPLETE**
- **SUMMARY.md** — durable evidence and verdict recorded before the next phase begins

---

## The 12 things that must not be rewritten

Recorded here because they are the project's accumulated value and are easy to damage by accident:

1. Derived balances (never store a balance column)
2. `Decimal(12,2)` money everywhere
3. Compare-and-set stock concurrency
4. Unique movement links preventing double-application
5. The five audit tables
6. Compensating-movement reversal (never edit or delete history)
7. The backup and restore system
8. In-memory access tokens (never `localStorage`)
9. The strict Electron CSP
10. Scanner session crypto
11. Pure domain modules with no ORM import
12. The `runFinancialTransaction` boundary helper

---

## Blocking questions — RESOLVED 2026-08-26

Both approved by the business owner. Design: **[CURRENCY_AND_VAT_DECISION.md](CURRENCY_AND_VAT_DECISION.md)** · decisions: ADR-19, ADR-20, ADR-21.

1. **Dual USD/LBP: APPROVED** (+80–120 h). Currency and rate stored per transaction, never re-derived. **ADR-02 derived balances survive untouched** — allocations stay in the obligation's currency, so no second financial source of truth is created.
2. **VAT: APPROVED**, default 11%, **not hardcoded** (+45–65 h). `TaxRate` + `TaxProfile` configuration; each finalized invoice line snapshots its rate and amount, so changing the configured rate cannot alter a historical invoice. Calculated per line; document VAT is the exact sum.

**Full General Ledger remains out of scope.** VAT reporting is a report over snapshotted line data.

### What this costs

Plan moves from 550–758 h to **675–943 h against ~672 h available**. Feasibility: **Realistic → AGGRESSIVE**. Funded by ~108–140 h of named descopes (MASTER_PLAN §10): product categories, cash flow view, audit log viewer, a reduced financial dashboard, liveness predicates, and trimmed E2E/performance scope. Five-month extension held in reserve — see R-42.

---

## Repository housekeeping

`develop` is the permanent upgrade integration branch. Old `feature/phase-N-*` names refer to the original build and should be removed only after their tips are verified as preserved. This planning workspace is versioned with the implementation so checkpoint evidence is auditable.

---

## Status

**Phase 1 implementation and review are recorded in its `SUMMARY.md`. Upgrade work continues only on `develop`; `main` remains the production/reference branch.**
