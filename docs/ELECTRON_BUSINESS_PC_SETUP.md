# Electron Business PC Setup

This guide is for installing and running HomeConnect as a local Windows desktop application after a successful Windows package is produced.

Current packaging status: the Windows unpacked app and NSIS installer were generated successfully.

## PostgreSQL Requirement

HomeConnect requires a local PostgreSQL server.

Recommended local settings:

- Host: `localhost`
- Port: `5433`
- Database: `homeconnect`
- User: `postgres`
- Password: your local PostgreSQL password

The application does not bundle PostgreSQL.

## Database Creation

Create the database before launching the packaged application.

Example using `psql`:

```powershell
psql -h localhost -p 5433 -U postgres
```

Then run:

```sql
CREATE DATABASE homeconnect;
```

Apply migrations from the repository before using the desktop app:

```powershell
$env:DATABASE_URL = "postgresql://postgres:YOUR_PASSWORD@localhost:5433/homeconnect"
npx prisma migrate deploy --schema backend/prisma/schema.prisma
npx prisma generate --schema backend/prisma/schema.prisma
```

Do not run database reset on a business PC with real data.

## Production Environment Configuration

The packaged backend needs production secrets through environment variables or an external env file.

Required:

```text
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5433/homeconnect
JWT_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-long-random-refresh-secret
```

Recommended for a packaged local Electron runtime:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
FRONTEND_URL=http://127.0.0.1:3002
CORS_ORIGINS=http://localhost:3002,http://127.0.0.1:3002
COOKIE_SECURE=false
```

The backend supports `BACKEND_ENV_FILE`. For a business PC, create an env file outside the install directory, for example:

```text
C:\Users\<User>\AppData\Roaming\HomeConnect\config\production.env
```

Then set a Windows user environment variable:

```powershell
[Environment]::SetEnvironmentVariable("BACKEND_ENV_FILE", "$env:APPDATA\HomeConnect\config\production.env", "User")
```

Restart Windows or sign out/in after setting persistent environment variables.

Do not place `.env` files or secrets inside the renderer, `frontend/dist`, or public assets.

## Application Installation

After packaging succeeds, run the installer:

```text
release\1.0.1\HomeConnect-Setup-1.0.1.exe
```

The installer is configured for a per-user Windows install with Start menu and desktop shortcuts.

## Application Launch

Launch HomeConnect from:

- Start menu shortcut
- desktop shortcut
- installed `HomeConnect.exe`

On launch, the app should:

1. start the backend on `127.0.0.1:3001`
2. serve the built frontend on `127.0.0.1:3002`
3. wait for readiness
4. open the desktop window

## Log Location

The Electron runtime passes a writable user data path to the backend.

Expected log directory:

```text
C:\Users\<User>\AppData\Roaming\HomeConnect\logs
```

If the app fails before logs are created, check whether PostgreSQL is running and whether `BACKEND_ENV_FILE` points to a readable env file.

## Common Startup Errors

Database unavailable:

- PostgreSQL is not running.
- `DATABASE_URL` is missing.
- the database does not exist.
- migrations were not applied.
- the PostgreSQL port is wrong.
- the password in `DATABASE_URL` is wrong.

If startup shows `Compiled Express backend did not become ready within 45s`, check `BACKEND_ENV_FILE` or create:

```text
C:\Users\<User>\AppData\Roaming\HomeConnect\config\production.env
```

That file must include `DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`.

Backend port unavailable:

- another process is using `127.0.0.1:3001`.
- an old backend process was left running.

Frontend port unavailable:

- another process is using `127.0.0.1:3002`.
- a development Vite server is still running.

Blank or failed login screen:

- frontend server did not start.
- backend health check did not become ready.
- local firewall or security software blocked localhost traffic.

## Database Connection Troubleshooting

Check PostgreSQL status:

```powershell
Get-Service *postgres*
```

Check whether the database exists:

```powershell
psql -h localhost -p 5433 -U postgres -l
```

Check the configured connection string:

```powershell
[Environment]::GetEnvironmentVariable("DATABASE_URL", "User")
```

If using `BACKEND_ENV_FILE`, confirm it exists:

```powershell
Test-Path "$env:APPDATA\HomeConnect\config\production.env"
```

Check whether local ports are occupied:

```powershell
Get-NetTCPConnection -LocalPort 3001,3002 -ErrorAction SilentlyContinue
```

## How To Uninstall

Use Windows Settings:

1. Open Settings.
2. Go to Apps.
3. Find HomeConnect.
4. Choose Uninstall.

Uninstalling the app should not delete the PostgreSQL database.

To remove local app logs/config after uninstall, delete:

```text
C:\Users\<User>\AppData\Roaming\HomeConnect
```

Do not delete this folder until you confirm whether it contains configuration or logs you still need.

## Manual Update Process

Automatic updates are not configured yet.

For now:

1. close HomeConnect.
2. install the newer `HomeConnect-Setup-<version>.exe`.
3. apply any required database migrations from the matching repository version.
4. launch HomeConnect again.

Before updating a business PC, confirm that migrations have been reviewed and that PostgreSQL has a current backup.
