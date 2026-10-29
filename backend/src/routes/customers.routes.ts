import { Router } from 'express';
import { CustomersController } from '../controllers/customers.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { requireRole } from '../middleware/role.middleware';
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema, customerSuggestionsQuerySchema, customerBranchTransferPreviewSchema, customerBranchTransferSchema } from '../validators/customers.validator';

const router = Router();

// All customer routes require authentication
router.use(requireAuth);

// List customers
router.get('/', validate(customerQuerySchema, 'query'), CustomersController.listCustomers);

// Search customers (alias for list with search param, or separate endpoint if desired)
router.get('/search', validate(customerQuerySchema, 'query'), CustomersController.listCustomers);
router.get('/search-suggestions', validate(customerSuggestionsQuerySchema, 'query'), CustomersController.searchSuggestions);

// Create customer
router.post('/', validate(createCustomerSchema), CustomersController.createCustomer);

// Get customer by ID
router.get('/:id', CustomersController.getCustomer);

// Move a customer and their whole history to another branch (admin, account password)
router.get('/:id/branch-transfer/preview', requireRole(['ADMIN']), validate(customerBranchTransferPreviewSchema, 'query'), CustomersController.previewBranchTransfer);
router.post('/:id/branch-transfer', requireRole(['ADMIN']), validate(customerBranchTransferSchema), CustomersController.transferBranch);

// Update customer
router.put('/:id', validate(updateCustomerSchema), CustomersController.updateCustomer);

// Soft-delete customer
router.delete('/:id', CustomersController.deleteCustomer);

export default router;
