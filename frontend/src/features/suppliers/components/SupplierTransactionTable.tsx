import React from 'react';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { SupplierTransaction } from '../types/supplier.types';
import {
  supplierDirectionLabels,
  supplierTransactionStatusLabels,
  supplierTransactionTypeLabels,
} from '../utils/supplier-labels';

interface Props {
  items: SupplierTransaction[];
  canMutate: boolean;
  showSupplier?: boolean;
  onEdit: (transaction: SupplierTransaction) => void;
  onRemove: (transaction: SupplierTransaction) => void;
  onRestore: (transaction: SupplierTransaction) => void;
}

const cellHover =
  'bg-white transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.8)]';

export const SupplierTransactionTable: React.FC<Props> = ({
  items,
  canMutate,
  showSupplier = true,
  onEdit,
  onRemove,
  onRestore,
}) => (
  <>
    <div className="space-y-2 lg:hidden">
      {items.map((transaction) => (
        <TransactionCard
          key={transaction.id}
          {...{ transaction, canMutate, showSupplier, onEdit, onRemove, onRestore }}
        />
      ))}
    </div>

    <div
      className="data-table-scroll data-table-scroll-expanded hidden lg:block"
      data-testid="supplier-ledger-scroll-table"
    >
      <table className="min-w-full border-separate border-spacing-y-1.5 text-xs text-slate-600">
        <thead className="sticky top-0 z-10 bg-slate-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          <tr>
            <Header>Date</Header>
            {showSupplier && <Header>Supplier</Header>}
            <Header>Type</Header>
            <Header>Description</Header>
            <Header right>Amount</Header>
            <Header>Effect</Header>
            <Header>Status</Header>
            <Header right>Actions</Header>
          </tr>
        </thead>
        <tbody>
          {items.map((transaction) => (
            <tr
              key={transaction.id}
              className={`group [filter:drop-shadow(0_1px_1px_rgba(15,23,42,0.05))] ${transaction.status === 'REMOVED' ? 'opacity-70' : ''}`}
            >
              <td className={`whitespace-nowrap rounded-l-md px-4 py-2 ${cellHover}`}>
                {formatBusinessDate(transaction.transactionDate)}
              </td>
              {showSupplier && (
                <td className={`px-4 py-2 ${cellHover}`}>
                  <p className="user-text font-semibold text-slate-900 transition-colors group-hover:text-yellow-300" dir="auto">
                    {transaction.supplier.name}
                  </p>
                  <p className="text-[11px] text-slate-500 transition-colors group-hover:text-yellow-200">
                    {transaction.supplier.phone}
                  </p>
                </td>
              )}
              <td className={`px-4 py-2 ${cellHover}`}>
                {englishLabel(supplierTransactionTypeLabels[transaction.type])}
              </td>
              <td className={`max-w-xs px-4 py-2 ${cellHover}`}>
                <p className="user-text truncate font-medium" dir="auto" title={transaction.description}>
                  {transaction.description}
                </p>
                {transaction.reference && (
                  <p className="user-text text-[11px] text-slate-500 transition-colors group-hover:text-yellow-200" dir="auto">
                    Ref: {transaction.reference}
                  </p>
                )}
              </td>
              <td className={`px-4 py-2 text-right font-semibold tabular-nums ${cellHover}`}>
                {formatMoney(transaction.amount)}
              </td>
              <td className={`px-4 py-2 font-medium ${cellHover} ${transaction.direction === 'INCREASE_OWED' ? 'text-red-700' : 'text-emerald-700'}`}>
                {transaction.direction === 'INCREASE_OWED' ? '+ Owed' : '- Owed'}
              </td>
              <td className={`px-4 py-2 ${cellHover}`}>
                {englishLabel(supplierTransactionStatusLabels[transaction.status])}
              </td>
              <td className={`rounded-r-md px-4 py-2 text-right ${cellHover}`}>
                <Actions {...{ transaction, canMutate, onEdit, onRemove, onRestore }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

const Header: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`whitespace-nowrap px-4 py-2.5 ${right ? 'text-right' : ''}`}>{children}</th>
);

const TransactionCard: React.FC<Omit<Props, 'items'> & { transaction: SupplierTransaction }> = ({
  transaction,
  canMutate,
  showSupplier,
  onEdit,
  onRemove,
  onRestore,
}) => (
  <article
    className={`group rounded-lg border p-3 shadow-sm transition-all duration-200 hover:border-yellow-300 hover:bg-gray-600 hover:shadow-[0_0_14px_rgba(250,204,21,0.3)] ${transaction.status === 'REMOVED' ? 'bg-slate-50 opacity-70' : 'bg-white'}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        {showSupplier && (
          <>
            <p className="user-text font-semibold text-slate-900 transition-colors group-hover:text-yellow-300" dir="auto">
              {transaction.supplier.name}
            </p>
            <p className="text-xs text-slate-500 transition-colors group-hover:text-yellow-200">
              {transaction.supplier.phone}
            </p>
          </>
        )}
        <p className="mt-1 text-xs text-slate-500 transition-colors group-hover:text-yellow-200">
          {formatBusinessDate(transaction.transactionDate)}
        </p>
      </div>
      <p className="font-bold tabular-nums text-slate-900 transition-colors group-hover:text-yellow-300">
        {formatMoney(transaction.amount)}
      </p>
    </div>
    <p className="mt-2 text-sm font-semibold text-slate-800 transition-colors group-hover:text-yellow-300">
      {englishLabel(supplierTransactionTypeLabels[transaction.type])}
    </p>
    <p className="user-text mt-1 text-sm text-slate-600 transition-colors group-hover:text-yellow-200" dir="auto">
      {transaction.description}
    </p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs transition-colors group-hover:border-gray-500">
      <span className="transition-colors group-hover:text-yellow-200">
        {englishLabel(supplierDirectionLabels[transaction.direction])}
      </span>
      <span className="transition-colors group-hover:text-yellow-200">
        {englishLabel(supplierTransactionStatusLabels[transaction.status])}
      </span>
      <Actions {...{ transaction, canMutate, onEdit, onRemove, onRestore }} />
    </div>
  </article>
);

const Actions: React.FC<Omit<Props, 'items' | 'showSupplier'> & { transaction: SupplierTransaction }> = ({
  transaction,
  canMutate,
  onEdit,
  onRemove,
  onRestore,
}) => {
  if (!canMutate) return null;

  const buttonClass =
    'rounded border bg-white px-2.5 py-1.5 text-xs font-semibold transition-all hover:border-yellow-300 hover:bg-gray-600 hover:text-yellow-300 hover:shadow-[0_0_12px_rgba(250,204,21,0.4)] focus:outline-none focus:ring-2 focus:ring-yellow-300/50';

  return (
    <div className="inline-flex gap-2">
      {transaction.status === 'ACTIVE' ? (
        <>
          <button type="button" onClick={() => onEdit(transaction)} className={`${buttonClass} border-slate-200 text-slate-600`}>
            Edit
          </button>
          <button type="button" onClick={() => onRemove(transaction)} className={`${buttonClass} border-red-200 text-red-700`}>
            Remove
          </button>
        </>
      ) : (
        <button type="button" onClick={() => onRestore(transaction)} className={`${buttonClass} border-emerald-200 text-emerald-700`}>
          Restore
        </button>
      )}
    </div>
  );
};

function englishLabel(label: string): string {
  return label.split(' / ')[0];
}
