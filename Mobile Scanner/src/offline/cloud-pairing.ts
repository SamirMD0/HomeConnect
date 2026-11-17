import type { AccountUser } from '@shared/mobile-contracts';
export type CloudRole = 'ADMIN' | 'EMPLOYEE';
export interface CloudPairing { v: 1; relay: string; deviceId: string; token: string; userId: string; userName: string; role: CloudRole; branchIds: string[] }
export type DeviceProfile = Pick<CloudPairing, 'deviceId' | 'userId' | 'userName' | 'role' | 'branchIds'>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseDeviceProfile(value: unknown): DeviceProfile | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as DeviceProfile;
  if (!uuid.test(data.deviceId) || !uuid.test(data.userId) ||
    typeof data.userName !== 'string' || !data.userName.trim() || data.userName.length > 200 ||
    !['ADMIN', 'EMPLOYEE'].includes(data.role) || !Array.isArray(data.branchIds) || data.branchIds.length > 100 ||
    !data.branchIds.every(id => typeof id === 'string' && uuid.test(id)) || new Set(data.branchIds).size !== data.branchIds.length) return null;
  return { deviceId: data.deviceId, userId: data.userId, userName: data.userName, role: data.role, branchIds: data.branchIds };
}
export function parseCloudPairing(value: string, allowEmptyBranches = false): CloudPairing | null {
  try {
    const data = JSON.parse(value);
    const url = new URL(data.relay);
    const profile = parseDeviceProfile({ ...data, role: data.role === undefined ? 'EMPLOYEE' : data.role });
    if (data.v !== 1 || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !uuid.test(data.deviceId) || !uuid.test(data.userId) || typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token) ||
      !profile || (!allowEmptyBranches && !profile.branchIds.length)) return null;
    return { v: 1, relay: url.toString().replace(/\/+$/, ''), token: data.token,
      ...profile };
  } catch { return null; }
}
// SecurityGate requires PIN setup/unlock before rendering any paired data.
export const pairedUser = (pairing: CloudPairing, cached?: AccountUser | null): AccountUser => ({
  id: pairing.userId, username: cached?.id === pairing.userId ? cached.username : pairing.userName,
  fullName: pairing.userName, role: pairing.role,
});
