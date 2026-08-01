import { Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dashboardLabels } from '../../config/dashboard-labels';
import { erpModules } from '../../config/module-registry';
import { BilingualLabel } from '../layout/BilingualLabel';
import { DashboardSection } from '../layout/DashboardSection';
export function ErpModuleMap({ counts = {} }: { counts?: Record<string, number> }) {
  return <DashboardSection title={dashboardLabels.systemModules} icon={Boxes}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">{erpModules.map((module) => { const Icon = module.icon; const content = <><div className="flex items-start justify-between gap-2"><Icon className="h-4 w-4" style={{ color: module.status === 'LIVE' ? module.accent : '#898781' }} /><span className={`text-[9px] font-bold ${module.status === 'LIVE' ? 'text-emerald-700' : 'text-slate-400'}`}>{module.status === 'NEXT' ? 'COMING NEXT / قريباً' : module.status}</span></div><div className="mt-2 flex items-end justify-between gap-2"><span className="text-xs font-semibold"><BilingualLabel label={module.label} /></span>{module.countKey && counts[module.countKey] !== undefined && <strong className="text-lg">{counts[module.countKey]}</strong>}</div></>; return module.status === 'LIVE' && module.route ? <Link key={module.key} to={module.route} className="rounded-md border border-slate-200 bg-white p-2.5 hover:border-emerald-300 hover:bg-emerald-50">{content}</Link> : <div key={module.key} className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-2.5 text-slate-500">{content}</div>; })}</div></DashboardSection>;
}
