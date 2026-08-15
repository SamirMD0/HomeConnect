# Scanner v1.9.3 — POS preview, order prefill, and the supplier receiving link

**Status:** CP-1931 implemented; CP-E implemented ahead of it. **Scope corrected 2026-08-14** to
include CP-E. Version stays 1.9.2 until CP-1934.
**Created:** 2026-08-14
**Baseline:** v1.9.2 at commit `a5d8ffc` — committed, packaged, and pushed.
**Reference docs (do not re-derive):**
`claude/plans/supplier-inventory-scanner-sales-ledger-workflow-plan.md` — §8 scanner flow, §11 security
`claude/plans/inventory-v1.9.2-product-picker-supplier-bridge-plan.md` — bridge pattern, token rules

> ### Scope correction — 2026-08-14
>
> This release was originally planned as frontend-only with no migration. **It is not.** The
> supplier-transaction → receiving link (CP-E), deferred in both the architecture review and the
> v1.9.2 plan, was separately authorised for v1.9.3 and implemented ahead of CP-1931. It carries a
> migration and touches the supplier ledger's write path.
>
> v1.9.3 is therefore a **schema release**, not a UI release, and is gated accordingly (§10, §12).
>
> The gap was in disclosure, not in the work: the CP-1931 delta report described only its own four
> files while the tree already carried an unrehearsed migration. **Process rule going forward — a
> delta report must disclose release-level state, not only the checkpoint's own diff.** An
> uncommitted migration is a release-level blocker and belongs in the `blockers:` line of every
> report until it is rehearsed.

> ### Release gates — all must clear before CP-1934 acceptance
>
> 1. Deployment-gate paragraph added to the v1.9.2 release notes (it omits it today).
> 2. **Migration safety review** of both pending migrations (§6).
> 3. **Restored-business-PC-backup rehearsal** covering **both** unrehearsed migrations:
>    `20260814110000_add_supplier_receivings` (v1.9.1) and
>    `20260814170000_link_supplier_transactions_to_receivings` (CP-E).
>
> Gates 2 and 3 are **blocking for release acceptance**, not for implementation. CP-1932 and
> CP-1933 may proceed now that this correction is recorded.

---

## 0. Findings that shape this release

Verified in the repo during planning. No checkpoint re-derives them.

1. **v1.9.2 already exported the price rule.** `ProductLinePicker.tsx` now exports
   `salesLineForProduct(value, product)`, which resolves the suggested unit price
   (`pricing.cashPrice` → `netPrice` → `price` → `'0.00'`). Scanner prefill **reuses this
   function**. It must not invent its own price logic — divergence there is how two screens start
   quoting different prices for the same product.

2. **The picker can now hold any product.** Before v1.9.2 a scanned product outside the first 100
   by name could not be selected at all. `CatalogProductPicker` removed that ceiling, which is
   what makes this release viable now and did not before.

3. **`CreateSalesOrderDialog` still has no prefill surface** — props are `{ isOpen, onClose }`, a
   six-step wizard owning its own `items` state, with `emptySalesLine()` from
   `SalesOrderItemsEditor`. `SalesOrdersPage` owns the dialog via `createOpen` state and already
   imports `useSearchParams`.

4. **The v1.9.2 supplier-debt bridge is the navigation pattern.** Navigate with route state, let
   the owning page open its own dialog, clear the state after. It shipped, was reviewed, and works.
   Reuse the shape rather than inventing a second one.

---

## 1. Scope

| # | Item | Layer | Status |
| --- | --- | --- | --- |
| A | Product preview modal on Scanner Hub, opened by a desk scan | Frontend only | **done** (CP-1931) |
| B | "Make Order" → sales-order wizard with the product prefilled | Frontend only | CP-1932 |
| C | Two carried v1.9.2 follow-ups (inventory `staleTime`, supplier dropdown ceiling) | Frontend only | CP-1933 |
| D | **CP-E — supplier transaction ↔ receiving link** | **Migration + backend + frontend** | **done, ungated** |

Minor version. **One migration**, additive.

## 2. Explicitly excluded

Any change to `scanLookup` or `ProductScanPayload`; any new backend endpoint **for the scanner**;
phone-initiated modals; changes to sales-order validation, totals, debt, or stock deduction;
scanner writes of any kind; `InventoryPage`'s existing scan behaviour; quick-add; supplier payment;
customer ledger; COGS/valuation; AI analytics; WhatsApp.

Still excluded **within CP-E**: automatic debt creation, amount inference, any read of the link by
balance or money computation, and any cascade on delete.

---

## 3. A — Product preview modal

### Flow

```
Scanner Hub input  (typed or USB wedge)
        │
        ▼
GET /products/scan?code=…          ← UNCHANGED. Still lean. Still safe for the phone.
        │
        ├─ INVALID_CODE ─▶ existing inline ScanFeedback. No modal.
        ├─ NOT_FOUND    ─▶ existing inline ScanFeedback. No modal.
        └─ FOUND { id }
                │
                ▼
        GET /products/:id          ← authenticated, full detail (price, stock, status)
        GET /products/:id/image    ← existing useProductImageUrl(id, version)
                │
                ▼
   ┌──────────────────────────────────────────────┐
   │  PRODUCT PREVIEW MODAL                       │
   │  image · name · model · brand                │
   │  SKU · barcode                               │
   │  price                                       │
   │  stock badge: N in stock / LOW / OUT / not   │
   │               tracked / needs opening count  │
   │  banners: archived · also-matched-SKU        │
   │                                              │
   │  [Open product]   [Make Order / إنشاء طلب]   │
   └──────────────────────────────────────────────┘
```

### The security rule that shapes the whole design

`ProductsService.scanLookup` is consumed by **two callers with different trust levels**: the
authenticated desk API, and the LAN phone endpoint at `scanner.lan.routes.ts:79`, which is reached
with only a paired-device token. Its payload is `{id, name, model, sku, barcode, brand, isActive}`
and carries a comment forbidding growth by inheritance.

**Adding price or stock to that payload would publish shop pricing and stock levels to every paired
phone on the shop Wi-Fi.** The modal therefore makes its own authenticated fetch by id. This is not
a preference; it is the reason the modal is a second request rather than a richer first one.

A test must assert the scan payload's exact key set so a future change fails loudly.

### Phone scans must not open the modal

Only a scan entered at the hub's own input opens it. Phone scans continue to append to the
recent-scans list, exactly as today (`useScannerEvents({ canOpenProduct: false })`).

A phone is in someone's pocket or in another room. Letting it seize the desk screen — mid-order,
potentially — is a defect dressed as a feature. If a "follow phone scans" mode is ever wanted, it
is an explicit, off-by-default toggle in a later release.

### Modal rules

- Stock is **advisory**. Out of stock does **not** disable "Make Order": the sales order itself
  permits selling above stock and enforces it only at deduction. A scanner stricter than the order
  it feeds is a behaviour change, not a UI change.
- Archived product → banner, "Make Order" **disabled**. `prepareItems` calls `findActiveProduct`
  and would reject it anyway; disabling just makes the refusal legible earlier.
- `alsoMatchedSku` → surface it. A code can be one product's barcode and another's SKU; the server
  already returns the flag, and hiding the second product is worse than naming it.
- Loading, error-with-retry, and image-absent states all explicit. Never show a stale price.

---

## 4. B — Make Order prefill

### Mechanism — mirror the v1.9.2 bridge

```
[Make Order] ─▶ navigate('/sales-orders', { state: { prefillOrderProductId: id } })
                        │
                        ▼
              SalesOrdersPage reads state, opens CreateSalesOrderDialog
              with prefill, then clears the state (replace: true)
                        │
                        ▼
              Dialog seeds items[0] and lands on step 1, not step 3
                        │
                        ▼
              existing POST /sales-orders — unchanged validation, unchanged totals
```

### Pass the id only — never the price

The route state carries **`productId` and nothing else**. The dialog fetches the product and
applies `salesLineForProduct` to derive the suggested price at open time.

Passing a price across the navigation boundary would mean the order form quotes a number the
scanner captured seconds earlier, from a screen the user may have left open. Fetching at open keeps
the server the price source, and the backend recomputes every total from the stored lines
regardless.

### What prefill may and may not set

**May:** `items[0].productId`, `items[0].unitPrice` (server-derived), `items[0].quantity = 1`.
**May not:** customer, payment mode, paid amount, debt due date, fulfilment status, delivery fee,
channel. Those stay with the wizard and the human.

### Changes required

1. New `ProductPreviewModal` component (features/products or features/scanner — one home, shared).
2. `ScannerHubPage.tsx` — open the modal on `onFound` instead of `navigate('/products?focus=…')`.
3. `CreateSalesOrderDialog.tsx` — optional `prefill?: { productId: string } | null`, seeding
   `items[0]`. Prop type must not accept a price or a quantity above 1.
4. `SalesOrdersPage.tsx` — read route state, open the dialog, clear the state.

`InventoryPage` keeps its current scan behaviour in this release. Changing two scan surfaces at
once makes any regression hard to attribute.

---

## 5. C — Carried v1.9.2 follow-ups

Both surfaced in the v1.9.2 review. Small, related to this area, and cheap to fix here.

1. **`useProductInventory` has no `staleTime`.** In the receiving picker's `requireOpeningCount`
   mode this issues up to 10 `GET /products/:id/inventory` requests per search burst, refetching on
   every remount. Add a modest `staleTime`.
2. **`SupplierReceivingForm.tsx:69` still uses `useSuppliers({ pageSize: 100 })`** for the supplier
   dropdown — the same silent ceiling v1.9.2 removed for products, and it will fail identically
   past 100 suppliers.

Neither is a correctness defect today. If either grows beyond a few lines, defer it rather than let
it expand the release.

---

## 6. D — CP-E: supplier transaction ↔ receiving link

Authorised separately for v1.9.3 and implemented before CP-1931. Recorded here so the release is
reviewed as what it is: a schema release.

### What it does

Adds an optional `SupplierTransaction.supplierReceivingId`, so a supplier debt can record *which
delivery it is for*. The link is **informational**. It is displayed and validated; it is never read
to compute money.

```
SupplierReceiving ──── optional, nullable, unique ────▶ SupplierTransaction
  (inventory document)   composite FK on (id, supplierId)   (financial, SUPPLIER_DEBT only)
       stock                                                      balance
       ▲                                                             ▲
       └────────── neither derives the other; a human types the amount ┘
```

### Preliminary safety review (done during the scope correction; the formal gate still runs)

Migration `20260814170000_link_supplier_transactions_to_receivings`:

| Property | Finding |
| --- | --- |
| Shape | `ADD COLUMN` nullable UUID, two indexes, one CHECK, one FK. **Additive.** |
| Backfill | None. No existing row is read or written. |
| Type restriction | `CHECK (supplierReceivingId IS NULL OR type = 'SUPPLIER_DEBT')` |
| Cardinality | `UNIQUE(supplierReceivingId)` — one transaction per receiving document |
| Cross-supplier safety | Composite FK `(supplierReceivingId, supplierId) → supplier_receivings(id, supplierId)`. Linking a debt to another supplier's delivery is **structurally impossible**, not merely guarded in code. Stronger than the architecture review required. |
| Delete behaviour | `ON DELETE RESTRICT`, matching house convention |
| Money math | Untouched — no change to `summaryRows`, `_sum`, or `direction` aggregation |
| Auto-creation | None — the receiving page has no mutation call; the amount is still typed |

Service guards: type must be `SUPPLIER_DEBT`; receiving must exist; supplier must match; a second
link returns 409 `RECEIVING_ALREADY_LINKED`. The UI hides the "Record supplier debt" button once a
link exists and offers "View linked supplier debt" instead, so a delivery cannot be double-booked
from either direction.

### Invariants this release must not break

- The link is **never** read by balance, summary, or any money computation.
- Receiving still creates no debt; supplier debt still creates no stock.
- The amount remains blank on prefill and typed by a human.
- No cascade: deleting either side is restricted.

### Still required

The formal migration safety scan and the restored-backup rehearsal (§10 CP-1930). The preliminary
review above is not a substitute — it was a read of the SQL, not an execution against a restored
copy.

---

## 7. Security rules

- No account password anywhere in this flow. Scanning reads a catalogue the Products page already
  shows, and any authenticated user can already create a sales order.
- `ProductScanPayload` unchanged. The LAN router still mounts exactly four endpoints.
- The scanner writes nothing: no stock movement, no ledger row, no order, no price change.
- The scanner passes **identity only**. The sales-order backend re-reads the product and recomputes
  every total.
- No client-trusted price or stock on any write path.
- Role permissions unchanged. Pairing, LAN enable/disable, and session revoke stay ADMIN-only.

## 8. Ledger separation

Unchanged and re-asserted as test obligations: sales order remains the only path to customer debt
(`DebtsService.createDebt`, called only from sales); the scanner writes to neither ledger; supplier
and customer ledgers stay separate. A scanner interaction must create **zero** rows in
`stock_movements`, `debts`, `payments`, or `supplier_transactions`.

---

## 9. Error handling

| Condition | Behaviour |
| --- | --- |
| Code not scannable | Existing inline `INVALID_CODE`. No modal. |
| No product matches | Existing inline `NOT_FOUND` with the normalized code. No modal. |
| Barcode also matches another product's SKU | Modal opens on the barcode match, names the collision. |
| Product detail fetch fails | Modal shows retry. Never falls back to scan-payload data as a price source. |
| Image missing or fails | Placeholder. Modal still usable. |
| Product archived | Banner; "Make Order" disabled. |
| Out of stock | Red badge; "Make Order" **enabled**. |
| Not stock-tracked / no opening count | Informational badge; ordering allowed; deduction refuses later with its existing message. |
| Product has no price | Price shown as "—"; prefill leaves `unitPrice` blank; the wizard already blocks a zero price at its item step. |
| Product archived between preview and save | Server rejects at save; surface the error, do not retry silently. |
| Phone scan arrives while modal open | Appends to recent scans. Does not replace or close the modal. |
| Route state replayed on refresh/back | Cleared after the dialog opens, as in v1.9.2. |
| User abandons the wizard | Nothing written. |

---

## 10. Checkpoints

Five. No readiness checkpoint — §0 is the file map.

| CP | Goal | Scope | Tests | Stop condition |
| --- | --- | --- | --- | --- |
| **E** | Supplier transaction ↔ receiving link (§6). | migration, supplier transactions, receiving detail, form dialog | supplier transaction + receiving + migration | **Done, ungated.** Its gates are CP-1930. |
| **1931** | Product preview modal on Scanner Hub. | new `ProductPreviewModal`, `ScannerHubPage.tsx`, tests | modal + scanner hub | Any change to `scanLookup`, `ProductScanPayload`, or the LAN router → stop. **Done.** |
| **1932** | Make Order prefill. | `CreateSalesOrderDialog.tsx`, `SalesOrdersPage.tsx`, tests | sales-order dialog + hub navigation | Any price crossing route state, any new endpoint, any prefill beyond the three allowed fields → stop. |
| **1933** | Carried follow-ups (§5). | `useInventory.ts`, `SupplierReceivingForm.tsx`, tests | inventory hook + receiving form | Either fix exceeding a few lines → defer it. |
| **1930** | **Migration gate.** Safety scan of both pending migrations; rehearsal on a restored business-PC backup; ledger-isolation assertions for the CP-E link. | read-only + scratch/restored DB | migration safety + rehearsal | Any destructive statement, any backfill, any money query reading `supplierReceivingId` → stop, and CP-1934 does not proceed. |
| **1934** | Release: validation, notes, bump 1.9.3, installer, selective staging, commit. | release set | full suite | Any failure → no bump, no package, no commit. **Blocked until CP-1930 passes.** |

CP-1930 is numbered out of order deliberately: it is a *gate*, not a step. It may run any time
after CP-E, and it must pass before CP-1934 regardless of where CP-1932 and CP-1933 have reached.

Prompts cite this document by section. Reports are the five-line delta: files changed, behaviour
changed, tests run, blockers, next step — with **release-level blockers disclosed even when they
predate the checkpoint** (see the scope-correction note at the top).

## 11. Testing strategy

**CP-1931** — `FOUND` opens the modal; `NOT_FOUND` and `INVALID_CODE` do not; the modal renders
price and stock from the product endpoint while the **scan response contains neither**; a test
asserts `ProductScanPayload`'s exact key set; archived → disabled action; out of stock → enabled
action; a phone scan event does not open the modal.

**CP-1932** — "Make Order" navigates with `productId` only; the dialog opens seeded at step 1 with
the product selected and a server-derived price; route state does not survive refresh; the created
order goes through the existing endpoint with no new code path; abandoning writes nothing.

**CP-1930** — both migrations scan clean (no `DROP`, `TRUNCATE`, `DELETE`, `INSERT`, `UPDATE`,
`ALTER TYPE`, no backfill); both apply cleanly to a freshly restored business-PC backup copy;
protected row counts and the product inventory fingerprint are unchanged; supplier balances are
identical before and after; a grep proves no money query reads `supplierReceivingId`; linking a
debt to another supplier's receiving is rejected by the database, not only by the service.

**Standing regression** — a full scan-to-preview-to-abandon cycle creates zero rows in
`stock_movements`, `debts`, `payments`, and `supplier_transactions`; supplier balance and customer
debt totals unchanged.

## 12. Release strategy

v1.9.3, minor, **carrying one new migration**. Release notes at
`docs/phases/Versions/phase-1-9-3/RELEASE_NOTES_V1_9_3.md`, documenting the CP-E link and
**including the deployment-gate paragraph** the v1.9.2 notes omitted.

**Two migrations are unrehearsed and both block CP-1934 acceptance:**

| Migration | Ships in | Rehearsed |
| --- | --- | --- |
| `20260814110000_add_supplier_receivings` | v1.9.1, still inside every later installer | **No** |
| `20260814170000_link_supplier_transactions_to_receivings` | v1.9.3 (CP-E) | **No** |

Because v1.9.1 never reached the business PC, the v1.9.3 installer will apply **both**. The
rehearsal must therefore run them together against one restored backup, in order, rather than
treating either in isolation.

Version stays 1.9.2 until CP-1934. No staging, commit, packaging, or installation before then.

## 13. Open decisions

| # | Question | Default if unanswered |
| --- | --- | --- |
| 1 | Does `InventoryPage`'s scan box also get the modal? | **No** — one scan surface per release |
| 2 | Where does `ProductPreviewModal` live? | **`features/products/components`** — it is a product view, and Inventory may adopt it later |
| 3 | Should a phone scan ever open the desk modal? | **No** — and if ever, an explicit off-by-default toggle |
| 4 | Include the §5 follow-ups, or split them out? | **Include** — both are small and in this area |
