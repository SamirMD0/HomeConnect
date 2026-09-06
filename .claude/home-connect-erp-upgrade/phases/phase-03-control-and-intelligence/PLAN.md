# PHASE 3 — CONTROL AND INTELLIGENCE

**Weeks 10–13 · Budget 140–165 hours**

---

## Branch and checkpoint

```
Required branch:  develop
Prerequisite:     acceptable Phase 2 REVIEW.md and SUMMARY.md checkpoint
```

**Do not implement this phase on `main` and do not create a Phase 3 branch.**

```bash
git checkout develop
git pull origin develop
git status
```

**Verify the checkpoint before starting** — this phase depends on Phase 1 T8 (current cost prices) and Phase 2 T8 (the cash gap resolution). Both must be accepted and present on `develop`:

```bash
git branch --show-current          # develop
git log --oneline -20              # should show the Phase 2 checkpoint
npm run test:ci                    # green, 0 skipped
# confirm cost prices update from receipts, and the T8 cash decision is live
```

If either dependency was deferred rather than merged, **stop and re-plan** — a margin report built on stale costs is a precise record of a wrong number.

---

## Objective

Make the system answer the question it currently cannot: **is this business making money?**

## Governing principle

This is the `GENERAL_LEDGER_DECISION.md` Option A+ implementation. **No chart of accounts, no journal entries, no double-entry.** The raw data — cost, price, quantity, fulfillment date — is already in the database and unused. This phase is mostly *reporting*, with one essential schema addition.

## Ordering rationale

T1 must ship before T3. A margin report built on live `Product.costPrice` would let last month's profit silently rewrite itself whenever a cost changed. And T1 is only meaningful because Phase 1 T8 made costs current — **a snapshot of a stale cost is a precise record of a wrong number.**

---

## T1 · Snapshot unit cost at fulfillment

**Objective.** Make historical margin immutable.

**Existing implementation.** `SalesOrderStockFulfillment` records product, quantity, and the movement that deducted stock. **It does not record cost.** `Product.costPrice` is a mutable current value.

**Problem.** Margin computed live against `costPrice` is not a fact — it is a moving opinion. Update a cost today and last month's reported profit changes.

**Proposed change.** ADR-15. Add `unitCostSnapshot Decimal(12,2)?` to `SalesOrderStockFulfillment`, captured from `Product.costPrice` inside the existing deduction transaction.

Rejected: weighted-average or FIFO costing — accurate, but a subsystem. For appliances bought and sold in small numbers, latest-cost is accurate enough and vastly simpler.

**Why it matters.** This is exactly the discipline `SalesOrderItem` already applies to product *identity* (`productNameSnapshot`, `skuSnapshot`). Extending it to cost is consistent, not novel.

**Files.** Migration; `schema.prisma`; `sales-order-inventory.service.ts`.

**DB impact.** One additive nullable column. **No backfill** — historical fulfillments keep a null snapshot, which correctly means "cost unknown at the time." Reports must handle null explicitly rather than substituting the current cost.

**Backend impact.** Written inside the existing `runFinancialTransaction`. Must not add a second transaction.

**Tests required.** Deduction captures the cost. Changing `costPrice` afterwards does **not** change the snapshot (INV-10). Null snapshots on historical rows are handled. A reversal does not alter the snapshot.

**Dependencies.** Phase 1 T8 (costs must be current for snapshots to be meaningful).

**Acceptance criteria.** Every new fulfillment records the cost at deduction time; the snapshot is immutable; historical nulls are handled explicitly everywhere.

**Effort.** 10–14 h · **Risk.** Low-Medium — touches the stock deduction path, which is the most safety-critical code in the system. **Change nothing about the CAS logic.**

---

## T2 · Operating expense recording

**Objective.** Give non-inventory spending a home.

**Existing implementation.** None. MANUAL supplier purchase lines are the closest thing, and they only exist against a supplier. Rent, salaries, utilities, and fuel have nowhere to go.

**Problem.** Without expenses, net profit cannot be computed — only gross margin.

**Proposed change.** A minimal `Expense` table: date, category (an enum or small lookup), amount `Decimal(12,2)`, note, optional supplier link, `createdById`, and the same soft-delete/audit discipline as the rest of the schema.

**Explicitly not** an accounting account. A labelled cash-out record.

**Ask the owner:** what expense categories does the business actually have? A wrong list means re-categorising later.

**Files.** Migration; `schema.prisma`; a new `features/expenses/` slice; frontend.

**DB impact.** One new table. Independent of everything existing — **the lowest-risk change in the entire plan.**

**Tests required.** CRUD; soft delete preserves history; expenses appear in the profit report; money is `Decimal`.

**Dependencies.** None.

**Acceptance criteria.** Expenses can be recorded, categorised, listed by period, and feed the profit report.

**Effort.** 18–24 h · **Risk.** Low

---

## T3 · Profit and margin report

**Objective.** Answer "did the business make money?"

**Existing implementation.** **None.** Zero matches for COGS, gross profit, or margin.

**Problem.** The single most important gap in the audit, and the clearest thing BIRD does that Home Connect does not.

**Proposed change.** A report showing, for a period: revenue (from fulfilled sales), COGS (from `unitCostSnapshot`), gross margin (absolute and %), operating expenses (from T2), and net. Broken down by product, brand, category (Phase 2 T7), and sales channel. CSV export, consistent with every other report.

**Handling null snapshots is a design decision, not a detail.** Recommended: exclude those lines from margin and **show the excluded count and value prominently**. Substituting the current cost would silently produce a plausible wrong number — far worse than an honest gap.

**Files.** New report slice under `features/reports/`; registry entry; frontend.

**DB impact.** Read-only.

**Backend impact.** Follow the existing report-rows pattern exactly.

**Tests required.** Margin equals revenue − COGS on known fixtures. Null snapshots are excluded and counted. Returns reduce revenue and COGS correctly. Report totals reconcile against source orders (INV-09).

**Dependencies.** T1, T2. Better with Phase 2 T7 (categories) and Phase 2 T4 (returns handled correctly).

**Acceptance criteria.** The owner can see period profit; the figures reconcile against source orders; excluded lines are visible, never hidden.

**Effort.** 28–36 h · **Risk.** Medium — **the risk is a plausible wrong number, which is worse than no number.** Reconciliation testing is mandatory.

---

## T4 · Inventory valuation report

**Objective.** Answer "what is my stock worth?"

**Existing implementation.** None. `costPrice` and `stockQuantity` both exist and are never multiplied.

**Proposed change.** A report of `stockQuantity × costPrice` per product, subtotalled by category and brand, with a grand total. Flag products with no cost price — they are excluded and must be visible.

**Files.** New report slice; registry entry; frontend.

**DB impact.** Read-only.

**Tests required.** Valuation matches a manual calculation on fixtures. Products without a cost are excluded and counted. Untracked products (`trackStock: false`) are excluded. Total reconciles with the sum of parts.

**Dependencies.** Phase 1 T8 (current costs), Phase 1 T4 (clean reconciliation baseline).

**Acceptance criteria.** The report gives a defensible stock value; exclusions are explicit.

**Effort.** 12–16 h · **Risk.** Low

---

## T5 · Owner's financial dashboard

**Objective.** Put the money picture on the front page.

**Existing implementation.** Seven analytics domains and a well-designed alerts centre — all operational. **Not one financial KPI.**

**Problem.** The dashboard answers every operational question and no financial one.

**Proposed change.** A financial section: revenue this month vs last, gross margin, expenses, net, cash collected, outstanding receivables, outstanding payables, and stock value. Use the existing dashboard cache — these are expensive aggregates.

**Files.** New dashboard sub-feature under `features/dashboard/financial/`; frontend section; `dashboard-cache.ts`.

**Backend impact.** Aggregates over sales, fulfillments, expenses, and stock. **Must be cached** — follow the existing pattern.

**Security impact.** **ADMIN-only**, consistent with reports. An employee should not see business profit.

**Tests required.** KPIs match the corresponding reports exactly. Cache invalidates correctly. Employees cannot access it.

**Dependencies.** T3, T4.

**Acceptance criteria.** The owner opens the dashboard and sees whether the business is making money; every figure matches its underlying report.

**Effort.** 24–30 h · **Risk.** Low-Medium — dashboard figures disagreeing with reports would destroy trust in both. **Test equality explicitly.**

---

## T6 · Cash flow view

**Objective.** Answer "what is coming in and going out?"

**Existing implementation.** None.

**Proposed change.** A period view: cash in (customer payments + counter cash, per the Phase 2 T8 decision), cash out (supplier payments + expenses), net movement, plus a forward look at receivables and payables due in the next 30 days.

**Files.** New report slice; frontend.

**DB impact.** Read-only.

**Tests required.** Cash in matches the collected metric. Cash out matches supplier payments plus expenses. **No double-counting** with Phase 2 T8 — this is the specific hazard.

**Dependencies.** T2, Phase 2 T5 (supplier due dates), Phase 2 T8 (cash gap resolved).

**Acceptance criteria.** Cash movement reconciles with payments and expenses; forward view uses real due dates.

**Effort.** 20–26 h · **Risk.** Medium — double-counting risk with T8. Reconciliation testing mandatory.

---

## T7 · Audit log viewer

**Objective.** Make the five audit tables readable by a human.

**Existing implementation.** Five excellent audit tables. Per-record audit endpoints exist (`/products/:id/audit`, `/sales-orders/:id/audit`, …). **There is no cross-cutting view.**

**Problem.** Answering "what did this employee change last week?" or "who cancelled this debt?" means visiting each record individually.

**Proposed change.** A unified audit viewer: filter by actor, date range, record type, action. Read-only, ADMIN-only. Union across the five tables.

**Files.** New report/audit slice; frontend.

**DB impact.** Read-only. **Check indexes** — cross-table union queries may need one; every audit table already has `changedAt` indexed.

**Security impact.** ADMIN-only. Audit data reveals everything about the business.

**Tests required.** Filters work across all five tables. Non-admins get 403. Pagination correct.

**Dependencies.** None.

**Acceptance criteria.** An admin can answer "who changed what, when, and why" from one screen.

**Effort.** 20–26 h · **Risk.** Low

---

## T9 - Currency and VAT in reporting

**Objective.** Profit, margin, valuation and the VAT return, computed correctly across two currencies.

**Existing implementation.** Phase 1 delivered `baseAmount` and the VAT line snapshots; Phase 2 made them operational. **No report consumes them yet.**

**Problem.** Margin computed on mixed-currency data without conversion is meaningless. And the business needs a VAT return.

**Proposed change.**

1. **All aggregation on `baseAmount` (USD).** Never sum in LBP - `MAX_SCHEMA_MONEY` caps at ~$111k equivalent and a year of LBP sales would overflow it (CURRENCY_AND_VAT_DECISION A7).
2. **Revenue is measured ex-VAT.** VAT is collected on the state's behalf, not earned. Margin must use `unitPriceExVat`, or every product will appear 11% more profitable than it is.
3. **Inventory valuation uses ex-VAT cost** for the same reason.
4. **A VAT report**: output VAT (sales), input VAT (purchases), net payable for a period - in USD base with the per-currency breakdown.
5. Currency shown alongside every reported figure, so nobody misreads a base-USD total as LBP.

**Why it matters.** Getting revenue-inclusive-of-VAT into a margin report is the single most likely way this phase produces a plausible wrong number.

**Files.** The profit, valuation and VAT report slices; dashboard financial section.

**DB impact.** Read-only.

**Security impact.** ADMIN-only, consistent with every other report.

**Tests required.** INV-22, plus: margin computed on a mixed USD/LBP period reconciles against hand-computed values; a VAT-inclusive sale yields the correct ex-VAT revenue; the VAT report reconciles with the sum of line snapshots.

**Dependencies.** T1, T2, T3; Phase 1 T13/T14; Phase 2 T10.

**Acceptance criteria.** Profit is correct across both currencies and excludes VAT from revenue; the VAT report reconciles exactly with invoice-line snapshots.

**Effort.** 17-37 h - **Risk.** Medium - the ex-VAT revenue rule is easy to get wrong and hard to notice.

**This is a report over snapshotted line data. It requires no General Ledger and none is being built** - `GENERAL_LEDGER_DECISION.md` stands unchanged.

---

## T8 · Phase 3 hardening and buffer

Reconciliation verification, UAT on the financial figures, polish.

**Effort.** 15–25 h

---

## Summary

| Task | Effort | Risk | Delivers |
|---|---:|---|---|
| T1 Cost snapshot | 10–14 | Low-Med | Immutable historical margin |
| T2 Expenses | 18–24 | Low | Net profit becomes possible |
| T3 Profit & margin report | 28–36 | Medium | **The biggest gap in the audit** |
| T4 Inventory valuation | 12–16 | Low | Stock value |
| T5 Financial dashboard — **reduced to a KPI strip** | **~12–18** | Low-Med | Profit on the front page |
| ~~T6 Cash flow~~ | ~~20–26~~ | — | **DESCOPED** to Phase 5 — MASTER_PLAN §10 |
| ~~T7 Audit viewer~~ | ~~20–26~~ | — | **DESCOPED** to Phase 5 — audit *data* is already captured |
| **T9 Currency + VAT in reporting** | **17–37** | Medium | **ADR-19/20/21** |
| T8 Buffer | 15–25 | — | — |
| **Total** | **101–160 h** | | |

**Now fits the 140–165 h budget**, after descoping T6 and T7 and reducing T5 per MASTER_PLAN §10 — which is what funded currency and VAT.

**Never defer T1 or T3.** T1 because every day without it is another day of unrecoverable cost history; T3 because it is the entire point of this phase.

**Definition of done:** the owner can see profit, margin, expenses, and stock value **across both currencies, with revenue measured ex-VAT** · a VAT return reconciles with invoice-line snapshots · every figure reconciles with its source · nothing is a plausible-looking guess.

*(Cash flow moved to Phase 5.)*

---

## Explicitly out of scope

Per `GENERAL_LEDGER_DECISION.md`: no chart of accounts, no journal entries, no debit/credit, no trial balance, no balance sheet, no VAT accounting, no period closing.

**If any of these start to seem necessary during this phase, stop and re-read that document.** The pull toward "while we're here, let's do it properly" is exactly what turns a 150-hour phase into a 400-hour one and ships nothing.

The full General Ledger remains out of scope **unless the business requirements explicitly change** — and that change would be a decision recorded in `GENERAL_LEDGER_DECISION.md`, not an assumption made mid-phase.

---

## Migration disclosure

Two tasks change the schema.

**T1 — `unitCostSnapshot` on `SalesOrderStockFulfillment`**
```
Migration required:    Yes
Backward compatible:   Yes — nullable, additive
Existing data impact:  None. NO BACKFILL. Historical fulfillments keep NULL,
                       meaning "cost unknown at the time". Reports must exclude
                       and COUNT these, never substitute the current cost —
                       substitution would invent history
Rollback strategy:     Drop the column. Snapshots captured after deployment are
                       lost, so re-running the migration forward does not restore
                       them — note this in the PR
Backup required:       Yes
Validation check:      Deduct stock, then change Product.costPrice → the snapshot
                       is unchanged (INV-10). Every existing inventory test passes
```

**This task touches `sales-order-inventory.service.ts`, which holds the compare-and-set stock logic.** The diff must show the snapshot as a pure addition — nothing about CAS, conflict handling, or movement writes may move. Commit it alone.

**T2 — `expenses` table**
```
Migration required:    Yes
Backward compatible:   Yes — a new, independent table
Existing data impact:  None. Nothing existing references it
Rollback strategy:     Drop the table. Recorded expenses are lost — export first
                       if any exist
Backup required:       Yes (standard)
Validation check:      Expenses appear in the profit report; money is
                       Decimal(12,2); soft delete preserves history
```

Everything else in this phase is **read-only reporting** — the lowest-risk profile of any phase.

---

## Suggested commit sequence

```
feat: snapshot unit cost at stock fulfillment            (T1)
test: assert cost snapshot immutability                  (T1)
feat: add operating expense recording                    (T2)
feat: add profit and margin report                       (T3)
test: reconcile profit report against source orders      (T3)
feat: add inventory valuation report                     (T4)
feat: add owner financial dashboard section              (T5)
test: assert dashboard KPIs equal their reports          (T5)
feat: add cash flow view                                 (T6)
test: assert counter cash is not double counted          (T6)
feat: report profit and margin on ex-vat revenue in usd  (T9)
feat: add vat return report                              (T9)
```

Commit T1 **first and alone**. It is the schema change, it touches the most safety-critical file in the system, and every later task in this phase depends on it.

---

## Phase completion

```
1. REVIEW.md completed
2. Tests passing (npm run test:ci, 0 skipped)
3. CI passing
4. SUMMARY.md updated with evidence and verdict
5. Coherent work committed and pushed to develop
6. main tip confirmed unchanged
7. No phase-specific branch created
8. Phase 4 continues on develop only if the verdict permits it
```

```bash
git checkout develop
git pull origin develop
git push origin develop
```
