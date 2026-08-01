# Supplier Management & Supplier Ledger — Implementation Plan

> Intended destination in-repo: `claude/plans/supplier-management-and-ledger-plan.md`
> Planning document only. No code, migrations, or commits are produced by this plan.

---

## 1. Version goal

HomeConnect today tracks only **money customers owe the business** (debts, installment plans, payments, customer financial ledger). There is no record of **money the business owes its suppliers**. Purchases, supplier payments, and returns/discounts currently live outside the system, so the owner has no single place to answer "how much do we owe this supplier right now?"

This version adds a self-contained **Suppliers** section and a **Supplier Ledger**, mirroring the existing customer/ledger UX so the business does not have to learn a new workflow.

Confirmed against the repo: nothing supplier-related exists yet. The only `supplier` hit anywhere is the unrelated service-job status `SENT_TO_COMPANY` / `atSupplier`. This is greenfield — the whole feature can be added without touching customer financial models.

**Non-goal:** this is not accounting. No inventory linkage, no purchase orders, no double-entry, no supplier→product stock effects.

---

## 2. Business workflow

1. Owner opens **Suppliers / المورّدين**, searches by name / phone / company.
2. Adds a supplier (name + phone required; company, second phone, email, notes optional). No address.
3. Opens a supplier's profile: contact info, **total owed / total paid / current balance**, recent transactions, notes.
4. Records a transaction:
   - received goods on credit → **Supplier Debt** (balance owed goes up)
   - paid the supplier → **Supplier Payment** (balance owed goes down)
   - supplier gave a discount / accepted a return → **Supplier Credit** (down)
   - manual correction → **Adjustment** (up or down, direction chosen explicitly)
5. Opens **Supplier Ledger / دفتر حسابات المورّدين** to see all supplier movement across all suppliers, filtered by supplier / type / date range.
6. Admin corrects a wrong entry: edit or remove, providing **their account password + a reason**. The original values are preserved in an audit row.
7. Suppliers no longer used are **archived** (soft), not deleted. A supplier created by mistake with zero transactions can be hard-deleted by an admin.

---

## 3. Supplier scope

**In scope**

| Capability | Notes |
|---|---|
| Add supplier | name + phone required |
| Edit supplier | admin; password + reason only when sensitive fields change |
| Archive / restore supplier | soft; archived suppliers rejected for new transactions |
| Guarded hard delete | admin only, **409 if any transaction row exists** (including removed ones) |
| Supplier details | info + backend-computed totals + recent transactions |
| Search & filter | name, phone, company, active/archived |
| Bilingual UI | EN / AR labels for this feature only |

**Explicitly excluded from the supplier record:** address (per requirement), credit limit, payment terms, tax/VAT number, bank details, supplier categories, attachments.

---

## 4. Supplier transaction / ledger scope

**In scope**

- Four transaction types: `SUPPLIER_DEBT`, `SUPPLIER_PAYMENT`, `SUPPLIER_CREDIT`, `SUPPLIER_ADJUSTMENT`.
- An explicit persisted `direction` (`INCREASE_OWED` / `DECREASE_OWED`) so balance math is a single rule, never a per-type `switch`, and never a negative amount.
- Per-supplier summary: total owed, total paid, current balance — **all computed in the database, returned as strings**.
- Global supplier ledger: paginated, filtered, newest first, with a filtered summary.
- Create / edit / soft-remove / restore transactions (admin, password + reason for edit/remove).
- Audit trail with before/after JSON and reason.

**Out of scope for this version** — see §5.

---

## 5. What is explicitly out of scope

- Purchase orders, goods-receipt notes, invoices, invoice line items.
- Any link between supplier transactions and `Product` stock or `ServiceJob`.
- Payment methods / cash-drawer integration for supplier payments (a plain `reference` free-text field covers cheque no. / transfer ref).
- Supplier installment plans or scheduled due dates.
- Aging buckets / supplier statements / printable supplier reports.
- Merging supplier transactions into the customer `financial-ledger` endpoint or page. **Customer Ledger and Supplier Ledger stay separate screens and separate endpoints.**
- App-wide i18n or RTL layout. Only this feature's labels become bilingual.
- Multi-currency. Single implied currency, same as the rest of the app.
- Attachments / file uploads.

---

## 6. Supplier data model plan

`backend/prisma/schema.prisma` — additive only. **Do not modify `Customer`, `Debt`, `Payment`, `InstallmentPlan`, `PaymentAllocation`, or `FinancialCorrectionAudit`.**

```prisma
model Supplier {
  id             String    @id @default(uuid()) @db.Uuid
  name           String
  phone          String
  companyName    String?
  secondaryPhone String?
  email          String?
  notes          String?   @db.Text

  isActive       Boolean   @default(true)
  archivedAt     DateTime?
  archivedReason String?   @db.Text

  createdById    String    @db.Uuid
  createdBy      User      @relation("SupplierCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedById    String?   @db.Uuid
  updatedBy      User?     @relation("SupplierUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  transactions   SupplierTransaction[]
  audits         SupplierAudit[]

  @@index([name])
  @@index([phone])
  @@index([companyName])
  @@index([isActive])
  @@map("suppliers")
}
```

Conventions being followed (verified in the existing schema):
- `String @id @default(uuid()) @db.Uuid`, all FKs `@db.Uuid`.
- `createdById`/`updatedById` **with named relations** (the newer convention — not `Customer`'s legacy bare `createdBy` scalar).
- `onDelete: Restrict` on every relation.
- `@db.Text` for free-form notes/reasons.
- `@@map("snake_case_plural")`.
- **Every new relation must also be added to the back-relation list on the `User` model** (`schema.prisma` ~lines 168–184). This is easy to miss and will fail `prisma validate`.

No `deletedAt` on `Supplier`: archive is `isActive=false` + `archivedAt`, and hard delete is a real row delete (only when transaction count is zero).

---

## 7. Supplier transaction model plan

```prisma
enum SupplierTransactionType {
  SUPPLIER_DEBT
  SUPPLIER_PAYMENT
  SUPPLIER_CREDIT
  SUPPLIER_ADJUSTMENT
}

enum SupplierTransactionDirection {
  INCREASE_OWED
  DECREASE_OWED
}

enum SupplierTransactionStatus {
  ACTIVE
  REMOVED
}

model SupplierTransaction {
  id              String                       @id @default(uuid()) @db.Uuid
  supplierId      String                       @db.Uuid
  supplier        Supplier                     @relation(fields: [supplierId], references: [id], onDelete: Restrict)

  type            SupplierTransactionType
  direction       SupplierTransactionDirection
  amount          Decimal                      @db.Decimal(12, 2)
  transactionDate DateTime                     @db.Date

  description     String?
  reference       String?
  notes           String?                      @db.Text

  status          SupplierTransactionStatus    @default(ACTIVE)
  removedAt       DateTime?
  removedById     String?                      @db.Uuid
  removedBy       User?                        @relation("SupplierTxRemovedBy", fields: [removedById], references: [id], onDelete: Restrict)
  removedReason   String?                      @db.Text

  createdById     String                       @db.Uuid
  createdBy       User                         @relation("SupplierTxCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedById     String?                      @db.Uuid
  updatedBy       User?                        @relation("SupplierTxUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  createdAt       DateTime                     @default(now())
  updatedAt       DateTime                     @updatedAt

  audits          SupplierAudit[]

  @@index([supplierId])
  @@index([supplierId, status])
  @@index([transactionDate])
  @@index([type])
  @@index([status])
  @@map("supplier_transactions")
}
```

Notes:
- `amount` is **always positive**. Sign lives in `direction`. This is the single most important modelling decision here — it removes every "is this a negative payment or a positive credit?" ambiguity from both the service and the UI.
- Removal follows the existing soft-cancel triple used by `Debt` (`cancelledAt`/`cancelledById`/`cancelReason`) and `Payment` (`voidedAt`/`voidedById`/`voidReason`), just renamed to `removed*`.
- `@db.Date` for `transactionDate` — date-only, consistent with `dueDate`/`paymentDate`.

### Audit model

Mirrors `ServiceAudit` (the newer, simpler of the two existing audit systems) rather than `FinancialCorrectionAudit`.

```prisma
enum SupplierAuditRecordType { SUPPLIER  SUPPLIER_TRANSACTION }
enum SupplierAuditAction     { CREATE  UPDATE  ARCHIVE  RESTORE  REMOVE  RESTORE_TRANSACTION  DELETE }

model SupplierAudit {
  id                    String                  @id @default(uuid()) @db.Uuid
  recordType            SupplierAuditRecordType
  recordId              String                  @db.Uuid

  supplierId            String?                 @db.Uuid
  supplier              Supplier?               @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  supplierTransactionId String?                 @db.Uuid
  supplierTransaction   SupplierTransaction?    @relation(fields: [supplierTransactionId], references: [id], onDelete: Restrict)

  action                SupplierAuditAction
  changedById           String                  @db.Uuid
  changedBy             User                    @relation("SupplierAuditChangedBy", fields: [changedById], references: [id], onDelete: Restrict)
  changedByName         String
  changedByUsername     String
  changedAt             DateTime                @default(now())

  reason                String                  @db.Text
  beforeValues          Json
  afterValues           Json

  requestId             String?
  ipAddress             String?

  @@index([recordType, recordId, changedAt])
  @@index([supplierId, changedAt])
  @@index([changedAt])
  @@map("supplier_audits")
}
```

`changedByName`/`changedByUsername` are denormalized inside the transaction via a `loadActor(userId, tx)` helper — same as `products.service.ts` does — so the audit stays readable if the user is later renamed.

**Hard-delete caveat:** because `SupplierAudit.supplierId` is `onDelete: Restrict`, the guarded hard delete must delete the supplier's audit rows inside the same transaction (there are no transaction rows by definition, since delete is blocked otherwise). The `DELETE` audit row itself is written with `supplierId: null` and the id captured in `recordId` + `beforeValues`, so the deletion event survives the deletion.

### Migration

`backend/prisma/migrations/20260730120000_add_suppliers_and_supplier_ledger/migration.sql`

Follows the existing convention: hand-picked round timestamp, snake_case description, a single `migration.sql` with `-- CreateEnum` / `-- CreateTable` / `-- CreateIndex` / `-- AddForeignKey` sections.

---

## 8. Balance calculation rules

**One rule, applied to `ACTIVE` rows only:**

```
balance = Σ amount where direction = INCREASE_OWED
        − Σ amount where direction = DECREASE_OWED
```

`balance > 0` → the business owes the supplier. `balance < 0` → the supplier owes the business (overpayment/credit surplus) — allowed and displayed, not blocked.

Direction is derived server-side from type, and is the only field the client may set for adjustments:

| Type | Direction | Client may choose? |
|---|---|---|
| `SUPPLIER_DEBT` | `INCREASE_OWED` | no — forced |
| `SUPPLIER_PAYMENT` | `DECREASE_OWED` | no — forced |
| `SUPPLIER_CREDIT` | `DECREASE_OWED` | no — forced |
| `SUPPLIER_ADJUSTMENT` | either | **yes — required** |

Implement as a pure exported function `resolveSupplierDirection(type, requestedDirection)` in `supplier-domain.ts`, unit-tested independently. Validator rejects a `direction` sent with a non-adjustment type whose value disagrees with the forced one.

**Summary fields returned by the backend:**

- `totalOwed` — Σ `INCREASE_OWED` (all debt + upward adjustments)
- `totalPaid` — Σ `amount` where `type = SUPPLIER_PAYMENT`
- `totalCredit` — Σ `amount` where `type = SUPPLIER_CREDIT`
- `balance` — the formula above
- `transactionCount`
- `basis` — `'lifetime'` on the supplier summary endpoint, `'filtered'` on the ledger endpoint

Money handling — **reuse, do not reimplement**:
- `backend/src/features/financial/domain/money.ts`: `parseMoney`, `addMoney`, `subtractMoney`, `sumMoney`, `assertPositiveMoney`, `ZERO_MONEY`, and above all **`moneyToApiString`** (→ 2-dp string). Every money field crosses the wire as a string. Never a JS `number`.
- `backend/src/features/financial/domain/business-date.ts`: `parseBusinessDate`, `businessDateToPrisma`, `prismaDateToBusinessDate`, `todayInBusinessTimezone`.
- `backend/src/features/financial/infrastructure/transaction.ts`: `runFinancialTransaction` (Serializable + P2034 retry) wraps every supplier mutation, so the write + audit row commit together.

Aggregation uses `prisma.supplierTransaction.groupBy({ by: ['direction'], _sum: { amount: true } })` — Postgres `numeric` summation, returned as Prisma `Decimal`, stringified with `moneyToApiString`. **No JS float arithmetic anywhere in the path.**

**Frontend rule:** the frontend renders `summary.*` verbatim through `formatMoney`. It must never sum `items[]` to produce a total — that would be wrong on any page but the first. This mirrors `LedgerSummaryCards.tsx`, whose only client-side arithmetic is adding two integer counts.

---

## 9. Backend API plan

New feature root: `backend/src/features/suppliers/`, following the current feature-folder generation (`routes → controller → service → repository → validator → types`, all static classes, repository methods accepting an optional `tx?: Prisma.TransactionClient`). **Do not copy the legacy `src/routes|controllers|services` layout that customers use.**

Mounted in `backend/src/app.ts` — sub-resource routers **before** the generic router, matching the existing customers pattern:

```ts
app.use('/api/v1/suppliers', requireAuth, supplierTransactionsRoutes); // /:supplierId/transactions, /:supplierId/summary, /:supplierId/audit
app.use('/api/v1/suppliers', requireAuth, suppliersRoutes);            // generic CRUD — LAST
app.use('/api/v1/supplier-transactions', requireAuth, supplierTransactionsGlobalRoutes);
app.use('/api/v1/supplier-ledger', requireAuth, supplierLedgerRoutes);
```

### Suppliers

| Method | Path | Role | Body / query |
|---|---|---|---|
| `POST` | `/api/v1/suppliers` | ADMIN | `{ name, phone, companyName?, secondaryPhone?, email?, notes? }` |
| `GET` | `/api/v1/suppliers` | any | `search, isActive, sortBy, sortOrder, page, pageSize` |
| `GET` | `/api/v1/suppliers/:id` | any | supplier + lifetime summary |
| `PATCH` | `/api/v1/suppliers/:id` | ADMIN | fields + `reason?` + `accountPassword?` (required when sensitive — see §11) |
| `POST` | `/api/v1/suppliers/:id/archive` | ADMIN | `{ reason, accountPassword }` |
| `POST` | `/api/v1/suppliers/:id/restore` | ADMIN | `{ reason, accountPassword }` |
| `DELETE` | `/api/v1/suppliers/:id` | ADMIN | `{ reason, accountPassword }` — **409 `SUPPLIER_HAS_TRANSACTIONS` if any transaction row exists, active or removed** |
| `GET` | `/api/v1/suppliers/:id/summary` | any | lifetime totals, `basis: 'lifetime'` |
| `GET` | `/api/v1/suppliers/:id/audit` | ADMIN | `page, pageSize` |

### Supplier transactions

| Method | Path | Role | Notes |
|---|---|---|---|
| `POST` | `/api/v1/suppliers/:supplierId/transactions` | ADMIN | `{ type, direction?, amount, transactionDate, description?, reference?, notes? }`; 409 if supplier archived |
| `GET` | `/api/v1/suppliers/:supplierId/transactions` | any | paginated, `includeRemoved` |
| `GET` | `/api/v1/supplier-transactions/:id` | any | single |
| `PATCH` | `/api/v1/supplier-transactions/:id` | ADMIN | `{ ...fields, reason, accountPassword }` — reason + password **always required** |
| `POST` | `/api/v1/supplier-transactions/:id/remove` | ADMIN | `{ reason, accountPassword }` → `status = REMOVED` |
| `POST` | `/api/v1/supplier-transactions/:id/restore` | ADMIN | `{ reason, accountPassword }` → back to `ACTIVE` |

**No `DELETE` route exists for transactions.** Financial history is never physically destroyed.

### Supplier ledger (global read model)

`GET /api/v1/supplier-ledger`

Query: `supplierId, type, direction, dateFrom, dateTo, search, includeRemoved, page, pageSize, sortBy, sortOrder`
Defaults: `page=1, pageSize=25 (max 100), sortBy='transactionDate', sortOrder='desc', includeRemoved=false`

Response (envelope matching the existing financial ledger, where the pagination block sits **inside `data`**):

```json
{ "success": true,
  "data": {
    "summary": { "totalOwed":"0.00","totalPaid":"0.00","totalCredit":"0.00","balance":"0.00","transactionCount":0,"supplierCount":0,"basis":"filtered" },
    "items": [ { "id":"…","supplierId":"…","supplierName":"…","type":"SUPPLIER_DEBT","direction":"INCREASE_OWED","amount":"250.00","transactionDate":"2026-07-30","description":null,"reference":null,"status":"ACTIVE","createdAt":"…" } ],
    "pagination": { "page":1,"pageSize":25,"total":0,"totalPages":0 }
  },
  "meta": { "timestamp": "…" } }
```

The summary is computed with a **separate `groupBy` over the same WHERE clause** — not from the page slice. (Note: the existing customer ledger aggregates three record types in memory and slices; the supplier ledger is a single table, so it should paginate in SQL properly. Do not copy the in-memory slicing.)

Standard envelope + error codes come free from `backend/src/lib/errors.ts` (`ValidationError` 400, `AuthenticationError` 401, `AuthorizationError` 403, `NotFoundError` 404) via the existing `errorHandler`.

---

## 10. Frontend UI plan

```
frontend/src/features/suppliers/
  api/      suppliers.api.ts  supplier-transactions.api.ts  supplier-ledger.api.ts  (+ .test.ts)
  hooks/    useSuppliers.ts  useSupplier.ts  useSupplierMutations.ts
            useSupplierLedger.ts  useSupplierTransactionMutations.ts
  types/    supplier.types.ts  supplier-transaction.types.ts  supplier-ledger.types.ts
  utils/    supplier-labels.ts  supplier-query.ts
  components/ (see below)
frontend/src/pages/
  SuppliersPage.tsx  SupplierProfilePage.tsx  SupplierLedgerPage.tsx
```

Pages live in `src/pages/` — the convention already used by `LedgerPage.tsx` and `AccountsReceivablePage.tsx`.

**Components**

| Component | Mirrors |
|---|---|
| `SupplierTable.tsx` + `SupplierMobileCard.tsx` | `LedgerTable.tsx` / `ProductMobileCard.tsx` |
| `SupplierFormDialog.tsx` (add + edit) | product form dialog + `CreateDebtForm` field primitives |
| `SupplierArchiveDialog.tsx` / `SupplierDeleteDialog.tsx` | `CancelDebtDialog.tsx` |
| `SupplierStatusBadge.tsx` | `FinancialStatusBadge.tsx` |
| `SupplierSummaryCards.tsx` | `LedgerSummaryCards.tsx` |
| `SupplierTransactionTable.tsx` + `SupplierTransactionMobileCard.tsx` | `LedgerTable.tsx` + `LedgerMobileCard.tsx` |
| `SupplierTransactionFormDialog.tsx` | `GlobalAddObligationDialog.tsx` |
| `SupplierTransactionEditDialog.tsx` / `SupplierTransactionRemoveDialog.tsx` | `EditDebtDialog.tsx` / `VoidPaymentDialog.tsx` |
| `SupplierLedgerFilters.tsx` | `LedgerFilters.tsx` |
| `SupplierRowActions.tsx` | `LedgerRowActions.tsx` |
| `SupplierPicker.tsx` | `CustomerPicker.tsx` |
| `SupplierStates.tsx` (loading / error / empty) | `LedgerStates.tsx` |

**Reuse, don't rebuild:**
- `components/ui/Modal.tsx` — the only dialog primitive (`{ isOpen, onClose, title, children, maxWidth }`).
- `formatMoney`, `formatBusinessDate`, `formatDateTime` from `features/customer-financial/utils/financial-format.ts` (already imported cross-feature by `financial-ledger`).
- `sanitizeMoneyInput` / `canonicalMoneyInput` from `features/customer-financial/utils/money-input.ts` (BigInt cents, no floats).
- `normalizeFinancialError` from `features/customer-financial/utils/financial-form-errors.ts` for 400 field errors → `react-hook-form` `setError`.
- `TextField` / `SubmitButton` / `inputClass` exported from `CreateDebtForm.tsx`.
- The axios singleton `services/api.ts` (bearer + 401 refresh already handled).

**Data fetching** — TanStack Query v5. Key factory, as in `useProducts.ts`:

```ts
export const supplierKeys = {
  all: ['suppliers'] as const,
  list:   (f) => [...supplierKeys.all, 'list', f] as const,
  detail: (id) => [...supplierKeys.all, 'detail', id] as const,
  summary:(id) => [...supplierKeys.all, 'summary', id] as const,
  audit:  (id) => [...supplierKeys.all, 'audit', id] as const,
};
export const supplierLedgerQueryKey = (f = {}) => ['supplier-ledger', normalizeSupplierLedgerFilters(f)] as const;
export const supplierLedgerQueryKeyPrefix = ['supplier-ledger'] as const;
```

Mutations invalidate `supplierKeys.all` + `supplierLedgerQueryKeyPrefix` and fire a `react-hot-toast` success; `onError` → `toast.error(normalizeFinancialError(e).message)`.

**Routing** — `frontend/src/App.tsx`, inside the protected `DashboardLayout` route:

```tsx
<Route path="suppliers" element={<SuppliersPage />} />
<Route path="suppliers/:id" element={<SupplierProfilePage />} />
<Route path="supplier-ledger" element={<SupplierLedgerPage />} />
```

**Navigation** — two entries in the `navItems` array in `frontend/src/layouts/DashboardLayout.tsx` (icons from `lucide-react`):

```tsx
{ name: 'Suppliers / المورّدين',            path: '/suppliers',       icon: Truck },
{ name: 'Supplier Ledger / دفتر حسابات المورّدين', path: '/supplier-ledger', icon: BookMarked },
```

Placed after `Products`, before `Settings`. The header title derives from the same array automatically.

**Responsive** — the established pattern is duplicate render trees with CSS breakpoints, not a media-query hook:

```tsx
<div className="space-y-3 md:hidden">   {items.map(i => <SupplierTransactionMobileCard … />)} </div>
<div className="hidden md:block"><div className="overflow-x-auto"><table>…</table></div></div>
```

Low-priority columns drop with `hidden lg:table-cell` (Reference) and `hidden xl:table-cell` (Created by). Touch targets `min-h-10 min-w-10`. Amount cells use `tabular-nums`. Summary grid `grid-cols-2 md:grid-cols-4`.

---

## 11. Admin edit/remove policy

**Roles (confirmed decision): EMPLOYEE is read-only.** All mutations are ADMIN-only, matching how `features/service/products` is locked down today.

Enforcement is **doubled**, exactly as the existing features do it — route middleware *and* an in-service assertion, so the service stays safe when called directly (which is how the unit tests call it):

```ts
// backend/src/features/suppliers/authorization/supplier-policy.ts
export const requireSupplierAdmin = requireRole([Role.ADMIN]);
export function assertSupplierAdmin(user: { role: string }): void;
export const SUPPLIER_SENSITIVE_FIELDS = ['name', 'phone'] as const;
export const SUPPLIER_TX_SENSITIVE_FIELDS = ['type', 'direction', 'amount', 'transactionDate'] as const;
export function containsSensitiveSupplierFields(fields: string[]): boolean;
export function containsSensitiveSupplierTxFields(fields: string[]): boolean;
```

**When `accountPassword` + `reason` are required:**

| Operation | Password + reason |
|---|---|
| Create supplier | no |
| Edit supplier — `companyName`, `secondaryPhone`, `email`, `notes` only | no |
| Edit supplier — touches `name` or `phone` | **yes** |
| Archive / restore supplier | **yes** |
| Hard delete supplier | **yes** |
| Create transaction | no |
| Edit transaction (any field) | **yes** — always |
| Remove / restore transaction | **yes** |

Password verification reuses `verifyAdminPassword(userId, password, context, tx)` from `backend/src/lib/admin-verification.ts` — called **inside** the transaction, the newer pattern used by `products.service.ts`:

```ts
await verifyAdminPassword(user.userId, input.accountPassword!, {
  action: 'UPDATE_SUPPLIER_TRANSACTION',
  recordType: 'SUPPLIER_TRANSACTION',
  recordId: id,
  ipAddress: context.ipAddress,
  domainLabel: 'supplier changes',
}, tx);
```

That helper already provides: ADMIN-role check, active/not-deleted user check, bcrypt compare, a rolling 5-attempts-per-15-minutes lockout, and an `admin_verification_logs` row for **every** attempt including failures. Nothing new to build.

**Passwords are never stored, never logged, never echoed, and never placed in `beforeValues`/`afterValues`.** The `accountPassword` field is stripped before any audit snapshot is taken.

Field-requirement enforcement is mirrored in both the zod `superRefine` and the service (as `updateProductSchema` does today), so a direct service call cannot bypass it.

---

## 12. Audit/history plan

`backend/src/features/suppliers/audit/supplier-audit.ts` → `writeSupplierAudit(input, tx)` and `supplier-audit.repository.ts` → `SupplierAuditRepository.create(data, tx?)` / `.list(recordType, recordId, skip, take)` ordered `[{ changedAt:'desc' }, { id:'asc' }]`. Direct port of `features/service/audit/service-audit.ts`.

Snapshot/diff helpers, ported from `products.service.ts:284-296`:

```ts
function supplierSnapshot(s: Supplier): Prisma.InputJsonObject
function supplierTransactionSnapshot(t: SupplierTransaction): Prisma.InputJsonObject  // amount via moneyToApiString
function changedSnapshot(snapshot, fields: string[])  // only the fields that actually changed
```

| Action | `beforeValues` | `afterValues` |
|---|---|---|
| `CREATE` | `{}` | full snapshot |
| `UPDATE` | changed fields, old | changed fields, new |
| `ARCHIVE` / `RESTORE` | `{ isActive, archivedAt }` | `{ isActive, archivedAt }` |
| `REMOVE` / `RESTORE_TRANSACTION` | `{ status }` | `{ status }` |
| `DELETE` | full snapshot | `{}` |

Transaction `UPDATE` and `REMOVE` additionally record `affectedTotals: { balanceBefore, balanceAfter }` (both strings) — the same idea `debts.service.ts` uses with `obligationRemainingBefore/After`. This makes "why did the balance jump?" answerable from the audit log alone.

`reason` is validated at min 5 / max 1000 chars through `userTextSchema`, consistent with the product and correction audits.

The audit write and the data write share one `runFinancialTransaction` call — an audit row can never be missing for a committed change.

---

## 13. Arabic + English UI labels

Add a `supplier` namespace to the existing shared file `frontend/src/shared/labels/business-labels.ts` (an `as const` object where each value is a single `'English / عربي'` string). Enum labels go in `features/suppliers/utils/supplier-labels.ts` as `Record<Enum, string>`, mirroring `ledger-labels.ts`.

```ts
supplier: {
  title:         'Suppliers / المورّدين',
  singular:      'Supplier / المورّد',
  add:           'Add Supplier / إضافة مورّد',
  edit:          'Edit Supplier / تعديل مورّد',
  remove:        'Remove Supplier / إزالة مورّد',
  archive:       'Archive / أرشفة',
  restore:       'Restore / استعادة',
  name:          'Supplier Name / اسم المورّد',
  phone:         'Phone / رقم الهاتف',
  secondaryPhone:'Secondary Phone / رقم هاتف إضافي',
  company:       'Company Name / اسم الشركة',
  email:         'Email / البريد الإلكتروني',
  notes:         'Notes / ملاحظات',
  totalOwed:     'Total Owed / إجمالي المستحق',
  totalPaid:     'Total Paid / إجمالي المدفوع',
  balance:       'Balance / الرصيد',
  ledgerTitle:   'Supplier Ledger / دفتر حسابات المورّدين',
  addTransaction:'Add Transaction / إضافة حركة',
  transaction:   'Transaction / حركة',
  amount:        'Amount / المبلغ',
  date:          'Transaction Date / تاريخ الحركة',
  description:   'Description / الوصف',
  reference:     'Reference / المرجع',
  reason:        'Reason / السبب',
  accountPassword:'Account Password / كلمة مرور الحساب',
},
```

Enum labels:

```ts
supplierTransactionTypeLabels = {
  SUPPLIER_DEBT:       'Supplier Debt / دين للمورّد',
  SUPPLIER_PAYMENT:    'Payment to Supplier / دفعة للمورّد',
  SUPPLIER_CREDIT:     'Supplier Credit / رصيد من المورّد',
  SUPPLIER_ADJUSTMENT: 'Adjustment / تعديل',
};
supplierDirectionLabels = {
  INCREASE_OWED: 'Increases Owed / يزيد المستحق',
  DECREASE_OWED: 'Decreases Owed / ينقص المستحق',
};
supplierStatusLabels = { ACTIVE: 'Active / نشط', REMOVED: 'Removed / محذوف' };
```

**RTL rule:** no app-wide `dir="rtl"`, no i18n library, no locale switcher. Every user-entered string (supplier name, company, notes, description, reference, reason) renders with `dir="auto"` **and** `className="user-text"` (or `user-text-pre` for multiline). Inputs/textareas get `user-text-input` — `inputClass()` already prepends it. Those utilities live in `frontend/src/styles/index.css` and also drive Arabic-safe print output. This is the established repo pattern (~162 existing usages).

---

## 14. Filters and search

**Supplier list** — `SuppliersPage`, filters held in component state (not URL state), every setter resets `page: 1`:

- `search` — one input matching name OR phone OR companyName (`contains`, `mode: 'insensitive'`)
- `isActive` — pills: Active (default) / Archived / All
- `sortBy` — `name` (default) | `createdAt` | `balance`; `sortOrder` asc/desc
- `page`, `pageSize` (default 25, max 100)

**Supplier ledger** — `SupplierLedgerPage`, mirroring `LedgerFilters.tsx`:

- type pills as `role="tablist"`: All / Debt / Payment / Credit / Adjustment
- `SupplierPicker` (searchable, mirrors `CustomerPicker`)
- `dateFrom` / `dateTo` + a month shortcut
- `search` over description + reference
- always-visible checkbox: **Include Removed / إظهار المحذوفة** (default off)
- collapsible "More Filters (n)" panel for direction + amount range

Export the pure helpers alongside the component so they are unit-testable without rendering — the existing file exports `hasActiveLedgerFilters`, `countActiveAdvancedLedgerFilters`, `resetLedgerFilters`, `applyLedgerMonthFilter`. Do the same: `hasActiveSupplierLedgerFilters`, `resetSupplierLedgerFilters`, `applySupplierLedgerMonthFilter`.

**Defaults:** active suppliers, active transactions, newest `transactionDate` first.

Backing indexes: `@@index([name])`, `@@index([phone])`, `@@index([companyName])`, `@@index([supplierId, status])`, `@@index([transactionDate])`.

---

## 15. Dashboard / reporting integration

**Deferred by default.** Ship CP1–CP11 and CP13 first; CP12 is optional and only proceeds if the dashboard change is clearly additive.

If added, three cards in a **visually separate, explicitly labelled** row so supplier money is never confused with customer money:

- **Owed to Suppliers / المستحق للمورّدين** — sum of positive supplier balances
- **Paid to Suppliers (This Month) / المدفوع للمورّدين (هذا الشهر)**
- **Active Suppliers / المورّدون النشطون**

Served by a new `GET /api/v1/suppliers/dashboard-summary`. **Do not extend `dashboard-financial.service.ts`'s existing totals** — customer receivable and supplier payable must never land in the same number.

Explicitly not in this version: supplier statements, aging buckets, printable supplier reports, supplier data in existing report exports.

---

## 16. Permissions

| Capability | ADMIN | EMPLOYEE |
|---|---|---|
| View suppliers, details, summary, ledger | ✅ | ✅ |
| Create supplier | ✅ | ❌ 403 |
| Edit supplier | ✅ (password+reason if sensitive) | ❌ |
| Archive / restore supplier | ✅ (password+reason) | ❌ |
| Hard delete supplier | ✅ (password+reason, 0 transactions) | ❌ |
| Create transaction | ✅ | ❌ |
| Edit / remove / restore transaction | ✅ (password+reason) | ❌ |
| View supplier audit log | ✅ | ❌ 403 |

Auth plumbing already exists: `requireAuth` (JWT bearer → `req.user = { userId, role }` — note it is `userId`, **not** `id`) and `requireRole([Role.ADMIN])`. Frontend hides admin controls behind a `canMutate = user?.role === 'ADMIN'` check, but **the backend is authoritative** — hiding a button is never the enforcement.

---

## 17. Validation rules

Zod, via the existing `validate(schema, 'body'|'query'|'params')` middleware. Free text goes through `userTextSchema({ field, min, max })` from `backend/src/validators/user-text.ts` (trims, rejects control characters and HTML, **Arabic-safe**). `.strict()` on body objects; `emptyToNull` preprocessor for optional strings.

**Supplier**

| Field | Rule |
|---|---|
| `name` | **required**, 2–120, `userTextSchema` |
| `phone` | **required** — recommendation: keep it required. It is the practical way the owner identifies a supplier, and the existing `Customer` model already makes `phone` non-null. Normalize: trim, collapse internal whitespace, strip `-`/spaces/parens for the stored search form. Pattern `/^[+]?[0-9\s\-()]{6,20}$/`. **Not unique** — two branches of one supplier may share a number. |
| `companyName` | optional, ≤160 |
| `secondaryPhone` | optional, same pattern as `phone` |
| `email` | optional, `z.string().email()` when present, `emptyToNull` |
| `notes` | optional, ≤2000, `@db.Text` |
| address | **rejected** — `.strict()` makes an `address` key a 400 |

**Supplier transaction**

| Field | Rule |
|---|---|
| `amount` | **required**, money *string*, `/^(?:0\|[1-9]\d*)(?:\.\d{1,2})?$/`, **> 0** (`assertPositiveMoney`), max 9,999,999,999.99 |
| `type` | **required**, `z.nativeEnum(SupplierTransactionType)` |
| `direction` | **required only when** `type === SUPPLIER_ADJUSTMENT`; for other types either omit it or send the forced value (mismatch → 400) |
| `transactionDate` | **required**, `/^\d{4}-\d{2}-\d{2}$/`, parsed by `parseBusinessDate`. Future dates rejected beyond today in business timezone (`todayInBusinessTimezone`, `Asia/Beirut`) |
| `description` | **recommendation: required**, 3–500. A ledger line with no description is unreadable six months later, and the equivalent customer flows already require a description-like field. Cheap to relax later; expensive to backfill. |
| `reference` | optional, ≤100 (cheque no. / transfer ref / invoice no.) |
| `notes` | optional, ≤2000 |
| supplier | must exist; **must be `isActive`** for create → 409 `SUPPLIER_ARCHIVED` |
| `reason` | required on edit/remove/restore, 5–1000 |
| `accountPassword` | required per §11, `z.string().min(1)`, never logged |

**State rules**

- Editing a `REMOVED` transaction → 409. Restore first.
- Removing an already-`REMOVED` transaction → 409 (idempotency guard).
- Archiving an already-archived supplier → 409; same for restore.
- Hard delete with any transaction row → 409 `SUPPLIER_HAS_TRANSACTIONS`.
- Changing a transaction's `supplierId` is **not permitted** — remove and re-create instead. This keeps both suppliers' balance history honest.

---

## 18. Testing strategy

Runner: **vitest** (`npm test` → `vitest run`), root `vitest.config.ts`, tests colocated. HTTP via `supertest`. **There is no `@testing-library` dependency and no jsdom** — component tests use `renderToStaticMarkup` from `react-dom/server` and assert against the HTML string. Do not introduce a new testing stack.

**Backend — `*.service.test.ts`** (pure unit; `vi.hoisted` repository mocks, `runFinancialTransaction` stubbed to `op => op(tx)`, `verifyAdminPassword` mocked, real `Decimal` fixtures):

- create supplier → persists, writes `CREATE` audit
- edit supplier, non-sensitive field → no password required
- edit supplier, changes `name` → password + reason required; missing → throws
- archive → `isActive=false` + audit; restore → back; double-archive → 409
- hard delete blocked when transactions exist; allowed at zero
- create transaction on archived supplier → 409
- `SUPPLIER_DEBT` forces `INCREASE_OWED`; `SUPPLIER_PAYMENT`/`SUPPLIER_CREDIT` force `DECREASE_OWED`
- `SUPPLIER_ADJUSTMENT` without `direction` → 400; with either direction → accepted
- **balance math**: debt 500 + payment 200 + credit 50 → balance `"250.00"`, totalOwed `"500.00"`, totalPaid `"200.00"`
- edit transaction amount → balance recalculates; audit records `balanceBefore`/`balanceAfter`
- remove transaction → excluded from active balance; `includeRemoved` still lists it
- restore transaction → re-enters the balance
- every edit/remove writes an audit row with correct before/after and **no password field present**
- Arabic supplier name / notes / description accepted end-to-end
- money is returned as 2-dp strings everywhere (assert `typeof === 'string'`)

**Backend — `*.routes.test.ts`** (real `app`, mocked service, real signed JWTs):

- 401 without token
- **403 for EMPLOYEE on every mutation route**; 200 for EMPLOYEE on read routes
- route ordering: `/suppliers/:supplierId/transactions` resolves before `/suppliers/:id`
- `meta.pagination` shape on list endpoints
- `data.summary.basis === 'filtered'` on `/supplier-ledger`

**Backend — `*.validator.test.ts`:** phone pattern, email, amount > 0 / 2-dp, date format, `address` key rejected by `.strict()`, reason min-length, direction/type cross-field rule.

**Frontend:**

- `suppliers.components.test.tsx` — `SupplierTable`, `SupplierSummaryCards`, `SupplierTransactionTable`, `SupplierLedgerFilters` render to markup with realistic decimal-string fixtures
- assert Arabic labels appear in output (`toContain('المورّدين')`)
- assert `dir="auto"` present on supplier name / description / notes cells
- assert summary cards print the API's `summary` values, not a recomputed sum
- pure filter helpers (`resetSupplierLedgerFilters`, `applySupplierLedgerMonthFilter`) tested without rendering
- `*.api.test.ts` — `vi.mock('../../../services/api')`, assert exact endpoints and `expect.objectContaining` params
- hook tests assert query-key/param shape (no rendering)
- loading / empty / error states render

**Full verification, once, at the end:**

```
npm run lint
npm run typecheck
npm run test
npm run build
npm run prisma:validate
```

---

## 19. Implementation checkpoints for Codex

Adjusted from the suggested order: policy/audit primitives (CP2) land before the API so CP3/CP4 can use them, and Arabic labels (now CP6) land before any UI is written rather than being retrofitted.

| CP | Deliverable | Done when |
|---|---|---|
| **CP1** | Read the patterns: `features/service/products/*` (CRUD+audit+password), `features/financial/ledger/*` (read model), `lib/admin-verification.ts`, `features/service/audit/*`, `domain/money.ts`, `app.ts` mounting. **No code.** | Patterns confirmed |
| **CP2** | Prisma: `Supplier`, `SupplierTransaction`, `SupplierAudit`, 5 enums, `User` back-relations, indexes + migration `20260730120000_add_suppliers_and_supplier_ledger` | `prisma:validate` passes; migration applies clean |
| **CP3** | `suppliers/authorization/supplier-policy.ts`, `suppliers/audit/supplier-audit.ts` + repository, `suppliers/domain/supplier-domain.ts` (`resolveSupplierDirection`, snapshots) + unit tests | Direction + policy tests green |
| **CP4** | Supplier CRUD API: routes/controller/service/repository/validator/types + archive/restore + guarded delete + audit; mounted in `app.ts` | Service + route + validator tests green |
| **CP5** | Supplier transactions API + `GET /supplier-ledger` + `GET /suppliers/:id/summary`, DB-side aggregation, string money | Balance tests green |
| **CP6** | Bilingual labels: `supplier` namespace in `shared/labels/business-labels.ts` + `features/suppliers/utils/supplier-labels.ts` | Labels test green |
| **CP7** | Frontend types + api + hooks (key factories, mutations, invalidation, toasts) | api + hook tests green |
| **CP8** | `SuppliersPage` — table, mobile cards, search/filters, pagination, add/edit dialog, archive/restore/delete dialogs | Renders; admin-only controls gated |
| **CP9** | `SupplierProfilePage` — info card, summary cards from backend, recent transactions, edit/archive actions | Renders |
| **CP10** | `SupplierLedgerPage` — filters, table + mobile cards, summary cards (`basis:'filtered'`), pagination, row actions | Renders |
| **CP11** | Transaction dialogs: add, edit (password+reason), remove/restore (password+reason), field-error mapping | Flows work against the real API |
| **CP12** | Responsive + Arabic polish pass: `dir="auto"` + `user-text` audit, breakpoint check at 375 / 768 / 1280 / 1920, no clipped action menus, no horizontal scroll on mobile | Manual pass |
| **CP13** | *Optional* dashboard cards (§15) — only if clearly additive | Skippable |
| **CP14** | Focused tests to fill gaps + docs update (`docs/`, `claude/PROJECT_BRIEF.md`) + full verification suite | All five commands green |

Each checkpoint is independently reviewable. Do not batch CP4+CP5 — the balance logic deserves its own review.

---

## 20. Risks and open decisions

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Sign confusion** — someone later "simplifies" by storing negative amounts | `amount` is `assertPositiveMoney` at the validator *and* the service; direction is a separate enum column. Documented in the model comment. |
| R2 | **Frontend recomputing totals** from the current page — the exact bug this repo already guards against in `LedgerSummaryCards` | Backend-only summary; an explicit test asserts cards render `summary.*` values; code review rule: no `.reduce()` over `items` for money |
| R3 | **Float leakage** — a `Number(amount)` slipping into a component | `formatMoney` takes a `string` only; reuse `money-input.ts` BigInt helpers; never touch the legacy `BalanceBadge.tsx`, which takes a `number` |
| R4 | **Forgotten `User` back-relations** in `schema.prisma` | CP2 exit criterion is `prisma:validate` passing |
| R5 | **Route shadowing** — `/suppliers/:id` swallowing `/suppliers/:supplierId/transactions` | Sub-resource router mounted first in `app.ts`; explicit route-ordering test (the customers routers already rely on this) |
| R6 | **Hard delete blocked by audit FK** (`Restrict`) | Delete audit rows in the same transaction; write the `DELETE` audit with `supplierId: null` |
| R7 | **Admin lockout surprise** — 5 wrong passwords in 15 min locks the only admin out of financial actions | Already existing behavior; surface the lockout message clearly in the dialog rather than a generic error |
| R8 | Arabic text breaking table layout / print | `user-text` + `unicode-bidi: plaintext` + `overflow-wrap: anywhere` already handle this; print CSS already forces Tahoma |
| R9 | Owner expects "Remove" to actually delete a transaction | UI says **Remove / إزالة**; removed rows vanish from the default view and from the balance. Only the "Include Removed" filter brings them back. Worth confirming verbally with the owner once. |
| R10 | Cross-feature import from `suppliers` → `financial/domain` couples the two | Acceptable and already precedented (`financial-ledger` imports `customer-financial`'s formatter). If it grows, promote `money.ts`/`business-date.ts` to a shared `src/domain/` — **not in this version.** |

**Open decisions — recommendations made, flag if you disagree:**

- **D1 — `phone` required.** Recommended **required** (§17). Matches `Customer`; it is how the owner actually finds a supplier.
- **D2 — `description` required.** Recommended **required**, 3–500 chars (§17). Relaxing later is trivial; backfilling blank descriptions is not.
- **D3 — negative balance allowed.** Yes, displayed as a supplier credit surplus. Not blocked.
- **D4 — `pageSize` vs `limit`.** Use **`page`/`pageSize`** (the newer service/product convention), not the financial features' `page`/`limit`. One inconsistency either way; pick the newer one.
- **D5 — Supplier ledger paginates in SQL**, not in memory. The existing customer ledger slices in memory because it merges three tables; suppliers are one table and should not inherit that.

---

## 21. Exact files likely to change

**New — backend**

```
backend/prisma/migrations/20260730120000_add_suppliers_and_supplier_ledger/migration.sql
backend/src/features/suppliers/index.ts
backend/src/features/suppliers/authorization/supplier-policy.ts            (+ .test.ts)
backend/src/features/suppliers/audit/supplier-audit.ts
backend/src/features/suppliers/audit/supplier-audit.repository.ts
backend/src/features/suppliers/domain/supplier-domain.ts                   (+ .test.ts)
backend/src/features/suppliers/domain/supplier-types.ts
backend/src/features/suppliers/suppliers/suppliers.{routes,controller,service,repository,validator,types}.ts
backend/src/features/suppliers/suppliers/suppliers.{routes,service,validator}.test.ts
backend/src/features/suppliers/transactions/supplier-transactions.{routes,controller,service,repository,validator,types}.ts
backend/src/features/suppliers/transactions/supplier-transactions.{routes,service,validator}.test.ts
backend/src/features/suppliers/ledger/supplier-ledger.{routes,controller,service,repository,validator,types}.ts
backend/src/features/suppliers/ledger/supplier-ledger.{routes,service}.test.ts
```

**New — frontend**

```
frontend/src/pages/SuppliersPage.tsx
frontend/src/pages/SupplierProfilePage.tsx
frontend/src/pages/SupplierLedgerPage.tsx
frontend/src/features/suppliers/api/{suppliers,supplier-transactions,supplier-ledger}.api.ts (+ .test.ts)
frontend/src/features/suppliers/hooks/{useSuppliers,useSupplier,useSupplierMutations,useSupplierLedger,useSupplierTransactionMutations}.ts
frontend/src/features/suppliers/types/{supplier,supplier-transaction,supplier-ledger}.types.ts
frontend/src/features/suppliers/utils/{supplier-labels,supplier-query}.ts
frontend/src/features/suppliers/components/… (13 components, §10)
frontend/src/features/suppliers/components/suppliers.components.test.tsx
```

**Modified (small, surgical)**

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | +3 models, +5 enums, +6 `User` back-relations. **No edits to existing customer/financial models.** |
| `backend/src/app.ts` | +4 `app.use('/api/v1/…', requireAuth, …)` lines, sub-resource routers before the generic one |
| `frontend/src/App.tsx` | +3 `<Route>` entries |
| `frontend/src/layouts/DashboardLayout.tsx` | +2 `navItems` entries, +2 lucide icon imports |
| `frontend/src/shared/labels/business-labels.ts` | + `supplier` namespace |
| `frontend/src/shared/labels/business-labels.test.tsx` | + assertions for the new namespace |
| `docs/README.md`, `claude/PROJECT_BRIEF.md` | + feature description |
| `docs/project/PROJECT_ROADMAP.md` | mark suppliers phase as delivered (it is currently listed as future) |

**Explicitly untouched:** every file under `backend/src/features/financial/{debts,payments,installment-plans,receivables,corrections,customer-summary}`, `backend/src/{routes,controllers,services,repositories}/customers.*`, `dashboard-financial.service.ts` (unless CP13 runs), and all frontend `customer-financial` / `financial-ledger` files — imported from, never modified.

---

## 22. Verification

**Per checkpoint**

```
npm run typecheck
npx vitest run backend/src/features/suppliers
npx vitest run frontend/src/features/suppliers
```

**Manual end-to-end** (after CP11, dev server + Electron shell):

1. Sidebar shows **Suppliers / المورّدين** and **Supplier Ledger / دفتر حسابات المورّدين**.
2. Add a supplier with an **Arabic** name and notes → appears in the list, renders right-to-left correctly, is not mangled in the table.
3. Try to submit without a phone → inline validation error, no request sent.
4. Add `SUPPLIER_DEBT` 500.00 → profile shows Total Owed `$500.00`, Balance `$500.00`.
5. Add `SUPPLIER_PAYMENT` 200.00 → Total Paid `$200.00`, Balance `$300.00`.
6. Add `SUPPLIER_CREDIT` 50.00 → Balance `$250.00`.
7. Add `SUPPLIER_ADJUSTMENT` with no direction → rejected; with `INCREASE_OWED` 25.00 → Balance `$275.00`.
8. Edit the payment to 250.00 **without** a password → rejected. With password + reason → Balance `$225.00`.
9. Enter a wrong password 5 times → lockout message is clear and specific, not a generic 500.
10. Remove the credit → Balance `$275.00`; enable **Include Removed** → the row reappears greyed with a Removed badge.
11. Archive the supplier → try to add a transaction → blocked with a clear message. Restore → allowed again.
12. Try to delete a supplier that has transactions → clear 409 message. Create a fresh empty supplier → delete succeeds.
13. Ledger page: filter by supplier, by type, by date range → summary cards change and read **"Current filters"**; page 2 shows the *same* totals as page 1 (proves totals are not page-derived).
14. Resize to 375px → cards stack, no horizontal page scroll, action menus fully visible and tappable.
15. Confirm the customer Ledger and Receivables pages are visually and numerically unchanged.

**Final gate**

```
npm run lint
npm run typecheck
npm run test
npm run build
npm run prisma:validate
```
