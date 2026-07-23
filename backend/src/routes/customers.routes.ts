import { Router } from 'express';
import { CustomersController } from '../controllers/customers.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from '../validators/customers.validator';

const router = Router();

// All customer routes require authentication
router.use(requireAuth);

// List customers
router.get('/', validate(customerQuerySchema, 'query'), CustomersController.listCustomers);

// Search customers (alias for list with search param, or separate endpoint if desired)
router.get('/search', validate(customerQuerySchema, 'query'), CustomersController.listCustomers);

// Create customer
router.post('/', validate(createCustomerSchema), CustomersController.createCustomer);

// Get customer by ID
router.get('/:id', CustomersController.getCustomer);

// Get customer transactions
router.get('/:id/transactions', CustomersController.getCustomerTransactions);

// Get customer balance
router.get('/:id/balance', CustomersController.getCustomerBalance);

// Update customer
router.put('/:id', validate(updateCustomerSchema), CustomersController.updateCustomer);

// Soft-delete customer
router.delete('/:id', CustomersController.deleteCustomer);

export default router;
