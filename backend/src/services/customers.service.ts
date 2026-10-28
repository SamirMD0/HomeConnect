import { assertInScope, writeBranch, type BranchScope } from '../features/branches/branch-scope';
import { runFinancialTransaction } from '../features/financial/infrastructure/transaction';
import { CustomersRepository } from '../repositories/customers.repository';
import { AuthorizationError, NotFoundError, ValidationError } from '../lib/errors';
import { Prisma } from '@prisma/client';
import { ReceivablesService } from '../features/financial/receivables/receivables.service';
import { findSearchMatchIds } from '../lib/search-query';

export class CustomersService {
  static async createCustomer(data: { name: string; phone: string; address?: string | null; notes?: string | null; creditLimit?: string | null; createdBy: string }, scope: BranchScope, actor?: { role: string }) {
    assertCreditLimitPermission(data, actor);
    const branchId = writeBranch(scope);
    return runFinancialTransaction(async tx => {
      if (await CustomersRepository.findByPhone(data.phone, branchId, tx)) {
        throw new ValidationError('A customer with this phone number already exists.');
      }
      return CustomersRepository.create({
        branchId,
        name: data.name,
        phone: data.phone,
        address: data.address,
        notes: data.notes,
        createdBy: data.createdBy,
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
      }, tx);
    });
  }

  /**
   * Lists customers, optionally with each one's financial figures attached.
   *
   * The financial figures come from the receivables computation rather than
   * from anything calculated here: the customers list and the receivables page
   * must never disagree about what a customer owes. Enrichment is a single
   * extra call covering the whole page, which is what replaced the previous
   * one-balance-request-per-row behaviour in the UI.
   */
  static async listCustomers(params: {
    skip?: number;
    take?: number;
    search?: string;
    sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'outstanding' | 'overdue' | 'lastPayment';
    sortOrder?: 'asc' | 'desc';
    includeFinancial?: boolean;
    filter?: 'withBalance' | 'overdue' | 'noDebt' | 'inactive';
  }, scope: BranchScope) {
    const { includeFinancial, filter, ...requestedListParams } = params;
    const financialSort = ['outstanding', 'overdue', 'lastPayment'].includes(params.sortBy ?? '');
    const needsFinancialView = financialSort || Boolean(filter);
    const listParams: Parameters<typeof CustomersRepository.findAll>[0] = needsFinancialView
      ? {
          ...requestedListParams,
          skip: undefined,
          take: undefined,
          sortBy: financialSort
            ? 'createdAt'
            : requestedListParams.sortBy as 'name' | 'createdAt' | 'updatedAt' | undefined,
        }
      : requestedListParams as Parameters<typeof CustomersRepository.findAll>[0];
    const [{ customers, total }, namePhoneMatchedIds] = await Promise.all([
      CustomersRepository.findAll(listParams, scope),
      findSearchMatchIds('customerNamePhone', params.search, undefined, scope),
    ]);

    const namePhoneMatchSet = namePhoneMatchedIds === null
      ? null
      : new Set(namePhoneMatchedIds);
    const customersWithMatchInfo = namePhoneMatchSet === null
      ? customers
      : customers.map((customer) => ({
          ...customer,
          matchedInNotesOnly: !namePhoneMatchSet.has(customer.id),
        }));

    if ((!includeFinancial && !needsFinancialView) || customersWithMatchInfo.length === 0) {
      return { customers: customersWithMatchInfo, total };
    }

    const projections = await ReceivablesService.computeReceivableProjections({
      scope,
      customerIds: customersWithMatchInfo.map((customer) => customer.id),
    });

    let enriched = customersWithMatchInfo.map((customer) => ({
        ...customer,
        financial: projections.get(customer.id) ?? null,
      }));

    if (filter === 'withBalance') enriched = enriched.filter((row) => Number(row.financial?.outstanding ?? 0) > 0);
    if (filter === 'overdue') enriched = enriched.filter((row) => Number(row.financial?.overdueAmount ?? 0) > 0);
    if (filter === 'noDebt') enriched = enriched.filter((row) => (row.financial?.openDebtCount ?? 0) === 0 && (row.financial?.activePlanCount ?? 0) === 0);
    if (filter === 'inactive') enriched = enriched.filter((row) => !row.isActive);

    if (financialSort) {
      const direction = params.sortOrder === 'asc' ? 1 : -1;
      enriched.sort((left, right) => {
        if (params.sortBy === 'lastPayment') {
          return direction * String(left.financial?.lastPaymentDate ?? '').localeCompare(String(right.financial?.lastPaymentDate ?? ''));
        }
        const leftValue = Number(params.sortBy === 'overdue' ? left.financial?.overdueAmount : left.financial?.outstanding) || 0;
        const rightValue = Number(params.sortBy === 'overdue' ? right.financial?.overdueAmount : right.financial?.outstanding) || 0;
        return direction * (leftValue - rightValue);
      });
    }

    const filteredTotal = enriched.length;
    if (needsFinancialView) {
      const start = params.skip ?? 0;
      enriched = enriched.slice(start, start + (params.take ?? 10));
    }
    return { customers: enriched, total: needsFinancialView ? filteredTotal : total };
  }

  static async getCustomer(id: string, scope: BranchScope) {
    const customer = await CustomersRepository.findById(id, scope);
    if (!customer) throw new NotFoundError('Customer not found');
    assertInScope(customer.branchId, scope, 'Customer not found');
    return customer;
  }

  static async updateCustomer(id: string, data: { name?: string; phone?: string; address?: string | null; notes?: string | null; creditLimit?: string | null; isActive?: boolean }, scope: BranchScope, actor?: { role: string }) {
    assertCreditLimitPermission(data, actor);
    return runFinancialTransaction(async tx => {
      const customer = await CustomersRepository.findById(id, scope, tx);
      if (!customer) throw new NotFoundError('Customer not found');
      assertInScope(customer.branchId, scope, 'Customer not found');
      writeBranch(scope);
      if (data.phone && data.phone !== customer.phone) {
        if (await CustomersRepository.findByPhone(data.phone, customer.branchId, tx)) {
          throw new ValidationError('A customer with this phone number already exists.');
        }
      }

      const updateData: Prisma.CustomerUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.creditLimit !== undefined) updateData.creditLimit = data.creditLimit;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      return CustomersRepository.update(id, updateData, scope, tx);
    });
  }

  static async deleteCustomer(id: string, scope: BranchScope) {
    return runFinancialTransaction(async tx => {
      const customer = await CustomersRepository.findById(id, scope, tx);
      if (!customer) throw new NotFoundError('Customer not found');
      assertInScope(customer.branchId, scope, 'Customer not found');
      writeBranch(scope);
      return CustomersRepository.softDelete(id, scope, tx);
    });
  }
}

function assertCreditLimitPermission(data: { creditLimit?: string | null }, actor?: { role: string }) {
  if (data.creditLimit !== undefined && actor?.role !== 'ADMIN') {
    throw new AuthorizationError('Only an ADMIN can configure customer credit limits / تعديل حد الائتمان متاح للمسؤول فقط');
  }
}
