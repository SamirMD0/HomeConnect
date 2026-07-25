import { Router } from 'express';
import { TransactionsController } from '../controllers/transactions.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createTransactionSchema, transactionParamsSchema, transactionQuerySchema, updateTransactionSchema } from '../validators/transactions.validator';

const router = Router();

// All transaction routes require authentication
router.use(requireAuth);

// List transactions
router.get('/', validate(transactionQuerySchema, 'query'), TransactionsController.listTransactions);

// Create transaction (SALE, PAYMENT, ADJUSTMENT)
router.post('/', validate(createTransactionSchema), TransactionsController.createTransaction);

// Get transaction by ID
router.get('/:id', validate(transactionParamsSchema, 'params'), TransactionsController.getTransaction);

// Update transaction
router.put('/:id', validate(transactionParamsSchema, 'params'), validate(updateTransactionSchema), TransactionsController.updateTransaction);

// Delete transaction
router.delete('/:id', validate(transactionParamsSchema, 'params'), TransactionsController.deleteTransaction);

export default router;
