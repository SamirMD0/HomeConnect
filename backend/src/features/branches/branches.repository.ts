import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

type Client = Prisma.TransactionClient | typeof prisma;

export const branchSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BranchSelect;

export class BranchesRepository {
  static list(client: Client = prisma) {
    return client.branch.findMany({
      select: { ...branchSelect, _count: { select: { userAccess: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }
  static listActive(client: Client = prisma) {
    return client.branch.findMany({
      where: { isActive: true },
      select: branchSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
  static listActiveForUser(userId: string, client: Client = prisma) {
    return client.branch.findMany({
      where: { isActive: true, userAccess: { some: { userId } } },
      select: branchSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
  static find(id: string, client: Client = prisma) {
    return client.branch.findUnique({ where: { id }, select: branchSelect });
  }
  static findByIds(ids: string[], client: Client = prisma) {
    return client.branch.findMany({ where: { id: { in: ids } }, select: branchSelect });
  }
  static create(data: Prisma.BranchUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.branch.create({ data, select: branchSelect });
  }
  static update(id: string, data: Prisma.BranchUncheckedUpdateInput, tx: Prisma.TransactionClient) {
    return tx.branch.update({ where: { id }, data, select: branchSelect });
  }
  static listUserAccess(userId: string, client: Client = prisma) {
    return client.userBranchAccess.findMany({
      where: { userId },
      select: { branchId: true, grantedAt: true, branch: { select: branchSelect } },
      orderBy: { branch: { name: 'asc' } },
    });
  }
  static listStaffAccess(client: Client = prisma) {
    return client.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        branchAccess: { select: { branchId: true } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  }
  static async replaceUserAccess(userId: string, branchIds: string[], grantedById: string, tx: Prisma.TransactionClient) {
    await tx.userBranchAccess.deleteMany({ where: { userId, branchId: { notIn: branchIds } } });
    const existing = await tx.userBranchAccess.findMany({ where: { userId }, select: { branchId: true } });
    const have = new Set(existing.map((row) => row.branchId));
    const added = branchIds.filter((id) => !have.has(id));
    if (added.length) {
      await tx.userBranchAccess.createMany({ data: added.map((branchId) => ({ userId, branchId, grantedById })) });
    }
  }
}
