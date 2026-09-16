import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../../../middleware/validate.middleware';
import { databaseUuidSchema } from '../../../validators/database-uuid';
import { SalesReturnsService } from './sales-returns.service';

const paramsSchema = z.object({ salesReturnId: databaseUuidSchema() });
type Params = z.infer<typeof paramsSchema>;

export const salesReturnsRoutes = Router();
salesReturnsRoutes.get('/:salesReturnId', validate(paramsSchema, 'params'), async (
  req: Request<Params>, res: Response, next: NextFunction
) => {
  try {
    res.json({ success: true, data: await SalesReturnsService.get(req.params.salesReturnId) });
  } catch (error) {
    next(error);
  }
});
