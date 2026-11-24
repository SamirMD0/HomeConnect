import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, AuthorizationError, NotFoundError } from '../../lib/errors';
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
  /** False when the destination branch already gives this account number to another customer. */
  followsCustomer?: boolean;
}

export interface BranchTransferPreview {
  customer: { id: string; name: string; phone: string; branchId: string };
  toBranch: { id: string; code: string; name: string };
  counts: MovedCounts;
  /** Trial-balance account links; each follows the customer unless the destination already uses it. */
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
    accountPassword?: string;
    actor: { userId: string; role: string };
    ipAddress?: string | null;
  }) {
    if (input.actor.role !== 'ADMIN') throw new AuthorizationError('Only administrators can transfer customers between branches');

    return runFinancialTransaction((tx) => this.moveInTransaction(tx, input), { timeoutMs: 120_000 });
  }

  /** The caller has authorized the move and owns the transaction. */
  static async moveInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      customerId: string;
      toBranchId: string;
      actor: { userId: string; role: string };
      ipAddress?: string | null;
    }
  ) {
    // Lock the customer first so a concurrent sale or payment cannot slip in mid-move.
    await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${input.customerId}::uuid FOR UPDATE`;
    const plan = await inspect(tx, input.customerId, input.toBranchId);
    if (plan.blocker) throw new AppError(plan.blocker.message, 409, plan.blocker.code);

    const fromBranchId = plan.customer.branchId;
    const to = input.toBranchId;
    await tx.$executeRawUnsafe(`SET LOCAL homeconnect.branch_transfer = 'on'`);
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');

    // An import-account link must point to an import in its own branch, so it is
    // removed here and re-created in the destination once the customer has moved.
    const links = await tx.customerImportAccount.findMany({
      where: { customerId: input.customerId },
      select: {
        accountCode: true,
        sourceCustomerImportId: true,
        createdById: true,
        createdAt: true,
        sourceCustomerImport: { select: { fileName: true, fileHash: true, columnMapping: true, committedAt: true } },
      },
      orderBy: { accountCode: 'asc' },
    });
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
    const { kept, detached } = await reattachImportAccounts(tx, links, {
      customerId: id,
      fromBranchId,
      toBranchId: to,
      actorId: input.actor.userId,
    });
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
          keptImportAccounts: kept,
          detachedImportAccounts: detached,
        } as unknown as Prisma.InputJsonObject,
      },
    });

    // Surfaces any missed row as a clear error here instead of a COMMIT failure.
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    await tx.$executeRawUnsafe(`SET LOCAL homeconnect.branch_transfer = 'off'`);
    return { customerId: id, fromBranchId, toBranchId: to, moved, keptImportAccounts: kept, detachedImportAccounts: detached };
  }
}

type MovingLink = {
  accountCode: string;
  sourceCustomerImportId: string;
  createdById: string;
  createdAt: Date;
  sourceCustomerImport: { fileName: string; fileHash: string; columnMapping: Prisma.JsonValue; committedAt: Date | null };
};

/**
 * Re-creates the customer's trial-balance account links in the destination branch, so
 * the next import still recognises them by account number. Each link points to the
 * destination's import of the same file when there is one; otherwise to a stand-in
 * import record carrying that file's name, hash and commit time, so "last imported"
 * stays as it was. An account number the destination already gives to another
 * customer cannot follow and is reported as detached.
 */
async function reattachImportAccounts(
  tx: Prisma.TransactionClient,
  links: MovingLink[],
  move: { customerId: string; fromBranchId: string; toBranchId: string; actorId: string }
) {
  const kept: DetachedImportAccount[] = [];
  const detached: DetachedImportAccount[] = [];
  const holders = new Map<string, string>();
  for (const link of links) {
    const taken = await tx.customerImportAccount.findUnique({
      where: { branchId_accountCode: { branchId: move.toBranchId, accountCode: link.accountCode } },
      select: { customerId: true },
    });
    if (taken && taken.customerId !== move.customerId) {
      detached.push({ accountCode: link.accountCode, sourceCustomerImportId: link.sourceCustomerImportId, followsCustomer: false });
      continue;
    }
    let holder = holders.get(link.sourceCustomerImportId);
    if (!holder) {
      const source = link.sourceCustomerImport;
      const sameFile = await tx.customerImport.findFirst({
        where: { branchId: move.toBranchId, fileHash: source.fileHash, status: 'COMMITTED' },
        orderBy: { committedAt: 'desc' },
        select: { id: true },
      });
      holder =
        sameFile?.id ??
        (
          await tx.customerImport.create({
            data: {
              branchId: move.toBranchId,
              fileName: source.fileName,
              fileHash: source.fileHash,
              status: 'COMMITTED',
              columnMapping: (source.columnMapping ?? {}) as Prisma.InputJsonValue,
              rows: { headers: [], records: [] },
              result: {
                branchTransfer: {
                  customerId: move.customerId,
                  fromBranchId: move.fromBranchId,
                  sourceCustomerImportId: link.sourceCustomerImportId,
                },
              },
              createdById: move.actorId,
              committedById: move.actorId,
              committedAt: source.committedAt ?? new Date(),
            },
            select: { id: true },
          })
        ).id;
      holders.set(link.sourceCustomerImportId, holder);
    }
    if (!taken)
      await tx.customerImportAccount.create({
        data: {
          branchId: move.toBranchId,
          accountCode: link.accountCode,
          customerId: move.customerId,
          sourceCustomerImportId: holder,
          createdById: link.createdById,
          createdAt: link.createdAt,
        },
      });
    kept.push({ accountCode: link.accountCode, sourceCustomerImportId: holder, followsCustomer: true });
  }
  return { kept, detached };
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
  const links = await db.customerImportAccount.findMany({
    where: { customerId },
    select: { accountCode: true, sourceCustomerImportId: true },
    orderBy: { accountCode: 'asc' },
  });
  const taken = new Set(
    (
      await db.customerImportAccount.findMany({
        where: { branchId: toBranchId, accountCode: { in: links.map((link) => link.accountCode) }, customerId: { not: customerId } },
        select: { accountCode: true },
      })
    ).map((link) => link.accountCode)
  );
  const importAccounts = links.map((link) => ({ ...link, followsCustomer: !taken.has(link.accountCode) }));

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

export async function countHistory(db: Db, id: string): Promise<MovedCounts> {
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
