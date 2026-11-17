import { useQuery } from '@tanstack/react-query';
import { useSession } from '../session/SessionProvider';
import { openLocalDb } from './expo-db';
import { cleanOutbox, listOutbox, ownerKey, unfinished } from './outbox';
export function useOutbox(archivesOnly = false) {
  const pairing = useSession().cloudPairing;
  const owner = pairing ? ownerKey(pairing) : undefined;
  const query = useQuery({
    queryKey: ['cloud-outbox', archivesOnly ? 'archives' : (owner ?? 'unpaired')],
    queryFn: async () => {
      const db = await openLocalDb();
      await cleanOutbox(db);
      const rows = await listOutbox(db, owner);
      return archivesOnly || !owner ? rows.filter((row) => row.archived) : rows;
    },
    refetchInterval: 2000,
  });
  const count = (query.data ?? []).filter(
    (row) => unfinished(row) || row.local_status === 'refused' || row.archived
  ).length;
  return { ...query, count };
}
