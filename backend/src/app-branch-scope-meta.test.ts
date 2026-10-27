import { mkdirSync, writeFileSync } from 'node:fs';
import express, { Router, type Application } from 'express';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { requireAuth } from './middleware/auth.middleware';
import { branchScopeMiddleware } from './middleware/branch-scope.middleware';
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

// Later checkpoints extend this registry as their prefixes become fully scoped.
const scopedPrefixes = [
  { prefix: '/api/v1/customers', parentGuard: customerParentGuard },
  { prefix: '/api/v1/suppliers', parentGuard: supplierParentGuard },
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
          if (!registration) continue;
          const has = (handle: unknown) =>
            preceding.some(
              (item) =>
                item.handle === handle && (item.path === registration.prefix || item.path === '/')
            );
          for (const method of Object.keys(layer.route.methods)) {
            found.push({
              method: method.toUpperCase(),
              path: fullPath,
              authenticated: has(requireAuth),
              scoped: has(branchScopeMiddleware),
              guarded: has(registration.parentGuard),
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

describe('branch-scope route coverage registry (Phase 3A)', () => {
  let app: Application;
  beforeAll(async () => {
    app = (await import('./app.js')).app;
  }, 30_000);
  it('walks every registered customer and supplier route and requires authentication, scope and parent guards before it', () => {
    const routes = inventory(app);
    expect(scopedPrefixes.map((entry) => entry.prefix)).toEqual([
      '/api/v1/customers',
      '/api/v1/suppliers',
    ]);
    expect(
      routes.filter((route) => route.path.startsWith('/api/v1/customers')).length
    ).toBeGreaterThanOrEqual(18);
    expect(
      routes.filter((route) => route.path.startsWith('/api/v1/suppliers')).length
    ).toBeGreaterThanOrEqual(13);
    for (const route of routes) {
      expect(route.authenticated, route.method + ' ' + route.path).toBe(true);
      expect(route.scoped, route.method + ' ' + route.path).toBe(true);
      expect(route.guarded, route.method + ' ' + route.path).toBe(true);
    }
    mkdirSync('node_modules/.cache/home-connect', { recursive: true });
    writeFileSync(
      'node_modules/.cache/home-connect/phase3a-route-inventory.json',
      JSON.stringify(
        routes.map(({ method, path }) => ({ method, path })),
        null,
        2
      )
    );
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
