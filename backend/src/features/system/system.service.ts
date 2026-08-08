import { prisma } from '../../lib/prisma';
import { LanScannerMode, lanListenerStatus } from '../scanner/lan-listener';

const APP_VERSION = process.env.npm_package_version ?? process.env.APP_VERSION ?? 'unknown';

export type DatabaseStatus = 'CONNECTED' | 'UNAVAILABLE';

export interface LocalStatus {
  backend: 'UP';
  database: DatabaseStatus;
  lanScanner: { mode: LanScannerMode };
  appVersion: string;
  serverTime: string;
}

export class SystemService {
  /**
   * Local health for the status strip, deliberately never an error response.
   *
   * `/api/v1/health` answers 503 when the database is unreachable, which is
   * right for a health check but wrong here: the caller derives "backend
   * reachable" from whether this request completed at all. Failing the request
   * because the database is down would collapse two independent signals into
   * one, and the UI could no longer say "the app is running, the database is
   * not" — which is exactly the situation the operator needs to see.
   */
  static async localStatus(now: Date = new Date()): Promise<LocalStatus> {
    return {
      backend: 'UP',
      database: await probeDatabase(),
      lanScanner: { mode: lanListenerStatus().mode },
      appVersion: APP_VERSION,
      serverTime: now.toISOString(),
    };
  }
}

/** Same probe as the health route: cheapest statement that proves a live session. */
async function probeDatabase(): Promise<DatabaseStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'CONNECTED';
  } catch {
    return 'UNAVAILABLE';
  }
}
