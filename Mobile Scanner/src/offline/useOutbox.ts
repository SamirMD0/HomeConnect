import { useQuery } from '@tanstack/react-query';
import { useSession } from '../session/SessionProvider';
import { openLocalDb } from './expo-db';
import { cleanOutbox, listOutbox, ownerKey, unfinished } from './outbox';
import {summaryArchive,archivedRow} from '../security/summary-archive';
export function useOutbox(archivesOnly = false, enabled = true) {
  const pairing = useSession().cloudPairing;
  const owner = pairing ? ownerKey(pairing) : undefined;
  const query = useQuery({
    queryKey: ['cloud-outbox', archivesOnly ? 'archives' : (owner ?? 'unpaired')],
    enabled,
    queryFn: async () => {
      const archives=(await summaryArchive.list()).map(archivedRow);
      if(!owner)return archives;
      const db = await openLocalDb();
      await cleanOutbox(db);
      const rows = await listOutbox(db, owner);
      const combined=[...rows,...archives.filter(row=>!rows.some(existing=>existing.id===row.id))];
      return archivesOnly?combined.filter(row=>row.archived):combined;
    },
    refetchInterval: 2000,
  });
  const count = (query.data ?? []).filter(
    (row) => unfinished(row) || row.local_status === 'refused' || row.archived
  ).length;
  return { ...query, count };
}
