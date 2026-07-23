import React from 'react';

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  emptyState?: React.ReactNode;
}

export function Table<T>({ data, columns, keyExtractor, onRowClick, emptyState }: TableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm text-slate-600">
        <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-xs">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={`px-6 py-4 whitespace-nowrap ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {data.map((item) => (
            <tr 
              key={keyExtractor(item)} 
              onClick={() => onRowClick && onRowClick(item)}
              className={`group transition-colors ${onRowClick ? 'cursor-pointer hover:bg-slate-50/80' : ''}`}
            >
              {columns.map((col, idx) => (
                <td key={idx} className={`px-6 py-4 ${col.className || ''}`}>
                  {typeof col.accessor === 'function' 
                    ? col.accessor(item) 
                    : (item[col.accessor] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
