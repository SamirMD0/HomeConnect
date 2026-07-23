# Phase 1 — Project Foundation: Tasks

## Task 1: Git & Project Initialization
- [x] Create project directory structure
- [x] Initialize Git repository
- [x] Create `.gitignore` (node_modules, dist, .env, logs, backups, prisma/*.db)
- [x] Initialize `package.json` with project metadata
- [x] Install all dependencies (frontend + backend + dev tooling)

## Task 2: Vite + React + TypeScript Setup
- [x] Configure Vite for React with TypeScript (`vite.config.ts`)
- [x] Create `tsconfig.json` (root), `tsconfig.server.json` (backend), `tsconfig.node.json` (vite/electron)
- [x] Configure path aliases (`@server/`, `@renderer/`, `@shared/`)
- [x] Create React entry point (`src/renderer/main.tsx`, `src/renderer/App.tsx`)
- [x] Create `index.html` with root div
- [x] Create placeholder landing screen ("Home Connect")
- [ ] Verify `npm run dev` starts Vite dev server

## Task 3: Tailwind CSS
- [x] Install Tailwind CSS + PostCSS + Autoprefixer
- [x] Create `tailwind.config.js` with content paths
- [x] Create `postcss.config.js`
- [x] Create `src/renderer/styles/index.css` with Tailwind directives
- [ ] Verify Tailwind classes render in the placeholder page

## Task 4: ESLint + Prettier
- [x] Create `.eslintrc.cjs` with TypeScript + React rules
- [x] Create `.prettierrc` (2-space indent, single quotes, trailing commas)
- [x] Add lint and format scripts to `package.json`
- [ ] Verify `npm run lint` and `npm run format` work

## Task 5: Express Backend
- [x] Create server entry point (`src/server/index.ts`)
- [x] Create Express app configuration (`src/server/app.ts`)
- [x] Create Prisma client singleton (`src/server/lib/prisma.ts`)
- [x] Create Winston logger (`src/server/lib/logger.ts`)
- [x] Create custom error classes (`src/server/lib/errors.ts`)
- [x] Create global error handling middleware (`src/server/middleware/error.middleware.ts`)
- [x] Create request logging middleware (`src/server/middleware/logger.middleware.ts`)
- [x] Create health check route (`GET /api/v1/health`)
- [x] Add dev script for backend (`npm run dev:server`)
- [ ] Verify Express starts and responds to health check

## Task 6: Prisma + PostgreSQL
- [x] Create `prisma/schema.prisma` with `users` table
- [x] Define User model (id, username, password, fullName, role, isActive, timestamps, branchId)
- [x] Define Role enum (ADMIN, EMPLOYEE)
- [ ] Run `npx prisma migrate dev --name init`
- [ ] Verify migration creates table in PostgreSQL
- [x] Create `prisma/seed.ts` (empty scaffold for future seeding)

## Task 7: Electron Shell
- [x] Create Electron main process (`src/main/index.ts`)
- [x] Create window manager (`src/main/window.ts`)
- [x] Create preload script with context bridge (`src/main/preload.ts`)
- [ ] Configure Electron to load Vite dev server in development
- [ ] Configure Electron to load built files in production
- [x] Add `npm run dev:electron` script
- [ ] Verify Electron launches and displays the React placeholder page

## Task 8: Environment & Documentation
- [x] Create `.env.example` with all required variables
- [x] Create `.env` (git-ignored) with local values
- [x] Create `README.md` with setup instructions
- [x] Create `.vscode/settings.json` with workspace settings
- [x] Create `.vscode/extensions.json` with recommended extensions
- [ ] Initial Git commit on `main` branch
- [ ] Create `develop` branch
- [ ] Create `feature/phase-1-foundation` branch

---

## Verification (Phase 1 Complete When)
- [ ] `npm run dev` starts Vite + Express concurrently
- [ ] `npm run dev:electron` launches Electron with React app inside
- [ ] `GET http://localhost:3001/api/v1/health` returns `200 OK`
- [ ] Prisma is connected to PostgreSQL with `users` table
- [ ] ESLint and Prettier run clean
- [ ] Git repository has clean history on `feature/phase-1-foundation`
