import { useCallback, useMemo, useState } from 'react';

export function useExpandedRows(initialRows: string[] = []) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set(initialRows));

  const toggleRow = useCallback((rowId: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const collapseRow = useCallback((rowId: string) => {
    setExpandedRows((current) => {
      if (!current.has(rowId)) return current;
      const next = new Set(current);
      next.delete(rowId);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      expandedRows,
      isExpanded: (rowId: string) => expandedRows.has(rowId),
      toggleRow,
      collapseRow,
    }),
    [collapseRow, expandedRows, toggleRow]
  );
}
