import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import type { LocalDb } from './local-db';
import { listOutbox } from './outbox';
import type { CloudPairing } from './cloud-pairing';
const mocks=vi.hoisted(()=>({open:vi.fn(),sync:vi.fn(),uuid:vi.fn(()=> 'stable-action')}));
vi.mock('./expo-db',()=>({openLocalDb:mocks.open}));
vi.mock('./sync-status',()=>({requestCloudSync:mocks.sync}));
vi.mock('expo-crypto',()=>({randomUUID:mocks.uuid}));
import { configureOutbox, enqueueCloudAction, waitForOutboxSaves } from './outbox-runtime';
const pairing:CloudPairing={v:1,deviceId:'device',userId:'user',userName:'Rami',role:'ADMIN',relay:'https://relay.example',token:'secret',branchIds:['branch']};
afterEach(async()=>{configureOutbox(null);await waitForOutboxSaves();vi.clearAllMocks();});
describe('screen Save integration',()=>{
  it('commits to SQLite before requesting any network work, without waiting for the relay',async()=>{
    const db=await memoryDb();mocks.open.mockResolvedValue(db);configureOutbox(pairing);
    let durable:Promise<unknown>|undefined;
    mocks.sync.mockImplementation(()=>{durable=listOutbox(db);return new Promise(()=>{});});
    const saved=await enqueueCloudAction({type:'sales_order.create',submissionKey:'draft',branchId:'branch',payload:{items:[]},summary:'Order · Rami'});
    expect(saved.id).toBe('stable-action');expect(await durable).toEqual([saved]);expect(mocks.sync).toHaveBeenCalledOnce();
    const recovered=await enqueueCloudAction({type:'sales_order.create',submissionKey:'draft',branchId:'branch',payload:{items:[]},summary:'Order · Rami'});
    expect(recovered.id).toBe(saved.id);expect(mocks.uuid).toHaveBeenCalledOnce();
  });
  it('a pairing change cancels a waiting Save and never enqueues it for the next user',async()=>{
    let release!:(db:LocalDb)=>void;const gate=new Promise<LocalDb>(resolve=>{release=resolve;});mocks.open.mockReturnValue(gate);configureOutbox(pairing);
    const saving=enqueueCloudAction({type:'sales_order.create',submissionKey:'draft',branchId:'branch',payload:{},summary:'Old user'});
    await Promise.resolve();configureOutbox({...pairing,userId:'new-user'});const db=await memoryDb();release(db);
    await expect(saving).rejects.toThrow('pairing changed');expect(await listOutbox(db)).toEqual([]);expect(mocks.sync).not.toHaveBeenCalled();
  });
});
