import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Keep the legacy activity adapter until dashboard Recent Activity is handled
// in its separately approved task.
const p = prisma as any;
export const activityLogModel: any = p.activityLog;
