import { Router } from 'express';
import { TransactionsController } from '../controllers/transactions.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createTransactionSchema, transactionQuerySchema, updateTransactionSchema } from '../validators/transactions.validator';

const router = Router();

// All transaction routes require authentication
router.use(requireAuth);

// List transactions
router.get('/', validate(transactionQuerySchema, 'query'), TransactionsController.listTransactions);

// Create transaction (SALE, PAYMENT, ADJUSTMENT)
router.post('/', validate(createTransactionSchema), TransactionsController.createTransaction);

// Get transaction by ID
router.get('/:id', TransactionsController.getTransaction);

// Update transaction
router.put('/:id', validate(updateTransactionSchema), TransactionsController.updateTransaction);

// Delete transaction
router.delete('/:id', TransactionsController.deleteTransaction);

export default router;
