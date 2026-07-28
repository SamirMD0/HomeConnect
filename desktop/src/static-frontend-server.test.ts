import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './content-security-policy';
import { ELECTRON_HOST } from './runtime-config';
import { startStaticFrontendServer } from './static-frontend-server';

let server: Server;
let origin: string;
let distPath: string;

beforeAll(async () => {
  distPath = await fs.mkdtemp(path.join(os.tmpdir(), 'homeconnect-frontend-'));
  await fs.writeFile(path.join(distPath, 'index.html'), '<!doctype html><title>ok</title>', 'utf8');
  await fs.mkdir(path.join(distPath, 'assets'), { recursive: true });
  await fs.writeFile(path.join(distPath, 'assets', 'app.js'), 'export const ok = 1;', 'utf8');

  server = await startStaticFrontendServer(distPath, 0);
  const { port } = server.address() as AddressInfo;
  origin = `http://${ELECTRON_HOST}:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(distPath, { recursive: true, force: true });
});

describe('static frontend server security headers', () => {
  it('serves the strict production policy with the document', async () => {
    const response = await fetch(origin);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(
      buildContentSecurityPolicy('production')
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('never serves a policy allowing eval', async () => {
    const response = await fetch(origin);
    const policy = response.headers.get('content-security-policy') ?? '';

    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("script-src 'self'");
  });

  it('applies the policy to assets and to the SPA fallback', async () => {
    const asset = await fetch(`${origin}/assets/app.js`);
    const fallback = await fetch(`${origin}/customers/unknown-route`);

    expect(asset.headers.get('content-security-policy')).toBe(
      buildContentSecurityPolicy('production')
    );
    expect(fallback.status).toBe(200);
    expect(fallback.headers.get('content-security-policy')).toBe(
      buildContentSecurityPolicy('production')
    );
  });
});
