import { createElement,type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({row:{} as Record<string,unknown>,recordArrived:false,push:vi.fn()}));
vi.mock('react-native',()=>({StyleSheet:{create:(value:unknown)=>value},Text:({children}:{children:ReactNode})=>createElement('span',{},children),View:({children}:{children:ReactNode})=>createElement('div',{},children),Pressable:({children}:{children:ReactNode})=>createElement('button',{},children),ActivityIndicator:()=>null}));
vi.mock('@expo/vector-icons/Ionicons',()=>({default:()=>null}));
vi.mock('expo-router',()=>({useRouter:()=>({push:state.push})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:state.recordArrived})}));
vi.mock('./useOutbox',()=>({useOutbox:()=>({data:[state.row]})}));
vi.mock('./expo-db',()=>({openLocalDb:vi.fn()}));
vi.mock('./sync-status',()=>({requestCloudSync:vi.fn()}));
import { OutboxStatus } from './OutboxStatus';
beforeEach(()=>{state.row={id:'action',type:'sales_order.create',local_status:'pending',result:null,archived:0};state.recordArrived=false;});
describe('saved cloud action presentation',()=>{
  it('does not offer an order receipt before both PC confirmation and its synced record',()=>{
    expect(renderToStaticMarkup(createElement(OutboxStatus,{id:'action'}))).not.toContain('View saved order');
    state.row.local_status='applied';state.row.result=JSON.stringify({id:'created'});
    expect(renderToStaticMarkup(createElement(OutboxStatus,{id:'action'}))).toContain('Syncing the saved order');
    state.recordArrived=true;expect(renderToStaticMarkup(createElement(OutboxStatus,{id:'action'}))).toContain('View saved order');
  });
  it('shows a PC refusal and keeps payment receipts explicitly on shop Wi-Fi',()=>{
    state.row={...state.row,type:'customer_payment.create',local_status:'refused',result:JSON.stringify({message:'Only 2 left in stock'})};
    const html=renderToStaticMarkup(createElement(OutboxStatus,{id:'action'}));expect(html).toContain('Only 2 left in stock');expect(html).toContain('Payment receipts are available on the shop Wi-Fi');expect(html).not.toContain('View and share receipt');
  });
});
