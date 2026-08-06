import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repositoryMock, receivablesMock, searchQueryMock } = vi.hoisted(() => ({
  repositoryMock: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByPhone: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  receivablesMock: {
    computeReceivableProjections: vi.fn(),
  },
  searchQueryMock: {
    findSearchMatchIds: vi.fn(),
  },
}));

vi.mock('../repositories/customers.repository', () => ({
  CustomersRepository: repositoryMock,
}));

vi.mock('../features/financial/receivables/receivables.service', () => ({
  ReceivablesService: receivablesMock,
}));

vi.mock('../lib/search-query', () => searchQueryMock);

import { CustomersService } from './customers.service';

const alice = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'محمد سالم عمار',
  phone: '70111111',
};
const bilal = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Bilal Nassar',
  phone: '71222222',
};

function projection(customerId: string, outstanding: string) {
  return {
    customerId,
    tier: 'CURRENT',
    tierReason: 'On track',
    totalObligated: outstanding,
    totalPaid: '0.00',
    outstanding,
    overdueAmount: '0.00',
    openDebtCount: 1,
    activePlanCount: 0,
    overdueItemCount: 0,
    maxOverdueDays: 0,
    nextDueDate: '2026-08-20',
    lastPaymentDate: null,
    daysSinceLastPayment: null,
  };
}

describe('CustomersService.listCustomers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchQueryMock.findSearchMatchIds.mockResolvedValue(null);
  });

  it('leaves the payload lean when financial figures were not requested', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [alice, bilal], total: 2 });

    const result = await CustomersService.listCustomers({ skip: 0, take: 10 });

    expect(result.customers).toEqual([alice, bilal]);
    expect(receivablesMock.computeReceivableProjections).not.toHaveBeenCalled();
  });

  it('attaches each customer their financial figures in one call for the whole page', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [alice, bilal], total: 2 });
    receivablesMock.computeReceivableProjections.mockResolvedValue(
      new Map([
        [alice.id, projection(alice.id, '300.00')],
        [bilal.id, projection(bilal.id, '150.00')],
      ])
    );

    const result = await CustomersService.listCustomers({
      skip: 0,
      take: 10,
      includeFinancial: true,
    });

    // One call, carrying every id on the page: this is what replaced the
    // per-row balance request the customers table used to fire.
    expect(receivablesMock.computeReceivableProjections).toHaveBeenCalledTimes(1);
    expect(receivablesMock.computeReceivableProjections).toHaveBeenCalledWith({
      customerIds: [alice.id, bilal.id],
    });
    expect(result.customers[0]).toMatchObject({
      id: alice.id,
      financial: { outstanding: '300.00', openDebtCount: 1 },
    });
    expect(result.customers[1]).toMatchObject({ id: bilal.id, financial: { outstanding: '150.00' } });
    expect(result.total).toBe(2);
  });

  it('sends null rather than omitting the key when a projection is missing', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [alice], total: 1 });
    receivablesMock.computeReceivableProjections.mockResolvedValue(new Map());

    const result = await CustomersService.listCustomers({
      skip: 0,
      take: 10,
      includeFinancial: true,
    });

    expect(result.customers[0]).toMatchObject({ financial: null });
  });

  it('skips the financial call entirely when the page is empty', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [], total: 0 });

    const result = await CustomersService.listCustomers({
      skip: 0,
      take: 10,
      search: 'no such customer',
      includeFinancial: true,
    });

    expect(result.customers).toEqual([]);
    expect(receivablesMock.computeReceivableProjections).not.toHaveBeenCalled();
  });

  it('does not pass the financial flag down to the repository query', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [], total: 0 });

    await CustomersService.listCustomers({
      skip: 0,
      take: 10,
      search: 'محمد عمار',
      includeFinancial: true,
    });

    expect(repositoryMock.findAll).toHaveBeenCalledWith({
      skip: 0,
      take: 10,
      search: 'محمد عمار',
    });
  });

  it('marks only customers outside the name-and-phone match set as notes-only matches', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [alice, bilal], total: 2 });
    searchQueryMock.findSearchMatchIds.mockResolvedValue([alice.id]);

    const result = await CustomersService.listCustomers({
      skip: 0,
      take: 10,
      search: 'محمد',
    });

    expect(searchQueryMock.findSearchMatchIds).toHaveBeenCalledWith('customerNamePhone', 'محمد');
    expect(result.customers[0]).toMatchObject({ id: alice.id, matchedInNotesOnly: false });
    expect(result.customers[1]).toMatchObject({ id: bilal.id, matchedInNotesOnly: true });
  });

  it('omits notes-only provenance when no search term was sent', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [alice, bilal], total: 2 });

    const result = await CustomersService.listCustomers({ skip: 0, take: 10 });

    expect(result.customers[0]).not.toHaveProperty('matchedInNotesOnly');
    expect(result.customers[1]).not.toHaveProperty('matchedInNotesOnly');
  });

  it('filters and sorts the complete financial result set before pagination', async () => {
    repositoryMock.findAll.mockResolvedValue({ customers: [alice, bilal], total: 2 });
    receivablesMock.computeReceivableProjections.mockResolvedValue(new Map([
      [alice.id, projection(alice.id, '300.00')],
      [bilal.id, projection(bilal.id, '0.00')],
    ]));

    const result = await CustomersService.listCustomers({
      skip: 0, take: 10, includeFinancial: true, filter: 'withBalance',
      sortBy: 'outstanding', sortOrder: 'desc',
    });

    expect(result.total).toBe(1);
    expect(result.customers.map((customer) => customer.id)).toEqual([alice.id]);
    expect(repositoryMock.findAll).toHaveBeenCalledWith(expect.objectContaining({ skip: undefined, take: undefined, sortBy: 'createdAt' }));
  });
});
