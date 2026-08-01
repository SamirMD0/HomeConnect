import type { ReactNode } from 'react';
export function SectionState({ isLoading, isError, isEmpty, onRetry, emptyText, children }: { isLoading: boolean; isError: boolean; isEmpty?: boolean; onRetry: () => void; emptyText: string; children: ReactNode }) {
  if (isLoading) return <div className="grid min-h-64 grid-cols-1 gap-3 md:grid-cols-2"><div className="animate-pulse rounded-lg bg-slate-100" /><div className="animate-pulse rounded-lg bg-slate-100" /></div>;
  if (isError) return <div className="dashboard-state"><p>Unable to load this section / تعذر تحميل هذا القسم</p><button onClick={onRetry}>Retry</button></div>;
  if (isEmpty) return <div className="dashboard-state"><p>{emptyText}</p></div>;
  return <>{children}</>;
}

