import React from 'react';
import { FinancialSummaryTotals } from '../../../features/customer-financial/types/customer-financial.types';
import { formatMoney } from '../../../features/customer-financial/utils/financial-format';

export const CustomerMonthStatusCard: React.FC<{ month: NonNullable<FinancialSummaryTotals['month']> }> = ({ month }) => <section className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="font-semibold">This month / هذا الشهر</h3><div className="mt-3 grid grid-cols-3 gap-3 text-sm"><div>Added<br/><strong>{formatMoney(month.debtAdded)}</strong></div><div>Paid<br/><strong>{formatMoney(month.paid)}</strong></div><div>Remaining<br/><strong>{formatMoney(month.remaining)}</strong></div></div>{month.isSettled && <p className="mt-3 text-sm text-emerald-700">Fully settled / مسدد بالكامل</p>}</section>;
