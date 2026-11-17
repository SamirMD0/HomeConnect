import { REPORT_CATALOG } from '@shared/report-catalog';
import { reportRequest,type ReportFilters } from '@shared/report-request';
import type { LocalDb } from './local-db';
import type { OutboxRow } from './outbox';
export const FIRST_FIGURES='Waiting for the first figures from the shop PC';
export function reportKey(reportId:string,filters:ReportFilters){
  const definition=REPORT_CATALOG.find(item=>item.id===reportId);
  return JSON.stringify([reportId,definition?.kind.startsWith('legacy')?{month:filters.month}:filters.period==='custom'?{period:filters.period,from:filters.from,to:filters.to}:{period:filters.period}]);
}
export function reportAtPath(path:string){return REPORT_CATALOG.find(definition=>reportRequest(definition,{period:'thisMonth',month:'2000-01'}).path===path);}
export async function cloudReport(db:LocalDb,branches:string[],role:string,owner:string|undefined,reportId:string,filters:ReportFilters){
  if(role!=='ADMIN')throw new Error('Only administrators can view reports.');
  if(branches.length!==1)throw new Error('Choose a branch to view its figures.');
  const candidates:{response:any;updatedAt:string;businessDate?:string}[]=[];
  const snapshots=await db.query<{data:string}>("SELECT data FROM records WHERE entity='report' AND branch_id=? AND json_extract(data,'$.reportId')=?",[branches[0]!,reportId]);
  for(const row of snapshots){const item=JSON.parse(row.data);if(item.period===filters.period||item.period==='currentMonth'&&item.businessDate?.slice(0,7)===filters.month)candidates.push(item);}
  if(owner){
    const actions=await db.query<OutboxRow>("SELECT * FROM outbox WHERE type='report.request' AND owner=? AND branch_id=? AND local_status='applied' AND archived=0 AND dismissed=0 AND result IS NOT NULL AND updated_at>?",[owner,branches[0]!,new Date(Date.now()-86400000).toISOString()]);
    for(const action of actions){const result=JSON.parse(action.result!);if(result.report&&reportKey(result.reportId,result.filters)===reportKey(reportId,filters))candidates.push({response:result.report,updatedAt:result.updatedAt});}
  }
  const latest=candidates.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?{...latest.response,cloudSnapshot:{updatedAt:latest.updatedAt,businessDate:latest.businessDate}}:{cloudMissing:true};
}
export async function cloudReceipt(db:LocalDb,owner:string,branchId:string,paymentId:string,actionId?:string){
  const rows=await db.query<OutboxRow>("SELECT * FROM outbox WHERE type='customer_payment.create' AND owner=? AND branch_id=? AND local_status='applied' AND archived=0 AND dismissed=0 AND result IS NOT NULL"+(actionId?' AND id=?':''),[owner,branchId,...(actionId?[actionId]:[])]);
  for(const row of rows){const result=JSON.parse(row.result!);if(result.id===paymentId&&result.receipt?.payment?.id===paymentId)return result.receipt;}
  throw new Error('Receipt available on the shop Wi-Fi.');
}
