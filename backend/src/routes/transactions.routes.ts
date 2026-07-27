import { Router } from 'express';
import { TransactionsController } from '../controllers/transactions.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { transactionParamsSchema, transactionQuerySchema } from '../validators/transactions.validator';

const router = Router();

// All transaction routes require authentication
router.use(requireAuth);

// List transactions
router.get('/', validate(transactionQuerySchema, 'query'), TransactionsController.listTransactions);

// Get transaction by ID
router.get('/:id', validate(transactionParamsSchema, 'params'), TransactionsController.getTransaction);

export default router;
