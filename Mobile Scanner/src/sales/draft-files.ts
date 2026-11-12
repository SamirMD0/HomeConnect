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
export type OrderStore = DraftStore<OrderForm, OrderPayload, SalesResult>;
export type PaymentStore = DraftStore<PaymentForm, PaymentPayload, SalesResult>;
const stores = new Map<string, Promise<OrderStore | PaymentStore>>();
export function draftScope(scope: QueryScope, kind: string) {
  return JSON.stringify([scope.server, scope.userId, scope.branchId, kind]);
}
export async function openDraft(
  scope: QueryScope,
  kind: 'order' | 'payment',
  customerId = ''
): Promise<OrderStore | PaymentStore> {
  const identity = draftScope(scope, kind === 'order' ? kind : `${kind}:${customerId}`);
  const existing = stores.get(identity);
  if (existing) return existing;
  const opening = (async () => {
    if (!FileSystem.documentDirectory) throw new Error('Device storage is unavailable.');
    const directory = `${FileSystem.documentDirectory}sales-drafts-v1/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, identity);
    const storage = {
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
  void opening.catch(() => {
    if (stores.get(identity) === opening) stores.delete(identity);
  });
  return opening;
}
export function forgetDraft(scope: QueryScope, kind: string) {
  stores.delete(draftScope(scope, kind));
}
