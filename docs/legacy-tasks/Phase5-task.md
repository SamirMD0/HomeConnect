# Phase 5 — Main Dashboard

## Objective
Implement the main dashboard to provide an at-a-glance view of the business's financial position and recent activity.

## 1. Backend Service & Types
- [x] Create `dashboard.types.ts`
  - Define `DashboardSummary` and `ActivityLog` interfaces
- [x] Create `dashboard.service.ts` for aggregations
  - Write complex SQL raw queries for total debt and customers with debt
  - Fetch recent activity logs with user joins

## 2. Backend Routes & Controllers
- [x] Create `dashboard.controller.ts`
- [x] Create `dashboard.routes.ts`
  - Endpoints: `GET /api/v1/dashboard/summary` and `GET /api/v1/dashboard/recent-activity`
- [x] Mount routes in `app.ts`
- [x] Secure endpoints with `requireAuth` middleware

## 3. Frontend API & Types
- [x] Create `types.ts` for dashboard data models
- [x] Create `dashboard.api.ts` for Axios endpoints
- [x] Create custom hooks in `useDashboard.ts`
  - `useDashboardSummary` and `useRecentActivity`
  - Configure 30-second auto-refresh polling

## 4. Frontend Components
- [x] `StatCard.tsx` — Reusable metric display cards
- [x] `RecentActivity.tsx` — Feed of the latest 20 actions from `activity_logs`
- [x] `QuickActions.tsx` — Shortcuts to add customers or record transactions
- [x] `DashboardPage.tsx` — Main landing page combining all components

## 5. Integration
- [x] Update `App.tsx` routes to map `/` to `DashboardPage`
- [x] Ensure Dashboard Layout is fully integrated and responsive
- [x] Fix Vite configuration to prevent auto-increment port shadowing (`strictPort: true`)

## 6. Verification
- [x] Verify total outstanding debt is calculated dynamically from `SALE` and `PAYMENT` transactions
- [x] Verify API correctly fetches and formats recent activity
- [x] Resolve IPv4 vs IPv6 local routing issues (`127.0.0.1` vs `localhost`)
