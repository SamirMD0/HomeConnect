# HomeConnect — ERP Positioning and Architecture Assessment

**Status:** current as of 2026-08-08, app version `1.6.0`
**Previous assessment:** 2026-07-30, version `1.0.7` (superseded — see §2)
**Approved next direction:** Financial Truth Foundation, **without expenses** — see §6
**Purpose:** answer the recurring question *"is HomeConnect an ERP, and how far is it from being one?"* without re-analyzing the repository. Read this before proposing any "let's make it an ERP" work.

---

## 0. Verdict update

**The verdict is unchanged. The reasoning behind it has changed materially, and one new risk has appeared.**

HomeConnect is still **not an ERP and not an incomplete ERP.** It is a *vertical business application* — accounts receivable, field service, and now retail sales operations for an appliance retail/repair business.

What changed since 2026-07-30 is that HomeConnect **crossed the document-with-line-items threshold** (`SalesOrder` + `SalesOrderItem`) and **grew product stock fields** (`trackStock`, `stockQuantity`, `costPrice`) — two of the four things the previous document listed as absent. But it crossed them **decoratively**: the sales document does not move stock, does not create a cash record, and does not post anywhere. The stock number is an admin-typed counter with no movement history.

So the distance to ERP is still a **category difference, not a completeness percentage** — but the character of the gap has shifted:

| | 2026-07-30 | 2026-08-08 |
|---|---|---|
| The problem | Missing structures (no documents, no stock, no GL) | Structures exist and **carry no consequences** |
| Risk profile | Honest simplicity | **Numbers that look integrated but are not** |

That second row is the important one. The previous document could say "the modules are siloed by deliberate design, and that is a real payoff." That is no longer entirely true. Sales orders introduced a **second definition of cash received** (`sales_orders.paidAmount`, unbacked by any `Payment` row) and a **stock counter nothing maintains**. Those are not clean silos — they are two places to read the same fact and get different answers.

**The recommendation is therefore no longer "do nothing until a business unknown costs money."** A business unknown now *does* cost money: **how much cash actually came in, who owes the business, and who the business has paid.** Those three questions are answerable from records that already exist, once the contradictions between them are removed. See §6.

Profit is a *fourth* question, and it is deliberately **not** the next one — it requires recorded costs, which requires a whole cost side of the system that does not exist. Answering three questions correctly is worth more than answering four questions approximately.

---

## 1. What an ERP actually is

*(unchanged — this section did not need revision)*

The common definition — "one big system with lots of business modules" — is wrong, and it is why this question usually gets answered badly.

> **An ERP is a system in which a single business event automatically propagates through every subsystem it touches, and all of those effects reconcile to a general ledger.**

Concrete example. A technician installs an air conditioner. In a real ERP that one posting simultaneously:

- decrements inventory at a specific warehouse/location
- posts cost of goods sold against that unit's actual carrying cost
- creates an AR invoice with tax lines
- posts revenue to a revenue account
- accrues the technician's commission
- updates the customer's credit exposure
- and **every one of those postings balances to zero in a double-entry journal**

Nobody enters those things. They are *consequences* of one event. The general ledger is the referee that guarantees the inventory module and the finance module cannot disagree.

That propagation **is** the product. A suite of modules that do not post through a shared ledger is a suite, not an ERP.

**Applying the test to HomeConnect today.** A customer buys a fridge at the counter:

| ERP consequence | HomeConnect today |
|---|---|
| Sales document with lines | ✅ `SalesOrder` + `SalesOrderItem` — **this now exists** |
| Stock decrements | ❌ nothing happens; `stockQuantity` is untouched |
| Cash / AR movement | 🟨 **split**: if converted to a debt, real AR; if paid at the counter, a number typed into `sales_orders.paidAmount` that `payments` never sees |
| Revenue posting | ❌ no revenue accounts exist |
| COGS posting | ❌ `costPrice` exists but is a pricing input, never a cost of sale |
| Reconciles to a GL | ❌ no GL |

One of six. The document exists; the propagation does not.

---

## 2. What changed since the last assessment

Verified against `backend/prisma/schema.prisma` on 2026-08-08 (1031 lines, **24 models, 36 enums** — up from 17 models, 24 enums).

### 2.1 Product is no longer catalog-only — the old §4 claim is wrong

The previous document's "single most important fact" said `Product` has *no quantity, no stockOnHand, no cost, no location, no warehouse*. **Three of those five are now false.**

[schema.prisma:618-667](backend/prisma/schema.prisma#L618-L667) — `Product` gained:

- `sku` (unique, with a generation/regeneration policy), `barcode` unique
- `costPrice`, `pricingPresetId` → `PricingPreset`, `useCustomPricing`, six `custom*Percent` overrides, `customCalculationMode`
- `installmentEnabled`
- **`trackStock`, `stockQuantity`, `lowStockThreshold`**
- `specifications` (Json), `specificationNotes`
- `labelBarcodeSource`, `imageUrl`, and a separate `ProductImage` blob table

Still absent: `location`, `warehouse`, lots/serials, valuation method.

**But `stockQuantity` is not inventory.** It is mutated by exactly one path — `PATCH /:productId/stock`, admin-only ([products.routes.ts:41](backend/src/features/service/products/products.routes.ts#L41)) — which writes an **absolute value**, audited via `stockSnapshot` ([products.service.ts:544](backend/src/features/service/products/products.service.ts#L544)). There is **no stock movement table**, and no other code path in the repository increments or decrements it. `sales-orders.repository.ts:24-26` only *reads* `trackStock`/`stockQuantity`/`lowStockThreshold` to display availability.

> **Correct classification: a manually-maintained shelf counter with a low-stock badge.** Useful for the shop floor. Not an inventory subsystem, and it will drift the first week nobody updates it after a sale.

### 2.2 Sales orders exist and are genuine documents — but operational, not accounting

[schema.prisma:802-889](backend/prisma/schema.prisma#L802-L889). `SalesOrder` has `orderNumber`, `salesChannel`, an 8-state `fulfillmentStatus`, `itemsSubtotal`/`deliveryFee`/`totalAmount`/`paidAmount`/`remainingAmount`, delivery snapshot fields, cancellation fields, and a full `SalesAudit` trail. `SalesOrderItem` has product FK **plus name/model/SKU snapshots**, `quantity`, `unitPrice`, `lineTotal`, and a reserved `discountAmount`.

This is a properly built document model. Snapshotting the product name onto the line is exactly right, and better than many small commercial systems manage.

Answering the three questions the review asked:

| Question | Answer | Evidence |
|---|---|---|
| Do they affect stock? | **No.** | No write to `stockQuantity` anywhere in `backend/src/features/sales/` |
| Do they create debt/installment records? | **Yes, but only on explicit user action.** | `createDebt` / `createInstallmentPlan` set `settlement = DEBT \| INSTALLMENT` and link `debtId`/`installmentPlanId` ([sales-orders.service.ts:414-437](backend/src/features/sales/sales-orders/sales-orders.service.ts#L414-L437)); a debt is created for `remainingAmount` only |
| Do they create payment/accounting events? | **No.** | `grep PaymentsService backend/src/features/sales` returns nothing. `changePayment` writes `paidAmount` directly as a column |
| Any posting? | **No.** | No accounts exist |

**The consequential defect:** the *paid* portion of a sales order never becomes a `Payment`. Only the *unpaid* remainder can become a `Debt`. So a fully-paid cash sale leaves **no trace in the financial subsystem at all** — the dashboard's `paymentsToday` / `paymentsThisMonth` cards, the receivables module, and the customer ledger never see that money. This is independently confirmed as finding §2.6.1 of [lebanese-chart-of-accounts-review-plan.md](claude/plans/lebanese-chart-of-accounts-review-plan.md).

### 2.3 Other additions since 1.0.7

| Added | Model / location | ERP significance |
|---|---|---|
| `PrepaidPurchase` | [schema.prisma:445](backend/prisma/schema.prisma#L445) | Delivery-state companion to a `PREPAID_PURCHASE` debt. Well built — but see §4.3, it is a **liability modelled as a receivable** |
| `PricingPreset` | [schema.prisma:683](backend/prisma/schema.prisma#L683) | Cost→price calculator with expense/profit/discount-buffer/installment-markup percentages. This is *pricing policy*, not accounting: `expensePercent` is a margin assumption, not a recorded cost |
| `ProductImage` | [schema.prisma:671](backend/prisma/schema.prisma#L671) | Operational |
| `RepairHistory` + repair registry + SQL safety scanner | [schema.prisma:1011](backend/prisma/schema.prisma#L1011) | Cross-cutting maintenance. Strong, and unusual for an app this size |
| Scanner Hub / mobile LAN scanner | `backend/src/features/scanner/`, [scanner-hub-mobile-lan-plan.md](claude/plans/scanner-hub-mobile-lan-plan.md) | **Does not change ERP classification.** Improves product/barcode workflow only |
| Dashboard expansion | `backend/src/features/dashboard/{month-end,sales,supplier,product,alerts,...}` | `month-end` computes opening/new/collected/adjustments/closing/reconciled on the fly — a genuinely good foundation, but **nothing is persisted or locked** |
| Lebanese CoA review plan | [lebanese-chart-of-accounts-review-plan.md](claude/plans/lebanese-chart-of-accounts-review-plan.md) | Planning only. No accounting code or tables exist |

### 2.4 What did *not* change

- **No accounting layer of any kind.** Grep for `ChartAccount`, `JournalEntry`, `JournalEntryLine`, `AccountingEvent`, `AccountMapping`, `FiscalPeriod`, `CashAccount`, `Expense` in `schema.prisma` returns **nothing**.
- **No currency column anywhere in the schema.** Single-currency is still an unstated, unenforced assumption. In a Lebanese USD/LBP context this is the highest-cost unresolved decision in the project.
- **`SupplierTransaction` is still balance-only** ([schema.prisma:943](backend/prisma/schema.prisma#L943)): `type` + `direction` + `amount`. No line items, no bills, no three-way match, no link to `Product`. AP is unchanged from the previous assessment.
- **`ServiceJob.finalPrice` is still financially orphaned.** `grep finalPrice backend/src/features/service` finds only validation, serialization, and audit-action classification — **no reference to `Debt` or `Payment` anywhere.** Maintenance revenue is priced and then disappears unless someone manually creates a matching debt.
- **`Customer.branchId` is still unused** outside auth/legacy transactions. Multi-branch remains a latent hook only.
- **Legacy `Transaction` model still exists and is still routed.** A second, older ledger shape parallel to Debt/Payment.

---

## 3. Current module coverage

| Module family | Status | Evidence |
|---|---|---|
| **Financial accounting (GL)** | ❌ **absent** | No account, journal, posting, period, or mapping model in `schema.prisma` |
| **Accounts receivable** | 🟩 **strong** | `Debt`, `InstallmentPlan`, `Installment`, `Payment`, `PaymentAllocation`, `FinancialCorrectionAudit`, `immutable-policy.ts`. Overstated by prepaid — see §4.3 |
| **Accounts payable** | 🟨 **partial (balance-only)** | `Supplier`, `SupplierTransaction` — running balance, no bills, no line items, no matching |
| **Inventory / warehouse** | 🟨 **nominal** *(was ❌)* | `trackStock`/`stockQuantity`/`lowStockThreshold`/`costPrice` exist; **admin-set absolute value only, no movement ledger, no sales coupling, no location, no valuation** |
| **Procurement** | ❌ **absent** | `purchase_orders` still a future phase in `docs/project/PROJECT_ROADMAP.md` |
| **Sales / order management** | 🟩 **real (operational)** *(was ❌)* | `SalesOrder` + `SalesOrderItem` + `SalesAudit`, 8-state fulfillment, delivery, channels. **Not an accounting document** — see §2.2 |
| **Manufacturing** | ⬜ **out of scope** | Not applicable to this business |
| **Field service** | 🟩 **strong (financially orphaned)** | `ServiceJob`, `ServiceAudit`, routing, warranty. `finalPrice` reaches no financial record |
| **HR / payroll** | ❌ **absent** | `User` is auth + role only |
| **Fixed assets** | ❌ **absent** | — |
| **CRM** | 🟨 **partial** | `Customer` is contact + AR subject; profile/search work improved usability, not pipeline. No leads, no activities |

**Cross-cutting:**

| Concern | Status | Evidence |
|---|---|---|
| Audit | 🟩 **strong** | Five domain audit tables (`FinancialCorrectionAudit`, `ServiceAudit`, `SalesAudit`, `SupplierAudit`, `AdminVerificationLog`), all with before/after values, reason capture, actor snapshot, request id, IP |
| Roles / RBAC | 🟨 **thin** | `Role` = `ADMIN` \| `EMPLOYEE`; admin-password gating on sensitive mutations is the real control |
| Multi-branch | ❌ **absent** | `Customer.branchId` exists, unused |
| Multi-currency | ❌ **absent** | **No currency column exists anywhere** |
| Backup / diagnostics / repair | 🟩 **strong** | `backup`, `diagnostics`, `preflight`, `maintenance` features; `RepairHistory`; SQL safety scanner |
| Scanner / mobile | 🟩 **real** | Scanner Hub + LAN mobile scanner. **Orthogonal to ERP classification** |
| Local-first operation | 🟩 **strong** | Electron + local Postgres, offline-capable by design |

**Score: 3 of 12 module families properly implemented** (AR, field service, sales-as-operations) — up from 2, plus a nominal inventory counter and a balance-only AP.

**The score is not the point.** A twelfth module would not change the classification. The GL would.

---

## 4. Current financial and accounting gaps

### 4.1 Four competing definitions of a balance

This is the single most important finding of this revision, and it is new since 1.0.7.

1. **`sales_orders.paidAmount`** — admin-typed, audited, but backed by no `Payment` row. Two answers now exist to "how much cash came in today."
2. **`service_jobs.finalPrice`** — priced, audited, and financially inert. Service revenue is invisible to finance.
3. **Legacy `Transaction`** — a second, older ledger shape, still routed at `/api/v1/transactions`.
4. **Supplier balance** — summed over `supplier_transactions.direction`, computed independently of the customer-side balance engine.

The previous document praised the siloing as a deliberate simplicity purchase. That was accurate when the silos were *disjoint*. Items 1–3 are not disjoint — they are **the same fact recorded in two places with no reconciliation**. That is the failure mode ERPs exist to prevent, and HomeConnect has now imported a small dose of it without importing any of the machinery that manages it.

### 4.2 No cost side of the business exists at all — *a real gap, deliberately deferred*

Grep for "expense" in the backend returns only `expensePercent` / `customExpensePercent` — **pricing assumptions, not recorded costs.** Rent, salaries, electricity, delivery, and repairs cannot be entered anywhere in the system.

Consequence: **HomeConnect cannot compute profit, and cannot be made to.** Not "computes it imprecisely" — there is no input.

**This is documented as a gap, not scheduled as the next feature.** It is genuinely the largest missing piece of the *profit* picture, and it is the natural feature after the next one — but profit is a derived question, and every derived question inherits the errors in §4.1, §4.3, and §4.4. An expense module built before those are fixed produces a profit number computed from a cash figure the system disagrees with itself about. Fix the inputs; then add the cost side. See §6 and §9 step 2.

### 4.3 Prepaid customer balances are classified wrong

`DebtKind.PREPAID_PURCHASE` creates a `Debt` that the customer pays *into* before delivery. An undelivered customer prepayment is a **liability** (customer advance), not a receivable. It currently sits in the same table as real receivables, so **AR-based figures and aging are overstated by the open prepaid balance.** The `PrepaidPurchase` model is well built for delivery tracking; the classification is the issue, not the implementation.

### 4.4 Cash has no location

`PaymentMethod` (`CASH` / `CARD` / `BANK_TRANSFER` / `OTHER`) is a *label on a payment*, not a balance-carrying account. There is no cash box and no bank balance. The system cannot answer "how much money should be in the drawer right now."

### 4.5 No currency

No currency column anywhere. If dual-currency (USD/LBP) is real for this business — and in Lebanon it usually is — retrofitting it **after** an accounting layer is built is dramatically more expensive than deciding it before.

**Decided (2026-08-08): currency-aware schema, USD default, no rate handling yet.** Carried into the next release rather than deferred. See §6.2 — this closes the cheap half of the decision and leaves the expensive half (actual multi-currency behaviour) genuinely optional.

### 4.6 No fiscal period

`dashboard/month-end` computes a month movement snapshot on the fly. Nothing is persisted, nothing is locked, so last month's reported figures can silently change.

---

## 5. ERP distance: changed or unchanged?

**Unchanged in category. Reduced in one dimension, and newly complicated in another.**

| Structural gap (from the 1.0.7 assessment) | Status now |
|---|---|
| **5.1 No general ledger** | ❌ **unchanged.** Still no account, journal, posting, or period. This remains the whole category difference |
| **5.2 No inventory, no document model** | 🟨 **half-closed, and that is the problem.** The document model arrived (`SalesOrderItem`). The stock model did not — a counter arrived instead. A document that moves nothing is a form, not a posting |
| **5.3 Modules siloed by deliberate design** | ⚠️ **no longer purely deliberate.** Sales↔stock and sales↔cash are gaps that *read* as bugs to a user looking at the screen, not as scope decisions |

**The document-first / balance-first table from the previous version, updated:**

| | HomeConnect today | ERP |
|---|---|---|
| Primary record | **Both**: obligations/movements with a single `amount`, *and* a sales document with N lines | A document with N line items |
| A line item | **exists** (`SalesOrderItem`: product × qty × unit price) — but carries **no tax, no account, no cost** | product × quantity × unit price × tax × account |
| Balances | stored/derived directly, in four unreconciled ways | *consequences* of posted document lines |
| Stock | a manually-typed integer | derived from document lines |

---

## 6. Next recommended feature

> **The right question is never "how do we become an ERP?" It is "which single unknown is currently costing the business money?"**

Applying that test honestly to the 2026-08-08 repository, the unknowns that cost money today are all **truth** problems, not **coverage** problems. The business cannot get one consistent answer to three basic questions it should already be able to answer from records it already holds:

1. **How much cash came in?** — counter sales bypass `payments` entirely (§4.1, §2.2)
2. **Who owes us?** — AR is overstated by prepaid customer advances (§4.3)
3. **Who did we pay?** — supplier balances are computed outside the financial domain, and there is no cash location at all (§4.1, §4.4)

### Recommendation — Financial Truth Foundation

> **Build one release that makes the existing numbers true. No new financial concepts, no reports, no accounting layer.**
>
> 1. **Sales-order cash becomes a real financial record.** The paid portion of a sales order creates/uses a genuine `Payment`-shaped record with allocation, instead of a bare `paidAmount` column. **Forward-fixing** — see the backfill decision in §6.1.
> 2. **Prepaid purchases stop behaving like normal customer receivables.** An undelivered advance is money the business *owes*, and must stop inflating AR figures and aging.
> 3. **`ServiceJob.finalPrice` gets prompted one-click financial actions** on completion — *create customer debt from service job* and *record payment from service job*. **Prompted, never silent.**
> 4. **Cash/bank accounts, only as far as real cash tracking requires.** Exactly three, seeded: **Cash Drawer / الصندوق**, **Bank / المصرف**, **Other / آخر**. Enough for `PaymentMethod` to resolve to a balance-carrying place. **No `type`, no parent, no official code column.** No per-person floats and no Wish/OMT accounts unless the business confirms they are used daily.
> 5. **Legacy `Transaction` frozen read-only** until its live-data status is confirmed. **Block new writes; preserve historical visibility.** Do not migrate, delete, or rewrite it in this release — freezing is reversible, migrating is not.
> 6. **Currency-aware design, USD default.** A currency column on money-carrying records from this release forward, defaulted to USD. See §6.2.

Throughout: backend stays authoritative for all totals; admin password + reason + audit on every sensitive financial change; Decimal-safe money; additive migrations only.

**What this release delivers:** one number for cash received, an AR figure that means what it says, and service revenue that stops disappearing. That is the whole deliverable, and it is enough.

**What it explicitly does not deliver:** any profit, expense, or net-income figure. Those need the cost side (§4.2), which comes after.

### 6.1 Backfill decision

The `paidAmount` fix is **forward-fixing**. Existing rows are *not* retro-converted into payments in this release, because doing so would change historical dashboard and month-end figures the owner has already seen and acted on.

The consequence must be stated in the app, not just here: **sales-order cash recorded before this release remains invisible to the payments-based figures.**

**Decided:** the "accurate from &lt;date&gt;" boundary appears on **both dashboard cards and reports** — not hidden inside reports only. Any cash figure affected by the forward-only fix must show its start date where the number is read. A separate, audited reconciliation pass over historical orders can be scoped later as its own decision.

### 6.3 Prepaid reclassification must be visible

**Decided:** moving prepaid advances out of receivables is correct, but **today's receivables number will change on the day it ships**, and that must not happen silently. The app shows an in-app before/after explanation of the reclassification. A number the owner has been reading for months cannot quietly become a different number.

### 6.2 Currency

Decided: **currency-aware schema, USD default.** This is the cheap version of the expensive decision — a currency column costs almost nothing now and is very expensive to retrofit after financial records accumulate. It does **not** commit to multi-currency behaviour: no rate table, no conversion, no dual-currency display in this release. It only guarantees that every money record says what it is denominated in, so that adding LBP later is a feature rather than a migration crisis.

### Why this, and not the alternatives

| Candidate | Verdict | Reason |
|---|---|---|
| **A. Expenses** | ⏸️ **next, not now** | Genuinely the largest missing piece of the *profit* picture — but profit is derived, and a profit number built on a contested cash figure is worse than no profit number. Also drags in categories, and categories are a chart of accounts wearing a different hat. See §9 step 2 |
| **B. Cash/bank accounts** | 🟡 **included, minimally** | Included only as far as real cash tracking requires (item 4 above). Not built out as a module in its own right |
| **C. Inventory / stock movement** | ⏸️ **not yet** | Real ERP step, but the *evidence isn't there*. The business chose `trackStock` as an opt-in per-product flag defaulting to `false` — that is not the behaviour of someone bleeding money from unknown stock. A movement ledger also needs receiving/adjustment/count workflows, which need purchase documents, which need AP line items. Three features deep. **Revisit if the owner reports buying stock he already had, or selling stock he didn't.** |
| **D. Sales documents / invoices** | ✅ **already built** — and the gap is *behind* it, not ahead | The document exists; what's missing is what it should cause. Building "invoices" now would duplicate `SalesOrder` |
| **E. Chart of Accounts** | ⏸️ **not first** | See §7 |
| **F. Customer profile / dashboard polish** | ⏸️ **defer** | Immediate usability, zero financial risk — and zero financial truth. Fine as filler, not as the next release |
| **G. Scanner / mobile continuation** | ⏸️ **defer** | Practical shop workflow. Does not touch the accounting position at all |

---

## 7. Why not Chart of Accounts yet

[lebanese-chart-of-accounts-review-plan.md](claude/plans/lebanese-chart-of-accounts-review-plan.md) (2026-08-08) sequences the accounting work as **P1 truth fixes → P2 Chart of Accounts → P3 Expenses + cash accounts**. This document agrees with **P1 first** — that is exactly the release recommended in §6 — and **defers both P2 and P3**.

The reasoning:

- **A Chart of Accounts with nothing posting to it is a settings screen.** Its value is entirely deferred, and a deferred-value feature is the easiest kind to get subtly wrong and the hardest to validate — nobody notices a bad account tree until reports are built on it.
- **The real risk of CoA-first is professional-looking wrong reports.** A trial balance built on an unbacked `paidAmount`, prepaid-inflated AR, and orphaned service revenue would be *worse than no report*, because it would be believed. Fix the inputs before formatting the outputs.
- **Cash/bank accounts in §6 are not a chart of accounts, and must not be allowed to become one.** They exist so `PaymentMethod` resolves to a balance-carrying place. The line to hold: a cash account answers *where is the money*; a chart account answers *what kind of money event was this*. The second is classification, and classification is the beginning of accounting. Do not add a `type`, a parent hierarchy, or a code column in this release — those are the seeds of a CoA, and adding them "since we're here" is exactly how this scope creeps.
- **Expenses are deferred for the same reason, one level up.** An expense needs a category, and categories are a chart of accounts wearing a different hat. Building expenses now means building CoA now, informally, without admitting it.

Hard constraints when this direction is eventually taken up:

- **No claim of Lebanese statutory compliance.** Any account codes designed in-repo are a *practical software structure*, not official codes. **An accountant must supply or validate the official chart**, and account codes must be editable rather than hardcoded, never seeded as immutable constants. Anything showing profit should carry an estimate-only disclosure until validated.
- **Currency is settled early rather than late** — see §6.2. Currency-aware, USD default, no rate handling yet.
- **Nothing in the accounting direction may change an operational workflow.** Mapping and event layers are read-plus-append only, and the existing debt/payment/installment test suite must produce byte-identical balances.

---

## 8. What should NOT be built next

| Do not build | Why |
|---|---|
| **Expense module / expense categories** | Deferred by decision. Categories are a chart of accounts in disguise, and profit built on contested inputs is worse than no profit figure (§4.2, §7). This is the *next* feature, not this one |
| **P&L, net income, profit reports** | No recorded costs exist, so any such figure would be fabricated from pricing assumptions (`expensePercent`), not actuals |
| **Trial balance / balance sheet / full accounting reports** | No accounts, no postings, and — until §6 ships — no trustworthy inputs |
| **Chart of Accounts as a standalone module** | See §7. Also: do not let the §6 cash/bank accounts grow a `type`, a parent, or a code column |
| **Journal entries / double-entry** | Nothing reliable to post yet. Also collides with the existing correction/immutability model — see §9 |
| **Period locking** | Irreversible, premature, and directly contradicts the retroactive-correction behaviour established in v1.0.4 |
| **Inventory movement ledger / COGS** | Needs purchase documents first; no evidence of business pain yet (§6) |
| **Purchase orders / supplier line items** | Whole project of its own. Post purchases to an expense/purchases category for now |
| **COGS / inventory valuation** | Requires stock movements *and* purchase costs. Two layers away |
| **A second "invoice" model** | `SalesOrder` already is the sales document. Add consequences to it, do not clone it |
| **Multi-branch / multi-company** | `branchId` is a hook, not a requirement. One site, one machine |
| **Silent automatic financial side effects** | Anything that auto-creates debts or payments without an explicit user action breaks the app's current trust model. Prompt, don't post |
| **Mixing scanner/mobile work into the financial release** | Unrelated surface, unrelated risk. Keep releases separable |

---

## 9. Forced sequence if ERP is still desired

Data dependencies dictate the order. This replaces the 1.0.7 sequence, whose steps 1 and 3 are now partly built.

| Step | Work | Status | Unlocks |
|---|---|---|---|
| **0** | **Financial Truth Foundation** — one cash record, prepaid out of AR, service revenue lands somewhere, minimal cash/bank accounts, legacy `Transaction` frozen, currency-aware with USD default (§6) | **← next release** | Everything downstream is wrong without it. Answers: cash in, who owes us, who we paid |
| **1** | **Run step 0 for a full month before adding anything.** Confirm the cash number reconciles and AR stopped moving unexpectedly | **gate, not a feature** | Proof the foundation is real. Skipping this gate is how wrong numbers get built upon |
| **2** | **Expenses** — recorded costs with categories, and the small editable account structure they require | after the gate | First genuine profit inputs. **Deferred from step 0 by decision, not by oversight** |
| **3** | **Account mapping + append-only accounting event stream** (`sourceType`/`sourceId`/`amount`/`date`/debit/credit) | later | Statements, cash movement, revenue split. **Read-plus-append only — zero workflow change** |
| **4** | **Real stock**: movement ledger, receiving, adjustments, counts — replacing the manual counter | on business evidence only | Nothing inventory-shaped works without it |
| **5** | **Purchase documents**: supplier bills with line items that raise AP *and* stock | after 4 | Grows `SupplierTransaction` into a real AP subledger; makes COGS computable |
| **6** | **Sales orders gain consequences**: decrement stock, post revenue and COGS | after 4–5 | Full propagation for the core business event |
| **7** | **General ledger**: journal entries, trial balance, period close | last | Actual ERP character |

**Step 7 carries the same hidden cost as before, and it has grown.** A GL introduces *period locking*, which interacts with — and partially contradicts — the existing correction and immutability policies (`immutable-policy.ts`, `FinancialCorrectionAudit`, and the v1.0.4 retroactive-correction behaviour, where admin corrections rewrite history by design). Those policies would need to be **revisited, not extended.** Do not scope step 7 without budgeting for that rework.

**Safety constraints for every step above:** additive migrations only; no `migrate reset`; no destructive SQL; backup before the business-PC migration (its schema was built by hand-run repair scripts and drifts from the migration history); admin password + reason on sensitive financial changes; audit every financial correction and mapping change; backend remains authoritative for all totals; Decimal-safe money end to end; **no hidden automatic financial side effects — prompt, don't post**; no mixing unrelated scanner/mobile work into a financial release.

---

## 10. Scale anchor

| System | Approximate entity/model count |
|---|---|
| HomeConnect | **24 models** (was 17) |
| ERPNext | high hundreds to low thousands of doctypes |
| Odoo (core + standard apps) | low thousands of models |

Plus, in both of those: a posting engine, a tax engine, and an inventory valuation engine — three subsystems HomeConnect still has none of.

Growing from 17 to 24 models did not move HomeConnect measurably closer to that scale, and **that is fine.** Its smallness is a feature: it can be understood, audited, and changed by one person in an afternoon.

---

## 11. What HomeConnect actually is

**Category:** vertical business application — AR + field service + retail sales operations for appliance retail/repair. Single site, single currency, Windows desktop via Electron, local-first.

That is a legitimate and coherent product category with a real name. It is not "an ERP that isn't finished." Framing it as a deficient ERP misrepresents what has been built and invites the wrong roadmap.

What it does genuinely well:

- Accounts receivable with real payment-allocation semantics across both debts and installments
- Financial correction auditing with before/after values, reason capture, and admin password gating — **more disciplined than many small commercial ERPs ship**
- Five domain audit trails with actor, reason, request id, and IP
- Immutability policy on financial records
- Service job lifecycle with warranty and routing
- Sales order fulfillment lifecycle with line-item snapshots
- Decimal-safe money handling end to end (no floats; money crosses the API as strings)
- Backend-authoritative totals
- Local-first operation with backup, diagnostics, preflight, and a repair/migration history subsystem

What it cannot currently do — and this is the honest list:

| Cannot | Addressed by |
|---|---|
| Say how much cash came in today with one number | **§6, next release** |
| Say who owes the business, without prepaid inflating the figure | **§6, next release** |
| Say what maintenance work earned | **§6, next release** |
| Say where the cash physically is | **§6, next release** (minimally) |
| Say what any month cost the business | §9 step 2 — expenses, deferred |
| Say whether the business made a profit | §9 step 2 — derived from the above |
| Say how much of anything is in the shop, reliably | §9 step 4 — inventory, on evidence only |

---

## 12. When to revisit this document

Re-examine if any of the following becomes true:

- **The Financial Truth Foundation (§6) ships** — §4.1, §4.3, and §4.4 would all need rewriting, and the §9 sequence advances to its step-1 gate
- A **stock movement table** appears, or `stockQuantity` starts being written by anything other than the admin endpoint
- **`Expense` or `ChartAccount`** models appear (§4.2 and §6 would need rewriting). A minimal `CashAccount` from §6 is expected and is *not* a trigger — but a cash account that grows a `type`, a parent, or a code column **is**
- **`AccountingEvent` / `AccountMapping`** appear — at that point re-run the §1 propagation test properly
- **`JournalEntry` / `FiscalPeriod`** appear — the verdict itself may change
- Sales orders begin **decrementing stock** or **emitting payments automatically**
- **Multi-currency becomes real** — an LBP record, a rate table, or dual-currency display (the currency *column* from §6.2 is expected and is not itself a trigger)
- The business expands to **multiple branches** (`Customer.branchId` is the latent hook) or multiple legal entities
- **Payroll or fixed assets** enter scope
- The owner reports **actual money lost to unknown stock levels** — that flips §6's ranking of candidate C

---

## Related documents

- `claude/PROJECT_BRIEF.md` — orientation, stack, runtime architecture
- [claude/plans/lebanese-chart-of-accounts-review-plan.md](claude/plans/lebanese-chart-of-accounts-review-plan.md) — the accounting readiness review; §2.6 and §6 are the source for the four-balances and semantic-mismatch findings here. **This document adopts its P1 and defers both P2 (Chart of Accounts) and P3 (Expenses) — see §7 above for why**
- [claude/plans/scanner-hub-mobile-lan-plan.md](claude/plans/scanner-hub-mobile-lan-plan.md) — scanner/mobile work; orthogonal to this assessment
- [claude/plans/Completed/supplier-management-and-ledger-plan.md](claude/plans/Completed/supplier-management-and-ledger-plan.md) — the AP/supplier-ledger feature plan (now completed/archived)
- [claude/plans/Completed/sales-orders-plan.md](claude/plans/Completed/sales-orders-plan.md) and [claude/plans/Completed/product-label-sku-stock-specifications-plan.md](claude/plans/Completed/product-label-sku-stock-specifications-plan.md) — the two plans responsible for most of §2
- [docs/project/PROJECT_ROADMAP.md](docs/project/PROJECT_ROADMAP.md) — phase history; still lists Inventory (11), POS (12), Accounting (13) as future
- [docs/project/FINANCIAL_FLOW_AUDIT.md](docs/project/FINANCIAL_FLOW_AUDIT.md) — AR flow detail
