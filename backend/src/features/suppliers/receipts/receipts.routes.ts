import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../../middleware/validate.middleware';
import { ValidationError } from '../../../lib/errors';
import {
  billImage,
  deleteBill,
  listBillsForTransaction,
  replaceBillPage,
  listBills,
  listUnlinkedBills,
  countUnlinkedBills,
  listReceiptsForReceiving,
  receiptReceiving,
  storeReceipt,
  updateBill,
  RECEIPT_LIMITS,
} from './receipts.service';

const receivingParams = z.object({ supplierReceivingId: z.string().uuid() });
const supplierParams = z.object({ supplierId: z.string().uuid() });
const billParams = z.object({ receiptId: z.string().uuid() });
const note = z.string().max(2000).optional();
const rawBody = express.raw({ type: RECEIPT_LIMITS.allowedMimes, limit: RECEIPT_LIMITS.maxBytes });
const upload: RequestHandler = async (req, res, next) => {
  try {
    const identifier = z.string().uuid().optional().safeParse(req.header('X-Receipt-Id'));
    if (!identifier.success) throw new ValidationError('Invalid bill upload identifier.');
    const group = z.string().uuid().optional().safeParse(req.header('X-Bill-Group'));
    if (!group.success) throw new ValidationError('Invalid bill identifier for the new page.');
    const created = await storeReceipt(
      {
        receiptId: identifier.data,
        billGroupId: group.data,
        supplierReceivingId: req.params.supplierReceivingId as string | undefined,
        supplierId: req.params.supplierId as string | undefined,
        note: req.query.note as string | undefined,
        capturedById: req.user!.userId,
        mime: (req.header('content-type') ?? '').split(';')[0].trim().toLowerCase(),
        bytes: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      },
      req.branchScope!
    );
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};
export const supplierReceiptsRoutes = Router();
supplierReceiptsRoutes.get(
  '/:supplierReceivingId/receipts',
  validate(receivingParams, 'params'),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await listReceiptsForReceiving(
          String(req.params.supplierReceivingId),
          req.branchScope!
        ),
      });
    } catch (error) {
      next(error);
    }
  }
);
supplierReceiptsRoutes.post(
  '/:supplierReceivingId/receipts',
  validate(receivingParams, 'params'),
  async (req, _res, next) => {
    try {
      await receiptReceiving(String(req.params.supplierReceivingId), req.branchScope!);
      next();
    } catch (error) {
      next(error);
    }
  },
  validate(z.object({ note }), 'query'),
  rawBody,
  upload
);

export const supplierBillsRoutes = Router();
supplierBillsRoutes.post(
  '/:supplierId/bills',
  validate(supplierParams, 'params'),
  validate(z.object({ note }), 'query'),
  rawBody,
  upload
);
supplierBillsRoutes.get(
  '/:supplierId/bills',
  validate(supplierParams, 'params'),
  validate(z.object({ linked: z.enum(['false', 'true', 'all']).default('all') }), 'query'),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await listBills(
          String(req.params.supplierId),
          req.query.linked as 'false' | 'true' | 'all',
          req.branchScope!
        ),
      });
    } catch (error) {
      next(error);
    }
  }
);
export const supplierBillsGlobalRoutes = Router();
// Bills inbox across suppliers (both static paths are registered before /:receiptId).
supplierBillsGlobalRoutes.get(
  '/',
  validate(z.object({ linked: z.literal('false'), limit: z.coerce.number().int().min(1).max(200).default(100) }), 'query'),
  async (req, res, next) => {
    try {
      res.json({ success: true, data: await listUnlinkedBills(req.branchScope!, Number(req.query.limit) || 100) });
    } catch (error) {
      next(error);
    }
  }
);
supplierBillsGlobalRoutes.get('/unlinked-count', async (req, res, next) => {
  try {
    res.json({ success: true, data: { count: await countUnlinkedBills(req.branchScope!) } });
  } catch (error) {
    next(error);
  }
});
supplierBillsGlobalRoutes.get(
  '/for-transaction/:transactionId',
  validate(z.object({ transactionId: z.string().uuid() }), 'params'),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await listBillsForTransaction(String(req.params.transactionId), req.branchScope!),
      });
    } catch (error) {
      next(error);
    }
  }
);
supplierBillsGlobalRoutes.patch(
  '/:receiptId',
  validate(billParams, 'params'),
  validate(
    z
      .object({
        supplierReceivingId: z.string().uuid().nullable().optional(),
        supplierTransactionId: z.string().uuid().nullable().optional(),
        note,
      })
      .refine(
        (body) =>
          body.supplierReceivingId !== undefined ||
          body.supplierTransactionId !== undefined ||
          body.note !== undefined,
        'Nothing to change.'
      )
  ),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await updateBill(String(req.params.receiptId), req.body, req.branchScope!),
      });
    } catch (error) {
      next(error);
    }
  }
);
supplierBillsGlobalRoutes.get(
  '/:receiptId/image',
  validate(billParams, 'params'),
  async (req, res, next) => {
    try {
      const { row, bytes } = await billImage(String(req.params.receiptId), req.branchScope!);
      res
        .set({
          'Content-Type': row.mime,
          'Cache-Control': 'private, max-age=86400',
          'Content-Length': String(bytes.length),
        })
        .send(bytes);
    } catch (error) {
      next(error);
    }
  }
);
// Replace one page: the raw image body becomes the page; the old one is kept.
supplierBillsGlobalRoutes.post(
  '/:receiptId/replace',
  validate(billParams, 'params'),
  rawBody,
  async (req, res, next) => {
    try {
      const page = await replaceBillPage(
        String(req.params.receiptId),
        {
          capturedById: req.user!.userId,
          mime: (req.header('content-type') ?? '').split(';')[0].trim().toLowerCase(),
          bytes: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
        },
        req.branchScope!
      );
      res.status(201).json({ success: true, data: page });
    } catch (error) {
      next(error);
    }
  }
);
// Soft delete. Admins delete any bill; employees only their own unlinked bill
// within 24 hours (checked in the service). `bill=true` deletes every page.
supplierBillsGlobalRoutes.delete(
  '/:receiptId',
  validate(billParams, 'params'),
  validate(
    z.object({
      bill: z.enum(['true', 'false']).default('false'),
      reason: z.string().trim().max(500).optional(),
    }),
    'query'
  ),
  async (req, res, next) => {
    try {
      const result = await deleteBill(
        String(req.params.receiptId),
        { wholeBill: req.query.bill === 'true', reason: req.query.reason as string | undefined },
        { userId: req.user!.userId, role: req.user!.role },
        req.branchScope!
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);
