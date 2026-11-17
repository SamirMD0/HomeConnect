import { REPORT_CATALOG } from '../../../../../shared/report-catalog';
import { reportRequest,type ReportFilters } from '../../../../../shared/report-request';
export const REPORT_LIMIT=1536*1024;
export function reportDefinition(reportId:string){
  const definition=REPORT_CATALOG.find(item=>item.id===reportId);
  if(!definition)throw new Error('Unknown report');return definition;
}
export async function readReport(reportId:string,filters:ReportFilters,read:(path:string)=>Promise<any>){
  const definition=reportDefinition(reportId);
  const load=async(page:number)=>{const request=reportRequest(definition,filters,page);const params=new URLSearchParams();for(const[key,value]of Object.entries(request.params))if(value!==undefined)params.set(key,String(value));return read(`${request.path}?${params}`);};
  const first=await load(1);
  if(!definition.kind.startsWith('legacy')||!first.pagination||first.pagination.totalPages<=1)return first;
  const items=[...(first.items??first.rows??[])];
  for(let page=2;page<=Math.min(40,first.pagination.totalPages);page++){
    const next=await load(page);items.push(...(next.items??next.rows??[]));
    if(Buffer.byteLength(JSON.stringify({...first,items,rows:undefined}),'utf8')>REPORT_LIMIT)return{tooLarge:true};
  }
  return {...first,items,rows:undefined};
}
