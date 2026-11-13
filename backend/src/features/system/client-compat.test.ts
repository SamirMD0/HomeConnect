import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import http from 'node:http';
import { version, build } from '../../../../package.json';
import { app } from '../../app';
import { createMobileApiGateway } from '../scanner/mobile-api-gateway';
vi.mock('../../lib/prisma', () => ({ prisma: {}, activityLogModel: {} }));

describe('public client compatibility handshake', () => {
  it('ships version metadata beside the compiled backend in the PC installer', () => {
    expect(build.extraResources).toContainEqual({
      from: 'package.json',
      to: 'dist/server/package.json',
    });
  });
  it('returns package version and minimum mobile version without auth or a DB probe', async () => {
    const response = await request(app).get('/api/v1/system/client-compat');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ apiVersion: version, minMobileVersion: '1.2.0' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('works through the LAN gateway without a JWT', async () => {
    const desktop = http.createServer(app);
    await new Promise<void>((resolve) => desktop.listen(0, '127.0.0.1', resolve));
    try {
      const lan = express().use(
        createMobileApiGateway((desktop.address() as { port: number }).port)
      );
      const response = await request(lan).get('/api/v1/system/client-compat');
      expect(response.status).toBe(200);
      expect(response.body.data.apiVersion).toBe(version);
    } finally {
      await new Promise<void>((resolve) => desktop.close(() => resolve()));
    }
  });
});
