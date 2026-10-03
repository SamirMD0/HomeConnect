import express, { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../../middleware/validate.middleware';
import { listReceiptsForReceiving, ReceiptError, storeReceipt, RECEIPT_LIMITS } from './receipts.service';

/**
 * Receipt-photo endpoints for a supplier receiving (BIRD "Purchase Invoice").
 * Mobile uploads the raw image bytes with Content-Type: image/jpeg (or png,
 * heic, heif, webp). The route uses `express.raw` with a 5 MB cap. No
 * multer / formidable dependency — the mobile client knows the MIME and the
 * server trusts the Content-Type header after validation.
 */

const paramsSchema = z.object({
  supplierReceivingId: z.string().uuid('Invalid supplier receiving id'),
});

export const supplierReceiptsRoutes = Router();

supplierReceiptsRoutes.get(
  '/:supplierReceivingId/receipts',
  validate(paramsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { supplierReceivingId } = req.params as { supplierReceivingId: string };
      const data = await listReceiptsForReceiving(supplierReceivingId);
      res.json({
        success: true,
        data,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },
);

const rawBodyParser = express.raw({
  type: RECEIPT_LIMITS.allowedMimes,
  limit: RECEIPT_LIMITS.maxBytes,
});

supplierReceiptsRoutes.post(
  '/:supplierReceivingId/receipts',
  validate(paramsSchema, 'params'),
  rawBodyParser,
  async (req, res, next) => {
    try {
      const { supplierReceivingId } = req.params as { supplierReceivingId: string };
      const mime = (req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
      const bytes = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.alloc(0);
      const capturedById = req.user?.userId;
      if (!capturedById) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User context missing.' },
          meta: { timestamp: new Date().toISOString() },
        });
        return;
      }

      const created = await storeReceipt({
        supplierReceivingId,
        capturedById,
        mime: mime ?? '',
        bytes,
      });

      res.status(201).json({
        success: true,
        data: {
          id: created.id,
          supplierReceivingId: created.supplierReceivingId,
          filename: created.filename,
          mime: created.mime,
          bytes: created.bytes,
          capturedAt: created.capturedAt.toISOString(),
          capturedById: created.capturedById,
        },
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      if (error instanceof ReceiptError) {
        const status =
          error.code === 'NOT_FOUND' ? 404 : error.code === 'TOO_LARGE' ? 413 : 400;
        res.status(status).json({
          success: false,
          error: { code: error.code, message: error.message },
          meta: { timestamp: new Date().toISOString() },
        });
        return;
      }
      next(error);
    }
  },
);
