import type { BusinessDate } from '../../financial';
import type { ReportsPeriodPreset } from './reports-period';

export interface ReportsMeta {
  from: BusinessDate;
  to: BusinessDate;
  previousFrom: BusinessDate;
  previousTo: BusinessDate;
  preset: ReportsPeriodPreset;
  generatedAt: string;
  currency: 'USD';
}

/** Domain keys are mandatory so unrelated ledgers cannot be flattened together. */
export interface ReportsData<
  Sales = unknown,
  Customers = unknown,
  Suppliers = unknown,
  Inventory = unknown,
  Risk = unknown,
> {
  sales: Sales;
  customers: Customers;
  suppliers: Suppliers;
  inventory: Inventory;
  risk: Risk;
}

export interface ReportsEnvelope<Data extends ReportsData = ReportsData> {
  meta: ReportsMeta;
  data: Data;
}
