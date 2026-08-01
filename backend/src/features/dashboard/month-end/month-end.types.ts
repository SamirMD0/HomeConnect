export interface MonthEndMovement {
  opening: string;
  newAmount: string;
  collected: string;
  adjustments: string;
  closing: string;
  reconciled: boolean;
}

export interface MonthEndData {
  month: string;
  disclosure: {
    en: string;
    ar: string;
  };
  customers: MonthEndMovement & {
    withDebt: number;
    fullyPaid: number;
    overdue: number;
  };
  suppliers: MonthEndMovement & {
    withBalance: number;
  };
  service: {
    opened: number;
    completed: number;
    pending: number;
    cancelled: number;
    netOpen: number;
    averageDaysOpen: number;
  };
}

