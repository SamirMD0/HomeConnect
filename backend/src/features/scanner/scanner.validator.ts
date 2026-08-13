import { z } from 'zod';
import { MAX_DEVICE_LABEL_LENGTH } from './scanner.service';
import { databaseUuidSchema } from '../../validators/database-uuid';

export const createPairingCodeSchema = z.object({
  deviceLabel: z.string().trim().min(1).max(MAX_DEVICE_LABEL_LENGTH).optional(),
});

export const sessionParamsSchema = z.object({
  sessionId: z.string().min(1, 'Session id is required').max(64),
});

export const recentEventsQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
});

/**
 * A PC-sourced scan record. `source` is not accepted from the client: a request
 * on the authenticated loopback API is by definition the desk scanner, and the
 * phone will get its own route on the LAN listener.
 */
export const recordEventSchema = z.object({
  code: z.string().trim().min(1).max(64),
  status: z.enum(['FOUND', 'NOT_FOUND', 'INVALID_CODE']),
  productId: databaseUuidSchema().optional().nullable(),
});

/**
 * Pairing input from the phone.
 *
 * The code is validated only for length, not shape. A `/^\d{6}$/` schema would
 * answer 400 for a malformed code and 401 for a wrong one, handing a caller a
 * way to tell the two apart — the exact distinction the service works to hide.
 * Anything that is not the code simply fails to match its hash.
 */
export const lanPairSchema = z.object({
  code: z.string().trim().min(1).max(12),
  deviceLabel: z.string().trim().max(MAX_DEVICE_LABEL_LENGTH).optional(),
});

/**
 * A phone scan carries the code and nothing else. Status and product are
 * derived server-side: a phone must not be able to assert what it matched.
 */
export const lanEventSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export type LanPairInput = z.infer<typeof lanPairSchema>;
export type LanEventInput = z.infer<typeof lanEventSchema>;
export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>;
export type SessionParamsInput = z.infer<typeof sessionParamsSchema>;
export type RecentEventsQueryInput = z.infer<typeof recentEventsQuerySchema>;
export type RecordEventInput = z.infer<typeof recordEventSchema>;
