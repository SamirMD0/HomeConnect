# BIRD GAP ANALYSIS

Comparison against the BIRD feature set as observed during manual review.

**Method and its limits.** Home Connect is assessed from its code. BIRD is assessed from observed screens and from what a mature generic ERP of its type reliably provides. So every BIRD-side judgement carries lower confidence than every Home Connect-side judgement, and the ratings below give BIRD the benefit of the doubt on anything a mature product would normally have.

**The comparison that matters** is not feature count. It is: *which system does this specific shop's actual work better, more safely, and faster.*

---

## Capability comparison

| BIRD capability | Home Connect | Confidence | Basis |
|---|---|---|---|
| Customer ID card / profile | **BETTER** | High | Full profile + derived balance + financial summary + activity timeline + service history + sales history + WhatsApp link, all on one screen |
| Supplier ID card / profile | **ROUGHLY EQUIVALENT** | Medium | Comparable profile and ledger; HC lacks payable due dates |
| Salesman ID card | **NOT NEEDED** | High | One or two staff. `createdById` already attributes every record |
| Customer credit (credit sales) | **BETTER** | High | Debts + installment plans + prepaid layaway + partial allocation across obligations |
| **Credit limit** | **NOT IMPLEMENTED** | High | Zero matches. BIRD has it. Cheap to add |
| Maturity / due dates (customer) | **ROUGHLY EQUIVALENT** | High | `dueDate` + aging tiers + overdue alerts |
| **Maturity / due dates (supplier)** | **WEAKER** | High | `SupplierTransaction` has no `dueDate`. Cannot answer "what must I pay this week" |
| Sales invoices — data model | **BETTER** | High | 3 channels, 8-state validated workflow, line snapshots, explicit debt linking, 15-action audit |
| **Sales invoices — printed document** | **SIGNIFICANTLY WEAKER** | High | **HC cannot print a sales invoice at all.** BIRD certainly can |
| Purchase invoices | **ROUGHLY EQUIVALENT** | Medium | Priced lines + payable + audit; HC lacks cost-price update and due dates |
| Receipt vouchers | **WEAKER** | High | HC records payments correctly but **prints no voucher to hand the customer** |
| Supplier payments | **ROUGHLY EQUIVALENT** | High | |
| Customer / supplier balances | **BETTER** | High | **Derived, so drift is impossible.** BIRD-class systems typically store and reconcile balances |
| Inventory — correctness | **SIGNIFICANTLY BETTER** | High | Append-only ledger + CAS on every path + `@unique` links + self-reconciliation. Very few systems in this class can prove their own stock arithmetic |
| Inventory — valuation | **SIGNIFICANTLY WEAKER** | High | HC has **no stock value report**. BIRD, with accounting, has this natively |
| **Warehouse management** | **NOT NEEDED** | High | One stockroom. Do not build this |
| **Branches** | **SIGNIFICANTLY WEAKER** | High | HC has **zero** branch support — `branchId` is dead scaffolding. Relevant only if a second site is real |
| POS | **SIGNIFICANTLY WEAKER** | Medium | No cart, tender, drawer, shift close, or receipt. Scanner Hub is lookup + quick order, not a till |
| Barcode | **BETTER** | High | Unique SKU + manufacturer barcode + native EAN-13/UPC-A/EAN-8 + PC wedge + **phone-as-scanner over LAN**. The phone scanner is unlikely to exist in BIRD |
| Stock movements | **BETTER** | High | 11 typed movements, append-only, full provenance, compensating reversals |
| **Product classifications / categories** | **WEAKER** | High | **No category model or field at all.** BIRD has classifications |
| Brands | **WEAKER** | High | Plain string, no `Brand` table. Mitigated by a normalization/dedupe endpoint |
| **Units of measure** | **NOT IMPLEMENTED** | High | Appliances sell as pieces. Likely **NOT NEEDED** |
| **Selling types / price levels** | **WEAKER** | Medium | HC has one selling price per product; BIRD supports multiple price types. But HC's **pricing formula engine** is arguably a better answer to the same need |
| Discounts | **WEAKER** | High | Order-level only; the per-line discount column exists but "the current UI always submits zero" |
| **VAT groups / tax** | **NOT IMPLEMENTED → APPROVED, Phases 1–3** | High | **Resolved 2026-08-26: approved**, default 11%, configurable via `TaxRate` + `TaxProfile`, snapshotted per invoice line |
| **USD / LBP dual currency** | **NOT IMPLEMENTED → APPROVED, Phases 1–3** | High | Was the largest open question. **Resolved 2026-08-26: approved.** Rate snapshotted per transaction; see CURRENCY_AND_VAT_DECISION.md |
| **Exchange rates** | **NOT IMPLEMENTED → APPROVED, Phase 1** | High | Append-only `ExchangeRate` table; corrections add rows, never edit |
| **Journal vouchers** | **NOT IMPLEMENTED** | High | Deliberate. See `GENERAL_LEDGER_DECISION.md` |
| **Debit / credit accounting** | **NOT IMPLEMENTED** | High | Deliberate |
| **Trial balance / P&L / balance sheet** | **NOT IMPLEMENTED** | High | Deliberate — external accountant |
| Reports — operational | **BETTER** | High | 16 reports, CSV on all, derived from the same domain functions as the screens so they reconcile by construction |
| **Reports — profit / margin / COGS** | **SIGNIFICANTLY WEAKER** | High | **HC has none.** This is the most important gap in the entire comparison |
| Dashboard | **SIGNIFICANTLY BETTER** | High | 7 analytics domains + an alerts centre that names *who* to chase with deep links. BIRD-class systems are report-driven, not dashboard-driven |
| Alerts / exception centre | **SIGNIFICANTLY BETTER** | Medium | 3 severities, sorted, named offenders, routed |
| **Payroll** | **NOT NEEDED** | High | Do not build |
| Printing — labels | **BETTER** | High | Auto-fit labels, native symbology, bulk A4 tiled sheets with PDF export |
| **Printing — documents** | **SIGNIFICANTLY WEAKER** | High | No invoice, receipt, or statement |
| Export | **ROUGHLY EQUIVALENT** | Medium | CSV on every report, PDF for labels |
| Audit trail | **SIGNIFICANTLY BETTER** | High | 5 audit tables, mandatory reasons, before/after JSON, actor snapshots, IP, request ID. Generic ERPs rarely match this |
| Backup / restore | **SIGNIFICANTLY BETTER** | Medium | Checksums, readability verification, automatic pre-restore safety backup, write blocking, admin gate |
| **Service / repair jobs** | **SIGNIFICANTLY BETTER** | High | 12 statuses, routing decisions, warranty tracking, company hand-off, full audit. **BIRD has no equivalent — this is bespoke to this business** |
| **Installment plans** | **BETTER** | High | Monthly + weekly, deterministic schedules, per-installment allocation and overdue tracking |
| **Prepaid / layaway** | **BETTER** | High | Deposit → deliver → auto-remainder-debt, reversible. Genuinely uncommon |
| **Pricing formula engine** | **SIGNIFICANTLY BETTER** | High | Compound/simple modes, 5 percentage inputs, 4 rounding modes, presets + per-product override. A real domain asset |
| Remote access | **WEAKER** | High | Both are local; HC binds loopback. Its web architecture makes this *reachable*, but it is **not implemented** and gets no credit |
| Modern UX | **SIGNIFICANTLY BETTER** | Medium | React 19, coherent design system, bilingual EN/AR, live-updating screens |
| **Operational maturity** | **WEAKER** | Medium | BIRD has years of production hardening across many businesses. HC has ~1 month at one site, no CI, and skipped integration tests |
| **Established business rules** | **WEAKER** | Medium | BIRD's edge cases were found by other people's real transactions. HC's have not been |

---

## Summary counts

| Verdict | Count |
|---|---:|
| SIGNIFICANTLY BETTER | 7 |
| BETTER | 12 |
| ROUGHLY EQUIVALENT | 6 |
| WEAKER | 8 |
| SIGNIFICANTLY WEAKER | 7 |
| NOT IMPLEMENTED (relevance open) | 6 |
| NOT NEEDED | 4 |

**Do not read this as 19-15.** Counting is the wrong operation. Two observations matter more:

1. **Home Connect's wins are structural; BIRD's wins are surface.** HC leads on correctness, auditability, recoverability, and workflows built for *this* business. BIRD leads on documents, accounting, and the confidence that comes from years of other people's transactions.
2. **BIRD's wins are cheaper to close than HC's wins are to replicate.** Printing an invoice is well-understood work. Rebuilding derived balances, compare-and-set inventory, five audit tables, a verified-restore backup system, and a bespoke service-jobs module is a year.

---

## Where BIRD is genuinely still better

Stated without hedging, because this determines the plan.

1. **Printed documents.** BIRD prints invoices, receipt vouchers, and statements. **Home Connect prints none of them.** This is the most visible day-to-day deficit — a customer paying money expects paper.
2. **Profit and margin.** BIRD's accounting yields P&L, margin, and stock valuation. HC cannot tell the owner whether the business made money. **This is the most important deficit.**
3. **Dual currency.** If this business quotes and takes payment in both USD and LBP, BIRD handles it and HC cannot represent it at all. This is not a feature gap — it is a **data-model gap**, and retrofitting it later is expensive.
4. **VAT.** If the business is VAT-registered, HC has no path to a compliant invoice.
5. **Operational maturity.** Years of production across many businesses versus one month at one site with no CI and skipped integration tests. This is real and cannot be bought with code.
6. **Product categories.** A genuine catalogue-navigation gap once the product count grows.
7. **Branches.** If a second location is real, HC has nothing.

---

## Where Home Connect is already better

1. **Balance correctness.** Derived, not stored. Drift is impossible rather than mitigated.
2. **Inventory correctness.** CAS on every path, `@unique` links preventing double-application, and a report that proves the arithmetic.
3. **Auditability.** Five audit tables with mandatory reasons and before/after snapshots.
4. **Backup and restore.** Verified, checksummed, with an automatic pre-restore safety backup.
5. **Service/repair jobs.** Bespoke to this business. BIRD has no equivalent.
6. **Prepaid layaway and installment plans.** Modelled properly, not bolted on.
7. **The pricing formula engine.** A real competitive advantage in setting prices consistently.
8. **Dashboard and alerts.** Tells the owner *who* to chase, not just that a number is bad.
9. **Barcode workflow**, including phone-as-scanner over LAN.
10. **Bilingual EN/AR** throughout, including server-generated payloads.
11. **Fit.** Every screen exists because this business needed it. No pharmacy fields, no author/edition columns, no manufacturing tabs, no unused configuration.

---

## What Home Connect needs before choosing it over BIRD

Ordered by how hard they block the decision.

**Must have — the system is not a safe replacement without these**

1. **Printable sales invoice, payment receipt, and customer statement.** The daily paper trail.
2. **Profit / margin / COGS reporting.** The raw data is already in the database and unused.
3. **JWT startup gate** (CP-1) and **session revocation** (CP-5).
4. **Idempotency on purchases and receivings** (CP-3).
5. **A rehearsed, timed restore on real data** (CP-7).
6. **DB integration tests running automatically in CI** (CP-4).
7. **A resolved answer on dual currency and VAT.** If either is required, it must be decided *before* Phase 1, because both are schema-level.

**Should have**

8. Supplier payable due dates and aging.
9. Cost-price update from receipts (CP-8).
10. An atomic return/refund flow.
11. Customer credit limit.
12. Product categories.
13. Cash on sales orders reaching the financial reports (CP-2).

**Explicitly not required to beat BIRD**

Warehouses, branches (unless a second site is genuinely planned), payroll, journal vouchers, full accounting, units of measure, loyalty, salesman commission, manufacturing.

---

## BIRD features Home Connect should NOT implement

Building these would consume the four months and make the product worse.

| Do not build | Why |
|---|---|
| **Chart of accounts, journal vouchers, debit/credit, trial balance, P&L, balance sheet** | Months of work, high correctness risk, and it duplicates what the external accountant already does. See `GENERAL_LEDGER_DECISION.md` |
| **Warehouse management** | One stockroom. `warehouse` currently matches only an icon — keep it that way |
| **Multi-branch** | Only if a second location is committed. Otherwise it is speculative architecture, and the dead `branchId` columns should be **deleted**, not filled in |
| **Payroll** | Two staff. A spreadsheet is better |
| **Units of measure / variants / serial numbers** | Appliances sell as pieces with a model number |
| **Multiple selling types / price levels** | The pricing formula engine already solves this more elegantly |
| **Loyalty programmes, salesman commission, quotations** | No business need identified |
| **Manufacturing, pharmacy fields, authors/editions** | Not this business |
| **Generic ERP configuration screens** | HC's advantage is that it has no settings nobody uses. Preserve that |
| **A full POS till** | Only if the shop actually wants counter-based checkout. An appliance sale involving discussion, delivery, and credit terms is not a till transaction. **Confirm before building** |

---

## The honest bottom line

**Home Connect is already a better system for this business's core daily work** — recording who owes what, tracking stock truthfully, running repairs, and knowing who to chase. It does that work more safely than BIRD plausibly does, because its correctness guarantees are structural rather than procedural.

**BIRD is still better at three specific things**: handing people paper, telling the owner whether the business made money, and having been proven by years of other people's transactions.

The first two are ordinary, well-understood work. The third is bought only with time and testing discipline — which is exactly what Phase 4 is for.
