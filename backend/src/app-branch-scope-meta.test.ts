import { customerImportBranchGuard } from './features/customers/customer-import-branch.middleware';
import { mkdirSync, writeFileSync } from 'node:fs';
import express, { Router, type Application } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { requireAuth } from './middleware/auth.middleware';
import { branchScopeMiddleware } from './middleware/branch-scope.middleware';
import { globalRoutes, globalRouteGroups, scannerGlobalReasons } from './test/branch-global-routes';
import { buildLanApp } from './features/scanner/lan-listener';
import { customerParentGuard, supplierParentGuard } from './middleware/branch-parent.middleware';

interface Layer {
  handle: unknown;
  route?: { path: string | string[]; methods: Record<string, boolean> };
}
interface Middleware {
  path: string;
  handle: unknown;
}
interface CoveredRoute {
  method: string;
  path: string;
  authenticated: boolean;
  scoped: boolean;
  guarded: boolean;
}

// Phase 3 final boundary: every registered /api/v1 route must be classified.
const scopedPrefixes: { prefix: string; parentGuard?: unknown }[] = [
  { prefix: '/api/v1/customers/imports', parentGuard: customerImportBranchGuard },
  { prefix: '/api/v1/customers', parentGuard: customerParentGuard },
  { prefix: '/api/v1/suppliers', parentGuard: supplierParentGuard },
  { prefix: '/api/v1/debts' },
  { prefix: '/api/v1/installment-plans' },
  { prefix: '/api/v1/payments' },
  { prefix: '/api/v1/financial-ledger' },
  { prefix: '/api/v1/receivables' },
  { prefix: '/api/v1/prepaid-purchases' },
  { prefix: '/api/v1/corrections' },
  { prefix: '/api/v1/sales-orders' },
  { prefix: '/api/v1/sales-returns' },
  { prefix: '/api/v1/service-jobs' },
  { prefix: '/api/v1/supplier-transactions' },
  { prefix: '/api/v1/supplier-purchases' },
  { prefix: '/api/v1/supplier-ledger' },
  { prefix: '/api/v1/inventory/receivings' },
  { prefix: '/api/v1/reports' },
  { prefix: '/api/v1/dashboard' },
  { prefix: '/api/v1/products/:productId/service-jobs' },
];

// D3: stock counts, movements and onboarding stay global. New inventory routes
// must be explicitly classified here or added to the scoped receiving registry.
const globalInventory = [
  'GET /api/v1/inventory/onboarding/pending',
  'POST /api/v1/inventory/onboarding/batch',
  'GET /api/v1/inventory/summary',
  'GET /api/v1/inventory/low-stock',
  'GET /api/v1/inventory/movements',
];

// Express 5 hides mount paths inside matcher closures. Record the registration
// metadata in this test, then walk the actual router stack (including nested routers).
const paths = new WeakMap<Layer, string[]>();
const prototype = Router.prototype as { use: (...args: unknown[]) => unknown };
const originalUse = prototype.use;
vi.spyOn(prototype, 'use').mockImplementation(function (
  this: { stack: Layer[] },
  ...args: unknown[]
) {
  const start = this.stack.length;
  const result = Reflect.apply(originalUse, this, args);
  const first = args[0];
  const mounts =
    typeof first === 'string'
      ? [first]
      : Array.isArray(first) && first.every((item) => typeof item === 'string')
        ? (first as string[])
        : ['/'];
  for (const layer of this.stack.slice(start)) paths.set(layer, mounts);
  return result;
});

function inventory(application: Application): CoveredRoute[] {
  const found: CoveredRoute[] = [];
  const join = (base: string, path: string) =>
    (base + '/' + path).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  function walk(stack: Layer[], base: string, inherited: Middleware[]) {
    const preceding = [...inherited];
    for (const layer of stack) {
      if (layer.route) {
        for (const path of [layer.route.path].flat()) {
          const fullPath = join(base, path);
          const registration = scopedPrefixes.find(
            ({ prefix }) => fullPath === prefix || fullPath.startsWith(prefix + '/')
          );
          if (!fullPath.startsWith('/api/v1/')) continue;
          const has = (handle: unknown) =>
            preceding.some(
              (item) =>
                item.handle === handle &&
                (item.path === '/' ||
                  fullPath === item.path ||
                  fullPath.startsWith(item.path + '/'))
            );
          for (const method of Object.keys(layer.route.methods)) {
            found.push({
              method: method.toUpperCase(),
              path: fullPath,
              authenticated: has(requireAuth),
              scoped: has(branchScopeMiddleware) || has(customerImportBranchGuard),
              guarded: registration?.parentGuard ? has(registration.parentGuard) : true,
            });
          }
        }
        continue;
      }
      const mounts = paths.get(layer);
      if (!mounts) throw new Error('Router mount metadata missing from route coverage test');
      for (const mount of mounts) {
        const fullPath = join(base, mount);
        if (typeof layer.handle === 'function' && 'stack' in layer.handle) {
          walk((layer.handle as unknown as { stack: Layer[] }).stack, fullPath, preceding);
        } else {
          preceding.push({ path: fullPath, handle: layer.handle });
        }
      }
    }
  }
  walk((application as unknown as { router: { stack: Layer[] } }).router.stack, '', []);
  return found;
}

describe('branch-scope route coverage registry (Phase 3D)', () => {
  let app: Application;
  beforeAll(async () => {
    app = (await import('./app.js')).app;
  }, 30_000);
  afterAll(() => vi.restoreAllMocks());
  it('classifies every API route and checks actual middleware before each scoped handler', () => {
    const routes = inventory(app);
    expect(scopedPrefixes.map((entry) => entry.prefix)).toEqual([
      '/api/v1/customers/imports',
      '/api/v1/customers',
      '/api/v1/suppliers',
      '/api/v1/debts',
      '/api/v1/installment-plans',
      '/api/v1/payments',
      '/api/v1/financial-ledger',
      '/api/v1/receivables',
      '/api/v1/prepaid-purchases',
      '/api/v1/corrections',
      '/api/v1/sales-orders',
      '/api/v1/sales-returns',
      '/api/v1/service-jobs',
      '/api/v1/supplier-transactions',
      '/api/v1/supplier-purchases',
      '/api/v1/supplier-ledger',
      '/api/v1/inventory/receivings',
      '/api/v1/reports',
      '/api/v1/dashboard',
      '/api/v1/products/:productId/service-jobs',
    ]);
    expect(
      routes.filter((route) => route.path.startsWith('/api/v1/customers')).length
    ).toBeGreaterThanOrEqual(18);
    expect(
      routes.filter((route) => route.path.startsWith('/api/v1/suppliers')).length
    ).toBeGreaterThanOrEqual(13);
    expect(
      routes
        .filter(
          (r) =>
            r.path.startsWith('/api/v1/inventory/') &&
            !r.path.startsWith('/api/v1/inventory/receivings')
        )
        .map((r) => r.method + ' ' + r.path)
        .sort()
    ).toEqual([...globalInventory].sort());
    expect(
      routes
        .filter((r) => r.path.startsWith('/api/v1/inventory/receivings'))
        .map((r) => r.method + ' ' + r.path)
        .sort()
    ).toEqual(
      [
        'GET /api/v1/inventory/receivings',
        'POST /api/v1/inventory/receivings',
        'GET /api/v1/inventory/receivings/duplicate-check',
        'GET /api/v1/inventory/receivings/:receivingId',
        'PATCH /api/v1/inventory/receivings/:receivingId/metadata',
        'POST /api/v1/inventory/receivings/:receivingId/void',
      ].sort()
    );
    for (const route of routes) {
      const key = route.method + ' ' + route.path;
      const scoped = scopedPrefixes.some(({ prefix }) => route.path === prefix || route.path.startsWith(prefix + '/'));
      expect(scoped || globalRoutes.has(key), 'Unclassified route: ' + key).toBe(true);
      expect(scoped && globalRoutes.has(key), 'Ambiguous classification: ' + key).toBe(false);
      expect(route.scoped, key).toBe(scoped);
      if (scoped) {
        expect(route.authenticated, key).toBe(true);
        expect(route.guarded, key).toBe(true);
      }
    }
    const lan = inventory(buildLanApp());
    for (const route of lan) {
      expect(scannerGlobalReasons[route.method + ' ' + route.path]).toBeTruthy();
      expect(route.scoped).toBe(false);
    }
    // Pin scanner surfaces individually, including LAN-only pair/session paths.
    expect([...new Set([...routes, ...lan].filter((r) => r.path.startsWith('/api/v1/scanner/')).map((r) => r.method + ' ' + r.path))].sort()).toEqual(Object.keys(scannerGlobalReasons).sort());
    mkdirSync('node_modules/.cache/home-connect', { recursive: true });
    writeFileSync('node_modules/.cache/home-connect/phase3d-route-inventory.json', JSON.stringify({
      scopedPrefixes: scopedPrefixes.map(({ prefix }) => prefix), globalRouteGroups,
      routes: routes.map(({ method, path, scoped }) => ({ method, path, classification: scoped ? 'scoped' : 'global', reason: scoped ? (path.startsWith('/api/v1/customers/imports') ? 'Authenticated customerImportBranchGuard binds the immutable batch destination; service rechecks transactionally' : 'Authenticated branchScopeMiddleware before handler') : globalRoutes.get(method + ' ' + path) })),
      scannerLanRoutes: lan.map(({ method, path }) => ({ method, path, classification: 'global', reason: scannerGlobalReasons[method + ' ' + path] })),
    }, null, 2));
  });
  it('includes unknown routes under any prefix so additions require classification', () => {
    const broken = express();
    broken.use('/api/v1/products', Router().get('/unclassified', (_req, res) => res.sendStatus(200)));
    broken.get('/api/v1/new-feature', (_req, res) => res.sendStatus(200));
    const found = inventory(broken);
    expect(found).toHaveLength(2);
    for (const route of found) {
      expect(globalRoutes.has(route.method + ' ' + route.path)).toBe(false);
      expect(scopedPrefixes.some(({ prefix }) => route.path.startsWith(prefix))).toBe(false);
    }
  });
  it('includes new unclassified inventory routes so the allow-list cannot silently miss them', () => {
    const broken = express();
    broken.use(
      '/api/v1/inventory',
      requireAuth,
      Router().get('/unclassified', (_req, res) => res.sendStatus(200))
    );
    const routes = inventory(broken);
    expect(routes.map((r) => r.method + ' ' + r.path)).toEqual([
      'GET /api/v1/inventory/unclassified',
    ]);
    expect(routes.filter((r) => !globalInventory.includes(r.method + ' ' + r.path)).length).toBe(1);
    expect(routes[0].scoped).toBe(false);
  });
  it('detects a router registered before the scope boundary', () => {
    const broken = express();
    broken.use(
      '/api/v1/customers',
      requireAuth,
      Router().get('/missed', (_req, res) => res.sendStatus(200))
    );
    broken.use('/api/v1/customers', branchScopeMiddleware, customerParentGuard);
    expect(inventory(broken)).toEqual([
      {
        method: 'GET',
        path: '/api/v1/customers/missed',
        authenticated: true,
        scoped: false,
        guarded: false,
      },
    ]);
  });
  it('keeps scope coverage through nested router mounts', () => {
    const nested = express();
    nested.use('/api/v1/suppliers', requireAuth, branchScopeMiddleware, supplierParentGuard);
    nested.use(
      '/api/v1/suppliers',
      Router().use(
        '/nested',
        Router().get('/:id', (_req, res) => res.sendStatus(200))
      )
    );
    expect(inventory(nested)).toEqual([
      {
        method: 'GET',
        path: '/api/v1/suppliers/nested/:id',
        authenticated: true,
        scoped: true,
        guarded: true,
      },
    ]);
  });
});
