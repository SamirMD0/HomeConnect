# PHASE 1 — REVIEW

**This is the Phase 1 checkpoint gate on `develop`. `main` remains untouched.**

Run it before recording and pushing the Phase 1 checkpoint. Every item needs **evidence**, not an assertion. The verdict determines whether Phase 2 may begin.

## Checkpoint result — 2026-09-08

**Engineering verdict: COMPLETE WITH DEPLOYMENT FOLLOW-UP.** Phase 2 coding is safe after owner review of this checkpoint; production deployment is not approved.

| Gate | Evidence/result |
|---|---|
| VAT policy | Existing/normal retail prices default VAT-inclusive; $100 at 11% remains $100 ($90.09 + $9.91). Exclusive mode, zero rate, mixed mode, USD/LBP rounding, immutable history, and original-snapshot reversal are tested. |
| Code/schema | Prisma client regenerated and schema validated. Fresh scratch database applied all 37 migrations with zero pending/failed/mismatched and interrupted-migration detection passed. Live DB has no active failed migration and no `transactions` table. |
| Live deployment delta | Read-only inspection shows production has 35 finished migrations plus one resolved historical rollback. `20260906150000_seed_default_tax_configuration` and `20260908120000_default_retail_prices_vat_inclusive` remain pending; tax profiles/rates are empty and 86 product preferences are still exclusive until that controlled deployment. |
| Pricing/cost | Manual selling prices remain unchanged when cost moves. Explicit automatic pricing recomputes and audits old/new cost and selling price, source/preset, VAT mode, currency, source purchase/receiving, user, reason, and timestamp. USD/LBP rounding and rollback are tested. |
| JWT | Setup creates independent 48-byte CSPRNG access/refresh secrets and repairs missing, weak, or equal values. Runtime/preflight require at least 32 characters, secrets are not logged or packaged, and insecure fallbacks are absent. |
| Authorization | Meta-test protects every private API router mount with authentication and rejects direct app-level POST/PUT/PATCH/DELETE bypasses without a brittle GET allowlist. |
| Live reconciliation | Customers: 105/105 OK, difference $0.00. Suppliers: 3/3 OK, difference $0.00. Inventory: 0 mismatches. |
| Automated gates | Typecheck/build/runtime PASS; lint 0 errors (65 existing warnings); `test:ci` 278 files and 2,288 tests, 0 failed, 0 skipped. |
| Operational blockers | C4 owner sign-off, C5 off-machine checksum/restore usability evidence, and C6 timed isolated real-data restore remain pending. The production migrations above also require the verified-backup release path. |

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
| Cost price updates are correct and audited | Automated manual/automatic/same-cost/multi-line/currency/rollback coverage; sample production receipts at deployment |
| Selling-price changes from T8 were reported to the owner | Product Cost Changes report exposes old/new cost and selling price; owner reviews before deployment |
| Payments, debts, and allocations behave unchanged | Full financial test suite green |
| Returns, cancels, and voids still preserve history | Audit rows present for each sampled action |

**Specific to this phase:** T8 changes selling prices for preset-priced products. **Confirm the owner was told before it shipped.** A silent price change is a business incident, not a deployment.

---

## Database

| Check | Evidence required |
|---|---|
| Every migration is additive or reversible | Read each; state which |
| Migrations rehearsed against a fresh isolated database | 37/37 applied; 0 pending, failed, or mismatched; interrupted-new-migration detection/recovery passed |
| Migrations rehearsed against restored production data | **Pending deployment gate C6** |
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
| No hardcoded secret fallback remains in executable/test code | Grep `backend/src`, `frontend/src`, `desktop/src`, and `scripts` — must find nothing; historical audit documents may quote the removed defect |
| Installer/upgrade safely provisions both secrets | Static setup-policy tests + preflight/runtime secret-strength tests |
| Installed production config confirmed before shipping | **Pending deployment check; setup repairs missing/weak/equal values without disclosure** |
| Deactivated users cannot use existing tokens | Test evidence, access **and** refresh paths |
| Admin self-lockout is prevented or documented | Prompt 05 Step 5 finding |
| No new endpoint lacks authorization | INV-14 green |
| `/api/v1/transactions` returns 404 | Manual check |

---

## Testing

| Check | Evidence |
|---|---|
| CI runs on every commit | Pipeline history |
| **`test:ci` runs every file with 0 skipped** | Current output recorded in `SUMMARY.md` |
| CI has been observed going red | The deliberate-break evidence from Prompt 02 Step 4 |
| Every new behaviour has a test that failed before the change | Per-task evidence |
| INV-01, 02, 03, 04, 05, 08, 14 all covered and green | Test names mapped to invariants |
| Integrity reports detect injected corruption | Test evidence — not just a clean run |
| Full run under 10 minutes | Timing |

---

## Operational readiness (specific to Phase 1)

| Check | Evidence |
|---|---|
| A restore was performed on real data and timed | **Pending deployment blocker C6:** isolated restore, migrations, integrity checks, startup, and RTO required |
| Backups confirmed on separate physical media | **Pending deployment blocker C5:** off-machine copy, checksum, and restore usability required |
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

**COMPLETE WITH DEPLOYMENT FOLLOW-UP** — all correctness and Phase-2-assumption gates hold, while explicitly operational C4/C5/C6 and controlled production migration application remain release blockers. This permits the next phase's coding after owner review; it never means deployable.

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

Phase-1-specific production-release blockers (they do not reverse a clean engineering checkpoint, but they prohibit deployment):
- CI not running on `develop`
- Restore not rehearsed on real data (C6)
- Backups only on the business PC's disk (C5)
- The hardcoded secret fallback still present
- A table dropped without confirming it was empty
- Work was committed directly to `main`

---

## The question that decides it

> **If the business PC failed tomorrow morning, could the business be trading again today — and would the restored numbers be provably correct?**

The engineering checkpoint may be complete before this answer is yes only when the missing evidence is named as a deployment blocker. Production approval still requires a proven "yes" for both halves.

---

## After an acceptable checkpoint

```bash
git checkout develop
git pull origin develop
git status
```

Continue Phase 2 on `develop`. Do not create a phase branch or merge into `main`.

Delete only after confirming the merge landed. Never `git branch -D`.
