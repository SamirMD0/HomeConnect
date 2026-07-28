import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  ReceivableItem,
  ReceivableSortBy,
  ReceivableSortOrder,
} from '../types/receivables.types';
import { ReceivableMobileCard } from './ReceivableMobileCard';
import { ReceivableRow } from './ReceivableRow';

interface ReceivablesTableProps {
  items: ReceivableItem[];
  canMutate: boolean;
  sortBy: ReceivableSortBy;
  sortOrder: ReceivableSortOrder;
  expandedRows: Set<string>;
  onToggleRow: (customerId: string) => void;
  onSort: (sortBy: ReceivableSortBy) => void;
  onRecordPayment: (item: ReceivableItem) => void;
}

interface ColumnDefinition {
  key: string;
  header: string;
  sortKey?: ReceivableSortBy;
  className: string;
  headerClassName?: string;
}

const columns: ColumnDefinition[] = [
  { key: 'expand', header: '', className: 'w-12 px-2' },
  { key: 'customer', header: 'Customer', sortKey: 'name', className: 'px-3' },
  { key: 'standing', header: 'Standing', sortKey: 'standing', className: 'px-3' },
  {
    key: 'outstanding',
    header: 'Outstanding',
    sortKey: 'outstanding',
    className: 'px-3',
    headerClassName: 'text-right',
  },
  {
    key: 'overdue',
    header: 'Overdue',
    sortKey: 'overdue',
    className: 'px-3',
    headerClassName: 'text-right',
  },
  { key: 'bills', header: 'Bills paid', className: 'px-3' },
  { key: 'lastPayment', header: 'Last payment', sortKey: 'lastPayment', className: 'px-3' },
  { key: 'nextDue', header: 'Next due', className: 'hidden px-3 lg:table-cell' },
  { key: 'actions', header: '', className: 'w-14 px-2' },
];

export const ReceivablesTable: React.FC<ReceivablesTableProps> = ({
  items,
  canMutate,
  sortBy,
  sortOrder,
  expandedRows,
  onToggleRow,
  onSort,
  onRecordPayment,
}) => {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  return (
    <>
      <div className="hidden w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm text-slate-600">
          <caption className="sr-only">
            Customer accounts receivable standing, sorted by {sortBy}
          </caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`py-3 font-semibold whitespace-nowrap ${column.className} ${column.headerClassName ?? ''}`}
                  aria-sort={
                    column.sortKey
                      ? column.sortKey === sortBy
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {column.sortKey ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.sortKey as ReceivableSortBy)}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${
                        column.headerClassName === 'text-right' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      {column.header}
                      <SortIcon active={column.sortKey === sortBy} sortOrder={sortOrder} />
                    </button>
                  ) : (
                    <span className={column.header ? '' : 'sr-only'}>
                      {column.header || 'Row actions'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <ReceivableRow
                key={item.customer.id}
                item={item}
                isExpanded={expandedRows.has(item.customer.id)}
                onToggle={onToggleRow}
                canMutate={canMutate}
                onRecordPayment={onRecordPayment}
                openMenuKey={openMenuKey}
                onOpenMenuChange={setOpenMenuKey}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <ReceivableMobileCard
            key={item.customer.id}
            item={item}
            isExpanded={expandedRows.has(item.customer.id)}
            onToggle={onToggleRow}
            canMutate={canMutate}
            onRecordPayment={onRecordPayment}
          />
        ))}
      </div>
    </>
  );
};

const SortIcon: React.FC<{ active: boolean; sortOrder: ReceivableSortOrder }> = ({
  active,
  sortOrder,
}) => {
  if (!active) {
    return <ChevronsUpDown className="h-3 w-3 text-slate-400" aria-hidden="true" />;
  }

  return sortOrder === 'asc' ? (
    <ArrowUp className="h-3 w-3 text-emerald-600" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3 text-emerald-600" aria-hidden="true" />
  );
};
