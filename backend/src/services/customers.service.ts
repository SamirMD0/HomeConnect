import { CustomersRepository } from '../repositories/customers.repository';
import { NotFoundError, ValidationError } from '../lib/errors';
import { Prisma } from '@prisma/client';
import { ReceivablesService } from '../features/financial/receivables/receivables.service';
import { findSearchMatchIds } from '../lib/search-query';

export class CustomersService {
  static async createCustomer(data: { name: string; phone: string; address?: string | null; notes?: string | null; createdBy: string }) {
    const existingPhone = await CustomersRepository.findByPhone(data.phone);
    if (existingPhone) {
      throw new ValidationError('A customer with this phone number already exists.');
    }

    return CustomersRepository.create({
      name: data.name,
      phone: data.phone,
      address: data.address,
      notes: data.notes,
      createdBy: data.createdBy,
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
  }) {
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
      CustomersRepository.findAll(listParams),
      findSearchMatchIds('customerNamePhone', params.search),
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

  static async getCustomer(id: string) {
    const customer = await CustomersRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    return customer;
  }

  static async updateCustomer(id: string, data: { name?: string; phone?: string; address?: string | null; notes?: string | null; isActive?: boolean }) {
    const customer = await CustomersRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    if (data.phone && data.phone !== customer.phone) {
      const existingPhone = await CustomersRepository.findByPhone(data.phone);
      if (existingPhone) {
        throw new ValidationError('A customer with this phone number already exists.');
      }
    }

    const updateData: Prisma.CustomerUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return CustomersRepository.update(id, updateData);
  }

  static async deleteCustomer(id: string) {
    const customer = await CustomersRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    return CustomersRepository.softDelete(id);
  }
}
