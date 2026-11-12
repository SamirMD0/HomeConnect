/** Read-only report metadata mirrored from desktop reports.registry.ts and report-rows.api.ts. */
export const REPORT_CATALOG = [
  {
    id: 'sales-summary',
    title: 'Sales Summary',
    description:
      'Day by day: orders, gross sales, returns, net sales, money collected, and what was left unpaid.',
    category: 'sales',
    kind: 'rows',
    slice: 'sales-summary',
  },
  {
    id: 'sales-by-product',
    title: 'Sales by Product',
    description: 'Units sold, returns, VAT and net sales for each product, best sellers first.',
    category: 'sales',
    kind: 'rows',
    slice: 'sales-by-product',
  },
  {
    id: 'sales-by-customer',
    title: 'Sales by Customer',
    description:
      'Orders, sales, payments and the balance still owed for each customer, with their share of total sales.',
    category: 'sales',
    kind: 'rows',
    slice: 'sales-by-customer',
  },
  {
    id: 'cash-flow',
    title: 'Cash Flow',
    description:
      'Money in from customers against money out to suppliers and refunds, by payment method and day by day.',
    category: 'finance',
    kind: 'rows',
    slice: 'cash-flow',
  },
  {
    id: 'profit',
    title: 'Gross Profit',
    description:
      "Net sales minus cost of goods for each product, with margin. Uses each product's current cost price.",
    category: 'finance',
    kind: 'rows',
    slice: 'profit',
  },
  {
    id: 'suppliers-paid',
    title: 'Suppliers Paid',
    description:
      'Suppliers we paid in the period: what we owed at the start, new bills, payments, and what we still owe.',
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-paid',
  },
  {
    id: 'suppliers-not-paid',
    title: 'Suppliers Not Paid',
    description:
      'Suppliers we still owe but did not pay at all in the period, largest balance first.',
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-not-paid',
  },
  {
    id: 'inventory-valuation',
    title: 'Stock Valuation',
    description:
      'What the stock on hand is worth at cost and at selling price, product by product. A live snapshot.',
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-valuation',
    operational: true,
  },
  {
    id: 'low-stock',
    title: 'Low Stock and Reorder',
    description:
      'Products at or below their reorder level, with recent sales and a suggested order quantity. A live snapshot.',
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-low-stock',
    operational: true,
  },
  {
    id: 'monthly-review',
    title: 'Monthly Review',
    description:
      'Sales, customer and supplier movement, inventory, and risk for the selected period, with a comparison against the previous period.',
    category: 'overview',
    kind: 'review',
  },
  {
    id: 'analysis',
    title: 'Analysis Portal',
    description:
      'Compares customer debt, supplier debt, sales, and inventory against the previous period, and explains the risks it finds.',
    category: 'overview',
    kind: 'analysis',
  },
  {
    id: 'receivables-aging',
    title: 'Receivables Aging',
    description:
      'Every unpaid debt banded by how long it has been outstanding since it was raised, from 0–7 days through 90+.',
    category: 'customers',
    kind: 'rows',
    slice: 'customers-aging',
  },
  {
    id: 'customers-not-paid',
    title: 'Customers Who Did Not Pay',
    description:
      'Customers carrying a balance who made no payment in the period, with their movement and risk labels.',
    category: 'customers',
    kind: 'rows',
    slice: 'customers-not-paid',
  },
  {
    id: 'customers-paid',
    title: 'Customers Who Paid',
    description:
      'Customers who paid during the period, how much they paid, and what they still owe.',
    category: 'customers',
    kind: 'rows',
    slice: 'customers-paid',
  },
  {
    id: 'products-bought',
    title: 'Products Bought',
    description:
      'Product lines received from suppliers in the period, in quantities. Receiving carries no cost, so no purchase value is shown.',
    category: 'inventory',
    kind: 'rows',
    slice: 'products-bought',
  },
  {
    id: 'product-cost-changes',
    title: 'Product Cost Changes',
    description:
      'Audited cost changes with old/new selling price, pricing mode, actor, and source purchase.',
    category: 'inventory',
    kind: 'rows',
    slice: 'products-cost-changes',
  },
  {
    id: 'new-customers',
    title: 'New Customers',
    description: 'Every customer added during the period, with phone and account status.',
    category: 'customers',
    kind: 'rows',
    slice: 'customers-new',
  },
  {
    id: 'customer-debts',
    title: 'Customer Debts',
    description:
      'What each customer still owes at the end of the period, with amounts due, overdue, and the date they last paid.',
    category: 'customers',
    kind: 'rows',
    slice: 'customers-debts',
  },
  {
    id: 'customer-financial-integrity',
    title: 'Customer Financial Integrity',
    description:
      'Compares the customer balance shown by Home Connect with an independent sum of obligations minus live payment allocations.',
    category: 'customers',
    kind: 'rows',
    slice: 'customers-financial-integrity',
    operational: true,
  },
  {
    id: 'customer-payments',
    title: 'Customer Payments',
    description: 'Every payment collected during the period, with method and reference.',
    category: 'customers',
    kind: 'rows',
    slice: 'customers-payments',
  },
  {
    id: 'customer-debt-snapshot',
    title: 'Customer Debt Snapshot',
    description:
      'Point-in-time month-end snapshot per customer, including installment plans and overdue counts.',
    category: 'customers',
    kind: 'legacy-debts',
  },
  {
    id: 'financial-activity',
    title: 'Financial Activity',
    description: 'Every debt, installment plan, and payment created during a month, in date order.',
    category: 'customers',
    kind: 'legacy-activity',
  },
  {
    id: 'supplier-debts',
    title: 'Supplier Ledger',
    description:
      'Supplier debts and payments posted during the period, with receipt numbers and running direction.',
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-debts',
  },
  {
    id: 'supplier-aging',
    title: 'Supplier Payables Aging',
    description:
      'Current payables after report-only FIFO settlement, by due date; unscheduled balances and excess credit remain visible. Stored base USD values; no ledger changes.',
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-aging',
    operational: true,
  },
  {
    id: 'supplier-financial-integrity',
    title: 'Supplier Financial Integrity',
    description:
      'Compares each displayed supplier balance with an independent sum of active increases minus active decreases.',
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-financial-integrity',
    operational: true,
  },
  {
    id: 'supplier-receiving',
    title: 'Supplier Receiving',
    description:
      'Receiving documents posted in the period, their line and quantity totals, and any linked supplier debt.',
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-receiving',
  },
  {
    id: 'sales',
    title: 'Sales Report',
    description:
      'Every sales order in the period with payment and fulfillment status, total, paid, and remaining.',
    category: 'sales',
    kind: 'rows',
    slice: 'sales-orders',
  },
  {
    id: 'unpaid-sales',
    title: 'Unpaid Sales',
    description:
      'Sales orders that still carry a balance. This is a live backlog, not a record of the selected period.',
    category: 'sales',
    kind: 'rows',
    slice: 'sales-unpaid',
    operational: true,
  },
  {
    id: 'stock-movements',
    title: 'Stock Movements',
    description:
      'Every stock movement in the period by type, with the balance before and after each change.',
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-movements',
  },
  {
    id: 'receiving-reconciliation',
    title: 'Receiving Reconciliation',
    description:
      'Checks each received line against the stock movement that recorded it, and lists any that disagree.',
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-reconciliation',
  },
] as const;
export const REPORT_PATHS = {
  'customers-new': 'customers/new',
  'customers-debts': 'customers/debts',
  'customers-payments': 'customers/payments',
  'customers-aging': 'customers/receivables-aging',
  'customers-not-paid': 'customers/not-paid',
  'customers-paid': 'customers/paid',
  'suppliers-debts': 'suppliers/debts',
  'suppliers-aging': 'suppliers/payables-aging',
  'suppliers-receiving': 'suppliers/receiving',
  'sales-orders': 'sales/orders',
  'sales-unpaid': 'sales/unpaid',
  'inventory-movements': 'inventory/movements',
  'inventory-reconciliation': 'inventory/reconciliation',
  'products-bought': 'products/bought',
  'products-cost-changes': 'products/cost-changes',
  'customers-financial-integrity': 'customers/financial-integrity',
  'suppliers-financial-integrity': 'suppliers/financial-integrity',
  'sales-summary': 'sales/summary',
  'sales-by-product': 'sales/by-product',
  'sales-by-customer': 'sales/by-customer',
  profit: 'sales/profit',
  'cash-flow': 'finance/cash-flow',
  'inventory-valuation': 'inventory/valuation',
  'inventory-low-stock': 'inventory/low-stock',
  'suppliers-paid': 'suppliers/paid',
  'suppliers-not-paid': 'suppliers/not-paid',
} as const;
