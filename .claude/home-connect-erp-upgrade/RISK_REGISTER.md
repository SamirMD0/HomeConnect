# RISK REGISTER

Probability and impact are assessed for **this** deployment: one shop, one PC, loopback-bound, one or two users, one developer, no CI.

**Probability** — Low (<10% per year) · Medium (10–40%) · High (>40%)
**Impact** — Low (annoyance) · Medium (hours of manual repair) · High (wrong money/stock reaching a customer) · Critical (unrecoverable data loss or breach)

---

## Financial correctness

### R-01 · Wrong customer debt
- **Probability:** **Low** · **Impact:** High
- **Current protection:** Balances **derived** from non-voided allocations, never stored ([balances.ts:93-107](backend/src/features/financial/domain/balances.ts#L93)). `Decimal(12,2)` everywhere. Allocation conservation enforced in `payment-allocation.ts`. Void-not-delete. 9-action correction audit. Extensive pure-domain tests.
- **Required mitigation:** None structural. Add a reconciliation report proving Σ(debts) − Σ(non-voided allocations) = reported outstanding, as a standing check.
- **Test:** `INV-01` in `TESTING_STRATEGY.md`.

### R-02 · Wrong supplier debt
- **Probability:** **Low** · **Impact:** High
- **Current protection:** Same derived-balance discipline via transaction directions ([suppliers.repository.ts:41-52](backend/src/features/suppliers/suppliers/suppliers.repository.ts#L41)). Remove/restore is a status flag.
- **Required mitigation:** None structural. Add supplier `dueDate` so payables are actionable (Phase 2).
- **Test:** `INV-02`.

### R-03 · Cash on sales orders missing from financial reports *(CP-2)*
- **Probability:** **Certain — this is current behaviour** · **Impact:** Medium-High
- **Current protection:** None. `SalesOrder.paidAmount` never becomes a `Payment`; `customer-financial-summary.repository.ts` has zero references to sales orders. `assertNoFinancialLink` prevents *disagreement*, not *omission*.
- **Required mitigation:** **First measure it against real data** — how much money sits in `SalesOrder.paidAmount` with no corresponding `Payment`? Then either create a `Payment` at counter-payment time, or include sales-order cash in collected metrics. Decide with the owner.
- **Test:** `INV-09`.

### R-04 · Duplicate payments
- **Probability:** **Low** · **Impact:** High
- **Current protection:** `Payment.idempotencyKey @unique` + SHA-256 fingerprint replay detection + `Button` disabled on `isLoading`.
- **Required mitigation:** None. **This is the pattern to copy for R-05.**
- **Test:** `INV-07`.

### R-05 · Duplicate purchase invoices or receivings *(CP-3)*
- **Probability:** **Medium** · **Impact:** High
- **Current protection:** UI double-click guard only. Duplicate-receipt *warning* on purchases (deliberately not a constraint). **No idempotency key on either endpoint.**
- **Required mitigation:** Extend the existing payment idempotency pattern to `POST /suppliers/:id/purchases` and `POST /inventory/receivings`. Consequence today is a duplicate payable or a **duplicate stock increase**.
- **Test:** `INV-08`.

### R-06 · Cost prices go stale *(CP-8)*
- **Probability:** **High — this is current behaviour** · **Impact:** Medium-High
- **Current protection:** None. `SupplierPurchaseLine.unitPrice` records what was paid; `Product.costPrice` is never updated from it.
- **Required mitigation:** Update `costPrice` on receipt (with an audit entry), or surface a "cost has changed" review queue. Fails silently — the shop under-prices with no error and no audit entry, and cannot currently detect it because margin reporting does not exist.
- **Test:** `INV-10`.

### R-07 · Rounding errors
- **Probability:** **Very Low** · **Impact:** Medium
- **Current protection:** `Decimal(12,2)` in every money column with **zero float money columns repo-wide**; `money.ts` rejects >2 decimal places and requires explicit rounding modes; `installment-schedule.ts` distributes remainders deterministically.
- **Required mitigation:** None. This is a solved problem here.
- **Test:** `INV-11` (already covered by `money.test.ts`).

### R-08 · Currency conversion errors
- **Probability:** **Medium** (was N/A) · **Impact:** **Critical**
- **Status: ACTIVE from 2026-08-26** — dual USD/LBP approved, so this moves from hypothetical to a live risk for the whole plan.
- **Current protection:** None yet. The design in `CURRENCY_AND_VAT_DECISION.md` and ADR-19 is the mitigation.
- **Required mitigation:** Rate snapshotted on each transaction, never looked up at read time. Allocations denominated in the obligation's currency so ADR-02 is untouched. Deterministic per-currency rounding (USD 2 dp, LBP 0 dp). All aggregation on `baseAmount` — never in LBP, which would overflow `MAX_SCHEMA_MONEY` at ~$111k equivalent. Append-only `ExchangeRate`; corrections add rows, never edit.
- **Test:** `INV-16`, `INV-17`, `INV-18`, `INV-19`, `INV-25`.

### R-38 · Historical invoices change when the VAT rate changes
- **Probability:** **Medium** if built naively · **Impact:** **Critical**
- **Why it matters:** Lebanese VAT rates change. If an invoice resolves its rate from current configuration, every historical invoice silently restates — corrupting the audit trail, the VAT return, and any refund computed from it. The owner identified this risk directly.
- **Current protection:** None — VAT does not exist yet.
- **Required mitigation:** `TaxRate` + `TaxProfile` configuration, with `taxRateSnapshot`, `taxCodeSnapshot`, and `vatAmount` written onto each finalized line and **never recomputed** (ADR-20). No historical invoice may read `TaxRate`.
- **Test:** `INV-20` (rate change does not alter history), `INV-23` (refund reverses the VAT actually charged).

### R-39 · VAT rounding discrepancies on printed invoices
- **Probability:** **Medium** · **Impact:** Medium-High
- **Why it matters:** If VAT is rounded at document level from an unrounded line sum, the visible line amounts on a printed invoice do not add up to the printed total. A customer checking the arithmetic finds it wrong — a trust problem, not just a cosmetic one.
- **Required mitigation:** VAT computed and rounded **per line**, document VAT is the exact sum of rounded line amounts, document total is never independently rounded (ADR-20 Decision 3). VAT-inclusive pricing derives VAT by subtraction so the quoted price is exact by construction.
- **Test:** `INV-21`, `INV-24`.

### R-40 · Currency and VAT interact to produce unexplained discrepancies
- **Probability:** **Medium-High** if not designed for · **Impact:** High
- **Why it matters:** At ~90,000 LBP/USD, one cent of LBP rounding becomes a visible USD discrepancy. Back-computing base VAT from a converted total produces errors nobody can trace.
- **Required mitigation:** Convert `baseSubtotal`, `baseVatAmount`, and `baseTotalAmount` each **once**, and store all three. Never re-derive base VAT from a converted total (ADR-21).
- **Test:** `INV-22`.

### R-41 · Historical data falsified by the currency/VAT backfill
- **Probability:** **Medium** · **Impact:** **Critical**
- **Why it matters:** The migration stamps every existing row `currency=USD, rate=1`. If it also stamped `taxRateSnapshot=11`, every pre-VAT sale would retroactively acquire VAT that was never charged — falsifying the record and misstating the first VAT return.
- **Required mitigation:** Existing lines get `taxRateSnapshot=0, vatAmount=0`. They were genuinely sold without VAT. Verified backup first; before/after totals compared; all three integrity reports clean after.
- **Test:** Migration rehearsal against restored production data (`INV-13`), plus the before/after aggregate comparison.

### R-42 · Scope overrun from currency plus VAT
- **Probability:** **High** · **Impact:** Medium-High
- **Why it matters:** Currency (80–120 h) plus VAT (45–65 h) takes the plan from 550–758 h to **675–943 h against ~672 h available**. The four months no longer fit without cuts, and Phase 1 touches live financial tables where schedule pressure is how mistakes happen.
- **Required mitigation:** The named descopes in `CURRENCY_AND_VAT_DECISION.md` Part D Option 1 (~108–140 h), decided **now** rather than under pressure in week 14. Option 2 (five months) held in reserve.
- **Validation:** Track actual against planned hours at each phase merge. If Phase 1 overruns by more than 20%, take Option 2 rather than compressing Phase 4.

---

## Inventory correctness

### R-09 · Inventory drift (stored quantity ≠ movement ledger)
- **Probability:** **Low** · **Impact:** High
- **Current protection:** Compare-and-set on **every** stock path with `count !== 1` → 409. `@unique` movement links make double-application unrepresentable. Product settings **cannot** write `stockQuantity` ([products.service.ts:584](backend/src/features/service/products/products.service.ts#L584)). A reconciliation report actively verifies the arithmetic.
- **Required mitigation:** None structural. **But:** run the reconciliation report on a schedule rather than on demand, and make the integration tests that prove CAS behaviour run in CI (R-13).
- **Test:** `INV-03`, `INV-04`.

### R-10 · Simultaneous checkout / race conditions
- **Probability:** **Low** (one till today) · **Impact:** High
- **Current protection:** CAS makes lost updates structurally impossible; the loser gets a clean 409 and the transaction aborts.
- **Required mitigation:** None to the design. **The 409 must surface as an intelligible message, not a raw error** — verify the UI path.
- **Test:** `INV-04` (concurrent deduction).

### R-11 · Partial state after a failed transaction
- **Probability:** **Low** · **Impact:** High
- **Current protection:** One `runFinancialTransaction` helper; `tx` threaded through repositories so nothing escapes the boundary.
- **Required mitigation:** **This is only directly proven by the skipped DB integration tests.** See R-13.
- **Test:** `INV-05`.

---

## Data safety and recovery

### R-12 · Backup or restore failure *(CP-7)*
- **Probability:** **Low** (backup) / **Medium** (restore, because unrehearsed) · **Impact:** **Critical**
- **Current protection:** Scheduled + manual backups, SHA-256 checksums, `pg_restore --list` readability verification, **automatic pre-restore safety backup**, app-wide write blocking during restore, admin password gate, post-restore verification, retention, import.
- **Required mitigation:** **Perform one timed restore drill on the real business database and document it.** The business PC now holds more data than the laptop, so restore duration on real volume is unknown. Until it is done, the project's best safety feature is a hypothesis.
- **Test:** `INV-12` — a documented manual drill, not an automated test.

### R-13 · AI-generated code regression
- **Probability:** **High** · **Impact:** High
- **Current protection:** 2,181 passing tests (verified), typecheck, lint. **But all 10 DB integration files are skipped by default, there is no E2E, and there is no CI.**
- **Required mitigation:** **This is the highest-probability risk in the register and it directly threatens R-01, R-09, and R-11.** (a) make integration tests run by default or in a `test:ci` script; (b) add CI running typecheck + lint + full tests including DB, on every commit; (c) every implementation prompt in this plan requires tracing existing behaviour before changing it.
- **Test:** the CI pipeline itself.

### R-14 · Migration failure
- **Probability:** **Low-Medium** · **Impact:** **Critical**
- **Current protection:** In-app runner behind a **mandatory verified backup**, append-only `RepairHistory`, `BLOCKED_NO_BACKUP` as an explicit outcome, `npm run rehearse:migrations`, per-release versioned repair SQL.
- **Required mitigation:** Rehearse every schema migration in this plan against a **restored copy of the real database** before it goes near production — not against a seeded dev database.
- **Test:** `INV-13`.

### R-15 · Database failure / disk loss
- **Probability:** Low-Medium · **Impact:** **Critical**
- **Current protection:** Local PostgreSQL, scheduled backups.
- **Required mitigation:** **Confirm backups leave the machine.** A verified backup on the same disk as the database protects against corruption and mistakes — not against drive failure, theft, fire, or ransomware. This is a configuration check, not development work, and it may be the highest value-per-hour item in the register.
- **Test:** `INV-12`.

### R-16 · Deletion of history
- **Probability:** **Very Low** · **Impact:** High
- **Current protection:** `onDelete: Restrict` almost everywhere; void-not-delete; compensating movements rather than edits; append-only ledgers; five audit tables.
- **Required mitigation:** None. Genuinely well-defended.

---

## Security

### R-17 · Forged admin token via the fallback JWT secret *(CP-1)*
- **Probability:** **Low** · **Impact:** **Critical**
- **Current protection:** `Setup-HomeConnect.ps1` generates a CSPRNG secret; loopback-only bind; preflight *reports* a missing secret — but as an admin endpoint, **not a startup gate**, so the failure is silent.
- **Required mitigation:** **Fail startup when `JWT_SECRET` is missing.** One-line change, ~1 hour with tests. Low probability *only* while every install goes through the setup script and the bind stays loopback — both procedural.

### R-18 · Revoked user retains a working session *(CP-5)*
- **Probability:** **Medium** · **Impact:** Medium-High
- **Current protection:** None — `requireAuth` verifies the signature only, never re-checking `isActive` or `deletedAt`.
- **Required mitigation:** Re-check user status in `requireAuth` (short-TTL cache to avoid a per-request query). Half a day.

### R-19 · Credential brute force
- **Probability:** Low · **Impact:** Medium
- **Current protection:** Per-account lockout (5 attempts / 15 min, persisted), bcrypt 12, loopback bind. **No HTTP rate limiting on login** — that exists only for scanner and maintenance routes.
- **Required mitigation:** Add rate limiting to `/auth/login` using the existing `rateLimit` helper. Low priority while loopback-bound.

### R-20 · Authorization bypass / privilege escalation
- **Probability:** Low · **Impact:** High
- **Current protection:** 49 `requireRole` sites plus five per-domain policy modules; step-up admin re-auth on sensitive actions with its own audit table.
- **Required mitigation:** Add a route-coverage test asserting every mutating route carries an explicit role check — so a new endpoint cannot ship unprotected by omission.
- **Test:** `INV-14`.

### R-21 · Branch data leak
- **Probability:** **N/A** · **Impact:** N/A
- **Current protection:** No branches exist. Single-tenant, single-site — every authenticated user is staff of one shop by design.
- **Required mitigation:** **Delete the dead `branchId` columns** rather than leave scaffolding implying isolation that does not exist. If branches ever become real, design isolation deliberately.

### R-22 · Orphaned transaction API abuse *(CP-6)*
- **Probability:** Low · **Impact:** Medium
- **Current protection:** Requires authentication. No UI reaches it.
- **Required mitigation:** Confirm the table is empty, then delete the module and model. Two hazards: writing money records invisible to every screen, and any future report joining `transactions` double-counting against `debts`.

### R-23 · SQL injection
- **Probability:** **Very Low** · **Impact:** Critical
- **Current protection:** Prisma parameterises everything. All `$queryRawUnsafe` is confined to the maintenance/migration runner operating on **developer-authored bundled SQL**, never user input. Zod validates every route.
- **Required mitigation:** None. Keep raw SQL out of request-driven paths.

### R-24 · XSS
- **Probability:** Very Low · **Impact:** High
- **Current protection:** React escaping; **strict production CSP with no `unsafe-eval` and no inline script**; no `dangerouslySetInnerHTML` found; tokens are in memory, never `localStorage`, so even a successful XSS cannot read a persisted token.
- **Required mitigation:** None.

---

## Operational

### R-25 · Printer failure
- **Probability:** Medium · **Impact:** **Low**
- **Current protection:** Printing is `window.print()`; PDF export is available as a fallback.
- **Required mitigation:** None. Note that printing is currently **labels only** — invoices and receipts do not exist to fail.

### R-26 · Network outage
- **Probability:** Low · **Impact:** **Very Low**
- **Current protection:** Entirely local; loopback-bound. **A network outage does not affect the ERP at all.** Only the LAN phone-scanner degrades, and PC scanning still works.
- **Required mitigation:** None. This is a genuine advantage of the desktop architecture.

### R-27 · Single-developer bus factor
- **Probability:** **Certain** · **Impact:** High
- **Current protection:** Good docs, exceptional schema comments, consistent conventions, high test coverage.
- **Required mitigation:** Keep this planning workspace current. Document the restore procedure and the release procedure as runbooks another person could follow.

### R-28 · Single point of hardware failure
- **Probability:** Medium · **Impact:** High
- **Current protection:** Backups.
- **Required mitigation:** Know the recovery path — how long to install Windows, PostgreSQL, HomeConnect, and restore. Tie to R-12 and R-15. **If the business PC dies on a Monday morning, how many hours until trading resumes?** That number should be known, not discovered.

---

## Development process and Git

These arise from *how* the four months are worked, not from the code as it stands. They are controlled by the `develop`-only workflow ([GIT_WORKFLOW.md](GIT_WORKFLOW.md)).

### R-29 · Implementation lands directly on `main`
- **Probability:** **Medium** (this was the default before the workflow existed) · **Impact:** **High**
- **Why it matters:** `main` is what the business installs from. An unreviewed change on it can reach the shop's PC without ever passing a review gate, and there is then no known-good branch to roll back to.
- **Mitigation:** Every code-changing prompt requires `git branch --show-current`, permits implementation only on `develop`, and forbids a new branch without explicit instruction. Consider a GitHub branch protection rule on `main` requiring a PR.
- **Validation:** The `main` tip remains unchanged for the duration of Phases 1–4.

### R-30 · `develop` checkpoint begins from stale remote state
- **Probability:** **Medium** · **Impact:** Medium
- **Why it matters:** Starting a phase without pulling `origin/develop` can omit another pushed checkpoint or create avoidable integration conflicts.
- **Mitigation:** Before each phase run `git checkout develop && git pull origin develop && git status`; do not proceed with unresolved changes.
- **Validation:** Local `develop` contains `origin/develop` and the prior phase's accepted summary commit.

### R-31 · Long-lived `develop` drifts from production hotfixes
- **Probability:** **Low** here · **Impact:** Medium
- **Why it matters:** `develop` lives for all four phases. A production hotfix on `main` must be deliberately integrated or the final merge could regress it.
- **Mitigation:** After an approved hotfix, merge `origin/main` into `develop` without rebasing shared history, then rerun `npm run test:ci`; rerun all integrity reports if money or stock changed.
- **Validation:** The next checkpoint summary records the hotfix integration and green validation.

### R-32 · Giant commits, or unrelated changes bundled together
- **Probability:** **Medium** · **Impact:** Medium
- **Why it matters:** A commit mixing a stock-logic change with a rename cannot be safely reverted — and stock and money changes are exactly the ones most likely to need reverting. It also makes the review that gates the merge far less effective.
- **Mitigation:** One logical change per commit. Schema migration and its dependent code together (they cannot revert independently). **No refactors bundled with financial or inventory changes.** Every implementation prompt ends by proposing a single focused commit message.
- **Validation:** Reviewing the phase commit-by-commit is coherent; no commit touches both a domain change and an unrelated cleanup.

### R-33 · Schema conflicts between phases
- **Probability:** **Low** (phases are sequential) · **Impact:** **High**
- **Why it matters:** Two branches adding Prisma migrations with overlapping timestamps, or both editing `schema.prisma`, produce a conflict that is easy to resolve *textually* and easy to get *semantically* wrong — leaving a migration history that does not match the schema.
- **Mitigation:** Sequential phases mean only one branch adds migrations at a time. **Never resolve a migration conflict by editing an already-applied migration file** — add a new one. Never `prisma migrate reset` to make a conflict go away.
- **Validation:** `npm run rehearse:migrations` against a restored production copy after any conflict resolution; `npx prisma validate`; the three integrity reports.

### R-34 · Unreviewed AI-generated changes merged
- **Probability:** **Medium-High** · **Impact:** **High**
- **Why it matters:** This is R-13 (AI-generated regression) arriving through the merge path. The volume of AI-assisted change over four months makes "it looked right in the diff" an insufficient standard for money and stock code.
- **Mitigation:** Mandatory PR per phase; CI green with **0 skipped**; the `REVIEW.md` gate completed with evidence rather than assertions; the three integrity reports run against real data before merge.
- **Validation:** Every merged PR carries a completed `REVIEW.md` verdict and a linked green CI run.

### R-35 · CI skipped, or merged while integration tests are disabled
- **Probability:** **Medium** · **Impact:** **High**
- **Why it matters:** The DB integration tests are the *only* thing proving the CAS concurrency, transaction rollback, and constraint guarantees this system's safety rests on. Merging with them skipped reproduces exactly the pre-plan state — while now *appearing* to be gated, which is worse than an honest absence.
- **Mitigation:** `npm run test:ci` sets all eight flags (and must provision the three phase-named databases three of them additionally require). **`REVIEW.md` lists "database integration tests were skipped without justification" as an explicit `NOT COMPLETE` condition.** The full test output, including the skipped count, is required in `SUMMARY.md`.
- **Validation:** PR shows `0 skipped`. A non-zero skip count blocks the merge.

### R-36 · Temporary branch removed before its commits are preserved
- **Probability:** Low · **Impact:** Medium
- **Why it matters:** A historical or temporary branch may be the only named pointer to useful commits.
- **Mitigation:** Confirm its tip is an ancestor of `develop` (or otherwise tagged) before safe deletion. Never force-delete unknown work.
- **Validation:** `git merge-base --is-ancestor <temporary-branch> develop` succeeds before deletion.

### R-37 · Review gates or summaries are not versioned
- **Probability:** Low after Phase 1 remediation · **Impact:** Low-Medium
- **Why it matters:** An untracked planning workspace makes the standards and checkpoint evidence invisible in Git history.
- **Mitigation:** Force-track `.claude/home-connect-erp-upgrade/`, including every `REVIEW.md`, `SUMMARY.md`, and evidence file, on `develop`.
- **Validation:** `git ls-files .claude/home-connect-erp-upgrade` includes the planning and checkpoint documents.

---

## Top five by expected loss

| Rank | Risk | Probability | Impact | Why it ranks here |
|---|---|---|---|---|
| **1** | **R-13** AI-generated regression | High | High | The only high-probability, high-impact risk. Undermines R-01, R-09, R-11 |
| **2** | **R-12/R-15** Unrehearsed restore, backups possibly on the same disk | Medium | Critical | The one failure the business cannot absorb |
| **3** | **R-06** Stale cost prices | High | Medium-High | Already happening, silently, with no way to detect it today |
| **4** | **R-05** Duplicate purchases/receivings | Medium | High | Known gap with a known fix already in the codebase |
| **5** | **R-17** JWT fallback secret | Low | Critical | Low cost to eliminate entirely; leaving it is not worth the residual |

**All five are addressed in Phase 1.**

**A note on R-13 and the Git workflow.** R-13 (AI-generated regression) is the highest-ranked risk here, and R-34/R-35 are the two ways it reaches production. The branch-and-PR workflow is not process for its own sake — it is the control that turns the top-ranked risk from "hope the developer remembers to run the tests" into "the merge is blocked until CI proves it." That is why C-9 in `PRODUCTION_READINESS.md` treats it as a standing condition of safe operation, not a preference.
