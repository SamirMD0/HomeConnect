import React from 'react';
import { Link } from 'react-router-dom';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { SupplierTransaction } from '../types/supplier.types';
import {
  supplierDirectionLabels,
  supplierTransactionStatusLabels,
  supplierTransactionTypeLabels,
} from '../utils/supplier-labels';
import { BranchRowLabel } from '../../branches/scope/branch-ui';

interface Props {
  items: SupplierTransaction[];
  canMutate: boolean;
  showSupplier?: boolean;
  onEdit: (transaction: SupplierTransaction) => void;
  onRemove: (transaction: SupplierTransaction) => void;
  onRestore: (transaction: SupplierTransaction) => void;
}

const cellHover =
  'bg-white transition-all duration-200 group-hover:bg-brand-50 group-hover:text-slate-900';

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
        <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold text-slate-700">
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
                  <p className="user-text font-semibold text-slate-900 transition-colors group-hover:text-slate-900" dir="auto">
                    {transaction.supplier.name}
                  </p>
                  <p className="text-[11px] text-slate-500 transition-colors group-hover:text-slate-900">
                    {transaction.supplier.phone}
                  </p>
                  <BranchRowLabel branchId={transaction.branchId} />
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
                  <p className="user-text text-[11px] text-slate-500 transition-colors group-hover:text-slate-900" dir="auto">
                    Ref: {transaction.reference}
                  </p>
                )}
                {transaction.supplierReceiving && <ReceivingLink transaction={transaction} />}
              </td>
              <td className={`px-4 py-2 text-right font-semibold tabular-nums ${cellHover}`}>
                {formatMoney(transaction.amount)}
              </td>
              <td className={`px-4 py-2 font-medium ${cellHover} ${transaction.direction === 'INCREASE_OWED' ? 'text-red-700' : 'text-brand-700'}`}>
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
    className={`group rounded-lg border p-3 shadow-sm transition-all duration-200 hover:border-brand-300 hover:bg-brand-50 hover:shadow-md ${transaction.status === 'REMOVED' ? 'bg-slate-50 opacity-70' : 'bg-white'}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        {showSupplier && (
          <>
            <p className="user-text font-semibold text-slate-900 transition-colors group-hover:text-slate-900" dir="auto">
              {transaction.supplier.name}
            </p>
            <p className="text-xs text-slate-500 transition-colors group-hover:text-slate-900">
              {transaction.supplier.phone}
            </p>
          </>
        )}
        <p className="mt-1 text-xs text-slate-500 transition-colors group-hover:text-slate-900">
          {formatBusinessDate(transaction.transactionDate)}
        </p>
      </div>
      <p className="font-bold tabular-nums text-slate-900 transition-colors group-hover:text-slate-900">
        {formatMoney(transaction.amount)}
      </p>
    </div>
    <p className="mt-2 text-sm font-semibold text-slate-800 transition-colors group-hover:text-slate-900">
      {englishLabel(supplierTransactionTypeLabels[transaction.type])}
    </p>
    {/* whitespace-pre-line keeps a purchase's English and Arabic halves on
        their own lines. The compact table row above stays truncated on purpose. */}
    <p className="user-text mt-1 whitespace-pre-line text-sm text-slate-600 transition-colors group-hover:text-slate-900" dir="auto">
      {transaction.description}
    </p>
    {transaction.supplierReceiving && <ReceivingLink transaction={transaction} />}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs transition-colors group-hover:border-slate-500">
      <span className="transition-colors group-hover:text-slate-900">
        {englishLabel(supplierDirectionLabels[transaction.direction])}
      </span>
      <span className="transition-colors group-hover:text-slate-900">
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
    'rounded border bg-white px-2.5 py-1.5 text-xs font-semibold transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500/50';

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
        <button type="button" onClick={() => onRestore(transaction)} className={`${buttonClass} border-brand-200 text-brand-700`}>
          Restore
        </button>
      )}
    </div>
  );
};

function englishLabel(label: string): string {
  return label.split(' / ')[0];
}

const ReceivingLink: React.FC<{ transaction: SupplierTransaction }> = ({ transaction }) => {
  const receiving = transaction.supplierReceiving;
  if (!receiving) return null;
  const products = receiving.items.map((item) => `${item.product.name} ×${item.quantity}`).join(', ');
  return <Link title={products} to={`/inventory/receiving/${receiving.id}`} className="mt-1 block max-w-xs truncate text-[11px] font-semibold text-emerald-700 hover:underline group-hover:text-slate-900">Receiving: {receiving.referenceNumber || receiving.receivedOn} · {products} / عرض مستند الإدخال</Link>;
};
