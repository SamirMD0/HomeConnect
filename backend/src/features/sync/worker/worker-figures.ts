import { createHash } from 'node:crypto';
import type { Prisma,SyncWorkerState } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { todayInBusinessTimezone } from '../../financial';
import { REPORT_CATALOG } from '../../../../../shared/report-catalog';
import { type ReportFilters } from '../../../../../shared/report-request';
import { pcRead } from './pc-read';
import { readReport,REPORT_LIMIT } from './report-read';
import { businessClock,isOpening } from './worker-push';
import { saveProgress } from './worker-source';
import type { WorkerRelay } from './relay-client';
interface Task { entity:'dashboard'|'receivables_summary'|'report';branchId:string;period?:string;reportId?:string }
interface Progress { seq:string;date:string;startedAt:string;index:number;tasks:Task[] }
export interface FigureState { hashes:Record<string,string>;lastAt?:string;lastSeq?:string;lastDate?:string;run?:Progress }
const defaults={now:()=>new Date(),date:todayInBusinessTimezone,scope:async()=>({mode:'all' as const,branchIds:(await prisma.branch.findMany({where:{isActive:true},select:{id:true}})).map(row=>row.id)}),save:saveProgress,
  admin:()=>prisma.user.findFirst({where:{role:'ADMIN',isActive:true,deletedAt:null},select:{id:true,role:true}}),read:pcRead};
export type FigureDependencies=typeof defaults;
export function snapshotId(name:string){
  // RFC 4122 UUIDv5, using the URL namespace and a shop-local deterministic name.
  const bytes=createHash('sha1').update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8','hex')).update(name).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString('hex');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function stableJson(value:unknown):string{
  const visit=(item:any,inMeta=false):any=>Array.isArray(item)?item.map(value=>visit(value)):item&&typeof item==='object'
    ?Object.fromEntries(Object.keys(item).sort().filter(key=>!inMeta||!['generatedAt','timestamp','cacheAgeMs'].includes(key)).map(key=>[key,visit(item[key],key==='meta')])):item;
  return JSON.stringify(visit(value,true));
}
export function figureTasks(branchIds:string[],reports=true):Task[]{
  const home:Task[]=branchIds.flatMap(branchId=>[...['today','week','month'].map(period=>({entity:'dashboard' as const,branchId,period})),{entity:'receivables_summary' as const,branchId}]);
  return reports?[...home,...branchIds.flatMap<Task>(branchId=>REPORT_CATALOG.flatMap<Task>(report=>report.kind==='rows'
    ?['today','thisMonth'].map(period=>({entity:'report' as const,branchId,reportId:report.id,period}))
    :report.kind.startsWith('legacy')?[{entity:'report' as const,branchId,reportId:report.id,period:'currentMonth'}]:[]))]:home;
}
export async function loadFigure(task:Task,date:string,read:(path:string)=>Promise<any>){
  if(task.entity==='dashboard')return read(`/dashboard/overview?range=${task.period}&includeArchived=false`);
  if(task.entity==='receivables_summary'){
    const data=await read('/receivables?onlyWithBalance=true&sortBy=outstanding&sortOrder=desc&page=1&limit=1');
    return {summary:data.summary,tierCounts:data.tierCounts};
  }
  return readReport(task.reportId!,{period:task.period==='currentMonth'?'thisMonth':task.period,month:date.slice(0,7)} as ReportFilters,read);
}
export async function pushFigures(state:SyncWorkerState,relay:Pick<WorkerRelay,'request'>,deadline:number,deps=defaults,reports=false){
  const now=deps.now(),date=deps.date();
  let saved={hashes:{},...(state.figureSnapshots as unknown as FigureState|undefined)};
  let run=saved.run?.date===date?saved.run:undefined;
  if(!run){
    const midnight=saved.lastDate!==date;
    const opening=isOpening(state.openingStart.toISOString().slice(11,16),state.openingEnd.toISOString().slice(11,16),businessClock(now));
    if(!midnight&&(!opening||saved.lastSeq===state.lastPushedSeq||(saved.lastAt&&now.getTime()-Date.parse(saved.lastAt)<900000)))return;
    run={date,seq:state.lastPushedSeq,startedAt:now.toISOString(),index:0,tasks:figureTasks((await deps.scope()).branchIds,reports)};
    saved={...saved,run};await deps.save({figureSnapshots:saved as unknown as Prisma.InputJsonValue});
  }
  const admin=await deps.admin();if(!admin)return;
  while(run.index<run.tasks.length){
    if(deps.now().getTime()>=deadline||deps.date()!==date)return;
    const task:Task=run.tasks[run.index];
    const key=[task.entity,task.branchId,task.reportId,task.period].filter(Boolean).join('|');
    const response=await loadFigure(task,date,path=>deps.read(path,task.branchId,admin,deadline));
    if(deps.now().getTime()>=deadline)return;
    const value=task.entity==='report'&&Buffer.byteLength(JSON.stringify(response),'utf8')>REPORT_LIMIT?{tooLarge:true}:response;
    const hash=createHash('sha256').update(stableJson({businessDate:date,response:value})).digest('hex');
    if(hash!==saved.hashes[key]){
      await relay.request('/records',{pcSeq:state.lastPushedSeq,records:[{entity:task.entity,id:snapshotId(key),branchId:task.branchId,minRole:task.entity==='report'?'ADMIN':null,op:'upsert',data:{...task,businessDate:date,updatedAt:deps.now().toISOString(),response:value}}]});
      saved.hashes[key]=hash;
    }
    run={...run,index:run.index+1};saved={...saved,run};
    await deps.save({figureSnapshots:saved as unknown as Prisma.InputJsonValue});
  }
  const {run:done,...rest}=saved;
  await deps.save({figureSnapshots:{...rest,lastDate:date,lastSeq:run.seq,lastAt:run.startedAt} as unknown as Prisma.InputJsonValue});
}
