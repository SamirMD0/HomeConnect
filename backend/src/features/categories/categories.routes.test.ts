import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { service } = vi.hoisted(() => ({
  service: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock('./categories.service', () => ({ CategoriesService: service }));
vi.mock('../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));
import { app } from '../../app';
const id = 'abcdefab-1234-4123-8123-123456789abc';
const auth = (role: 'ADMIN' | 'EMPLOYEE') => ({
  Authorization: `Bearer ${jwt.sign({ userId: id, role }, process.env.JWT_SECRET!)}`,
});
const row = { id, name: 'Kitchen', parentId: null, isActive: true, path: 'Kitchen' };
describe('category routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.list.mockResolvedValue([row]);
    service.get.mockResolvedValue(row);
    service.create.mockResolvedValue(row);
    service.update.mockResolvedValue(row);
    service.remove.mockResolvedValue({ id });
  });
  it('requires authentication and lets employees read all categories', async () => {
    expect((await request(app).get('/api/v1/categories')).status).toBe(401);
    expect((await request(app).post('/api/v1/categories').send({ name: 'Kitchen' })).status).toBe(
      401
    );
    expect((await request(app).get('/api/v1/categories').set(auth('EMPLOYEE'))).body.data).toEqual([
      row,
    ]);
    expect((await request(app).get(`/api/v1/categories/${id}`).set(auth('EMPLOYEE'))).status).toBe(
      200
    );
  });
  it('makes every mutation ADMIN-only, with the same endpoint for active/inactive categories', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/categories')
          .set(auth('EMPLOYEE'))
          .send({ name: 'Kitchen' })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/v1/categories/${id}`)
          .set(auth('EMPLOYEE'))
          .send({ isActive: false })
      ).status
    ).toBe(403);
    expect(
      (await request(app).delete(`/api/v1/categories/${id}`).set(auth('EMPLOYEE'))).status
    ).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
    expect(
      (
        await request(app)
          .post('/api/v1/categories')
          .set(auth('ADMIN'))
          .send({ name: ' Kitchen ', parentId: null })
      ).status
    ).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      { name: 'Kitchen', parentId: null },
      expect.objectContaining({ userId: id, role: 'ADMIN' })
    );
    expect(
      (
        await request(app)
          .patch(`/api/v1/categories/${id}`)
          .set(auth('ADMIN'))
          .send({ isActive: false })
      ).status
    ).toBe(200);
    expect((await request(app).delete(`/api/v1/categories/${id}`).set(auth('ADMIN'))).status).toBe(
      200
    );
  });
  it('rejects Arabic schema fields, markup and invalid parent IDs before writing', async () => {
    for (const body of [
      { name: 'Kitchen', nameAr: 'مطبخ' },
      { name: '<b>Kitchen</b>' },
      { name: 'Kitchen', parentId: 'bad' },
    ])
      expect(
        (await request(app).post('/api/v1/categories').set(auth('ADMIN')).send(body)).status
      ).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
