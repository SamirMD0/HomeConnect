# Inventory v1.9.2 — Product picker + supplier debt bridge

**Status:** CP-1922 and CP-1923 implemented; CP-1924 resolved. Release validation pending.
**Created:** 2026-08-14
**Baseline:** v1.9.1 at commit `fcfea43` — committed, packaged, and pushed to `origin/main`.
**Reference docs (do not re-derive):**
`claude/plans/supplier-inventory-scanner-sales-ledger-workflow-plan.md` — architecture review, gap list
`claude/plans/inventory-v1.9.1-supplier-receiving-plan.md` — receiving design and ledger isolation

> **Deployment gate:** v1.9.1 must clear its restored-business-PC-backup rehearsal before any
> v1.9.2 implementation starts. Planning may proceed now; CP-1922 may not.

---

## 0. Three findings that shape this release

Verified in the repo during planning, so no checkpoint needs to rediscover them.

1. **The picker needs no backend work.** `ProductFilters` already carries `search`
   (`product.types.ts:113-122`), the list API already accepts it, and the search index already
   covers name, model, brand, SKU, barcode, notes and specifications
   (`lib/search-query.ts:89-95`). The 100-item ceiling is a *frontend* choice — a `<select>` that
   asks for one page of 100 and never sends a search term. **CP-1922 is frontend-only.**

2. **`CustomerPicker` is the template.** It already solves this exact problem: a search input, a
   `useCustomerSearch({ limit: 10 })` hook, and a result list, used by
   `CreateSalesOrderDialog`. The product picker should mirror its shape rather than invent one.
   This is the single biggest token saving available in v1.9.2.

3. **The bridge should route through the supplier profile, not embed a dialog.**
   `SupplierTransactionFormDialog` requires `supplier: Pick<Supplier,'id'|'name'|'phone'>`, but the
   receiving detail payload carries only `{id, name, isActive}` — **no phone**. Embedding the
   dialog on the receiving page would need an extra supplier fetch. `SupplierProfilePage` already
   holds the full supplier and already renders that dialog. Navigating there with prefill state is
   smaller, reuses more, and adds no new data dependency.

---

## 1. Scope

| # | Item | Layer |
| --- | --- | --- |
| A | Shared searchable product picker, replacing the capped `<select>` in the sales-order line editor and the receiving form | Frontend only |
| B | Admin-only "Record supplier debt" bridge from a receiving document to the existing supplier transaction form, amount blank | Frontend + one validator constant |
| C | Quick product add | **Decision only — default is defer** |

Release name: **supplier workflow bridge + product picker fix**. Minor version, not v2.0.0.
v2.0.0 stays reserved for the Financial Truth Foundation.

## 2. Explicitly excluded

Scanner POS preview (→ v1.9.3); quick-add tier B2; any change to supplier payment, customer
ledger, sales-order stock deduction or restoration, or receiving service logic; receiving edit,
delete, or reversal; automatic debt or automatic stock in either direction; COGS, valuation, FIFO,
weighted average, margin, profit; `Product.costPrice` in any calculation; WhatsApp; AI analytics;
any new backend endpoint.

---

## 3. A — Searchable product picker

### The defect

`ProductLinePicker.tsx:7` and `SupplierReceivingForm.tsx:71` both call
`useProducts({ isActive: true, pageSize: 100, … })` and render a `<select>`. The API caps
`pageSize` at 100 (`products.validator.ts:163`). A catalogue above 100 products means anything
sorted after the 100th **cannot be selected at all** — not by search, not by scrolling, not by
scanning. It fails silently and looks like a missing product.

### The fix

One shared component, mirroring `CustomerPicker`:

```
frontend/src/features/products/
  hooks/useProductSearch.ts        debounced, { limit: 10 }, mirrors useCustomerSearch
  components/ProductSearchInput.tsx  mirrors CustomerSearchInput
  components/ProductPicker.tsx       search box + results + selected summary + clear
```

Consumed by `ProductLinePicker` (sales orders) and `SupplierReceivingForm` (receiving). Both keep
their existing `onChange` contracts, so their parents do not change.

### Rules

- Search by name, model, SKU, or barcode — already supported server-side; send the term, do not
  filter a page client-side.
- No `pageSize: 100` anywhere. Ask for a small page and let the user narrow by typing.
- Show stock status when the product tracks stock, as **display only**. The backend stays
  authoritative for every write.
- Empty search state, no-results state, and loading state all handled explicitly.
- Archived/inactive products follow existing rules: the sales-order line picker keeps
  `isActive: true`; the server rejects an inactive product at save regardless.
- **Receiving must show, not hide, ineligible products.** Today the form filters to
  `product.trackStock` client-side. With server-side search that filter would silently drop
  matches from a page and reproduce the "product is missing" confusion. Instead, list the match
  and disable its selection with a reason: *"Needs a verified opening count / يحتاج جردًا
  افتتاحيًا مؤكدًا"*. The server already rejects such a product, so this only makes the refusal
  legible earlier.

---

## 4. B — Receiving → supplier debt bridge

### Flow

```
Inventory → Receiving → [document]
     │
     │  visible only when: user is ADMIN
     │                     AND receiving.supplierId is not null
     │                     AND the supplier is still active
     ▼
[ Record supplier debt / تسجيل دين للمورد ]
     │
     │  navigate('/suppliers/:supplierId', { state: { prefillTransaction } })
     ▼
SupplierProfilePage  ── reads location.state, opens its existing dialog ──▶
SupplierTransactionFormDialog, prefilled:
     type            SUPPLIER_DEBT
     transactionDate receiving.receivedOn
     reference       receiving.referenceNumber
     description     "Supplier receiving <reference or date>"
     amount          ***BLANK***  ← the human types it
     │
     ▼
existing POST supplier transaction — unchanged logic, unchanged ADMIN gate
```

### Why the amount stays blank

The system knows quantities, not what the delivery cost. `costPrice` is off limits. That one empty
field is the whole reason this is a bridge and not an automation — it keeps a person in the loop
between the inventory fact and the financial one.

### Changes required

1. `SupplierReceivingDetailPage.tsx` — the admin-only button.
2. `SupplierProfilePage.tsx` — read route state, open the dialog with prefill, then clear the
   state so a back-navigation or refresh does not reopen it.
3. `SupplierTransactionFormDialog.tsx` — accept an optional `prefill` prop merged into
   `emptyForm()`. **`amount` is never prefillable**; the prop type must not include it.
4. `supplier-transactions.validator.ts` — raise `reference` from 100 to 200 characters.

### The reference-length trap

`SupplierTransaction.reference` is capped at **100** chars; `SupplierReceiving.referenceNumber` at
**200**. Prefilling a 150-character reference would fail validation *after* the user has typed an
amount — the worst possible moment. Both columns are Postgres `TEXT` with no `@db.VarChar`, so
raising the cap to 200 is **a validator constant change with no migration**. Do this in CP-1923,
not as a follow-up.

### What the bridge must never do

Create a transaction automatically; infer or prefill an amount; write a stock movement; link the
transaction to the receiving row in the database; alter any supplier balance by itself. It is
navigation plus form defaults. Nothing more.

---

## 5. C — Quick product add

**Recommendation: defer entirely from v1.9.2.**

A new product gets `trackStock = false` and no `OPENING_BALANCE` movement. Receiving requires
both, and the only path that creates an opening movement is `InventoryService.verifyOpeningCount`
— **ADMIN plus account password**. So any "quick-add then receive" is, by construction, a proposal
to weaken that guard.

Section 3's disabled-with-a-reason row already delivers most of the value: the user sees the
product exists and learns exactly what it needs. If quick-add is still wanted afterwards, B1
(catalogue-only, no `trackStock`, no opening movement) is the shape — and it should be its own
release, judged on evidence from how the disabled state actually gets used.

**B2 stays deferred. The opening-count guard is not negotiable in v1.9.2.**

---

## 6. D — Scanner POS preview → v1.9.3

Not in v1.9.2. It is not tiny: it needs a new modal, a second authenticated fetch, changed
found-scan behaviour on a screen staff are already trained on, and it depends on the picker
landing first. Shipping it beside two other workflow changes would make any regression hard to
attribute.

Carried forward unchanged for v1.9.3:

> Scan → `GET /products/scan` (unchanged) → preview modal fetching detail from the **existing
> authenticated** `GET /products/:productId` → "Make Order" → existing sales-order dialog with the
> product prefilled.

**Hard rule to carry:** do not add price or stock to `ProductScanPayload`. That payload is served
to the unauthenticated LAN phone endpoint (`scanner.lan.routes.ts:79`); widening it would publish
shop pricing and stock to every paired phone on the shop Wi-Fi.

---

## 7. Security rules

- No account password for product selection, search, or the bridge navigation. Creating a supplier
  transaction keeps its existing ADMIN gate; nothing new is added and nothing existing is removed.
- Opening-count verification stays ADMIN + account password. Untouched.
- Backend authoritative for price, stock, and eligibility. The picker displays; the server decides.
- No client-trusted price or stock on any write path.
- Scanner writes nothing. Unchanged in this release.
- The bridge passes identifiers and text defaults only — never an amount, never a computed figure.

## 8. Ledger separation rules

Unchanged from v1.9.1 and re-asserted as test obligations:

| Rule | Enforcement |
| --- | --- |
| Supplier debt does not create stock | `SupplierTransaction` has no product and no quantity column |
| Supplier receiving does not create debt | Receiving service imports nothing from transactions or debts |
| Supplier payment stays as-is | No file in this release touches the payment path |
| Sales order is the only customer-ledger path | `DebtsService.createDebt` called only from sales |
| Supplier and customer ledgers stay separate | Separate tables, separate services, no cross-import |

The bridge deliberately creates **no database link** between a receiving document and a supplier
transaction. They are related by a reference number a human reads. A nullable foreign key remains
deferred, per the architecture review.

---

## 9. Data flow

```
SUPPLIER ─────────────┬──────────────────────┐
                      │ financial            │ inventory
                      ▼                      ▼
        SupplierTransaction          SupplierReceiving ──▶ ReceivingItem
        (ADMIN, amount typed)         (ADMIN/EMPLOYEE)          │
                      ▲                      │                  ▼
                      │                      │          StockMovement
                      │   navigation +       │          PURCHASE_RECEIPT
                      └── form defaults ─────┘                  │
                          NO db link, NO amount                  ▼
                                                             PRODUCT
                                                                │
                                    ┌───────────────────────────┤
                                    ▼                           ▼
                          ProductPicker (search)          Scanner (v1.9.3)
                                    │                        read only
                                    ▼
                              SALES ORDER ──▶ deduct stock (explicit)
                                    │
                                    └──▶ Debt ──▶ CUSTOMER ledger
```

## 10. Error handling

| Condition | Behaviour |
| --- | --- |
| Search returns nothing | "No products match / لا توجد منتجات مطابقة" plus the term. No silent empty list. |
| Search term too short | Show recent or first page; never show a blank panel with no explanation. |
| Search request fails | Inline error with retry. Never fall back to a stale cached list on a write form. |
| Product selected, then archived before save | Server rejects at save (`findActiveProduct`); surface the error, do not retry silently. |
| Receiving: product does not track stock | Listed, selection disabled, reason shown. |
| Receiving: product has no opening count | Listed, selection disabled, reason shown. |
| Bridge: receiving has no supplier | Button not rendered. |
| Bridge: supplier archived | Button not rendered — the profile already blocks new transactions for archived suppliers. |
| Bridge: user is not ADMIN | Button not rendered; show the existing explanatory text instead. |
| Bridge: reference longer than the field allows | Cannot occur once the cap is 200; both sides then match. |
| Bridge: user abandons the form | Nothing is written. No debt, no stock, no partial state. |
| Bridge state replayed on refresh/back | Route state cleared after the dialog opens. |

---

## 11. Token-efficiency strategy

The cost driver in v1.9.0–v1.9.1 was not the code; it was re-establishing context. Countermeasures:

1. **Four checkpoints, not nine.** CP-1921 through CP-1925, with CP-1924 usually a one-line
   decision.
2. **This document is the context.** Prompts reference it by path and section instead of restating
   architecture. Never paste release history into a prompt.
3. **Findings are pre-resolved.** Section 0 already answers "is a backend change needed", "what do
   I mirror", and "how does the bridge reach the form". No checkpoint re-derives them.
4. **Explicit file scope per checkpoint.** Each lists the files it may touch. Anything else is a
   stop condition, not an improvisation.
5. **Delta reports only.** Five lines: files changed, behaviour changed, tests run, blockers, next
   step. No architecture recaps, no full staging manifests, no re-confirmation of ledger rules.
6. **Focused tests during work, full suite once** at CP-1925. The only exception is a change that
   touches shared inventory or sales code.
7. **No repo-wide audits after CP-1921.** The file map is written down once.
8. **One layer per checkpoint.** Frontend and backend do not mix in one prompt in this release —
   and CP-1922 is frontend-only anyway.
9. **Staging list appears once**, at CP-1925.
10. **Decisions table stays short** (§15) and is edited in place rather than re-argued.

Anti-goal: do not let token thrift push work into fewer, larger prompts. A prompt that changes the
picker *and* the bridge *and* the validator is cheaper to send and far more expensive to debug.

---

## 12. Checkpoints

| CP | Goal | Files in scope | Tests | Stop condition |
| --- | --- | --- | --- | --- |
| **1921** | Readiness + file map. Confirm v1.9.1 rehearsal status; confirm §0 findings still hold. | read-only | none | Report file map and risks only. No architecture review, no history summary. |
| **1922** | Shared searchable product picker; replace both capped selects. | `features/products/hooks/useProductSearch.ts`, `features/products/components/ProductSearchInput.tsx`, `features/products/components/ProductPicker.tsx`, `sales-orders/components/ProductLinePicker.tsx`, `inventory/receiving/components/SupplierReceivingForm.tsx`, their tests | picker + receiving form + sales-order form | Any backend change needed → stop and report. |
| **1923** | Debt bridge + reference cap. | `receiving/pages/SupplierReceivingDetailPage.tsx`, `pages/suppliers/SupplierProfilePage.tsx`, `suppliers/components/SupplierTransactionFormDialog.tsx`, `suppliers/transactions/supplier-transactions.validator.ts`, their tests | receiving detail + supplier form + transaction validator | Any automatic debt creation, any amount prefill, any new endpoint → stop. |
| **1924** | Quick-add decision. | this plan only | none | Default: record the deferral and move on. |
| **1925** | Release: full validation, notes, bump, installer, selective staging, commit. | release set | full suite | Any failure → no bump, no package, no commit. |

Prompts stay short. A CP-1922 prompt should read roughly: *"Per §3 of
`claude/plans/inventory-v1.9.2-product-picker-supplier-bridge-plan.md`, build the shared product
picker mirroring `CustomerPicker`, and replace the capped selects in the two listed files. Scope is
the six files listed in §12. Frontend only. Run the three focused suites. Report the five-line
delta."*

---

## 13. Testing strategy

**CP-1922** — with a catalogue larger than 100, a product sorted past the 100th is findable and
selectable in both forms; selecting sets `productId` and the suggested unit price exactly as
today; no-results and error states render; receiving lists an untracked or un-onboarded product as
disabled with its reason rather than hiding it; existing sales-order and receiving tests pass
unmodified.

**CP-1923** — the button renders only for an ADMIN on a receiving with an active supplier; it
renders for none of the three negative cases; the dialog opens with supplier, date, reference and
description filled and **amount empty**; submitting writes exactly one `SupplierTransaction` and
**zero** `StockMovement` rows; a 150-character reference round-trips; abandoning the form writes
nothing; route state does not survive a refresh.

**Standing regression** — supplier balance, customer debt and payment totals, and sales-order money
columns unchanged across every new action. This is the v1.9.0/v1.9.1 assertion set; extend it, do
not rebuild it.

## 14. Release strategy

v1.9.2, minor. Full validation, release notes at
`docs/phases/Versions/phase-1-9-2/RELEASE_NOTES_V1_9_2.md`, installer, selective staging, commit —
all at CP-1925 only. No migration is expected in this release; if one becomes necessary, that is a
signal the scope grew and should be re-planned, not absorbed.

## 15. Open decisions

| # | Question | Default if unanswered |
| --- | --- | --- |
| 1 | ~~Ship quick-add B1 in v1.9.2?~~ | **Resolved 2026-08-14: No** — deferred; §3's disabled-with-reason covers the need |
| 2 | Raise `reference` cap to 200, or truncate the prefill? | **Raise to 200** — validator only, no migration |
| 3 | Does the sales-order picker keep `isActive: true` filtering? | **Yes** — unchanged from today |
| 4 | ~~Push v1.9.1 before starting v1.9.2?~~ | **Resolved 2026-08-14** — pushed; `origin/main` is at `fcfea43` |
