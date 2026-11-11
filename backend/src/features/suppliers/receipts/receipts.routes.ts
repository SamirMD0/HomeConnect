import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../../middleware/validate.middleware';
import { requireRole } from '../../../middleware/role.middleware';
import { ValidationError } from '../../../lib/errors';
import {
  billImage,
  deleteBill,
  listBills,
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
    const created = await storeReceipt(
      {
        receiptId: identifier.data,
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
supplierBillsGlobalRoutes.patch(
  '/:receiptId',
  validate(billParams, 'params'),
  validate(z.object({ supplierReceivingId: z.string().uuid().nullable(), note })),
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
// The current Role enum has ADMIN and EMPLOYEE only. MANAGER is accepted by the
// shared guard for installations introducing that role; employees cannot delete.
supplierBillsGlobalRoutes.delete(
  '/:receiptId',
  requireRole(['ADMIN', 'MANAGER']),
  validate(billParams, 'params'),
  async (req, res, next) => {
    try {
      await deleteBill(String(req.params.receiptId), req.branchScope!);
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  }
);
