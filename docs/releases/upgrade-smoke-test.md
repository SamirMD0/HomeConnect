# Upgrade smoke test

Run this test before publishing every drafted GitHub Release. Use a spare Windows PC or VM, never the live shop PC.

## 0. Prerequisites

- Confirm by eye that the test PC contains no live business data.
- Install the current released version of Home Connect and record its About-screen version as `N`.
- Prepare a disposable PostgreSQL database on the test PC. Its database name must contain `test`, `drill`, or `phase` followed by a number.
- Download `HomeConnect-Setup-<new-version>.exe` from the drafted GitHub Release.
- Confirm at least 5 GB of free disk space.
- Keep the version `N` installer for rollback.

## 1. Seed the fixture

From the repository checkout, run this against the disposable database, substituting today's date on the test PC:

```powershell
npx tsx scripts/prepare-upgrade-smoke-db.ts --database-url "postgres://USER:PASSWORD@localhost:5432/phase6_smoke_db" --business-date YYYY-MM-DD
```

Confirm one `PASS` line for the admin, customers, products, sales orders, payment, and return, followed by the baseline summary. Stop if the script reports an error. Do not point it at a shop database.

## 2. Launch version N and capture the baseline

- Open Home Connect and sign in with the credentials printed by step 1.
- Record the dashboard's total customers, products in stock, open sales orders, USD receivable balance, and today's sales count.
- Record one customer's full name and outstanding balance from the Customers list.
- Record one product's name, SKU, and on-hand quantity from the Products list.
- Create `docs/releases/<version>-smoke-test.md` with a `Pre-upgrade baseline` section. Copy the release note stub at `docs/releases/<version>.md` if useful. Record the five dashboard values and both spot-checks there.
- Compare the displayed figures with the seed summary. Stop and investigate any mismatch before upgrading.

## 3. Close version N

- Close Home Connect.
- Confirm in Task Manager that no Home Connect `node.exe` or `HomeConnect.exe` process remains.
- Take a snapshot of the disposable database and record its location in the smoke-test notes.

## 4. Install the drafted version

- Run `HomeConnect-Setup-<new-version>.exe` from the draft release.
- Accept the same installation path used by version `N`.
- Confirm the Start Menu shortcut reads `HomeConnect`.
- Retain the version `N` installer.

## 5. Watch first-launch migrations

- Open Home Connect and watch the startup monitor for `Running pre-migration guard...` and `Startup complete. Opening app...`.
- If migrations ran, record the `Applied N migration(s). Backup at <path>` message. Confirm the named backup exists and is larger than 1 MB.
- If no migrations were pending, record that outcome instead.
- If the migration-failed screen appears, stop. Record its failure code, follow `docs/incident-runbooks/migration-failure.md`, and do not publish the release.

## 6. Verify the baseline survives

- Sign in and compare all five dashboard values with step 2. All five must match.
- Find the same customer and compare full name and outstanding balance.
- Find the same product and compare name, SKU, and on-hand quantity.
- Record every comparison in `Post-upgrade verification` in `docs/releases/<version>-smoke-test.md`. Stop if any value differs.

## 7. Exercise the new version's write path

- Create one sale for quantity 1 of any product, pay cash, and confirm a receipt prints or previews.
- Record one payment against an existing customer debt.
- Create one return against a seeded sale.
- Stop, record the failure, and do not publish if any operation fails.

## 8. Exercise the auto-update UI

- Open Settings > Updates and click **Check now**. Confirm `Checking…` transitions to `Up to date`, or `Up to date` appears immediately.
- Confirm the About screen shows the drafted release's new version string.

## 9. Clean up

- Close Home Connect and confirm no orphan processes remain.
- Retain the pre-migration backup for one release cycle.
- Drop the disposable PostgreSQL database only when the smoke-test evidence is complete.

## 10. Pass criteria

GREEN requires successful fixture seeding, successful first launch (and a backup larger than 1 MB if migrations ran), five matching dashboard values, both matching spot-checks, three successful write operations, and the expected update/About results.

If GREEN, copy the notes from `docs/releases/<version>.md` into the drafted GitHub Release body, clear **This is a pre-release** if applicable, and publish the release.

If NOT GREEN, do not publish. File an issue with the failing step, migration-failure diagnostics if applicable, and the pre-migration backup path.
