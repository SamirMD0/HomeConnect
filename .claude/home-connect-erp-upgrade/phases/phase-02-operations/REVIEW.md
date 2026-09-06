# PHASE 2 — REVIEW

**This is the Phase 2 checkpoint gate on `develop`.** Nothing merges into `main` until all four phases are complete and explicitly approved. Passing this gate permits Phase 3 to continue on `develop`; it does not mean anything ships.

Evidence required for every item.

---

## Branch and commit hygiene

| Check | Evidence |
|---|---|
| All cumulative work is on `develop` | `git branch --show-current` |
| The accepted Phase 1 checkpoint is present | Phase 1 `SUMMARY.md` and commit evidence |
| **`main` is untouched** | `git log main --oneline -1` still shows `ac6ae9f` |
| Phase 2 commits are separable from Phase 1 work | Phase 2 commit list in `SUMMARY.md` |
| Phase 1's outstanding issues were carried forward knowingly, not silently | This phase's SUMMARY.md restates the ones still open |
| Nothing was committed directly to `main` | `git log main --oneline` |
| Commits are coherent and separate | Phase 2 commit list in `SUMMARY.md` |
| **T4 (return) and T8 (cash gap) are committed separately from unrelated work** | Commit review — these are the two most likely to need reverting |
| Working tree clean | `git status` |

---

## Business correctness

| Check | Evidence |
|---|---|
| Invoice totals match the sales order exactly | Compare a printed invoice against the order record, figure by figure |
| Receipt allocations match the payment record | Same, for a payment split across multiple obligations |
| Statement closing balance equals the customer's outstanding | Both numbers reported side by side |
| Statement running balance is arithmetically continuous | Entry-by-entry check on a complex customer |
| A return restores stock exactly once | Movement count before/after |
| A return reverses money correctly | Balance before/after; audit trail readable |
| Supplier aging buckets are correct at boundaries | Test evidence at exact tier edges |
| Credit limit uses the **derived** outstanding, not a cache | Read the code |
| **Every unit of money appears exactly once in reporting** | INV-09 — tests for both double-count and zero-count |
| Reports still reconcile with source transactions | All three integrity reports clean |

**Specific to this phase:** T8 is the one place where a mistake makes reports *worse* than before. **Run the customer financial integrity report before and after T8 and explain any change.**

---

## Database

| Check | Evidence |
|---|---|
| Every migration is additive | `dueDate`, `creditLimit`, `categoryId` all nullable |
| No backfill changes existing behaviour | Null semantics preserve current behaviour exactly |
| Any refund/credit table is correctly constrained | FKs, `onDelete: Restrict`, no float money |
| Migrations rehearsed against restored production data | `rehearse:migrations` output |
| **Any T8 backfill was idempotent and backed up** | Backup record; the backfill run twice produces the same result |
| New money columns are `Decimal(12,2)` | Schema |
| Categories cannot be hard-deleted while in use | `onDelete: Restrict` verified |

---

## Backend

| Check | Evidence |
|---|---|
| The return is **one** transaction | Read it — stock and money succeed or fail together |
| Every guard from `RETURN_TRACE.md` has an equivalent inside the transaction | The old-guard → new-guard mapping |
| Return has an idempotency key | Test: retried return applies once |
| Running balance computed server-side | Read the code — not stored, not client-computed |
| Document endpoints respect existing authorization | Route inspection |
| No financial totals computed in a template | **Grep the document templates for arithmetic** |
| Credit limit check is inside the debt-creation transaction | Read it |

---

## Frontend

| Check | Evidence |
|---|---|
| Invoice, receipt, and statement print correctly on A4 | Actually printed or print-previewed |
| **Arabic renders correctly in printed output** | Visual check — RTL is easy to get wrong and easy to miss |
| Nothing is clipped at page boundaries | Multi-page statement checked |
| PDF export works for all three documents | Files produced and opened |
| A voided payment's receipt is marked VOID or cannot be printed | Per the confirmed rule |
| The return flow is one action, not three | Walk it as a user |
| Credit limit warning shows outstanding, limit, and overage | Visual check |
| Submit buttons still disable while pending | Every new form |

---

## Security

| Check | Evidence |
|---|---|
| Documents containing customer data require auth | Route check |
| A user cannot print another entity's document by changing an ID | Attempt it |
| The return action has an appropriate role check | Read it |
| Credit limit override (if chosen) is audited | Audit rows present |
| No new endpoint lacks authorization | INV-14 green |
| No customer data leaks into logs via the document endpoints | Redaction tests |

---

## Testing

| Check | Evidence |
|---|---|
| `test:ci` green with 0 skipped | Output |
| Return covered in DB integration tests, not just mocks | File locations |
| INV-05 covers a failure mid-return | Test exists and passes |
| INV-09 has tests for double-count **and** zero-count | Both present |
| Document snapshot tests exist | So layout cannot silently regress |
| New tests failed before the change | Per-task evidence |

---

## Scope discipline

| Check | Evidence |
|---|---|
| No multi-currency work was started without a decision | Grep for currency/exchange-rate code |
| No VAT work was started without a decision | Same |
| No POS/till work crept in | Same |
| Deferred tasks are recorded, not silently dropped | The deferral list |

**If time ran short:** confirm T7 (categories) was deferred before T6, and that **neither T4 nor T8 was deferred**. Those two are correctness, not convenience.

---

## Checkpoint readiness

| Check | Evidence |
|---|---|
| PR description complete per [GIT_WORKFLOW.md §5](../../GIT_WORKFLOW.md) | Every section filled |
| Full `npm run test:ci` output with the **skipped** count | The output |
| CI run linked and green | Run URL |
| All four migrations disclosed (T4, T5, T6, T7) | Blocks from `PLAN.md` |
| **If T8 backfilled: verified backup taken, backfill idempotent, before/after totals reported, owner signed off** | Records |
| **Screenshots included** — invoice, receipt, statement | This phase changed UI substantially |
| Business rule changes called out | Credit limit rule, new return flow, counter-cash reporting |
| Unresolved risks cross-referenced | `RISK_REGISTER.md` |

---

## Phase verdict

The verdict decides whether Phase 3 may continue on `develop`, not whether anything merges into `main`. Write `COMPLETE`, `COMPLETE WITH FOLLOW-UP`, or `NOT COMPLETE` into this phase's `SUMMARY.md` with the reasoning.

**COMPLETE** — all documents print correctly with matching totals; the return is atomic and leaves stock and money right; every unit of money appears exactly once in reporting; all three integrity reports clean; `test:ci` green with **0 skipped**; commit history coherent; nothing landed on `main`.

**COMPLETE WITH FOLLOW-UP** — the above hold with named non-blocking items (document styling polish, category taxonomy refinement, aging threshold tuning), each with an owner and target phase.

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

Phase-2-specific `NOT COMPLETE` additions:
- A printed total disagrees with its source record
- A return can leave stock restored but money unreversed, or vice versa
- **Money is double-counted anywhere in reporting** — worse than the omission it replaced
- A backfill was run without a verified backup or without owner sign-off
- Work was committed directly to `main`
- **The VAT inclusive/exclusive default is still undecided** — every document this phase produces renders that number (Phase 1 SUMMARY.md C1)
- **Currency is selectable in the UI but a sales order or supplier purchase still writes `Currency.USD`** — a currency picker over a USD-only service is worse than no picker

---

## The question that decides it

> **Can the shop hand a customer a document for every transaction, take a return without a manual repair afterwards, and trust that every report counts each unit of money exactly once?**

Phase 2 is complete when the answer is yes to all three.

---

## After the phase closes

`main` is not touched. The cumulative history is preserved on `develop`; no phase-specific branch is created.

```bash
git checkout develop
git pull origin develop
git push origin develop
```

The single merge into `main` is considered once, after Phase 4 is complete, reviewed, tested and approved.
