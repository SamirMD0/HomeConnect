import { Router } from 'express';
import { z } from 'zod';
import { branchScopeMiddleware } from '../../middleware/branch-scope.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { readChanges } from './sync-feed.service';

const changesQuery = z.object({
  after: z.string().regex(/^\d+$/).default('0').transform(value => BigInt(value))
    .pipe(z.bigint().min(0n).max(9223372036854775807n)),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export const syncRoutes = Router();
syncRoutes.use(requireRole(['ADMIN']), branchScopeMiddleware);
syncRoutes.get('/changes', validate(changesQuery, 'query'), async (req, res, next) => {
  try {
    const query = req.query as unknown as z.output<typeof changesQuery>;
    res.json({ success: true, data: await readChanges(query.after, query.limit, req.branchScope!) });
  } catch (error) {
    next(error);
  }
});
