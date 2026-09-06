# PHASE 3 — REVIEW

**This is the Phase 3 checkpoint gate on `develop`. `main` remains untouched.**

This phase produces **numbers the owner will make decisions with**. The review is therefore weighted almost entirely toward reconciliation.

**A plausible wrong number is worse than no number.** An obviously broken report gets fixed; a report that looks right and is wrong gets trusted.

---

## Branch and commit hygiene

| Check | Evidence |
|---|---|
| All cumulative work is on `develop` | `git branch --show-current` |
| The accepted Phase 2 checkpoint is present | Phase 2 `SUMMARY.md` and commit evidence |
| Phase 1 T8 and Phase 2 T8 are present on the base | Verified before work started |
| Nothing was committed directly to `main` | `git log main --oneline` |
| **T1 (cost snapshot) was committed alone** | It is the schema change and touches the CAS stock path |
| Commits are coherent and separate | Phase 3 commit list in `SUMMARY.md` |
| Working tree clean | `git status` |

---

## Business correctness — reconciliation is the whole test

| Check | Evidence |
|---|---|
| One product's margin computed **by hand** from source orders matches the report | Both numbers reported side by side |
| Profit report totals reconcile against independently summed source orders | INV-09 |
| Every dashboard KPI equals its corresponding report figure | Every pair reported |
| Cash-flow cash-in matches the customer payments report | Both numbers |
| Inventory valuation unit count matches the inventory summary endpoint | Both numbers |
| Gross margin = revenue − COGS, exactly | Arithmetic check |
| Net = gross margin − expenses, exactly | Arithmetic check |
| Returns are handled per the confirmed rule, consistently everywhere | The stated rule + test evidence |
| **No double-counting between cash flow and Phase 2 T8** | A test that fails if counter cash is counted twice |

**Any mismatch is a blocker.** Do not "adjust the report to match" — investigate which side is wrong.

---

## Null cost snapshots — the specific hazard of this phase

| Check | Evidence |
|---|---|
| Historical fulfillments with no snapshot are **excluded** from COGS | Code inspection |
| The excluded line count and excluded revenue are **shown prominently** | Report output, not a footnote |
| `Product.costPrice` is **never** substituted for a missing snapshot | Grep the report code |
| A product with no cost stores **null, not zero** | Test evidence |
| The excluded count is reported to the owner | Recorded number |

**Substituting a current cost for a missing snapshot is the single most likely way this phase produces a plausible wrong number.** Verify explicitly.

---

## Database

| Check | Evidence |
|---|---|
| `unitCostSnapshot` is additive, nullable, `Decimal(12,2)` | Migration SQL |
| **No backfill invented historical costs** | Migration contains no UPDATE |
| The expenses table follows existing conventions | FKs `onDelete: Restrict`, soft delete, actor columns |
| Money columns are `Decimal(12,2)` | Schema |
| Migrations rehearsed against restored production data | `rehearse:migrations` output |
| Audit-viewer queries use existing indexes | Query plan for a filtered search |

---

## Backend

| Check | Evidence |
|---|---|
| **The CAS stock logic is unchanged** | Diff `sales-order-inventory.service.ts` — the snapshot is an addition, nothing else moved |
| The snapshot is captured inside the **existing** transaction | Read it — no second transaction |
| Every existing inventory test still passes | Test output |
| Dashboard aggregates are cached | Cache usage verified |
| Reports follow the existing report-rows pattern | Structure comparison |
| Dashboard KPIs call the same services as reports where possible | Read the code |
| The audit viewer is strictly read-only | **No edit or delete endpoint exists** — verified by search |

---

## Frontend

| Check | Evidence |
|---|---|
| Financial dashboard section is hidden for employees | Not merely empty — actually hidden |
| Report exclusions are visible, not buried | Visual check |
| Expense entry validates amounts as money | Form validation |
| CSV exports work on all new reports | Files produced |
| Loading and error states on all new screens | Visual check |
| Audit viewer pagination is stable | Manual check with many rows |

---

## Security

| Check | Evidence |
|---|---|
| Profit, margin, valuation, and cash flow are **ADMIN-only** | Route checks + a 403 test |
| The financial dashboard section is ADMIN-only | Same |
| The audit viewer is ADMIN-only | Same |
| Expense authorization matches the confirmed rule | Read it |
| No new endpoint lacks authorization | INV-14 green |
| Cost prices are not newly exposed to employees | Check what the new endpoints return |

---

## Scope discipline — the specific temptation of this phase

| Check | Evidence |
|---|---|
| **No chart of accounts** | Grep: `account`, `journal`, `debit`, `credit` — report findings |
| **No journal entries** | Same |
| **No double-entry posting** | Same |
| **No trial balance or balance sheet** | Same |
| Expenses are labelled cash-out records, not accounts | Read the model — no account codes |

`GENERAL_LEDGER_DECISION.md` rejected Option B at 180–260 hours. **If this phase drifted toward it, that is a scope failure regardless of code quality** — and it is the most likely way this plan fails, because each individual step toward it feels reasonable.

---

## Testing

| Check | Evidence |
|---|---|
| `test:ci` green with 0 skipped | Output |
| INV-10 (cost snapshot immutability) green | Test name |
| INV-09 (report reconciliation) covers the new reports | Test names |
| Double-counting tests exist for cash flow | Test that fails on double-count |
| Every new report tested against a hand-computed fixture | Test evidence |
| A period with no data returns zeroes, not errors | Test evidence |

---

## Checkpoint readiness

| Check | Evidence |
|---|---|
| PR description complete per [GIT_WORKFLOW.md §5](../../GIT_WORKFLOW.md) | Every section filled |
| Full `npm run test:ci` output with the **skipped** count | The output |
| CI run linked and green | Run URL |
| T1 and T2 migrations disclosed | Blocks from `PLAN.md` |
| **T1's no-backfill decision stated**, with the affected row count and date range | Records |
| **Diff summary for `sales-order-inventory.service.ts` showing CAS is untouched** | The diff |
| **Screenshots** — profit report and financial dashboard | Included |
| Actual profit figures for a completed month, stated as hand-reconciled | The numbers |
| Confirmation that no chart-of-accounts or journal-entry code was introduced | Grep result |

---

## Phase verdict

**COMPLETE** — the owner can see profit, margin, expenses, cash movement, and stock value; **every figure reconciles with its source, verified by hand at least once**; null snapshots are excluded and counted; nothing resembling double-entry was introduced; `test:ci` green with **0 skipped**; nothing landed on `main`.

**COMPLETE WITH FOLLOW-UP** — the above hold with named non-blocking items (breakdown dimensions pending Phase 2 T7, audit viewer performance tuning, dashboard layout polish), each with an owner.

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

Phase-3-specific `NOT COMPLETE` additions:
- **Any report figure disagrees with a hand-computed value**
- Any dashboard KPI disagrees with its report
- Missing cost snapshots are silently substituted with current cost
- Money is double-counted between cash flow and payments
- **The compare-and-set stock logic was modified**
- Chart-of-accounts or journal-entry code was introduced
- Work was committed directly to `main`

---

## The question that decides it

> **Can the owner open Home Connect, see how much money the business made last month, and would an accountant looking at the source records agree with that figure?**

Phase 3 is complete when the answer is yes to both halves, the second half has actually been checked, and the reviewed checkpoint is committed and pushed to `develop`.

---

## After an acceptable checkpoint

```bash
git checkout develop
git pull origin develop
git push origin develop
```
