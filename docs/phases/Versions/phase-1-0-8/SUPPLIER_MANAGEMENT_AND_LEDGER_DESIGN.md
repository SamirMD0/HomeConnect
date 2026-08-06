# Supplier Management And Ledger Design

## Scope

HomeConnect now has a supplier domain separate from customers and customer receivables. It manages supplier contacts, liabilities, payments, credits, adjustments, audit history, and a global supplier ledger.

This work does not change customer financial models or customer ledger calculations.

## Accounting Model

Every supplier transaction stores a positive `Decimal(12,2)` amount and an explicit direction:

- `SUPPLIER_DEBT` increases the amount HomeConnect owes.
- `SUPPLIER_PAYMENT` decreases the amount HomeConnect owes.
- `SUPPLIER_CREDIT` decreases the amount HomeConnect owes.
- `SUPPLIER_ADJUSTMENT` requires an explicit increase or decrease direction.

The backend calculates:

```text
balance = sum(INCREASE_OWED) - sum(DECREASE_OWED)
```

Removed transactions are retained for audit but excluded from active balances. Filtered ledger summary values are calculated over all matching database rows, not only the current page.

## Security And Audit

- All reads require authentication.
- All supplier and supplier-transaction mutations require an administrator.
- Supplier name or phone edits require the administrator's account password and a reason.
- Archive, restore, and hard removal require the administrator's password and a reason.
- Transaction edit, soft removal, and restoration require the administrator's password and a reason.
- New transactions are rejected for archived suppliers.
- Supplier transactions are never hard deleted.
- A supplier can be hard removed only when it has no transaction history.
- Mutation audits record actor snapshots, before/after values, reason, request context, and affected balance where applicable.

## Data Model

- `suppliers`: contact details, lifecycle state, and actor references.
- `supplier_transactions`: typed positive-value transactions with direction and soft-removal state.
- `supplier_audits`: immutable mutation history for supplier and transaction records.

The additive migration is:

```text
backend/prisma/migrations/20260730120000_add_suppliers_and_supplier_ledger/migration.sql
```

## Frontend

- `/suppliers`: searchable, sortable active/archive directory.
- `/suppliers/:id`: supplier summary, details, recent transactions, and audit history.
- `/supplier-ledger`: authoritative summary cards, filters, and global transaction history.

The UI uses bilingual English/Arabic labels and `dir="auto"` for user-entered text. Desktop tables have responsive card layouts on smaller screens.

## Dashboard Decision

Supplier dashboard cards were intentionally deferred. The supplier ledger has authoritative totals, but adding them to the customer-focused dashboard without a dedicated visual section could mix liabilities with receivables. The supplier ledger remains the authoritative supplier overview.
