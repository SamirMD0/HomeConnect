import React, { useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { MonthlyReview } from '../features/reports/components/MonthlyReview';
import { MonthlyActivityReportTable } from '../features/reports/components/MonthlyActivityReportTable';
import { MonthlyDebtReportFilters } from '../features/reports/components/MonthlyDebtReportFilters';
import { MonthlyDebtReportTable } from '../features/reports/components/MonthlyDebtReportTable';
import {
  MonthlyActivitySummaryCards, MonthlyDebtSummaryCards,
} from '../features/reports/components/ReportSummaryCards';
import {
  ReportEmptyState, ReportErrorState, ReportLoadingState, ReportsAdminOnlyNotice,
} from '../features/reports/components/ReportStates';
import { ReportPeriodSelector } from '../features/reports/components/ReportPeriodSelector';
import { ReportExportActions } from '../features/reports/components/ReportExportActions';
import { ReportDataTable, ReportTotals } from '../features/reports/components/ReportDataTable';
import { summariesFor, movementSummaryRows } from '../features/reports/components/report-columns';
import { StockMovementsByTypeChart } from '../features/reports/components/ReportCharts';
import { AnalysisPortal } from '../features/reports/components/AnalysisPortal';
import { reportRowsApi } from '../features/reports/api/report-rows.api';
import { analysisApi } from '../features/reports/api/analysis.api';
import { monthlyReportsApi } from '../features/reports/api/monthly-reports.api';
import { useReportRows } from '../features/reports/hooks/useReportRows';
import { useAnalysis } from '../features/reports/hooks/useAnalysis';
import {
  monthlyReportsQueryKeyPrefix, useMonthlyDebtReport, useMonthlyFinancialActivity,
} from '../features/reports/hooks/useMonthlyReports';
import { findReport, type ReportDefinition } from '../features/reports/reports.registry';
import type { ReportRowsQuery, ReportSlice } from '../features/reports/types/report-rows.types';
import type {
  MonthlyDebtReportData, MonthlyDebtReportFilters as MonthlyDebtReportFiltersType,
  MonthlyFinancialActivityData,
} from '../features/reports/types/monthly-reports.types';
import { currentMonthValue } from '../features/reports/utils/report-query';
import '../features/reports/print.css';

/**
 * Layer 2 — one report, one page.
 *
 * Because the route renders exactly one report, "export only this report" needs
 * no filtering logic: printing the page prints the open report and nothing else.
 */
export const ReportDetailPage: React.FC = () => {
  const { reportId } = useParams();
  const { user } = useAuth();
  const definition = findReport(reportId);

  if (user?.role !== 'ADMIN') return <ReportsAdminOnlyNotice />;
  if (!definition) return <Navigate to="/reports" replace />;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 report-print-root">
      <style media="print">{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <Link to="/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 print:hidden">
        <ArrowLeft className="h-4 w-4" />
        All reports / كل التقارير
      </Link>
      {definition.kind === 'rows' && definition.slice
        ? <RowsReport definition={definition} slice={definition.slice} />
        : definition.kind === 'review'
        ? <ReportFrame definition={definition}><MonthlyReview /></ReportFrame>
        : definition.kind === 'analysis'
        ? <AnalysisReport definition={definition} />
        : definition.kind === 'legacy-debts'
        ? <LegacyMonthReport definition={definition} kind="debts" />
        : <LegacyMonthReport definition={definition} kind="activity" />}
    </div>
  );
};

/** Title, description, and the report's own export controls. */
const ReportFrame: React.FC<{
  definition: ReportDefinition;
  period?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ definition, period, actions, children }) => (
  <>
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{definition.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{definition.description}</p>
        <div className="mt-2 hidden text-sm text-slate-600 print:block">
          <p className="font-semibold">Home Connects</p>
          {period && <p>Period / الفترة: {period}</p>}
          <p>Generated / أُنشئ في: {new Date().toLocaleString('en-GB')}</p>
        </div>
      </div>
      {actions}
    </header>
    {children}
  </>
);

function AnalysisReport({ definition }: { definition: ReportDefinition }) {
  const [period, setPeriod] = useState<ReportRowsQuery>({ period: 'thisMonth' });
  const analysis = useAnalysis(period);
  const meta = analysis.data?.meta;

  const exportCsv = async () => {
    const blob = await analysisApi.exportCsv(period);
    downloadBlob(blob, `analysis-${meta?.from ?? 'report'}-to-${meta?.to ?? 'report'}.csv`);
  };

  return (
    <ReportFrame
      definition={definition}
      period={meta ? `${meta.from} → ${meta.to}` : undefined}
      actions={<ReportExportActions onExportCsv={analysis.data ? exportCsv : undefined} />}
    >
      <ReportPeriodSelector
        value={period}
        onChange={setPeriod}
        onRefresh={() => void analysis.refetch()}
        isRefreshing={analysis.isFetching}
        generatedAt={meta?.generatedAt}
      />
      <AnalysisPortal period={period} />
    </ReportFrame>
  );
}

function RowsReport({ definition, slice }: { definition: ReportDefinition; slice: ReportSlice }) {
  const [period, setPeriod] = useState<ReportRowsQuery>({ period: 'thisMonth' });
  const report = useReportRows(slice, period);
  const incompleteCustom = period.period === 'custom' && (!period.from || !period.to);
  const meta = report.data?.meta;

  const exportCsv = async () => {
    const blob = await reportRowsApi.exportCsv(slice, period);
    downloadBlob(blob, `${definition.id}-${meta?.from ?? 'report'}-to-${meta?.to ?? 'report'}.csv`);
  };

  return (
    <ReportFrame
      definition={definition}
      period={meta ? `${meta.from} → ${meta.to}` : undefined}
      actions={<ReportExportActions onExportCsv={report.data ? exportCsv : undefined} />}
    >
      <ReportPeriodSelector
        value={period}
        onChange={setPeriod}
        onRefresh={() => void report.refetch()}
        isRefreshing={report.isFetching}
        generatedAt={meta?.generatedAt}
      />

      {definition.operational && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
          This is a current operational backlog; the selected period is retained only for consistent report navigation. / هذه قائمة تشغيلية حالية.
        </div>
      )}

      {meta && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <strong>Reporting period / فترة التقرير:</strong> {meta.from} → {meta.to}
        </div>
      )}

      {incompleteCustom ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
          Select both dates to load the report / اختر التاريخين لتحميل التقرير
        </div>
      ) : report.isLoading && !report.data ? (
        <ReportLoadingState />
      ) : report.isError || !report.data ? (
        <ReportErrorState onRetry={() => void report.refetch()} />
      ) : (
        <>
          <ReportTotals items={summariesFor(slice, report.data.data.summary)} />
          {slice === 'inventory-movements' && (
            <StockMovementsByTypeChart data={movementSummaryRows(report.data.data.summary.movementsByType)} />
          )}
          {report.data.data.rows.length === 0
            ? <ReportEmptyState />
            : <ReportDataTable slice={slice} rows={report.data.data.rows} />}
        </>
      )}
    </ReportFrame>
  );
}

/**
 * The two month-based reports that predate the period-aware row endpoints. They
 * keep their own month filter and their own CSV, unchanged.
 */
function LegacyMonthReport({ definition, kind }: { definition: ReportDefinition; kind: 'debts' | 'activity' }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<MonthlyDebtReportFiltersType>({
    month: currentMonthValue(), page: 1, limit: 50,
    sortBy: 'OUTSTANDING', sortOrder: 'DESC',
    includeZero: false, includeCancelled: false, overdueOnly: false,
  });
  const activityFilters = { month: filters.month, page: filters.page, limit: filters.limit };
  const debtReport = useMonthlyDebtReport(filters, kind === 'debts');
  const activityReport = useMonthlyFinancialActivity(activityFilters, kind === 'activity');
  const query = kind === 'debts' ? debtReport : activityReport;

  const exportCsv = async () => {
    const blob = kind === 'debts'
      ? await monthlyReportsApi.exportMonthlyDebtCsv(filters)
      : await monthlyReportsApi.exportMonthlyActivityCsv(activityFilters);
    downloadBlob(blob, `${definition.id}-${filters.month}.csv`);
  };

  return (
    <ReportFrame
      definition={definition}
      period={filters.month}
      actions={<ReportExportActions onExportCsv={query.data ? exportCsv : undefined} />}
    >
      <MonthlyDebtReportFilters
        filters={filters}
        onChange={setFilters}
        onRefresh={() => void queryClient.invalidateQueries({ queryKey: monthlyReportsQueryKeyPrefix })}
      />
      {query.isLoading && !query.data ? (
        <ReportLoadingState />
      ) : query.isError || !query.data ? (
        <ReportErrorState onRetry={() => void query.refetch()} />
      ) : kind === 'debts' ? (
        <>
          <MonthlyDebtSummaryCards summary={(debtReport.data as MonthlyDebtReportData).summary} />
          {(debtReport.data as MonthlyDebtReportData).rows.length === 0
            ? <ReportEmptyState />
            : <MonthlyDebtReportTable report={debtReport.data as MonthlyDebtReportData} onOpenCustomer={(customerId) => navigate(`/customers/${customerId}`)} />}
          <Pagination pagination={(debtReport.data as MonthlyDebtReportData).pagination} onPage={(page) => setFilters((current) => ({ ...current, page }))} />
        </>
      ) : (
        <>
          <MonthlyActivitySummaryCards summary={(activityReport.data as MonthlyFinancialActivityData).summary} />
          {(activityReport.data as MonthlyFinancialActivityData).items.length === 0
            ? <ReportEmptyState />
            : <MonthlyActivityReportTable report={activityReport.data as MonthlyFinancialActivityData} />}
          <Pagination pagination={(activityReport.data as MonthlyFinancialActivityData).pagination} onPage={(page) => setFilters((current) => ({ ...current, page }))} />
        </>
      )}
    </ReportFrame>
  );
}

const Pagination: React.FC<{
  pagination: { page: number; totalPages: number; total: number };
  onPage: (page: number) => void;
}> = ({ pagination, onPage }) => (
  <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between print:hidden">
    <p>Page {pagination.page} of {pagination.totalPages} · {pagination.total} row{pagination.total === 1 ? '' : 's'}</p>
    <div className="flex gap-2">
      <button type="button" onClick={() => onPage(Math.max(1, pagination.page - 1))} disabled={pagination.page <= 1} className={pageButton}>
        <ChevronLeft className="mr-1 h-4 w-4" />Previous
      </button>
      <button type="button" onClick={() => onPage(Math.min(pagination.totalPages, pagination.page + 1))} disabled={pagination.page >= pagination.totalPages} className={pageButton}>
        Next<ChevronRight className="ml-1 h-4 w-4" />
      </button>
    </div>
  </div>
);

const pageButton = 'inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
