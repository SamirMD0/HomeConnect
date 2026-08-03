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
- The business PC has historically had a **missing or drifted `_prisma_migrations` table** (see `docs/phases/phase-02/`). Never assume Prisma's migration history there is healthy.
- The shop PC connects on **port 5433**, database `homeconnect`. See `docs/setup/ELECTRON_BUSINESS_PC_SETUP.md`.

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
- Wrap the whole thing in `BEGIN; ... COMMIT;`.

### 3.3 Record the migrations as applied

End the script with an insert into `_prisma_migrations` for every migration it covers, guarded with `ON CONFLICT DO NOTHING`, so a later `prisma migrate deploy` on that machine does not try to re-apply them. If the table does not exist on the shop PC, create it first. **Skipping this step is what causes the drift this project has already been bitten by once.**

### 3.4 Refuse to ship destructive SQL silently

If the generated script contains `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE`, or anything else that can lose data, **stop and report it before writing the file.** Those need a deliberate decision and a fresh backup, not a paragraph in a release note.

### 3.5 Verify it

1. Apply the script to a scratch database.
2. Re-run the `migrate diff` from 3.1 against that scratch database.
3. **The second diff must produce an empty script.** If it does not, the repair is incomplete — fix it, do not ship it.
4. Run it a second time against the same scratch DB and confirm it succeeds with no error. That is the idempotency proof.

### 3.6 Place it in two locations

```
backend/prisma/repair/<X.Y.Z>-repair.sql     ← committed, survives a machine wipe
release/<X.Y.Z>/<X.Y.Z>-repair.sql           ← ships next to the installer, gitignored
```

`release/` is gitignored, so the tracked copy is the real one. The release-folder copy exists so the whole update travels on one USB stick.

**Gate: empty second diff, clean re-run, both files written.**

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
git add package.json package-lock.json backend/prisma/repair/<X.Y.Z>-repair.sql [docs you changed]
git commit -m "feat: release HomeConnect <X.Y.Z>"
```

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
  3. Apply the repair SQL:
     psql -h localhost -p 5433 -U postgres -d homeconnect -v ON_ERROR_STOP=1 -f <X.Y.Z>-repair.sql
     It must finish with no error. If it errors, stop and restore the backup.
  4. Run the installer over the existing install. Do not uninstall first.
  5. Launch, log in, and check the version in the sidebar reads v<X.Y.Z>.
  6. Smoke check: <the 2–4 checks that actually exercise what this release changed>
```

Fill step 6 with real checks tied to this release, not filler.

---

## Hard rules

- **Never** run `prisma migrate reset`, `prisma db push`, or `migrate dev` against anything connected to the shop's data. The shop database holds the only copy of the business's records.
- **Never** push without explicit confirmation in this session. Approval on a previous release does not carry over.
- **Never** bump the version before Phase 1 is green. A tagged version that does not build is worse than no release.
- **Never** ship a repair script whose second `migrate diff` is non-empty.
- **Never** edit `package-lock.json` by hand.
- **Never** commit anything from `release/` — it is gitignored for a reason, and the `.exe` is large.
- **Never** put credentials, connection strings with real passwords, or `.env` contents into a committed file, a report, or a commit message.
- If the shop PC's `_prisma_migrations` table turns out to be missing or inconsistent, **report it and stop** rather than improvising a fix during an update window.

## Report as you go

After each phase, state in one or two lines: what you ran, what it produced, and whether the gate passed. If a gate failed, state exactly what failed and stop — do not continue to the next phase and do not attempt a workaround.
