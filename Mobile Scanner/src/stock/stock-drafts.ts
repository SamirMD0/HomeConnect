import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { DraftStore } from '../sales/draft-store';
import { draftScope } from '../sales/draft-files';
import { localDate } from '../lookup/filters';
import type { QueryScope } from '../query/keys';
import {
  initialCount,
  initialReceive,
  type CountForm,
  type ReceiveForm,
  type ReceivingPayload,
} from './stock-logic';
import type { ReceivingResult } from './stock-api';

/**
 * Durable stock drafts, stored like the sales drafts (two verified slots per
 * PC + user + branch). A count or a receiving survives the app being killed.
 * Passwords are never part of a draft.
 */
export type CountStore = DraftStore<CountForm, never, never>;
export type ReceiveStore = DraftStore<ReceiveForm, ReceivingPayload, ReceivingResult>;
type Kind = 'count' | 'receive';

const stores = new Map<string, Promise<CountStore | ReceiveStore>>();

function open(scope: QueryScope, kind: Kind): Promise<CountStore | ReceiveStore> {
  const identity = draftScope(scope, `stock:${kind}`);
  const existing = stores.get(identity);
  if (existing) return existing;
  const opening = (async () => {
    if (!FileSystem.documentDirectory) throw new Error('Device storage is unavailable.');
    const directory = `${FileSystem.documentDirectory}stock-drafts-v1/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, identity);
    const storage = {
      read: async (slot: 0 | 1) => {
        const uri = `${directory}${digest}.${slot}.json`;
        return (await FileSystem.getInfoAsync(uri)).exists ? FileSystem.readAsStringAsync(uri) : null;
      },
      write: (slot: 0 | 1, value: string) =>
        FileSystem.writeAsStringAsync(`${directory}${digest}.${slot}.json`, value),
    };
    return kind === 'count'
      ? DraftStore.open<CountForm, never, never>(storage, identity, initialCount, Crypto.randomUUID)
      : DraftStore.open<ReceiveForm, ReceivingPayload, ReceivingResult>(
          storage,
          identity,
          () => initialReceive(localDate()),
          Crypto.randomUUID
        );
  })();
  stores.set(identity, opening);
  void opening.catch(() => {
    if (stores.get(identity) === opening) stores.delete(identity);
  });
  return opening;
}

export function forgetStockDraft(scope: QueryScope, kind: Kind) {
  stores.delete(draftScope(scope, `stock:${kind}`));
}

/** Opens the draft for this PC/user/branch and re-renders on every change. */
export function useStockDraft<S extends CountStore | ReceiveStore>(scope: QueryScope, kind: Kind) {
  const [store, setStore] = useState<S | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [, render] = useState(0);
  const { server, userId, branchId } = scope;
  useEffect(() => {
    let active = true,
      unsubscribe: (() => void) | undefined;
    setStore(null);
    void open({ server, userId, branchId }, kind)
      .then((opened) => {
        if (!active) return;
        const typed = opened as S;
        setStore(typed);
        unsubscribe = typed.subscribe(() => render((value) => value + 1));
      })
      .catch((failure: Error) => active && setError(failure.message));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [server, userId, branchId, kind, revision]);
  const restart = async () => {
    if (store) await store.discard();
    forgetStockDraft({ server, userId, branchId }, kind);
    setRevision((value) => value + 1);
  };
  return { store, error, setError, restart };
}
