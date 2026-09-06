# PRODUCTION READINESS

Four distinct questions, four distinct answers. "It builds and the tests pass" is not one of them.

Baseline: v2.0.0 (`ac6ae9f`) shipped and installed; working tree clean; `npx vitest run` → 2,181 passed, 10 skipped, exit 0.

---

## 1. Development / demo use — **READY**

| Criterion | Status |
|---|---|
| Builds and runs | ✔ |
| Tests pass | ✔ 2,181 |
| Typecheck / lint clean | ✔ (89 lint warnings, 0 errors) |
| Seed data | ✔ `backend/prisma/seed.ts` |
| Documented setup | ✔ README + `docs/setup/` |
| Realistic demo flow | ✔ every module reachable |

**Verdict: READY.** No conditions. The feature set demos well — the dashboard, the scanner, the pricing engine, and the label printing are all genuinely impressive to show.

---

## 2. Single-branch real-business use — **READY WITH CONDITIONS**

This is the current deployment. It is running a real business today, so the honest question is not "may it be used" but "what must be true for it to keep being used safely."

**Already true, and load-bearing:**
- Balances cannot drift (derived, never stored).
- Stock cannot silently drift (CAS on every path, `@unique` links, reconciliation report).
- Money is exact (`Decimal(12,2)`, zero float columns).
- History cannot be quietly rewritten (five audit tables, void-not-compensate-not-delete).
- Backups run, are checksummed, and are verified readable.
- Migrations apply behind a mandatory verified backup.

**Conditions — all must be met.** These are ordered by how much they matter.

| # | Condition | Risk | Effort |
|---|---|---|---|
| **C-1** | **Confirm backups leave the machine.** A verified backup on the same disk protects against corruption and mistakes, not drive failure, theft, fire, or ransomware. | R-15 | **1 hour** — configuration, not development |
| **C-2** | **Perform one timed restore drill on the real database.** Until this is done, the best safety feature in the system is a hypothesis. Record how long the business would be down. | R-12 / CP-7 | 4 h |
| **C-3** | **Fail startup when `JWT_SECRET` is missing.** Remove the hardcoded fallback. | R-17 / CP-1 | 1–2 h |
| **C-4** | **Turn on CI running the DB integration tests.** The tests exist; nothing runs them. | R-13 / CP-4 | 8–12 h |
| **C-5** | **Add idempotency to purchases and receivings.** Prevents duplicate payables and duplicate stock increases. | R-05 / CP-3 | 8–12 h |
| **C-6** | **Re-check user status in `requireAuth`.** A revoked employee currently keeps a working session. | R-18 / CP-5 | 4 h |
| **C-7** | **Update cost price from receipts.** The shop is silently under-pricing on stale costs, with no way to detect it. | R-06 / CP-8 | 8–12 h |
| **C-8** | **Run the inventory reconciliation report and confirm it is clean.** Establishes a known-good baseline before four months of changes. | R-09 | 1 h |
| **C-9** | **Do all upgrade work on `develop`, with reviewed and pushed phase checkpoints.** `main` remains unchanged until the explicitly approved final merge. | R-29, R-13 | ongoing |

**C-1, C-2, and C-8 total roughly six hours and are pure verification.** They should be done this week, before any code is written.

**Verdict: READY WITH CONDITIONS.** The foundation is sound enough to keep trading on. What is missing is not correctness — it is *assurance*: proof that recovery works and automation that catches regressions.

---

## 3. Two-branch real-business use — **NOT READY**

Not "needs work." **The capability does not exist.**

| Requirement | Status |
|---|---|
| Branch model | ✘ — no `Branch` table. `branchId` is a nullable column with no FK, no filtering, no UI |
| Per-branch stock | ✘ — one global `stockQuantity`; no warehouse concept (`warehouse` matches only a lucide icon) |
| Branch transfers | ✘ |
| Branch-scoped permissions | ✘ — only ADMIN/EMPLOYEE |
| Branch-scoped reports | ✘ |
| Shared or synchronised data | ✘ — loopback-bound local PostgreSQL |
| Network architecture | ✘ — `HOST` defaults to `127.0.0.1` |

**What two branches would actually require.** Not a feature — a re-architecture:

1. A real `Branch` model with foreign keys on every business table.
2. Per-branch stock: `stockQuantity` becomes a `(product, branch)` relation, which touches **every** inventory query, the CAS logic, receiving, fulfillment, and reconciliation.
3. Branch transfer documents with paired movements that conserve total stock.
4. Branch-scoped authorization on every endpoint.
5. Either a hosted database with authenticated remote access — which immediately promotes CP-1 and R-19 (no login rate limiting) from low to critical — or a replication/sync design, which is materially harder than it sounds when two tills can allocate the same stock.
6. Branch dimensions on all 16 reports and 7 dashboard analytics domains.

**Estimate: 250–400 hours.** More than half the four-month budget, for a capability with no confirmed business need.

**Verdict: NOT READY.** Do not attempt this in the four months unless a second location is **already committed with a date**. If it is not, **delete the dead `branchId` columns** — leaving them implies isolation the system does not have, which is worse than having nothing.

---

## 4. Commercial deployment to another client — **NOT READY**

| Requirement | Status |
|---|---|
| Multi-tenancy | ✘ — single-tenant by design |
| Configurable business rules | ✘ — pricing presets are configurable; workflows, statuses, and terminology are hardcoded |
| Branding / white-label | ✘ — logo and name embedded |
| Installer for a non-technical operator | ~ `Setup-HomeConnect.ps1` exists but assumes local PostgreSQL and some competence |
| Licensing / activation | ✘ |
| Support tooling | ✔ **genuinely good** — redacted diagnostics export, preflight checks, error log, in-app maintenance |
| Update distribution | ~ `latest.yml` exists; no evidence of a tested auto-update channel |
| User documentation | ~ developer docs are strong; end-user docs are thin |
| Onboarding for a different business | ✘ — the domain model is **specific to this shop**: service jobs with company hand-off, prepaid layaway, this pricing formula, this Arabic/English pairing |
| Proven at scale | ✘ — one site, ~1 month |
| Data isolation guarantees | ✘ — untested; every user sees everything by design |
| SLA / support capacity | ✘ — one developer |

**The deeper issue is fit, not features.** Home Connect's greatest strength is that every screen exists because *this* business needed it. That is precisely what makes it hard to sell: a different appliance shop would want different service statuses; a shop with a counter till would need a real POS; a VAT-registered business would need VAT; a Lebanese business would very likely need USD/LBP.

**Genuinely commercialising this means either** narrowing to one vertical and generalising within it (6–12 months beyond this plan), **or** treating each deployment as a bespoke fork — which does not scale past two or three clients with one developer.

**Verdict: NOT READY**, and it should not be a goal of these four months. Revisit only after the system has run a full year at one site with CI, rehearsed restores, and complete financial reporting.

---

## Summary

| Scenario | Verdict | Blocking issue |
|---|---|---|
| Development / demo | **READY** | — |
| Single branch, real business | **READY WITH CONDITIONS** | 8 conditions; ~6 h of them are pure verification |
| Two branches | **NOT READY** | Capability absent — 250–400 h re-architecture |
| Commercial to another client | **NOT READY** | Single-tenant, business-specific by design |

---

## What "production ready" will mean at the end of four months

Achievable, and worth committing to:

**Throughout — the release-safety property**

`main` remains installable at every point in the four months because no upgrade work lands on it. The business always has a known-good production/reference version while cumulative work is tested on `develop`. Every phase gets a reviewed, summarized, green-CI checkpoint on `develop`; only the final four-phase result may be considered for an explicitly approved `develop → main` merge ([GIT_WORKFLOW.md](GIT_WORKFLOW.md)).

**Deployment happens from `main` only after the final approved merge, never from unfinished `develop`.**

**By end of Phase 1**
- CI green on every commit, including DB integration tests.
- Phase 1 review and `SUMMARY.md` checkpoint committed and pushed to `develop`; `main` unchanged.
- A timed, documented restore drill completed on real data.
- Backups verified to leave the machine.
- No hardcoded secret fallback.
- Idempotency on every financial write.
- Cost prices current.

**By end of Phase 2**
- Printable sales invoice, payment receipt, and customer statement, **each showing the VAT breakdown in the transaction currency**.
- USD and LBP transactable at the counter.
- Atomic return/refund flow.
- Supplier payable due dates and aging.

**By end of Phase 3**
- The owner can see profit, margin, and stock value.
- Operating expenses recorded.
- Customer credit limits enforced.

**By end of Phase 4**
- Five E2E journeys green.
- Every migration rehearsed against restored production data.
- Security items closed.
- A restore runbook another person could follow.
- Real-business UAT signed off.

At that point the single-branch verdict becomes **READY** without conditions, and the honest answer to "should we use this instead of BIRD?" becomes yes on the evidence rather than on preference.
