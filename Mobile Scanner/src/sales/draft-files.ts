import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { DraftStore } from './draft-store';
import type {
  OrderForm,
  OrderPayload,
  PaymentForm,
  PaymentPayload,
  SalesResult,
} from './contracts';
import type { QueryScope } from '../query/keys';
import { initialOrder, initialPayment } from './payloads';
import {openLocalDb} from '../offline/expo-db';
export type OrderStore = DraftStore<OrderForm, OrderPayload, SalesResult>;
export type PaymentStore = DraftStore<PaymentForm, PaymentPayload, SalesResult>;
const stores = new Map<string, Promise<OrderStore | PaymentStore>>();
const cloudStores = new Set<string>();
export function draftScope(scope: QueryScope, kind: string) {
  return JSON.stringify([scope.server, scope.userId, scope.branchId, kind]);
}
export async function openDraft(
  scope: QueryScope,
  kind: 'order' | 'payment',
  customerId = '',
  cloud = false
): Promise<OrderStore | PaymentStore> {
  const identity = draftScope(scope, kind === 'order' ? kind : `${kind}:${customerId}`);
  const existing = stores.get(identity);
  if (existing) return existing;
  const opening = (async () => {
    if (!FileSystem.documentDirectory) throw new Error('Device storage is unavailable.');
    const directory = `${FileSystem.documentDirectory}${cloud ? 'cloud-sales-drafts-v1' : 'sales-drafts-v1'}/`;
    if(!cloud)await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, identity);
    const local=cloud?await openLocalDb():null;
    const storage = local?{
      read:async(slot:0|1)=>(await local.query<{value:string}>('SELECT value FROM cloud_drafts WHERE name=?',[`${digest}.${slot}.json`]))[0]?.value??null,
      write:(slot:0|1,value:string)=>local.exec('INSERT INTO cloud_drafts(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',[`${digest}.${slot}.json`,value]),
    }:{
      read: async (slot: 0 | 1) => {
        const uri = `${directory}${digest}.${slot}.json`;
        return (await FileSystem.getInfoAsync(uri)).exists
          ? FileSystem.readAsStringAsync(uri)
          : null;
      },
      write: (slot: 0 | 1, value: string) =>
        FileSystem.writeAsStringAsync(`${directory}${digest}.${slot}.json`, value),
    };
    return kind === 'order'
      ? DraftStore.open<OrderForm, OrderPayload, SalesResult>(
          storage,
          identity,
          initialOrder,
          Crypto.randomUUID
        )
      : DraftStore.open<PaymentForm, PaymentPayload, SalesResult>(
          storage,
          identity,
          () => initialPayment(customerId),
          Crypto.randomUUID
        );
  })();
  stores.set(identity, opening);
  if (cloud) cloudStores.add(identity);
  void opening.catch(() => {
    if (stores.get(identity) === opening) stores.delete(identity);
  });
  return opening;
}
export function forgetDraft(scope: QueryScope, kind: string) {
  const identity = draftScope(scope, kind);
  stores.delete(identity);
  cloudStores.delete(identity);
}
export async function wipeCloudDrafts() {
  for (const identity of cloudStores) {
    const store = await stores.get(identity)?.catch(() => null);
    await store?.close();
    stores.delete(identity);
  }
  cloudStores.clear();
  if (FileSystem.documentDirectory)
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}cloud-sales-drafts-v1/`, {
      idempotent: true,
    });
}
