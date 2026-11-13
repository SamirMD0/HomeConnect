import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLookup } from '../lookup/useLookup';
import { queryKeys } from '../query/keys';
import { HcApiError } from '../api/hc-client';
import { forgetDraft, openDraft } from './draft-files';
import type { DraftStore } from './draft-store';
import type { SalesResult } from './contracts';
export function useSalesDraft<F, P>(kind: 'order' | 'payment', customerId = '') {
  const lookup = useLookup(),
    { server, userId, branchId } = lookup.scope;
  const queryClient = useQueryClient();
  const [store, setStore] = useState<DraftStore<F, P, SalesResult> | null>(null),
    [error, setError] = useState(''),
    [, render] = useState(0),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      unsubscribe: (() => void) | undefined;
    setStore(null);
    setError('');
    void openDraft({ server, userId, branchId }, kind, customerId)
      .then((opened) => {
        if (!active) return;
        const typed = opened as unknown as DraftStore<F, P, SalesResult>;
        setStore(typed);
        unsubscribe = typed.subscribe(() => render((value) => value + 1));
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [server, userId, branchId, kind, customerId, revision]);
  const mutation = useMutation({
    mutationFn: async (action: {
      build: (form: F, key: string) => P;
      send: (payload: P, form: F) => Promise<SalesResult>;
    }) => {
      if (!store) throw new Error('Wait for the saved form to load.');
      return store.submit(action.build, action.send);
    },
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scope(lookup.scope) });
    },
    onError: (failure) => {
      setError(failure.message);
      // A validation response is a definite rejection, unlike a timeout or 409.
      if (failure instanceof HcApiError && [400, 422].includes(failure.status ?? 0))
        void store?.editRejected().catch((err: Error) => setError(err.message));
    },
  });
  const edit = (form: F) => {
    setError('');
    void store?.edit(form).catch((failure: Error) => setError(failure.message));
  };
  const discard = async () => {
    if (!store) return;
    await store.discard();
    forgetDraft(lookup.scope, kind === 'order' ? kind : `${kind}:${customerId}`);
    setRevision((value) => value + 1);
    mutation.reset();
  };
  return {
    ...lookup,
    client: { ...lookup.client, branchId },
    store,
    record: store?.current,
    error,
    setError,
    edit,
    discard,
    mutation,
  };
}
