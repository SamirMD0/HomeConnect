import React from 'react';
import { Building2, CircleAlert, Clock3, PackageCheck, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useServiceSummary } from '../hooks/useServiceJobs';

export const ServiceDashboardCards: React.FC = () => {
  const summary = useServiceSummary();
  const cards = [
    ['At supplier',summary.data?.atSupplier,'SENT_TO_COMPANY',Building2,'text-blue-700 bg-blue-50'],
    ['Waiting for part',summary.data?.waitingForPart,'WAITING_FOR_PART',Clock3,'text-amber-700 bg-amber-50'],
    ['Awaiting customer',summary.data?.awaitingCustomer,'WAITING_CUSTOMER_APPROVAL',Wrench,'text-violet-700 bg-violet-50'],
    ['Ready for pickup',summary.data?.readyForPickup,'READY_FOR_PICKUP',PackageCheck,'text-emerald-700 bg-emerald-50'],
    ['Overdue 30+ days',summary.data?.overdue,'OPEN',CircleAlert,'text-red-700 bg-red-50'],
  ] as const;
  return <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Service overview</h2><Link to="/service" className="text-sm font-medium text-emerald-700">View service jobs</Link></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map(([label,value,status,Icon,style])=><Link key={label} to={`/service?status=${status}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"><div className={`mb-3 inline-flex rounded-lg p-2 ${style}`}><Icon className="h-5 w-5"/></div><p className="text-2xl font-bold text-slate-900">{summary.isLoading?'…':value??0}</p><p className="text-sm text-slate-600">{label}</p></Link>)}</div></section>;
};
