# Release Prompt — Version Bump, Installer, DB Repair for the Business PC

Paste everything below the line into Claude Code whenever you want to cut a release.
Fill in the header first. Everything else is the runbook.

---

## Release request

```
Version:        <X.Y.Z>            (or: "decide from the changes")
Release type:   patch | minor | major
What shipped:   <one or two lines — the feature or fix this release contains>
Schema changed: yes | no | unknown
Push to remote: yes | no
```

You are cutting a release of **HomeConnect** (Node/Express + Prisma/Postgres backend, React 19 frontend, Electron desktop shell, NSIS installer, single shop PC running Postgres on port 5433).

Work through the phases in order. **Each phase is a gate — do not start the next one until the current one is clean.** If a gate fails, stop, report the actual output, and wait. Do not work around a failing gate.

## Facts about this repo you must not re-derive incorrectly

- The version lives in **`package.json` only**. `package-lock.json` mirrors it, `__APP_VERSION__` in the frontend and `appVersion` in diagnostics both read from it. There is no other file to edit.
- `release/` is **gitignored**. Installers and any SQL you drop there are *not* in version control. Anything that must survive a machine wipe has to be committed to a tracked path as well.
- Release commits in this repo look like `feat: release HomeConnect 1.1.3` and touch only `package.json`, `package-lock.json`, and any docs whose text the release changed.
- The installer output path is `release/${version}/HomeConnect-Setup-${version}.exe`, configured in `package.json` → `build.directories.output`.
- The business PC has historically had a **missing or drifted `_prisma_migrations` table** (see `docs/phases/phase-02/`). Never assume Prisma's migration history there is healthy. As of the 2026-08-06 diagnostics it held **2 of 25 rows** against a complete schema, because that PC was updated by running repair scripts by hand — only the 1.2.0 and 1.3.0 scripts stamp bookkeeping rows.
- The shop PC connects to database `homeconnect`. The port has been **5433 on some installs and 5432 on others** — read it from `environment.json` in a diagnostics export rather than assuming. See `docs/setup/ELECTRON_BUSINESS_PC_SETUP.md`.
- A repair `.sql` file is only usable in-app if it is **listed in `backend/prisma/repair/manifest.json`**. `RepairRegistry` refuses anything whose SHA-256 does not match the manifest, and reports an unlisted `.sql` as an `ORPHAN_FILE`. A file dropped in `release/` alone can only ever be run by hand in psql/pgAdmin — that is what happened with 1.5.0.
- Bundled repairs run through `RepairRunner`, which wraps **the whole file in one transaction** and then runs the manifest's `verificationQuery` inside it. That constrains what the SQL may contain (see 3.2).

---

## Phase 0 — Preflight

1. `git status` and `git branch --show-current`. Report both.
2. If the branch is not `main`, stop and ask.
3. If there are uncommitted changes that are **not** part of this release, stop and ask. Do not stash, do not commit them silently.
4. `git log --oneline -5` — confirm the feature work being released is actually committed.
5. Read the current version from `package.json`.
6. If the version was given as "decide", propose one and say why: patch = fixes only, minor = new feature or new tables, major = breaking change to data or workflow. Wait for confirmation before bumping.

**Gate: report the branch, the working tree state, the current version, and the proposed version. Do not proceed until the version is settled.**

---

## Phase 1 — Verification

Run all five, in this order:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

Report the real output of each. A release is not cut over a failing or skipped test. Do not modify, skip, or weaken a test to get a green run — if something fails, that is the release blocker and you stop there.

**Gate: all five clean.**

---

## Phase 2 — Version bump

```
npm version <X.Y.Z> --no-git-tag-version
```

That updates `package.json` and `package-lock.json` together. Do not hand-edit either file, and do not create a git tag here.

Then check whether any prose needs updating for this release:

- `README.md` — the feature-summary paragraph, if this release changed what the app does.
- `docs/` — only pages whose statements are now wrong.

Do not rewrite docs that are still accurate. Do not invent a CHANGELOG; this repo does not keep one.

**Gate: `git diff --stat` shows the bump and nothing unexpected.**

---

## Phase 3 — Database repair script for the business PC

Skip this phase **only** if `git diff --name-only <previous-release-commit>..HEAD -- backend/prisma/` is empty. Say so explicitly if you skip it.

The shop PC's Postgres does not get updated by the installer. It needs SQL. Produce one idempotent script that takes that database from its current state to the schema this release expects.

### 3.1 Generate

**Method A — preferred, when a copy of the shop database is available.** Restore the shop's latest backup into a scratch database locally, then:

```
npx prisma migrate diff \
  --from-url "postgresql://postgres:PASSWORD@localhost:5433/homeconnect_scratch" \
  --to-schema-datamodel backend/prisma/schema.prisma \
  --script
```

This produces exactly what *that* database is missing, which is the only thing that matters.

**Method B — fallback, when no copy is available.** Concatenate, in lexical order, the `migration.sql` of every directory under `backend/prisma/migrations/` added since the previous release commit. List which ones you included in your report.

### 3.2 Make it safe to run twice

The script must be idempotent, because it will be run by a person under time pressure who may not remember whether they already ran it:

- `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- New enums and new enum values wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.
- Column names are **camelCase and unquoted in the schema**, so every raw reference must be double-quoted: `"orderNumber"`, `"totalAmount"`, `"createdAt"`.
- Backfills of new NOT NULL columns must be deterministically ordered (`ORDER BY "createdAt", "id"`) so the shop PC and your machine produce identical data.

It must also survive `RepairRunner`, which executes the file as one transaction:

- **No `BEGIN;` / `COMMIT;`.** The runner opens the transaction itself; a nested one inside the file fights it. (1.2.0 and 1.3.0 carry them because they predate the bundled path — do not copy that.)
- **No `CREATE INDEX CONCURRENTLY`** — it cannot run inside a transaction. Say so in a comment, as the existing files do.
- **A new enum value cannot be used in the same repair that adds it** (SQLSTATE 55P04). Split it in two, as 1.4.0 did with `product-label-auto-enum` then `product-label-auto-apply`, and list them in that order in the manifest. Reading `pg_enum` to verify the value is fine.
- It must pass `scanSqlForUnsafeStatements`: no `DROP` / `TRUNCATE` / `DELETE`, and no `UPDATE` except a NULL-backfill of a just-added column or `_prisma_migrations` bookkeeping. Anything else is rejected at load time as `UNSAFE_SQL` and the repair silently never appears in Maintenance.
- A prerequisite `DO $tag$ ... RAISE EXCEPTION ... $tag$;` block at the top is the house style — it turns "wrong database" into a clear message instead of a confusing failure half-way down.

### 3.3 Decide how the migration history gets recorded

The repair brings the *schema* up to date. Something still has to tell `_prisma_migrations` that the migrations it covers are done, or Apply will later try to re-run them.

There are two conventions in this repo. **Pick one deliberately and say which in your report.**

- **Bundled repair + in-app Resolve (current, 1.4.0 onward).** The repair writes no bookkeeping. After it runs, the admin opens Settings → Maintenance → "Already updated by hand?" and records the covered migrations. This is preferred: the covered migrations are almost always idempotent, so Apply re-running them is a harmless no-op that stamps the rows by itself.
- **Self-stamping standalone script (1.0.5–1.3.0).** The script ends with an `INSERT INTO "_prisma_migrations"` guarded by `WHERE NOT EXISTS`, creating the table first if absent. Use this only for a break-glass file meant to be run in psql on a PC that may never have run Prisma.

Either way the migrations must end up recorded. **Leaving both undone is what causes the drift this project has already been bitten by.**

### 3.4 Refuse to ship destructive SQL silently

If the generated script contains `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE`, or anything else that can lose data, **stop and report it before writing the file.** Those need a deliberate decision and a fresh backup, not a paragraph in a release note.

### 3.5 Verify it

1. Apply the script to a scratch database.
2. Re-run the `migrate diff` from 3.1 against that scratch database.
3. **The second diff must produce an empty script.** If it does not, the repair is incomplete — fix it, do not ship it.
4. Run it a second time against the same scratch DB and confirm it succeeds with no error. That is the idempotency proof.

### 3.6 Place it in two locations

```
backend/prisma/repair/<X.Y.Z>-repair.sql     ← committed, bundled into the installer, survives a machine wipe
release/<X.Y.Z>/<X.Y.Z>-repair.sql           ← ships next to the installer, gitignored
```

`release/` is gitignored, so the tracked copy is the real one. `package.json` → `build.extraResources` already copies `backend/prisma/repair` to `resources/repair`, so no build config changes. The release-folder copy exists so the whole update travels on one USB stick.

Keep the two byte-identical. The tracked copy is the reviewed artefact and the one whose checksum is in the manifest.

### 3.7 Register it in the repair manifest

**A file in `backend/prisma/repair/` that is not in `manifest.json` is dead weight** — it is reported as an `ORPHAN_FILE` and Settings → Maintenance can never apply it. 1.5.0 shipped this way and the shop had to run the SQL by hand in pgAdmin.

Append an entry to `backend/prisma/repair/manifest.json`:

```
repairId            stable kebab-case id, never reused, never removed later
title/description   what an admin sees; name the migrations it covers
version             <X.Y.Z>
file                <X.Y.Z>-repair.sql
checksum            sha256:<hex of the tracked file>
requiresSuperuser   true only if it installs an untrusted extension (pg_trgm)
affectedTables      the tables an admin should recognise
detectionQuery      returns >=1 row when ALL of the repair is already in place
detectionExpects    "empty"   (i.e. the repair is needed when the query returns nothing)
verificationQuery   a single column literally aliased `count`
verificationExpects the number that column must equal, or the repair is rolled back
```

Compute the checksum from the tracked file:

```
node -e "const c=require('crypto'),f=require('fs');console.log('sha256:'+c.createHash('sha256').update(f.readFileSync('backend/prisma/repair/<X.Y.Z>-repair.sql')).digest('hex'))"
```

Then:

1. Run both catalog queries against your dev database and confirm the shapes — detection returning a row on an up-to-date DB, verification returning `count` equal to `verificationExpects`. A query that errors makes the repair unusable and nothing will say so at runtime.
2. Bump the two hard-coded file counts, which exist to make exactly this step impossible to forget:
   - `backend/src/features/maintenance/sql-safety-scanner.test.ts` — "finds all N repair files"
   - `backend/src/features/maintenance/repair-registry.test.ts` — "loads all N repairs with no problems"
3. `npx vitest run backend/src/features/maintenance/` — the registry test proves the checksum matches and the scanner accepts the file.

Not every SQL file belongs in the manifest. A one-off data fix for a specific incident — `1.5.0-repair-imported-product-ids.sql`, which rewrites imported product IDs — stays a manual break-glass file: it would be rejected by the safety scanner anyway, and it should not be offered to an admin as a routine repair.

**Gate: empty second diff, clean re-run, both files written, manifest entry added, maintenance tests green.**

---

## Phase 4 — Build the installer

```
npm run dist:win
```

Then verify:

- `release/<X.Y.Z>/HomeConnect-Setup-<X.Y.Z>.exe` exists.
- Its size is within ~10% of the previous release's installer. A large swing means something got included or dropped that should not have been — investigate before shipping.
- `release/<X.Y.Z>/latest.yml` exists.
- Report the SHA-256 of the `.exe`.

Optionally run `npm run check:electron-production-runtime` if this release touched anything under `desktop/`.

**Gate: installer exists, size is sane, hash reported.**

---

## Phase 5 — Commit and push

Commit only the release files — the version bump, any docs you actually corrected, and the tracked repair SQL:

```
git add package.json package-lock.json \
        backend/prisma/repair/<X.Y.Z>-repair.sql \
        backend/prisma/repair/manifest.json \
        backend/src/features/maintenance/sql-safety-scanner.test.ts \
        backend/src/features/maintenance/repair-registry.test.ts \
        [docs you changed]
git commit -m "feat: release HomeConnect <X.Y.Z>"
```

The manifest and the two count assertions travel with the repair file. A commit with the `.sql` but not the manifest ships a repair nobody can run.

Commit message ends with the co-author trailer this repo uses.

**Then stop and ask before pushing.** Show the exact command you intend to run and the commit you are about to publish. Push only on an explicit yes:

```
git push origin main
```

Never force-push. Never push a branch other than the one confirmed in Phase 0.

---

## Phase 6 — Hand-off report

Produce this, filled in:

```
HomeConnect <X.Y.Z> — release ready

Installer:   release/<X.Y.Z>/HomeConnect-Setup-<X.Y.Z>.exe
SHA-256:     <hash>
DB repair:   release/<X.Y.Z>/<X.Y.Z>-repair.sql   (needed: yes/no)
Commit:      <sha>  pushed: yes/no
Tests:       lint / typecheck / test / build / prisma:validate — all passed

Business PC steps, in this order:
  1. Close HomeConnect on the shop PC.
  2. Back up Postgres first — docs/setup/BACKUP_RESTORE_RECOVERY_GUIDE.md.
     Do not skip this. The repair script is idempotent, not reversible.
  3. Run the installer over the existing install. Do not uninstall first.
  4. Launch, log in as an admin, open Settings → Maintenance.
     - Pending updates / Pending repairs show what this PC still needs.
     - If migrations are listed that this PC already has (schema present, history
       missing), use "Already updated by hand?" → "Select the N already in the
       database" → password + RESOLVE first. Apply cannot get past a migration
       that re-creates an existing table; it stops at the first failure.
     - Then Apply. A verified backup is taken automatically before anything runs.
  5. Check the version in the sidebar reads v<X.Y.Z>, and that Pending updates
     and Pending repairs both read 0.
  6. Smoke check: <the 2–4 checks that actually exercise what this release changed>

Fallback if the in-app path is unavailable (no admin access, backup tools missing,
older build installed) — apply the SQL by hand between steps 2 and 3:
  psql -h localhost -p <5432 or 5433> -U postgres -d homeconnect -v ON_ERROR_STOP=1 -f <X.Y.Z>-repair.sql
  It must finish with no error. If it errors, stop and restore the backup.
  Doing this leaves the migrations recorded as pending — resolve them in step 4.
```

Fill step 6 with real checks tied to this release, not filler.

---

## Hard rules

- **Never** run `prisma migrate reset`, `prisma db push`, or `migrate dev` against anything connected to the shop's data. The shop database holds the only copy of the business's records.
- **Never** push without explicit confirmation in this session. Approval on a previous release does not carry over.
- **Never** bump the version before Phase 1 is green. A tagged version that does not build is worse than no release.
- **Never** ship a repair script whose second `migrate diff` is non-empty.
- **Never** ship a repair `.sql` without its `manifest.json` entry. An unlisted file cannot be applied from the app, and the shop is left doing surgery in pgAdmin.
- **Never** hand-edit a manifest checksum. Recompute it from the tracked file, and re-run the maintenance tests.
- **Never** edit `package-lock.json` by hand.
- **Never** commit anything from `release/` — it is gitignored for a reason, and the `.exe` is large.
- **Never** put credentials, connection strings with real passwords, or `.env` contents into a committed file, a report, or a commit message.
- If the shop PC's `_prisma_migrations` table turns out to be missing or inconsistent, use the supported path — Settings → Maintenance → "Already updated by hand?" — which refuses to record anything the database is actually missing. Do not improvise SQL against `_prisma_migrations` during an update window. If Resolve refuses an entry, **report it and stop**: that means the schema really is missing something.

## Report as you go

After each phase, state in one or two lines: what you ran, what it produced, and whether the gate passed. If a gate failed, state exactly what failed and stop — do not continue to the next phase and do not attempt a workaround.
