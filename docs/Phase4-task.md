# Phase 4 — Customer Ledger & Debt Management

## Objective
Implement the transaction ledger system. This is the core business value of the application. Every sale and payment is recorded as an immutable transaction. Balance is always computed from the transaction history.

## 1. Database & Prisma
- [ ] Add `transactions` model in `prisma/schema.prisma`
  - Fields: `id`, `customerId`, `type` (SALE/PAYMENT/ADJUSTMENT), `amount`, `description`, `date`, `referenceNumber`, `metadata`, `createdBy`, `createdAt`, `branchId`
  - Add composite indexes: `customerId`, `date`, `type`, `(customerId, date)` composite
- [ ] Add `activity_logs` model in `prisma/schema.prisma`
  - Fields: `id`, `userId`, `action`, `entityType`, `entityId`, `details`, `ipAddress`, `createdAt`, `branchId`
- [ ] Run Prisma migration

## 2. Backend Services & Repositories
- [ ] Create `transactions.repository.ts`
  - Transaction queries, running balance computation
- [ ] Create `transactions.service.ts`
  - Transaction creation, balance calculation, history retrieval
  - Activity logging for all transactions
- [ ] Create `transactions.validator.ts`
  - Zod schemas for SALE, PAYMENT, ADJUSTMENT
  - Validations (amount > 0, valid type, etc.)
- [ ] Create `transactions.types.ts`
  - Transaction types and enums

## 3. API Endpoints (Transactions & Customers)
- [ ] POST `/api/v1/transactions` - Create transaction
- [ ] GET `/api/v1/transactions` - List transactions (paginated, filtered)
- [ ] GET `/api/v1/transactions/:id` - Get transaction details
- [ ] GET `/api/v1/customers/:id/transactions` - Get customer transaction history
- [ ] GET `/api/v1/customers/:id/balance` - Get customer current balance
- [ ] Update routers to include the new endpoints

## 4. Frontend Types & API Clients
- [ ] Add transaction types in `frontend/src/features/transactions/types.ts`
- [ ] Create `frontend/src/features/transactions/api/transactions.api.ts`
- [ ] Create custom hooks: `useTransactions.ts` (fetch, create)

## 5. Frontend Components
- [ ] `TransactionForm.tsx` — Record sale/payment/adjustment
- [ ] `TransactionList.tsx` — Transaction history table
- [ ] `RunningBalance.tsx` — Running balance display
- [ ] `BalanceBadge.tsx` — Color-coded balance indicator
- [ ] `TransactionFilter.tsx` — Date range and type filters

## 6. Frontend Pages & Integration
- [ ] Update `CustomerProfilePage.tsx`
  - Enhance with transaction tab
  - Current balance displayed on customer profile
  - Quick-add transaction from customer profile
- [ ] Update `CustomersListPage.tsx`
  - Customer balance shown in customer list
  - Debt indicator badges (green = no debt, red = has debt)

## 7. Business Logic & Testing
- [ ] Ensure balances computed correctly from transaction history
- [ ] Ensure running balance displayed correctly across all transaction types
- [ ] Verify transaction immutability (no edit/delete endpoints)
- [ ] Verify only admin can create ADJUSTMENT transactions
- [ ] Check edge cases (first transaction, zero balance, large numbers, concurrent transactions)
