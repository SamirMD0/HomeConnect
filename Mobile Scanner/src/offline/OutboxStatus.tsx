import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StatusBanner } from '../components/StatusBanner';
import { AppButton } from '../components/AppButton';
import { actionMessage,type OutboxRow } from './outbox';
import { useOutbox } from './useOutbox';
import { requestCloudSync } from './sync-status';
import { openLocalDb } from './expo-db';
export function ActionResultLink({row}:{row:OutboxRow}){
  const router=useRouter();if(row.local_status!=='applied'||row.archived)return null;
  let result:any;try{result=JSON.parse(row.result??'{}');}catch{return null;}
  if(row.type==='report.request'&&result.report&&typeof result.reportId==='string')return <AppButton label="View report" onPress={()=>router.push({pathname:'/(tabs)/more/report/[id]',params:{id:result.reportId,requestId:row.id}})}/>;
  if(row.type==='customer_payment.create'&&result.receipt&&typeof result.id==='string')return <AppButton label="View and share receipt" onPress={()=>router.push({pathname:'/(tabs)/sell/receipt/[id]',params:{id:result.id,actionId:row.id}})}/>;
  return null;
}
export function OutboxStatus({ id }: { id: string }) {
  const query = useOutbox(),
    router = useRouter(),
    row = query.data?.find((item) => item.id === id);
  useEffect(() => {
    void requestCloudSync();
  }, [id]);
  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(row?.result ?? '{}');
  } catch {}
  const recordId =
    typeof result.id === 'string'
      ? result.id
      : typeof result.orderId === 'string'
        ? result.orderId
        : null;
  const order = useQuery({
    queryKey: ['cloud-created-order', id, recordId],
    queryFn: async () =>
      Boolean(
        (
          await (
            await openLocalDb()
          ).query("SELECT id FROM records WHERE entity='sales_order' AND id=?", [recordId!])
        ).length
      ),
    enabled:
      row?.local_status === 'applied' && row.type === 'sales_order.create' && Boolean(recordId),
    refetchInterval: 2000,
  });
  return (
    <>
      <StatusBanner
        tone={
          row?.local_status === 'applied'
            ? 'success'
            : row?.local_status === 'refused' || row?.local_status === 'failed'
              ? 'warning'
              : 'info'
        }
        message={row ? actionMessage(row) : 'Saved. Open Waiting for this action’s status.'}
      />
      {row?.type === 'customer_payment.create' && !result.receipt && (
        <StatusBanner
          tone="info"
          message="Payment receipts are available on the shop Wi-Fi after the PC applies the payment."
        />
      )}
      {row&&<ActionResultLink row={row}/>}
      {row?.local_status === 'applied' && row.type === 'sales_order.create' && !order.data && (
        <StatusBanner tone="info" message="Done on the shop PC. Syncing the saved order…" />
      )}
      {order.data && recordId && (
        <AppButton
          label="View saved order"
          onPress={() =>
            router.push({ pathname: '/(tabs)/sell/order/[id]', params: { id: recordId } })
          }
        />
      )}
      <AppButton
        label="Waiting for the shop PC"
        variant="secondary"
        onPress={() => router.push('/(tabs)/suppliers/pending-bills')}
      />
    </>
  );
}
