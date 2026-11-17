import { describe, expect, it, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { saveAction, listOutbox, actionMessage, FAILED_MESSAGE, type PhotoFiles, type ActionType } from './outbox';
import { OutboxSender, RelayRequestError } from './outbox-sender';
const files: PhotoFiles = {copy:vi.fn(async()=>({path:'document/photo',size:5})),read:vi.fn(async()=>new Blob(['photo'])),remove:vi.fn(async()=>{})};
const input = {owner:'device:user',submissionKey:'draft',type:'sales_order.create' as ActionType,branchId:'branch',summary:'Order · Rami',payload:{items:[{productId:'p'}],idempotencyKey:'draft'}};
describe('cloud outbox sender using real SQLite and a fake relay',()=>{
  it('sends only durable actions, with the same ID after a lost response and a process restart',async()=>{
    const db=await memoryDb(); await saveAction(db,input,{uuid:()=> 'stable'});
    let now=10000; const bodies: any[]=[];
    const request=vi.fn(async(path:string,init?:RequestInit)=>{
      expect((await listOutbox(db))[0]?.id).toBe('stable');
      if(path==='/actions'){bodies.push(JSON.parse(String(init?.body)));if(bodies.length===1)throw Error('response lost');return {status:'pending'};}
      return [{id:'stable',status:'claimed',result:null}];
    });
    await new OutboxSender(db,input.owner,request,{now:()=>new Date(now)}).sync();
    await new OutboxSender(db,input.owner,request,{now:()=>new Date(now)}).sync(); expect(bodies).toHaveLength(1);
    now+=2000; await new OutboxSender(db,input.owner,request,{now:()=>new Date(now)}).sync();
    expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual({id:'stable',type:'sales_order.create',branchId:'branch',payload:{items:[{productId:'p'}],idempotencyKey:'stable'},createdAt:expect.any(String)});
  });
  it('declares photos before upload, retains files while pending and deletes only on the PC result',async()=>{
    const db=await memoryDb();await saveAction(db,{...input,type:'supplier_bill.upload',payload:{supplierId:'s',note:'bill'},photo:{uri:'camera',mime:'image/jpeg'}},{uuid:()=> 'bill',files});
    let status='awaiting_photo';const calls:string[]=[];
    const request=vi.fn(async(path:string,init?:RequestInit)=>{
      calls.push(`${init?.method??'GET'} ${path}`);
      if(init?.method==='POST'){expect(JSON.parse(String(init.body))).toMatchObject({photo:{mime:'image/jpeg',size:5},payload:{supplierId:'s',note:'bill'}});return {status};}
      if(init?.method==='PUT'){status='pending';return {id:'bill',size:5};}
      return [{id:'bill',status,result:status==='applied'?{id:'receipt'}:null}];
    });
    const applied=vi.fn(),sender=new OutboxSender(db,input.owner,request,{files,onApplied:applied});
    await sender.sync();expect(calls.slice(0,2)).toEqual(['POST /actions','PUT /actions/bill/blob']);expect((await listOutbox(db))[0]?.photo_path).toBe('document/photo');
    status='awaiting_photo';await sender.sync();expect(calls.filter(call=>call.startsWith('PUT'))).toHaveLength(2);
    status='applied';await sender.sync();expect(applied).toHaveBeenCalledOnce();expect((await listOutbox(db))[0]?.photo_path).toBeNull();
  });
  it.each(['applied','refused','failed'] as const)('keeps authoritative %s results and messages',async status=>{
    const db=await memoryDb();await saveAction(db,input,{uuid:()=> 'action'});
    const sender=new OutboxSender(db,input.owner,async(path)=>path==='/actions'?{status:'pending'}:[{id:'action',status,result:{message:'Only 2 left in stock'}}]);
    await sender.sync();const [row]=await listOutbox(db);expect(row?.local_status).toBe(status);
    expect(actionMessage(row!)).toBe(status==='applied'?'Done':status==='failed'?FAILED_MESSAGE:'Only 2 left in stock');
  });
  it('single-flights separate senders and never retries an ACTION_ID_CONFLICT',async()=>{
    const db=await memoryDb();await saveAction(db,input,{uuid:()=> 'action'});
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const request=vi.fn(async()=>{await gate;throw new RelayRequestError(409,'ACTION_ID_CONFLICT');});
    const first=new OutboxSender(db,input.owner,request).sync(),second=new OutboxSender(db,input.owner,request).sync();
    expect(first).toBe(second);release();await first;await new OutboxSender(db,input.owner,request).sync();
    expect(request).toHaveBeenCalledOnce();expect((await listOutbox(db))[0]?.last_error).toContain('conflicts');
  });
  it('propagates 401 so the engine wipes the session, and never sends another owner’s archived work',async()=>{
    const db=await memoryDb();await saveAction(db,input,{uuid:()=> 'action'});
    const request=vi.fn(async()=>{throw new RelayRequestError(401,'DEVICE_REVOKED');});
    await expect(new OutboxSender(db,input.owner,request).sync()).rejects.toMatchObject({status:401});
    const other=vi.fn();await new OutboxSender(db,'another:user',other).sync();expect(other).not.toHaveBeenCalled();
  });
});
