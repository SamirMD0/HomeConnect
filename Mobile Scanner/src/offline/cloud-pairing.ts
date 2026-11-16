import type { AccountUser } from '@shared/mobile-contracts';
export interface CloudPairing { v: 1; relay: string; deviceId: string; token: string; userId: string; userName: string; branchIds: string[] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseCloudPairing(value: string): CloudPairing | null {
  try {
    const data = JSON.parse(value);
    const url = new URL(data.relay);
    if (data.v !== 1 || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !uuid.test(data.deviceId) || !uuid.test(data.userId) || typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token) ||
      typeof data.userName !== 'string' || !data.userName.trim() || data.userName.length > 200 ||
      !Array.isArray(data.branchIds) || !data.branchIds.length || data.branchIds.length > 100 ||
      !data.branchIds.every((id: unknown) => typeof id === 'string' && uuid.test(id)) || new Set(data.branchIds).size !== data.branchIds.length) return null;
    return { v: 1, relay: url.toString().replace(/\/+$/, ''), deviceId: data.deviceId, token: data.token,
      userId: data.userId, userName: data.userName, branchIds: data.branchIds };
  } catch { return null; }
}
// TODO Phase 7: require device PIN/biometric unlock before exposing this paired identity.
export const pairedUser = (pairing: CloudPairing): AccountUser => ({ id: pairing.userId, username: pairing.userName, fullName: pairing.userName, role: 'EMPLOYEE' });
