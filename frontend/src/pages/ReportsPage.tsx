import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { formatMoney } from '../features/customer-financial/utils/financial-format';
import { useMonthlyReview } from '../features/reports/hooks/useMonthlyReview';
import {
  reportCategories, reportsInCategory, type ReportDefinition,
} from '../features/reports/reports.registry';
import type { MonthlyReviewData } from '../features/reports/types/monthly-review.types';
import { ReportsAdminOnlyNotice } from '../features/reports/components/ReportStates';

/**
 * Layer 1 — the reports portal.
 *
 * Reports used to be one page of stacked tabs, each holding a cramped table.
 * That shape made everything a summary and nothing a report. The portal instead
 * does one job: let the owner choose a report. The report itself gets a whole
 * page of its own.
 *
 * The headline figure on each card is read from the single monthly-review
 * request — a backend-computed value rendered as-is. A card with no matching
 * backend field shows no number rather than an invented one.
 */
export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const review = useMonthlyReview({ period: 'thisMonth' }, user?.role === 'ADMIN');

  if (user?.role !== 'ADMIN') return <ReportsAdminOnlyNotice />;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Reports / التقارير</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose a report to open it in full, with its own period, totals, and export. / اختر تقريرًا لفتحه كاملًا مع فترته وإجمالياته وتصديره.
        </p>
      </header>

      {reportCategories.map((category) => {
        const reports = reportsInCategory(category.key);
        if (reports.length === 0) return null;
        return (
          <section key={category.key} aria-labelledby={`reports-${category.key}`} className="space-y-3">
            <h2 id={`reports-${category.key}`} className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {category.label}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reports.map((definition) => (
                <ReportCard key={definition.id} definition={definition} data={review.data?.data} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const ReportCard: React.FC<{ definition: ReportDefinition; data?: MonthlyReviewData }> = ({ definition, data }) => {
  const Icon = definition.icon;
  const headline = data && definition.headline ? definition.headline(data) : null;

  return (
    <Link
      to={`/reports/${definition.id}`}
      className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900">{definition.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{definition.description}</p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 pt-3">
        {headline ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{headline.label}</p>
            <strong className="mt-0.5 block text-xl text-slate-900">
              {headline.money ? formatMoney(headline.value) : headline.value}
            </strong>
          </div>
        ) : (
          <span />
        )}
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:underline">
          View report / عرض التقرير
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
};
