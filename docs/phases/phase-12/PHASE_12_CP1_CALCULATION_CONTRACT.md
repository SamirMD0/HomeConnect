# Phase 12 CP1 Calculation Contract

Date: 2026-07-27

This contract is the Phase 12 checkpoint 1 baseline for financial calculations.

Rules:

- Money arithmetic is backend-owned and uses Decimal helpers from `backend/src/features/financial/domain/money.ts`.
- API money values are serialized as fixed two-decimal strings with `moneyToApiString`.
- Obligation paid totals are the sum of non-voided payment allocations, not payment header aggregates.
- An allocation is paid only when its parent payment is not voided. Allocation-level void state will be added in a later Phase 12 migration and must be included in this same check.
- Remaining balance equals obligation amount minus allocation-derived paid amount.
- Debt and installment plan cancellation must calculate whether non-voided payments exist. Hardcoded `hasPayments: false` is not allowed.
- Ledger summary values must be computed from the same filtered rows used by the ledger response.
- Frontend components format financial values but do not calculate authoritative money totals.
