import { Wrench } from 'lucide-react';
import { dashboardLabels } from '../../config/dashboard-labels';
import type { ServiceAnalyticsData } from '../../types';
import { ServiceStatusDonut } from '../charts/ServiceStatusDonut';
import { DashboardSection } from '../layout/DashboardSection';
import { SectionState } from './SectionState';
export function ServiceAnalytics({ data, isLoading, isError, onRetry }: { data?: ServiceAnalyticsData; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return <DashboardSection title={dashboardLabels.serviceAnalytics} icon={Wrench}><SectionState isLoading={isLoading} isError={isError} onRetry={onRetry} emptyText="No service jobs / لا توجد طلبات صيانة"><div className="grid grid-cols-1 gap-3 xl:grid-cols-3"><ServiceStatusDonut data={data?.statusDistribution ?? []} /><div className="rounded-lg border border-slate-200 p-3"><h3 className="text-sm font-semibold">Range throughput / حركة الفترة</h3><div className="mt-3 space-y-2">{data?.throughput.map((point) => <div key={point.bucket} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 py-1.5 text-xs"><span>{point.bucket}</span><span className="text-blue-700">Opened {point.opened}</span><span className="text-emerald-700">Done {point.completed}</span></div>)}</div></div><div className="rounded-lg border border-slate-200 p-3"><h3 className="text-sm font-semibold">Aging jobs / الطلبات المتأخرة</h3><div className="mt-3 space-y-2">{data?.agingJobs.length ? data.agingJobs.map((job) => <div key={job.id} className="border-b border-slate-100 pb-2 text-xs"><div className="flex justify-between gap-2"><strong>{job.jobNumber}</strong><span className="text-red-700">{job.ageDays} days</span></div><p className="user-text mt-0.5 text-slate-500" dir="auto">{job.customerName}</p></div>) : <p className="py-8 text-center text-xs text-slate-400">No aging jobs / لا طلبات متأخرة</p>}</div></div></div></SectionState></DashboardSection>;
}

