export type DashboardActivityModule = 'customers' | 'payments' | 'debts' | 'suppliers' | 'service' | 'products' | 'pricing';

export interface DashboardActivityItem {
  id: string;
  module: DashboardActivityModule;
  action: string;
  entityId: string;
  title: string;
  amount?: string;
  occurredAt: string;
  actor: string;
  route: string;
}

export interface DashboardActivityData {
  items: DashboardActivityItem[];
}

