import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { createRelayClient, type RelayDevice } from './client';
import { RelayError } from './errors';
import {
  actionsQuery, blobInput, claimInput, deviceInput, emptyInput, idInput, imageMime, MAX_BLOB_BYTES,
  recordsInput, recordsQuery, resultInput, actionInput,
} from './inputs';
import { RelayStore } from './store';

export type RelayLog = { method: string; path: string; status: number; ms: number };
export interface RelayOptions {
  store?: RelayStore;
  workerTokenSha256?: string;
  log?: (entry: RelayLog) => void;
  now?: () => number;
}

const digest = (token: string) => createHash('sha256').update(token).digest();
const tokenFrom = (authorization: string | undefined) => /^Bearer ([^\s]+)$/.exec(authorization ?? '')?.[1];
const countBody: RequestHandler = (req, res, next) => {
  req.on('data', chunk => { res.locals.bytesIn = (res.locals.bytesIn ?? 0) + Buffer.byteLength(chunk); });
  next();
};
const validate = (schema: z.ZodType, source: 'body' | 'query' | 'params'): RequestHandler => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) return next(new RelayError(400, 'INVALID_INPUT', 'Invalid request input.'));
  res.locals[source] = parsed.data;
  next();
};

function rateLimit(maximum: number, now: () => number): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();
  let sweepAt = 0;
  return (_req, res, next) => {
    const time = now();
    if (time >= sweepAt) {
      for (const [key, value] of windows) if (time - value.start >= 60000) windows.delete(key);
      sweepAt = time + 60000;
    }
    const key = (res.locals.device as RelayDevice | undefined)?.id ?? 'worker';
    const window = windows.get(key) ?? { start: time, count: 0 };
    window.count++;
    windows.set(key, window);
    if (window.count > maximum) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((window.start + 60000 - time) / 1000)));
      return next(new RelayError(429, 'RATE_LIMITED', 'Try again later.'));
    }
    next();
  };
}

export function createRelayApp(options: RelayOptions = {}) {
  const expectedHash = options.workerTokenSha256 ?? process.env.RELAY_WORKER_TOKEN_SHA256;
  if (!expectedHash || !/^[0-9a-fA-F]{64}$/.test(expectedHash)) throw new Error('RELAY_WORKER_TOKEN_SHA256 must be a SHA-256 hex digest');
  const expected = Buffer.from(expectedHash, 'hex');
  const store = options.store ?? new RelayStore(createRelayClient());
  const now = options.now ?? Date.now;
  const log = options.log ?? (entry => console.info(JSON.stringify(entry)));
  const app = express();
  app.disable('x-powered-by');
  app.set('json replacer', (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  app.use(helmet());
  app.use((req, res, next) => {
    const started = now();
    const path = req.path;
    res.on('finish', () => {
      log({ method: req.method, path, status: res.statusCode, ms: Math.max(0, now() - started) });
      // Health polling must allow the database to remain asleep.
      if (res.locals.health) return;
      void store.countUsage({
        bytesIn: res.locals.bytesIn ?? 0, bytesOut: req.method === 'HEAD' ? 0 : Number(res.getHeader('content-length') ?? 0),
        recordsWritten: res.locals.recordsWritten ?? 0, actionsReceived: res.locals.actionsReceived ?? 0,
      }).catch(() => {});
    });
    next();
  });
  app.get('/relay/v1/health', validate(emptyInput, 'query'), (_req, res) => {
    res.locals.health = true;
    res.json({ ok: true });
  });

  const worker = express.Router();
  worker.use((req, _res, next) => {
    const token = tokenFrom(req.headers.authorization);
    if (!token || !timingSafeEqual(digest(token), expected)) return next(new RelayError(401, 'UNAUTHORIZED', 'Worker authentication required.'));
    next();
  }, rateLimit(120, now), countBody, express.json({ limit: MAX_BLOB_BYTES }));
  let nextUpkeep = 0;
  let upkeep: Promise<unknown> | undefined;
  worker.use(async (_req, _res, next) => {
    try {
      await store.touchWorker(new Date(now()));
      if (now() >= nextUpkeep && !upkeep) {
        upkeep = store.upkeep(new Date(now()));
        try { await upkeep; nextUpkeep = now() + 3600000; } finally { upkeep = undefined; }
      }
      next();
    } catch (error) { next(error); }
  });
  worker.post('/records', validate(recordsInput, 'body'), async (_req, res) => {
    const result = await store.writeRecords(res.locals.body);
    res.locals.recordsWritten = result.stored;
    res.json(result);
  });
  worker.get('/state', validate(emptyInput, 'query'), async (_req, res) => { res.json(await store.workerState()); });
  worker.post('/outbox/claim', validate(claimInput, 'body'), async (_req, res) => { res.json(await store.claim(res.locals.body.limit)); });
  worker.get('/outbox/:id/blob', validate(idInput, 'params'), async (_req, res) => {
    const blob = await store.getBlob(res.locals.params.id);
    res.type(blob.mime).send(blob.bytes);
  });
  worker.post('/outbox/:id/result', validate(idInput, 'params'), validate(resultInput, 'body'), async (_req, res) => {
    res.json(await store.saveResult(res.locals.params.id, res.locals.body));
  });
  worker.post('/devices', validate(deviceInput, 'body'), async (_req, res) => {
    if (timingSafeEqual(Buffer.from(res.locals.body.tokenSha256, 'hex'), expected)) {
      throw new RelayError(400, 'INVALID_DEVICE_TOKEN', 'Use a separate device token.');
    }
    res.json(await store.registerDevice(res.locals.body));
  });
  worker.post('/devices/:id/revoke', validate(idInput, 'params'), validate(emptyInput.default({}), 'body'), async (_req, res) => {
    res.json(await store.revokeDevice(res.locals.params.id));
  });
  worker.get('/devices', validate(emptyInput, 'query'), async (_req, res) => { res.json(await store.devices()); });
  worker.get('/usage', validate(emptyInput, 'query'), async (_req, res) => { res.json(await store.usage()); });
  app.use('/relay/v1/worker', worker);

  const device = express.Router();
  device.use(async (req, res, next) => {
    try {
      const token = tokenFrom(req.headers.authorization);
      if (!token) throw new RelayError(401, 'UNAUTHORIZED', 'Device authentication required.');
      const hash = digest(token);
      if (timingSafeEqual(hash, expected)) throw new RelayError(401, 'UNAUTHORIZED', 'Device authentication required.');
      const paired = await store.findDevice(hash.toString('hex'));
      if (!paired) throw new RelayError(401, 'UNAUTHORIZED', 'Device authentication required.');
      if (paired.revokedAt) throw new RelayError(401, 'DEVICE_REVOKED', 'This device has been revoked.');
      res.locals.device = paired;
      if (!paired.lastSeenAt || now() - paired.lastSeenAt.getTime() >= 60000) {
        await store.touchDevice(paired.id, new Date(now()));
      }
      next();
    } catch (error) { next(error); }
  }, rateLimit(120, now), countBody, express.json({ limit: MAX_BLOB_BYTES }));
  device.get('/records', validate(recordsQuery, 'query'), async (_req, res) => {
    const query = res.locals.query as z.infer<typeof recordsQuery>;
    const paired = res.locals.device as RelayDevice;
    const options = query.fullCopy ? { fullCopy: true, snapshotHorizon: query.snapshotHorizon } : undefined;
    res.json(await store.readRecords(paired.branchIds, query.after, query.limit, options));
  });
  device.post('/actions', validate(actionInput, 'body'), async (_req, res) => {
    const paired = res.locals.device as RelayDevice;
    if (!paired.branchIds.includes(res.locals.body.branchId)) throw new RelayError(403, 'BRANCH_ACCESS_DENIED', 'Branch access denied.');
    const result = await store.enqueue(paired, res.locals.body);
    res.locals.actionsReceived = result.created ? 1 : 0;
    res.status(result.created ? 201 : 200).json({ id: result.id, status: result.status });
  });
  device.put('/actions/:id/blob', validate(idInput, 'params'), (req, _res, next) => {
    if (!imageMime.safeParse(req.headers['content-type']?.split(';')[0].trim().toLowerCase()).success) {
      return next(new RelayError(415, 'UNSUPPORTED_IMAGE', 'Use a JPEG, PNG or WebP image.'));
    }
    next();
  }, express.raw({ type: () => true, limit: MAX_BLOB_BYTES }), validate(blobInput, 'body'), async (req, res) => {
    const paired = res.locals.device as RelayDevice;
    const mime = imageMime.parse(req.headers['content-type']!.split(';')[0].trim().toLowerCase());
    res.json(await store.putBlob(paired.id, res.locals.params.id, mime, res.locals.body));
  });
  device.get('/actions', validate(actionsQuery, 'query'), async (_req, res) => {
    const paired = res.locals.device as RelayDevice;
    res.json(await store.actionResults(paired.id, res.locals.query.ids));
  });
  app.use('/relay/v1/device', device);
  app.use((_req, _res, next) => next(new RelayError(404, 'NOT_FOUND', 'Route not found.')));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof RelayError) {
      if (error.code === 'RESYNC_REQUIRED') {
        res.status(410).json({ code: error.code });
        return;
      }
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    const failure = error as { type?: string; code?: string } | null;
    if (failure?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body exceeds the limit.' } });
    } else if (failure?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' } });
    } else if (failure?.code === 'P2002') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Identifier is already registered.' } });
    } else {
      res.status(500).json({ error: { code: 'RELAY_UNAVAILABLE', message: 'Relay request failed. Try again later.' } });
    }
  };
  app.use(errors);
  return app;
}
