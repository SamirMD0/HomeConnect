// Run with the packaged HomeConnect.exe and ELECTRON_RUN_AS_NODE=1.
// Exercises the shipped gateway without opening the business database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const resources = path.resolve(process.argv[2]);
process.env.NODE_PATH = [
  path.join(resources, 'app.asar', 'node_modules'),
  path.join(resources, 'app.asar.unpacked', 'node_modules'),
].join(path.delimiter);
const { Module } = require('node:module');
Module._initPaths();
// The release lives below the repository. Prevent Node from accidentally
// satisfying missing packaged dependencies using development node_modules.
const nodeModulePaths = Module._nodeModulePaths;
Module._nodeModulePaths = from => nodeModulePaths(from).filter(candidate =>
  candidate.toLowerCase().startsWith(`${resources}${path.sep}`.toLowerCase()));
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/mobile_gateway_probe';
process.env.JWT_SECRET = 'mobile-runtime-probe-only-secret-32-characters';
process.env.JWT_REFRESH_SECRET = 'mobile-runtime-probe-only-refresh-secret-32-characters';

const backend = path.join(resources, 'dist/server/backend/src');
const { buildLanApp } = require(path.join(backend, 'features/scanner/lan-listener.js'));
const { AuthService } = require(path.join(backend, 'services/auth.service.js'));
const { prisma } = require(path.join(backend, 'lib/prisma.js'));
const server = http.createServer(buildLanApp());
const checks = [];

async function main() {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function check(method, route, expected, body) {
    const response = await fetch(`${base}${route}`, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, expected, `${method} ${route}`);
    checks.push({ method, route, status: response.status });
    return response;
  }
  await check('GET', '/mobile-scanner', 200);
  await check('GET', '/api/v1/auth/me', 401);
  const invalid = await check('POST', '/api/v1/auth/login', 400, {});
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
  // Only the account service is stubbed; the shipped routing, controller,
  // parsing and LAN cookie policy execute unchanged.
  AuthService.login = async (username, password) => {
    assert.equal(username, 'runtime-probe');
    assert.equal(password, 'probe-password');
    return {
      user: { id: '11111111-1111-4111-8111-111111111111', username, fullName: 'Runtime Probe', role: 'ADMIN' },
      accessToken: 'synthetic-access-token', refreshToken: 'synthetic-refresh-token',
    };
  };
  const login = await check('POST', '/api/v1/auth/login', 200, { username: 'runtime-probe', password: 'probe-password' });
  assert.equal((await login.json()).data.accessToken, 'synthetic-access-token');
  assert.equal(login.headers.get('set-cookie'), null);
  await check('GET', '/api/v1/products', 401);
  await check('GET', '/api/v1/suppliers', 401);
  await check('GET', '/api/v1/customers', 404);
  await check('POST', '/api/v1/auth/setup', 404, {});
  const outsideDependencies = Object.keys(require.cache).filter(filename =>
    filename.includes(`${path.sep}node_modules${path.sep}`)
    && !filename.toLowerCase().startsWith(`${resources}${path.sep}`.toLowerCase()));
  assert.deepEqual(outsideDependencies, [], 'Runtime dependencies must come from the package');
  const evidence = { packagedResources: resources, usesBusinessDatabase: false, loginServiceStubbed: true, checks };
  fs.writeFileSync(path.join(resources, '../../mobile-lan-verification.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
});
