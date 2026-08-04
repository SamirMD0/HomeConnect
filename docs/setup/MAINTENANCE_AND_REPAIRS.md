# Maintenance and repairs

How HomeConnect updates and repairs its own database, and what to do when a
business PC ends up out of step with the app.

---

## Why this exists

A HomeConnect release sometimes needs the database changed — a new table, a new
column. On a development machine that is `prisma migrate deploy`. A business PC
has no Prisma CLI, no repository and nobody who could run one, so previously
those changes were applied by pasting SQL into pgAdmin over the phone.

Worse, a migration that stops half-way leaves the database in a state Prisma
cannot fix by itself: the app returns `P2022` on every financial screen, and
re-running the migration dies on `42710: type already exists`.

Maintenance replaces that with something an admin can run from inside the app.

---

## The two kinds of change

| | Migration | Repair |
|---|---|---|
| Where it comes from | `backend/prisma/migrations/` | `backend/prisma/repair/` |
| Written by | Prisma, from a schema change | By hand, to fix a specific PC |
| Recorded in | `_prisma_migrations` | `repair_history` |
| Safe to re-run | Yes — the runner checks first | Yes — every file is idempotent |

Both are shipped inside the installer. Neither is ever typed in by a user, and
there is no box anywhere in the app that runs SQL you supply.

---

## What happens when you press Apply

In this order, and it stops at the first failure:

1. **Backup tools check.** No `pg_dump` means no backup, which means no repair.
   The button is disabled with the reason shown.
2. **Detection.** Each repair carries a query that answers "has this already
   been done?". Anything already applied is skipped — the filename is never
   what decides.
3. **Backup.** A `PRE_REPAIR` backup is taken and *verified* — the file must
   exist, be non-empty, and be readable by `pg_restore`. If any of that fails,
   nothing is applied.
4. **Apply.** The SQL runs inside one transaction.
5. **Verify.** A second query confirms the expected result. If it does not
   match, the transaction is rolled back — the database returns to exactly
   where it was.
6. **Record.** The outcome is written to history with the backup path, so you
   always know what to roll back to.

Business writes are blocked for the duration, the same as during a restore.

---

## Reading the result

| Status | Meaning |
|---|---|
| **Applied** | Done and verified. |
| **Not needed** | Detection found it was already applied. |
| **Blocked** | No backup could be taken. **Nothing was changed.** |
| **Verify failed** | The SQL ran but produced the wrong result, so it was rolled back. Send diagnostics. |
| **Failed** | The SQL itself errored and was rolled back. Send diagnostics. |

The last twenty outcomes are listed at the bottom of the Maintenance panel with
who applied them and which backup was taken.

---

## Preflight

**Run Preflight Check** inspects the machine and changes nothing. It reports on
the configuration file, required settings, the database address (including the
`@`-in-password trap), connectivity, the database name, expected tables and
columns, backup tools, and whether the database user may install extensions.

Every non-passing row states what to do about it.

> **Why the extension check matters:** customer search needs `pg_trgm`, which
> PostgreSQL only lets a superuser install. If the configured user cannot, that
> update fails part-way — exactly the situation this feature exists to prevent.
> Preflight catches it before anything is applied.

---

## Rules the code enforces

- No `DROP`, `TRUNCATE` or `DELETE` statement is allowed in a bundled file, and
  no column type change. The loader rejects the file rather than running it.
- An `UPDATE` is permitted in only two shapes: migration bookkeeping, and
  backfilling a column that was just added (`WHERE "col" IS NULL`), which by
  definition cannot overwrite an existing value.
- Every file's SHA-256 is checked against the manifest before it runs. A
  mismatch means the file was altered after review and is refused — reinstall.
- Applying anything requires an administrator **and** re-entry of the account
  password, which is rate-limited and logged.

---

## Diagnostics

**Export Diagnostics** produces a `.zip` containing versions, environment
*presence* (`set` / `missing`, never values), the preflight report, migration
and repair status, repair history, backup metadata, and a redacted tail of the
error log.

It contains no passwords, no connection string with credentials, and no
customer, debt or payment data. The export refuses to build if a real secret
value would have been included.

---

## For developers: adding a repair

1. Write the SQL into `backend/prisma/repair/<version>-repair-<what>.sql`.
   Make it idempotent — `IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`.
2. Add an entry to `backend/prisma/repair/manifest.json`, including its SHA-256,
   a `detectionQuery` that returns a row once applied, and a `verificationQuery`
   with the count you expect.
3. Run the tests. `sql-safety-scanner.test.ts` and `repair-registry.test.ts`
   check every bundled file, so a mistake fails locally rather than on a shop PC.

Never edit a repair that has already shipped — its checksum is recorded on
machines that ran it. Write a new file for the next version.
