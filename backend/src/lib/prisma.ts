import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Workaround: Prisma names its interactive transaction method `$transaction`,
// which conflicts with a model also named `Transaction`. TypeScript's TS server
// gets confused and reports `prisma.transaction` as missing. We cast once here
// so the rest of the codebase doesn't need workarounds.
const p = prisma as any;
export const transactionModel: any = p.transaction;
export const activityLogModel: any = p.activityLog;
