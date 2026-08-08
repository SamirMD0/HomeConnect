# Codex Implementation Prompt — Financial Truth Foundation / أساس الحقيقة المالية

Copy everything below the line into Codex.

**Prerequisite:** `claude/plans/financial-truth-foundation-plan.md` must exist first. It is produced by
`claude/plans/Prompts/financial-truth-foundation-cp1-prompt.md` (CP1, review only). Do not run this prompt
before that plan is written and approved.

---

You are implementing a feature in the **HomeConnect** repository (Node/Express + Prisma/Postgres backend,
React 19 + TypeScript frontend, Electron desktop shell, single shop PC).

## Your source of truth

Read this file first and treat it as the specification:

```
claude/plans/financial-truth-foundation-plan.md
```

**If that file does not exist, stop immediately and say so.** Do not improvise the design from this prompt —
this prompt carries the rules, the plan carries the design. They are not interchangeable.

Also read, and treat as binding:

- [claude/documentation/ERP_POSITIONING.md](claude/documentation/ERP_POSITIONING.md) §6, §7, §8 — the
  approved scope and, more importantly, the approved **non**-scope.
- `docs/UI_GUIDELINES.md` — one page, binding, before any frontend code.

**Do not redesign the plan.** If you believe part of it is wrong, stop and say so in your response before
writing code — do not silently deviate.

## What you are building

The system currently gives **two different answers to "how much cash came in"** and **one wrong answer to
"who owes us"**. This feature makes the existing numbers true. It adds no new financial concepts.

Concretely, four defects:

1. **Sales-order cash is invisible to finance.** `sales_orders.paidAmount` is a plain column written by
   `changePayment`. It is backed by no `Payment` row, so a fully-paid counter sale leaves **no trace** in the
   payments table, the dashboard cash cards, or the receivables module.
2. **Prepaid advances inflate receivables.** `DebtKind.PREPAID_PURCHASE` debts are money the customer paid
   *in advance*. They sit in the same table as real receivables, so AR and aging are overstated.
3. **Service revenue is orphaned.** `ServiceJob.finalPrice` reaches no `Debt` and no `Payment`. Maintenance
   work is priced and then vanishes from finance.
4. **Cash has no location.** `PaymentMethod` is a label, not a balance. The system cannot say how much money
   should be in the drawer.

When this ships, the app answers three questions with one number each: **how much cash came in**, **who owes
us**, **who did we pay**. That is the entire deliverable.

## What you are NOT building — read this twice

These are approved exclusions, not oversights. Each one has a reason recorded in `ERP_POSITIONING.md` §7–§8.

| Do not build | Why |
|---|---|
| `Expense` model, expense categories, expense screens | Deferred by decision. Categories are a chart of accounts wearing a different hat |
| P&L, net income, profit figures, margin reports | No recorded costs exist; any such number would be fabricated from `expensePercent` pricing assumptions |
| Trial balance, balance sheet, income statement | No accounts, no postings |
| `ChartAccount`, account codes, account hierarchy | See §7. **The three cash accounts below are not a chart of accounts and must not grow into one** |
| `JournalEntry`, `JournalEntryLine`, double-entry, posting engine | Nothing reliable to post yet |
| `AccountMapping`, `AccountingEvent` | Later phase |
| `FiscalPeriod`, period locking, month close | Irreversible, premature, contradicts the v1.0.4 retroactive-correction behaviour |
| Inventory movement, stock decrement, COGS | Sales orders still do not touch stock in this phase |
| Retroactive conversion of historical `paidAmount` | Forward-only. See rule 5 |
| Multi-currency behaviour, rate tables, conversion, dual display | Currency **column** only. See rule 9 |
| Scanner, mobile, product, or label work | Unrelated surface, unrelated risk. Keep the release separable |

If the plan asks for something in this table, **stop and report the contradiction.** Do not build it.

## Non-negotiable rules

1. **All money math goes through `backend/src/features/financial/domain/money.ts`.** Use `parseMoney`,
   `addMoney`, `subtractMoney`, `sumMoney`, `compareMoney`, `moneyToApiString`, `isZeroMoney`. Any new file
   that imports `Decimal` and does its own arithmetic is wrong. Columns are `Decimal @db.Decimal(12, 2)`.

2. **All money crosses the API as a decimal string**, produced by `moneyToApiString`. Never as `number`. No
   JavaScript float math on money at any layer. The frontend types every money field as `string`.

3. **The backend calculates every total. The client is never trusted.** No balance, no cash total, and no
   receivables figure is ever computed in the frontend. If a request body contains a derived total, it is
   ignored and recomputed.

4. **Reuse the payment path; do not clone it.** Sales-order cash must produce a **real `Payment` +
   `PaymentAllocation`** through the existing `financial/payments` service — not a parallel table, not a
   second allocation mechanism, not a "sales payment" model. If the existing path cannot accept a
   sales-order-originated payment without modification, the plan says exactly what additive change it needs.
   Make that change and nothing more. A second way to record cash is the bug this feature exists to remove;
   do not introduce a third.

5. **The `paidAmount` fix is forward-only.** Do **not** backfill, migrate, or convert historical
   `sales_orders.paidAmount` values into `Payment` rows. Historical orders keep their column value and stay
   invisible to payments-based figures. A backfill would silently change months the owner has already read
   and acted on. This is a separate, explicitly approved decision that is not part of this release.

6. **Every cash figure affected by rule 5 displays an "accurate from &lt;date&gt;" boundary — on dashboard
   cards *and* on reports.** Not a footnote on a report page only. The number and its boundary appear
   together, wherever the number is read. Bilingual, following the existing `month-end` `disclosure`
   pattern. A cash card without its boundary is an incorrect card.

7. **Prepaid reclassification ships with a visible before/after.** Separating advances from AR is correct and
   it **will change today's receivables number**. Show an in-app before/after explanation. Do not let a
   figure the owner has read for months quietly become a different figure. The reclassification is a
   *presentation and calculation* change — **do not rewrite, re-kind, or migrate existing `Debt` rows** to
   achieve it unless the plan explicitly specifies a schema change, and even then: additive only.

8. **Cash accounts are exactly three, seeded, and minimal:** `Cash Drawer / الصندوق`, `Bank / المصرف`,
   `Other / آخر`. **No `type` column. No `parentId`. No account `code`.** No per-person floats, no
   Wish/OMT accounts. Those three columns are the seeds of a chart of accounts, and adding them "while we're
   here" is exactly how this scope creeps. A cash account answers *where is the money*; it must never start
   answering *what kind of money event was this*.

9. **Currency-aware, USD default.** Money-carrying records gain a currency column defaulting to `USD`. That
   is the whole currency scope: **no rate table, no conversion, no dual-currency display, no LBP UI.** The
   column exists so that adding LBP later is a feature rather than a migration crisis.

10. **Service-job financial actions are prompted, never automatic.** Two explicit one-click actions —
    *create debt from service job* and *record payment from service job*. Nothing fires on a status change.
    Nothing posts in a background job. The user sees what will be created before it is created. **Guard
    against double-raising:** the action is user-triggered and therefore repeatable, so a job that already
    has a linked financial record returns **409**, not a second debt.

11. **Legacy `Transaction` is frozen read-only, not removed.** Block new writes at
    `/api/v1/transactions` ([app.ts:118](backend/src/app.ts#L118) mounts
    `backend/src/routes/transactions.routes.ts`). **Preserve historical reads.** Do not drop the table, do
    not delete rows, do not migrate data, do not remove the route. Whether it holds live data is a question
    about the shop's database, not about this code — if the plan has not answered it, freezing writes is
    still correct and safe.

12. **`backend/src/features/financial/` is the accounting kernel — call it, don't rewrite it.** `money.ts`,
    `balances.ts`, `statuses.ts`, `payment-allocation.ts`, `prepaid-balance.ts`, `installment-schedule.ts`,
    `immutable-policy.ts`, and `business-date.ts` already work and are covered by tests. Additive changes
    sanctioned by the plan are fine (an optional `tx?` parameter is the established precedent). A rewrite of
    balance or allocation logic is not — **stop and report** if the plan appears to require one.

13. **Sensitive mutations require `accountPassword` + `reason`.** The field is named `accountPassword`, not
    `adminPassword`. Verify with `verifyAdminPassword` from `backend/src/lib/admin-verification.ts` **inside
    the same transaction as the write**. `reason` uses `userTextSchema({ field: '…', min: 5, max: 1000 })`.

14. **The password is never stored, logged, echoed, or written into audit JSON.** Confirm
    `backend/src/lib/redaction.ts` covers every new route.

15. **Every financial mutation writes exactly one audit row inside the transaction that performs it.** Never
    after commit — a crash in between produces an unexplained change to a money figure. `beforeValues` /
    `afterValues` carry only the changed keys, money as strings. `changedByName` / `changedByUsername` are
    denormalised at write time so history survives a user rename.

16. **Historical financial records are never rewritten.** Corrections are *recorded*, not applied in place.
    This is the existing `FinancialCorrectionAudit` + `immutable-policy.ts` contract and this feature does
    not get an exception to it.

17. **No hidden automatic financial side effects. Prompt, don't post.** If a user action creates a debt or a
    payment, the user saw it coming and confirmed it. This is the app's current trust model and it is worth
    more than the convenience of automation.

18. **Every changed number must be explainable to the owner in one sentence.** If you cannot write that
    sentence for a figure you changed, the change is wrong or the disclosure is missing.

19. **Sales orders still never write stock.** Not on create, confirm, delivery, cancel, or return.
    `Product.trackStock` / `stockQuantity` / `lowStockThreshold` stay read-only hints. The inventory module
    owns stock movement, and it does not exist yet.

20. **Use the UI primitives.** `Button`, `IconButton`, `Card`, `CardHeader`, `Badge`, `Modal`, `FormField`,
    `Input`, `Textarea`, `Select`, `Table`, `Pagination`, `PageHeader`, `SectionHeader`, `EmptyState`,
    `Skeleton`, `BilingualLabel` from the UI barrel. **Import by relative path** (`../../components/ui`) —
    there is no `@/` alias in this repo, only `@frontend`, `@backend`, `@desktop`. `docs/UI_GUIDELINES.md`
    line 40 says `@/components/ui` and is wrong; do not add the alias to make that line true. If a screen
    declares its own button, card, badge, or input classes, it is wrong. Neutrals are `slate-*` — **never
    `gray-*`**. Accent is `brand-*`. `success`/`warning`/`danger`/`info` are reserved for **state**, never
    decoration. Charts use `--viz-*` from `.viz-root`.

21. **Tailwind v4 does not read `tailwind.config.js`** — that file was deleted deliberately. All tokens live
    in the `@theme` block of `frontend/src/styles/index.css`. A token added anywhere else silently resolves
    to nothing.

22. **The app is light-only.** Do not add `prefers-color-scheme` blocks or a dark variant.

23. **Do not convert the app to RTL.** Layout stays LTR. Bilingual labels are single strings of the form
    `English / العربية` held in `Record<Enum, string>` maps — copy
    `frontend/src/features/service/utils/service-labels.ts` exactly. Any element rendering user-entered text
    gets `dir="auto"`. Money values never get a `dir` attribute. Never assemble a bilingual label by
    concatenation at render time.

24. **No new dependencies.** `recharts`, `lucide-react`, `zod`, `@tanstack/react-query` are installed. Do not
    add a chart, icon, date, state, or i18n library. There is no i18n framework here and this feature does
    not introduce one.

25. **One migration, early, additive only.** All schema changes land together at the schema checkpoint. **No
    `migrate reset`. No destructive SQL. No column drops. No data deletion.** Do not dribble schema changes
    across later checkpoints.

26. **The business PC's schema was built by hand-run repair scripts** and drifts from Prisma's migration
    history — as of 2026-08-06 diagnostics it held **2 of 25** `_prisma_migrations` rows against a complete
    schema. Never assume its migration history is healthy. If the plan calls for a repair-script path, the
    `.sql` must be listed in `backend/prisma/repair/manifest.json` with a matching SHA-256, or
    `RepairRegistry` rejects it as an `ORPHAN_FILE`. A file dropped in `release/` alone can only be run by
    hand in psql.

27. **Do not modify existing test files to make them pass.** `debts.*.test.ts`, `payments.*.test.ts`,
    `installment-plans.*.test.ts`, `sales-orders.*.test.ts`, `service-jobs.*.test.ts`, `dashboard*.test.ts`,
    `balances-statuses-allocation.test.ts`, `calculation-contract.test.ts`, and
    `prisma/financial-domain-schema.test.ts` are your regression net. Extend where genuinely needed. **Every
    existing balance expectation must stay byte-identical except the specific ones the plan names as
    intentionally changing** — and each of those must be changed in its own commit-sized step with the
    reason in the diff.

28. **Do not bump the version and do not generate an installer.** That is a separate, explicitly approved
    step after the final checkpoint.

## Checkpoints

Follow the checkpoint list in §4 of the plan. It supersedes this summary if they disagree.

Shape it must have, regardless of the exact numbering:

```
CP1   (already done — the plan document itself)
CP2   Schema + single additive migration: cash accounts, currency columns,
      any origin/link fields the plan specifies. Nothing else.
CP3   Domain layer: cash-account resolution, prepaid/AR separation, any new
      pure functions — Decimal-safe, tested in isolation, no HTTP
CP4   Sales-order cash → real Payment + allocation (the core fix)
CP5   Prepaid out of receivables + the before/after disclosure data
CP6   ServiceJob prompted debt / prompted payment actions
CP7   Legacy Transaction write-freeze
CP8   Dashboard + reports: corrected figures, "accurate from <date>" boundary
CP9   Frontend: the two service-job actions, the prepaid explanation,
      the boundary display
CP10  Responsive / Arabic polish, docs, full verification
```

**The domain checkpoint comes before any HTTP work, deliberately.** Balance and separation logic is the
highest-risk code in this feature and it is pure — get it green in isolation rather than debugging a
cent-level discrepancy through a route test three checkpoints later.

**Each checkpoint must be independently releasable and independently safe to stop after.** If a checkpoint
leaves the app showing a number that is wrong in a *new* way, the checkpoint is wrongly drawn — stop and
report rather than pushing through to the next one.

## Verification at every checkpoint

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

Report the real output. **Do not weaken, skip, or delete a test to get a green run.** A failing test in the
financial domain is this feature's entire point working correctly — read it before changing anything.

## Stop and report — do not improvise

- The plan file does not exist, or contradicts the "What you are NOT building" table.
- A sales-order payment cannot be recorded because the order has **no customer** (`SalesOrder.customerId` is
  nullable; `Payment.customerId` is not). This is the most likely genuine blocker in the whole feature. It
  is a business question, not a code question — **do not invent a walk-in placeholder customer, and do not
  make `Payment.customerId` nullable**, without explicit approval.
- Any change would rewrite existing `Debt`, `Payment`, or `PaymentAllocation` rows.
- Any change to `financial/domain` beyond additive parameters.
- A figure changes and you cannot write the one-sentence explanation from rule 18.
- The existing financial test suite needs an expectation changed that the plan did not name.

At the end of each checkpoint report: what you changed, what the verification output was, which numbers on
which screens now differ from before, and what remains.
