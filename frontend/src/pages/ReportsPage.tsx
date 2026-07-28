import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MonthlyActivityReportTable } from '../features/reports/components/MonthlyActivityReportTable';
import { MonthlyDebtReportFilters } from '../features/reports/components/MonthlyDebtReportFilters';
import { MonthlyDebtReportTable } from '../features/reports/components/MonthlyDebtReportTable';
import {
  MonthlyActivitySummaryCards,
  MonthlyDebtSummaryCards,
} from '../features/reports/components/ReportSummaryCards';
import { ReportEmptyState, ReportErrorState, ReportLoadingState } from '../features/reports/components/ReportStates';
import { monthlyReportsApi } from '../features/reports/api/monthly-reports.api';
import {
  monthlyReportsQueryKeyPrefix,
  useMonthlyDebtReport,
  useMonthlyFinancialActivity,
} from '../features/reports/hooks/useMonthlyReports';
import {
  MonthlyDebtReportFilters as MonthlyDebtReportFiltersType,
  MonthlyDebtReportData,
  MonthlyFinancialActivityData,
  ReportType,
} from '../features/reports/types/monthly-reports.types';
import { currentMonthValue } from '../features/reports/utils/report-query';

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState<ReportType>('MONTHLY_DEBT_SNAPSHOT');
  const [debtFilters, setDebtFilters] = useState<MonthlyDebtReportFiltersType>({
    month: currentMonthValue(),
    page: 1,
    limit: 50,
    sortBy: 'OUTSTANDING',
    sortOrder: 'DESC',
    includeZero: false,
    includeCancelled: false,
    overdueOnly: false,
  });
  const activityFilters = {
    month: debtFilters.month,
    page: debtFilters.page,
    limit: debtFilters.limit,
  };
  const debtReport = useMonthlyDebtReport(debtFilters);
  const activityReport = useMonthlyFinancialActivity(activityFilters);
  const activeQuery = reportType === 'MONTHLY_DEBT_SNAPSHOT' ? debtReport : activityReport;

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Reports are admin-only</h1>
        <p className="mt-2 text-sm">
          Financial reports expose global customer debt and payment totals, so access is restricted to admins.
        </p>
      </div>
    );
  }

  const refreshReports = () => {
    void queryClient.invalidateQueries({ queryKey: monthlyReportsQueryKeyPrefix });
  };

  const goToPage = (page: number) => {
    setDebtFilters((current) => ({ ...current, page }));
  };

  const handleExportCsv = async () => {
    try {
      const blob = await monthlyReportsApi.exportMonthlyDebtCsv(debtFilters);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `monthly-debts-${debtFilters.month}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('CSV export failed');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 report-print-root">
      <style media="print">{printStyles}</style>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500 print:hidden">
            Month-end debt snapshots and monthly financial activity.
          </p>
          <div className="hidden print:block">
            <p className="text-sm text-slate-600">Home Connects</p>
            <p className="text-sm text-slate-600">
              Generated {new Date().toLocaleString('en-GB')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setReportType('MONTHLY_DEBT_SNAPSHOT')}
            className={tabClass(reportType === 'MONTHLY_DEBT_SNAPSHOT')}
          >
            Monthly Debt Snapshot
          </button>
          <button
            type="button"
            onClick={() => setReportType('MONTHLY_FINANCIAL_ACTIVITY')}
            className={tabClass(reportType === 'MONTHLY_FINANCIAL_ACTIVITY')}
          >
            Monthly Activity
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="text-sm text-slate-600">
          {reportType === 'MONTHLY_DEBT_SNAPSHOT'
            ? 'Snapshot answers how much each customer still owed at month end.'
            : 'Activity answers what obligations and payments happened during the month.'}
        </div>
        <div className="flex flex-wrap gap-2">
          {reportType === 'MONTHLY_DEBT_SNAPSHOT' && (
            <button
              type="button"
              onClick={() => {
                void handleExportCsv();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      <MonthlyDebtReportFilters filters={debtFilters} onChange={setDebtFilters} onRefresh={refreshReports} />

      {activeQuery.isLoading && !activeQuery.data ? (
        <ReportLoadingState />
      ) : activeQuery.isError || !activeQuery.data ? (
        <ReportErrorState onRetry={() => void activeQuery.refetch()} />
      ) : reportType === 'MONTHLY_DEBT_SNAPSHOT' ? (
        <DebtReportContent
          data={debtReport.data as MonthlyDebtReportData}
          onOpenCustomer={(customerId) => navigate(`/customers/${customerId}`)}
          onPage={goToPage}
        />
      ) : (
        <ActivityReportContent data={activityReport.data as MonthlyFinancialActivityData} onPage={goToPage} />
      )}
    </div>
  );
};

const DebtReportContent: React.FC<{
  data: MonthlyDebtReportData;
  onOpenCustomer: (customerId: string) => void;
  onPage: (page: number) => void;
}> = ({ data, onOpenCustomer, onPage }) => (
  <>
    <div className="print:block">
      <h2 className="hidden text-xl font-semibold text-slate-900 print:block">
        Monthly Customer Debt Report
      </h2>
      <p className="hidden text-sm text-slate-600 print:block">
        Month {data.summary.month} · Snapshot date {data.summary.cutoffDate}
      </p>
    </div>
    <MonthlyDebtSummaryCards summary={data.summary} />
    {data.rows.length === 0 ? (
      <ReportEmptyState />
    ) : (
      <MonthlyDebtReportTable report={data} onOpenCustomer={onOpenCustomer} />
    )}
    <ReportPagination pagination={data.pagination} onPage={onPage} />
  </>
);

const ActivityReportContent: React.FC<{
  data: MonthlyFinancialActivityData;
  onPage: (page: number) => void;
}> = ({ data, onPage }) => (
  <>
    <div className="print:block">
      <h2 className="hidden text-xl font-semibold text-slate-900 print:block">
        Monthly Financial Activity
      </h2>
      <p className="hidden text-sm text-slate-600 print:block">
        Month {data.summary.month} · {data.summary.startDate} to {data.summary.endDate}
      </p>
    </div>
    <MonthlyActivitySummaryCards summary={data.summary} />
    {data.items.length === 0 ? <ReportEmptyState /> : <MonthlyActivityReportTable report={data} />}
    <ReportPagination pagination={data.pagination} onPage={onPage} />
  </>
);

const ReportPagination: React.FC<{
  pagination: { page: number; totalPages: number; total: number };
  onPage: (page: number) => void;
}> = ({ pagination, onPage }) => (
  <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between print:hidden">
    <p>
      Page {pagination.page} of {pagination.totalPages} · {pagination.total} row
      {pagination.total === 1 ? '' : 's'}
    </p>
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onPage(Math.max(1, pagination.page - 1))}
        disabled={pagination.page <= 1}
        className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Previous
      </button>
      <button
        type="button"
        onClick={() => onPage(Math.min(pagination.totalPages, pagination.page + 1))}
        disabled={pagination.page >= pagination.totalPages}
        className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" />
      </button>
    </div>
  </div>
);

function tabClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
    active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`;
}

const printStyles = `
  body { background: white !important; font-family: Tahoma, Arial, sans-serif !important; }
  aside, header, .print\\:hidden { display: none !important; }
  main { padding: 0 !important; overflow: visible !important; }
  .report-print-root { max-width: none !important; padding: 0 !important; }
  table { font-size: 10px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { padding: 6px !important; overflow-wrap: anywhere; }
  .user-text, .user-text-pre { font-family: Tahoma, Arial, sans-serif !important; }
`;
