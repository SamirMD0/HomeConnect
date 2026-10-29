import { AppError } from '../../lib/errors';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { service } = vi.hoisted(() => ({
  service: {
    list: vi.fn(),
    accessibleBranches: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getUserAccess: vi.fn(),
    listStaffAccess: vi.fn(),
    setUserAccess: vi.fn(),
  },
}));
vi.mock('./branches.service', () => ({ BranchesService: service }));
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
const branch = { id, code: 'MAIN', name: 'Main', address: null, phone: null, isActive: true };

describe('branch routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.list.mockResolvedValue([branch]);
    service.accessibleBranches.mockResolvedValue([branch]);
    service.get.mockResolvedValue(branch);
    service.create.mockResolvedValue(branch);
    service.update.mockResolvedValue(branch);
    service.getUserAccess.mockResolvedValue({ userId: id, branches: [branch] });
    service.setUserAccess.mockResolvedValue({ userId: id, branches: [branch] });
  });

  it('requires authentication on every branch route', async () => {
    expect((await request(app).get('/api/v1/branches/accessible')).status).toBe(401);
    expect((await request(app).get('/api/v1/branches')).status).toBe(401);
    expect((await request(app).post('/api/v1/branches').send({ code: 'A', name: 'A' })).status).toBe(401);
  });

  it('lets any signed-in user read only the branches they may work in', async () => {
    const response = await request(app).get('/api/v1/branches/accessible').set(auth('EMPLOYEE'));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([branch]);
    expect(service.accessibleBranches).toHaveBeenCalledWith(expect.objectContaining({ userId: id, role: 'EMPLOYEE' }));
  });

  it('makes branch management and access assignment ADMIN-only', async () => {
    const employee = auth('EMPLOYEE');
    expect((await request(app).get('/api/v1/branches').set(employee)).status).toBe(403);
    expect((await request(app).get(`/api/v1/branches/${id}`).set(employee)).status).toBe(403);
    expect((await request(app).post('/api/v1/branches').set(employee).send({ code: 'B', name: 'B' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/branches/${id}`).set(employee).send({ isActive: false })).status).toBe(403);
    expect((await request(app).get('/api/v1/branches/access').set(employee)).status).toBe(403);
    expect((await request(app).get(`/api/v1/branches/users/${id}/access`).set(employee)).status).toBe(403);
    expect((await request(app).put(`/api/v1/branches/users/${id}/access`).set(employee).send({ branchIds: [] })).status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.setUserAccess).not.toHaveBeenCalled();
  });

  it('validates and normalizes admin input before it reaches the service', async () => {
    const admin = auth('ADMIN');
    expect((await request(app).post('/api/v1/branches').set(admin).send({ code: 'bad code!', name: 'X' })).status).toBe(400);
    expect((await request(app).post('/api/v1/branches').set(admin).send({ code: 'A', name: 'A', branchId: id })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/branches/${id}`).set(admin).send({})).status).toBe(400);
    expect((await request(app).put(`/api/v1/branches/users/${id}/access`).set(admin).send({ branchIds: ['nope'] })).status).toBe(400);

    const created = await request(app).post('/api/v1/branches').set(admin).send({ code: ' tyre-1 ', name: ' Tyre ' });
    expect(created.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith({ code: 'TYRE-1', name: 'Tyre' }, expect.objectContaining({ role: 'ADMIN' }));

    const upper = id.toUpperCase();
    await request(app).put(`/api/v1/branches/users/${upper}/access`).set(admin).send({ branchIds: [upper] });
    expect(service.setUserAccess).toHaveBeenCalledWith(id, { branchIds: [id] }, expect.anything());
  });
});

it('returns the LAST_ACTIVE_BRANCH conflict and server message from branch deactivation',async()=>{
 service.update.mockRejectedValueOnce(new AppError('At least one branch must stay active',409,'LAST_ACTIVE_BRANCH'));
 const response=await request(app).patch('/api/v1/branches/'+id).set(auth('ADMIN')).send({isActive:false});
 expect(response.status).toBe(409);expect(response.body.error).toMatchObject({code:'LAST_ACTIVE_BRANCH',message:'At least one branch must stay active'});
});
