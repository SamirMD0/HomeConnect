# Home Connect

Business Management System built with React, Electron, Express, Prisma, and PostgreSQL.

## Prerequisites
- Node.js (v20 or higher)
- PostgreSQL (v16 or higher)

## Setup
1. Clone the repository
2. Run `npm install`
3. Copy `.env.example` to `.env` and configure your database credentials
4. Run `npx prisma migrate dev --name init` to create the database schema
5. (Optional) Run `npx prisma db seed` to create the initial admin user

## Development
- `npm run dev`: Starts the Vite frontend and Express backend concurrently.
- `npm run dev:electron`: Compiles the main process and launches the Electron shell.

## Architecture
- `src/renderer`: React frontend (Vite)
- `src/server`: Express backend (API)
- `src/main`: Electron wrapper
- `src/shared`: Shared types and utilities
- `prisma`: Database schema and migrations
