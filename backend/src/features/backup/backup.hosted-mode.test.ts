import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

vi.hoisted(() => { process.env.HOSTED_MODE = 'true'; });

describe('hosted mode backup routing', () => {
  afterAll(() => { delete process.env.HOSTED_MODE; });

  it('does not expose backup routes', async () => {
    expect((await request(app).get('/api/v1/admin/backups')).status).toBe(404);
  });
});
