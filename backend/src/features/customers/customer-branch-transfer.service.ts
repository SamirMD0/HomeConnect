import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, NotFoundError } from '../../lib/errors';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';

type Db = Prisma.TransactionClient | typeof prisma;

/** Rows that follow the customer. Order matters only for readability: links are checked at COMMIT. */
const MOVED_TABLES = [
  'sales_orders',
  'sales_returns',
  'cash_refunds',
  'customer_credits',
  'payments',
  'debts',
  'installment_plans',
  'service_jobs',
] as const;
type MovedTable = (typeof MOVED_TABLES)[number];
export type MovedCounts = Record<MovedTable, number>;

export interface DetachedImportAccount {
  accountCode: string;
  sourceCustomerImportId: string;
}

export interface BranchTransferPreview {
  customer: { id: string; name: string; phone: string; branchId: string };
  toBranch: { id: string; code: string; name: string };
  counts: MovedCounts;
  /** Trial-balance account links tied to the old branch's import; removed by the transfer. */
  importAccounts: DetachedImportAccount[];
  /** Set when the transfer cannot run; the UI shows it instead of the confirm button. */
  blocker: { code: string; message: string } | null;
}

/**
 * Moves a customer and their entire history (sales, returns, refunds, credits,
 * payments, debts, installment plans, service jobs) to another branch.
 *
 * The database normally forbids this: every owned row's branch is immutable
 * and must match its customer's, order's and return's branch. Migration
 * 20261029150000 lets one transaction lift that: it sets
 * homeconnect.branch_transfer (the immutability trigger then allows the
 * change) and defers the branch-closure links to COMMIT. If any linked row is
 * missed, COMMIT fails and nothing changes. Balances are untouched: only
 * branchId moves.
 */
export class CustomerBranchTransferService {
  static async preview(customerId: string, toBranchId: string): Promise<BranchTransferPreview> {
    return inspect(prisma, customerId, toBranchId);
  }

  static async transfer(input: {
    customerId: string;
    toBranchId: string;
    accountPassword: string;
    actor: { userId: string; role: string };
    ipAddress?: string | null;
  }) {
    await verifyAdminPassword(input.actor.userId, input.accountPassword, {
      action: 'CUSTOMER_BRANCH_TRANSFER',
      recordType: 'CUSTOMER',
      recordId: input.customerId,
      ipAddress: input.ipAddress ?? null,
      domainLabel: 'customer branch transfer',
    });

    return runFinancialTransaction(async (tx) => {
      // Lock the customer first so a concurrent sale or payment cannot slip in mid-move.
      await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${input.customerId}::uuid FOR UPDATE`;
      const plan = await inspect(tx, input.customerId, input.toBranchId);
      if (plan.blocker) throw new AppError(plan.blocker.message, 409, plan.blocker.code);

      const fromBranchId = plan.customer.branchId;
      const to = input.toBranchId;
      await tx.$executeRawUnsafe(`SET LOCAL homeconnect.branch_transfer = 'on'`);
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');

      // The import-account link cascades with the customer but must stay in its
      // import's branch, so it cannot follow. Remove it and keep it in the audit.
      await tx.$executeRaw`DELETE FROM "customer_import_accounts" WHERE "customerId" = ${input.customerId}::uuid`;

      // Children before parents: each row's own link check is deferred to
      // COMMIT, and when a parent moves nothing references its old key any
      // more, so the links' ON UPDATE RESTRICT is satisfied. Customer last.
      const id = input.customerId;
      const returnsOfCustomer = Prisma.sql`
        SELECT "id" FROM "sales_returns"
        WHERE "customerId" = ${id}::uuid OR "salesOrderId" IN (SELECT "id" FROM "sales_orders" WHERE "customerId" = ${id}::uuid)`;
      const cashRefunds = await tx.$executeRaw`
        UPDATE "cash_refunds" SET "branchId" = ${to}::uuid
        WHERE "customerId" = ${id}::uuid OR "salesReturnId" IN (${returnsOfCustomer})`;
      const customerCredits = await tx.$executeRaw`
        UPDATE "customer_credits" SET "branchId" = ${to}::uuid
        WHERE "customerId" = ${id}::uuid OR "salesReturnId" IN (${returnsOfCustomer})`;
      const payments = await tx.$executeRaw`
        UPDATE "payments" SET "branchId" = ${to}::uuid
        WHERE "customerId" = ${id}::uuid
           OR "salesOrderId" IN (SELECT "id" FROM "sales_orders" WHERE "customerId" = ${id}::uuid)`;
      const salesReturns = await tx.$executeRaw`
        UPDATE "sales_returns" SET "branchId" = ${to}::uuid
        WHERE "customerId" = ${id}::uuid
           OR "salesOrderId" IN (SELECT "id" FROM "sales_orders" WHERE "customerId" = ${id}::uuid)`;
      const salesOrders = await tx.$executeRaw`
        UPDATE "sales_orders" SET "branchId" = ${to}::uuid WHERE "customerId" = ${id}::uuid`;
      const debts = await tx.$executeRaw`UPDATE "debts" SET "branchId" = ${to}::uuid WHERE "customerId" = ${id}::uuid`;
      const installmentPlans = await tx.$executeRaw`
        UPDATE "installment_plans" SET "branchId" = ${to}::uuid WHERE "customerId" = ${id}::uuid`;
      const serviceJobs = await tx.$executeRaw`
        UPDATE "service_jobs" SET "branchId" = ${to}::uuid WHERE "customerId" = ${id}::uuid`;
      await tx.$executeRaw`UPDATE "customers" SET "branchId" = ${to}::uuid WHERE "id" = ${id}::uuid`;
      const moved: MovedCounts = {
        sales_orders: salesOrders,
        sales_returns: salesReturns,
        cash_refunds: cashRefunds,
        customer_credits: customerCredits,
        payments,
        debts,
        installment_plans: installmentPlans,
        service_jobs: serviceJobs,
      };

      await tx.activityLog.create({
        data: {
          branchId: to,
          userId: input.actor.userId,
          action: 'CUSTOMER_BRANCH_TRANSFERRED',
          entityType: 'CUSTOMER',
          entityId: id,
          ipAddress: input.ipAddress ?? null,
          details: {
            fromBranchId,
            toBranchId: to,
            moved,
            detachedImportAccounts: plan.importAccounts,
          } as unknown as Prisma.InputJsonObject,
        },
      });

      // Surfaces any missed row as a clear error here instead of a COMMIT failure.
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
      return { customerId: id, fromBranchId, toBranchId: to, moved, detachedImportAccounts: plan.importAccounts };
    }, { timeoutMs: 120_000 });
  }
}

async function inspect(db: Db, customerId: string, toBranchId: string): Promise<BranchTransferPreview> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, name: true, phone: true, branchId: true },
  });
  if (!customer) throw new NotFoundError('Customer not found / الزبون غير موجود');
  const toBranch = await db.branch.findUnique({ where: { id: toBranchId }, select: { id: true, code: true, name: true, isActive: true } });
  if (!toBranch) throw new NotFoundError('Branch not found / الفرع غير موجود');

  const counts = await countHistory(db, customerId);
  const importAccounts = await db.customerImportAccount.findMany({
    where: { customerId },
    select: { accountCode: true, sourceCustomerImportId: true },
    orderBy: { accountCode: 'asc' },
  });

  let blocker: BranchTransferPreview['blocker'] = null;
  if (toBranch.id === customer.branchId) {
    blocker = { code: 'CUSTOMER_ALREADY_IN_BRANCH', message: 'The customer already belongs to this branch.' };
  } else if (!toBranch.isActive) {
    blocker = { code: 'BRANCH_INACTIVE', message: 'The destination branch is inactive.' };
  } else if (
    customer.phone &&
    (await db.customer.findFirst({
      where: { branchId: toBranch.id, phone: customer.phone, deletedAt: null, id: { not: customer.id } },
      select: { id: true },
    }))
  ) {
    blocker = {
      code: 'CUSTOMER_PHONE_EXISTS_IN_BRANCH',
      message: 'Another customer in the destination branch already uses this phone number.',
    };
  }

  return {
    customer,
    toBranch: { id: toBranch.id, code: toBranch.code, name: toBranch.name },
    counts,
    importAccounts,
    blocker,
  };
}

async function countHistory(db: Db, id: string): Promise<MovedCounts> {
  const [row] = await db.$queryRaw<Array<Record<MovedTable, number>>>`
    WITH orders AS (SELECT "id" FROM "sales_orders" WHERE "customerId" = ${id}::uuid),
         returns AS (SELECT "id" FROM "sales_returns" WHERE "customerId" = ${id}::uuid OR "salesOrderId" IN (SELECT "id" FROM orders))
    SELECT
      (SELECT count(*) FROM orders)::int AS sales_orders,
      (SELECT count(*) FROM returns)::int AS sales_returns,
      (SELECT count(*) FROM "cash_refunds" WHERE "customerId" = ${id}::uuid OR "salesReturnId" IN (SELECT "id" FROM returns))::int AS cash_refunds,
      (SELECT count(*) FROM "customer_credits" WHERE "customerId" = ${id}::uuid OR "salesReturnId" IN (SELECT "id" FROM returns))::int AS customer_credits,
      (SELECT count(*) FROM "payments" WHERE "customerId" = ${id}::uuid OR "salesOrderId" IN (SELECT "id" FROM orders))::int AS payments,
      (SELECT count(*) FROM "debts" WHERE "customerId" = ${id}::uuid)::int AS debts,
      (SELECT count(*) FROM "installment_plans" WHERE "customerId" = ${id}::uuid)::int AS installment_plans,
      (SELECT count(*) FROM "service_jobs" WHERE "customerId" = ${id}::uuid)::int AS service_jobs`;
  return row;
}
