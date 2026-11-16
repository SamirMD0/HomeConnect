import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { ValidationError } from '../../../lib/errors';
import { encryptWorkerSecret } from './worker-secret';

export const relayUrlSchema = z.string().url().max(2000).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
}, 'Use an HTTPS relay address (HTTP is allowed only on localhost).').transform(value => value.replace(/\/+$/, ''));
export const workerSettingsSchema = z.object({
  enabled: z.boolean(),
  relayUrl: relayUrlSchema.nullable(),
  workerSecret: z.string().min(1).max(4096).optional(),
  openingStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  openingEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
}).strict();

export const workerState = () => prisma.syncWorkerState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
const time = (date: Date) => date.toISOString().slice(11, 16);
export async function workerStatus() {
  const state = await workerState();
  return {
    enabled: state.enabled, relayUrl: state.relayUrl, secretConfigured: Boolean(state.workerSecretEncrypted),
    openingStart: time(state.openingStart), openingEnd: time(state.openingEnd),
    lastPushedSeq: state.lastPushedSeq, snapshotDone: state.snapshotDone,
    lastCycleAt: state.lastCycleAt, lastSuccessAt: state.lastSuccessAt, lastError: state.lastError,
  };
}

export async function saveWorkerSettings(input: z.infer<typeof workerSettingsSchema>) {
  const previous = await workerState();
  if (input.enabled && (!input.relayUrl || !(input.workerSecret || previous.workerSecretEncrypted))) {
    throw new ValidationError('Enter the relay address and worker secret before enabling sync.');
  }
  await prisma.syncWorkerState.update({ where: { id: 1 }, data: {
    enabled: input.enabled, relayUrl: input.relayUrl,
    openingStart: new Date(`1970-01-01T${input.openingStart}:00.000Z`),
    openingEnd: new Date(`1970-01-01T${input.openingEnd}:00.000Z`),
    ...(input.workerSecret ? { workerSecretEncrypted: encryptWorkerSecret(input.workerSecret) } : {}),
    ...(previous.relayUrl !== input.relayUrl ? { snapshotDone: false, snapshotProgress: Prisma.DbNull, lastPushedSeq: '0' } : {}),
  } });
  return workerStatus();
}
