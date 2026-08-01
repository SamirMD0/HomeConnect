import React, { useState } from 'react';
import { Plus, Search, Wrench } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { CreateServiceJobDialog } from '../../features/service/components/CreateServiceJobDialog';
import { ServiceJobsTable } from '../../features/service/components/ServiceJobsTable';
import { useServiceJobs } from '../../features/service/hooks/useServiceJobs';
import {
  ServiceJobFilters,
  ServiceRequestType,
  WarrantyStatus,
} from '../../features/service/types/service.types';
import {
  REQUEST_TYPE_LABELS,
  STATUS_LABELS,
  WARRANTY_LABELS,
} from '../../features/service/utils/service-labels';
import { businessLabels } from '../../shared/labels/business-labels';

const filterControlClass =
  'h-10 min-w-0 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs leading-5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

export const ServiceJobsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const filters: ServiceJobFilters = {
    search: params.get('search') || undefined,
    status: params.get('status') ? [params.get('status')!] : undefined,
    includeDelivered: params.get('includeDelivered') === 'true',
    requestType: params.get('requestType')
      ? [params.get('requestType') as ServiceRequestType]
      : undefined,
    warrantyStatus: params.get('warrantyStatus')
      ? [params.get('warrantyStatus') as WarrantyStatus]
      : undefined,
    customerId: params.get('customerId') || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
    sort: (params.get('sort') as ServiceJobFilters['sort']) || 'createdDesc',
    page: Number(params.get('page') || 1),
    pageSize: 25,
  };
  const jobs = useServiceJobs(filters);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Wrench className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
            <h1 className="text-xl font-bold leading-tight text-slate-900">
              {businessLabels.service.maintenance}
            </h1>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Track repair jobs from intake through delivery / متابعة الصيانة من الاستلام حتى التسليم.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 sm:w-auto"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{businessLabels.service.newJob}</span>
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(18rem,1.7fr)_repeat(4,minmax(10.5rem,1fr))]">
          <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
              placeholder="Job, customer, phone, product / الطلب، الزبون، الهاتف، المنتج"
              aria-label="Search service jobs"
              className={`${filterControlClass} pl-9`}
            />
          </div>

          <select
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
            aria-label="Filter by service status"
            className={filterControlClass}
          >
            <option value="">Open Jobs / الطلبات المفتوحة</option>
            <option value="OPEN">All Open / كل المفتوحة</option>
            <option value="CLOSED">All Completed / كل المكتملة</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={params.get('requestType') ?? ''}
            onChange={(event) => update('requestType', event.target.value)}
            aria-label="Filter by request type"
            className={filterControlClass}
          >
            <option value="">Any Request / أي طلب</option>
            {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={params.get('warrantyStatus') ?? ''}
            onChange={(event) => update('warrantyStatus', event.target.value)}
            aria-label="Filter by warranty"
            className={filterControlClass}
          >
            <option value="">Any Warranty / أي كفالة</option>
            {Object.entries(WARRANTY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={params.get('sort') ?? 'createdDesc'}
            onChange={(event) => update('sort', event.target.value)}
            aria-label="Sort service jobs"
            className={filterControlClass}
          >
            <option value="createdDesc">Newest First / الأحدث أولاً</option>
            <option value="createdAsc">Oldest First / الأقدم أولاً</option>
            <option value="statusAsc">Status / الحالة</option>
            <option value="customerAsc">Customer / الزبون</option>
          </select>
        </div>

        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={filters.includeDelivered}
              onChange={(event) =>
                update('includeDelivered', event.target.checked ? 'true' : '')
              }
              className="h-3.5 w-3.5 accent-emerald-600"
            />
            <span>Show delivered / إظهار المسلّمة</span>
          </label>
        </div>
      </section>

      {jobs.isLoading ? (
        <div className="p-12 text-center text-sm text-slate-500">Loading service jobs...</div>
      ) : jobs.isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Unable to load service jobs.
        </div>
      ) : jobs.data?.items.length ? (
        <>
          <ServiceJobsTable jobs={jobs.data.items} />
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{jobs.data.pagination.totalItems} jobs</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={filters.page === 1}
                onClick={() => update('page', String((filters.page ?? 1) - 1))}
                className="rounded border px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={(filters.page ?? 1) >= jobs.data.pagination.totalPages}
                onClick={() => update('page', String((filters.page ?? 1) + 1))}
                className="rounded border px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <Wrench className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            No service jobs match these filters.
          </p>
        </div>
      )}

      <CreateServiceJobDialog isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
};
