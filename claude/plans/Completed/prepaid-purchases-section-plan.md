# Prepaid Purchases — Extract Into Its Own Section

**Status:** plan only, written 2026-07-30 against app version `1.0.7`
**Supersedes the prepaid parts of:** `docs/phases/phase-1-0-7/PREPAID_PURCHASE_DESIGN.md` (the admin-debt formula in that document is being changed — see §4)

---

## 1. Context

Prepaid purchases already exist, but they live *inside* the Ledger as a special kind of debt (`Debt.kind = PREPAID_PURCHASE`). Because a prepaid is economically the **opposite** of a debt — the business owes the customer, not the reverse — every financial calculation in the app has to remember to exclude it. That exclusion is currently spread across **66 references in 24 non-test files**, including 12 in `financial-ledger.service.ts` alone.

The consequences today:

- Every new financial feature must remember `!isPrepaid`, or it silently produces wrong totals.
- `Debt.dueDate` is filled with *today's date* as a meaningless placeholder, purely because the column is `NOT NULL`. This is why prepaid must also be excluded from overdue and next-due logic.
- There is **no delivery concept at all**. `DebtStatus` has no `DELIVERED`, so the system cannot tell a prepaid awaiting delivery from one already handed over.
- The prepaid liability is only visible as a summary number; there is no screen listing which customers are owed what.

This plan moves prepaid into its own section with its own table, its own status lifecycle, and a real delivery workflow — and removes it from the Ledger so the scattered exclusion checks can be **deleted rather than extended**.

---

## 2. The business flow

### The situation being modeled

A customer wants an air conditioner priced at **400**. The unit is not in stock, or the customer isn't ready to take it. The customer pays **200** now and takes nothing home.

At that moment the business is **holding 200 of the customer's money** and owes them either the goods or a refund. That is a **liability**, and it is what the negative number represents.

### Worked examples

**A — the primary case (customer's example)**

| | |
|---|---|
| Item | Air conditioner |
| Full price | `400.00` |
| Paid | `200.00` |
| **Admin debt (shown negative)** | **`-200.00`** ← cash we hold and would refund |
| Remaining to collect | `200.00` |
| Status | `PENDING` → displayed *Prepaid / مدفوع مسبقاً* |
| In Accounts Receivable? | **No** |
| Can go overdue? | **No** |

**B — why the formula is changing (§4)**

| | Old behavior | New behavior |
|---|---|---|
| Full price | `400.00` | `400.00` |
| Paid | `100.00` | `100.00` |
| Admin debt | `-300.00` | **`-100.00`** |

We hold 100 of this customer's money, not 300. If they walk away, the refund is 100. The old figure was measuring the *unpaid remainder* and displaying it with a minus sign, which is a different quantity that is not a liability at all.

**C — delivery with money still outstanding** (continues from A)

Admin hands over the air conditioner. Customer still owes 200.

```
prepaid record   -> status = DELIVERED, admin debt = 0.00
                    (goods gone, the 200 cash is now earned)
NEW standard debt -> 200.00, real due date, kind = STANDARD
                    -> enters Accounts Receivable
                    -> ages and can become OVERDUE
```

The prepaid liability disappears and a genuine receivable takes its place. Nothing is double counted: the customer paid 200 and now owes 200, against a 400 product.

**D — fully paid, then delivered**

Paid 400 of 400 → mark delivered → status `DELIVERED`, admin debt `0.00`, **no remainder debt created**. Record closes cleanly.

**E — customer cancels before delivery**

Refund the 200 through the existing payment-void flow, then cancel the prepaid. Status `CANCELLED`, admin debt `0.00`. Handled by existing correction machinery — no new refund logic in this plan.

### The invariant

> **Admin debt is non-zero only while status is `PENDING`.**
> `adminDebt = −(amount paid)` for `PENDING`; `0.00` for `DELIVERED` and `CANCELLED`.

Total business liability = sum of amounts paid on `PENDING` prepaids. That is the only number that belongs on a dashboard as "owed to customers".

---

## 3. What exists today

| Piece | Location |
|---|---|
| Enum | `DebtKind { STANDARD, PREPAID_PURCHASE }` — `schema.prisma:39` |
| Creation | `DebtsService.createPrepaidPurchase` — `debts.service.ts:120` |
| Validator | `createPrepaidPurchaseSchema` — `debts.validator.ts:33` (`itemName`, `fullAmount`, `paymentAmount`, `notes`) |
| Endpoint | `POST /api/v1/customers/:customerId/prepaid-purchases` — `debts.routes.ts:35` |
| Ledger integration | `financial-ledger.service.ts` (12 refs), type `'PREPAID_PURCHASE'` in `financial-ledger.validator.ts:15` and `financial-ledger.types.ts:13` |
| Summary fields | `totalPrepaidAdminDebt`, `activePrepaidCount` — ledger + customer summary |
| Exclusions | `receivables.service.ts:159`, `customer-financial-summary.service.ts:243/261/268/497`, `payments.service.ts:526`, `dashboard-financial.service.ts` |
| Frontend creation | `CreatePrepaidPurchaseForm.tsx`, `FinancialObligationTypeStep.tsx`, `AddFinancialObligationDialog.tsx` |
| Frontend display | `LedgerObligationRow.tsx`, `LedgerMobileCard.tsx`, `CustomerDebtsList.tsx`, `DebtDetails.tsx`, `LedgerSummaryCards.tsx`, `FinancialSummaryCards.tsx` |

**How creation works now** (`debts.service.ts:137-179`) — atomic, and worth preserving exactly:

1. Create `Debt` with `kind = PREPAID_PURCHASE`, `originalAmount = fullAmount`, `description = itemName`, `dueDate = today` (placeholder)
2. Create `Payment` (CASH) for `paymentAmount`
3. Create `PaymentAllocation` linking payment → debt
4. Recompute status with `overdueEligible: false`

All three writes share one `runFinancialTransaction`. **Do not change this.**

---

## 4. The semantics change — read this before implementing

The admin-debt formula changes:

```
OLD:  adminDebt = 0 − (fullAmount − amountPaid)      // unpaid remainder, negated
NEW:  adminDebt = 0 − amountPaid    (PENDING only)   // cash held
      adminDebt = 0.00              (DELIVERED / CANCELLED)
```

**Good news: nothing needs a data migration.** `adminDebt` is computed at read time in two places (`customer-financial-summary.service.ts:340`, `financial-ledger.service.ts:230`) and is never stored. Changing the formula changes every display immediately.

**Bad news: the owner will see different numbers for existing records.** Any prepaid where `amountPaid ≠ fullAmount − amountPaid` will show a different figure than yesterday. Example B moves from `-300.00` to `-100.00`.

Required actions:

- Tell the owner before shipping. A liability figure changing without explanation destroys trust in the number.
- Update `docs/phases/phase-1-0-7/PREPAID_PURCHASE_DESIGN.md` §"Accounting Model" — its worked example is now wrong.
- The new **Remaining to collect** column preserves the old number, so nothing is lost from view — it is relabeled to what it actually is.

---

## 5. Scope

**In scope**

- New `PrepaidPurchase` companion table carrying delivery state
- Delivery workflow, including automatic conversion of the unpaid remainder into a `STANDARD` debt
- Guarded revert-delivery
- New Prepaid Purchases page: the table of all customers with status and the negative amount
- New backend read model with backend-authoritative totals
- Removal of prepaid from the global Ledger, and deletion of the exclusion checks that become dead
- Corrected admin-debt semantics (§4)
- Bilingual EN/AR labels for this feature

**Out of scope**

- Refund mechanics — existing payment-void flow already covers Example E
- Any link to product stock (`Product` has no quantity — see `claude/documentation/ERP_POSITIONING.md`)
- Partial delivery / multi-item prepaids. One prepaid = one item line, as today
- Due dates or overdue behavior for prepaid. A prepaid never ages; only the remainder debt it creates does
- Changing how prepaid is created (the atomic 3-write flow stays)
- Deposit/reservation expiry rules
- Removing prepaid from the **customer profile** — see assumption A1 in §20

---

## 6. Data model

Companion table, 1:1 with the existing `Debt` row. The `Debt`, `Payment`, and `PaymentAllocation` rows are **not touched**, so no immutable financial history is rewritten.

```prisma
enum PrepaidPurchaseStatus {
  PENDING     // paid, not yet handed over  -> UI: "Prepaid / مدفوع مسبقاً"
  DELIVERED   // handed over               -> UI: "Delivered / تم التسليم"
  CANCELLED   // mirrors debt cancellation -> UI: "Cancelled / ملغى"
}

model PrepaidPurchase {
  id       String @id @default(uuid()) @db.Uuid

  debtId   String @unique @db.Uuid
  debt     Debt   @relation("PrepaidPurchaseDebt", fields: [debtId], references: [id], onDelete: Restrict)

  status   PrepaidPurchaseStatus @default(PENDING)

  deliveredAt    DateTime? @db.Date
  deliveredById  String?   @db.Uuid
  deliveredBy    User?     @relation("PrepaidDeliveredBy", fields: [deliveredById], references: [id], onDelete: Restrict)
  deliveryNotes  String?   @db.Text

  // the STANDARD debt created for the unpaid remainder at delivery (Example C)
  remainderDebtId String? @unique @db.Uuid
  remainderDebt   Debt?   @relation("PrepaidRemainderDebt", fields: [remainderDebtId], references: [id], onDelete: Restrict)

  // optional catalog reference; no stock effect, UI picker deferred
  productId String?  @db.Uuid
  product   Product? @relation(fields: [productId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([deliveredAt])
  @@index([productId])
  @@map("prepaid_purchases")
}
```

Back-relations to add:

- `Debt`: `prepaidPurchase PrepaidPurchase? @relation("PrepaidPurchaseDebt")` and `prepaidRemainderFor PrepaidPurchase? @relation("PrepaidRemainderDebt")`
- `User`: `prepaidDeliveries PrepaidPurchase[] @relation("PrepaidDeliveredBy")`
- `Product`: `prepaidPurchases PrepaidPurchase[]`

Also extend the correction-audit enums (§12):

```prisma
FinancialCorrectionRecordType  + PREPAID_PURCHASE
FinancialCorrectionAction      + DELIVER_PREPAID
                               + REVERT_PREPAID_DELIVERY
FinancialCorrectionSourceScreen + PREPAID
```

### Migration — includes a required backfill

`backend/prisma/migrations/20260731090000_add_prepaid_purchase_delivery/migration.sql`

1. `CreateEnum PrepaidPurchaseStatus`
2. `AlterType` on the three correction enums
3. `CreateTable prepaid_purchases` + indexes + FKs
4. **Backfill — every existing prepaid debt needs a companion row, or it will vanish from the new page:**

```sql
INSERT INTO prepaid_purchases (id, "debtId", status, "createdAt", "updatedAt")
SELECT gen_random_uuid(), d.id,
       CASE WHEN d.status = 'CANCELLED' THEN 'CANCELLED'::"PrepaidPurchaseStatus"
            ELSE 'PENDING'::"PrepaidPurchaseStatus" END,
       now(), now()
FROM debts d
WHERE d.kind = 'PREPAID_PURCHASE';
```

Existing records are backfilled as `PENDING` because **delivery was never recorded — the data does not exist.** Any already-delivered item will need to be marked delivered manually. Tell the owner; do not silently guess.

---

## 7. Balance rules

All money via `backend/src/features/financial/domain/money.ts` (`parseMoney`, `sumMoney`, `subtractMoney`, `moneyToApiString`, `ZERO_MONEY`). Every value crosses the API as a 2-dp **string**. No JS floats.

Per record:

| Field | Rule |
|---|---|
| `fullAmount` | `Debt.originalAmount` |
| `amountPaid` | Σ non-voided `PaymentAllocation.amount` for the debt — reuse existing `calculateDebtBalance` |
| `adminDebt` | `PENDING` → `0 − amountPaid`; else `0.00` |
| `remainingToCollect` | `fullAmount − amountPaid` (≥ 0; informational, **not** a receivable while `PENDING`) |
| `isFullyPaid` | `remainingToCollect == 0` |

Section summary (backend-computed, `basis: 'filtered'` on the list endpoint):

| Field | Rule |
|---|---|
| `totalAdminDebt` | `0 − Σ amountPaid` over `PENDING` only |
| `totalFullAmount` | Σ `fullAmount` over `PENDING` |
| `totalRemainingToCollect` | Σ `remainingToCollect` over `PENDING` |
| `pendingCount` / `deliveredCount` / `cancelledCount` | counts |
| `customerCount` | distinct customers with a `PENDING` prepaid |

**Frontend never sums `items[]` for money.** Same rule as `LedgerSummaryCards.tsx`. Page 2 must show identical totals to page 1.

---

## 8. Delivery workflow

`POST /api/v1/prepaid-purchases/:id/deliver` — one `runFinancialTransaction`:

1. Load prepaid + debt. Reject unless `status = PENDING` → 409.
2. Reject if the underlying debt is cancelled → 409.
3. Compute `remainingToCollect`.
4. If `> 0`, create a `STANDARD` `Debt`:
   - `customerId` — same customer
   - `originalAmount` = `remainingToCollect`
   - `description` = `"Balance for <itemName>"` (bilingual template)
   - `dueDate` = `input.remainderDueDate` (**required** when a remainder exists)
   - `kind = STANDARD`, `status` computed normally — this one *does* age
5. Set `status = DELIVERED`, `deliveredAt`, `deliveredById`, `deliveryNotes`, `remainderDebtId`.
6. Write a correction audit (`DELIVER_PREPAID`) with before/after and `affectedTotals: { adminDebtBefore, adminDebtAfter }`.

`POST /api/v1/prepaid-purchases/:id/revert-delivery` — for misclicks. ADMIN + `accountPassword` + `reason`:

1. Reject unless `status = DELIVERED` → 409.
2. **Reject if the remainder debt has any non-voided payment allocation** → 409 `REMAINDER_DEBT_HAS_PAYMENTS`. Once money has been collected against it, the conversion cannot be unwound here; use the existing correction flows.
3. Cancel the remainder debt via the existing cancel path (preserves audit history — never hard-delete it).
4. Reset to `PENDING`, clear delivery fields and `remainderDebtId`.
5. Audit `REVERT_PREPAID_DELIVERY`.

Without revert, one misclick permanently closes a prepaid and creates a real debt with no way back — that is why it is in v1 rather than deferred.

---

## 9. Backend API

New feature folder `backend/src/features/financial/prepaid/`, following the current feature-folder generation (routes → controller → service → repository → validator → types; static classes; repository methods take optional `tx`).

Mounted in `app.ts` — sub-resource pattern, generic router last:

```ts
app.use('/api/v1/prepaid-purchases', requireAuth, prepaidPurchasesRoutes);
```

| Method | Path | Role | Notes |
|---|---|---|---|
| `GET` | `/api/v1/prepaid-purchases` | any | The table. Filters §14, summary + items + pagination inside `data` |
| `GET` | `/api/v1/prepaid-purchases/:id` | any | Detail incl. payment history and remainder debt link |
| `POST` | `/api/v1/customers/:customerId/prepaid-purchases` | ADMIN | **Already exists — extend only** to also insert the companion row in the same transaction |
| `POST` | `/api/v1/prepaid-purchases/:id/deliver` | ADMIN | `{ remainderDueDate?, deliveryNotes? }`; `remainderDueDate` required when remainder > 0 |
| `POST` | `/api/v1/prepaid-purchases/:id/revert-delivery` | ADMIN | `{ reason, accountPassword }` |

List response shape mirrors the ledger:

```json
{ "success": true,
  "data": {
    "summary": { "totalAdminDebt":"-200.00","totalFullAmount":"400.00","totalRemainingToCollect":"200.00",
                 "pendingCount":1,"deliveredCount":0,"cancelledCount":0,"customerCount":1,"basis":"filtered" },
    "items": [ { "id":"…","debtId":"…","customerId":"…","customerName":"…","customerPhone":"…",
                 "itemName":"Air conditioner","fullAmount":"400.00","amountPaid":"200.00",
                 "adminDebt":"-200.00","remainingToCollect":"200.00","isFullyPaid":false,
                 "status":"PENDING","createdAt":"…","deliveredAt":null,"remainderDebtId":null } ],
    "pagination": { "page":1,"pageSize":25,"total":1,"totalPages":1 }
  },
  "meta": { "timestamp":"…" } }
```

Summary comes from a **separate aggregate over the same WHERE clause**, not from the page slice.

---

## 10. Removing prepaid from the Ledger

This is the cleanup that justifies the whole plan. **Breaking change to the ledger API response** — backend and frontend must ship together.

| File | Change |
|---|---|
| `financial-ledger.validator.ts:15` | Drop `'PREPAID_PURCHASE'` from the type enum |
| `financial-ledger.types.ts:13,32,33` | Drop `'PREPAID_PURCHASE'` from `LedgerType`; **remove** `totalPrepaidAdminDebt` and `activePrepaidCount` |
| `financial-ledger.service.ts` | Exclude `kind = PREPAID_PURCHASE` in the **repository query**, then delete the now-dead branches at lines 104, 108–111, 121, 157, 168–178, 230, 416–417. Line 216's `overdueEligible` guard becomes unconditional here |
| `receivables.service.ts:159` | Delete the `continue` — unreachable once prepaid can't enter |
| `payments.service.ts:526` | Keep. Payments can still target a prepaid debt |
| `customer-summary` service | Keep prepaid metrics (see A1); repoint `totalPrepaidAdminDebt` to the new formula |
| `dashboard-financial.service.ts` | Repoint to the new formula; verify prepaid still excluded from outstanding |
| Frontend | Strip prepaid from `ledger-labels.ts`, `LedgerFilters.tsx`, `LedgerObligationRow.tsx`, `LedgerMobileCard.tsx`, `LedgerSummaryCards.tsx`, `financial-ledger.types.ts` |

Exclude prepaid **at the query level, not in the mapping loop** — that way the ledger's pagination counts stay correct and no filtered-out rows consume page slots.

---

## 11. Frontend

```
frontend/src/pages/PrepaidPurchasesPage.tsx
frontend/src/features/prepaid/
  api/prepaid.api.ts                        (+ .test.ts)
  hooks/usePrepaidPurchases.ts  usePrepaidMutations.ts
  types/prepaid.types.ts
  utils/prepaid-labels.ts  prepaid-query.ts
  components/
    PrepaidTable.tsx            PrepaidMobileCard.tsx
    PrepaidSummaryCards.tsx     PrepaidFilters.tsx
    PrepaidStatusBadge.tsx      PrepaidRowActions.tsx
    DeliverPrepaidDialog.tsx    RevertPrepaidDeliveryDialog.tsx
    PrepaidDetailsDialog.tsx    prepaid.components.test.tsx
```

**The table** (the deliverable the customer asked for):

| Customer | Item | Full Price | Paid | Admin Debt | Remaining | Status | Date | ⋯ |
|---|---|---|---|---|---|---|---|---|
| Ahmad | Air conditioner | 400.00 | 200.00 | **−200.00** | 200.00 | Prepaid | 30/07/2026 | ⋯ |
| Sara | Washing machine | 400.00 | 400.00 | −400.00 | 0.00 | Prepaid | 28/07/2026 | ⋯ |
| Omar | Fridge | 600.00 | 300.00 | 0.00 | — | Delivered | 25/07/2026 | ⋯ |

- **Admin Debt** rendered red/negative with `tabular-nums`; `0.00` shown muted for delivered rows.
- Column drop order on narrow screens: `Date` (`hidden lg:table-cell`), then `Full Price` (`hidden xl:table-cell`). **`Customer`, `Admin Debt`, and `Status` never drop.**
- Customer name links to the customer profile.

**Reuse, don't rebuild:** `components/ui/Modal.tsx`; `formatMoney` / `formatBusinessDate` from `customer-financial/utils/financial-format.ts`; `normalizeFinancialError` from `financial-form-errors.ts`; `TextField` / `SubmitButton` / `inputClass` from `CreateDebtForm.tsx`; the existing `CreatePrepaidPurchaseForm.tsx` (wrap it in a global dialog with a customer picker — do not fork it).

**Query keys:**

```ts
export const prepaidKeys = {
  all: ['prepaid-purchases'] as const,
  list:   (f) => [...prepaidKeys.all, 'list', f] as const,
  detail: (id) => [...prepaidKeys.all, 'detail', id] as const,
};
```

Mutations invalidate `prepaidKeys.all`, `financialLedgerQueryKeyPrefix`, the customer summary key, **and the receivables key** — delivery creates a receivable, so that cache is now stale.

**Routing** — `App.tsx`: `<Route path="prepaid" element={<PrepaidPurchasesPage />} />`
**Nav** — `DashboardLayout.tsx` `navItems`, after `Accounts Receivable`:

```tsx
{ name: 'Prepaid / المدفوع مسبقاً', path: '/prepaid', icon: PackageCheck },
```

**Responsive** — duplicate render trees with CSS breakpoints (`md:hidden` cards / `hidden md:block` table), matching `LedgerTable.tsx`. No media-query hook exists in this repo.

---

## 12. Audit

Reuse `writeFinancialCorrectionAudit` from `backend/src/features/financial/corrections/correction-audit.ts` with the enum additions from §6.

| Event | Action | Password + reason |
|---|---|---|
| Create prepaid | *(none — existing flow unchanged)* | no |
| Mark delivered | `DELIVER_PREPAID` | reason optional, **no password** — a normal business event |
| Revert delivery | `REVERT_PREPAID_DELIVERY` | **both required** — it's a correction |

`beforeValues` / `afterValues` carry `{ status, deliveredAt, remainderDebtId, adminDebt }`. `affectedTotals` carries `{ adminDebtBefore, adminDebtAfter }`. `sourceScreen: 'PREPAID'`.

Password verification reuses `verifyAdminPassword` from `backend/src/lib/admin-verification.ts`, called inside the transaction. It already handles the ADMIN check, bcrypt, the 5-per-15-min lockout, and `admin_verification_logs`. **Never** put `accountPassword` into an audit snapshot.

---

## 13. Bilingual labels

Add a `prepaid` namespace to `frontend/src/shared/labels/business-labels.ts` (single `'English / عربي'` strings, matching the existing file):

```ts
prepaid: {
  title:          'Prepaid Purchases / المشتريات المدفوعة مسبقاً',
  navTitle:       'Prepaid / المدفوع مسبقاً',
  item:           'Item / الصنف',
  fullPrice:      'Full Price / السعر الكامل',
  paid:           'Paid / المدفوع',
  adminDebt:      'We Owe / علينا',
  remaining:      'Remaining / المتبقي',
  status:         'Status / الحالة',
  statusPending:  'Prepaid / مدفوع مسبقاً',
  statusDelivered:'Delivered / تم التسليم',
  statusCancelled:'Cancelled / ملغى',
  markDelivered:  'Mark Delivered / تسجيل التسليم',
  revertDelivery: 'Revert Delivery / إلغاء التسليم',
  remainderDueDate:'Due Date for Remaining / تاريخ استحقاق المتبقي',
  deliveryNotes:  'Delivery Notes / ملاحظات التسليم',
  addPrepaid:     'Add Prepaid Purchase / إضافة شراء مدفوع مسبقاً',
  totalWeOwe:     'Total We Owe / إجمالي ما علينا',
},
```

`'We Owe / علينا'` is deliberately chosen over a literal translation of "admin debt" — it states plainly whose money it is.

User-entered text (item name, notes, customer name) gets `dir="auto"` + `className="user-text"`, per the established pattern (~162 existing usages, utilities in `frontend/src/styles/index.css`). No app-wide RTL.

---

## 14. Filters and search

- Status pills (`role="tablist"`): **Prepaid (default)** / Delivered / Cancelled / All
- `search` — customer name, phone, or item name
- Customer picker (reuse `CustomerPicker.tsx`)
- Date range on creation date
- Checkbox: **Fully paid only / المدفوع بالكامل فقط** — surfaces items ready to hand over with no remainder
- `sortBy`: `createdAt` (default, desc) | `adminDebt` | `customerName`; `page` / `pageSize` (25, max 100)

Every setter resets `page: 1`. Export pure helpers (`resetPrepaidFilters`, `hasActivePrepaidFilters`) alongside the component so they're testable without rendering, as `LedgerFilters.tsx` does.

Default view: **`PENDING` only, newest first** — the actionable list.

---

## 15. Permissions

| Capability | ADMIN | EMPLOYEE |
|---|---|---|
| View page, table, details | ✅ | ✅ |
| Create prepaid | ✅ | ❌ (unchanged from today) |
| Mark delivered | ✅ | ❌ |
| Revert delivery | ✅ + password + reason | ❌ |

Route-level `requireFinancialAdmin` **and** an in-service assertion, matching existing financial features so direct service calls stay guarded.

---

## 16. Validation

| Field | Rule |
|---|---|
| `remainderDueDate` | `YYYY-MM-DD`; **required when `remainingToCollect > 0`**, rejected when it is `0`; not before today (`todayInBusinessTimezone`) |
| `deliveryNotes` | optional, ≤1000, `userTextSchema` |
| `reason` (revert) | required, 5–1000 |
| `accountPassword` (revert) | required, `min(1)`, never logged |

State guards: deliver requires `PENDING`; revert requires `DELIVERED`; revert blocked if the remainder debt has payments; cancelled prepaids reject both. Creation validation is unchanged (`paymentAmount > 0`, `≤ fullAmount`).

---

## 17. Dashboard

One card, clearly labelled and **visually separated from customer receivables** — these have opposite signs and must never sit in one row:

- **Total We Owe Customers / إجمالي ما علينا للعملاء** = `totalAdminDebt` over `PENDING`

Reuse the existing prepaid dashboard wiring in `dashboard-financial.service.ts`; only the formula changes (§4). Do **not** fold it into any outstanding/receivable total.

---

## 18. Testing

Vitest, colocated. Backend service tests mock repositories via `vi.hoisted` and stub `runFinancialTransaction` to `op => op(tx)`. Frontend component tests use `renderToStaticMarkup` — **there is no `@testing-library` or jsdom in this repo; do not add one.**

**Backend service**

- create prepaid → companion row created in the same transaction
- `adminDebt` for 400/200 `PENDING` → `"-200.00"`
- **`adminDebt` for 400/100 `PENDING` → `"-100.00"`** (guards the §4 change; would have been `-300.00`)
- `adminDebt` for `DELIVERED` → `"0.00"`; for `CANCELLED` → `"0.00"`
- `remainingToCollect` 400/200 → `"200.00"`
- deliver with remainder → prepaid `DELIVERED`, new `STANDARD` debt of `200.00` with the given due date, `remainderDebtId` set
- **the new remainder debt appears in receivables; the delivered prepaid does not**
- deliver fully-paid → no remainder debt created
- deliver without `remainderDueDate` when remainder > 0 → 400
- deliver twice → 409; deliver a cancelled prepaid → 409
- revert → remainder debt cancelled (not deleted), status back to `PENDING`
- revert when remainder debt has a payment → 409
- revert without password/reason → throws
- audits written for deliver + revert with correct before/after and **no password field**
- `totalAdminDebt` counts `PENDING` only
- summary totals identical on page 1 and page 2
- Arabic item name accepted end to end
- all money returned as strings (`typeof === 'string'`)

**Backend routes**

- 401 without token; 403 for EMPLOYEE on deliver/revert; 200 for EMPLOYEE on GET
- **ledger response no longer contains `totalPrepaidAdminDebt` or `activePrepaidCount`**
- **ledger `type=PREPAID_PURCHASE` now → 400** (removed from the enum)
- ledger items contain no `PREPAID_PURCHASE` rows, and pagination `total` reflects the exclusion

**Frontend**

- `PrepaidTable` renders the negative amount and both status labels
- Arabic labels present (`toContain('مدفوع مسبقاً')`)
- `dir="auto"` on customer name and item name
- summary cards render API `summary` values, not a recomputed sum
- delivered rows show `0.00` admin debt
- `DeliverPrepaidDialog` requires a due date only when a remainder exists
- filter helpers unit-tested without rendering
- loading / empty / error states

---

## 19. Checkpoints

| CP | Deliverable | Done when |
|---|---|---|
| **CP1** | Confirm the §3 inventory and re-run the reference count (`isPrepaid\|PREPAID_PURCHASE` → 66 refs / 24 files). No code | Baseline agreed |
| **CP2** | Prisma: `PrepaidPurchaseStatus`, `PrepaidPurchase`, 3 enum extensions, back-relations, migration **+ backfill** | `prisma:validate` passes; backfill row count == existing prepaid debt count |
| **CP3** | Extend creation to insert the companion row in the same transaction; **do not alter the 3-write flow** | Existing prepaid tests still green |
| **CP4** | `features/financial/prepaid/` read model: list + detail + summary, corrected `adminDebt` formula | Formula tests green, incl. the 400/100 → `-100.00` case |
| **CP5** | Deliver + revert endpoints with remainder-debt conversion and audits | Delivery tests green |
| **CP6** | **Remove prepaid from the Ledger** (backend + frontend together) and delete dead exclusion checks | Ledger tests green; reference count drops sharply |
| **CP7** | Labels: `prepaid` namespace + `prepaid-labels.ts` | Labels test green |
| **CP8** | Frontend types + api + hooks | api/hook tests green |
| **CP9** | `PrepaidPurchasesPage`: table, mobile cards, summary cards, filters, nav + route | Renders; admin actions gated |
| **CP10** | Deliver / revert / details dialogs with field-error mapping | Flows work against the real API |
| **CP11** | Dashboard card repointed to the new formula | Card correct |
| **CP12** | Update `PREPAID_PURCHASE_DESIGN.md` (§4), `PROJECT_BRIEF.md`, tests, full verification | All five commands green |

CP6 is the risky one — do not batch it with CP5.

---

## 20. Risks and open decisions

| # | Risk | Mitigation |
|---|---|---|
| **R1** | **Owner sees changed liability figures** after §4 ships | Communicate before deploy; the old number survives as *Remaining to collect*; update the design doc |
| **R2** | Backfilled records all become `PENDING`; genuinely delivered items look outstanding | Unavoidable — the data was never captured. Tell the owner to mark them delivered once |
| **R3** | Removing two ledger summary fields breaks the frontend if shipped apart | CP6 ships backend + frontend in one change; route test asserts absence |
| **R4** | Double-counting after delivery (prepaid *and* remainder debt both counted) | Delivered prepaid has `adminDebt = 0` and is excluded from receivables; explicit test |
| **R5** | Revert after money collected on the remainder debt would corrupt history | Hard 409 guard; use existing correction flows instead |
| **R6** | Filtering prepaid out in the mapping loop would corrupt ledger pagination | Filter in the repository query; test asserts `total` |
| **R7** | Later payments overpaying a prepaid → negative `remainingToCollect` | Clamp at `0.00`; verify the existing debt-payment path already caps allocation at remaining, and add a test |
| **R8** | `Debt.dueDate` remains a meaningless placeholder for prepaid rows | Accepted; prepaid is excluded from all date logic. Cleaning up the column is not worth a financial-table migration |

**Assumptions — override if wrong:**

- **A1 — prepaid stays visible on the customer profile.** "Remove from the Ledger" is read as the *global Ledger page* only. Hiding a customer's prepaid from their own profile would be a regression, so `CustomerDebtsList` / `DebtDetails` / `FinancialSummaryCards` keep showing it, with a link to the new section.
- **A2 — creation stays available from both places:** the existing customer-profile "Add Financial Obligation" flow *and* a new global dialog on the prepaid page.
- **A3 — one prepaid = one item.** Multi-item prepaids are out of scope.
- **A4 — `productId` column is added but no UI picker in v1.** Cheaper than a later migration; costs nothing now.

---

## 21. Files likely to change

**New — backend**

```
backend/prisma/migrations/20260731090000_add_prepaid_purchase_delivery/migration.sql
backend/src/features/financial/prepaid/prepaid.{routes,controller,service,repository,validator,types}.ts
backend/src/features/financial/prepaid/prepaid.{routes,service,validator}.test.ts
```

**New — frontend**

```
frontend/src/pages/PrepaidPurchasesPage.tsx
frontend/src/features/prepaid/**  (api, hooks, types, utils, 9 components + test)
```

**Modified**

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | +1 enum, +1 model, 3 enum extensions, back-relations on `Debt`/`User`/`Product` |
| `backend/src/app.ts` | +1 router mount |
| `backend/src/features/financial/debts/debts.service.ts` | Creation also inserts the companion row |
| `backend/src/features/financial/ledger/financial-ledger.{service,types,validator}.ts` | **Remove prepaid entirely** (12 + 4 + 1 refs) |
| `backend/src/features/financial/receivables/receivables.service.ts` | Delete dead `continue` |
| `backend/src/features/financial/customer-summary/customer-financial-summary.service.ts` | Repoint `totalPrepaidAdminDebt` / `adminDebt` to the new formula |
| `backend/src/features/dashboard/dashboard-financial.service.ts` | Same repoint |
| `frontend/src/App.tsx`, `layouts/DashboardLayout.tsx` | +1 route, +1 nav item |
| `frontend/src/shared/labels/business-labels.ts` (+ test) | `prepaid` namespace |
| `frontend/src/features/financial-ledger/**` | Strip prepaid from labels, filters, rows, mobile cards, summary cards, types |
| `frontend/src/features/customer-financial/**` | Keep prepaid (A1); repoint displayed admin debt; add link to new section |
| `docs/phases/phase-1-0-7/PREPAID_PURCHASE_DESIGN.md` | Correct the accounting model + example |
| `claude/PROJECT_BRIEF.md` | Note the new section |

---

## 22. Verification

**Per checkpoint**

```
npm run typecheck
npx vitest run backend/src/features/financial
npx vitest run frontend/src/features/prepaid
```

**Manual end-to-end**

1. Nav shows **Prepaid / المدفوع مسبقاً**.
2. Create: item "Air conditioner", full `400`, payment `200` → row shows Paid `200.00`, **Admin Debt `-200.00`**, Remaining `200.00`, status *Prepaid*.
3. Create a second with full `400`, payment `100` → Admin Debt **`-100.00`** (was `-300.00` before this change).
4. Confirm neither appears in **Accounts Receivable** and neither goes overdue.
5. Arabic item name renders correctly and is not mangled in the table.
6. Mark #1 delivered with a due date → status *Delivered*, Admin Debt `0.00`, and a new `200.00` debt appears in Accounts Receivable with that due date.
7. Revert #1's delivery → the `200.00` debt is **cancelled** (still visible in history, not deleted), status back to *Prepaid*, Admin Debt `-200.00`.
8. Record a payment against a delivered remainder debt, then try to revert → clear 409.
9. Fully pay a prepaid (`400` of `400`) → deliver → no remainder debt created.
10. Ledger page shows **no prepaid rows** and no prepaid summary cards; debts, plans, and payments unchanged.
11. Customer profile still shows prepaid (A1) with the corrected figure.
12. Filter to Delivered, then Prepaid → summary cards change and read "Current filters"; page 2 totals match page 1.
13. Resize to 375px → Customer / Admin Debt / Status all still visible; no horizontal page scroll.
14. Dashboard "Total We Owe Customers" equals the sum of `PENDING` admin debt, and is not mixed into outstanding receivables.

**Final gate**

```
npm run lint
npm run typecheck
npm run test
npm run build
npm run prisma:validate
```
