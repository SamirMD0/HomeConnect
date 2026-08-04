import { describe, expect, it } from 'vitest';
import {
  checkDatabaseName,
  checkDatabaseReachable,
  checkDatabaseUrlParses,
  checkEnvFile,
  checkExtensionPrivilege,
  checkPasswordEncoding,
  checkPortsFree,
  checkRequiredTables,
  checkRequiredVars,
} from './preflight.checks';
import { PreflightCheckResult, worstStatus } from './preflight.types';

/** Every non-PASS result must tell the operator what to do — that is the point of preflight. */
const expectActionable = (result: PreflightCheckResult) => {
  if (result.status === 'PASS' || result.status === 'SKIPPED') return;
  expect(result.fix.length).toBeGreaterThan(10);
};

describe('preflight: configuration file', () => {
  it('fails when no path is configured', () => {
    const result = checkEnvFile(null);
    expect(result.status).toBe('FAIL');
    expectActionable(result);
  });

  it('fails with the missing path named', () => {
    const result = checkEnvFile('C:/config/production.env', () => false);
    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('C:/config/production.env');
    expectActionable(result);
  });

  it('passes when the file exists', () => {
    expect(checkEnvFile('C:/config/production.env', () => true).status).toBe('PASS');
  });
});

describe('preflight: required settings', () => {
  const complete = { DATABASE_URL: 'postgresql://u:p@localhost:5433/homeconnect', JWT_SECRET: 's', JWT_REFRESH_SECRET: 'r' };

  it('passes when all are present', () => {
    expect(checkRequiredVars(complete).status).toBe('PASS');
  });

  it('names exactly which are missing', () => {
    const result = checkRequiredVars({ DATABASE_URL: 'x' });
    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('JWT_SECRET');
    expect(result.detail).toContain('JWT_REFRESH_SECRET');
    expectActionable(result);
  });

  it('treats a blank value as missing', () => {
    expect(checkRequiredVars({ ...complete, JWT_SECRET: '   ' }).status).toBe('FAIL');
  });

  it('never echoes a secret value', () => {
    const result = checkRequiredVars(complete);
    expect(result.detail).not.toContain('postgresql://');
    expect(JSON.stringify(result)).not.toContain('supersecret');
  });
});

describe('preflight: database address', () => {
  it('reports host, port and database but never credentials', () => {
    const result = checkDatabaseUrlParses('postgresql://admin:supersecret@localhost:5433/homeconnect');
    expect(result.status).toBe('PASS');
    expect(result.detail).toContain('homeconnect');
    expect(result.detail).toContain('5433');
    expect(result.detail).not.toContain('supersecret');
    expect(result.detail).not.toContain('admin');
  });

  it('fails on a non-postgres or unparseable URL', () => {
    expect(checkDatabaseUrlParses('mysql://localhost/db').status).toBe('FAIL');
    expect(checkDatabaseUrlParses('not a url').status).toBe('FAIL');
    expect(checkDatabaseUrlParses(undefined).status).toBe('FAIL');
  });
});

describe('preflight: password encoding', () => {
  it('fails on a raw @ and gives the %40 hint', () => {
    const result = checkPasswordEncoding('postgresql://postgres:pa@ss@localhost:5433/homeconnect');
    expect(result.status).toBe('FAIL');
    expect(result.fix).toContain('%40');
    expectActionable(result);
  });

  it('fails on other characters that break the URL', () => {
    expect(checkPasswordEncoding('postgresql://u:pa/ss@h:5433/d').status).toBe('FAIL');
    expect(checkPasswordEncoding('postgresql://u:pa#ss@h:5433/d').status).toBe('FAIL');
  });

  it('passes when the password is percent-encoded', () => {
    expect(checkPasswordEncoding('postgresql://postgres:pa%40ss@localhost:5433/homeconnect').status).toBe('PASS');
  });

  it('passes when there are no embedded credentials', () => {
    expect(checkPasswordEncoding('postgresql://localhost:5433/homeconnect').status).toBe('PASS');
  });

  it('passes when a username is given with no password', () => {
    expect(checkPasswordEncoding('postgresql://postgres@localhost:5433/homeconnect').status).toBe('PASS');
  });

  it('is not confused by an @ appearing later in the path or query', () => {
    expect(checkPasswordEncoding('postgresql://u:p@localhost:5433/db?options=-c%20search_path%3Da@b').status).toBe('PASS');
  });

  it('catches a raw @ even when the password also contains other symbols', () => {
    expect(checkPasswordEncoding('postgresql://postgres:P@ssw0rd!@localhost:5433/homeconnect').status).toBe('FAIL');
  });
});

describe('preflight: connection and database name', () => {
  it('fails with a concrete instruction when unreachable', () => {
    const result = checkDatabaseReachable({ ok: false, error: 'ECONNREFUSED' }, 'localhost', '5433');
    expect(result.status).toBe('FAIL');
    expect(result.fix).toMatch(/postgresql-x64|Services/);
    expectActionable(result);
  });

  it('fails when the database is absent, and reassures about data', () => {
    const result = checkDatabaseName('homeconnect', null);
    expect(result.status).toBe('FAIL');
    expect(result.fix).toContain('not affected');
  });

  it('warns when connected to a different database than configured', () => {
    expect(checkDatabaseName('homeconnect', 'homeconnect_test').status).toBe('WARN');
  });

  it('passes on a match', () => {
    expect(checkDatabaseName('homeconnect', 'homeconnect').status).toBe('PASS');
  });
});

describe('preflight: extension privilege', () => {
  it('fails when a pending update needs an extension the user cannot install', () => {
    const result = checkExtensionPrivilege(false, true);
    expect(result.status).toBe('FAIL');
    expect(result.fix).toContain('postgres');
    expectActionable(result);
  });

  it('only warns when the privilege is missing but nothing pending needs it', () => {
    expect(checkExtensionPrivilege(false, false).status).toBe('WARN');
  });

  it('passes for a superuser', () => {
    expect(checkExtensionPrivilege(true, true).status).toBe('PASS');
  });

  it('warns rather than failing when the privilege cannot be determined', () => {
    expect(checkExtensionPrivilege(null, true).status).toBe('WARN');
  });
});

describe('preflight: structure and ports', () => {
  it('passes when nothing is missing', () => {
    expect(checkRequiredTables([]).status).toBe('PASS');
  });

  it('fails naming the missing column and points at Maintenance', () => {
    const result = checkRequiredTables(['payment_allocations.voidedAt']);
    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('payment_allocations.voidedAt');
    expect(result.fix).toContain('Maintenance');
  });

  it('reports busy ports', () => {
    expect(checkPortsFree([]).status).toBe('PASS');
    const result = checkPortsFree([3001]);
    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('3001');
    expectActionable(result);
  });
});

describe('preflight: report verdict', () => {
  const of = (status: PreflightCheckResult['status']): PreflightCheckResult =>
    ({ id: 'ENV_FILE', title: 't', status, detail: 'd', fix: '' });

  it('takes the worst status', () => {
    expect(worstStatus([of('PASS'), of('WARN'), of('FAIL')])).toBe('FAIL');
    expect(worstStatus([of('PASS'), of('WARN')])).toBe('WARN');
    expect(worstStatus([of('PASS'), of('PASS')])).toBe('PASS');
  });

  it('does not let a skipped check worsen the verdict', () => {
    expect(worstStatus([of('PASS'), of('SKIPPED')])).toBe('PASS');
  });
});
