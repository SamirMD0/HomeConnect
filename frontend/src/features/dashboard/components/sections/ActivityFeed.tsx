import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney, formatDateTime } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import { erpModules } from '../../config/module-registry';
import type { DashboardActivityData, DashboardActivityItem } from '../../types';
import { DashboardSection } from '../layout/DashboardSection';
import { SectionState } from './SectionState';

export function ActivityFeed({ data, isLoading, isError, onRetry, businessDate }: { data?: DashboardActivityData; isLoading: boolean; isError: boolean; onRetry: () => void; businessDate: string }) {
  const groups = groupByDay(data?.items ?? [], businessDate);
  return <DashboardSection title={dashboardLabels.recentActivity} icon={Activity}><SectionState isLoading={isLoading} isError={isError} isEmpty={Boolean(data && data.items.length === 0)} onRetry={onRetry} emptyText="No recent activity / لا يوجد نشاط حديث"><div className="space-y-4">{groups.map((group) => <div key={group.day}><h3 className="mb-2 text-[11px] font-bold uppercase text-slate-400">{group.label}</h3><div className="space-y-1">{group.items.map((item) => <ActivityRow key={item.id} item={item} />)}</div></div>)}</div></SectionState></DashboardSection>;
}
function ActivityRow({ item }: { item: DashboardActivityItem }) { const module = erpModules.find((entry) => entry.key === item.module) ?? erpModules[0]; const Icon = module.icon; return <Link to={item.route} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-2 hover:bg-slate-50"><span className="rounded bg-slate-100 p-1.5" style={{ color: module.accent }}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="user-text truncate text-xs font-medium text-slate-800" dir="auto">{item.title}</p><p className="mt-0.5 text-[11px] text-slate-400">{item.actor} · {formatDateTime(item.occurredAt)}</p></div>{item.amount && <strong className="text-xs">{formatMoney(item.amount)}</strong>}</Link>; }
function groupByDay(items: DashboardActivityItem[], businessDate: string) { const yesterday = new Date(`${businessDate}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1); const yesterdayKey = yesterday.toISOString().slice(0,10); const map = new Map<string, DashboardActivityItem[]>(); for (const item of items) { const day = item.occurredAt.slice(0,10); map.set(day, [...(map.get(day) ?? []), item]); } return [...map.entries()].sort(([a],[b]) => b.localeCompare(a)).map(([day, grouped]) => ({ day, label: day === businessDate ? 'Today / اليوم' : day === yesterdayKey ? 'Yesterday / أمس' : day, items: grouped })); }

