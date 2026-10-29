import type { PrismaClient } from '@prisma/client';
import { isIsolatedTestDatabase } from './database';

/** A durable fixture owner keeps individual test-user cleanup independent. */
export async function branchFixture(db: PrismaClient): Promise<string> {
  if (!isIsolatedTestDatabase(process.env.DATABASE_URL))
    throw new Error('Branch fixtures require an isolated test database');
  const branches = await db.branch.findMany({ where: { isActive: true }, select: { id: true } });
  if (branches.length > 1) throw new Error('Expected one active fixture branch');
  if (branches.length === 1) return branches[0].id;
  const owner = await db.user.upsert({
    where: { username: '__branch_fixture_owner__' },
    update: {},
    create: {
      username: '__branch_fixture_owner__',
      fullName: 'Branch fixture owner',
      password: 'unused fixture account',
      role: 'ADMIN',
    },
  });
  const branch = await db.branch.upsert({
    where: { code: 'TEST_MAIN' },
    update: { isActive: true },
    create: { code: 'TEST_MAIN', name: 'Test main branch', createdById: owner.id },
  });
  return branch.id;
}
export async function branchFixtureRows<T extends object>(
  db: PrismaClient,
  rows: T[]
): Promise<Array<T & { branchId: string }>> {
  const branchId = await branchFixture(db);
  return rows.map((row) => ({ ...row, branchId }));
}
