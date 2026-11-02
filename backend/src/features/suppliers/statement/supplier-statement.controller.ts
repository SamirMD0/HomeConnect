import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { documentBranch } from '../../documents/document-branch';
import { parseBusinessDate } from '../../financial/domain/business-date';
import { SupplierStatementQuery, SupplierStatementService } from './supplier-statement.service';

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format').refine((value) => {
  try { parseBusinessDate(value); return true; } catch { return false; }
}, 'Date must be a valid calendar date');

export const supplierStatementQuerySchema = z.object({
  from: businessDateSchema,
  to: businessDateSchema,
}).refine((value) => value.from <= value.to, {
  message: 'From date must not be after to date',
  path: ['from'],
});

export class SupplierStatementController {
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const supplierId = req.params.supplierId as string;
      const statement = await SupplierStatementService.get(supplierId, req.query as unknown as SupplierStatementQuery, req.branchScope!);
      res.status(200).json({
        success: true,
        data: { ...statement, ...await documentBranch('supplier', supplierId) },
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
