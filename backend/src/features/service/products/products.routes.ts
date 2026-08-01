import express, { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_MIME_TYPES } from './product-image';
import { requireServiceAdmin } from '../authorization/service-policy';
import { ProductsController } from './products.controller';
import {
  createProductSchema, productActionSchema, productAuditQuerySchema,
  productDuplicateQuerySchema, productListQuerySchema, productParamsSchema,
  productServiceJobsQuerySchema, updateProductSchema,
  updateProductPricingSchema, productPricingPreviewQuerySchema,
  productLabelQuerySchema, updateProductSkuSchema, updateProductStockSchema,
} from './products.validator';

export const productsRoutes = Router();

productsRoutes.get('/', validate(productListQuerySchema, 'query'), ProductsController.list);
productsRoutes.post('/', validate(createProductSchema), ProductsController.create);
productsRoutes.get('/check-duplicate', validate(productDuplicateQuerySchema, 'query'), ProductsController.checkDuplicate);
productsRoutes.get('/:productId/label', validate(productParamsSchema, 'params'), validate(productLabelQuerySchema, 'query'), ProductsController.label);

// Raw binary upload: the file is PUT as-is with an image Content-Type, so no
// multipart parser or base64 inflation is involved.
const productImageBody = express.raw({
  type: [...PRODUCT_IMAGE_MIME_TYPES],
  limit: MAX_PRODUCT_IMAGE_BYTES,
});
productsRoutes.get('/:productId/image', validate(productParamsSchema, 'params'), ProductsController.image);
productsRoutes.put('/:productId/image', validate(productParamsSchema, 'params'), productImageBody, ProductsController.uploadImage);
productsRoutes.delete('/:productId/image', validate(productParamsSchema, 'params'), ProductsController.removeImage);
productsRoutes.get('/:productId/audit', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productAuditQuerySchema, 'query'), ProductsController.audit);
productsRoutes.get('/:productId/service-jobs', validate(productParamsSchema, 'params'), validate(productServiceJobsQuerySchema, 'query'), ProductsController.serviceJobs);
productsRoutes.get('/:productId/pricing-preview', validate(productParamsSchema, 'params'), validate(productPricingPreviewQuerySchema, 'query'), ProductsController.pricingPreview);
productsRoutes.patch('/:productId/pricing', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(updateProductPricingSchema), ProductsController.updatePricing);
productsRoutes.patch('/:productId/sku', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(updateProductSkuSchema), ProductsController.updateSku);
productsRoutes.post('/:productId/regenerate-sku', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productActionSchema), ProductsController.regenerateSku);
productsRoutes.patch('/:productId/stock', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(updateProductStockSchema), ProductsController.updateStock);
productsRoutes.post('/:productId/archive', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productActionSchema), ProductsController.archive);
productsRoutes.post('/:productId/restore', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productActionSchema), ProductsController.restore);
productsRoutes.patch('/:productId', validate(productParamsSchema, 'params'), validate(updateProductSchema), ProductsController.update);
productsRoutes.get('/:productId', validate(productParamsSchema, 'params'), ProductsController.get);
