# Home Connects

Local Windows business management system built with React, Electron, Express, Prisma, and PostgreSQL. It covers customers, financial obligations, receivables, reporting, backups, product identity, and maintenance/service jobs.

The backend-authoritative ERP dashboard adds customer, supplier, maintenance, and product analytics; an exception center; live-recomputed month-end controls; recent activity; bilingual labels; and an ERP module roadmap. See [Dashboard Information Architecture](docs/ERP_DASHBOARD_INFORMATION_ARCHITECTURE.md) and [Analytics Data Flow](docs/DASHBOARD_ANALYTICS_DATA_FLOW.md).

Products support sequence-generated SKUs, scanner lookup, auto-fit labels with optional selling price and staff code, basic recorded stock fields, and ordered specifications. See [Product Label Printing](docs/setup/PRODUCT_LABEL_PRINTING.md) and [Product SKU Policy](docs/project/PRODUCT_SKU_POLICY.md).

## Prerequisites
- Node.js (v20 or higher)
- PostgreSQL (v16 or higher)

## Setup
1. Clone the repository
2. Run `npm install`
3. Copy `.env.example` to `.env` and configure your database credentials
4. Run `npx prisma migrate deploy --schema backend/prisma/schema.prisma` to apply the committed database migrations
5. (Optional) Run `npx prisma db seed` to create the initial admin user

## Development
- `npm run dev`: Starts the Vite frontend and Express backend concurrently.
- `npm run dev:electron`: Compiles the main process and launches the Electron shell.

## Maintenance And Service

- Service jobs always use an existing customer.
- Jobs may link to a Product or store manual product text.
- Sensitive corrections require an administrator's account password and reason.
- Product labels are available from linked service jobs and print locally through Electron.
- Service prices are informational in v1.0.7 and do not create financial debt.

## Architecture
- `frontend/src`: React renderer (Vite)
- `backend/src`: Express API
- `desktop/src`: Electron main/preload runtime
- `backend/prisma`: PostgreSQL schema and migrations
# Product Pricing Presets

HomeConnect supports reusable pricing formulas under **Pricing Presets / صيغ التسعير**. Administrators can define expenses, profit, discount buffer, installment markup, down payment, installment months, calculation mode, and rounding. Products keep their existing manual `price` and `discount`; calculated cash and installment prices are derived from the stored real cost and are never written into the manual price automatically.

Pricing mutations require an administrator, a reason, and the signed-in administrator's account password. Stored cost is visible only to administrators. Pricing previews are read-only and available to authenticated staff.

No presets are seeded automatically. See `claude/documentation/PRODUCT_PRICING_PRESETS.md` for setup guidance and formula details.
