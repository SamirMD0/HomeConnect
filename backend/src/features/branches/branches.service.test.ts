import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repo, tx, prismaMock } = vi.hoisted(() => {
  const tx = {
    user: { findUnique: vi.fn() },
    activityLog: { create: vi.fn() },
  };
  return {
    tx,
    prismaMock: { user: tx.user },
    repo: {
      list: vi.fn(),
      listActive: vi.fn(),
      listActiveForUser: vi.fn(),
      find: vi.fn(),
      findByIds: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      listUserAccess: vi.fn(),
      replaceUserAccess: vi.fn(),
      listStaffAccess: vi.fn(),
    },
  };
});
vi.mock('./branches.repository', () => ({ BranchesRepository: repo }));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: (operation: (client: unknown) => Promise<unknown>) => operation(tx),
}));
import { BranchesService } from './branches.service';

const MAIN_ID = '11111111-1111-4111-8111-111111111111';
const CLOSED_ID = '22222222-2222-4222-8222-222222222222';
const OLD_ID = '33333333-3333-4333-8333-333333333333';
const GHOST_ID = '44444444-4444-4444-8444-444444444444';
const admin = { userId: 'admin-1', role: 'ADMIN' };
const employee = { userId: 'emp-1', role: 'EMPLOYEE' };
const main = { id: MAIN_ID, code: 'MAIN', name: 'Main', address: null, phone: null, isActive: true };
const closed = { ...main, id: CLOSED_ID, code: 'OLD', name: 'Old', isActive: false };

describe('BranchesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'false');
    repo.listActive.mockResolvedValue([]);
    tx.user.findUnique.mockResolvedValue({ id: 'emp-1', role: 'EMPLOYEE', deletedAt: null });
    repo.listUserAccess.mockResolvedValue([]);
  });

  it('gives admins every active branch and employees only their granted active branches', async () => {
    repo.listActive.mockResolvedValue([main]);
    repo.listActiveForUser.mockResolvedValue([]);
    expect(await BranchesService.accessibleBranches(admin)).toEqual([main]);
    expect(await BranchesService.accessibleBranches(employee)).toEqual([]);
    expect(repo.listActiveForUser).toHaveBeenCalledWith('emp-1', undefined);
  });

  it('refuses every management operation for non-admins', async () => {
    await expect(BranchesService.list(employee)).rejects.toThrow(/administrators/i);
    await expect(BranchesService.create({ code: 'A', name: 'A' }, employee)).rejects.toThrow(/administrators/i);
    await expect(BranchesService.update(MAIN_ID, { isActive: false }, employee)).rejects.toThrow(/administrators/i);
    await expect(BranchesService.setUserAccess('emp-1', { branchIds: [] }, employee)).rejects.toThrow(/administrators/i);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.replaceUserAccess).not.toHaveBeenCalled();
  });

  it('creates a branch and writes an activity log entry in the same transaction', async () => {
    repo.create.mockResolvedValue(main);
    await BranchesService.create({ code: 'main', name: 'Main' }, admin);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'MAIN', name: 'Main', createdById: 'admin-1' }), tx);
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'admin-1', action: 'BRANCH_CREATE', entityType: 'Branch', entityId: MAIN_ID }),
    });
  });

  it('maps unique-constraint violations to a 409 naming the clashing field', async () => {
    repo.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['code'] },
    }));
    await expect(BranchesService.create({ code: 'MAIN', name: 'Other' }, admin)).rejects.toMatchObject({
      statusCode: 409, code: 'BRANCH_CONFLICT', details: { field: 'code' },
    });
  });

  it('returns 404 when updating a missing branch', async () => {
    repo.find.mockResolvedValue(null);
    await expect(BranchesService.update('nope', { name: 'X' }, admin)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('lists staff with explicit branch ids and marks admins as all-branch', async () => {
    repo.listStaffAccess.mockResolvedValue([
      { id: 'admin-1', username: 'a', fullName: 'A', role: 'ADMIN', isActive: true, branchAccess: [] },
      { id: 'emp-1', username: 'e', fullName: 'E', role: 'EMPLOYEE', isActive: true, branchAccess: [{ branchId: MAIN_ID }] },
    ]);
    const rows = await BranchesService.listStaffAccess(admin);
    expect(rows.map((row) => [row.id, row.allBranches, row.branchIds])).toEqual([
      ['admin-1', true, []],
      ['emp-1', false, [MAIN_ID]],
    ]);
    await expect(BranchesService.listStaffAccess(employee)).rejects.toThrow(/administrators/i);
  });

  it('replaces employee access with de-duplicated, existing, active branches and audits before/after', async () => {
    repo.findByIds.mockResolvedValue([main]);
    repo.listUserAccess
      .mockResolvedValueOnce([{ branchId: OLD_ID, branch: closed, grantedAt: new Date() }])
      .mockResolvedValueOnce([{ branchId: MAIN_ID, branch: main, grantedAt: new Date() }]);
    const result = await BranchesService.setUserAccess('emp-1', { branchIds: [MAIN_ID, MAIN_ID] }, admin);
    expect(repo.replaceUserAccess).toHaveBeenCalledWith('emp-1', [MAIN_ID], 'admin-1', tx);
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'USER_BRANCH_ACCESS_SET', entityId: 'emp-1', details: { before: [OLD_ID], after: [MAIN_ID] } }),
    });
    expect(result.branches.map((branch) => branch.id)).toEqual([MAIN_ID]);
  });

  it('rejects unknown or inactive branches and admin targets without writing', async () => {
    repo.findByIds.mockResolvedValue([]);
    await expect(BranchesService.setUserAccess('emp-1', { branchIds: [GHOST_ID] }, admin)).rejects.toMatchObject({ statusCode: 400 });
    repo.findByIds.mockResolvedValue([closed]);
    await expect(BranchesService.setUserAccess('emp-1', { branchIds: [CLOSED_ID] }, admin)).rejects.toThrow(/inactive/i);
    tx.user.findUnique.mockResolvedValue({ id: 'admin-2', role: 'ADMIN', deletedAt: null });
    await expect(BranchesService.setUserAccess('admin-2', { branchIds: [MAIN_ID] }, admin)).rejects.toThrow(/every branch/i);
    tx.user.findUnique.mockResolvedValue({ id: 'gone', role: 'EMPLOYEE', deletedAt: new Date() });
    await expect(BranchesService.setUserAccess('gone', { branchIds: [] }, admin)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.replaceUserAccess).not.toHaveBeenCalled();
  });
});

describe('single active branch release guard',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED','false');repo.listActive.mockResolvedValue([main]);repo.find.mockResolvedValue(closed);repo.create.mockResolvedValue(main);repo.update.mockResolvedValue(main);});
 it('blocks creating a second active branch while scoping is off',async()=>{
  await expect(BranchesService.create({code:'B',name:'B'},admin)).rejects.toMatchObject({statusCode:409,code:'BRANCH_SCOPING_NOT_RELEASED'});
  expect(repo.create).not.toHaveBeenCalled();
 });
 it('blocks activating a second branch while scoping is off',async()=>{
  await expect(BranchesService.update(CLOSED_ID,{isActive:true},admin)).rejects.toMatchObject({statusCode:409,code:'BRANCH_SCOPING_NOT_RELEASED'});
  expect(repo.update).not.toHaveBeenCalled();
 });
 it('allows inactive branches and permits multiple active branches only with the flag on',async()=>{
  await BranchesService.create({code:'B',name:'B',isActive:false},admin);
  vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED','true');
  await BranchesService.create({code:'B',name:'B'},admin);
  await BranchesService.update(CLOSED_ID,{isActive:true},admin);
  expect(repo.create).toHaveBeenCalledTimes(2);expect(repo.update).toHaveBeenCalledTimes(1);
 });
});

describe('last active branch protection',()=>{
 beforeEach(()=>{vi.clearAllMocks();repo.find.mockResolvedValue(main);repo.listActive.mockResolvedValue([main]);repo.update.mockResolvedValue(main);});
 it.each(['false','true'])('rejects deactivating the last active branch regardless of scoping flag %s',async flag=>{
  vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED',flag);
  await expect(BranchesService.update(MAIN_ID,{isActive:false},admin)).rejects.toMatchObject({statusCode:409,code:'LAST_ACTIVE_BRANCH',message:'At least one branch must stay active'});
  expect(repo.listActive).toHaveBeenCalledWith(tx);expect(repo.update).not.toHaveBeenCalled();expect(tx.activityLog.create).not.toHaveBeenCalled();
 });
 it('allows deactivation when another branch stays active',async()=>{
  repo.listActive.mockResolvedValue([main,{...main,id:CLOSED_ID}]);
  await BranchesService.update(MAIN_ID,{isActive:false},admin);
  expect(repo.update).toHaveBeenCalledWith(MAIN_ID,expect.objectContaining({isActive:false}),tx);
 });
});
