# HomeConnect — ERP Positioning and Architecture Assessment

**Status:** current as of 2026-07-30, app version `1.0.7`
**Purpose:** answer the recurring question *"is HomeConnect an ERP, and how far is it from being one?"* without re-analyzing the repository. Read this before proposing any "let's make it an ERP" work.

---

## Verdict in one paragraph

HomeConnect is **not an ERP and is not an incomplete ERP.** It is a *vertical business application* — specifically an accounts-receivable and field-service system for an appliance retail/repair business. It implements roughly **two of twelve** standard ERP module families, and it implements those two well. The distance to ERP is a **category difference, not a completeness percentage**: the missing piece is not a list of features but the integrating layer (a general ledger) and a different core data shape (documents with line items rather than balances and events). Moving toward ERP is technically possible in a forced order, but is **not recommended** for this business — see [Recommendation](#recommendation).

---

## 1. What an ERP actually is

The common definition — "one big system with lots of business modules" — is wrong, and it is why this question usually gets answered badly.

> **An ERP is a system in which a single business event automatically propagates through every subsystem it touches, and all of those effects reconcile to a general ledger.**

Concrete example. A technician installs an air conditioner. In a real ERP that one posting simultaneously:

- decrements inventory at a specific warehouse/location
- posts cost of goods sold against that unit's actual carrying cost
- creates an AR invoice with tax lines
- posts revenue to a revenue account
- accrues the technician's commission
- accrues warranty liability
- updates the customer's credit exposure
- and **every one of those postings balances to zero in a double-entry journal**

Nobody enters those seven things. They are *consequences* of one event. The general ledger is the referee that guarantees the inventory module and the finance module cannot disagree.

That propagation **is** the product. A suite of modules that do not post through a shared ledger is a suite, not an ERP.

---

## 2. Standard ERP module map

| Module family | Typical contents |
|---|---|
| Financial accounting | Chart of accounts, general ledger, journal entries, trial balance, P&L, balance sheet, period close, tax engine |
| Accounts receivable | Invoices, credit notes, collections, aging, credit limits |
| Accounts payable | Vendor bills, three-way match, payment runs, aging |
| Inventory / warehouse | Stock on hand, locations, lots/serials, valuation (FIFO / weighted average), transfers, cycle counts |
| Procurement | Requisitions, purchase orders, goods receipt, vendor price lists |
| Sales / order management | Quotes, sales orders, pricing rules, fulfillment, returns |
| Manufacturing | BOMs, routings, work orders, capacity planning |
| Field service | Jobs, scheduling, dispatch, warranty, parts consumption |
| HR / payroll | Employees, attendance, payroll runs, statutory filings |
| Fixed assets | Asset register, depreciation schedules |
| CRM | Leads, pipeline, activities |
| Cross-cutting | Multi-company, multi-currency, multi-branch, dimensions / cost centers, approval workflows, period locking, RBAC, audit |

---

## 3. HomeConnect coverage against that map

| Module family | Status | Evidence in repo |
|---|---|---|
| **Financial accounting (GL)** | ❌ absent | No account, journal, or posting model exists anywhere in `schema.prisma` |
| **Accounts receivable** | 🟩 real and well built | `Debt`, `InstallmentPlan`, `Installment`, `Payment`, `PaymentAllocation` |
| **Accounts payable** | 🟨 balance-only | `Supplier`, `SupplierTransaction` — a running balance, no bills, no matching |
| **Inventory / warehouse** | ❌ absent | `Product` has **no quantity field** — see §4 |
| **Procurement** | ❌ absent | `purchase_orders` is listed as a future phase in `docs/project/PROJECT_ROADMAP.md` |
| **Sales / order management** | ❌ absent | No order or invoice document with line items |
| **Manufacturing** | ❌ not applicable | Out of scope for this business |
| **Field service** | 🟩 real | `ServiceJob` + `ServiceRequestType`, `ServiceJobStatus`, `ServiceRoutingDecision`, `WarrantyStatus` |
| **HR / payroll** | ❌ absent | `User` is authentication + role only |
| **Fixed assets** | ❌ absent | — |
| **CRM** | 🟨 partial | `Customer` is a contact record and an AR subject; no pipeline, no leads, no activities |
| **Cross-cutting** | 🟨 thin, except audit | `Role` has two values (`ADMIN`, `EMPLOYEE`); `Customer.branchId` exists but is unused elsewhere; single currency; **audit is genuinely strong** |

**Score: 2 of 12 module families properly implemented.**

The two that are implemented are implemented well. The AR subledger with payment allocation across both debts and installments (`PaymentAllocation`), combined with `FinancialCorrectionAudit`, `AdminVerificationLog`, and the immutability policy in `backend/src/features/financial/domain/immutable-policy.ts`, is **more disciplined than many small commercial ERPs ship**. This is not faint praise — correction auditing with before/after values and admin password gating is a feature most products of this size do not have.

---

## 4. Verified facts underpinning this assessment

Taken directly from `backend/prisma/schema.prisma` on 2026-07-30.

**Model inventory — 17 models, 24 enums.**

| # | Model | Line | Role |
|---|---|---|---|
| 1 | `User` | 186 | Auth + role |
| 2 | `Customer` | 227 | Contact + AR subject |
| 3 | `Transaction` | 253 | Legacy generic ledger |
| 4 | `ActivityLog` | 283 | Legacy generic audit |
| 5 | `Debt` | 300 | AR obligation |
| 6 | `InstallmentPlan` | 329 | AR schedule |
| 7 | `Installment` | 357 | AR schedule line |
| 8 | `Payment` | 379 | Cash in |
| 9 | `PaymentAllocation` | 405 | Payment → obligation link |
| 10 | `FinancialCorrectionAudit` | 429 | Correction audit |
| 11 | `AdminVerificationLog` | 457 | Password attempt log |
| 12 | `Product` | 471 | **Catalog only** |
| 13 | `ServiceJob` | 497 | Field service |
| 14 | `ServiceAudit` | 561 | Service audit |
| 15 | `Supplier` | 585 | Vendor master |
| 16 | `SupplierTransaction` | 613 | AP movement |
| 17 | `SupplierAudit` | 646 | Supplier audit |

**The single most important fact:** `Product` (line 471) has these fields and no others —

```text
id, name, model, barcode, brand, price, discount,
isActive, notes, createdById, updatedById, createdAt, updatedAt
+ relation: serviceJobs
```

There is **no `quantity`, no `stockOnHand`, no `cost`, no `location`, no `warehouse`**. `Product` is a *reference/catalog* table whose purpose is to identify **which appliance a service job concerns**. It is not an inventory record. Nothing in the system knows how many of anything the business has.

**No general ledger primitives exist.** There is no chart of accounts, no journal entry, no account, no posting, no fiscal period, no period lock.

**The data model is balance-first, not document-first.** HomeConnect records *balances and events* (a debt of 500; a payment of 200 allocated across obligations). It does not record *documents with line items* that then produce balances.

---

## 5. The three structural gaps

These are architectural, not feature backlog items.

### 5.1 No general ledger

This is the gap that makes ERP a *category* difference rather than a completeness difference. Without a GL there is nothing forcing AR, AP, and (eventually) inventory to agree. Each module is its own island of truth, internally consistent and externally unreconciled.

You can add fifty more modules and still not have an ERP. Add a GL and post everything through it, and the architecture changes character even with the current module count.

### 5.2 No inventory, and no document model

Balance-first and document-first are genuinely different data models, and the second does not retrofit cheaply onto the first.

| | HomeConnect today | ERP |
|---|---|---|
| Primary record | An obligation or a movement with a single `amount` | A document with N line items |
| A line item | does not exist | product × quantity × unit price × tax × account |
| Balances | are stored/derived directly | are *consequences* of posted document lines |
| Stock | not tracked | derived from document lines |

Every ERP is document-first. This is the expensive gap.

### 5.3 Modules are siloed by deliberate design

From `claude/plans/supplier-management-and-ledger-plan.md` §5, out of scope:

> "Any link between supplier transactions and `Product` stock or `ServiceJob`."

That was the **correct call** for that feature — and it is precisely the property that defines the distance to ERP. HomeConnect buys simplicity by *not* integrating. An ERP spends its entire complexity budget on exactly that integration.

This is worth stating plainly because it is easy to read the siloing as an oversight to be fixed. It is a design decision with a real payoff.

---

## 6. Scale anchor

| System | Approximate entity/model count |
|---|---|
| HomeConnect | 17 models |
| ERPNext | high hundreds to low thousands of doctypes |
| Odoo (core + standard apps) | low thousands of models |

Plus, in both of those: a posting engine, a tax engine, and an inventory valuation engine — three subsystems HomeConnect has none of.

This ratio is **not a criticism**. It is the difference between a tool built for one business and a framework built to be configured for any business. HomeConnect's smallness is a feature: it can be understood, audited, and changed by one person in an afternoon.

---

## 7. What HomeConnect actually is

**Category:** vertical business application — AR + field service for appliance retail/repair, single site, single currency, Windows desktop via Electron.

That is a legitimate and coherent product category with a real name. It is not "an ERP that isn't finished." Framing it as a deficient ERP misrepresents what has been built and invites the wrong roadmap.

What it does well:

- Accounts receivable with real payment allocation semantics
- Financial correction auditing with before/after values, reason capture, and admin password gating
- Immutability policy on financial records
- Service job lifecycle with warranty and routing
- Decimal-safe money handling end to end (no floats; money crosses the API as strings)
- Local-first operation with backup and diagnostics

---

## 8. If moving toward ERP: the forced sequence

The order below is dictated by data dependencies, not by preference. Steps cannot be meaningfully reordered.

| Step | Work | Size | Unlocks |
|---|---|---|---|
| **1** | Give `Product` real stock: `quantityOnHand`, location, and a stock-movement ledger table | ≈ one supplier-feature | Nothing else in this list works without it |
| **2** | Make purchases into **documents**: a supplier bill with line items that both increases AP **and** increases stock | ≈ one supplier-feature | Grows `SupplierTransaction` into a real AP subledger |
| **3** | Make sales into **documents**: an invoice with line items that decrements stock and creates the AR obligation already modeled well | ≈ one supplier-feature | Cost of goods sold becomes computable |
| **4** | **General ledger**: chart of accounts + posting engine; every document in steps 2–3 emits balanced journal entries | **larger than steps 1–3 combined** | Actual ERP character |

**Step 4 carries a hidden cost.** A GL introduces *period locking*, which interacts with — and partially contradicts — the existing correction and immutability policies (`immutable-policy.ts`, `FinancialCorrectionAudit`, and the retroactive-correction behavior established in v1.0.4). Those policies would need to be revisited, not merely extended. Do not scope step 4 without budgeting for that rework.

---

## 9. Recommendation

**Do not pursue ERP.**

ERP exists to solve a **coordination problem**: many departments, many warehouses, multiple legal entities, and people who never speak to each other all needing one consistent number. A single local business running on one Windows machine does not have that problem.

Adopting ERP architecture would buy a chart of accounts, period closes, and posting rules — and would cost the directness that currently makes the app usable by its owner. Small businesses that install a real ERP typically use a small fraction of it and resent the rest.

**Suggested course:**

1. Finish the supplier feature as planned (`claude/plans/supplier-management-and-ledger-plan.md`).
2. Then evaluate steps 1–2 of §8 **strictly on business evidence** — is the owner losing money by not knowing stock levels? If purchasing decisions are being made blind, inventory is worth building.
3. If the answer is no, **stop, and stop calling the gap a gap.**

The right question is never "how do we become an ERP?" It is "which single unknown is currently costing the business money?"

---

## 10. When to revisit this document

This assessment should be re-examined if any of the following becomes true:

- `Product` gains a quantity/stock field, or a stock-movement table appears
- Any document-with-line-items model is introduced (invoice, bill, order)
- A chart of accounts, journal entry, or fiscal period model appears
- The business expands to multiple branches (note: `Customer.branchId` already exists and is unused — this is the latent hook)
- Multi-currency or multi-company becomes a requirement
- Payroll or fixed assets enter scope

Any one of those changes the analysis in §5 and may change the verdict in §9.

---

## Related documents

- `claude/PROJECT_BRIEF.md` — orientation, stack, runtime architecture
- `claude/plans/supplier-management-and-ledger-plan.md` — the AP/supplier-ledger feature plan referenced throughout
- `docs/project/PROJECT_ROADMAP.md` — phase history; lists `purchase_orders` as future
- `docs/project/FINANCIAL_FLOW_AUDIT.md` — AR flow detail
