# PROJECT ROADMAP — Home Connect

## Business Management System

**Version:** 1.0.0-planning  
**Date:** 2026-07-23  
**Status:** Planning Phase  
**Platform:** Windows Desktop (Electron)  
**Deployment:** Local / Offline

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Vision](#2-project-vision)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Technology Stack](#5-technology-stack)
6. [High-Level Architecture](#6-high-level-architecture)
7. [Database Design Strategy](#7-database-design-strategy)
8. [API Design Strategy](#8-api-design-strategy)
9. [Folder Structure Recommendations](#9-folder-structure-recommendations)
10. [Development Standards](#10-development-standards)
11. [Security Plan](#11-security-plan)
12. [Backup & Restore Strategy](#12-backup--restore-strategy)
13. [Git Workflow](#13-git-workflow)
14. [Release Strategy](#14-release-strategy)
15. [Future Expansion Strategy](#15-future-expansion-strategy)
16. [Risks & Recommendations](#16-risks--recommendations)
17. [Development Roadmap](#17-development-roadmap)

---

## 1. Executive Summary

Home Connect is a desktop business management system designed for a small local business operating from a single Windows PC. The application runs entirely offline using a local PostgreSQL database, an Express REST API, a React frontend, and an Electron shell.

**Version 1** is laser-focused on one business problem: **customer debt management**. The business needs to track which customers owe money, record every sale and payment as a ledger transaction, generate reports, and export statements. Every architectural decision in this document is made with the understanding that the system will grow into a full ERP — but the first release ships only what the business needs today.

The system is designed around a **ledger-based accounting model**. Debt is never stored as a single mutable field. Instead, it is always derived from the sum of all transactions (sales increase debt, payments decrease debt). This guarantees an auditable, tamper-resistant financial history from day one.

### Key Decisions

| Decision | Rationale |
|---|---|
| Ledger-based debt tracking | Auditability, correctness, no data loss |
| PostgreSQL over SQLite | Future multi-user, full-text search, JSON support, robust backups |
| Prisma ORM | Type-safe queries, migration system, schema-as-code |
| Feature-based folder structure | Scales with future modules without refactoring |
| JWT authentication | Stateless auth, ready for future multi-device |
| Electron | Native Windows app, local file access, printer/scanner integration |

---

## 2. Project Vision

### Short-Term (Version 1)

Deliver a production-quality customer debt management system that the business can use daily. The owner should be able to:

- Log in securely
- Add and manage customers
- Record sales (debts) and payments
- View each customer's full transaction history with a running balance
- See a dashboard summarizing the business's financial position
- Generate and export monthly reports

### Medium-Term (Versions 2–4)

Extend the system with:

- Product catalog and inventory management
- POS with barcode scanner and receipt printing
- Supplier management and purchase orders
- Basic accounting (chart of accounts, journal entries)

### Long-Term (Versions 5+)

- Multi-branch support
- Advanced analytics and dashboards
- Notifications and alerts
- Full audit logging
- Employee permission matrix
- Potential migration to client-server (multi-PC) architecture

---

## 3. Functional Requirements

### 3.1 Authentication & Authorization

| ID | Requirement | Priority |
|---|---|---|
| AUTH-01 | Admin login with username and password | Must |
| AUTH-02 | Employee login with username and password | Must |
| AUTH-03 | Password hashing with bcrypt (min 12 rounds) | Must |
| AUTH-04 | JWT-based session management | Must |
| AUTH-05 | Role-based access control (Admin, Employee) | Must |
| AUTH-06 | Auto-logout after inactivity timeout | Should |
| AUTH-07 | Password change functionality | Must |
| AUTH-08 | First-run setup wizard (create admin account) | Must |

### 3.2 Customer Management

| ID | Requirement | Priority |
|---|---|---|
| CUST-01 | Create customer (name, phone, address, notes) | Must |
| CUST-02 | Edit customer details | Must |
| CUST-03 | Delete customer (soft-delete) | Must |
| CUST-04 | Search by name, phone number, or debt amount | Must |
| CUST-05 | Customer profile page with full details | Must |
| CUST-06 | Customer list with pagination and sorting | Must |
| CUST-07 | Duplicate phone number detection | Should |

### 3.3 Customer Ledger (Debt Management)

| ID | Requirement | Priority |
|---|---|---|
| LEDG-01 | Record Sale transaction (increases debt) | Must |
| LEDG-02 | Record Payment transaction (decreases debt) | Must |
| LEDG-03 | Record Adjustment transaction (correction) | Should |
| LEDG-04 | Every transaction stores: date, amount, description, type, created_by | Must |
| LEDG-05 | Transaction history per customer | Must |
| LEDG-06 | Running balance display in transaction history | Must |
| LEDG-07 | Current balance derived from sum of transactions | Must |
| LEDG-08 | Transactions are immutable (no edit/delete, only adjustments) | Must |
| LEDG-09 | Prevent negative payments exceeding balance (configurable) | Should |

### 3.4 Dashboard

| ID | Requirement | Priority |
|---|---|---|
| DASH-01 | Total customers count | Must |
| DASH-02 | Customers with outstanding debt count | Must |
| DASH-03 | Total outstanding debt amount | Must |
| DASH-04 | Payments received today | Must |
| DASH-05 | Payments received this month | Must |
| DASH-06 | Recent activity feed | Must |
| DASH-07 | Quick-action buttons (add customer, record sale) | Should |

### 3.5 Reports

| ID | Requirement | Priority |
|---|---|---|
| RPT-01 | Customers with debt report | Must |
| RPT-02 | Individual customer statement | Must |
| RPT-03 | Monthly debt report | Must |
| RPT-04 | Monthly payment report | Must |
| RPT-05 | Highest debt customers ranking | Must |
| RPT-06 | Monthly summary report (by month/year selection) | Must |
| RPT-07 | Date range filtering on all reports | Must |

### 3.6 Export

| ID | Requirement | Priority |
|---|---|---|
| EXP-01 | Export to Excel (.xlsx) | Must |
| EXP-02 | Export to PDF | Must |
| EXP-03 | Print directly | Must |
| EXP-04 | Customer statement PDF | Must |

### 3.7 Backup & Restore

| ID | Requirement | Priority |
|---|---|---|
| BAK-01 | Manual database backup | Must |
| BAK-02 | Automatic scheduled backup | Must |
| BAK-03 | Restore from backup file | Must |
| BAK-04 | Backup retention policy | Should |
| BAK-05 | Backup status and history display | Should |

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Dashboard loads in < 1 second with 10,000 transactions |
| **Performance** | Customer search returns results in < 300ms |
| **Performance** | Report generation completes in < 3 seconds for 1-year data |
| **Reliability** | Zero data loss — all transactions persisted to PostgreSQL with WAL |
| **Reliability** | Graceful handling of database connection failures |
| **Availability** | App starts in < 5 seconds on a standard Windows 10/11 PC |
| **Usability** | Intuitive enough that an employee with basic computer skills can use it |
| **Usability** | Keyboard shortcuts for common actions |
| **Usability** | Arabic/RTL-ready layout structure (if needed in future) |
| **Maintainability** | Feature-based modular architecture |
| **Maintainability** | Comprehensive error logging |
| **Scalability** | Database schema supports 100,000+ transactions |
| **Scalability** | Architecture supports adding modules without refactoring core |
| **Security** | All passwords hashed, no plaintext storage |
| **Security** | JWT tokens with expiration and refresh |
| **Security** | Input validation on all API endpoints |
| **Portability** | Single-machine deployment, no external dependencies at runtime |

---

## 5. Technology Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.x+ | UI framework |
| Vite | 5.x+ | Build tool and dev server |
| React Router | 6.x+ | Client-side routing |
| Tailwind CSS | 3.x | Utility-first styling |
| Axios | 1.x | HTTP client |
| TanStack Query | 5.x | Server state management, caching, sync |
| React Hook Form | 7.x | Form handling and validation |
| Zod | 3.x | Schema validation (shared with backend) |
| date-fns | 3.x | Date manipulation |
| Recharts | 2.x | Dashboard charts |
| jsPDF | 2.x | PDF generation |
| xlsx (SheetJS) | 0.20.x | Excel export |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS+ | Runtime |
| Express.js | 4.x | REST API framework |
| Prisma | 5.x+ | ORM, migrations, type-safe queries |
| bcrypt | 5.x | Password hashing |
| jsonwebtoken | 9.x | JWT creation and verification |
| Zod | 3.x | Request validation |
| winston | 3.x | Structured logging |
| node-cron | 3.x | Backup scheduling |
| cors | 2.x | CORS middleware (for dev) |
| helmet | 7.x | Security headers |
| compression | 1.x | Response compression |

### Database

| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | 16.x | Relational database |

### Desktop

| Technology | Version | Purpose |
|---|---|---|
| Electron | 30.x+ | Desktop shell |
| electron-builder | 24.x+ | Packaging and distribution |

### Development Tools

| Tool | Purpose |
|---|---|
| ESLint | Code linting |
| Prettier | Code formatting |
| TypeScript | Type safety (optional but strongly recommended) |
| Vitest | Unit and integration testing |
| Git | Version control |
| GitHub | Remote repository |

> [!IMPORTANT]
> **TypeScript Recommendation**: Although the user specified JavaScript, this document strongly recommends TypeScript for both frontend and backend. Prisma generates TypeScript types, TanStack Query is TypeScript-first, and the type safety will prevent entire categories of bugs in financial software. The decision is left to the user.

---

## 6. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ELECTRON SHELL                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │              REACT FRONTEND (Vite)                │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────────┐ │  │
│  │  │  Pages   │ │Components│ │   TanStack Query   │ │  │
│  │  │         │ │          │ │   (Cache Layer)    │ │  │
│  │  └────┬────┘ └──────────┘ └────────┬───────────┘ │  │
│  │       │                            │              │  │
│  │       └──────────┬─────────────────┘              │  │
│  │                  │ Axios HTTP                     │  │
│  └──────────────────┼────────────────────────────────┘  │
│                     │ localhost:3001                     │
│  ┌──────────────────┼────────────────────────────────┐  │
│  │          EXPRESS REST API                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐    │  │
│  │  │  Routes  │→│ Services │→│  Repositories  │    │  │
│  │  │          │ │          │ │                │    │  │
│  │  └──────────┘ └──────────┘ └───────┬────────┘    │  │
│  │  ┌──────────┐ ┌──────────┐         │             │  │
│  │  │Middleware │ │Validators│         │             │  │
│  │  └──────────┘ └──────────┘         │             │  │
│  └────────────────────────────────────┼──────────────┘  │
│                                       │ Prisma Client   │
│  ┌────────────────────────────────────┼──────────────┐  │
│  │              POSTGRESQL DATABASE                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐    │  │
│  │  │  Users   │ │Customers │ │  Transactions  │    │  │
│  │  └──────────┘ └──────────┘ └────────────────┘    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility |
|---|---|
| **Electron Shell** | Window management, native OS integration, IPC for file system access (backups, printing), auto-updates |
| **React Frontend** | UI rendering, routing, form handling, client-side validation, state management via TanStack Query |
| **Express API** | HTTP request handling, authentication, authorization, business logic orchestration, response formatting |
| **Service Layer** | Business logic, transaction orchestration, report generation, export formatting |
| **Repository Layer** | Data access abstraction over Prisma, query composition, pagination helpers |
| **Prisma ORM** | Schema definition, migrations, type-safe database queries, connection management |
| **PostgreSQL** | Data persistence, indexing, full-text search, referential integrity |

### Communication Flow

```
User Action → React Component → TanStack Query → Axios → Express Route
    → Middleware (auth, validation) → Service → Repository → Prisma → PostgreSQL
    → Response → TanStack Query Cache → React Re-render → UI Update
```

### Electron IPC Architecture

```
┌──────────────────┐         IPC          ┌──────────────────┐
│  Renderer Process │ ◄──────────────────► │   Main Process   │
│  (React App)      │                      │   (Node.js)      │
│                   │  contextBridge       │                   │
│  window.electronAPI│ ─────────────────── │  File System      │
│                   │  (preload.js)        │  Backup/Restore   │
│                   │                      │  Print Service    │
│                   │                      │  Native Dialogs   │
└──────────────────┘                      └──────────────────┘
```

> [!NOTE]
> The Express API server runs as a child process spawned by Electron's main process. This keeps the API lifecycle tied to the application window. In development, Vite's dev server and Express run independently for hot-reload.

---

## 7. Database Design Strategy

### 7.1 Design Principles

1. **Ledger-based accounting**: Balances are always computed, never stored as mutable fields
2. **Soft deletes**: Critical records use `deletedAt` timestamps, never hard deletes
3. **Audit trail**: Every mutation records `createdBy`, `createdAt`, `updatedAt`
4. **Future-proof schema**: Include `tenantId` / `branchId` columns from day one (nullable) for future multi-branch
5. **Referential integrity**: All foreign keys enforced at the database level
6. **Indexing strategy**: Index all columns used in WHERE, ORDER BY, and JOIN clauses

### 7.2 Version 1 Schema

```
┌──────────────────┐       ┌──────────────────────┐
│      users       │       │      customers       │
├──────────────────┤       ├──────────────────────┤
│ id          UUID │       │ id              UUID │
│ username  STRING │       │ name          STRING │
│ password  STRING │       │ phone         STRING │
│ fullName  STRING │       │ address       STRING │
│ role        ENUM │       │ notes           TEXT │
│ isActive    BOOL │       │ isActive        BOOL │
│ createdAt   DATE │       │ createdAt       DATE │
│ updatedAt   DATE │       │ updatedAt       DATE │
│ deletedAt   DATE │       │ deletedAt       DATE │
│ branchId    UUID?│       │ branchId        UUID?│
└──────────────────┘       │ createdBy       UUID │
        │                  └──────────┬───────────┘
        │                             │
        │    ┌────────────────────────┘
        │    │
        ▼    ▼
┌──────────────────────────────────┐
│          transactions            │
├──────────────────────────────────┤
│ id                          UUID │
│ customerId                  UUID │  → FK customers.id
│ type                        ENUM │  → SALE | PAYMENT | ADJUSTMENT
│ amount                   DECIMAL │  → Always positive
│ description               STRING │
│ date                    DATETIME │
│ createdBy                   UUID │  → FK users.id
│ createdAt               DATETIME │
│ branchId                   UUID? │
│ referenceNumber           STRING?│  → For future invoice linking
│ metadata                   JSON? │  → Extensible field
└──────────────────────────────────┘

┌──────────────────────────────────┐
│          settings                │
├──────────────────────────────────┤
│ id                          UUID │
│ key                       STRING │  → UNIQUE
│ value                       JSON │
│ category                  STRING │
│ updatedAt               DATETIME │
│ updatedBy                   UUID │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│         backup_logs              │
├──────────────────────────────────┤
│ id                          UUID │
│ filename                  STRING │
│ filepath                  STRING │
│ sizeBytes                    INT │
│ type                        ENUM │  → MANUAL | SCHEDULED
│ status                      ENUM │  → SUCCESS | FAILED
│ createdAt               DATETIME │
│ createdBy                  UUID? │
│ notes                     STRING?│
└──────────────────────────────────┘

┌──────────────────────────────────┐
│        activity_logs             │
├──────────────────────────────────┤
│ id                          UUID │
│ userId                      UUID │  → FK users.id
│ action                    STRING │  → e.g., "CUSTOMER_CREATED"
│ entityType                STRING │  → e.g., "customer"
│ entityId                    UUID │
│ details                     JSON │
│ ipAddress                STRING? │
│ createdAt               DATETIME │
│ branchId                   UUID? │
└──────────────────────────────────┘
```

### 7.3 Balance Calculation Strategy

**The golden rule: balance is always computed, never stored.**

```sql
-- Customer's current balance
SELECT
  COALESCE(SUM(CASE WHEN type = 'SALE' THEN amount ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) +
  COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT' THEN amount ELSE 0 END), 0)
  AS balance
FROM transactions
WHERE customer_id = $1 AND deleted_at IS NULL;
```

For performance at scale (10,000+ customers), a **materialized balance cache** can be introduced later:

```sql
-- Future optimization: cached balance table
CREATE TABLE customer_balances (
  customer_id UUID PRIMARY KEY REFERENCES customers(id),
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_transaction_id UUID,
  computed_at TIMESTAMP NOT NULL
);
```

This is **not needed in Version 1** but the architecture supports it without breaking changes.

### 7.4 Indexing Strategy

```sql
-- Performance-critical indexes
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_customer_date ON transactions(customer_id, date);
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_deleted_at ON customers(deleted_at);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
```

### 7.5 Migration Strategy

- **Prisma Migrate** handles all schema changes
- Every migration is version-controlled in Git
- Migrations run automatically on app startup via Electron's main process
- **Never** use `prisma db push` in production — always use `prisma migrate deploy`
- Destructive migrations (column drops, type changes) require a two-step process:
  1. Migration A: Add new column, backfill data
  2. Migration B: Remove old column (in the next release)

---

## 8. API Design Strategy

### 8.1 API Conventions

| Convention | Standard |
|---|---|
| Base URL | `http://localhost:3001/api/v1` |
| Versioning | URL path versioning (`/api/v1/`, `/api/v2/`) |
| Naming | Plural nouns for resources (`/customers`, `/transactions`) |
| Methods | GET (read), POST (create), PUT (full update), PATCH (partial update), DELETE (soft delete) |
| Response format | JSON with consistent envelope |
| Date format | ISO 8601 (`2026-07-23T09:00:00.000Z`) |
| IDs | UUIDs (v4) |
| Pagination | Cursor-based for lists, offset-based for reports |
| Errors | RFC 7807 Problem Details format |

### 8.2 Response Envelope

```json
// Success (single resource)
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2026-07-23T09:00:00.000Z" }
}

// Success (list)
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 150,
      "totalPages": 8
    },
    "timestamp": "2026-07-23T09:00:00.000Z"
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "amount", "message": "Amount must be a positive number" }
    ]
  },
  "meta": { "timestamp": "2026-07-23T09:00:00.000Z" }
}
```

### 8.3 Version 1 API Endpoints

#### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/logout` | User logout (invalidate token) |
| POST | `/api/v1/auth/refresh` | Refresh JWT token |
| GET | `/api/v1/auth/me` | Get current user profile |
| PUT | `/api/v1/auth/password` | Change password |
| POST | `/api/v1/auth/setup` | First-run admin creation |

#### Users (Admin only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/users` | List all users |
| POST | `/api/v1/users` | Create user |
| GET | `/api/v1/users/:id` | Get user by ID |
| PUT | `/api/v1/users/:id` | Update user |
| DELETE | `/api/v1/users/:id` | Deactivate user |

#### Customers

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/customers` | List customers (paginated, searchable) |
| POST | `/api/v1/customers` | Create customer |
| GET | `/api/v1/customers/:id` | Get customer profile (includes balance) |
| PUT | `/api/v1/customers/:id` | Update customer |
| DELETE | `/api/v1/customers/:id` | Soft-delete customer |
| GET | `/api/v1/customers/:id/transactions` | Get customer's transaction history |
| GET | `/api/v1/customers/:id/statement` | Get customer statement (date range) |
| GET | `/api/v1/customers/search` | Search customers |

#### Transactions

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/transactions` | List all transactions (paginated, filtered) |
| POST | `/api/v1/transactions` | Create transaction (sale/payment/adjustment) |
| GET | `/api/v1/transactions/:id` | Get transaction details |

> [!NOTE]
> Transactions do not have PUT or DELETE endpoints. They are immutable by design. Corrections are made via ADJUSTMENT transactions that reference the original.

#### Dashboard

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/dashboard/summary` | Dashboard summary metrics |
| GET | `/api/v1/dashboard/recent-activity` | Recent activity feed |

#### Reports

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/reports/debt-summary` | Customers with debt |
| GET | `/api/v1/reports/monthly-debt` | Monthly debt report |
| GET | `/api/v1/reports/monthly-payments` | Monthly payment report |
| GET | `/api/v1/reports/highest-debt` | Highest debt customers |
| GET | `/api/v1/reports/customer-statement/:id` | Individual customer statement |

#### Export

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/export/excel` | Export report data to Excel |
| GET | `/api/v1/export/pdf` | Export report data to PDF |

#### Backup

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/backup/create` | Create manual backup |
| GET | `/api/v1/backup/list` | List backup history |
| POST | `/api/v1/backup/restore` | Restore from backup |
| GET | `/api/v1/backup/settings` | Get backup schedule settings |
| PUT | `/api/v1/backup/settings` | Update backup schedule settings |

#### Settings

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/settings` | Get all settings |
| PUT | `/api/v1/settings/:key` | Update a setting |

---

## 9. Folder Structure Recommendations

```
home-connect/
├── .github/                          # GitHub workflows (optional)
├── .vscode/                          # VS Code workspace settings
│   ├── settings.json
│   ├── extensions.json               # Recommended extensions
│   └── launch.json                   # Debug configurations
│
├── prisma/                           # Prisma schema and migrations
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                       # Database seeder
│
├── src/
│   ├── main/                         # ═══ ELECTRON MAIN PROCESS ═══
│   │   ├── index.ts                  # Electron entry point
│   │   ├── window.ts                 # Window creation and management
│   │   ├── ipc/                      # IPC handlers
│   │   │   ├── backup.ipc.ts
│   │   │   ├── print.ipc.ts
│   │   │   └── file.ipc.ts
│   │   ├── services/
│   │   │   └── backup.service.ts     # Native backup operations
│   │   └── preload.ts                # Context bridge (preload script)
│   │
│   ├── server/                       # ═══ EXPRESS BACKEND ═══
│   │   ├── index.ts                  # Server entry point
│   │   ├── app.ts                    # Express app configuration
│   │   │
│   │   ├── config/                   # Configuration
│   │   │   ├── index.ts              # Unified config loader
│   │   │   ├── database.ts           # Database config
│   │   │   └── auth.ts               # Auth config (JWT secret, expiry)
│   │   │
│   │   ├── middleware/               # Express middleware
│   │   │   ├── auth.middleware.ts     # JWT verification
│   │   │   ├── role.middleware.ts     # Role-based access
│   │   │   ├── validate.middleware.ts # Request validation (Zod)
│   │   │   ├── error.middleware.ts    # Global error handler
│   │   │   └── logger.middleware.ts   # Request logging
│   │   │
│   │   ├── features/                 # ══ FEATURE MODULES ══
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.validator.ts  # Zod schemas
│   │   │   │   └── auth.types.ts
│   │   │   │
│   │   │   ├── users/
│   │   │   │   ├── users.routes.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── users.repository.ts
│   │   │   │   ├── users.validator.ts
│   │   │   │   └── users.types.ts
│   │   │   │
│   │   │   ├── customers/
│   │   │   │   ├── customers.routes.ts
│   │   │   │   ├── customers.service.ts
│   │   │   │   ├── customers.repository.ts
│   │   │   │   ├── customers.validator.ts
│   │   │   │   └── customers.types.ts
│   │   │   │
│   │   │   ├── transactions/
│   │   │   │   ├── transactions.routes.ts
│   │   │   │   ├── transactions.service.ts
│   │   │   │   ├── transactions.repository.ts
│   │   │   │   ├── transactions.validator.ts
│   │   │   │   └── transactions.types.ts
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard.routes.ts
│   │   │   │   ├── dashboard.service.ts
│   │   │   │   └── dashboard.types.ts
│   │   │   │
│   │   │   ├── reports/
│   │   │   │   ├── reports.routes.ts
│   │   │   │   ├── reports.service.ts
│   │   │   │   └── reports.types.ts
│   │   │   │
│   │   │   ├── export/
│   │   │   │   ├── export.routes.ts
│   │   │   │   ├── export.service.ts
│   │   │   │   ├── generators/
│   │   │   │   │   ├── excel.generator.ts
│   │   │   │   │   └── pdf.generator.ts
│   │   │   │   └── export.types.ts
│   │   │   │
│   │   │   ├── backup/
│   │   │   │   ├── backup.routes.ts
│   │   │   │   ├── backup.service.ts
│   │   │   │   └── backup.types.ts
│   │   │   │
│   │   │   └── settings/
│   │   │       ├── settings.routes.ts
│   │   │       ├── settings.service.ts
│   │   │       └── settings.types.ts
│   │   │
│   │   ├── lib/                      # Shared utilities
│   │   │   ├── prisma.ts             # Prisma client singleton
│   │   │   ├── logger.ts             # Winston logger setup
│   │   │   ├── errors.ts             # Custom error classes
│   │   │   └── pagination.ts         # Pagination helpers
│   │   │
│   │   └── types/                    # Shared types
│   │       ├── express.d.ts          # Express type extensions
│   │       └── common.ts             # Shared type definitions
│   │
│   └── renderer/                     # ═══ REACT FRONTEND ═══
│       ├── main.tsx                  # React entry point
│       ├── App.tsx                   # Root component with providers
│       │
│       ├── assets/                   # Static assets
│       │   ├── images/
│       │   └── fonts/
│       │
│       ├── components/               # Shared/common components
│       │   ├── ui/                   # Primitive UI components
│       │   │   ├── Button.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Modal.tsx
│       │   │   ├── Table.tsx
│       │   │   ├── Card.tsx
│       │   │   ├── Badge.tsx
│       │   │   ├── Dropdown.tsx
│       │   │   ├── Pagination.tsx
│       │   │   ├── LoadingSpinner.tsx
│       │   │   ├── EmptyState.tsx
│       │   │   └── Toast.tsx
│       │   │
│       │   └── layout/               # Layout components
│       │       ├── AppLayout.tsx      # Main app shell
│       │       ├── Sidebar.tsx
│       │       ├── Header.tsx
│       │       └── PageHeader.tsx
│       │
│       ├── features/                 # ══ FEATURE MODULES ══
│       │   ├── auth/
│       │   │   ├── pages/
│       │   │   │   ├── LoginPage.tsx
│       │   │   │   └── SetupPage.tsx
│       │   │   ├── components/
│       │   │   │   └── LoginForm.tsx
│       │   │   ├── hooks/
│       │   │   │   └── useAuth.ts
│       │   │   ├── api/
│       │   │   │   └── auth.api.ts
│       │   │   └── types.ts
│       │   │
│       │   ├── dashboard/
│       │   │   ├── pages/
│       │   │   │   └── DashboardPage.tsx
│       │   │   ├── components/
│       │   │   │   ├── StatCard.tsx
│       │   │   │   ├── RecentActivity.tsx
│       │   │   │   └── QuickActions.tsx
│       │   │   ├── hooks/
│       │   │   │   └── useDashboard.ts
│       │   │   └── api/
│       │   │       └── dashboard.api.ts
│       │   │
│       │   ├── customers/
│       │   │   ├── pages/
│       │   │   │   ├── CustomersListPage.tsx
│       │   │   │   └── CustomerProfilePage.tsx
│       │   │   ├── components/
│       │   │   │   ├── CustomerForm.tsx
│       │   │   │   ├── CustomerCard.tsx
│       │   │   │   ├── CustomerSearch.tsx
│       │   │   │   └── CustomerDeleteModal.tsx
│       │   │   ├── hooks/
│       │   │   │   ├── useCustomers.ts
│       │   │   │   └── useCustomer.ts
│       │   │   └── api/
│       │   │       └── customers.api.ts
│       │   │
│       │   ├── transactions/
│       │   │   ├── components/
│       │   │   │   ├── TransactionForm.tsx
│       │   │   │   ├── TransactionList.tsx
│       │   │   │   └── RunningBalance.tsx
│       │   │   ├── hooks/
│       │   │   │   └── useTransactions.ts
│       │   │   └── api/
│       │   │       └── transactions.api.ts
│       │   │
│       │   ├── reports/
│       │   │   ├── pages/
│       │   │   │   ├── ReportsPage.tsx
│       │   │   │   ├── DebtReportPage.tsx
│       │   │   │   ├── PaymentReportPage.tsx
│       │   │   │   ├── MonthlyReportPage.tsx
│       │   │   │   └── CustomerStatementPage.tsx
│       │   │   ├── components/
│       │   │   │   ├── ReportFilters.tsx
│       │   │   │   ├── ReportTable.tsx
│       │   │   │   └── ExportButtons.tsx
│       │   │   ├── hooks/
│       │   │   │   └── useReports.ts
│       │   │   └── api/
│       │   │       └── reports.api.ts
│       │   │
│       │   ├── backup/
│       │   │   ├── pages/
│       │   │   │   └── BackupPage.tsx
│       │   │   ├── components/
│       │   │   │   ├── BackupHistory.tsx
│       │   │   │   ├── BackupSchedule.tsx
│       │   │   │   └── RestoreModal.tsx
│       │   │   ├── hooks/
│       │   │   │   └── useBackup.ts
│       │   │   └── api/
│       │   │       └── backup.api.ts
│       │   │
│       │   └── settings/
│       │       ├── pages/
│       │       │   └── SettingsPage.tsx
│       │       ├── components/
│       │       │   ├── GeneralSettings.tsx
│       │       │   └── UserManagement.tsx
│       │       ├── hooks/
│       │       │   └── useSettings.ts
│       │       └── api/
│       │           └── settings.api.ts
│       │
│       ├── hooks/                    # Shared hooks
│       │   ├── useDebounce.ts
│       │   └── usePagination.ts
│       │
│       ├── lib/                      # Shared utilities
│       │   ├── axios.ts              # Axios instance with interceptors
│       │   ├── queryClient.ts        # TanStack Query client
│       │   ├── formatters.ts         # Date, currency formatters
│       │   └── constants.ts          # App-wide constants
│       │
│       ├── router/                   # Routing
│       │   ├── index.tsx             # Router configuration
│       │   ├── ProtectedRoute.tsx    # Auth guard
│       │   └── routes.ts             # Route constants
│       │
│       ├── store/                    # Client state (if needed)
│       │   └── authStore.ts          # Auth state (Zustand or Context)
│       │
│       └── styles/                   # Global styles
│           └── index.css             # Tailwind directives + globals
│
├── tests/                            # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/                          # Build and utility scripts
│   ├── seed.ts                       # Database seeder
│   └── backup.ts                     # CLI backup tool
│
├── backups/                          # Default backup directory
│   └── .gitkeep
│
├── logs/                             # Application logs
│   └── .gitkeep
│
├── .env                              # Environment variables (git-ignored)
├── .env.example                      # Environment template
├── .eslintrc.cjs                     # ESLint config
├── .prettierrc                       # Prettier config
├── .gitignore
├── electron-builder.yml              # Electron packaging config
├── package.json
├── tsconfig.json                     # TypeScript config (root)
├── tsconfig.server.json              # TypeScript config (server)
├── tailwind.config.js                # Tailwind config
├── postcss.config.js                 # PostCSS config
├── vite.config.ts                    # Vite config
├── PROJECT_ROADMAP.md                # This document
└── README.md
```

### Key Structure Decisions

| Decision | Rationale |
|---|---|
| **Feature-based modules** | Each feature (customers, transactions, reports) is self-contained. Adding a new module (e.g., products, inventory) means adding a new folder — no existing code changes |
| **Mirrored backend/frontend features** | `src/server/features/customers/` maps to `src/renderer/features/customers/`. Makes it trivial to locate related code |
| **Separated concerns within features** | Each feature has its own routes, service, repository, and validator. No god-files |
| **Shared UI components** | `components/ui/` contains design-system primitives. Feature-specific components live within their feature |
| **Centralized config** | All configuration loaded from `src/server/config/` and environment variables |

---

## 10. Development Standards

### 10.1 Code Style

| Rule | Standard |
|---|---|
| Language | TypeScript (recommended) or JavaScript with JSDoc |
| Formatting | Prettier (2-space indent, single quotes, trailing commas) |
| Linting | ESLint with recommended + React rules |
| Naming — files | `kebab-case` for non-component files, `PascalCase` for React components |
| Naming — variables | `camelCase` for variables and functions |
| Naming — constants | `UPPER_SNAKE_CASE` for true constants |
| Naming — types | `PascalCase` for interfaces and types |
| Naming — database | `snake_case` for tables and columns (Prisma maps automatically) |
| Imports | Absolute imports using path aliases (`@server/`, `@renderer/`, `@shared/`) |

### 10.2 API Service Pattern

Every backend feature follows this pattern:

```
Route → Validator → Controller/Service → Repository → Prisma → Database
```

**Route** — Defines HTTP endpoints and applies middleware  
**Validator** — Zod schema validation for request body/params/query  
**Service** — Business logic, orchestration, never touches Prisma directly  
**Repository** — Data access, Prisma queries, pagination  

### 10.3 Error Handling Strategy

```
┌─────────────────┐
│  Custom Errors   │ → AppError, ValidationError, NotFoundError,
│  (Thrown)         │   AuthenticationError, AuthorizationError
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Error Middleware │ → Catches all errors, maps to HTTP status codes,
│  (Global)        │   formats as RFC 7807, logs details
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Client Handler  │ → Axios interceptor catches errors,
│  (Frontend)      │   TanStack Query displays toast notifications
└─────────────────┘
```

### 10.4 Logging Strategy

| Level | Usage |
|---|---|
| `error` | Unhandled exceptions, database failures, critical errors |
| `warn` | Failed login attempts, validation failures, deprecated usage |
| `info` | Server start, successful operations, backup completed |
| `debug` | SQL queries (dev only), request/response bodies |

Logs are written to:
- **Console** — Development
- **File** — Production (`logs/app.log`, `logs/error.log`)
- Log rotation: daily, retain 30 days

### 10.5 Validation Strategy

- **Zod** schemas defined per feature in `*.validator.ts` files
- Shared schemas for common types (pagination, date ranges)
- Validation runs in middleware **before** the service layer
- Frontend uses the same Zod schemas (or derived types) for form validation via React Hook Form's Zod resolver
- All monetary values validated as positive numbers with max 2 decimal places

### 10.6 Testing Strategy

| Type | Tool | Scope |
|---|---|---|
| Unit | Vitest | Services, utilities, validators |
| Integration | Vitest + Supertest | API endpoints with test database |
| Component | Vitest + React Testing Library | React components |
| E2E | Playwright (future) | Full user flows |

**Testing priorities for Version 1:**

1. Transaction service (balance calculations, edge cases) — **Critical**
2. Auth service (login, JWT, password hashing) — **Critical**
3. Customer service (CRUD, soft delete) — **High**
4. API endpoint integration tests — **High**
5. Report calculations — **Medium**

---

## 11. Security Plan

### 11.1 Authentication

| Measure | Implementation |
|---|---|
| Password hashing | bcrypt with 12+ salt rounds |
| JWT access token | Short-lived (15 minutes) |
| JWT refresh token | Long-lived (7 days), stored in httpOnly cookie |
| Token rotation | New refresh token on each refresh |
| First-run setup | Force admin account creation on first launch |
| Account lockout | Lock after 5 failed attempts (15 min cooldown) |
| Session invalidation | Server-side token blacklist on logout |

### 11.2 Authorization

| Role | Permissions |
|---|---|
| **Admin** | Full access: user management, settings, backup/restore, all CRUD |
| **Employee** | Customer CRUD, transactions, reports (read-only settings, no user management, no backup/restore) |

Role checks enforced at the middleware level on every request.

### 11.3 Input Security

| Threat | Mitigation |
|---|---|
| SQL Injection | Prisma's parameterized queries (never raw SQL without parameterization) |
| XSS | React's built-in escaping, Helmet security headers |
| CSRF | Not applicable (same-origin, Electron) but CORS restricted to localhost |
| Data tampering | Zod validation on all inputs, whitelist allowed fields |
| Path traversal | Validate and sanitize all file paths (backup/restore) |

### 11.4 Data Security

| Measure | Implementation |
|---|---|
| Database access | PostgreSQL user with least-privilege permissions |
| Backup encryption | AES-256 encryption for backup files (future, optional) |
| Environment variables | `.env` file, never committed to Git |
| Sensitive logs | Never log passwords, tokens, or full credit card numbers |

---

## 12. Backup & Restore Strategy

### 12.1 Backup Architecture

```
┌─────────────────────────────────────────────────┐
│                BACKUP SYSTEM                     │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │  Manual       │    │  Scheduled (cron)    │   │
│  │  (UI button)  │    │  (node-cron)         │   │
│  └──────┬───────┘    └──────────┬───────────┘   │
│         │                       │                │
│         └───────────┬───────────┘                │
│                     ▼                            │
│         ┌───────────────────────┐                │
│         │    Backup Service     │                │
│         │  (pg_dump wrapper)    │                │
│         └───────────┬───────────┘                │
│                     │                            │
│                     ▼                            │
│         ┌───────────────────────┐                │
│         │  Backup File (.sql)   │                │
│         │  Timestamped name     │                │
│         │  Compressed (.gz)     │                │
│         └───────────┬───────────┘                │
│                     │                            │
│                     ▼                            │
│         ┌───────────────────────┐                │
│         │  Backup Directory     │                │
│         │  D:\Backups\HomeConnect│               │
│         └───────────────────────┘                │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │          Retention Policy                │   │
│  │  • Keep last 7 daily backups             │   │
│  │  • Keep last 4 weekly backups            │   │
│  │  • Keep last 12 monthly backups          │   │
│  │  • Delete older backups automatically    │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 12.2 Backup Details

| Feature | Implementation |
|---|---|
| **Format** | `pg_dump` custom format (`.sql.gz`) |
| **Naming** | `homeconnect_YYYY-MM-DD_HH-mm-ss.sql.gz` |
| **Location** | Configurable, default `D:\Backups\HomeConnect\` |
| **Schedule** | Configurable via settings UI (default: daily at 2:00 AM if PC is on) |
| **Manual** | One-click button in Settings > Backup |
| **Retention** | 7 daily, 4 weekly, 12 monthly (configurable) |
| **Logging** | Every backup logged in `backup_logs` table |
| **Notifications** | Toast notification on success/failure |

### 12.3 Restore Workflow

1. User navigates to Settings > Backup > Restore
2. Selects backup file from list or file browser
3. System displays backup metadata (date, size, tables)
4. **Confirmation dialog** with clear warning about data overwrite
5. System creates a **pre-restore backup** automatically
6. System runs `pg_restore` with the selected file
7. System runs pending Prisma migrations (if schema version mismatch)
8. System restarts the Express server
9. User is redirected to login page
10. Success/failure notification displayed

> [!CAUTION]
> Restore operations overwrite the entire database. The pre-restore automatic backup ensures recovery if the restore file is corrupted.

### 12.4 Backup Verification

- After each backup, verify file integrity by checking file size > 0
- Monthly integrity check: attempt `pg_restore --list` on latest backup to validate structure
- Log warnings if backup file size drops significantly compared to previous backups

---

## 13. Git Workflow

### 13.1 Branch Strategy

```
main (production-ready)
  │
  ├── develop (integration branch)
  │     │
  │     ├── feature/phase-2-auth
  │     ├── feature/phase-3-customers
  │     ├── feature/add-search-filter
  │     │
  │     ├── bugfix/fix-balance-calculation
  │     │
  │     └── refactor/extract-report-service
  │
  └── hotfix/critical-data-fix (emergency patches to main)
```

### 13.2 Branch Naming Convention

| Type | Pattern | Example |
|---|---|---|
| Feature | `feature/<short-description>` | `feature/phase-3-customers` |
| Bug fix | `bugfix/<short-description>` | `bugfix/fix-negative-balance` |
| Hotfix | `hotfix/<short-description>` | `hotfix/fix-login-crash` |
| Refactor | `refactor/<short-description>` | `refactor/extract-report-service` |

### 13.3 Commit Convention

Follow **Conventional Commits**:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | Usage |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code restructure, no behavior change |
| `test` | Adding or updating tests |
| `chore` | Build, config, dependency updates |
| `perf` | Performance improvement |
| `db` | Database migration or schema change |

Examples:
```
feat(customers): add customer search by phone number
fix(transactions): correct running balance calculation for adjustments
db(schema): add index on transactions.customer_id
chore(deps): upgrade prisma to 5.20.0
```

### 13.4 Workflow Rules

1. **Never commit directly to `main`** — always merge from `develop`
2. **Never commit directly to `develop`** — always merge from feature branches
3. **Always create a feature branch** for each phase or feature
4. **Squash merge** feature branches into `develop` for clean history
5. **Merge** (no squash) `develop` into `main` for releases to preserve phase history
6. **Tag** every release on `main` with semantic version (`v1.0.0`, `v1.1.0`)
7. **Delete** feature branches after merge
8. **Run tests** before merging into `develop`

### 13.5 Database Migration Git Rules

1. **Never edit a migration** that has been committed to `develop` or `main`
2. **Never delete a migration** — create a new one to reverse changes
3. **Commit migration files** together with the code that depends on them
4. **Include migration in the same feature branch** as the schema change

---

## 14. Release Strategy

### 14.1 Versioning

Follow **Semantic Versioning** (SemVer):

```
MAJOR.MINOR.PATCH

1.0.0 — First release (Customer Debt Management)
1.1.0 — New feature (e.g., enhanced reports)
1.1.1 — Bug fix
2.0.0 — Breaking change (e.g., major redesign, schema change requiring manual migration)
```

### 14.2 Release Process

```
1. Complete all phase work on feature branch
2. Merge feature branch → develop
3. Test on develop branch thoroughly
4. Create release branch: release/v1.x.0
5. Final testing, bug fixes on release branch
6. Merge release branch → main
7. Tag: git tag -a v1.x.0 -m "Release v1.x.0"
8. Build Electron distributable: npm run build:electron
9. Run database migrations: npx prisma migrate deploy
10. Create backup of production database BEFORE deploying
11. Deploy (replace executable on business PC)
12. Merge release branch → develop (sync any release fixes)
13. Delete release branch
```

### 14.3 Safe Update Process

Since the business PC is also the dev machine:

1. **Before any update**: Run manual backup via the app UI
2. **Pull latest changes**: `git pull origin main`
3. **Run migrations**: `npx prisma migrate deploy`
4. **Build**: `npm run build`
5. **Test**: Verify the app launches and data is intact
6. **Rollback plan**: If update fails, restore from backup

> [!WARNING]
> Always create a database backup before applying updates that include database migrations. Keep the previous Electron build as a fallback.

---

## 15. Future Expansion Strategy

### 15.1 Module Architecture

Every future module follows the same pattern established in Version 1:

```
src/server/features/<module>/
  ├── <module>.routes.ts
  ├── <module>.service.ts
  ├── <module>.repository.ts
  ├── <module>.validator.ts
  └── <module>.types.ts

src/renderer/features/<module>/
  ├── pages/
  ├── components/
  ├── hooks/
  └── api/
```

### 15.2 Future Schema Extensions

The Version 1 schema includes forward-looking design decisions:

| Decision | Supports |
|---|---|
| `branchId` nullable column | Multi-branch support without migration |
| `metadata` JSON column on transactions | Extensible transaction data (invoice #, PO #) |
| `referenceNumber` on transactions | Invoice and PO linking |
| `settings` key-value table | Any future configuration without schema changes |
| `activity_logs` generic entity tracking | Audit trail for any entity type |
| UUIDs everywhere | Distributed IDs, future sync between branches |

### 15.3 Future Database Tables (Preview)

These tables will be added in future phases. Showing them here to demonstrate that the Version 1 schema was designed to accommodate them:

```
products          → id, name, sku, barcode, categoryId, price, cost, ...
categories        → id, name, parentId, ...
inventory         → id, productId, branchId, quantity, reorderLevel, ...
inventory_movements → id, productId, type, quantity, referenceId, ...
suppliers         → id, name, phone, address, ...
purchase_orders   → id, supplierId, status, totalAmount, ...
purchase_order_items → id, orderId, productId, quantity, unitPrice, ...
invoices          → id, customerId, transactionId, items, total, ...
invoice_items     → id, invoiceId, productId, quantity, unitPrice, ...
expenses          → id, categoryId, amount, date, description, ...
expense_categories → id, name, ...
branches          → id, name, address, isActive, ...
accounts          → id, name, type, code, ...  (chart of accounts)
journal_entries   → id, date, description, ...
journal_lines     → id, entryId, accountId, debit, credit, ...
```

### 15.4 Hardware Integration Strategy

| Device | Integration Approach |
|---|---|
| **USB Barcode Scanner** | Scanners act as keyboard input by default. The POS module will have a focused input field that captures barcode data. No driver required. |
| **Receipt Printer** | Electron's `webContents.print()` API for basic printing. For thermal receipt printers (e.g., Epson TM series), use the `escpos` npm package or `node-thermal-printer` via Electron IPC. |

---

## 16. Risks & Recommendations

### 16.1 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Data loss** (hardware failure) | Medium | Critical | Automated backups, backup to external drive/USB |
| **Single point of failure** (one PC) | High | Critical | Regular off-site backup copies (USB drive, cloud sync folder) |
| **PostgreSQL corruption** | Low | Critical | WAL mode enabled, backup verification, restore testing |
| **Dev machine = production machine** | High | High | Disciplined Git workflow, never work on `main` branch, always backup before updates |
| **Schema migration failure** | Low | High | Two-step migration strategy, pre-update backups, migration testing on `develop` branch |
| **Performance degradation at scale** | Low | Medium | Indexed queries, pagination, lazy loading, materialized balance cache when needed |
| **Scope creep in Version 1** | High | Medium | Strict phase discipline — ship only debt management first |
| **Password recovery** (forgotten admin password) | Medium | Medium | Documented CLI password reset tool, admin can reset employee passwords |

### 16.2 Recommendations

1. **Invest in TypeScript**: The upfront cost is small, the long-term benefit for financial software is massive. Type errors caught at compile time prevent runtime bugs in balance calculations.

2. **External backup copy**: Configure a secondary backup location on a USB drive or a synced cloud folder (e.g., Google Drive, OneDrive). This protects against hardware failure.

3. **Test database seeds**: Create a comprehensive seed script with realistic test data (100+ customers, 1000+ transactions) to test performance and report accuracy during development.

4. **UPS (Uninterruptible Power Supply)**: If the business doesn't already have one, recommend a UPS for the business PC to prevent data corruption from power outages during database writes.

5. **Documentation**: Maintain a user guide (separate from this technical document) that the business owner and employees can reference for daily operations.

6. **Monitoring**: Even on a local system, implement basic health monitoring — disk space warnings, database connection checks, backup status indicators on the dashboard.

---

## 17. Development Roadmap

---

### Phase 1 — Project Foundation

**Objective:** Set up the development environment, project structure, tooling, and database connection. Establish all conventions that every subsequent phase will follow.

**Features:**
- Initialize Git repository with `.gitignore`
- Initialize npm project with all dependencies
- Configure Vite for React
- Configure Tailwind CSS
- Configure TypeScript (recommended)
- Configure ESLint + Prettier
- Configure path aliases (`@server/`, `@renderer/`)
- Set up Prisma with PostgreSQL connection
- Create initial Prisma schema (users table only)
- Run first migration
- Set up Express server with health check endpoint
- Set up Winston logger
- Set up global error handling middleware
- Create Electron main process boilerplate
- Create preload script with context bridge
- Verify Electron launches and loads React app
- Create `.env.example` with all required variables
- Write `README.md` with setup instructions

**Database Changes:**
- Initial Prisma schema with `users` table
- First migration: `init`

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/health` | Health check (returns DB connection status) |

**Frontend Pages:**
- None (just a placeholder "Home Connect" landing screen to verify rendering)

**Backend Services:**
- `prisma.ts` — Prisma client singleton
- `logger.ts` — Winston logger configuration
- `error.middleware.ts` — Global error handler
- `app.ts` — Express app setup

**Testing Checklist:**
- [ ] `npm run dev` starts Vite dev server without errors
- [ ] Express server starts and responds to health check
- [ ] Prisma connects to PostgreSQL
- [ ] Migration runs successfully
- [ ] ESLint and Prettier run without errors
- [ ] Electron app launches and displays React app
- [ ] Git repository initialized with proper `.gitignore`
- [ ] Environment variables loaded correctly

**Completion Criteria:**
- A working Electron window displays the React app
- Express API responds to health check
- Prisma is connected to PostgreSQL with `users` table created
- All tooling (lint, format, build) works
- Clean Git history with initial commit

**Dependencies:** None (this is the foundation)

**Estimated Complexity:** Medium (2–3 days)

---

### Phase 2 — Authentication

**Objective:** Implement secure authentication with admin/employee roles, JWT tokens, and a first-run setup wizard.

**Features:**
- First-run detection (check if any admin user exists)
- Setup wizard page (create first admin account)
- Login page with username/password
- JWT access token (15-minute expiry)
- JWT refresh token (7-day expiry, httpOnly cookie)
- Password hashing with bcrypt (12 rounds)
- Auth middleware (JWT verification on protected routes)
- Role middleware (admin vs. employee)
- Auto-logout after inactivity (configurable timeout)
- Password change functionality
- User CRUD (admin only): create, list, update, deactivate
- Protected route component (React)
- Auth context/store for frontend state
- Login form with validation
- Redirect to dashboard on successful login
- Account lockout after 5 failed attempts

**Database Changes:**
- Complete `users` table with all fields:
  ```
  id, username, password, fullName, role (ADMIN/EMPLOYEE),
  isActive, failedLoginAttempts, lockedUntil,
  createdAt, updatedAt, deletedAt, branchId
  ```
- Seed: default admin account (only for development)

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/setup` | Create first admin (only works if no admin exists) |
| POST | `/api/v1/auth/login` | Login with username/password |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/me` | Get current user profile |
| PUT | `/api/v1/auth/password` | Change own password |
| GET | `/api/v1/users` | List users (admin only) |
| POST | `/api/v1/users` | Create user (admin only) |
| GET | `/api/v1/users/:id` | Get user (admin only) |
| PUT | `/api/v1/users/:id` | Update user (admin only) |
| DELETE | `/api/v1/users/:id` | Deactivate user (admin only) |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Setup | `/setup` | First-run admin creation wizard |
| Login | `/login` | Login form |

**Backend Services:**
- `auth.service.ts` — Login, token generation, password hashing, token refresh
- `auth.validator.ts` — Login/setup Zod schemas
- `auth.middleware.ts` — JWT verification middleware
- `role.middleware.ts` — Role check middleware
- `users.service.ts` — User CRUD operations
- `users.repository.ts` — User database queries
- `users.validator.ts` — User creation/update Zod schemas

**Testing Checklist:**
- [ ] First-run setup creates admin account
- [ ] Login returns valid JWT tokens
- [ ] Invalid credentials return 401
- [ ] Expired tokens are rejected
- [ ] Token refresh works correctly
- [ ] Role middleware blocks unauthorized access
- [ ] Password change works
- [ ] Account lockout after failed attempts
- [ ] Protected routes redirect to login when unauthenticated
- [ ] bcrypt hashing works (verify password on login)

**Completion Criteria:**
- User can create admin account on first launch
- User can log in and access protected routes
- JWT tokens are issued and refreshed correctly
- Role-based access control works for admin vs. employee
- All auth-related errors handled gracefully

**Dependencies:** Phase 1

**Estimated Complexity:** Medium-High (3–4 days)

---

### Phase 3 — Customer Management

**Objective:** Implement full customer CRUD with search, pagination, and a customer profile page. This is the foundation for the debt management system.

**Features:**
- Customer list page with pagination and sorting
- Add customer form (name, phone, address, notes)
- Edit customer form
- Soft-delete customer with confirmation modal
- Search by name, phone number
- Customer profile page (details + placeholder for transactions)
- Duplicate phone number detection
- App layout shell (sidebar, header, main content area)
- Sidebar navigation
- Toast notification system
- Loading states and empty states

**Database Changes:**
- `customers` table:
  ```
  id, name, phone, address, notes, isActive,
  createdAt, updatedAt, deletedAt, createdBy, branchId
  ```
- Indexes: `name`, `phone`, `deletedAt`

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/customers` | List customers (paginated, sortable, searchable) |
| POST | `/api/v1/customers` | Create customer |
| GET | `/api/v1/customers/:id` | Get customer by ID |
| PUT | `/api/v1/customers/:id` | Update customer |
| DELETE | `/api/v1/customers/:id` | Soft-delete customer |
| GET | `/api/v1/customers/search` | Search by name/phone |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Customer List | `/customers` | Paginated, searchable list |
| Customer Profile | `/customers/:id` | Customer details (tabs for info, transactions) |

**Backend Services:**
- `customers.service.ts` — Customer CRUD, search, pagination
- `customers.repository.ts` — Customer database queries
- `customers.validator.ts` — Customer creation/update Zod schemas

**Frontend Components:**
- `AppLayout.tsx` — Main layout shell with sidebar and header
- `Sidebar.tsx` — Navigation sidebar
- `Header.tsx` — Top header with user info and logout
- `CustomerForm.tsx` — Add/edit customer form
- `CustomerCard.tsx` — Customer list item
- `CustomerSearch.tsx` — Search input with debounce
- `CustomerDeleteModal.tsx` — Confirmation dialog
- `Table.tsx`, `Pagination.tsx`, `Modal.tsx` — Reusable UI components
- `Toast.tsx` — Notification system

**Testing Checklist:**
- [ ] Create customer with all fields
- [ ] Edit customer updates correctly
- [ ] Soft-delete hides customer from list but preserves in database
- [ ] Search by name returns correct results
- [ ] Search by phone returns correct results
- [ ] Pagination works correctly
- [ ] Duplicate phone detection shows warning
- [ ] Form validation prevents empty required fields
- [ ] Customer profile page loads correctly
- [ ] Sidebar navigation works

**Completion Criteria:**
- Full customer CRUD working through the UI
- Search and pagination functional
- App layout shell (sidebar, header) in place
- Customer profile page shows customer details
- All validation and error handling in place

**Dependencies:** Phase 2

**Estimated Complexity:** Medium-High (3–4 days)

---

### Phase 4 — Customer Ledger & Debt Management ⭐ (Highest Priority)

**Objective:** Implement the transaction ledger system. This is the core business value of the application. Every sale and payment is recorded as an immutable transaction. Balance is always computed from the transaction history.

**Features:**
- Record Sale transaction (customer buys on credit → debt increases)
- Record Payment transaction (customer pays → debt decreases)
- Record Adjustment transaction (corrections by admin)
- Transaction history per customer with running balance
- Current balance displayed on customer profile
- Transaction form with validation
- Transaction list with filters (date range, type)
- Running balance column in transaction history
- Customer balance shown in customer list
- Debt indicator badges (green = no debt, red = has debt)
- Quick-add transaction from customer profile
- Transaction immutability (no edit/delete)

**Database Changes:**
- `transactions` table:
  ```
  id, customerId, type (SALE/PAYMENT/ADJUSTMENT), amount (DECIMAL 12,2),
  description, date, referenceNumber, metadata (JSON),
  createdBy, createdAt, branchId
  ```
- `activity_logs` table:
  ```
  id, userId, action, entityType, entityId, details (JSON),
  ipAddress, createdAt, branchId
  ```
- Indexes: `customerId`, `date`, `type`, `(customerId, date)` composite

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/transactions` | Create transaction |
| GET | `/api/v1/transactions` | List transactions (paginated, filtered) |
| GET | `/api/v1/transactions/:id` | Get transaction details |
| GET | `/api/v1/customers/:id/transactions` | Get customer transaction history |
| GET | `/api/v1/customers/:id/balance` | Get customer current balance |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Customer Profile | `/customers/:id` | Enhanced with transaction tab |

**Frontend Components (New):**
- `TransactionForm.tsx` — Record sale/payment/adjustment
- `TransactionList.tsx` — Transaction history table
- `RunningBalance.tsx` — Running balance display
- `BalanceBadge.tsx` — Color-coded balance indicator
- `TransactionFilter.tsx` — Date range and type filters

**Backend Services:**
- `transactions.service.ts` — Transaction creation, balance calculation, history retrieval
- `transactions.repository.ts` — Transaction queries, running balance computation
- `transactions.validator.ts` — Transaction Zod schemas (amount > 0, valid type, etc.)

**Key Business Logic:**

```
Balance Calculation:
  SUM(SALE amounts) - SUM(PAYMENT amounts) + SUM(ADJUSTMENT amounts)
  where ADJUSTMENT can be positive (increase debt) or negative (decrease debt)

Running Balance:
  For each transaction ordered by date ASC:
    running_balance = previous_running_balance + signed_amount
  where:
    SALE → +amount
    PAYMENT → -amount
    ADJUSTMENT → +amount (signed, can be negative)

Transaction Immutability:
  - No UPDATE or DELETE endpoints
  - Corrections via ADJUSTMENT type only
  - All adjustments require description (reason)
  - Only admins can create adjustments
```

**Testing Checklist:**
- [ ] Create SALE transaction increases customer balance
- [ ] Create PAYMENT transaction decreases customer balance
- [ ] Create ADJUSTMENT transaction modifies balance correctly
- [ ] Running balance calculated correctly across all transaction types
- [ ] Customer balance displayed correctly on profile
- [ ] Customer balance displayed correctly in customer list
- [ ] Transaction history shows all transactions in chronological order
- [ ] Date range filter works correctly
- [ ] Type filter works correctly
- [ ] Transaction form validates amount > 0
- [ ] Transaction form validates required fields
- [ ] Transactions are immutable (no edit/delete endpoints)
- [ ] Only admin can create ADJUSTMENT transactions
- [ ] Activity log records all transactions
- [ ] Edge case: first transaction for a customer
- [ ] Edge case: payment exactly equals balance (zero balance)
- [ ] Edge case: very large numbers (up to 999,999,999.99)
- [ ] Edge case: concurrent transactions (database-level safety)

**Completion Criteria:**
- Complete transaction ledger system working through the UI
- Balances computed correctly from transaction history
- Running balance displayed in transaction history
- Customer list shows current balance
- Activity logging for all transactions
- All edge cases handled

**Dependencies:** Phase 3

**Estimated Complexity:** High (4–5 days)

---

### Phase 5 — Dashboard

**Objective:** Build the main dashboard that gives the business owner an at-a-glance view of the business's debt status and recent activity.

**Features:**
- Total customers count
- Customers with outstanding debt count
- Total outstanding debt amount
- Payments received today
- Payments received this month
- Sales (new debt) today
- Sales (new debt) this month
- Recent activity feed (last 20 actions)
- Quick-action buttons (Add Customer, Record Sale, Record Payment)
- Auto-refresh (TanStack Query polling, every 30 seconds)
- Responsive card layout
- Animated counters

**Database Changes:**
- None (dashboard queries existing tables)

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/dashboard/summary` | All dashboard metrics |
| GET | `/api/v1/dashboard/recent-activity` | Recent activity feed |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` (or `/dashboard`) | Main dashboard |

**Frontend Components:**
- `DashboardPage.tsx` — Dashboard layout
- `StatCard.tsx` — Metric display card (with icon, label, value, trend)
- `RecentActivity.tsx` — Activity feed list
- `QuickActions.tsx` — Action buttons
- `AnimatedCounter.tsx` — Animated number display

**Backend Services:**
- `dashboard.service.ts` — Aggregation queries for all metrics
  - Total customers: `COUNT(customers WHERE deletedAt IS NULL)`
  - Customers with debt: Subquery with `HAVING balance > 0`
  - Total outstanding debt: Sum of all positive customer balances
  - Today's payments: `SUM(amount WHERE type=PAYMENT AND date=today)`
  - This month's payments: `SUM(amount WHERE type=PAYMENT AND date within current month)`

**Testing Checklist:**
- [ ] All metrics display correct values
- [ ] Dashboard loads in < 1 second with test data
- [ ] Recent activity shows latest actions
- [ ] Quick-action buttons navigate to correct pages
- [ ] Auto-refresh updates metrics
- [ ] Zero-state: all metrics show 0 when no data exists
- [ ] Metrics handle large numbers correctly (formatting)

**Completion Criteria:**
- Dashboard displays all required metrics accurately
- Recent activity feed shows last 20 actions
- Quick actions work
- Dashboard is the landing page after login

**Dependencies:** Phase 4

**Estimated Complexity:** Medium (2–3 days)

---

### Phase 6 — Reports

**Objective:** Implement all reporting features including PDF/Excel export and print functionality.

**Features:**
- Customers with debt report (table with name, phone, balance)
- Individual customer statement (date range, all transactions, running balance)
- Monthly debt report (new debt by month, with totals)
- Monthly payment report (payments received by month, with totals)
- Highest debt customers ranking (top N)
- Monthly summary report:
  - Customer Name, Phone Number, Current Debt
  - Footer: Total customers with debt, Total outstanding debt
- Date range filters on all reports
- Sorting on all report columns
- Export to Excel (.xlsx)
- Export to PDF
- Print functionality
- Customer statement PDF (branded, professional layout)

**Database Changes:**
- None (reports query existing tables)

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/reports/debt-summary` | Customers with debt |
| GET | `/api/v1/reports/monthly-debt?year=2026&month=7` | Monthly debt report |
| GET | `/api/v1/reports/monthly-payments?year=2026&month=7` | Monthly payment report |
| GET | `/api/v1/reports/highest-debt?limit=20` | Highest debt customers |
| GET | `/api/v1/reports/customer-statement/:id?from=&to=` | Customer statement |
| GET | `/api/v1/reports/monthly-summary?year=2026&month=7` | Monthly summary |
| GET | `/api/v1/export/excel?report=debt-summary&...` | Excel export |
| GET | `/api/v1/export/pdf?report=customer-statement&...` | PDF export |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Reports Hub | `/reports` | Reports index with links to all reports |
| Debt Report | `/reports/debt` | Customers with debt |
| Payment Report | `/reports/payments` | Monthly payments |
| Monthly Report | `/reports/monthly` | Monthly summary |
| Customer Statement | `/reports/statement/:id` | Individual statement |
| Highest Debt | `/reports/highest-debt` | Top debtors |

**Frontend Components:**
- `ReportFilters.tsx` — Date range picker, month/year selector
- `ReportTable.tsx` — Sortable data table for reports
- `ExportButtons.tsx` — Excel, PDF, Print buttons
- `StatementHeader.tsx` — Branded header for customer statement
- `ReportSummaryFooter.tsx` — Totals row at bottom of reports

**Backend Services:**
- `reports.service.ts` — Report data aggregation
- `export.service.ts` — Export orchestration
- `excel.generator.ts` — Excel file generation (SheetJS/xlsx)
- `pdf.generator.ts` — PDF file generation (jsPDF or PDFKit)

**Testing Checklist:**
- [ ] Debt summary report shows all customers with positive balance
- [ ] Customer statement shows correct running balance
- [ ] Monthly debt report aggregates correctly by month
- [ ] Monthly payment report aggregates correctly by month
- [ ] Highest debt report orders correctly
- [ ] Monthly summary report matches specified format
- [ ] Date range filters work on all reports
- [ ] Excel export generates valid .xlsx file
- [ ] PDF export generates valid .pdf file
- [ ] Print function opens system print dialog
- [ ] Reports handle empty data gracefully
- [ ] Reports perform well with large datasets

**Completion Criteria:**
- All 6 report types functional with accurate data
- Export to Excel, PDF, and Print working
- Date range filtering works on all reports
- Customer statement is professionally formatted

**Dependencies:** Phase 4

**Estimated Complexity:** High (4–5 days)

---

### Phase 7 — Backup & Restore

**Objective:** Implement complete backup and restore functionality with scheduling, retention, and UI management.

**Features:**
- Manual backup (one-click)
- Automatic scheduled backup (configurable via UI)
- Restore from backup file
- Backup history list
- Backup file management (delete old backups)
- Retention policy (configurable: daily, weekly, monthly counts)
- Backup location configuration
- Pre-restore automatic backup
- Backup status notifications
- Backup settings page
- Backup health indicator on dashboard

**Database Changes:**
- `backup_logs` table (if not already created):
  ```
  id, filename, filepath, sizeBytes, type (MANUAL/SCHEDULED),
  status (SUCCESS/FAILED), errorMessage, createdAt, createdBy, notes
  ```
- `settings` table entries for backup configuration

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/backup/create` | Create manual backup |
| GET | `/api/v1/backup/list` | List backup history |
| POST | `/api/v1/backup/restore` | Restore from backup |
| DELETE | `/api/v1/backup/:id` | Delete backup file |
| GET | `/api/v1/backup/settings` | Get backup settings |
| PUT | `/api/v1/backup/settings` | Update backup settings |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Backup Management | `/settings/backup` | Backup/restore UI |

**Frontend Components:**
- `BackupHistory.tsx` — List of past backups with status
- `BackupSchedule.tsx` — Schedule configuration form
- `RestoreModal.tsx` — Restore confirmation dialog
- `BackupStatus.tsx` — Dashboard indicator widget

**Backend Services:**
- `backup.service.ts` — Backup creation, restoration, retention management
- `backup.scheduler.ts` — Cron-based scheduled backups (node-cron)

**Implementation Notes:**
- Backup uses `pg_dump` via `child_process.execFile`
- Restore uses `pg_restore` via `child_process.execFile`
- File operations use Electron IPC (main process has file system access)
- Scheduled backups run via `node-cron` in the Express server process
- Backup directory must be configurable (default: `D:\Backups\HomeConnect`)

**Testing Checklist:**
- [ ] Manual backup creates valid database dump
- [ ] Backup file is named with timestamp
- [ ] Backup file is compressed
- [ ] Restore from backup works (data is restored)
- [ ] Pre-restore backup is created automatically
- [ ] Scheduled backup triggers at configured time
- [ ] Retention policy deletes old backups correctly
- [ ] Backup history displays correctly
- [ ] Failed backup logs error details
- [ ] Backup settings can be updated via UI
- [ ] Restore shows confirmation dialog with warnings
- [ ] Dashboard shows last backup status

**Completion Criteria:**
- Manual and scheduled backups working
- Restore from backup working
- Retention policy enforced
- Backup management UI in settings
- All backup operations logged

**Dependencies:** Phase 5 (for dashboard indicator), Phase 2 (admin-only access)

**Estimated Complexity:** Medium-High (3–4 days)

---

### Phase 8 — Electron Packaging

**Objective:** Package the application as a distributable Windows desktop application with proper installer, auto-start for the Express server, and database migration on startup.

**Features:**
- Electron packaging with `electron-builder`
- Windows installer (NSIS or MSI)
- Application icon and branding
- Auto-start Express server on app launch
- Auto-run Prisma migrations on startup
- Splash screen during startup
- System tray integration (minimize to tray)
- Single instance enforcement (prevent multiple app instances)
- Auto-start PostgreSQL check (verify database is running)
- Application menu (File, Edit, Help)
- About dialog with version info
- Dev vs. production mode detection
- Portable mode option (no installation required)

**Database Changes:**
- None

**API Endpoints:**
- None (Electron IPC only)

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Splash Screen | — | Shown during app startup |

**Backend Services:**
- None (Electron main process only)

**Electron Main Process:**
- `window.ts` — Window management, single instance lock
- `startup.ts` — Server startup, migration runner, health checks
- `tray.ts` — System tray icon and menu
- `menu.ts` — Application menu bar
- `updater.ts` — Future: auto-update support

**Testing Checklist:**
- [ ] `npm run build:electron` produces a working executable
- [ ] Installer installs correctly on Windows 10/11
- [ ] App launches and shows splash screen
- [ ] Express server starts automatically
- [ ] Database migrations run on startup
- [ ] App detects if PostgreSQL is not running
- [ ] Single instance enforcement prevents duplicate windows
- [ ] System tray icon works (minimize, restore, quit)
- [ ] App menu includes all expected items
- [ ] About dialog shows correct version
- [ ] Uninstaller removes app cleanly (but preserves data)

**Completion Criteria:**
- Application packaged as a Windows installer
- App launches, starts server, runs migrations, and loads UI
- System tray integration working
- Single instance enforcement working

**Dependencies:** All previous phases

**Estimated Complexity:** Medium-High (3–4 days)

---

### Phase 9 — Barcode Scanner Integration

**Objective:** Integrate USB barcode scanner support for future POS use. Initially, the scanner can be used to scan customer IDs or product barcodes.

**Features:**
- Barcode input capture (keyboard wedge mode)
- Barcode-to-customer lookup
- Barcode field on customer profile (optional, for loyalty cards)
- Scanner configuration settings
- Scan sound feedback
- Scan history log

**Database Changes:**
- Add `barcode` column to `customers` table (nullable, unique)
- Add `barcode` column to future `products` table schema

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/customers/barcode/:barcode` | Lookup customer by barcode |

**Frontend Pages:**
- No new pages (scanner input embedded in existing pages)

**Frontend Components:**
- `BarcodeInput.tsx` — Hidden focused input that captures scanner data
- `ScannerFeedback.tsx` — Visual/audio feedback on scan

**Backend Services:**
- Update `customers.service.ts` — Barcode lookup
- Update `customers.repository.ts` — Barcode query

**Testing Checklist:**
- [ ] Scanner input is captured correctly
- [ ] Barcode lookup returns correct customer
- [ ] Unknown barcode shows appropriate message
- [ ] Scanner works on customer list page
- [ ] Scanner works on POS page (future)
- [ ] Sound feedback plays on scan

**Completion Criteria:**
- USB barcode scanner captures input in the app
- Customer lookup by barcode works

**Dependencies:** Phase 3

**Estimated Complexity:** Low-Medium (1–2 days)

---

### Phase 10 — Receipt Printing

**Objective:** Enable printing of receipts, customer statements, and reports to thermal receipt printers.

**Features:**
- Payment receipt printing
- Customer statement printing
- Report printing (formatted for standard paper)
- Thermal printer support (ESC/POS commands)
- Print preview
- Printer selection (if multiple printers)
- Receipt template configuration
- Business info on receipts (name, phone, address)

**Database Changes:**
- `settings` entries for:
  - Business name, phone, address (for receipt header)
  - Default printer name
  - Receipt footer text

**API Endpoints:**
- None (printing handled via Electron IPC)

**Frontend Components:**
- `ReceiptPreview.tsx` — Print preview component
- `PrintButton.tsx` — Reusable print trigger button

**Electron IPC Handlers:**
- `print.ipc.ts` — Handle print requests from renderer
  - Standard printing: `webContents.print()`
  - Thermal printing: `node-thermal-printer` or `escpos`

**Testing Checklist:**
- [ ] Payment receipt prints correctly on standard printer
- [ ] Payment receipt prints on thermal printer
- [ ] Customer statement prints formatted correctly
- [ ] Print preview displays correct layout
- [ ] Business info appears on receipt header
- [ ] Printer selection works
- [ ] Receipt template renders correctly

**Completion Criteria:**
- Payment receipts can be printed
- Customer statements can be printed
- Thermal printer support working (if hardware available)

**Dependencies:** Phase 4 (transactions), Phase 6 (statements)

**Estimated Complexity:** Medium (2–3 days)

---

### Phase 11 — Inventory Management

**Objective:** Add product catalog, categories, and stock tracking. This lays the foundation for POS.

**Features:**
- Product catalog (name, SKU, barcode, price, cost)
- Product categories (hierarchical)
- Stock levels per product
- Stock movements (in, out, adjustment)
- Low stock alerts
- Product search
- Category management
- Product import (CSV)

**Database Changes:**
- `products` table:
  ```
  id, name, sku, barcode, categoryId, price, cost, unit,
  description, isActive, minStockLevel,
  createdAt, updatedAt, deletedAt, branchId
  ```
- `categories` table:
  ```
  id, name, parentId, sortOrder, isActive,
  createdAt, updatedAt
  ```
- `inventory` table:
  ```
  id, productId, branchId, quantity,
  lastCountedAt, updatedAt
  ```
- `inventory_movements` table:
  ```
  id, productId, type (IN/OUT/ADJUSTMENT), quantity,
  referenceType, referenceId, notes,
  createdBy, createdAt, branchId
  ```

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| CRUD | `/api/v1/products` | Product management |
| CRUD | `/api/v1/categories` | Category management |
| GET | `/api/v1/inventory` | Stock levels |
| POST | `/api/v1/inventory/adjust` | Stock adjustment |
| GET | `/api/v1/inventory/low-stock` | Low stock alerts |
| POST | `/api/v1/products/import` | CSV import |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Products List | `/products` | Product catalog |
| Product Detail | `/products/:id` | Product details + stock |
| Categories | `/products/categories` | Category management |
| Inventory | `/inventory` | Stock overview |

**Testing Checklist:**
- [ ] Product CRUD works
- [ ] Category hierarchy works
- [ ] Stock levels update on movements
- [ ] Low stock alerts trigger correctly
- [ ] Barcode lookup for products works
- [ ] CSV import processes correctly

**Completion Criteria:**
- Product catalog with categories functional
- Stock tracking with movements working
- Low stock alerts configured

**Dependencies:** Phase 3, Phase 9 (barcode)

**Estimated Complexity:** High (4–5 days)

---

### Phase 12 — Point of Sale (POS)

**Objective:** Build a POS interface for processing sales with product scanning, cart management, and receipt printing.

**Features:**
- POS interface (full-screen, optimized for touch)
- Product search and barcode scanning
- Shopping cart
- Multiple payment methods (cash, credit/debt)
- Receipt generation and printing
- Daily sales summary
- Cash register open/close
- Discount support
- Tax calculation (if applicable)
- Link sales to customer accounts (debt)

**Database Changes:**
- `sales` table:
  ```
  id, customerId, userId, subtotal, discount, tax, total,
  paymentMethod, amountPaid, changeGiven, status,
  createdAt, branchId
  ```
- `sale_items` table:
  ```
  id, saleId, productId, quantity, unitPrice, discount, total,
  createdAt
  ```

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/sales` | Process sale |
| GET | `/api/v1/sales` | List sales |
| GET | `/api/v1/sales/:id` | Sale details |
| GET | `/api/v1/sales/daily-summary` | Daily summary |
| POST | `/api/v1/register/open` | Open register |
| POST | `/api/v1/register/close` | Close register |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| POS | `/pos` | POS interface |
| Sales History | `/sales` | Past sales list |
| Daily Summary | `/sales/daily` | Daily sales summary |

**Key Integration:**
- When a sale is made on credit (not paid in cash), automatically create a SALE transaction in the customer ledger
- POS payments against a customer's debt account create PAYMENT transactions

**Testing Checklist:**
- [ ] POS can scan products and add to cart
- [ ] Cart calculations are correct
- [ ] Cash sale processes correctly
- [ ] Credit sale creates customer ledger transaction
- [ ] Receipt prints correctly
- [ ] Daily summary is accurate
- [ ] Register open/close works

**Completion Criteria:**
- POS can process sales with cash or credit
- Credit sales automatically update customer ledger
- Receipts print correctly
- Daily summaries are accurate

**Dependencies:** Phase 4, Phase 9, Phase 10, Phase 11

**Estimated Complexity:** Very High (5–7 days)

---

### Phase 13 — Accounting Foundation

**Objective:** Lay the foundation for double-entry accounting. This phase introduces a chart of accounts, journal entries, and basic financial reports.

**Features:**
- Chart of accounts (assets, liabilities, equity, revenue, expenses)
- Journal entries (double-entry)
- Automatic journal entries from transactions
- Trial balance report
- Income statement
- Balance sheet (basic)
- Account ledger view
- Fiscal year configuration

**Database Changes:**
- `accounts` table:
  ```
  id, code, name, type (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE),
  parentId, isActive, description, normalBalance (DEBIT/CREDIT),
  createdAt, updatedAt, branchId
  ```
- `journal_entries` table:
  ```
  id, date, description, referenceType, referenceId,
  status (DRAFT/POSTED), createdBy, createdAt, branchId
  ```
- `journal_lines` table:
  ```
  id, journalEntryId, accountId, debit, credit, description,
  createdAt
  ```

**API Endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| CRUD | `/api/v1/accounts` | Chart of accounts |
| CRUD | `/api/v1/journal-entries` | Journal entries |
| GET | `/api/v1/accounting/trial-balance` | Trial balance |
| GET | `/api/v1/accounting/income-statement` | Income statement |
| GET | `/api/v1/accounting/balance-sheet` | Balance sheet |

**Frontend Pages:**

| Page | Route | Description |
|---|---|---|
| Chart of Accounts | `/accounting/accounts` | Account management |
| Journal Entries | `/accounting/journal` | Journal entry list |
| Trial Balance | `/accounting/trial-balance` | Trial balance report |
| Income Statement | `/accounting/income-statement` | P&L report |
| Balance Sheet | `/accounting/balance-sheet` | Balance sheet |

**Key Integration:**
- Every customer transaction (sale/payment) automatically generates a journal entry
  - Sale: Debit Accounts Receivable, Credit Sales Revenue
  - Payment: Debit Cash, Credit Accounts Receivable
- POS cash sale: Debit Cash, Credit Sales Revenue
- Expense: Debit Expense Account, Credit Cash

**Testing Checklist:**
- [ ] Chart of accounts with default accounts created
- [ ] Manual journal entries balance (debits = credits)
- [ ] Auto-generated journal entries from transactions
- [ ] Trial balance balances (total debits = total credits)
- [ ] Income statement calculates net income correctly
- [ ] Balance sheet equation holds (A = L + E)
- [ ] Account ledger shows all entries for an account

**Completion Criteria:**
- Chart of accounts configured
- Journal entries (manual and automatic) working
- Basic financial reports (trial balance, income statement, balance sheet) generating correctly
- All entries follow double-entry accounting rules

**Dependencies:** Phase 4, Phase 12

**Estimated Complexity:** Very High (5–7 days)

---

## Appendix A — Environment Variables

```env
# Database
DATABASE_URL="postgresql://homeconnect:password@localhost:5432/homeconnect"

# Server
PORT=3001
NODE_ENV=development

# Authentication
JWT_SECRET=your-secret-key-min-32-characters
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12

# Backup
BACKUP_DIR=D:\Backups\HomeConnect
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=12
BACKUP_SCHEDULE_CRON=0 2 * * *

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# App
APP_NAME=Home Connect
APP_VERSION=1.0.0
```

## Appendix B — Recommended VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense",
    "mikestead.dotenv",
    "yoavbls.pretty-ts-errors",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

## Appendix C — PostgreSQL Setup Checklist

1. Download PostgreSQL 16.x from https://www.postgresql.org/download/windows/
2. Install with default settings, set a master password
3. Add `pg_dump` and `pg_restore` to system PATH
4. Create database:
   ```sql
   CREATE USER homeconnect WITH PASSWORD 'your-secure-password';
   CREATE DATABASE homeconnect OWNER homeconnect;
   GRANT ALL PRIVILEGES ON DATABASE homeconnect TO homeconnect;
   ```
5. Update `.env` with the connection string
6. Run `npx prisma migrate dev` to apply schema

## Appendix D — Phase Dependency Graph

```
Phase 1 (Foundation)
  └── Phase 2 (Auth)
        └── Phase 3 (Customers)
              ├── Phase 4 (Ledger) ⭐
              │     ├── Phase 5 (Dashboard)
              │     │     └── Phase 7 (Backup)
              │     ├── Phase 6 (Reports)
              │     │     └── Phase 10 (Printing)
              │     └── Phase 12 (POS)
              │           └── Phase 13 (Accounting)
              └── Phase 9 (Barcode)
                    └── Phase 11 (Inventory)
                          └── Phase 12 (POS)

Phase 8 (Electron Packaging) — depends on all Phases 1–7
```

## Appendix E — Estimated Timeline Summary

| Phase | Name | Complexity | Est. Days |
|---|---|---|---|
| 1 | Project Foundation | Medium | 2–3 |
| 2 | Authentication | Medium-High | 3–4 |
| 3 | Customer Management | Medium-High | 3–4 |
| 4 | Customer Ledger ⭐ | High | 4–5 |
| 5 | Dashboard | Medium | 2–3 |
| 6 | Reports | High | 4–5 |
| 7 | Backup & Restore | Medium-High | 3–4 |
| 8 | Electron Packaging | Medium-High | 3–4 |
| **Total V1** | **Phases 1–8** | — | **24–32 days** |
| 9 | Barcode Scanner | Low-Medium | 1–2 |
| 10 | Receipt Printing | Medium | 2–3 |
| 11 | Inventory | High | 4–5 |
| 12 | POS | Very High | 5–7 |
| 13 | Accounting Foundation | Very High | 5–7 |
| **Total All** | **Phases 1–13** | — | **41–56 days** |

---

> **Document Status:** Ready for review  
> **Next Step:** Upon approval, begin Phase 1 — Project Foundation  
> **Author:** Home Connect Technical Architecture Team  
> **Last Updated:** 2026-07-23
