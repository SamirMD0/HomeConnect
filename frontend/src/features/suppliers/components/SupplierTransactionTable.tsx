import React from 'react';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { SupplierTransaction } from '../types/supplier.types';
import { supplierDirectionLabels, supplierTransactionStatusLabels, supplierTransactionTypeLabels } from '../utils/supplier-labels';

interface Props {
  items: SupplierTransaction[];
  canMutate: boolean;
  showSupplier?: boolean;
  onEdit: (transaction: SupplierTransaction) => void;
  onRemove: (transaction: SupplierTransaction) => void;
  onRestore: (transaction: SupplierTransaction) => void;
}

export const SupplierTransactionTable: React.FC<Props> = ({ items, canMutate, showSupplier = true, onEdit, onRemove, onRestore }) => (
  <>
    <div className="space-y-3 lg:hidden">
      {items.map((transaction) => <TransactionCard key={transaction.id} {...{ transaction, canMutate, showSupplier, onEdit, onRemove, onRestore }} />)}
    </div>
    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Date / التاريخ</th>{showSupplier && <th className="px-4 py-3">Supplier / المورّد</th>}<th className="px-4 py-3">Type / النوع</th><th className="px-4 py-3">Description / الوصف</th><th className="px-4 py-3 text-right">Amount / المبلغ</th><th className="px-4 py-3">Effect / الأثر</th><th className="px-4 py-3">Status / الحالة</th><th className="px-4 py-3 text-right">Actions / الإجراءات</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{items.map((transaction) => <tr key={transaction.id} className={transaction.status === 'REMOVED' ? 'bg-slate-50 text-slate-500' : ''}>
          <td className="whitespace-nowrap px-4 py-3">{formatBusinessDate(transaction.transactionDate)}</td>
          {showSupplier && <td className="px-4 py-3"><p className="user-text font-semibold" dir="auto">{transaction.supplier.name}</p><p className="text-xs text-slate-500">{transaction.supplier.phone}</p></td>}
          <td className="px-4 py-3">{supplierTransactionTypeLabels[transaction.type]}</td>
          <td className="max-w-xs px-4 py-3"><p className="user-text truncate font-medium" dir="auto" title={transaction.description}>{transaction.description}</p>{transaction.reference && <p className="user-text text-xs text-slate-500" dir="auto">Ref: {transaction.reference}</p>}</td>
          <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(transaction.amount)}</td>
          <td className={`px-4 py-3 font-medium ${transaction.direction === 'INCREASE_OWED' ? 'text-red-700' : 'text-emerald-700'}`}>{transaction.direction === 'INCREASE_OWED' ? '+ Owed / مستحق' : '- Owed / مسدّد'}</td>
          <td className="px-4 py-3">{supplierTransactionStatusLabels[transaction.status]}</td>
          <td className="px-4 py-3 text-right"><Actions {...{ transaction, canMutate, onEdit, onRemove, onRestore }} /></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>
);

const TransactionCard: React.FC<Omit<Props, 'items'> & { transaction: SupplierTransaction }> = ({ transaction, canMutate, showSupplier, onEdit, onRemove, onRestore }) => <article className={`rounded-lg border p-4 shadow-sm ${transaction.status === 'REMOVED' ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}>
  <div className="flex items-start justify-between gap-3"><div>{showSupplier && <><p className="user-text font-semibold" dir="auto">{transaction.supplier.name}</p><p className="text-xs text-slate-500">{transaction.supplier.phone}</p></>}<p className="mt-1 text-xs text-slate-500">{formatBusinessDate(transaction.transactionDate)}</p></div><p className="font-bold tabular-nums">{formatMoney(transaction.amount)}</p></div>
  <p className="mt-3 text-sm font-semibold">{supplierTransactionTypeLabels[transaction.type]}</p><p className="user-text mt-1 text-sm" dir="auto">{transaction.description}</p>
  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs"><span>{supplierDirectionLabels[transaction.direction]}</span><span>{supplierTransactionStatusLabels[transaction.status]}</span><Actions {...{ transaction, canMutate, onEdit, onRemove, onRestore }} /></div>
</article>;

const Actions: React.FC<Omit<Props, 'items'|'showSupplier'> & { transaction: SupplierTransaction }> = ({ transaction, canMutate, onEdit, onRemove, onRestore }) => {
  if (!canMutate) return null;
  return <div className="inline-flex gap-2">{transaction.status === 'ACTIVE' ? <><button onClick={() => onEdit(transaction)} className="rounded border px-2.5 py-1.5 hover:bg-slate-50">Edit / تعديل</button><button onClick={() => onRemove(transaction)} className="rounded border border-red-200 px-2.5 py-1.5 text-red-700 hover:bg-red-50">Remove / حذف</button></> : <button onClick={() => onRestore(transaction)} className="rounded border border-emerald-200 px-2.5 py-1.5 text-emerald-700 hover:bg-emerald-50">Restore / استعادة</button>}</div>;
};
