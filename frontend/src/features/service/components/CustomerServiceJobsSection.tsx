import React, { useState } from 'react';
import { Plus, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CreateServiceJobDialog } from './CreateServiceJobDialog';
import { useCustomerServiceJobs } from '../hooks/useServiceJobs';
import { ServiceJobStatusChip } from './ServiceJobStatusChip';
import { resolveProductDisplay } from '../types/service.types';
import { formatBusinessDate } from '../../customer-financial/utils/financial-format';
import { businessLabels } from '../../../shared/labels/business-labels';

const allStatuses = ['RECEIVED','INSPECTION_PENDING','IN_WORKSHOP_REPAIR','SENT_TO_COMPANY','WAITING_FOR_PART','WAITING_CUSTOMER_APPROVAL','READY_FOR_PICKUP','DELIVERED_TO_CUSTOMER','CANCELLED','NOT_REPAIRABLE'];

export const CustomerServiceJobsSection: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [open, setOpen] = useState(false);
  const jobs = useCustomerServiceJobs(customerId, { status: allStatuses, pageSize: 5 });
  const active = useCustomerServiceJobs(customerId, { pageSize: 1 });
  return <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-emerald-600" /><h2 className="text-lg font-semibold text-slate-800">{businessLabels.service.jobs}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{active.data?.pagination.totalItems ?? 0} open / {jobs.data?.pagination.totalItems ?? 0} total</span></div><p className="mt-1 text-sm text-slate-500">Maintenance history / سجل الصيانة لهذا الزبون.</p></div><button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> {businessLabels.service.newJob}</button></div>
    <div className="mt-5 divide-y divide-slate-100">{jobs.isLoading ? <p className="py-5 text-sm text-slate-500">Loading service jobs...</p> : jobs.data?.items.length ? jobs.data.items.map((job) => { const product=resolveProductDisplay(job); return <Link key={job.id} to={`/service/${job.id}`} className="flex flex-col gap-2 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{job.jobNumber}</p><p dir="auto" className="user-text text-sm text-slate-600">{product.name}{product.model?` · ${product.model}`:''}</p></div><div className="flex items-center gap-3"><span className="text-sm text-slate-500">{formatBusinessDate(job.serviceCreatedDate)}</span><ServiceJobStatusChip status={job.status}/></div></Link>; }) : <div className="py-8 text-center"><Wrench className="mx-auto h-7 w-7 text-slate-300"/><p className="mt-2 text-sm text-slate-500">No service jobs yet.</p></div>}</div>
    {(jobs.data?.pagination.totalItems ?? 0)>5&&<Link to={`/service?customerId=${customerId}`} className="mt-4 inline-block text-sm font-medium text-emerald-700">View all service jobs</Link>}
    <CreateServiceJobDialog isOpen={open} onClose={()=>setOpen(false)} customerId={customerId}/>
  </section>;
};
