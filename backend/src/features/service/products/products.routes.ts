import express, { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_MIME_TYPES } from './product-image';
import { requireServiceAdmin } from '../authorization/service-policy';
import { ProductsController } from './products.controller';
import {
  createProductSchema, productActionSchema, productAuditQuerySchema,
  productDuplicateQuerySchema, productListQuerySchema, productParamsSchema, productScanQuerySchema,
  productServiceJobsQuerySchema, updateProductSchema,
  updateProductPricingSchema, productPricingPreviewQuerySchema,
  productLabelQuerySchema, productLabelsQuerySchema, updateProductSkuSchema, updateProductStockSchema,
  productLabelOverrideSchema, productLabelsOverrideSchema,
  regenerateProductSkuSchema,
  normalizeProductBrandsSchema,
  updateProductFeaturesSchema,
  productPricingCardQuerySchema, productPricingCardsQuerySchema,
  productPricingCardOverrideSchema,
} from './products.validator';
import { requireAccountPassword } from '../../../middleware/admin-password.middleware';
import { printSnapshotListQuerySchema, recordPrintSnapshotSchema } from '../../pricing-card/print-snapshot/print-snapshot.validator';
import { InventoryController } from '../../inventory/inventory.controller';
import { inventoryProductParamsSchema, stockMovementSchema, verifyOpeningCountSchema } from '../../inventory/inventory.validator';

export const productsRoutes = Router();

productsRoutes.get('/', validate(productListQuerySchema, 'query'), ProductsController.list);
productsRoutes.post('/', validate(createProductSchema), ProductsController.create);
productsRoutes.get('/check-duplicate', validate(productDuplicateQuerySchema, 'query'), ProductsController.checkDuplicate);
productsRoutes.post('/brands/normalize', requireServiceAdmin, validate(normalizeProductBrandsSchema), ProductsController.normalizeBrands);
// Must stay above `GET /:productId`, or "brands" is parsed as a product id.
productsRoutes.get('/brands', ProductsController.brands);
// Must stay above `GET /:productId`, or "labels" is parsed as a product id.
productsRoutes.get('/labels', validate(productLabelsQuerySchema, 'query'), ProductsController.labels);
productsRoutes.get('/pricing-cards', validate(productPricingCardsQuerySchema, 'query'), ProductsController.pricingCards);
productsRoutes.post('/pricing-cards/print-snapshot', requireServiceAdmin, validate(recordPrintSnapshotSchema), ProductsController.recordPricingCardPrint);
productsRoutes.post('/labels/secret-preview', requireServiceAdmin, validate(productLabelsOverrideSchema), ProductsController.labelsSecretPreview);
// Same ordering rule as `/labels`. Any authenticated user may scan: it is a
// read of the same catalogue the Products page already shows, minus pricing.
productsRoutes.get('/scan', validate(productScanQuerySchema, 'query'), ProductsController.scan);
productsRoutes.get('/:productId/label', validate(productParamsSchema, 'params'), validate(productLabelQuerySchema, 'query'), ProductsController.label);
productsRoutes.get('/:productId/pricing-card', validate(productParamsSchema, 'params'), validate(productPricingCardQuerySchema, 'query'), ProductsController.pricingCard);
productsRoutes.post('/:productId/pricing-card/secret-preview', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productPricingCardOverrideSchema), ProductsController.pricingCardSecretPreview);
productsRoutes.get('/:productId/pricing-cards/prints', validate(productParamsSchema, 'params'), validate(printSnapshotListQuerySchema, 'query'), ProductsController.pricingCardPrints);
productsRoutes.post('/:productId/label/secret-preview', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productLabelOverrideSchema), ProductsController.labelSecretPreview);

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
productsRoutes.get('/:productId/inventory', validate(inventoryProductParamsSchema, 'params'), InventoryController.productInventory);
productsRoutes.post('/:productId/opening-count', requireServiceAdmin, validate(inventoryProductParamsSchema, 'params'), validate(verifyOpeningCountSchema), InventoryController.verifyOpeningCount);
productsRoutes.post('/:productId/stock-movements', validate(inventoryProductParamsSchema, 'params'), validate(stockMovementSchema), InventoryController.createMovement);
productsRoutes.get('/:productId/pricing-preview', validate(productParamsSchema, 'params'), validate(productPricingPreviewQuerySchema, 'query'), ProductsController.pricingPreview);
productsRoutes.patch('/:productId/pricing', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(updateProductPricingSchema), ProductsController.updatePricing);
productsRoutes.patch('/:productId/sku', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(updateProductSkuSchema), ProductsController.updateSku);
productsRoutes.post('/:productId/regenerate-sku', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(regenerateProductSkuSchema), ProductsController.regenerateSku);
productsRoutes.patch('/:productId/stock', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(updateProductStockSchema), ProductsController.updateStock);
productsRoutes.patch('/:productId/features', requireServiceAdmin, requireAccountPassword, validate(productParamsSchema, 'params'), validate(updateProductFeaturesSchema), ProductsController.updateFeatures);
productsRoutes.post('/:productId/archive', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productActionSchema), ProductsController.archive);
productsRoutes.post('/:productId/restore', requireServiceAdmin, validate(productParamsSchema, 'params'), validate(productActionSchema), ProductsController.restore);
productsRoutes.patch('/:productId', validate(productParamsSchema, 'params'), validate(updateProductSchema), ProductsController.update);
productsRoutes.get('/:productId', validate(productParamsSchema, 'params'), ProductsController.get);
