# HomeConnect v1.0.7 Product Management Design

## Scope

Product Management completes the existing v1.0.7 Product foundation. It provides catalogue creation, browsing, correction, archive/restore, audit history, label printing, and service-job integration. It does not add inventory, stock movement, suppliers, POS, ecommerce, images, or financial side effects.

## Data Rules

- Name and model are required.
- Brand, barcode, price, fixed discount amount, and notes are optional.
- Barcode is unique when present.
- Price and discount cross the API as decimal strings; discount cannot exceed price.
- Products are archived and restored. They are never deleted.
- Archived products remain visible in history and are excluded from new service-job selection.

## Security

Creation and notes-only edits are available to authenticated staff. Name, model, brand, barcode, price, discount, archive, and restore require an ADMIN account, the current account password, and a reason. Password verification, mutation, and audit writing occur in one transaction. Passwords are never stored.

## User Experience

The Products workspace provides URL-backed search, active/archived views, brand and barcode filters, sorting, pagination, responsive desktop/mobile layouts, detail inspection, and compact row actions. User-entered product text uses automatic direction for Arabic and Latin content.

The details drawer shows catalogue values, derived net price, actor/timestamp information, audit history for administrators, and related service jobs.

## Labels

Single and multi-product printing reuse the CODE128 component. Up to 40 selected products may be printed at once. Missing or invalid products do not prevent valid labels from rendering. The 50mm x 30mm layout uses Tahoma/Arial fonts and prevents page splitting; physical printer alignment remains a manual verification.

## Service Integration

Service intake may select an active Product by name, model, brand, or barcode, or continue using manual product text. Linked service jobs open the corresponding Product details, and Product details list related service jobs.
