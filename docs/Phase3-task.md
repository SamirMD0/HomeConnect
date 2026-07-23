# Phase 3 — Customer Management

**Objective:** Implement full customer CRUD with search, pagination, and a customer profile page. This is the foundation for the debt management system.

**Dependencies:** Phase 2 ✅  
**Estimated Complexity:** Medium-High (3–4 days)

---

## Task 1: Database — Customers Schema
- [ ] Update `customers` table in `backend/prisma/schema.prisma` with all fields:
  - `id`, `name`, `phone`, `address`, `notes`, `isActive`
  - `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `branchId`
- [ ] Add indexes for `name`, `phone`, and `deletedAt`
- [ ] Create Prisma migration (`npx prisma migrate dev --name init_customers`)
- [ ] Run `npx prisma generate` to update the client types

---

## Task 2: Backend — Customer Repositories & Validation
- [ ] Create `backend/src/repositories/customers.repository.ts`:
  - `findById`, `findAll` (paginated, sorted)
  - `create`, `update`, `softDelete`
  - `searchByNameOrPhone`
  - `checkDuplicatePhone`
- [ ] Create `backend/src/validators/customers.validator.ts`:
  - Create customer Zod schema (name required, phone required)
  - Update customer Zod schema (optional fields)
  - Pagination/Search query Zod schema

---

## Task 3: Backend — Customer Services
- [ ] Create `backend/src/services/customers.service.ts`:
  - Create customer (with duplicate phone check)
  - List customers (with pagination logic)
  - Get customer details by ID
  - Update customer details
  - Soft-delete customer
  - Search customers by name or phone

---

## Task 4: Backend — Customer API Endpoints
- [ ] Create `backend/src/routes/customers.routes.ts`:
  - `GET /api/v1/customers` — List customers (paginated, sortable, searchable)
  - `POST /api/v1/customers` — Create customer
  - `GET /api/v1/customers/:id` — Get customer by ID
  - `PUT /api/v1/customers/:id` — Update customer
  - `DELETE /api/v1/customers/:id` — Soft-delete customer
  - `GET /api/v1/customers/search` — Search by name/phone
- [ ] Create `backend/src/controllers/customers.controller.ts`
- [ ] Register customer routes in `backend/src/app.ts`

---

## Task 5: Frontend — API Hooks & State Management
- [ ] Create `frontend/src/services/api/customers.api.ts`:
  - Axios calls for all customer endpoints
- [ ] Create `frontend/src/hooks/useCustomers.ts`:
  - Setup TanStack Query hooks for fetching customers
  - Setup TanStack Mutation hooks for create, update, delete
  - Handle loading and error states automatically

---

## Task 6: Frontend — Shared UI Components
- [ ] Ensure Toast notification system is working (install `react-hot-toast` or similar)
- [ ] Create `frontend/src/components/ui/Modal.tsx` for forms and confirmations
- [ ] Create `frontend/src/components/ui/Table.tsx` for data display
- [ ] Create `frontend/src/components/ui/Pagination.tsx` for lists
- [ ] Create `frontend/src/components/ui/EmptyState.tsx` for empty search results

---

## Task 7: Frontend — Customer Forms & Modals
- [ ] Create `frontend/src/features/customers/components/CustomerForm.tsx`:
  - React Hook Form + Zod validation
  - Inputs for Name, Phone, Address, and Notes
  - Used for both creating and editing customers
- [ ] Create `frontend/src/features/customers/components/CustomerDeleteModal.tsx`:
  - Confirmation dialog before soft-deleting a customer

---

## Task 8: Frontend — Customers List Page
- [ ] Create `frontend/src/pages/customers/CustomersListPage.tsx`:
  - Implement CustomerSearch input with debounce
  - Display customers in a responsive Table or Card list (`CustomerCard.tsx`)
  - Implement Pagination controls
  - Connect to `useCustomers` hook
  - Update `App.tsx` routes to include `/customers`

---

## Task 9: Frontend — Customer Profile Page
- [ ] Create `frontend/src/pages/customers/CustomerProfilePage.tsx`:
  - Fetch and display detailed customer information
  - Add "Edit" and "Delete" action buttons
  - Add tabs structure (Info Tab, Transactions Tab placeholder for Phase 4)
  - Update `App.tsx` routes to include `/customers/:id`

---

## Task 10: Integration Testing & Git
- [ ] Test creating a customer with all fields
- [ ] Test editing a customer updates correctly
- [ ] Test soft-delete hides customer from list but preserves in DB
- [ ] Test search by name/phone returns correct results
- [ ] Test duplicate phone detection shows warning
- [ ] Test form validation prevents empty required fields
- [ ] Test pagination works correctly
- [ ] Git commit on `feature/phase-3-customers` branch
- [ ] Merge into `develop` / `main`

---

## Verification (Phase 3 Complete When)
- [ ] Full customer CRUD working through the UI
- [ ] Search and pagination functional
- [ ] Customer profile page shows customer details
- [ ] All validation and error handling in place
