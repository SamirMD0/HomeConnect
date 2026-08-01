# HomeConnect v1.0.7 — Maintenance/Service System + Product Foundation

> **Status:** Approved plan. Planning document only — no code written.
> Implementation begins at CP1 (§20).

---

## Context

HomeConnect is a local Windows (Electron-packaged) business app for a workshop.
Through v1.0.6 it covers the **money** side of the business: customers, debts,
installment plans, payments, ledger, receivables, reports, backup, diagnostics.

It does not yet model the **work** side. The workshop repairs and services home
electrical products (fans, fridges, ACs, lamps). Today that work is tracked
outside the system, so there is no record of what came in, where it is, whether
it is under warranty, or when it went to the supplier.

v1.0.7 adds two things:

1. **Maintenance / Service System** — track a repair job from intake to delivery.
2. **Product foundation** — a proper `Product` table created *now*, so future
   versions (inventory, POS, invoicing) don't have to retrofit product identity
   into service jobs and debts. Plus printable product labels to stick on the
   physical unit.

The intended outcome: staff create a service job against an existing customer in
under a minute, never blocked by missing product records, and admins can correct
any field with the same password + reason + audit discipline the financial module
already enforces.

**Explicit non-goals for v1.0.7:** inventory/stock, POS, full product admin UI,
auto-creating customer debt from service price, effective-dated corrections.

### Decisions locked in this session

| Decision | Choice |
|---|---|
| Human-readable job number | **Yes** — `jobNumber` e.g. `SV-2026-0142`, unique, generated on create |
| Audit storage | **New `ServiceAudit` table**, mirroring the `FinancialCorrectionAudit` shape |
| Barcode on label | **Scannable CODE128**, rendered client-side (adds one small dependency) |

---

## 1. Version goal

Ship a Maintenance/Service System backed by a minimal-but-correct `Product` table,
with admin-password-protected mutation and full before/after audit — reusing the
existing financial module's money, date, authorization, and audit patterns rather
than inventing parallel ones.

Success criteria:

- Staff can create a service job for an existing customer with either a linked
  product or free-text product details, in one screen.
- Every job's location and state is answerable at a glance: workshop / supplier /
  waiting on customer / ready / delivered.
- Admin edits to price, status, dates, warranty, routing require password +
  reason and leave an immutable audit row.
- A product label with name/model/brand/price and a scannable barcode prints
  cleanly on a label printer.

---

## 2. Business workflow

```
Customer contacts workshop
        │
        ├── ON_CALL ──────────► schedule home visit (homeVisitScheduledDate)
        ├── WORKSHOP_DROP_OFF ► customer brings unit in
        └── PART_REPLACEMENT ─► customer names the part they want changed
        │
        ▼
   Service job created  (status RECEIVED, serviceCreatedDate = today)
        │
        ▼
   Inspection           (status INSPECTION_PENDING)
        │
        ▼
   Routing decision  ──────────────────────────────────────────┐
        │                                                      │
  WORKSHOP           COMPANY            CUSTOMER_DECISION   NOT_REPAIRABLE
        │                │                     │                  │
  IN_WORKSHOP_REPAIR  SENT_TO_COMPANY   WAITING_CUSTOMER_    NOT_REPAIRABLE
        │             (sentToCompanyDate)     APPROVAL          (final)
        │                │                     │
        │        received back                 └──► back to routing
        │        (receivedFromCompanyDate)
        │                │
        └── WAITING_FOR_PART (either branch, reversible)
                         │
                         ▼
                 READY_FOR_PICKUP
                         │
                         ▼
              DELIVERED_TO_CUSTOMER  (returnedToCustomerDate, completedAt)
                         │
                    (final)

  CANCELLED reachable from any non-final state (cancelledAt, cancelledReason)
```

Key business rules:

- A job always belongs to an **existing** customer. No customer data is
  duplicated onto the job; only service-specific `notes`.
- A job may or may not reference a `Product`. Manual text is a first-class
  alternative, not a fallback error path.
- Sending to the supplier is a *location* change, tracked by dates, not a
  separate record.
- Price is informational in v1.0.7. It does **not** create a `Debt`.

---

## 3. Product foundation scope

### In scope

A `Product` table capturing product identity only:

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | uuid | |
| `name` | **yes** | string | trimmed, 1–200 |
| `model` | **yes** | string | trimmed, 1–120 |
| `barcode` | no | string? | **unique when present** (partial unique index) |
| `brand` | no | string? | |
| `price` | no | `Decimal(12,2)?` | |
| `discount` | no | `Decimal(12,2)?` | absolute currency amount, not percent — see §21 |
| `isActive` | yes | boolean | default `true`; archive instead of delete |
| `notes` | no | text? | |
| `createdById` / `updatedById` | yes / no | uuid | FK → `User` |
| `createdAt` / `updatedAt` | yes | timestamp | |

Decimal safety: reuse `parseMoney`, `moneyToApiString`, `compareMoney` from
[backend/src/features/financial/domain/money.ts](backend/src/features/financial/domain/money.ts).
Never use JS `number` for `price`/`discount`. API serializes both as **strings**,
consistent with the financial module.

### Out of scope (v1.0.7)

Stock levels, warehouses, suppliers-as-entities, purchase orders, POS, cart,
tax, product images, categories, variants, price history, bulk import.

### Deliberate forward-compatibility

- `barcode` unique now, so a scanner-driven POS can look up by barcode later.
- `isActive` now, so nothing ever needs hard-deleting once orders reference it.
- `discount` stored but unused by any calculation in v1.0.7 — it exists so the
  column doesn't need adding later under load.

---

## 4. Product label printing plan

**Goal:** print a label, stick it on the physical unit.

**Approach:** client-side print view, browser print dialog — the same mechanism
already used by the reports module (`@media print` block in
[frontend/src/styles/index.css:28](frontend/src/styles/index.css#L28) and the print
handling in [frontend/src/pages/ReportsPage.tsx](frontend/src/pages/ReportsPage.tsx)).
No server-side PDF generation, no `POST /print-label` endpoint.

**Label contents:**

```
┌──────────────────────────────┐
│  <BRAND>                     │   brand, if present, small caps
│  Product Name                │   bold, wraps to 2 lines max
│  Model: ABC-123              │
│                              │
│  ▌▌▌ ▌ ▌▌▌▌ ▌ ▌▌▌ ▌▌         │   CODE128 SVG, if barcode present
│  8901234567890               │   barcode text under the bars
│                              │
│  Price: 45,000               │   only if price present
└──────────────────────────────┘
```

**Barcode:** per the decision above, render a **scannable CODE128** symbol.

- Add **`jsbarcode`** to `frontend/package.json` — zero runtime dependencies,
  ~30KB, renders into an existing `<svg>` element. Chosen over `bwip-js`
  (much larger) and over hand-rolling CODE128 (correct checksum/quiet-zone
  handling is fiddly and worth not owning).
- Render to **SVG, not canvas** — canvas rasterizes badly at printer DPI, SVG
  prints at native resolution.
- Bundled locally; works offline in Electron. No CDN.
- Graceful degradation: if `barcode` is absent, the barcode block is omitted
  entirely (no empty box). If `jsbarcode` throws on an invalid character set,
  fall back to rendering the barcode **text only** and log via the diagnostics
  error logger — never break the print view.

**Layout:**

- Dedicated route `/products/:id/label` rendering only the label, plus a
  "Print" button hidden by `@media print`.
- `@page { size: 50mm 30mm; margin: 2mm }` as the default, overridable by the
  OS print dialog. Sizes chosen for common thermal label stock; confirm with
  the business (see §21).
- Support printing **N copies** of the same label on one sheet via a simple
  quantity input (1–40) that repeats the label block in a print-friendly grid.
- No label designer, no template editor, no per-product layout overrides.

---

## 5. Service request types

```prisma
enum ServiceRequestType {
  ON_CALL
  WORKSHOP_DROP_OFF
  PART_REPLACEMENT
}
```

| Enum | Display label | Behaviour |
|---|---|---|
| `ON_CALL` | On-call visit | Enables `homeVisitScheduledDate` field; the unit is at the customer's house, so `SENT_TO_COMPANY` requires an explicit pickup acknowledgement in the notes |
| `WORKSHOP_DROP_OFF` | Workshop drop-off | Default. Unit is physically at the workshop |
| `PART_REPLACEMENT` | Part replacement | Makes `requestedPartName` **required** |

Display labels live in a single frontend map
(`frontend/src/features/service/utils/service-labels.ts`) so translation/rewording
is one edit. Backend never returns display strings — only enum values.

---

## 6. Service status workflow

```prisma
enum ServiceJobStatus {
  RECEIVED
  INSPECTION_PENDING
  IN_WORKSHOP_REPAIR
  SENT_TO_COMPANY
  WAITING_FOR_PART
  WAITING_CUSTOMER_APPROVAL
  READY_FOR_PICKUP
  DELIVERED_TO_CUSTOMER
  CANCELLED
  NOT_REPAIRABLE
}
```

### Classification

| Class | Statuses |
|---|---|
| **Initial** (allowed on create) | `RECEIVED` (default), `INSPECTION_PENDING` |
| **Active / open** | `INSPECTION_PENDING`, `IN_WORKSHOP_REPAIR`, `SENT_TO_COMPANY`, `WAITING_FOR_PART`, `WAITING_CUSTOMER_APPROVAL`, `READY_FOR_PICKUP` + `RECEIVED` |
| **Final / terminal** | `DELIVERED_TO_CUSTOMER`, `CANCELLED`, `NOT_REPAIRABLE` |

Terminal statuses are **not** immutable — an admin may reopen (see below) — but
they are excluded from "open jobs" counts and require the reopen flow to leave.

### Date requirements per status transition

Enforced in the service layer, not just the UI:

| Target status | Required date | Set by |
|---|---|---|
| `SENT_TO_COMPANY` | `sentToCompanyDate` | required in the status-change payload if not already set |
| `IN_WORKSHOP_REPAIR` *(from `SENT_TO_COMPANY`)* | `receivedFromCompanyDate` | required — the unit must have come back |
| `READY_FOR_PICKUP` *(from `SENT_TO_COMPANY`)* | `receivedFromCompanyDate` | required |
| `DELIVERED_TO_CUSTOMER` | `returnedToCustomerDate` | required; also sets `completedAt` (timestamp) |
| `CANCELLED` | — | sets `cancelledAt` (timestamp), requires `cancelledReason` |
| `NOT_REPAIRABLE` | — | sets `completedAt`; requires a reason recorded in audit |

Date ordering invariants (validated server-side):

```
serviceCreatedDate ≤ sentToCompanyDate ≤ receivedFromCompanyDate ≤ returnedToCustomerDate
```

No business date may be in the future except `homeVisitScheduledDate`.

### Transition rules

v1.0.7 uses a **permissive graph with a small deny-list**, not a strict state
machine — workshops don't move linearly and over-constraining will cause staff to
work around the system.

Allowed: any active → any active, and any active → any terminal.
Denied without the reopen flow: terminal → anything.

**Reopen:** `POST /service-jobs/:id/reopen` — admin-only, password + reason,
clears `completedAt`/`cancelledAt`/`cancelledReason`, sets status back to a
caller-supplied active status, writes a `REOPEN` audit row.

### Dashboard-visible statuses

`SENT_TO_COMPANY`, `WAITING_FOR_PART`, `WAITING_CUSTOMER_APPROVAL`,
`READY_FOR_PICKUP` — these are the four that represent *someone is waiting on
something* and are the ones worth a card. See §15.

---

## 7. Warranty and company-routing rules

### Warranty

```prisma
enum WarrantyStatus {
  UNDER_WARRANTY
  NO_WARRANTY
  UNKNOWN            // default
}
```

Plus `warrantyNotes` (text?), `warrantyProvider` (string?), `warrantyExpiresAt`
(`@db.Date`?).

Rules — deliberately thin:

- Default is `UNKNOWN`. Staff are not forced to determine warranty at intake.
- `warrantyExpiresAt` is **informational**. The system does **not** auto-flip
  `UNDER_WARRANTY` → `NO_WARRANTY` on expiry; it surfaces an "expired" hint in
  the UI when `warrantyExpiresAt < today` while status is `UNDER_WARRANTY`.
- No warranty claim documents, no warranty-derived pricing, no linkage to
  product purchase date (there are no sales records yet).

### Company routing

```prisma
enum ServiceRoutingDecision {
  WORKSHOP
  COMPANY
  CUSTOMER_DECISION
  NOT_REPAIRABLE
}
```

- `routingDecision` is **nullable** — unset until inspection concludes.
- `companyName` (string?) is **required when `routingDecision = COMPANY`**.
  It's free text in v1.0.7; a `Supplier` entity is a future version.
- Setting `routingDecision = NOT_REPAIRABLE` does *not* auto-change status —
  status is a separate, explicit action, so the audit trail stays readable.
- Changing `routingDecision` on an existing job is a **sensitive** change
  (password + reason + audit).

---

## 8. Data model plan

Follows the conventions already in
[backend/prisma/schema.prisma](backend/prisma/schema.prisma): `uuid` PKs with
`@db.Uuid`, `Decimal(12,2)` money, `@db.Date` for business dates, `@db.Text` for
free text, `onDelete: Restrict` on all FKs, `@@map` to snake_case plural tables.

### New enums

`ServiceRequestType`, `ServiceJobStatus`, `ServiceRoutingDecision`,
`WarrantyStatus`, `ServiceAuditRecordType`, `ServiceAuditAction`.

```prisma
enum ServiceAuditRecordType {
  PRODUCT
  SERVICE_JOB
}

enum ServiceAuditAction {
  CREATE
  UPDATE_DETAILS
  CHANGE_STATUS
  CHANGE_ROUTING
  CHANGE_WARRANTY
  CHANGE_PRICE
  CHANGE_DATES
  CANCEL
  REOPEN
  ARCHIVE          // product isActive -> false
  RESTORE          // product isActive -> true
}
```

### `Product`

```prisma
model Product {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  model       String
  barcode     String?  @unique
  brand       String?
  price       Decimal? @db.Decimal(12, 2)
  discount    Decimal? @db.Decimal(12, 2)
  isActive    Boolean  @default(true)
  notes       String?  @db.Text
  createdById String   @db.Uuid
  createdBy   User     @relation("ProductCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedById String?  @db.Uuid
  updatedBy   User?    @relation("ProductUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  serviceJobs ServiceJob[]

  @@index([name])
  @@index([model])
  @@index([brand])
  @@index([isActive])
  @@map("products")
}
```

> `@unique` on a nullable column in PostgreSQL permits multiple `NULL`s, which is
> exactly the desired behaviour (many products with no barcode, but no two
> sharing one). No partial index needed.

### `ServiceJob`

```prisma
model ServiceJob {
  id         String   @id @default(uuid()) @db.Uuid
  jobNumber  String   @unique            // "SV-2026-0142"

  customerId String   @db.Uuid
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Restrict)

  productId          String?  @db.Uuid
  product            Product? @relation(fields: [productId], references: [id], onDelete: Restrict)
  manualProductName  String?
  manualProductModel String?
  manualProductBrand String?
  manualProductNotes String?  @db.Text

  requestType       ServiceRequestType
  issueDescription  String   @db.Text
  requestedPartName String?

  routingDecision        ServiceRoutingDecision?
  companyName            String?
  sentToCompanyDate      DateTime? @db.Date
  receivedFromCompanyDate DateTime? @db.Date

  warrantyStatus    WarrantyStatus @default(UNKNOWN)
  warrantyNotes     String?        @db.Text
  warrantyProvider  String?
  warrantyExpiresAt DateTime?      @db.Date

  estimatedPrice Decimal? @db.Decimal(12, 2)
  finalPrice     Decimal? @db.Decimal(12, 2)
  priceNotes     String?  @db.Text

  serviceCreatedDate     DateTime  @db.Date
  homeVisitScheduledDate DateTime? @db.Date
  returnedToCustomerDate DateTime? @db.Date

  status ServiceJobStatus @default(RECEIVED)
  notes  String?          @db.Text

  createdById String   @db.Uuid
  createdBy   User     @relation("ServiceJobCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedById String?  @db.Uuid
  updatedBy   User?    @relation("ServiceJobUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  completedAt      DateTime?
  cancelledAt      DateTime?
  cancelledById    String?   @db.Uuid
  cancelledBy      User?     @relation("ServiceJobCancelledBy", fields: [cancelledById], references: [id], onDelete: Restrict)
  cancelledReason  String?   @db.Text

  audits ServiceAudit[]

  @@index([customerId])
  @@index([productId])
  @@index([status])
  @@index([customerId, status])
  @@index([serviceCreatedDate])
  @@index([status, serviceCreatedDate])
  @@index([requestType])
  @@map("service_jobs")
}
```

### `ServiceAudit`

Mirrors the shape of `FinancialCorrectionAudit` (denormalized actor name/username
so audit rows stay readable if a user is renamed):

```prisma
model ServiceAudit {
  id             String   @id @default(uuid()) @db.Uuid
  recordType     ServiceAuditRecordType
  recordId       String   @db.Uuid
  serviceJobId   String?  @db.Uuid
  serviceJob     ServiceJob? @relation(fields: [serviceJobId], references: [id], onDelete: Restrict)
  action         ServiceAuditAction
  changedById    String   @db.Uuid
  changedBy      User     @relation("ServiceAuditChangedBy", fields: [changedById], references: [id], onDelete: Restrict)
  changedByName     String
  changedByUsername String
  changedAt      DateTime @default(now())
  reason         String   @db.Text
  beforeValues   Json
  afterValues    Json
  requestId      String?
  ipAddress      String?

  @@index([recordType, recordId, changedAt])
  @@index([serviceJobId, changedAt])
  @@index([changedAt])
  @@map("service_audits")
}
```

### `jobNumber` generation

Format `SV-<YYYY>-<NNNN>`, zero-padded to 4, rolling over per calendar year.

Implementation: a dedicated Postgres sequence-per-year is overkill; instead
generate inside the same transaction as the insert:

```
SELECT jobNumber FROM service_jobs
WHERE jobNumber LIKE 'SV-2026-%'
ORDER BY jobNumber DESC LIMIT 1
FOR UPDATE
```

…increment, insert. The `@unique` constraint is the real safety net: on a
`P2002` collision, retry up to 3 times. This is a low-write local app; contention
is effectively nil. Reuse the transaction helper at
[backend/src/features/financial/infrastructure/transaction.ts](backend/src/features/financial/infrastructure/transaction.ts).

### Required `User` model additions

Back-relations must be added to `User`:
`productsCreated`, `productsUpdated`, `serviceJobsCreated`, `serviceJobsUpdated`,
`serviceJobsCancelled`, `serviceAudits`.

### Migration

One migration, `backend/prisma/migrations/<ts>_add_service_and_product/`.
Purely additive — new enums, new tables, new nullable back-relations. **No
changes to existing tables' columns**, so no data backfill and no risk to
financial data.

---

## 9. Backend API plan

New feature module `backend/src/features/service/`, following the layout proven
by `features/financial/*`:

```
backend/src/features/service/
├── index.ts
├── domain/
│   ├── service-types.ts          // shared TS types / DTOs
│   ├── service-errors.ts
│   ├── service-status.ts         // classification + transition + date rules
│   └── job-number.ts             // jobNumber format + generation
├── authorization/
│   └── service-policy.ts         // requireServiceAdmin, sensitive-field map
├── audit/
│   ├── service-audit.ts
│   └── service-audit.repository.ts
├── products/
│   ├── products.routes.ts
│   ├── products.controller.ts
│   ├── products.service.ts
│   ├── products.repository.ts
│   └── products.validator.ts
└── service-jobs/
    ├── service-jobs.routes.ts
    ├── service-jobs.controller.ts
    ├── service-jobs.service.ts
    ├── service-jobs.repository.ts
    └── service-jobs.validator.ts
```

### Products

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/products` | any authed | `?search=` (name/model/brand/barcode), `?isActive=`, `?page=`, `?pageSize=`. Paginated |
| `GET` | `/api/v1/products/:id` | any authed | |
| `POST` | `/api/v1/products` | any authed | Creation is *not* sensitive — staff must be able to add a product mid-intake |
| `PATCH` | `/api/v1/products/:id` | **admin + password + reason** | Any change to `price`/`discount`/`model`/`barcode`/`brand`/`name` |
| `POST` | `/api/v1/products/:id/archive` | **admin + password + reason** | Sets `isActive=false`. Replaces DELETE |
| `POST` | `/api/v1/products/:id/restore` | **admin + password + reason** | |
| `GET` | `/api/v1/products/:id/label` | any authed | Returns the label **data payload** (name, model, brand, barcode, formatted price) — rendering is client-side |
| `GET` | `/api/v1/products/:id/audit` | admin | Paginated audit rows |

No `POST /print-label` — printing is a browser concern.
No `DELETE` anywhere.

### Service jobs

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/service-jobs` | any authed | filters in §16; paginated; default sort `serviceCreatedDate desc` |
| `GET` | `/api/v1/service-jobs/:id` | any authed | includes customer summary + product (if linked) |
| `POST` | `/api/v1/service-jobs` | any authed | intake is a routine staff action — **no password** |
| `PATCH` | `/api/v1/service-jobs/:id` | **admin + password + reason** for sensitive fields; plain authed for `notes` only | see §10 field split |
| `POST` | `/api/v1/service-jobs/:id/status` | any authed for *forward* moves; **admin + password + reason** for backward/terminal moves | see §10 |
| `POST` | `/api/v1/service-jobs/:id/cancel` | **admin + password + reason** | |
| `POST` | `/api/v1/service-jobs/:id/reopen` | **admin + password + reason** | |
| `GET` | `/api/v1/service-jobs/:id/audit` | admin | |
| `GET` | `/api/v1/service-jobs/summary` | any authed | dashboard counts, §15 |
| `GET` | `/api/v1/customers/:customerId/service-jobs` | any authed | mounted on the customers router, matching `customerDebtsRoutes` |

Mounted in [backend/src/app.ts](backend/src/app.ts) alongside the existing
`/api/v1/*` routes, all behind `requireAuth`:

```ts
app.use('/api/v1/customers', requireAuth, customerServiceJobsRoutes);
app.use('/api/v1/products', requireAuth, productsRoutes);
app.use('/api/v1/service-jobs', requireAuth, serviceJobsRoutes);
```

Order matters — register `customerServiceJobsRoutes` **before**
`customersRoutes`, matching how `customerDebtsRoutes` is registered today
([backend/src/app.ts:78-82](backend/src/app.ts#L78-L82)).

### Response conventions

- All `Decimal` fields serialized as **strings** via `moneyToApiString`.
- All `@db.Date` fields serialized as `YYYY-MM-DD` via `prismaDateToBusinessDate`.
- Timestamps as ISO 8601.
- Errors via the existing `lib/errors.ts` classes + `error.middleware.ts`.

---

## 10. Admin password verification plan

### Reuse, with one refactor

[backend/src/features/financial/authorization/account-password.ts](backend/src/features/financial/authorization/account-password.ts)
already implements exactly the needed behaviour: bcrypt compare against the
caller's own password, `ADMIN` role check, 5-failures-per-15-minutes throttle,
and an `AdminVerificationLog` row per attempt (`SUCCESS`/`FAILURE`/`LOCKED`).
The password is compared, never stored.

**Refactor (small, low-risk):** `verifyAdminPasswordForCorrection` hardcodes the
message `'Only administrators can perform financial corrections'`. Generalize it:

- Move the function to `backend/src/lib/admin-verification.ts` as
  `verifyAdminPassword(userId, password, context)` where `context` gains an
  optional `domainLabel` (default `'financial corrections'`).
- Keep `verifyAdminPasswordForCorrection` in place as a thin re-export so **no
  existing financial code or test changes**.
- Service module calls it with `domainLabel: 'service and product changes'`.

The in-memory throttle array is shared across domains — correct behaviour (a user
brute-forcing via the service endpoints should lock out of financial ones too).

Similarly, `requireFinancialAdmin` from
[backend/src/features/financial/authorization/financial-policy.ts](backend/src/features/financial/authorization/financial-policy.ts)
gets a sibling `requireServiceAdmin` in `service/authorization/service-policy.ts`
rather than being reused directly, to keep error copy domain-appropriate.

### Which changes are "sensitive"

Declared as one exported map in `service-policy.ts`, so the rule lives in exactly
one place and is directly testable:

**Product — sensitive:** `name`, `model`, `barcode`, `brand`, `price`,
`discount`, `isActive`.
**Product — not sensitive:** `notes`, and *creation* of a new product.

**ServiceJob — sensitive:** `status` (backward or terminal moves),
`routingDecision`, `companyName`, all four warranty fields, `estimatedPrice`,
`finalPrice`, `priceNotes`, all business dates, `customerId`, `productId`,
`requestType`, `issueDescription`, cancel, reopen.
**ServiceJob — not sensitive:** `notes`, `requestedPartName`, the manual product
text fields, and *creation*; plus **forward** status moves along the normal flow.

> Rationale for the forward/backward split: requiring a password to click
> "unit sent to supplier" ten times a day would get the admin password shared
> around the workshop, which defeats the control entirely. Backward moves and
> terminal moves are the ones that can hide mistakes, so those are gated.

### Request shape

Every sensitive endpoint takes:

```jsonc
{
  "...changed fields...": "...",
  "reason": "string, 5–1000 chars",
  "accountPassword": "string"
}
```

`reason` validated with the existing `userTextSchema({ min: 5, max: 1000 })`
helper used by
[corrections.validator.ts:29](backend/src/features/financial/corrections/corrections.validator.ts#L29).

Password verification, the mutation, and the audit write all happen in **one
transaction** — an audit row is never missing for an applied change.
`accountPassword` must be added to the redaction list in
[backend/src/lib/redaction.ts](backend/src/lib/redaction.ts) if not already
covered (verify — the financial module already posts it, so it likely is).

---

## 11. Audit / history plan

`ServiceAudit` (schema in §8) is written for every sensitive mutation and for
`CREATE`.

Write path: `service/audit/service-audit.ts` exporting
`writeServiceAudit(input, tx?)`, modelled on
[correction-audit.ts](backend/src/features/financial/corrections/correction-audit.ts) —
including its `assertJsonObject` guard so `beforeValues`/`afterValues` are always
JSON objects, never arrays or scalars.

**Diff policy:** `beforeValues`/`afterValues` contain **only the changed keys**,
not the whole record. Keeps rows small and makes the history UI trivially
renderable as "field: old → new". `Decimal` values are stringified before being
put into JSON — `Decimal` does not survive `JSON.stringify` faithfully.

**Never audited:** reads, list queries, label prints.
**Always audited:** create, every sensitive field change, status change, cancel,
reopen, archive/restore.

Audit rows are **append-only** — no update or delete endpoint, no cascade delete
(`onDelete: Restrict` throughout).

Two audit surfaces already exist and both keep working unchanged:
`AdminVerificationLog` (who tried to authenticate) and `ActivityLog` (generic).
`ServiceAudit` is the third, domain-specific one — the same relationship
`FinancialCorrectionAudit` has today.

---

## 12. Frontend UI plan

New feature folder mirroring `features/receivables/` and
`features/customer-financial/`:

```
frontend/src/features/service/
├── api/
│   ├── products.api.ts
│   └── service-jobs.api.ts
├── types/
│   └── service.types.ts
├── schemas/
│   └── service.schemas.ts        // zod, mirrors backend validators
├── hooks/
│   ├── useProducts.ts
│   ├── useServiceJobs.ts
│   └── useServiceJob.ts
├── utils/
│   ├── service-labels.ts         // enum -> display label maps
│   └── service-status.ts         // status colour/grouping helpers
└── components/
    ├── ServiceJobsTable.tsx
    ├── ServiceJobMobileCard.tsx
    ├── ServiceJobsFilters.tsx
    ├── ServiceJobStatusChip.tsx
    ├── CreateServiceJobDialog.tsx
    ├── ProductPicker.tsx          // search-select + manual toggle
    ├── CustomerPicker.tsx         // reuse/extract from existing customer search
    ├── ServiceJobDetailsPanel.tsx
    ├── ChangeServiceStatusDialog.tsx
    ├── EditServiceJobDialog.tsx
    ├── CancelServiceJobDialog.tsx
    ├── ServiceJobAuditList.tsx
    └── ProductLabel.tsx           // the printable label itself
```

### Pages & routes

Added to [frontend/src/App.tsx](frontend/src/App.tsx) inside the protected
`DashboardLayout` block:

```tsx
<Route path="service" element={<ServiceJobsPage />} />
<Route path="service/:id" element={<ServiceJobDetailsPage />} />
<Route path="products/:id/label" element={<ProductLabelPage />} />
```

New page files under `frontend/src/pages/service/`.

Nav entry added to the `navItems` array in
[frontend/src/layouts/DashboardLayout.tsx:19-24](frontend/src/layouts/DashboardLayout.tsx#L19-L24):

```ts
{ name: 'Service', path: '/service', icon: Wrench },   // lucide-react
```

Placed after "Accounts Receivable", before "Reports". Visible to all roles.

### Screens

**1. Service Jobs page** — filters bar + summary chips + table (desktop) /
cards (mobile), matching the `ReceivablesTable` / `ReceivableMobileCard` split.
Columns: job number, customer, product (linked name or manual name), request
type, status chip, created date, days open, final/estimated price.

**2. Create Service Job dialog** — one modal, three blocks:
customer picker → product block (§13) → job details (request type, issue,
requested part, warranty, initial status, price estimate, notes).
No password required.

**3. Service Job details page** — header (job number, customer link, status
chip), a timeline of the four dates, the product block, warranty/routing block,
price block, notes, and an admin-only audit history list. Action buttons:
Change status / Edit / Cancel / Reopen.

**4. Sensitive-action dialogs** — every one follows the exact shape of
[EditDebtDialog.tsx](frontend/src/features/customer-financial/components/EditDebtDialog.tsx):
changed fields, then a **Reason** textarea, then an **Account password**
password field, with server field errors mapped back via `setError`. Reuse the
existing `TextField` / `inputClass` helpers and `Modal` from
[frontend/src/components/ui/Modal.tsx](frontend/src/components/ui/Modal.tsx).

**5. Product label page** — the label, a copies input, and a Print button.
`window.print()`, print styles scoped under the existing `@media print` block.

### Minimal product UI

Per your constraint, **no product admin section, no `/products` list page**.
Product creation exists only as a small "Add new product" inline form inside
`ProductPicker`, and the label page is reachable from a service job's linked
product or by direct URL.

---

## 13. Product selection / manual product input plan

`ProductPicker` is the single most important UX detail in this release — it must
never block intake.

```
┌─ Product ────────────────────────────────────────────┐
│  ( • ) Select existing     (   ) Enter manually       │
├──────────────────────────────────────────────────────┤
│  🔍 [ fridge_                              ]         │
│     ┌──────────────────────────────────────┐         │
│     │ Samsung Fridge RT28  · SAMSUNG       │         │
│     │ LG Fridge GN-B222    · LG            │         │
│     │ ─────────────────────────────────    │         │
│     │ + Add "fridge" as a new product      │         │
│     └──────────────────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

**Mode A — select existing.** Debounced (300ms) search against
`GET /api/v1/products?search=`, matching name / model / brand / barcode.
Only `isActive` products. Sets `productId`; manual fields are cleared and
disabled.

**Mode B — enter manually.** Four plain inputs: `manualProductName` (required in
this mode), `manualProductModel`, `manualProductBrand`, `manualProductNotes`.
Sets `productId = null`.

**Escape hatch:** "+ Add … as a new product" inside mode A opens a compact
inline form (name, model, brand, barcode, price) that `POST`s a product and
immediately selects it. This is why product creation is *not* password-gated.

**Server-side invariant** (enforced in `service-jobs.validator.ts`):

```
productId set          → all manual* fields must be null/absent
productId null         → manualProductName required
never both, never neither
```

A DB-level `CHECK` constraint is possible but Prisma can't express it natively;
validate in the service layer and cover it with a test. (Revisit if data drift
ever appears.)

**Display helper** — one function `resolveProductDisplay(job)` returning
`{ name, model, brand, isLinked }` from either source, used by the table, cards,
and details page so the two modes render identically.

**Future (not v1.0.7):** "Convert this manual product into a product record"
button on the details page. The data model already supports it — set `productId`,
null out the manual fields, write an `UPDATE_DETAILS` audit row.

---

## 14. Customer profile integration

[frontend/src/pages/customers/CustomerProfilePage.tsx](frontend/src/pages/customers/CustomerProfilePage.tsx)
currently renders flat sections (no tab system). Add one more section, below the
financial sections:

**"Service jobs"** — collapsible, showing:

- A count badge: open jobs / total jobs.
- A compact list: job number, product display, status chip, created date.
  Rows link to `/service/:id`.
- Empty state via the existing `EmptyState` component.
- A "New service job" button that opens `CreateServiceJobDialog` **with the
  customer pre-selected and locked** — the picker is skipped entirely.
- Last 5 shown, with "View all" linking to `/service?customerId=<id>`.

Data from `GET /api/v1/customers/:customerId/service-jobs?pageSize=5`.

No changes to customer creation, editing, or deletion. Note: the customer delete
flow ([CustomerDeleteModal.tsx](frontend/src/features/customers/components/CustomerDeleteModal.tsx))
must be checked — with `onDelete: Restrict` on `ServiceJob.customerId`, deleting
a customer with service jobs will now fail at the DB level. Confirm whether
customer deletion is soft (`deletedAt` exists on `Customer`, so it likely is) and
if so, nothing breaks. **Verify during CP4.**

---

## 15. Dashboard integration

Add one row of service cards to the existing dashboard, fed by
`GET /api/v1/service-jobs/summary`:

| Card | Query | Why it matters |
|---|---|---|
| **At supplier** | `status = SENT_TO_COMPANY` | Units physically out of the workshop's control |
| **Waiting for part** | `status = WAITING_FOR_PART` | Blocked work |
| **Awaiting customer** | `status = WAITING_CUSTOMER_APPROVAL` | Needs a phone call |
| **Ready for pickup** | `status = READY_FOR_PICKUP` | Money/space waiting to be freed |

Plus a small "**Overdue**" indicator: open jobs where
`serviceCreatedDate` is more than **30 days** ago and status is not terminal.
Threshold is a constant in `service-status.ts`, not a config setting (config
guardrails were already deferred — see the v1.0.4 corrections note).

Each card links to `/service?status=<STATUS>`.

Summary endpoint returns a single object of integer counts; implement as one
`groupBy` query, not five round-trips.

---

## 16. Filters and search

### Service jobs list

| Filter | Type | Notes |
|---|---|---|
| `search` | text | matches `jobNumber`, customer name, customer phone, product name/model, `manualProductName` |
| `status` | enum, **multi** | plus pseudo-values `OPEN` / `CLOSED` expanding to the §6 classification |
| `requestType` | enum, multi | |
| `routingDecision` | enum, multi | |
| `warrantyStatus` | enum, multi | |
| `customerId` | uuid | drives the "View all" deep link |
| `productId` | uuid | |
| `dateFrom` / `dateTo` | business date | on `serviceCreatedDate` |
| `sort` | enum | `createdDesc` (default), `createdAsc`, `statusAsc`, `customerAsc` |
| `page` / `pageSize` | int | pageSize max 100, default 25 |

Follows the query-param and pagination conventions already established by
[receivables.routes.ts](backend/src/features/financial/receivables/receivables.routes.ts) and
[receivables-query.ts](frontend/src/features/receivables/utils/receivables-query.ts) —
reuse the URL-state sync approach from the latter so filters survive refresh and
back-navigation.

### Products

`search` (name / model / brand / barcode prefix), `isActive`, pagination.
Search is `ILIKE '%term%'` on name/model/brand and exact-or-prefix on barcode
(a scanned barcode should match exactly and instantly).

---

## 17. Permissions

Roles today are `ADMIN` and `EMPLOYEE`
([schema.prisma:13-16](backend/prisma/schema.prisma#L13-L16)).

| Action | EMPLOYEE | ADMIN |
|---|---|---|
| View service jobs / products / labels | ✅ | ✅ |
| Print product label | ✅ | ✅ |
| Create service job | ✅ | ✅ |
| Create product | ✅ | ✅ |
| Edit job `notes`, `requestedPartName`, manual product text | ✅ | ✅ |
| **Forward** status move | ✅ | ✅ |
| **Backward / terminal** status move | ❌ | ✅ + password + reason |
| Edit price / warranty / routing / dates / customer / product link | ❌ | ✅ + password + reason |
| Edit product name/model/barcode/brand/price/discount | ❌ | ✅ + password + reason |
| Archive / restore product | ❌ | ✅ + password + reason |
| Cancel / reopen job | ❌ | ✅ + password + reason |
| View audit history | ❌ | ✅ |
| Delete anything | ❌ | ❌ (no delete endpoints exist) |

Enforced at the route layer (`requireServiceAdmin`) **and** re-checked in the
service layer — the financial module's existing double-check pattern.

---

## 18. Data validation rules

All via zod in `*.validator.ts`, reusing `userTextSchema` from
[backend/src/validators/user-text.ts](backend/src/validators/user-text.ts) for
free-text fields (it already handles trimming and the RTL/user-text concerns
this app cares about).

### Product

- `name` — required, trimmed, 1–200.
- `model` — required, trimmed, 1–120.
- `barcode` — optional; if present: trimmed, 4–64, `[A-Za-z0-9\-]+` only
  (CODE128 can encode more, but restricting keeps scanning reliable);
  **unique** — a duplicate returns a 409 with a field error on `barcode`, not a
  raw Prisma `P2002`.
- `price` / `discount` — optional; parsed with `parseMoney`; must be `>= 0`;
  max 2 decimal places; `discount <= price` **when both are present**.
- `notes` — optional, max 2000.

### ServiceJob

- `customerId` — required, must exist and not be soft-deleted.
- Product XOR manual — see §13.
- `requestType` — required enum.
- `issueDescription` — required, 3–2000.
- `requestedPartName` — **required when `requestType = PART_REPLACEMENT`**,
  otherwise optional, max 200.
- `companyName` — **required when `routingDecision = COMPANY`**, max 200.
- `warrantyExpiresAt` — optional; no constraint relative to today (expired
  warranties are a legitimate thing to record).
- `estimatedPrice` / `finalPrice` — optional, `>= 0`, 2dp, via `parseMoney`.
- Dates — all parsed with `parseBusinessDate`; ordering invariant per §6; no
  future dates except `homeVisitScheduledDate`.
- Status transitions — validated per §6; terminal → active rejected outside
  the reopen endpoint.
- `reason` — 5–1000 on every sensitive endpoint.
- `cancelledReason` — required on cancel, 5–1000.

### Cross-cutting

- Unknown keys **stripped**, not rejected (matches existing validators).
- All money in/out as strings. A JSON number for a money field is rejected with
  a clear message.

---

## 19. Testing strategy

Mirrors the existing coverage shape in `features/financial/*` — colocated
`*.test.ts` with vitest ([vitest.config.ts](vitest.config.ts)).

**Unit — domain (no DB, fast, highest value):**
- `service-status.test.ts` — transition matrix, initial/final classification,
  which transitions require which dates, date-ordering invariants.
- `job-number.test.ts` — format, zero-padding, year rollover, collision retry.
- `service-policy.test.ts` — the sensitive-field map; a table test asserting
  every `ServiceJob`/`Product` field is explicitly classified sensitive or not
  (fails when someone adds a field and forgets to classify it).

**Unit — validators:**
- `products.validator.test.ts` — required/optional matrix, decimal precision,
  `discount <= price`, barcode charset.
- `service-jobs.validator.test.ts` — product XOR manual, conditional
  `requestedPartName` and `companyName`, date ordering.

**Route tests (supertest, mocked service layer)** — following
`debts.routes.test.ts`:
- 401 unauthenticated, 403 employee-on-admin-endpoint.
- Sensitive endpoints reject missing/blank `reason` and missing
  `accountPassword`.
- Wrong password → 401 and **no mutation**.
- No `DELETE` route is registered on either resource.

**DB integration tests** (following `debts-db.integration.test.ts`):
- Create job → audit row exists with `action = CREATE`.
- Sensitive update → single transaction, audit `beforeValues`/`afterValues`
  contain only the changed keys, `Decimal`s stringified.
- Failed password → zero audit rows, zero mutation, one
  `AdminVerificationLog` row with `FAILURE`.
- `barcode` uniqueness → 409, not a 500.
- `jobNumber` uniqueness under concurrent create.
- Cancel → reopen → audit shows both actions in order.

**Frontend (vitest + testing-library)** — following
`receivables.components.test.tsx`:
- `ProductPicker` — mode toggle clears the other mode's values; manual mode
  requires a name; the inline add-product path selects the created product.
- `ChangeServiceStatusDialog` — required-date field appears exactly when the
  target status demands it.
- Sensitive dialogs surface server field errors on `reason` / `accountPassword`.
- `ProductLabel` — renders without a barcode block when `barcode` is absent;
  falls back to text when barcode rendering throws.

**Explicitly not tested in v1.0.7:** print output fidelity (manual check on the
actual label printer), Electron packaging of the new route.

---

## 20. Implementation checkpoints for Codex

Reordered slightly from your draft: the label view (was CP10) moves earlier
because it's independent of the service-job work and unblocks physical-printer
validation, which has the longest feedback loop.

| CP | Scope | Done when |
|---|---|---|
| **CP1** | Confirm plan against repo. Verify: customer delete is soft (§14); `accountPassword` is covered by `lib/redaction.ts`; `lucide-react` exports `Wrench` | Written confirmation, plan amended if reality differs |
| **CP2** | Prisma: 6 enums, `Product`, `ServiceJob`, `ServiceAudit`, `User` back-relations. One additive migration | `prisma migrate dev` clean; `prisma generate` types available; existing tests still pass |
| **CP3** | Generalize `verifyAdminPasswordForCorrection` → `lib/admin-verification.ts` with back-compat re-export. Add `service-policy.ts` (incl. sensitive-field map) and `service-audit.ts` | Existing financial tests pass **unchanged**; new policy unit tests pass |
| **CP4** | Backend Product API: repository, service, validator, controller, routes. Mount in `app.ts` | Product CRUD-minus-delete + archive/restore + audit working; barcode 409 path covered |
| **CP5** | Backend `service-status.ts` + `job-number.ts` domain modules with full unit tests | Transition/date/number rules green before any endpoint depends on them |
| **CP6** | Backend ServiceJob API: create, get, list+filters, patch, status, cancel, reopen, audit, summary, customer-scoped list | Route + DB integration tests green; password/audit atomicity proven |
| **CP7** | Frontend API clients, types, zod schemas, hooks for products + service jobs | Typecheck clean; hooks unit-tested against mocked responses |
| **CP8** | Add `jsbarcode`; build `ProductLabel` + `/products/:id/label` page + print styles + copies control | **Printed on the real label printer and physically verified scannable** |
| **CP9** | `ProductPicker` (search / manual / inline-add) | Component tests green; XOR behaviour correct |
| **CP10** | Service Jobs list page: filters, table, mobile cards, status chips, URL state, nav entry | Filters survive refresh; mobile layout matches receivables quality |
| **CP11** | `CreateServiceJobDialog` — customer picker + `ProductPicker` + job details | Job creatable end-to-end both with a linked product and with manual text |
| **CP12** | Service job details page + status/edit/cancel/reopen dialogs with password+reason + audit history list | Sensitive actions blocked for employees; audit renders old → new |
| **CP13** | Customer profile "Service jobs" section with pre-selected-customer create | Section renders, empty state correct, deep link works |
| **CP14** | Dashboard service cards + overdue indicator | Counts match a hand-checked DB state; cards deep-link with filters |
| **CP15** | Fill test gaps, update `docs/`, README feature list, version bump to 1.0.7 | Full suite green; docs describe the service workflow |

Each CP is independently reviewable and leaves the app in a working state.
CP2–CP6 are backend-only and can be verified without any UI.

---

## 21. Risks and open decisions

### Open decisions — need a business answer

1. **`discount` semantics — absolute amount or percentage?** This plan assumes an
   **absolute currency amount** (`Decimal(12,2)`, validated `<= price`). If the
   business means "10% off", the column should be `Decimal(5,2)` with a 0–100
   range and different validation. **Getting this wrong is expensive to reverse
   once labels are printed.** Confirm before CP2.
2. **Label physical size.** Plan assumes 50mm × 30mm thermal stock. Needs the
   actual printer/label dimensions before CP8.
3. **Overdue threshold** — 30 days assumed for the dashboard indicator.
4. **Currency/locale formatting on the label** — the app has existing money
   formatting; confirm the label should use the same format (thousands
   separators, symbol placement) rather than a bare number.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Password fatigue** — staff share the admin password if too many actions are gated | Destroys the control entirely | Forward status moves are deliberately *not* gated (§10). Revisit after two weeks of real use |
| **Product XOR manual drift** — enforced in app code only, not by a DB constraint | Bad rows possible via direct DB access | Service-layer validation + integration test. Add a `CHECK` via raw SQL in a later migration if drift is ever observed |
| **`onDelete: Restrict` on `ServiceJob.customerId`** breaks an existing customer-delete path | User-visible regression | CP1 verifies customer deletion is soft; if it is hard-delete anywhere, that path must be handled before CP6 |
| **`jsbarcode` bundle in Electron** — new dependency in a packaged desktop app | Build/packaging failure late in the cycle | Added at CP8, early enough to catch; it's a plain ESM package with no native code |
| **Barcode charset** — CODE128 can't encode arbitrary Unicode | Print-time crash | Validator restricts `barcode` to `[A-Za-z0-9\-]`; render has a text-only fallback |
| **Refactoring shared admin-verification code** touches working financial paths | Regression in a money-handling module | Back-compat re-export means zero call-site changes; existing financial tests are the gate at CP3 |
| **`Decimal` in JSON audit values** — `JSON.stringify(Decimal)` loses precision | Corrupted audit history, silently | Explicit stringification helper + a dedicated integration test asserting the stored JSON |
| **Scope creep into inventory/POS** | v1.0.7 never ships | The non-goals in §Context are binding; `discount` and `isActive` are the only forward-looking columns, and neither has behaviour attached |

### Deliberately deferred to v1.0.8+

Convert-manual-product-to-record; create a `Debt` from `finalPrice`; supplier
entity replacing `companyName`; service job attachments/photos; SLA/turnaround
reporting; label templates; product categories.

---

## 22. Exact files likely to change

### New — backend

```
backend/prisma/migrations/<ts>_add_service_and_product/migration.sql
backend/src/lib/admin-verification.ts                       (extracted from financial)
backend/src/features/service/index.ts
backend/src/features/service/domain/service-types.ts
backend/src/features/service/domain/service-errors.ts
backend/src/features/service/domain/service-status.ts       + .test.ts
backend/src/features/service/domain/job-number.ts           + .test.ts
backend/src/features/service/authorization/service-policy.ts + .test.ts
backend/src/features/service/audit/service-audit.ts
backend/src/features/service/audit/service-audit.repository.ts
backend/src/features/service/products/products.{routes,controller,service,repository,validator}.ts
backend/src/features/service/products/products.{routes,validator}.test.ts
backend/src/features/service/products/products-db.integration.test.ts
backend/src/features/service/service-jobs/service-jobs.{routes,controller,service,repository,validator}.ts
backend/src/features/service/service-jobs/service-jobs.{routes,service,validator}.test.ts
backend/src/features/service/service-jobs/service-jobs-db.integration.test.ts
```

### Modified — backend

| File | Change |
|---|---|
| [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | 6 enums, 3 models, `User` back-relations |
| [backend/src/app.ts](backend/src/app.ts) | 3 imports + 3 `app.use` mounts (customer-scoped route **before** `customersRoutes`) |
| [backend/src/features/financial/authorization/account-password.ts](backend/src/features/financial/authorization/account-password.ts) | Move core logic to `lib/admin-verification.ts`, keep re-export |
| [backend/src/lib/redaction.ts](backend/src/lib/redaction.ts) | Confirm/add `accountPassword` |

### New — frontend

```
frontend/src/features/service/api/{products,service-jobs}.api.ts
frontend/src/features/service/types/service.types.ts
frontend/src/features/service/schemas/service.schemas.ts
frontend/src/features/service/hooks/{useProducts,useServiceJobs,useServiceJob}.ts
frontend/src/features/service/utils/{service-labels,service-status,service-query}.ts
frontend/src/features/service/components/*.tsx          (14 components, §12)
frontend/src/features/service/components/service.components.test.tsx
frontend/src/pages/service/ServiceJobsPage.tsx
frontend/src/pages/service/ServiceJobDetailsPage.tsx
frontend/src/pages/service/ProductLabelPage.tsx
```

### Modified — frontend

| File | Change |
|---|---|
| [frontend/src/App.tsx](frontend/src/App.tsx) | 3 routes inside the protected block |
| [frontend/src/layouts/DashboardLayout.tsx](frontend/src/layouts/DashboardLayout.tsx#L19-L24) | 1 nav item ("Service", `Wrench`) |
| [frontend/src/pages/customers/CustomerProfilePage.tsx](frontend/src/pages/customers/CustomerProfilePage.tsx) | New "Service jobs" section |
| [frontend/src/styles/index.css](frontend/src/styles/index.css#L28) | Label `@page` rules inside the existing `@media print` block |
| `frontend/package.json` | `+ jsbarcode` |
| Dashboard page/feature (`frontend/src/features/dashboard/`) | Service summary cards |

### Modified — docs / release

`README.md` (feature list), `docs/` (service workflow page), root
`package.json` + `desktop/` version → `1.0.7`.

---

## Verification

Manual end-to-end pass after CP15, on a real machine with the real label printer:

1. `npm run dev` (or the project's existing dev script) — backend + frontend up.
2. **Product** — create "Samsung Fridge RT28", model `RT28K`, brand `Samsung`,
   barcode `8801643123456`, price `450000`.
3. **Label** — open `/products/<id>/label`, print 4 copies. Confirm: prints on
   one sheet, text legible, **barcode scans with the workshop's scanner and
   returns `8801643123456`**.
4. **Job with linked product** — from the customer profile of an existing
   customer, create a `WORKSHOP_DROP_OFF` job against that product. Confirm a
   `jobNumber` like `SV-2026-0001` is assigned.
5. **Job with manual product** — create an `ON_CALL` job with manual text only
   ("ceiling fan, no model"), a scheduled home-visit date. Confirm no product
   record was created.
6. **Routing to supplier** — set routing `COMPANY` + company name, move status
   to `SENT_TO_COMPANY`, confirm `sentToCompanyDate` is required; then move to
   `READY_FOR_PICKUP` and confirm `receivedFromCompanyDate` is required.
7. **Password gate** — as an `EMPLOYEE`, confirm price/status-backward/cancel
   actions are unavailable. As `ADMIN`, submit a price change with a **wrong**
   password: expect a field error, no change, and a `FAILURE` row in
   `admin_verification_logs`.
8. **Audit** — submit the same change with the correct password + reason;
   confirm the details page audit list shows `CHANGE_PRICE`, the reason, and
   old → new values only for the changed field.
9. **Deliver + reopen** — deliver the job (date required, moves to terminal),
   confirm it drops out of "open" counts, then reopen it as admin and confirm
   both actions appear in the audit trail.
10. **Dashboard & filters** — confirm the four cards' counts match the DB, each
    card deep-links to a correctly pre-filtered list, and filters survive a
    page refresh.
11. `npm test` — full suite green.
12. `npm run build` + Electron package — confirm `jsbarcode` bundles and the
    label route works in the packaged desktop app.
