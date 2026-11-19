import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { AppError, ValidationError } from '../../../lib/errors';
import { BranchesService } from '../../branches/branches.service';
import { workerState, relayUrlSchema } from './worker-settings';
import { decryptWorkerSecret } from './worker-secret';
import { WorkerRelay } from './relay-client';

// z.guid(): shop ids are UUID-shaped but not always RFC 4122 (see relay/inputs.ts).
export const pairDeviceSchema = z.object({
  userId: z.guid(), name: z.string().trim().min(1).max(200),
  branchIds: z.array(z.guid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length),
}).strict();
async function configuredRelay() {
  const state = await workerState();
  if (!state.relayUrl || !state.workerSecretEncrypted) throw new ValidationError('Save the relay address and worker secret first.');
  const url = relayUrlSchema.parse(state.relayUrl);
  if (!url.startsWith('https://')) throw new ValidationError('Phone pairing requires an HTTPS relay address.');
  return { url, client: new WorkerRelay(url, decryptWorkerSecret(state.workerSecretEncrypted), Date.now() + 75000) };
}
export async function pairingOptions() {
  const users = await prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, fullName: true, username: true, role: true } });
  return Promise.all(users.map(async user => ({ ...user, branches: await BranchesService.accessibleBranches({ userId: user.id, role: user.role }) })));
}
export async function pairDevice(input: z.infer<typeof pairDeviceSchema>) {
  const user = await prisma.user.findFirst({ where: { id: input.userId, isActive: true, deletedAt: null }, select: { id: true, fullName: true, role: true } });
  if (!user) throw new ValidationError('Choose an active user.');
  const branches = await BranchesService.accessibleBranches({ userId: user.id, role: user.role });
  if (!input.branchIds.every(id => branches.some(branch => branch.id === id))) throw new AppError('Choose branches this user can access.', 403, 'BRANCH_ACCESS_DENIED');
  const { url, client } = await configuredRelay();
  const deviceId = randomUUID(), token = randomBytes(32).toString('base64url');
  await client.request('/devices', { id: deviceId, userId: user.id, userName: user.fullName,
    role: user.role, branchIds: input.branchIds, name: input.name, tokenSha256: createHash('sha256').update(token).digest('hex') });
  // Deliberately never save the token or payload in the PC database.
  return { v: 1 as const, relay: url, deviceId, token, userId: user.id, userName: user.fullName, role: user.role, branchIds: input.branchIds };
}
export async function pairedDevices() { return (await configuredRelay()).client.request('/devices'); }
/** The relay's Neon usage estimate. Called only when the Settings panel opens (each call wakes Neon). */
export async function relayUsageEstimate() {
  const usage = await (await configuredRelay()).client.request('/usage') as { estimate?: unknown };
  return usage.estimate ?? null;
}
export async function revokeDevice(id: string) { return (await configuredRelay()).client.request(`/devices/${id}/revoke`, {}); }
