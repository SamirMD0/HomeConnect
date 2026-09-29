# Test database safeguards

Database integration tests and audit rehearsals can write or delete rows. Run them only against disposable databases.

- `node scripts/assert-test-database.mjs` checks `DATABASE_URL` for a `test`, `ci`, or `phaseN` name before `npm run test:ci` enables destructive integration suites.
- `npx tsx e2e/server.ts` checks the browser database name against `hc_audit_test_browser_<digits>` before seeding Playwright fixtures. Its URL comes from the ignored `e2e/.runtime/databases.json` manifest.
- The thermal scratchpad `rehearsal.mjs` checks its target name ends with `thermal_reconcile_rehearsal` before writes. Run it with `node <scratchpad>/thermal-reconcile/rehearsal.mjs` only after inspecting its configured URL.
- `npm run audit:migration-drift` is read only and accepts recognized audit/test/rehearsal database names; it refuses other names.

To inspect a target without printing credentials, parse the effective URL and print only its pathname before running a command. A name guard does not prove the database is disposable or that another process made no writes. Verify the connection target and ownership independently.
