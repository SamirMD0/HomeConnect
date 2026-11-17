import { describe,expect,it,vi } from 'vitest';
import { RelayStore } from './store';
import type { RelayClient } from './client';
describe('relay record visibility',()=>{
  it.each([false,true])('never returns admin data to staff (fullCopy=%s), retaining delete revisions',async fullCopy=>{
    const rows=[{entity:'report',entityId:'r',branchId:'a',previousBranchIds:[],rev:7n,op:'upsert',minRole:'ADMIN',data:{secret:'PC money'}},{entity:'product',entityId:'p',branchId:null,previousBranchIds:[],rev:8n,op:'upsert',minRole:null,data:{name:'Fan'}}];
    const tx={relayWorker:{findUniqueOrThrow:vi.fn(async()=>({prunedThroughRev:0n}))},relayRecord:{findMany:vi.fn(async()=>rows)}};
    const store=new RelayStore({$transaction:async(work:any)=>work(tx)} as unknown as RelayClient);
    const staff=await store.readRecords(['a'],'0',500,{role:'EMPLOYEE',fullCopy});
    expect(staff.records[0]).toMatchObject({id:'r',op:'delete',data:null,rev:'7'});
    expect(JSON.stringify(staff)).not.toContain('PC money');expect(staff.records[1]?.op).toBe('upsert');
    const admin=await store.readRecords(['a'],'0',500,{role:'ADMIN',fullCopy});expect(admin.records[0]).toMatchObject({op:'upsert',data:{secret:'PC money'}});
  });
  it('redacts previously applied admin action results after a role downgrade',async()=>{
    const db={relayOutbox:{findMany:vi.fn(async()=>[{id:'action',type:'report.request',status:'applied',result:{report:{secret:'money'}}}])}};
    const store=new RelayStore(db as unknown as RelayClient);
    expect(await store.actionResults('device',['action'],'EMPLOYEE')).toEqual([{id:'action',status:'refused',result:{code:'FORBIDDEN',message:expect.any(String)}}]);
    expect((await store.actionResults('device',['action'],'ADMIN'))[0]?.result).toEqual({report:{secret:'money'}});
  });
});
