# Supplier Management And Ledger Result

## Delivered

- Additive Prisma supplier, transaction, and audit models.
- Decimal-safe backend balance and summary calculations.
- Supplier create, list, details, edit, archive, restore, guarded removal, summary, and audit APIs.
- Supplier transaction create, global/per-supplier list, detail, edit, soft-remove, and restore APIs.
- Separate supplier ledger API with database-wide filtered summaries.
- Admin authorization, account-password verification, reasons, and mutation audits.
- Responsive bilingual supplier directory, profile, transaction flows, and supplier ledger.
- Focused backend and frontend tests for validation, domain direction, authorization, route order, endpoints, summaries, filters, and rendering.

## Migration

Normal installations must use the Prisma migration:

```powershell
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

Do not run `prisma migrate reset` on business data.

## Emergency Repair SQL

File:

```text
release/v1.0.8/repair-supplier-ledger-v1.0.8.sql
```

This script is optional and emergency-only. It is an additive, idempotent schema/index/constraint repair for a database where the normal supplier migration could not be applied correctly. It does not drop, truncate, reset, or delete business data.

Before using it:

1. Create and verify a PostgreSQL backup.
2. Close HomeConnect.
3. Confirm the selected pgAdmin database is `homeconnect`.
4. Prefer `prisma migrate deploy` when migration history is healthy.

The repair script is not a replacement for recording and deploying the Prisma migration.

## Deferred

Supplier dashboard cards were not added. Supplier liabilities remain clearly separated in Supplier Ledger instead of being mixed with customer outstanding totals.

## Release State

No package version was changed, no installer was generated, and no Git commit was created as part of this phase.
