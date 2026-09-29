# MASTER PLAN

Four months of work to make Home Connect a clearly better system for this business than BIRD.

Baseline: commit `ac6ae9f` (v2.0.0), working tree clean, `npx vitest run` → 2,181 passed / 10 skipped / exit 0, verified 2026-08-25.

---

## 1. Executive assessment

Home Connect is a **production-capable single-site ERP with a transactional core built well above the standard of its finished feature set.**

The engine is better than the car. Balances are **derived, never stored** — so balance drift, the most common failure mode in small-business ERPs, is structurally impossible rather than merely mitigated. Stock uses **compare-and-set on every path** with `@unique` movement links that make double-application unrepresentable, plus a reconciliation report that **proves its own arithmetic**. Money is `Decimal(12,2)` throughout with zero float columns. Five purpose-built audit tables record who changed what, when, and why. Backups are checksummed, verified readable, and restored behind an automatic pre-restore safety backup.

What is missing is **surface, not foundation**: documents to hand people, profit figures to decide with, and a handful of operational flows that stop short of complete. That is the good problem to have — adding surface to a sound core is ordinary, predictable work.

The decisive gap is not a feature. **Home Connect cannot tell the owner whether the business made money.** There is no COGS, no margin, no profit report — while the raw data (cost, price, quantity, fulfillment date) already sits in the database, unused.

---

## 2. Current score

| | |
|---|---:|
| Operational ERP | **6.8 / 10** |
| Technical quality | **8.0 / 10** |
| Production readiness | **6.5 / 10** |
| **Overall** | **7.1 / 10** |

Full per-area breakdown with justifications: `HOME_CONNECT_RATING.md`.

**Maturity: Production-capable with limitations.** It is running a real business today on a foundation that deserves that trust — but with no CI, integration tests skipped by default, an unrehearsed restore, and no profit visibility.

---

## 3. Strongest existing features — do not rewrite these

1. **Derived balances** (9/10) — drift is impossible by construction
2. **Money precision** (10/10) — `Decimal(12,2)`, zero float columns
3. **Inventory concurrency and integrity** (9/10) — CAS everywhere, self-reconciling
4. **Audit trails** (9/10) — five tables, mandatory reasons, before/after, actor snapshots
5. **Backup and restore** (8.5/10) — verified, checksummed, safety-backed
6. **Immutability discipline** (9/10) — compensating movements, never edits
7. **Schema comments** (10/10) — they document *rejected* alternatives and why
8. **Session security** (8.5/10) — in-memory token, never `localStorage`
9. **Electron hardening** (9/10) — strict CSP, no `unsafe-eval`
10. **Scanner security** (9/10) — hashed tokens, `timingSafeEqual`, TTLs, session caps
11. **Domain purity** (8.5/10) — pure logic with no ORM import
12. **Service/repair jobs, prepaid layaway, installment plans, and the pricing formula engine** — bespoke domain assets BIRD has no equivalent for

---

## 4. Weakest areas

1. **No profit / margin / COGS** — the biggest gap in the audit
2. **No printed documents** — no invoice, no receipt, no statement
3. **Returns** (3.0/10) — a 3-step manual dance, no refund concept
4. **POS** (3.0/10) — no cart, tender, drawer, or receipt
5. **Testing infrastructure** (6.0/10) — DB tests skipped, no E2E, **no CI**
6. **Multi-branch** (0.5/10) — dead `branchId` scaffolding implying a capability that does not exist
7. **Multi-currency** (0/10) — hardcoded `'USD'`
8. **Permissions** (5.5/10) — two roles only
9. **Supplier payables** — no due dates, no aging
10. **Cost prices** — never updated from receipts

---

## 5. Critical risks

Detail in `RISK_REGISTER.md`. Ranked by expected loss:

| # | Risk | P | Impact |
|---|---|---|---|
| 1 | **AI-generated regression** (R-13) — no CI, DB tests skipped | High | High |
| 2 | **Unrehearsed restore; backups possibly on the same disk** (R-12/R-15) | Medium | **Critical** |
| 3 | **Stale cost prices** (R-06) — already happening, silently | High | Med-High |
| 4 | **Duplicate purchases/receivings** (R-05) — no idempotency | Medium | High |
| 5 | **JWT fallback secret** (R-17) | Low | **Critical** |

All five are closed in Phase 1.

---

## 6. Comparison with BIRD

Detail in `BIRD_GAP_ANALYSIS.md`.

**Home Connect is already better at:** balance correctness, inventory correctness, auditability, backup/restore, service jobs, prepaid layaway, installment plans, the pricing engine, dashboard and alerts, barcode workflow, bilingual UI, and **fit** — every screen exists because this business needed it.

**BIRD is still better at:** printed documents, profit and accounting, dual currency, VAT, operational maturity across many businesses, product categories, and branches.

**The asymmetry that decides the strategy:** Home Connect's advantages are structural and took a year to build. BIRD's advantages are surface and are well-understood work. **Closing BIRD's lead is a four-month project; replicating Home Connect's lead is not.**

---

## 7. Target product scope

> A single-site ERP for an appliance business that sells for cash and credit, repairs what it sells, buys on supplier credit, and needs to know — reliably and provably — what it owns, what it is owed, what it owes, and whether it is making money.

Everything in the plan serves that sentence.

---

## 8. Explicitly excluded

| Excluded | Why |
|---|---|
| Chart of accounts, journal vouchers, double-entry, trial balance, P&L, balance sheet | 400–600 h; duplicates the external accountant; see `GENERAL_LEDGER_DECISION.md` |
| Warehouse management | One stockroom |
| Multi-branch | 250–400 h; no confirmed second location. **Delete the dead columns instead** |
| Payroll | Two staff |
| Units of measure, variants, serial numbers | Appliances sell as pieces |
| Multiple selling types / price levels | The pricing formula engine solves this better |
| Loyalty, salesman commission, quotations, manufacturing | No business need |
| A full POS till | **Confirm with the owner** — an appliance sale involving discussion, delivery, and credit is not a till transaction |
| Multi-tenant / commercial deployment | Single-tenant by design; revisit after a year of proven operation |

---

## 9. The four phases

All four phases are developed sequentially on `develop`. Each phase closes with tests, review, a `SUMMARY.md` checkpoint, coherent commits, and a push. `main` is untouched until the final cumulative release gate and explicit owner approval. Full rules in [GIT_WORKFLOW.md](GIT_WORKFLOW.md).

| Phase | Branch | Weeks | Budget | Focus |
|---|---|---|---:|---|
| **1 · Core Integrity** | `develop` | 1–4 | 150–175 h | CI, restore drill, secrets, idempotency, cost prices, integrity reports |
| **2 · Operations** | `develop` | 5–9 | 170–200 h | Invoice, receipt, statement, atomic returns, payable due dates, credit limits |
| **3 · Control & Intelligence** | `develop` | 10–13 | 140–165 h | Cost snapshots, expenses, **profit & margin**, valuation, financial dashboard |
| **4 · Production Hardening** | `develop` | 14–16 | 110–130 h | E2E, concurrency, migration rehearsal, security closure, runbooks, UAT |

### Phase 1 checkpoint — 2026-09-08

Phase 1 engineering is **COMPLETE WITH DEPLOYMENT FOLLOW-UP**. The VAT retail default, schema/client migration path, manual-versus-automatic pricing behavior, currency-correct supplier costing, production JWT provisioning, and authorization regression guard are settled and tested. Live read-only financial and inventory integrity reports are clean.

Phase 2 coding may begin on `develop` only after the owner reviews the Phase 1 report. This does **not** authorize production deployment. Before any upgrade reaches the business database, apply the two pending migrations through the normal verified-backup release procedure and close C4 (legacy-screen owner sign-off), C5 (verified off-machine backup), and C6 (timed isolated restore of real data with post-restore integrity reports and startup/RTO evidence). `main` remains unchanged.

### Branch discipline and checkpoints

```
main (stable and unchanged)
└── develop: Phase 1 → checkpoint → Phase 2 → checkpoint → Phase 3 → checkpoint → Phase 4 → final gate
```

**Phase N+1 continues on `develop` only after Phase N's review and summary are acceptable.** A `NOT COMPLETE` verdict blocks the next phase unless the owner explicitly changes the gate. Do not create phase-specific branches.

**`main` stays deployable throughout because it receives no upgrade work.** The business can install the existing production/reference state while cumulative work is validated on `develop`.

---

## 10. Hours

**Available:** 6 days x 7 h x 16 weeks = **672 h**

**Not all of that is productive coding.** Realistic allocation:

| Activity | Share | Hours |
|---|---:|---:|
| Implementation | 45% | ~300 |
| Investigation & tracing | 15% | ~100 |
| Testing & test writing | 15% | ~100 |
| Debugging & rework | 10% | ~67 |
| Review & business clarification | 8% | ~54 |
| Deployment & verification | 7% | ~47 |

### The four-month plan no longer fits without cuts

| | Hours |
|---|---:|
| Originally planned (Phases 1-4) | 550-758 |
| Dual currency (approved) | +80-120 |
| VAT (approved) | +45-65 |
| **New total** | **675-943** |
| **Available** | **~672** |

**Feasibility moves from Realistic to AGGRESSIVE.** Even the optimistic end exactly consumes the budget with zero slack — and Phase 1 touches live financial tables, where slack is what prevents mistakes.

### Approved response: descope (Option 1)

Cut **~108-140 h** of lower-value work, decided **now** rather than under pressure in week 14:

| Cut | Hours | Why this is the right thing to cut |
|---|---:|---|
| Phase 3 T7 — audit log viewer | 20-26 | The audit *data* is already captured; per-record views already exist. Only the cross-cutting screen is missing |
| Phase 2 T7 — product categories | 20-26 | Convenience, not correctness. Search already works well |
| Phase 3 T6 — cash flow view | 20-26 | Valuable, but profit and margin matter more and ship first |
| Phase 3 T5 — financial dashboard reduced to a KPI strip | ~12 | The reports carry the detail; the dashboard summarises |
| Phase 1 T11 — liveness predicates | 8-12 | Hygiene. Defer to Phase 5 |
| Phase 4 T1 — E2E: 5 journeys to 3 | ~12 | Already named as the Phase 4 descope |
| Phase 4 T5 — performance: spot checks, not systematic | ~6 | Already named |

Lands at roughly **567-803 h** against 672. Still tight at the top end — that is what the phase buffers absorb.

**Option 2 (extend to five months, ~840 h) is held in reserve.** If Phase 1 overruns its estimate by more than 20%, take it rather than compressing Phase 4 — Phase 4 is the proving phase, and compressing it removes the evidence the whole plan exists to produce. See R-42.

## 10a. Delivery overhead

Checkpoint documentation, CI, and review are not free. They are already inside the "Deployment & verification" (7%) and "Review & business clarification" (8%) allocations above, but named here so they are not treated as unbudgeted:

| Activity | Per phase | Total |
|---|---:|---:|
| `develop` synchronization and hygiene | ~1 h | ~4 h |
| Writing the phase summary/checkpoint | ~3 h | ~12 h |
| Reviewing the phase diff | ~4 h | ~16 h |
| CI iteration and checkpoint push | ~2 h | ~8 h |
| **Total** | **~10 h** | **~40 h** |

~40 hours of the ~672 available, or 6%. That is the price of never merging unreviewed changes into a system that holds the business's money — and given R-13 (AI-generated regression) is the highest-probability risk in the register, it is the cheapest insurance in the plan.

---

## 11. Dependencies

```
Phase 1 T1 (CI)  ──►  everything else
   │
   ├─ T2 backups ──► T3 restore drill ──► T9 drop legacy tables
   ├─ T7 idempotency ──► P2 T4 returns
   └─ T8 cost prices ──► P3 T1 cost snapshot ──► P3 T3 profit report
                                                      │
P2 T7 categories ─────────────────────────────────────┤
P2 T8 cash gap ──► P3 T6 cash flow                    │
P2 T5 supplier due dates ──► P3 T6                    │
P3 T2 expenses ───────────────────────────────────────┤
                                                      ▼
                                          P3 T5 financial dashboard
                                                      │
                                    Phases 1-3 ──► Phase 4 (all)
```

---

## 12. Critical path

**CI → cost prices → cost snapshot → profit report → financial dashboard → UAT**

This chain is the plan's spine. Everything on it must ship on schedule; everything off it can be descoped.

**The most fragile link is `cost prices → cost snapshot`.** A snapshot of a stale cost is a precise record of a wrong number — so Phase 1 T8 must genuinely work before Phase 3 T1 begins, and Phase 3 T1 must ship early in its phase because **every day without it is another day of unrecoverable cost history.**

---

## 13. Production-readiness targets

| Scenario | Now | Target |
|---|---|---|
| Development / demo | READY | READY |
| **Single branch, real business** | READY WITH CONDITIONS | **READY** |
| Two branches | NOT READY | **NOT READY** (out of scope) |
| Commercial to another client | NOT READY | **NOT READY** (out of scope) |

---

## 14. Blocking questions — RESOLVED 2026-08-26

Both schema-level questions were answered by the business owner. Full design in [CURRENCY_AND_VAT_DECISION.md](CURRENCY_AND_VAT_DECISION.md); decisions recorded as ADR-19, ADR-20, ADR-21.

### Q1 — Dual USD/LBP currency: **APPROVED**

Both are first-class transaction currencies. Currency and the rate used are stored on each transaction and never re-derived. Historical transactions are immutable. Deterministic rounding: USD 2 dp, LBP 0 dp. Base/reporting currency is USD.

**Key property preserved:** allocations stay denominated in the obligation's currency, so **ADR-02 (derived balances) is untouched** — no second financial source of truth is created, exactly as the owner required.

**Effort: 80–120 h**, split Phase 1 (45–60) / Phase 2 (25–35) / Phase 3 (10–25).

### Q2 — VAT: **APPROVED**, default 11%, not hardcoded

`TaxRate` + `TaxProfile` configuration; each finalized invoice line snapshots `taxRateSnapshot`, `taxCodeSnapshot`, and `vatAmount`. Changing the configured rate cannot alter a historical invoice. VAT is calculated **per line**, rounded per line, and document VAT is the exact sum — so a printed invoice's visible numbers always add up (ADR-20).

Covers inclusive and exclusive pricing, taxable/zero-rated/exempt products, sales and input VAT, refund reversal from the snapshot, and the USD/LBP interaction.

**Full General Ledger remains out of scope.** VAT reporting is a report over snapshotted line data — `GENERAL_LEDGER_DECISION.md` stands unchanged.

**Effort: 45–65 h**, split Phase 1 (20–28) / Phase 2 (18–25) / Phase 3 (7–12).

### Git housekeeping

- **Keep `develop`** as the sole upgrade integration branch. Remove old `feature/phase-N-*` pointers only after verifying their commits are preserved.
- **Track `.claude/home-connect-erp-upgrade/`** so plans, reviews, summaries, and evidence are versioned with the work.

### Secondary questions — answer before their phase

- **Does the shop want a counter till (real POS)?** If yes, that is a phase of its own and something else must go.
- **Is a second branch committed with a date?** If no, delete the `branchId` columns (Phase 4 T4).
- **Returns:** partial returns? cash refund or store credit? condition-dependent restocking? (Phase 2 T4)
- **Credit limit:** hard block or admin-overridable warning? (Phase 2 T6)
- **Expense categories:** what does the business actually spend on? (Phase 3 T2)
- **Product categories:** grouped by type, room, or supplier? (Phase 2 T7)

---

## 15. Definition of Done

The four months are complete when **all** of the following are true, with evidence:

**Process**
- All four phase checkpoints committed and pushed to `develop`; one final cumulative `develop → main` merge reviewed and explicitly approved
- No upgrade commit landed directly on `main`
- Every phase `REVIEW.md` and `SUMMARY.md` reached **COMPLETE** or **COMPLETE WITH FOLLOW-UP**
- Every schema change documented with migration impact, rollback strategy, and validation check
- Stale `feature/phase-N-*` branches deleted

**Correctness**
- All three integrity reports (inventory, customer financial, supplier financial) clean on production data
- Every unit of money appears exactly once in reporting — not zero times, not twice
- Balances remain derived; no cached balance column exists
- Stock arithmetic still provable via reconciliation

**Capability**
- Invoice, receipt, and statement print correctly, including Arabic
- A return is one reviewed action leaving stock and money both correct
- The owner can see profit, margin, expenses, cash movement, and stock value
- Supplier payables have due dates and aging
- Cost prices are current

**Assurance**
- CI green on every commit, running **all** tests including DB integration, 0 skipped
- Five (or three) E2E journeys green in CI
- Concurrency invariants proven, not assumed
- Every migration rehearsed against restored production data, with durations recorded

**Recoverability**
- A restore performed on real data, timed, and documented
- Backups confirmed to leave the machine
- Runbooks a person unfamiliar with the codebase could follow

**Security**
- CP-1 through CP-8 all closed
- No hardcoded secret; revoked sessions end; every mutating route authorized

**Validation**
- Real users have used it for two weeks
- Every critical and high UAT issue resolved
- **The owner finds the profit figure credible**

**Score**
- Re-scored overall **≥ 7.8**, assessed as strictly as the original

---

## 16. The decisive question

> **If BIRD were switched off tomorrow and Home Connect were the only system, would that be a responsible decision — and could you show the evidence?**

At the original baseline: **no** — no profit visibility, no printed documents, an unrehearsed restore, and no CI.

At the 2026-09-08 Phase 1 checkpoint, CI and the correctness foundations are in place, but the answer remains **no for production replacement** until the off-machine backup, real-data restore/RTO rehearsal, production migration, later-phase documents/profit work, and final UAT are complete.

After four months: **yes**, if the Definition of Done is met in full.

**That is the point of the plan. Not more features — enough evidence.**
