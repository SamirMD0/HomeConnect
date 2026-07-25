# Phase 11 Electron Desktop Design

## Goal

Package HomeConnect as a local Windows desktop application while preserving the existing React, Express, Prisma, and PostgreSQL architecture.

The desktop application is designed to start local services, open the React UI automatically, connect to local PostgreSQL, and shut down without leaving backend or frontend child processes running.

Backup and restore are intentionally out of scope for this Electron desktop phase.

## Runtime Architecture

Electron owns the desktop shell and process lifecycle.

- Electron main process: `desktop/src/index.ts`
- Secure window creation: `desktop/src/window.ts`
- Minimal preload bridge: `desktop/src/preload.ts`
- Shared local runtime constants: `desktop/src/runtime-config.ts`
- Backend child process startup: `desktop/src/backend-process.ts`
- Production static frontend server: `desktop/src/static-frontend-server.ts`
- Readiness polling: `desktop/src/readiness.ts`
- Lifecycle helpers: `desktop/src/lifecycle.ts`

The renderer does not receive database credentials, JWT secrets, unrestricted filesystem access, or Node APIs.

## Security Model

The BrowserWindow is created with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- explicit preload script
- no unrestricted IPC
- no disabled `webSecurity`
- denied new-window handling

Only a minimal `ping` preload API is exposed.

## Local Services

All local services bind to `127.0.0.1`.

- Backend: `http://127.0.0.1:3001`
- Frontend: `http://127.0.0.1:3002`
- Backend API base URL: `http://127.0.0.1:3001/api/v1`
- Backend health check: `http://127.0.0.1:3001/api/v1/health`

The app does not bind to `0.0.0.0`.

## Development Mode

`npm run dev:electron` starts:

1. Express backend on `127.0.0.1:3001`
2. Vite frontend on `127.0.0.1:3002`
3. Electron after both services are ready

Development mode does not spawn production backend or static frontend processes.

## Production Mode

Production mode starts the compiled backend using safe `child_process.spawn` argument arrays with `shell: false`.

The built React frontend is served over local HTTP instead of `file://` because authentication uses credentialed requests and an HTTP-only refresh cookie.

The production Electron window loads:

```text
http://127.0.0.1:3002
```

In packaged builds, the compiled backend and built frontend are copied to real filesystem resources:

- `resources/dist/server/backend`
- `resources/frontend/dist`

The backend process receives Electron-safe runtime environment values, including local CORS origins, writable config and log directories, and packaged `NODE_PATH` entries for runtime dependency resolution.

## Authentication And CORS

The backend allows credentialed local desktop origins:

- `http://localhost:3002`
- `http://127.0.0.1:3002`

Refresh cookies remain HTTP-only. Local Electron production sets `COOKIE_SECURE=false` because the frontend and backend communicate over local HTTP.

## Writable Paths

Electron passes `app.getPath("userData")` to the backend.

The backend receives:

- `HOME_CONNECT_USER_DATA`
- `HOME_CONNECT_CONFIG_DIR`
- `LOG_DIR`

This keeps runtime data and logs outside the application install directory.

## Packaging Design

Electron Builder is configured for Windows NSIS packaging.

Expected outputs:

- Unpacked app: `release/1.0.1/win-unpacked/HomeConnect.exe`
- Installer: `release/1.0.1/HomeConnect-Setup-1.0.1.exe`

The build configuration includes:

- compiled Electron files
- built frontend
- built backend
- production dependencies
- Prisma Client
- Prisma Windows engine files

It excludes:

- `.env`
- secrets
- tests
- documentation
- Git files
- local backups
- unnecessary source/test artifacts

Prisma runtime files are configured for `asarUnpack`, and the generated `.prisma/client` runtime is copied explicitly into `resources/app.asar.unpacked/node_modules/.prisma/client`.

The compiled backend and built frontend are configured as `extraResources` because the backend child process and local static frontend server both run most safely from the real filesystem.

## Packaging Fix

Electron Builder previously stalled in this environment during dependency discovery/copy after logging:

```text
searching for node modules
duplicate dependency references
```

The root cause was the root `package.json` production dependency list. It included frontend/build-only packages and the Prisma CLI, so Electron Builder walked a much larger production dependency graph than the packaged backend runtime needs.

The fix keeps only backend runtime packages in `dependencies`, moves frontend/build-only packages to `devDependencies`, removes broad Prisma CLI packaging, excludes `release/`, and uses explicit resource entries for backend, frontend, and generated Prisma runtime files.
