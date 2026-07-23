import React, { useState } from 'react';
import { useCustomerTransactions } from '../hooks/useTransactions';
import { TransactionType } from '../types';

interface TransactionListProps {
  customerId: string;
  onPayDebt?: (parentId: string) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({ customerId, onPayDebt }) => {
  const { data: response, isLoading, error } = useCustomerTransactions(customerId);
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL');

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-slate-500">Loading transactions...</div>;
  }

  if (error) {
    return <div className="py-4 text-center text-sm text-red-500">Failed to load transactions</div>;
  }

  const transactions = response?.data || [];
  const filtered = filterType === 'ALL' ? transactions : transactions.filter(t => t.type === filterType);

  if (transactions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500 bg-white rounded-lg border border-slate-200 mt-4">
        No transactions found for this customer.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-slate-900">Transaction History</h3>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="rounded-md border-0 py-1.5 pl-3 pr-8 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-white"
          >
            <option value="ALL">All Types</option>
            <option value="SALE">Sales</option>
            <option value="PAYMENT">Payments</option>
            <option value="ADJUSTMENT">Adjustments</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <table className="min-w-full divide-y divide-slate-300">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">Date</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Type</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Description</th>
              <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900">Amount</th>
              <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filtered.map((transaction) => {
              const amountColor = 
                transaction.type === 'PAYMENT' ? 'text-green-600' :
                transaction.type === 'SALE' ? 'text-red-600' : 'text-slate-600';
                
              const sign = transaction.type === 'PAYMENT' ? '-' : '+';
              
              const dateObj = new Date(transaction.date);
              const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              const totalPaid = transaction.payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
              const remaining = Number(transaction.amount) - totalPaid;

              return (
                <React.Fragment key={transaction.id}>
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-slate-500 sm:pl-6">
                    {dateStr}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-medium">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      transaction.type === 'SALE' ? 'bg-red-50 text-red-700 ring-red-600/10' :
                      transaction.type === 'PAYMENT' ? 'bg-green-50 text-green-700 ring-green-600/20' :
                      'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                    }`}>
                      {transaction.type}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-500">
                    <div className="max-w-xs truncate" title={transaction.description}>
                      {transaction.description}
                    </div>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-4 text-sm font-medium text-right ${amountColor}`}>
                    <div className="flex flex-col items-end">
                      <span>{sign}{Number(transaction.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      {transaction.type === 'SALE' && totalPaid > 0 && (
                        <span className="text-xs text-slate-500 font-normal mt-0.5">Bal: ${remaining.toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-semibold text-slate-900 text-right">
                    {transaction.runningBalance?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    {transaction.type === 'SALE' && onPayDebt && (
                      <div className="mt-2">
                        {remaining <= 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded text-slate-500 bg-slate-100">
                            Paid
                          </span>
                        ) : (
                          <button
                            onClick={() => onPayDebt(transaction.id)}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-emerald-700 bg-emerald-100 hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {/* Nested Payments */}
                {transaction.payments && transaction.payments.length > 0 && transaction.payments.map((payment: any) => {
                  const pDateObj = new Date(payment.date);
                  const pDateStr = pDateObj.toLocaleDateString() + ' ' + pDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={payment.id} className="bg-slate-50/50 text-sm border-t-0">
                      <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm text-slate-500 sm:pl-10 border-t-0">
                        <span className="text-slate-300 mr-2">↳</span>
                        {pDateStr}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium border-t-0"></td>
                      <td className="px-3 py-3 text-sm text-slate-500 border-t-0">
                        {payment.description}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-right text-emerald-600 border-t-0">
                        -${Number(payment.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 border-t-0"></td>
                    </tr>
                  );
                })}
                </React.Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-sm text-slate-500">
                  No transactions match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
