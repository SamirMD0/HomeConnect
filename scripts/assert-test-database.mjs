/**
 * Refuses to let the database integration suites run against a real database.
 *
 * `npm run test:ci` sets all eight RUN_*_DB_TESTS flags. Three of the suites
 * guard themselves by checking that the database NAME contains `phase4`,
 * `phase5` or `phase6`. The other five have no such guard at all — they run
 * whenever their flag is set and DATABASE_URL is present.
 *
 * Those five are destructive. On a developer machine DATABASE_URL normally
 * points at the real `homeconnect` database, so `npm run test:ci` without this
 * check would delete rows from live business data.
 *
 * This script runs before vitest and aborts unless the target database is
 * clearly a throwaway. It protects all eight suites in one place, and it does
 * it without editing — or weakening — the guards the test files already carry.
 */

const TEST_DATABASE_PATTERN = /(^|[_-])(test|ci)([_-]|$)|phase\d/i;

function databaseNameFrom(url) {
  // Deliberately string-based rather than `new URL()`: a password containing
  // an unencoded character makes the URL parser throw, and this check must
  // fail closed with a useful message rather than a stack trace.
  const withoutQuery = url.split('?')[0];
  const lastSlash = withoutQuery.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return withoutQuery.slice(lastSlash + 1);
}

function fail(lines) {
  console.error('\n  Refusing to run the database integration suites.\n');
  for (const line of lines) console.error('  ' + line);
  console.error('');
  process.exit(1);
}

const url = process.env.DATABASE_URL;

if (!url) {
  fail([
    'DATABASE_URL is not set.',
    '',
    'Point it at a throwaway database whose name marks it as one, e.g.',
    '  homeconnect_test_phase4_phase5_phase6',
    '',
    'Use `npm test` instead to run the suite without the database tests.',
  ]);
}

const name = databaseNameFrom(url);

if (!name) {
  fail([`Could not read a database name from DATABASE_URL.`]);
}

if (!TEST_DATABASE_PATTERN.test(name)) {
  fail([
    `DATABASE_URL points at "${name}", which is not recognised as a test database.`,
    '',
    'These suites DELETE data. Running them against a real database would',
    'destroy business records.',
    '',
    'Give the throwaway database a name containing "test", "ci", or "phaseN",',
    'for example:',
    '  homeconnect_test_phase4_phase5_phase6',
    '',
    'The phase4/phase5/phase6 parts satisfy the name guards that three of the',
    'suites check individually, so one database serves all eight.',
    '',
    'To run only the non-database tests, use `npm test`.',
  ]);
}

console.log(`Database integration suites enabled against "${name}".`);
