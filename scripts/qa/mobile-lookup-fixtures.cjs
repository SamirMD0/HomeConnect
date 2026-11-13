// Synthetic wire data for lookup QA. No shop database, real names, or credentials.
const branchA = '00000000-0000-4000-8000-000000000001';
const branchB = '00000000-0000-4000-8000-000000000002';
const branches = [
  { id: branchA, name: 'Fixture branch A' },
  { id: branchB, name: 'Fixture branch B' },
];
const customerBalances = ['125.50', '0.00', '9050.25'];
const customerPaid = ['74.50', '300.00', '949.75'];
const supplierBalances = ['940.25', '0.00', '-45.50'];
const supplierOwed = ['1500.00', '500.00', '125.00'];
const supplierPaid = ['559.75', '500.00', '170.50'];
const customers = customerBalances.map((balance, i) => ({
  id: `customer-${i + 1}`,
  name: `Fixture Customer ${String.fromCharCode(65 + i)}`,
  phone: `+961 00 000 00${i}`,
  branchId: branchA,
  address: 'Synthetic address',
  notes: 'QA fixture only',
  isActive: true,
  financial: {
    outstanding: balance,
    overdueAmount: '0.00',
    totalPaid: customerPaid[i],
    tier: 'CURRENT',
  },
}));
const suppliers = supplierBalances.map((balance, i) => ({
  id: `supplier-${i + 1}`,
  name: `Fixture Supplier ${String.fromCharCode(65 + i)}`,
  phone: `+961 00 100 00${i}`,
  branchId: branchA,
  companyName: 'Synthetic Supplies',
  email: null,
  notes: 'QA fixture only',
  isActive: true,
  balance,
  summary: {
    balance,
    totalOwed: supplierOwed[i],
    totalPaid: supplierPaid[i],
    totalCredit: '0.00',
    basis: 'lifetime',
    transactionCount: 2,
  },
}));
const extraCustomers = Array.from({ length: 23 }, (_, i) => ({
  ...customers[0],
  id: `extra-c-${i}`,
  name: `Fixture Customer Extra ${String(i + 1).padStart(2, '0')}`,
}));
const extraSuppliers = Array.from({ length: 23 }, (_, i) => ({
  ...suppliers[0],
  id: `extra-s-${i}`,
  name: `Fixture Supplier Extra ${String(i + 1).padStart(2, '0')}`,
}));
const otherCustomer = {
  ...customers[0],
  id: 'branch-b-customer',
  name: 'Branch B customer',
  branchId: branchB,
  financial: { ...customers[0].financial, outstanding: '7777.77' },
};
const otherSupplier = {
  ...suppliers[0],
  id: 'branch-b-supplier',
  name: 'Branch B supplier',
  branchId: branchB,
  balance: '8888.88',
};
function customerFinancial(customer) {
  const i = customers.findIndex((row) => row.id === customer.id),
    balance = customer.financial.outstanding;
  return {
    businessDate: '2026-11-12',
    customer,
    summary: {
      totalOutstanding: balance,
      singleDebtOutstanding: balance,
      installmentPlanOutstanding: '0.00',
      totalPaid: customer.financial.totalPaid,
      totalObligated: ['200.00', '300.00', '10000.00'][i] ?? '7852.27',
      overdueAmount: '0.00',
      totalPrepaidAdminDebt: '0.00',
      activeDebtCount: 1,
      activePrepaidCount: 0,
      activePlanCount: 0,
      overdueDebtCount: 0,
      overdueInstallmentCount: 0,
      nextDueDate: null,
      nextDueAmount: '0.00',
      lastPaymentDate: '2026-11-10',
      daysSinceLastPayment: 2,
    },
    debts: [
      {
        id: `debt-${customer.id}`,
        kind: 'STANDARD',
        description: 'Fixture invoice',
        originalAmount: balance,
        totalPaid: '0.00',
        remainingBalance: balance,
        adminDebt: '0.00',
        dueDate: '2026-12-01',
        calculatedStatus: 'UNPAID',
      },
    ],
    installmentPlans: [],
    overdueItems: [],
    nextDue: null,
    recentPayments: [],
  };
}
function statement(party, range) {
  const isCustomer = 'financial' in party,
    balance = isCustomer ? party.financial.outstanding : party.balance;
  return {
    businessDate: '2026-11-12',
    currency: 'USD',
    [isCustomer ? 'customer' : 'supplier']: party,
    range,
    openingBalance: balance,
    closingBalance: balance,
    entries: [
      {
        id: `entry-${party.id}`,
        type: isCustomer ? 'DEBT' : 'SUPPLIER_DEBT',
        date: '2026-11-10',
        description: 'Synthetic statement row',
        reference: 'QA-1',
        originalAmount: '0.00',
        currency: 'USD',
        exchangeRate: '1.00',
        baseAmount: '0.00',
        balanceEffect: '0.00',
        runningBalance: balance,
        status: 'POSTED',
        dueDate: null,
        reason: null,
      },
    ],
    ...(isCustomer
      ? {
          aging: {
            asOf: range.to,
            total: balance,
            buckets: [{ key: 'current', label: 'Current', amount: balance }],
          },
        }
      : {}),
  };
}
const product = {
  id: 'product-1',
  name: 'Fixture cordless drill',
  model: 'QA-18',
  sku: 'QA-000001',
  barcode: '1234567890128',
  brand: 'Cedar',
  categoryId: 'category-1',
  categoryPath: 'Tools / Drills',
  isActive: true,
  price: '139.00',
  discount: '0.00',
  netPrice: '139.00',
  priceCurrency: 'USD',
  trackStock: true,
  stockQuantity: 12,
  stockStatus: 'IN_STOCK',
  notes: 'Synthetic product',
  pricing: {
    pricingAvailable: true,
    cashPrice: '139.00',
    cashPriceExVat: '125.23',
    cashPriceIncVat: '139.00',
    vatAmount: '13.77',
    installmentPrice: '150.00',
    monthlyPayment: '25.00',
    installmentMonths: 6,
  },
};
const movements = Array.from({ length: 28 }, (_, i) => ({
  id: `movement-${i}`,
  movementType: 'MANUAL_ADD',
  quantityChange: 1,
  quantityBefore: 11,
  quantityAfter: 12,
  reason: 'Synthetic stock entry',
  note: null,
  createdAt: '2026-11-10T09:00:00Z',
}));
const orders = Array.from({ length: 28 }, (_, i) => ({
  id: `order-${i + 1}`,
  branchId: branchA,
  orderNumber: `QA-SO-${String(i + 1).padStart(3, '0')}`,
  orderDate: '2026-11-10',
  deliveryDate: null,
  customerId: customers[0].id,
  customer: customers[0],
  fulfillmentStatus: 'CONFIRMED',
  paymentStatus: 'PARTIALLY_PAID',
  settlement: 'DEBT',
  salesChannel: 'SHOP_DIRECT',
  currency: 'USD',
  totalAmount: '139.00',
  paidAmount: '39.00',
  remainingAmount: '100.00',
  subtotalExVat: '125.23',
  vatAmount: '13.77',
  deliveryFeeIncVat: '0.00',
  deliveryAddressSnapshot: null,
  deliveryNotes: null,
  notes: 'QA only',
  items: [
    {
      id: 'line-1',
      productNameSnapshot: product.name,
      skuSnapshot: product.sku,
      quantity: 1,
      unitPrice: '139.00',
      vatAmount: '13.77',
      lineTotalIncVat: '139.00',
    },
  ],
}));
const bills = [
  {
    id: 'bill-1',
    supplierId: 'supplier-1',
    branchId: branchA,
    supplierReceivingId: null,
    note: 'SYNTHETIC BILL · QA only',
    mime: 'image/png',
    bytes: 100,
    capturedAt: '2026-11-10T09:00:00Z',
  },
];
const purchase = {
  id: 'purchase-1',
  receiptNumber: 'QA-PO-001',
  transactionDate: '2026-11-10',
  dueDate: '2026-12-01',
  amount: '125.50',
  description: 'Fixture purchase',
  status: 'ACTIVE',
  currency: 'USD',
};
const summary = {
  totalAmount: '125.50',
  openingBalance: '125.50',
  closingBalance: '125.50',
  count: 1,
};
const reportRow = {
  id: 'row-1',
  customer: customers[0],
  supplier: suppliers[0],
  date: '2026-11-10',
  amount: '125.50',
  currency: 'USD',
  status: 'POSTED',
};
module.exports = {
  branchA,
  branchB,
  branches,
  customers,
  suppliers,
  extraCustomers,
  extraSuppliers,
  otherCustomer,
  otherSupplier,
  customerFinancial,
  statement,
  product,
  movements,
  orders,
  bills,
  purchase,
  summary,
  reportRow,
};
