import { Currency, DebtKind, DebtStatus, Prisma } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../lib/errors';
import { normalizeSearchTerm } from '../../lib/search-normalize';
import { BranchesService, type BranchActor } from '../branches/branches.service';
import { DebtsRepository } from '../financial/debts/debts.repository';
import { isPaymentAllocationVoided } from '../financial/domain/balances';
import { moneyToApiString, sumMoney } from '../financial/domain/money';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { CustomerBranchTransferService, countHistory } from './customer-branch-transfer.service';
import { loadCustomerBalances } from './customer-import-balance';
import type { CustomerMergeInput } from '../../validators/customers.validator';

type Client = Prisma.TransactionClient;
const nameKey = (name: string) => normalizeSearchTerm(name).trim();

/** Standard debts with nothing paid or credited: the only ones a merge may cancel. */
async function unpaidDebts(customerIds: string[], tx: Client) {
  const debts = await tx.debt.findMany({
    where: {
      customerId: { in: customerIds },
      kind: DebtKind.STANDARD,
      status: { not: DebtStatus.CANCELLED },
      cancelledAt: null,
      returnAllocations: { none: {} },
      creditApplications: { none: {} },
    },
    select: {
      id: true,
      customerId: true,
      currency: true,
      originalAmount: true,
      paymentAllocations: {
        select: { voidedAt: true, payment: { select: { voidedAt: true } } },
      },
    },
  });
  return debts.filter(
    (debt) => debt.paymentAllocations.every((allocation) => isPaymentAllocationVoided(allocation))
  );
}
const byCurrency = (rows: Array<{ currency: Currency; amount: Prisma.Decimal }>) =>
  ([Currency.USD, Currency.LBP] as Currency[])
    .map((currency) => {
      const amounts = rows.filter((row) => row.currency === currency).map((row) => row.amount);
      return { currency, amount: moneyToApiString(sumMoney(amounts, currency), currency) };
    })
    .filter((row) => Number(row.amount) !== 0);

async function requireAccessibleBranches(actor: BranchActor, tx: Client) {
  const user = await tx.user.findUnique({
    where: { id: actor.userId },
    select: { role: true, isActive: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt) throw new NotFoundError('Customer not found');
  return BranchesService.accessibleBranches({ userId: actor.userId, role: user.role }, tx);
}

export class CustomerMergeService {
  /** The customer and everyone sharing their name, with what the admin needs to choose. */
  static async candidates(customerId: string, actor: BranchActor) {
    return runFinancialTransaction(async (tx) => {
      const branches = await requireAccessibleBranches(actor, tx);
      const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
      const live = await tx.customer.findMany({
        where: { deletedAt: null, branchId: { in: [...branchNames.keys()] } },
        select: { id: true, name: true, phone: true, branchId: true },
      });
      const self = live.find((customer) => customer.id === customerId);
      if (!self) throw new NotFoundError('Customer not found');
      const same = live.filter((customer) => nameKey(customer.name) === nameKey(self.name));
      const ids = same.map((customer) => customer.id);
      const [balances, unpaid] = await Promise.all([
        loadCustomerBalances(ids, tx),
        unpaidDebts(ids, tx),
      ]);
      const customers = await Promise.all(
        same.map(async (customer) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          branchId: customer.branchId,
          branchName: branchNames.get(customer.branchId) ?? '',
          balances: byCurrency(
            (balances.get(customer.id)?.obligations ?? []).map((item) => ({
              currency: item.currency,
              amount: item.remaining,
            }))
          ),
          cancellable: byCurrency(
            unpaid
              .filter((debt) => debt.customerId === customer.id)
              .map((debt) => ({ currency: debt.currency, amount: debt.originalAmount }))
          ),
          counts: await countHistory(tx, customer.id),
        }))
      );
      return { customerId, customers };
    });
  }

  /**
   * Folds one record into another. The kept record's branch, name and phone stay;
   * the other record's whole history moves to it and the record is archived, so
   * no payment or sale is lost. All of it commits together or not at all.
   */
  static async merge(
    keepId: string,
    input: CustomerMergeInput,
    actor: BranchActor,
    ipAddress?: string | null
  ) {
    const mergeId = input.mergeCustomerId;
    if (keepId === mergeId) throw new ValidationError('Choose two different customers');
    return runFinancialTransaction(
      async (tx) => {
        const branches = await requireAccessibleBranches(actor, tx);
        const accessible = new Set(branches.map((branch) => branch.id));
        // Both locked, in a fixed order, so no sale or payment slips in mid-merge.
        for (const id of [keepId, mergeId].sort())
          await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const found = await tx.customer.findMany({
          where: { id: { in: [keepId, mergeId] }, deletedAt: null },
        });
        const keep = found.find((customer) => customer.id === keepId);
        const merged = found.find((customer) => customer.id === mergeId);
        if (!keep || !merged || !accessible.has(keep.branchId) || !accessible.has(merged.branchId))
          throw new NotFoundError('Customer not found');
        if (nameKey(keep.name) !== nameKey(merged.name))
          throw new AppError(
            'Only customers with the same name can be merged',
            409,
            'CUSTOMER_MERGE_NAME_MISMATCH'
          );

        const cancelled =
          input.balance === 'KEEP_ONLY' ? await unpaidDebts([merged.id], tx) : [];
        for (const debt of cancelled)
          await DebtsRepository.cancelDebt(tx, debt.id, {
            cancelledAt: new Date(),
            cancelledById: actor.userId,
            cancelReason: 'Merged into customer ' + keep.name,
          });

        const links = await tx.customerImportAccount.findMany({ where: { customerId: merged.id } });
        await tx.customerImportAccount.deleteMany({ where: { customerId: merged.id } });
        // The same phone cannot exist twice in a branch; the kept record takes it below.
        await tx.customer.update({ where: { id: merged.id }, data: { phone: '' } });
        if (merged.branchId !== keep.branchId)
          await CustomerBranchTransferService.moveInTransaction(tx, {
            customerId: merged.id,
            toBranchId: keep.branchId,
            actor,
            ipAddress,
          });

        await tx.$executeRawUnsafe(`SET LOCAL homeconnect.customer_merge = 'on'`);
        const where = { customerId: merged.id };
        const data = { customerId: keep.id };
        const moved = {
          debts: (await tx.debt.updateMany({ where, data })).count,
          installment_plans: (await tx.installmentPlan.updateMany({ where, data })).count,
          sales_orders: (await tx.salesOrder.updateMany({ where, data })).count,
          payments: (await tx.payment.updateMany({ where, data })).count,
          sales_returns: (await tx.salesReturn.updateMany({ where, data })).count,
          cash_refunds: (await tx.cashRefund.updateMany({ where, data })).count,
          customer_credits: (await tx.customerCredit.updateMany({ where, data })).count,
          credit_applications: (await tx.customerCreditApplication.updateMany({ where, data })).count,
          service_jobs: (await tx.serviceJob.updateMany({ where, data })).count,
          corrections: (await tx.financialCorrectionAudit.updateMany({ where, data })).count,
        };
        await tx.$executeRawUnsafe(`SET LOCAL homeconnect.customer_merge = 'off'`);

        // An account link must name an import in its own branch.
        let linkImportId: string | null = null;
        for (const link of links) {
          const existing = await tx.customerImportAccount.findUnique({
            where: { branchId_accountCode: { branchId: keep.branchId, accountCode: link.accountCode } },
          });
          if (existing && existing.customerId !== keep.id)
            throw new AppError(
              'Account ' + link.accountCode + ' already belongs to another customer in this branch',
              409,
              'CUSTOMER_MERGE_ACCOUNT_CONFLICT'
            );
          if (existing) continue;
          if (link.branchId !== keep.branchId && !linkImportId)
            linkImportId = (
              await tx.customerImport.create({
                data: {
                  branchId: keep.branchId,
                  fileName: 'Customer merge',
                  fileHash: 'customer-merge:' + merged.id,
                  status: 'COMMITTED',
                  columnMapping: {},
                  rows: { headers: [], records: [] },
                  result: { mergedCustomerId: merged.id, keptCustomerId: keep.id },
                  createdById: actor.userId,
                  committedById: actor.userId,
                  committedAt: new Date(),
                },
              })
            ).id;
          await tx.customerImportAccount.create({
            data: {
              branchId: keep.branchId,
              accountCode: link.accountCode,
              customerId: keep.id,
              sourceCustomerImportId:
                link.branchId === keep.branchId ? link.sourceCustomerImportId : linkImportId!,
              createdById: actor.userId,
            },
          });
        }

        await tx.customer.update({
          where: { id: keep.id },
          data: {
            ...(keep.phone ? {} : { phone: merged.phone }),
            ...(keep.address ? {} : { address: merged.address }),
            ...(keep.notes ? {} : { notes: merged.notes }),
          },
        });
        await tx.customer.update({ where: { id: merged.id }, data: { deletedAt: new Date() } });
        await tx.activityLog.create({
          data: {
            branchId: keep.branchId,
            userId: actor.userId,
            action: 'CUSTOMER_MERGED',
            entityType: 'Customer',
            entityId: keep.id,
            ipAddress: ipAddress ?? null,
            details: {
              mergedCustomerId: merged.id,
              mergedCustomerName: merged.name,
              mergedCustomerPhone: merged.phone,
              mergedFromBranchId: merged.branchId,
              balance: input.balance,
              cancelledDebtIds: cancelled.map((debt) => debt.id),
              accountCodes: links.map((link) => link.accountCode),
              moved,
            },
          },
        });
        return { customerId: keep.id, mergedCustomerId: merged.id, cancelledDebts: cancelled.length, moved };
      },
      { timeoutMs: 120_000 }
    );
  }
}
