# Phase 2 — Authentication

**Objective:** Implement secure authentication with admin/employee roles, JWT tokens, and a first-run setup wizard.

**Dependencies:** Phase 1 ✅  
**Estimated Complexity:** Medium-High (3–4 days)

---

## Task 1: Database — Update Users Schema
- [x] Update `users` table in `backend/prisma/schema.prisma` with all fields:
  - `id`, `username`, `password`, `fullName`, `role` (ADMIN/EMPLOYEE)
  - `isActive`, `failedLoginAttempts`, `lockedUntil`
  - `createdAt`, `updatedAt`, `deletedAt`, `branchId`
- [x] Create Prisma migration (`npx prisma migrate dev --name auth-users`)
- [x] Update `backend/prisma/seed.ts` with a dev-only default admin account
- [x] Run `npx prisma generate` to update the client types

---

## Task 2: Backend — Auth Service & Token Management
- [x] Create `backend/src/services/auth.service.ts`:
  - Login logic (username + password verification)
  - JWT access token generation (15-minute expiry)
  - JWT refresh token generation (7-day expiry, httpOnly cookie)
  - Password hashing with bcrypt (12 rounds)
  - Token refresh logic
  - Account lockout after 5 failed attempts
- [x] Create `backend/src/validators/auth.validator.ts`:
  - Login Zod schema (username, password)
  - Setup Zod schema (username, password, fullName)
  - Password change Zod schema (currentPassword, newPassword)

---

## Task 3: Backend — Auth Middleware
- [x] Create `backend/src/middleware/auth.middleware.ts`:
  - Extract JWT from `Authorization: Bearer <token>` header
  - Verify token validity and expiration
  - Attach decoded user to `req.user`
  - Return `401 Unauthorized` for invalid/expired tokens
- [x] Create `backend/src/middleware/role.middleware.ts`:
  - Accept allowed roles as parameter
  - Check `req.user.role` against allowed roles
  - Return `403 Forbidden` for unauthorized roles

---

## Task 4: Backend — Auth API Endpoints
- [x] Create `backend/src/routes/auth.routes.ts`:
  - `POST /api/v1/auth/setup` — Create first admin (only if no admin exists)
  - `POST /api/v1/auth/login` — Login with username/password
  - `POST /api/v1/auth/logout` — Invalidate refresh token
  - `POST /api/v1/auth/refresh` — Refresh access token
  - `GET /api/v1/auth/me` — Get current user profile (protected)
  - `PUT /api/v1/auth/password` — Change own password (protected)
- [x] Create `backend/src/controllers/auth.controller.ts`
- [x] Register auth routes in `backend/src/app.ts`

---

## Task 5: Backend — User CRUD API (Admin Only)
- [x] Create `backend/src/repositories/users.repository.ts`:
  - `findById`, `findByUsername`, `findAll`, `create`, `update`, `softDelete`
- [x] Create `backend/src/services/users.service.ts`:
  - Create user, list users, get user, update user, deactivate user
- [x] Create `backend/src/validators/users.validator.ts`:
  - Create user Zod schema
  - Update user Zod schema
- [x] Create `backend/src/routes/users.routes.ts`:
  - `GET /api/v1/users` — List users (admin only)
  - `POST /api/v1/users` — Create user (admin only)
  - `GET /api/v1/users/:id` — Get user (admin only)
  - `PUT /api/v1/users/:id` — Update user (admin only)
  - `DELETE /api/v1/users/:id` — Deactivate user (admin only)
- [x] Create `backend/src/controllers/users.controller.ts`
- [x] Register user routes in `backend/src/app.ts`

---

## Task 6: Frontend — Auth Context & State Management
- [x] Create `frontend/src/context/AuthContext.tsx`:
  - Store current user, access token, and auth state
  - `login()`, `logout()`, `refreshToken()` methods
  - Auto-refresh token before expiry
  - Auto-logout after configurable inactivity timeout
- [x] Create `frontend/src/hooks/useAuth.ts` — Custom hook to consume AuthContext
- [x] Create `frontend/src/services/api.ts` — Axios instance with interceptors:
  - Attach access token to every request
  - Auto-refresh on 401 response
  - Redirect to `/login` on refresh failure

---

## Task 7: Frontend — Login Page
- [x] Create `frontend/src/pages/Login.tsx`:
  - Username and password fields with validation (react-hook-form + Zod)
  - "Remember me" option
  - Error messages for invalid credentials / locked account
  - Loading state during login
  - Redirect to dashboard on success
- [x] Style the login page (modern, dark theme, premium feel)

---

## Task 8: Frontend — Setup Wizard Page
- [x] Create `frontend/src/pages/Setup.tsx`:
  - First-run detection (call `/api/v1/auth/setup` check)
  - Admin account creation form (username, password, fullName)
  - Password confirmation and strength validation
  - Redirect to `/login` after successful setup
- [x] Style the setup wizard page

---

## Task 9: Frontend — Protected Routes & App Shell
- [x] Create `frontend/src/components/ProtectedRoute.tsx`:
  - Check if user is authenticated
  - Redirect to `/login` if not authenticated
  - Optionally check for required role
- [x] Create `frontend/src/layouts/DashboardLayout.tsx`:
  - Sidebar navigation placeholder
  - Top bar with user info and logout button
  - Main content area
- [x] Set up React Router in `frontend/src/App.tsx`:
  - `/setup` → Setup page (only when no admin exists)
  - `/login` → Login page
  - `/` → Dashboard (protected)

---

## Task 10: Integration Testing & Git
- [ ] Test first-run setup creates admin account
- [ ] Test login returns valid JWT tokens
- [ ] Test invalid credentials return 401
- [ ] Test expired tokens are rejected
- [ ] Test token refresh works correctly
- [ ] Test role middleware blocks unauthorized access
- [ ] Test password change works
- [ ] Test account lockout after 5 failed attempts
- [ ] Test protected routes redirect to login when unauthenticated
- [ ] Test bcrypt hashing works (verify password on login)
- [ ] Git commit on `feature/phase-2-auth` branch
- [ ] Merge into `develop`

---

## Verification (Phase 2 Complete When)
- [ ] User can create admin account on first launch
- [ ] User can log in and access protected routes
- [ ] JWT tokens are issued and refreshed correctly
- [ ] Role-based access control works (admin vs. employee)
- [ ] All auth-related errors are handled gracefully
- [ ] `npm run dev` runs frontend + backend with auth working end-to-end
