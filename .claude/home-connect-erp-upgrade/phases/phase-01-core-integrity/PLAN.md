# PHASE 1 — CORE INTEGRITY

**Weeks 1–4 · Budget 150–175 hours**

---

## Branch and checkpoint

```
Required branch:  develop
Baseline:         main at ac6ae9f (main remains untouched)
```

**Do not implement this phase directly on `main`.**

```bash
git checkout develop
git pull origin develop
git status
```

Do not create a phase-specific branch. Track the planning workspace with the implementation.

**CI bootstrapping.** T1 creates CI and is the first Phase 1 implementation commit. Once pushed, CI validates `develop`; before that, record manual validation in `SUMMARY.md`.

---

## Objective

Close every path by which money, debt, supplier balances, inventory, or payments could go wrong — and build the safety net that makes the next three months of AI-assisted change survivable.

## Governing principle

**The financial and inventory cores are already correct.** Derived balances, compare-and-set stock, exact decimals, and five audit tables are working and must not be rewritten. This phase adds *assurance* and closes *specific named gaps* — it does not redesign anything.

## Ordering rationale

T1 (CI) comes first because every later task touches money or stock. T2–T4 are verification, not development, and cost ~6 hours total for the largest risk reduction available.

---

## T1 · Continuous integration with database tests

**Objective.** Every commit automatically runs typecheck, lint, and the full test suite **including the DB integration tests**.

**Existing implementation.** 2,181 tests pass (verified). All 10 DB integration files are skipped behind **eight** env flags:

`RUN_FINANCIAL_DB_TESTS`, `RUN_INVENTORY_DB_TESTS`, `RUN_SALES_FULFILLMENT_DB_TESTS`, `RUN_SUPPLIER_PURCHASE_DB_TESTS`, `RUN_SUPPLIER_RECEIVING_DB_TESTS`, `RUN_PHASE4_DEBT_DB_TESTS`, `RUN_PHASE5_INSTALLMENT_DB_TESTS`, `RUN_PHASE6_CUSTOMER_SUMMARY_DB_TESTS`.

**The last three also assert on the database *name*** — `databaseName.includes('phase4')` and equivalents. That guard exists to stop a destructive suite ever pointing at a real database, which is sound; but it means setting the flag alone leaves those three files skipped. No `.github/`, no pipeline.

**Problem.** The tests that prove this system's core guarantees — CAS conflict aborts, transaction rollback, constraint enforcement under concurrency — **are written and never run.** Risk R-13 (AI regression) is the highest-probability high-impact risk in the register.

**Proposed change.** Add `.github/workflows/ci.yml` with a Postgres 16 service. Add a `test:ci` npm script setting all eight flags — via `cross-env` or equivalent, since the repo targets Windows where a bare `VAR=x cmd` prefix does not work in PowerShell. Do **not** remove the flags — they let a developer without a database run the fast suite, which is a good reason.

**The non-obvious part:** CI must also provision databases whose names satisfy the `phase4`/`phase5`/`phase6` guards, **or** relax those guards to something CI can satisfy while keeping the protection they provide. Decide this explicitly. **`test:ci` is not done until it reports 0 skipped** — reaching "all eight flags set" while three files still skip would give exactly the false confidence this task exists to remove.

**Why it matters.** Four months of AI-assisted work on a financial system with no automatic regression detection is the largest avoidable risk in this project.

**Files.** `.github/workflows/ci.yml` (new), `package.json`.

**DB impact.** None on production. CI provisions a throwaway database.
**Backend / Frontend impact.** None.
**Security impact.** None — no secret goes in CI; the throwaway DB uses a CI-local password.

**Tests required.** The pipeline is the deliverable. Verify it goes **red** on a deliberately broken test, then green when reverted. An unverified pipeline is worse than none.

**Dependencies.** None. **This is task one.**

**Acceptance criteria.**
- CI runs on push and PR.
- `npm run test:ci` executes all 266 files with **0 skipped**.
- A deliberately introduced failure turns CI red.
- Total runtime under 10 minutes.

**Effort.** 8–12 h · **Risk.** Low

---

## T2 · Verify backups leave the machine

**Objective.** Confirm — with evidence — that a copy of the database exists off the business PC.

**Existing implementation.** Excellent backup system: scheduled, checksummed, readability-verified, retention-managed. Destination is configurable via backup settings.

**Problem.** **Unknown whether the configured destination is on the same physical disk as the database.** If so, backups protect against corruption and mistakes but not drive failure, theft, fire, or ransomware — the failures that end businesses.

**Proposed change.** Inspect the live backup settings. If the destination is local-only, configure a second destination (external drive, network share, or cloud sync folder) and verify a file actually arrives.

**Why it matters.** Risk R-15. **Possibly the highest value-per-hour item in the entire plan.**

**Files.** Likely none — configuration. If the settings model cannot express a second destination, that is a small backend change to scope here.

**Tests required.** Manual verification: trigger a backup, confirm the file exists off-machine, verify its checksum there.

**Dependencies.** None.

**Acceptance criteria.** A verified backup exists on separate physical media, and the operator knows how it gets there.

**Effort.** 1–3 h · **Risk.** Low

---

## T3 · Rehearse a real restore

**Objective.** Restore the real business database and know how long the business would be down.

**Existing implementation.** Full restore with pre-restore safety backup, admin gate, write blocking, post-restore verification. Code-tested.

**Problem.** **Never performed on the real database at real data volume.** The business PC now carries more data than the laptop, so restore duration is unknown. An untested restore is a hypothesis.

**Proposed change.** On a non-production machine, restore a current production backup. Time it. Then run the inventory reconciliation report and spot-check customer balances against the source. Write the result up as a runbook.

**Why it matters.** Risk R-12 / CP-7. Converts the project's best safety feature from believed to known.

**Files.** `docs/setup/RESTORE_RUNBOOK.md` (new).

**Tests required.** INV-12 — a documented manual drill.

**Dependencies.** T2 (need an accessible backup).

**Acceptance criteria.**
- A restore completed on real data, duration recorded.
- Reconciliation clean on the restored copy.
- A runbook a second person could follow.

**Effort.** 4–6 h · **Risk.** Low (performed off production)

---

## T4 · Baseline inventory reconciliation

**Objective.** Prove stock arithmetic is currently sound, before four months of change.

**Existing implementation.** The Receiving Reconciliation report already verifies `ledgerSum === stockQuantity === lastQuantityAfter`.

**Problem.** No recorded evidence it has been run against all products recently.

**Proposed change.** Run it. Investigate any discrepancy. Record the clean baseline with a date.

**Why it matters.** Without a known-good starting point, a discrepancy found in month three cannot be attributed. **This is the control against which all later inventory work is judged.**

**Files.** None — a report run and a recorded result.

**Dependencies.** None.

**Acceptance criteria.** Reconciliation clean across all tracked products, or every discrepancy explained and resolved.

**Effort.** 1–2 h · **Risk.** None

---

## T5 · Fail startup on a missing JWT secret

**Objective.** Make it impossible to run on the hardcoded fallback secret.

**Existing implementation.** [auth.middleware.ts:5](backend/src/middleware/auth.middleware.ts#L5) and [auth.service.ts:7](backend/src/services/auth.service.ts#L7):
```ts
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
```
`preflight.checks.ts` lists it as required but preflight is an admin API endpoint, **not a startup gate**.

**Problem.** CP-1 / R-17. A `production.env` missing the key boots on a secret published in the source. Anyone reaching the port can forge an admin token. The failure is silent.

**Proposed change.** A shared `requireEnv('JWT_SECRET')` that throws at module load with a message pointing at `Setup-HomeConnect.ps1`. `startup-failure-messages.ts` **already has a matcher for this** — the plumbing exists.

**Why it matters.** The current mitigation is procedural (the setup script generates one); the defect is structural.

**Files.** `backend/src/middleware/auth.middleware.ts`, `backend/src/services/auth.service.ts`, `backend/src/lib/env.ts` (new), `desktop/src/startup-failure-messages.ts` (verify).

**Security impact.** Directly closes a HIGH finding.

**Tests required.** Missing var → throws with the actionable message. Present var → normal boot. Verify the Electron startup monitor surfaces it legibly.

**Dependencies.** T1.

**Acceptance criteria.** Server refuses to start without the secret; the operator sees an actionable message, not a stack trace; every test still passes.

**Effort.** 2–4 h · **Risk.** Low — **must verify the installed production config actually has the key before shipping.**

---

## T6 · Re-check user status on every request

**Objective.** Deactivating an employee ends their session.

**Existing implementation.** [auth.middleware.ts:19-35](backend/src/middleware/auth.middleware.ts#L19) verifies the JWT signature and nothing else.

**Problem.** CP-5 / R-18. `isActive` and `deletedAt` are never re-checked, so a revoked user works until token expiry and may refresh further.

**Proposed change.** Look up the user in `requireAuth` and reject inactive/deleted. Use a short-TTL in-memory cache (30–60 s) to avoid a per-request query. Also reject refresh for a revoked user.

**Files.** `backend/src/middleware/auth.middleware.ts`, `backend/src/services/auth.service.ts` (refresh path).

**Backend impact.** One extra lookup per request, cached. Negligible at this scale.

**Tests required.** Deactivated user's valid token → 401. Deleted user → 401. Active user unaffected. Refresh rejected for a revoked user. Cache expiry behaves.

**Dependencies.** T1.

**Acceptance criteria.** Deactivating a user ends access within the cache TTL, on both access and refresh paths.

**Effort.** 4–6 h · **Risk.** Low-Medium — touches every authenticated request; watch for a self-lockout path.

---

## T7 · Idempotency on supplier purchases and receivings

**Objective.** A retried submission cannot create a duplicate payable or a duplicate stock increase.

**Existing implementation.** Payments have `idempotencyKey @unique` + SHA-256 fingerprint replay detection — proven and tested. **Purchases and receivings have nothing.** The `Button` disabled-on-`isLoading` guard stops the double-click only.

**Problem.** CP-3 / R-05. A network retry or resubmit creates a duplicate payable or **duplicate stock**, requiring an admin void and leaving permanent audit noise.

**Proposed change.** ADR-11 — reuse the payment pattern exactly. Add nullable `idempotencyKey @unique` to `SupplierTransaction` and `SupplierReceiving`. Frontend generates a key **per form instance** and reuses it across retries.

Explicitly **not** chosen: uniqueness on `(supplierId, receiptNumber)`. The schema already documents why — suppliers reuse and re-issue numbers, so a hard constraint would block a genuine purchase at the counter ([schema.prisma:1202-1205](backend/prisma/schema.prisma#L1202)).

**Files.** New migration; `schema.prisma`; supplier purchases and receivings service/repository/validator; the two frontend forms.

**DB impact.** Two additive nullable unique columns. No backfill.

```
Migration required:    Yes
Backward compatible:   Yes — nullable; existing rows and clients unaffected
Existing data impact:  None. Existing rows keep NULL, which means "no key supplied"
Rollback strategy:     Drop the two columns; no data loss, as nothing else reads them
Backup required:       Yes (standard pre-deployment)
Validation check:      Submit the same purchase twice with one key → exactly one
                       SupplierTransaction and one stock increase
```

**Frontend impact.** Key generated on form mount, **not on submit** — regenerating on each submit defeats the entire purpose. This is the most likely implementation error.

**Tests required.** INV-08. Same key twice → one record. Different fingerprint, same key → conflict. Absent key → still works (backward compatible). Concurrent identical submissions → one succeeds.

**Dependencies.** T1.

**Acceptance criteria.** Duplicate submission creates exactly one payable and one stock increase; existing clients without a key are unaffected.

**Effort.** 10–14 h · **Risk.** Medium — schema change on live financial tables. Rehearse per INV-13.

---

## T8 · Update product cost price from receipts

**Objective.** `Product.costPrice` reflects what was actually last paid.

**Existing implementation.** `SupplierPurchaseLine.unitPrice` records the real price. `Product.costPrice` is **never updated from it**.

**Problem.** CP-8 / R-06. The pricing engine computes selling prices from a stale cost, so the shop silently under-prices in a rising market. **It fails with no error and no audit entry, and cannot be detected today because margin reporting does not exist.**

**Proposed change.** ADR-16 — on posting a purchase with PRODUCT lines, update `costPrice` and write a `ServiceAudit` entry recording old → new. Add a "cost changes this period" report so the owner has oversight without blocking the counter.

Rejected: a manual approval queue (adds friction at the counter, and staleness is the bigger risk).

**Why it matters.** Prerequisite for ADR-15 and all margin reporting — **a snapshot of a stale cost is a precise record of a wrong number.**

**Files.** `supplier-purchases.service.ts`, `products.repository.ts`, a new report slice, plus frontend.

**Backend impact.** Cost update joins the existing purchase transaction — must be inside the same `runFinancialTransaction`.

**Tests required.** INV-10 prerequisite. Posting updates cost + writes audit. MANUAL lines never touch cost. Voiding a receiving does **not** revert cost (a decision to confirm with the owner — the goods were genuinely purchased at that price). Multi-line purchases update each product once.

**Dependencies.** T1, T7.

**Acceptance criteria.** Cost updates on posting; every change audited; the change report lists them; MANUAL lines are inert.

**Effort.** 10–14 h · **Risk.** Medium — changes selling prices for preset-priced products. **The owner must be told this now happens.**

---

## T9 · Remove the legacy transaction system — **REVISED 2026-08-30**

> **The premise below was wrong: this module is live and user-facing, not orphaned.**
> `CustomerProfilePage.tsx:10` renders `TransactionList` (the Legacy Ledger), `transactions.api.ts` calls the router, `customers.controller.ts:109,122` use `TransactionsService`, and `dashboard-activity.repository.ts:9` **reads** `activity_logs`.
>
> Both tables hold **0 production rows** and nothing writes them, so both surfaces are permanently blank — but they are rendered, and `activity_logs` cannot be dropped without breaking the dashboard activity endpoint.
>
> **Revised effort: 10–16 h · Risk: Medium** (was 4–8 h / Low / "mostly verification").
>
> ### T9a — do now
> Remove the Legacy Ledger panel from `CustomerProfilePage`, delete `frontend/src/features/transactions/`, remove the `/api/v1/transactions` router mount and its backend files, remove `getCustomerTransactions` / `getCustomerBalance` from `customers.controller.ts` and their routes, remove the `Transaction` model and drop the `transactions` table.
>
> **Keep `activity_logs`, the `ActivityLog` model, and `features/dashboard/activity/*` untouched.** `ActivityLog` has no FK to `Transaction` — verify this before proceeding — so they separate cleanly and the endpoint keeps behaving exactly as it does today.
>
> **Requires explicit owner sign-off:** T9a removes a visible panel from the Customer Profile. It has never displayed data, but it is the owner's screen.
>
> ### T9b — deferred product decision
> Dashboard Recent Activity: retire the panel, or reimplement it over the five audit tables. `activity_logs` stays until decided.

### Original task (retained for the record — see revision above)

**Objective.** Delete a second, parallel, UI-invisible customer-money system.

**Existing implementation.** `Transaction` model, `ActivityLog` model, and five files, with the router **live-mounted** at [app.ts:128](backend/src/app.ts#L128). No frontend route or nav item reaches it.

**Problem.** CP-6 / R-22. Two hazards: an API caller can write money records invisible to every screen, and any future report joining `transactions` would double-count against `debts`.

**Proposed change.** ADR-13, **strictly gated**: first confirm `transactions` and `activity_logs` are **empty in the production database**. If rows exist, stop — that is a data question requiring the owner, not a code change. If empty, remove the route, the five files, and both models.

**Files.** `app.ts`; `routes/`, `controllers/`, `services/`, `repositories/`, `types/`, `validators/` transaction files; `schema.prisma`; a drop migration.

**DB impact.** Drops two tables. **Irreversible — requires a verified backup first.**

```
Migration required:    Yes — DESTRUCTIVE
Backward compatible:   No. Drops the transactions and activity_logs tables
Existing data impact:  NONE ONLY IF both tables are confirmed empty in production.
                       If either has rows, STOP — that is a business data question
Rollback strategy:     NOT reversible by a down-migration. Recovery = restore the
                       verified backup taken immediately before deployment.
                       State this plainly in the PR; do not imply a clean revert
Backup required:       YES — mandatory, verified, immediately before deployment
Validation check:      SELECT COUNT(*) = 0 on both tables BEFORE the drop;
                       npm run typecheck proves no dead imports;
                       GET /api/v1/transactions returns 404 after
```

**This is one of only two destructive migrations in the whole plan.** Commit it alone, never bundled with other work, so it can be identified and reasoned about in isolation.

**Tests required.** Full suite passes after removal. No import remains (typecheck proves it). `/api/v1/transactions` returns 404.

**Dependencies.** T1, T3 (restore confidence before dropping tables).

**Acceptance criteria.** Both tables confirmed empty and dropped; all tests pass; no dead imports.

**Effort.** 4–8 h, mostly verification · **Risk.** Low **if** the tables are empty; **stop immediately if they are not.**

---

## T10 · Balance and stock reconciliation as standing reports

**Objective.** Turn the invariants into things anyone can check on demand.

**Existing implementation.** Inventory reconciliation exists. **There is no equivalent for financial balances.**

**Proposed change.** Add a Financial Integrity report: per customer, `Σ(non-cancelled obligations) − Σ(non-voided allocations)` compared against the reported outstanding, flagging any mismatch. Same for suppliers. Surface both alongside inventory reconciliation in Settings → Maintenance.

**Why it matters.** ADR-02 makes drift structurally impossible **today**. This report is what proves it stays true after four months of change — and it is exactly the check a future AI-introduced regression would trip.

**Files.** New report slice under `features/reports/`, plus frontend.

**DB impact.** Read-only.

**Tests required.** INV-01, INV-02. Must detect a deliberately corrupted balance in a test fixture — **a reconciliation report that cannot fail is decoration.**

**Dependencies.** T1.

**Acceptance criteria.** Both reports run clean on production data; both detect injected corruption in tests.

**Effort.** 12–16 h · **Risk.** Low — read-only.

---

## T11 · Adopt liveness predicates

**Objective.** One reviewable place per domain defining "is this record live?"

**Existing implementation.** Five conventions: `deletedAt`, `archivedAt`, `cancelledAt`, `voidedAt`, status enums.

**Problem.** No single liveness test. A forgotten filter silently includes cancelled money in a total.

**Proposed change.** ADR-14 — export one predicate per domain (`isLiveDebt`, `isLiveSupplierTransaction`, …) and use them in new code, migrating existing call sites opportunistically. **Explicitly not** a mass column rename: high churn, and the words genuinely mean different things.

**Files.** Domain modules per feature slice.

**Tests required.** Each predicate unit-tested against every state.

**Dependencies.** T1.

**Acceptance criteria.** Predicates exist, are tested, and are used by all new Phase 1 code.

**Effort.** 8–12 h · **Risk.** Low

---

## T13 - Dual currency foundation (schema + domain)

**Objective.** USD and LBP as first-class transaction currencies, with the rate snapshotted on every transaction.

**Existing implementation.** None. Currency is a hardcoded literal type `currency: 'USD'` ([dashboard.types.ts:23](backend/src/features/dashboard/dashboard.types.ts#L23)). `money.ts` is currency-agnostic and caps at `MAX_SCHEMA_MONEY = 9999999999.99`.

**Problem.** The business trades in both currencies. Retrofitting later costs several times more - which is why this was a blocking question.

**Proposed change.** ADR-19 and [CURRENCY_AND_VAT_DECISION.md](../../CURRENCY_AND_VAT_DECISION.md) Part A:

1. `ExchangeRate` table - append-only, `Decimal(18,6)`, effective-dated.
2. `currency` / `exchangeRate` / `baseAmount` on the transactional entities (A2 table).
3. `PaymentAllocation` gains `paymentAmount` + `exchangeRate`; **`amount` stays in the obligation's currency** so `calculateDebtBalance` is untouched.
4. Currency-aware `money.ts`: USD 2 dp, LBP 0 dp, both `ROUND_HALF_UP`.
5. Admin screen to record the operative rate.
6. Migration backfilling every existing row to `USD` / rate 1.

**Why it matters.** **ADR-02 survives intact** - no balance is stored, none becomes currency-ambiguous, and no second financial source of truth is created, exactly as the owner required.

**Files.** Migration; `schema.prisma`; `domain/money.ts`, `domain/balances.ts` (verify unchanged), `domain/payment-allocation.ts`; a new `features/currency/` slice; admin UI.

**DB impact.**
```
Migration required:    Yes
Backward compatible:   Yes, behaviourally - existing data is all USD and stays USD
Existing data impact:  Every money row stamped currency=USD, exchangeRate=1,
                       baseAmount=amount. NO amount is modified
Rollback strategy:     Drop the added columns and ExchangeRate. Amounts untouched,
                       so no financial data is lost
Backup required:       YES - verified, immediately before deployment
Validation check:      Sum of debts, sum of payments, every supplier and customer
                       balance identical before and after; all three integrity
                       reports clean
```

**Security impact.** Rate entry must be ADMIN-only and audited - a wrong rate misprices everything downstream.

**Tests required.** INV-16, INV-17, INV-18, INV-19, INV-25.

**Dependencies.** T1 (CI), T10 (integrity reports - needed to prove the backfill changed nothing).

**Acceptance criteria.** A debt in USD can be paid in LBP and the remaining balance is exact; no historical value changes when a new rate is added; every integrity report clean after the migration.

**Effort.** 45-60 h - **Risk. Medium-High** - the largest schema change in the plan. Rehearse against restored production data (INV-13).

---

## T14 - VAT foundation (configuration + line snapshot)

**Objective.** Configurable VAT with per-line snapshots, so a future rate change cannot alter a historical invoice.

**Existing implementation.** None. Verified 2026-08-26: `vat`, `tax`, `taxNumber`, `taxRate` return **zero real matches** across `backend/src`, `frontend/src`, `schema.prisma`, `.env.example`, and `Setup-HomeConnect.ps1`.

**Problem.** VAT is required, default 11% (Lebanon). Rates change by legislation; historical invoices must not.

**Proposed change.** ADR-20 and Part B:

1. `TaxRate` (code, `ratePercent Decimal(6,3)`, effective dates) and `TaxProfile` (points at a rate; `isDefault`). **No `vat = 11` field anywhere** - per the owner's explicit direction.
2. `Product.taxProfileId` (nullable -> default profile; **never silently exempt**).
3. `Product.priceIncludesVat`.
4. `SalesOrderItem` and `SupplierPurchaseLine` gain `taxRateSnapshot`, `taxCodeSnapshot`, `unitPriceExVat`, `vatAmount`, `lineTotalIncVat`.
5. A pure `domain/vat.ts`: per-line calculation, per-line rounding, inclusive derived **by subtraction**.
6. Document totals = exact sum of rounded line amounts; never independently rounded.
7. Seed `LB_STANDARD` at 11%, plus zero-rated and exempt.

**Why it matters.** No historical invoice reads `TaxRate`, so **changing a rate cannot alter one** - the same discipline as ADR-15's cost snapshot.

**Files.** Migration; `schema.prisma`; new `features/tax/` slice; `domain/vat.ts`; sales and supplier line services; product form.

**DB impact.**
```
Migration required:    Yes
Backward compatible:   Yes - new tables plus additive nullable columns
Existing data impact:  Existing lines get taxRateSnapshot=0, vatAmount=0.
                       They were GENUINELY SOLD WITHOUT VAT - backfilling 11%
                       would falsify history and misstate the first VAT return
Rollback strategy:     Drop the added columns, TaxRate, TaxProfile
Backup required:       YES - verified
Validation check:      Every historical invoice total unchanged to the cent
```

**Tests required.** INV-20, INV-21, INV-24. (INV-23 refund reversal lands with Phase 2's return flow.)

**Dependencies.** T13 (VAT is computed in the transaction currency - ADR-21).

**Acceptance criteria.** Changing a `TaxRate` leaves every historical invoice byte-identical; document VAT equals the sum of line VAT exactly; inclusive pricing gives `priceEx + vat == quoted price` exactly.

**Effort.** 20-28 h - **Risk.** Medium - new tables, but additive and independent of existing money paths.

---

## T12 · Phase 1 hardening and buffer

Fix what T1's newly-running integration tests reveal; address review findings; update docs.

**Effort.** 20–30 h · **Risk.** Unknown by definition — **this buffer is not optional.** Turning on ten previously-skipped integration files will very likely surface something.

---

## Summary

| Task | Effort | Risk | Closes |
|---|---:|---|---|
| T1 CI with DB tests | 8–12 | Low | CP-4, R-13 |
| T2 Off-machine backups | 1–3 | Low | R-15 |
| T3 Restore rehearsal | 4–6 | Low | CP-7, R-12 |
| T4 Inventory baseline | 1–2 | None | R-09 |
| T5 JWT startup gate | 2–4 | Low | CP-1, R-17 |
| T6 Session revocation | 4–6 | Low-Med | CP-5, R-18 |
| T7 Idempotency | 10–14 | Medium | CP-3, R-05 |
| T8 Cost price update | 10–14 | Medium | CP-8, R-06 |
| T9a Remove legacy transaction UI + model | **10–16** | **Medium** | CP-6, R-22 — *revised; was 4–8 h / Low* |
| T9b Dashboard Recent Activity decision | deferred | — | Product decision; `activity_logs` retained |
| T10 Integrity reports | 12–16 | Low | R-01, R-02 |
| T11 Liveness predicates | ~~8–12~~ | — | **DESCOPED** to Phase 5 — MASTER_PLAN §10 |
| **T13 Dual currency foundation** | **45–60** | **Med-High** | **ADR-19, R-08** |
| **T14 VAT foundation** | **20–28** | Medium | **ADR-20, R-38** |
| T12 Buffer | 20–30 | — | — |
| **Total** | **142-205 h** | | |

**Against a 150–175 h budget, the top end now overruns.** Currency and VAT added 65–88 h; descoping T11 recovered 8–12.

This is the tightest phase in the plan and the one that least tolerates pressure — it touches live financial tables. **If T13 or T14 overruns materially, take MASTER_PLAN §10 Option 2 (extend to five months) rather than compressing T3 (restore rehearsal) or T12 (buffer).** Those two are what make everything after them safe.

**Definition of done:** CI green including DB tests · a restore performed and timed · backups off-machine · no hardcoded secret · idempotency on every financial write · costs current · legacy module gone · integrity reports clean · **USD/LBP transactable with rates snapshotted** · **VAT configurable with per-line snapshots, and changing a rate provably cannot alter a historical invoice**.

---

## Suggested commit sequence

Commit each coherent change separately. Never one giant phase commit.

```
ci: run typecheck, lint and database tests on every push        (T1)
test: add test:ci script running all database suites            (T1)
docs: record restore rehearsal timings and runbook              (T3)
fix: refuse to start without JWT_SECRET                         (T5)
test: cover missing JWT secret startup failure                  (T5)
fix: reject requests from deactivated users                     (T6)
test: cover revoked session on access and refresh paths         (T6)
feat: add idempotency keys to supplier purchases and receivings (T7)
test: add purchase and receiving retry coverage                 (T7)
fix: refresh product cost from supplier receipt                 (T8)
feat: add cost change report                                    (T8)
chore: remove orphaned legacy transaction module                (T9)
feat: add customer and supplier financial integrity reports     (T10)
test: add balance reconciliation coverage                       (T10)
feat: add exchange rate table and currency-aware money           (T13)
feat: record transaction currency and rate on financial records  (T13)
test: assert cross-currency payment leaves balance exact         (T13)
feat: add configurable tax rate and profile model                (T14)
feat: snapshot vat rate and amount on invoice lines              (T14)
test: assert vat rate change does not alter history              (T14)
```

T2 and T4 are verification, not code — record their results in `SUMMARY.md`.

---

## Phase completion

```
1. REVIEW.md completed
2. Tests passing (npm run test:ci, 0 skipped)
3. CI passing
4. SUMMARY.md updated with evidence and verdict
5. Coherent work committed to develop
6. develop pushed successfully
7. main tip confirmed unchanged
8. Phase 2 continues on develop only if the verdict permits it
```

```bash
git checkout develop
git pull origin develop
git push origin develop
```

Do not merge into `main` and do not create a Phase 2 branch.
