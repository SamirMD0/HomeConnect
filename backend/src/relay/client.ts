import { PrismaClient } from '.prisma/relay-client';

export { Prisma } from '.prisma/relay-client';
export type { RelayDevice, RelayOutbox, RelayRecord } from '.prisma/relay-client';

export function createRelayClient() {
  const url = process.env.RELAY_DATABASE_URL;
  if (!url) throw new Error('RELAY_DATABASE_URL is required');
  return new PrismaClient({ datasources: { db: { url } } });
}

export type RelayClient = ReturnType<typeof createRelayClient>;
