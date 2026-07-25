type FinancialUserRole = 'ADMIN' | 'EMPLOYEE' | string | null | undefined;

export function isFinancialAdmin(role: FinancialUserRole): boolean {
  return role === 'ADMIN';
}

export function canRecordDebtPayment(status: string): boolean {
  return status !== 'PAID' && status !== 'CANCELLED';
}

export function canCancelDebt(status: string, totalPaid: string): boolean {
  return status !== 'PAID' && status !== 'CANCELLED' && totalPaid === '0.00';
}

export function canRecordInstallmentPlanPayment(status: string): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

export function canCancelInstallmentPlan(status: string, totalPaid: string): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED' && totalPaid === '0.00';
}
