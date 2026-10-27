import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { multiBranchScopingEnabled } from './branch-config';
import { BranchesRepository } from './branches.repository';
import {
  createBranchSchema,
  setUserBranchAccessSchema,
  updateBranchSchema,
  type CreateBranchInput,
  type SetUserBranchAccessInput,
  type UpdateBranchInput,
} from './branches.validator';

export interface BranchActor {
  userId: string;
  role: string;
}

function assertAdmin(actor: BranchActor) {
  if (actor.role !== Role.ADMIN) throw new AuthorizationError('Only administrators can manage branches');
}

export class BranchesService {
  static async list(actor: BranchActor) {
    assertAdmin(actor);
    return (await BranchesRepository.list()).map(({ _count, ...branch }) => ({
      ...branch,
      assignedUserCount: _count.userAccess,
    }));
  }

  /**
   * Branches the user may work in. ADMIN: every active branch. EMPLOYEE: active
   * branches explicitly granted. Always read from the database so a revoked
   * grant or a deactivated branch takes effect on the next request.
   */
  static async accessibleBranches(user: BranchActor, tx?: Prisma.TransactionClient) {
    return user.role === Role.ADMIN
      ? BranchesRepository.listActive(tx)
      : BranchesRepository.listActiveForUser(user.userId, tx);
  }

  static async get(id: string, actor: BranchActor) {
    assertAdmin(actor);
    const branch = await BranchesRepository.find(id);
    if (!branch) throw new NotFoundError('Branch not found');
    return branch;
  }

  static async create(input: CreateBranchInput, actor: BranchActor) {
    assertAdmin(actor);
    const values = createBranchSchema.parse(input);
    return runFinancialTransaction(async (tx) => {
      await assertSingleActiveBranch(values.isActive ?? true, undefined, tx);
      const branch = await BranchesRepository.create({
        id: randomUUID(),
        code: values.code,
        name: values.name,
        address: values.address ?? null,
        phone: values.phone ?? null,
        isActive: values.isActive ?? true,
        createdById: actor.userId,
      }, tx);
      await audit(tx, actor, 'BRANCH_CREATE', 'Branch', branch.id, { after: branch });
      return branch;
    }).catch(mapBranchError);
  }

  static async update(id: string, input: UpdateBranchInput, actor: BranchActor) {
    assertAdmin(actor);
    const values = updateBranchSchema.parse(input);
    return runFinancialTransaction(async (tx) => {
      const before = await BranchesRepository.find(id, tx);
      if (!before) throw new NotFoundError('Branch not found');
      if (before.isActive && values.isActive === false) {
        const active = await BranchesRepository.listActive(tx);
        if (!active.some(branch => branch.id !== id)) {
          throw new AppError('At least one branch must stay active', 409, 'LAST_ACTIVE_BRANCH');
        }
      }
      if(values.isActive === true && !before.isActive) await assertSingleActiveBranch(true, id, tx);
      const branch = await BranchesRepository.update(id, { ...values, updatedById: actor.userId }, tx);
      await audit(tx, actor, 'BRANCH_UPDATE', 'Branch', id, { before, after: branch });
      return branch;
    }).catch(mapBranchError);
  }

  static async listStaffAccess(actor: BranchActor) {
    assertAdmin(actor);
    return (await BranchesRepository.listStaffAccess()).map(({ branchAccess, ...user }) => ({
      ...user,
      allBranches: user.role === Role.ADMIN,
      branchIds: branchAccess.map((row) => row.branchId),
    }));
  }

  static async getUserAccess(userId: string, actor: BranchActor) {
    assertAdmin(actor);
    const user = await findLiveUser(userId);
    const rows = await BranchesRepository.listUserAccess(userId);
    return {
      userId,
      role: user.role,
      allBranches: user.role === Role.ADMIN,
      branches: rows.map((row) => ({ ...row.branch, grantedAt: row.grantedAt })),
    };
  }

  static async setUserAccess(userId: string, input: SetUserBranchAccessInput, actor: BranchActor) {
    assertAdmin(actor);
    const branchIds = [...new Set(setUserBranchAccessSchema.parse(input).branchIds)];
    return runFinancialTransaction(async (tx) => {
      const user = await findLiveUser(userId, tx);
      if (user.role === Role.ADMIN) {
        throw new ValidationError('Administrators already access every branch; branch access applies to employees only');
      }
      const branches = await BranchesRepository.findByIds(branchIds, tx);
      const found = new Map(branches.map((branch) => [branch.id, branch]));
      const missing = branchIds.filter((id) => !found.has(id));
      if (missing.length) throw new ValidationError('One or more branches do not exist', { branchIds: missing });
      const inactive = branches.filter((branch) => !branch.isActive).map((branch) => branch.id);
      if (inactive.length) throw new ValidationError('Inactive branches cannot be granted', { branchIds: inactive });
      const before = (await BranchesRepository.listUserAccess(userId, tx)).map((row) => row.branchId);
      await BranchesRepository.replaceUserAccess(userId, branchIds, actor.userId, tx);
      await audit(tx, actor, 'USER_BRANCH_ACCESS_SET', 'User', userId, { before, after: branchIds });
      const rows = await BranchesRepository.listUserAccess(userId, tx);
      return {
        userId,
        role: user.role,
        allBranches: false,
        branches: rows.map((row) => ({ ...row.branch, grantedAt: row.grantedAt })),
      };
    });
  }
}

async function findLiveUser(userId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { id: true, role: true, deletedAt: true } });
  if (!user || user.deletedAt) throw new NotFoundError('User not found');
  return user;
}

function audit(
  tx: Prisma.TransactionClient,
  actor: BranchActor,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>
) {
  return tx.activityLog.create({
    data: { userId: actor.userId, action, entityType, entityId, details: details as Prisma.InputJsonObject },
  });
}

function mapBranchError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
    const field = target.includes('code') ? 'code' : 'name';
    throw new AppError(`Another branch already uses this ${field}`, 409, 'BRANCH_CONFLICT', { field });
  }
  throw error;
}

async function assertSingleActiveBranch(activating:boolean, exceptId:string|undefined, tx:Prisma.TransactionClient) {
  if(!activating || multiBranchScopingEnabled())return;
  const active=await BranchesRepository.listActive(tx);
  if(active.some(branch=>branch.id!==exceptId))throw new AppError('Branch separation is not released yet. Only one branch may be active.',409,'BRANCH_SCOPING_NOT_RELEASED');
}
