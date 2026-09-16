import {
  Currency,
  PricingPreset,
  Prisma,
  Product,
  ServiceAuditAction,
  ServiceAuditRecordType,
  Role,
} from '@prisma/client';
import { compareMoney, moneyToApiString, parseMoney, subtractMoney } from '../../financial/domain/money';
import { businessDateToPrisma, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { CategoriesService } from '../../categories/categories.service';
import { categoryPath, type CategoryWithParent } from '../../categories/category-hierarchy';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import { writeServiceAudit } from '../audit/service-audit';
import { PRODUCT_AUDIT_REASONS, productUpdateReason } from '../audit/audit-reasons';
import { ServiceAuditRepository } from '../audit/service-audit.repository';
import { ServiceConflictError } from '../domain/service-errors';
import { RequestContext, ServiceMutationUser } from '../domain/service-types';
import {
  assertServiceAdmin,
  containsSensitiveProductFields,
} from '../authorization/service-policy';
import {
  CreateProductInput,
  ProductActionInput,
  ProductAuditQueryInput,
  ProductDuplicateQueryInput,
  ProductListQueryInput,
  ProductScanQueryInput,
  ProductServiceJobsQueryInput,
  UpdateProductPricingInput,
  ProductPricingPreviewQueryInput,
  ProductLabelQueryInput,
  ProductLabelsQueryInput,
  NormalizeProductBrandsInput,
  UpdateProductSkuInput,
  UpdateProductStockInput,
  UpdateProductInput,
} from './products.validator';
import { ProductsRepository } from './products.repository';
import { normalizeScanCode } from '../../../lib/scan-code';
import { serializeServiceJob } from '../service-jobs/service-jobs.service';
import { resolveProductPricing, usesAutomaticPricing } from '../../pricing/calculator/pricing-resolution';
import { parsePricingPercent, percentToApiString } from '../../pricing/domain/pricing-percent';
import { formatStaffLabelCode } from '../../pricing/domain/internal-price-code';
import { generateProductSku } from './product-sku';
import { deriveProductStockStatus, isProductOutsideInventory } from './product-stock';
import { presentVatPrice } from '../../tax/domain/vat';

export interface ProductScanPayload {
  id: string;
  name: string;
  model: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  isActive: boolean;
}

export interface ProductScanResult {
  status: 'FOUND' | 'NOT_FOUND' | 'INVALID_CODE';
  /** The usable code, or null when the scan could not be normalized at all. */
  normalizedCode: string | null;
  matchedBy: 'BARCODE' | 'SKU' | null;
  /** Present only when the code also matched a *different* product's SKU. */
  alsoMatchedSku?: boolean;
  product: ProductScanPayload | null;
}

export interface ProductBrandSummary {
  canonical: string;
  productCount: number;
  spellings: string[];
  spellingCounts: Array<{ spelling: string; productCount: number }>;
}

interface ProductBrandSpellingCount {
  brand: string | null;
  _count: { _all: number };
}

const collapseBrandWhitespace = (value: string) => value.trim().replace(/\s+/gu, ' ');
const compareBrandNames = (left: string, right: string) =>
  left.localeCompare(right, 'en', { sensitivity: 'variant' });
const isTitleCaseBrand = (value: string) => value.split(' ').every((word) => {
  if (!word) return true;
  const firstLetter = [...word].find((character) => /\p{L}/u.test(character));
  if (!firstLetter) return true;
  const firstIndex = word.indexOf(firstLetter);
  const rest = word.slice(firstIndex + firstLetter.length);
  return firstLetter === firstLetter.toLocaleUpperCase() && rest === rest.toLocaleLowerCase();
});

/**
 * Combines already-aggregated database rows. Matching is deliberately limited
 * to exact text after whitespace collapse and case folding: prefixes are never
 * treated as the same brand.
 */
export function summarizeProductBrands(rows: readonly ProductBrandSpellingCount[]): ProductBrandSummary[] {
  const groups = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!row.brand || row._count._all <= 0) continue;
    const spelling = collapseBrandWhitespace(row.brand);
    if (!spelling) continue;
    const key = spelling.toLowerCase();
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(spelling, (spellings.get(spelling) ?? 0) + row._count._all);
    groups.set(key, spellings);
  }

  return [...groups.values()].map((counts) => {
    const entries = [...counts.entries()];
    const highestCount = Math.max(...entries.map(([, count]) => count));
    const tied = entries.filter(([, count]) => count === highestCount).map(([spelling]) => spelling);
    const titleCase = tied.filter(isTitleCaseBrand);
    const canonical = [...(titleCase.length ? titleCase : tied)].sort(compareBrandNames)[0];
    const orderedEntries = entries
      .sort(([left, leftCount], [right, rightCount]) => {
        if (left === right) return 0;
        if (left === canonical) return -1;
        if (right === canonical) return 1;
        return rightCount - leftCount || compareBrandNames(left, right);
      });

    return {
      canonical,
      productCount: entries.reduce((total, [, count]) => total + count, 0),
      spellings: orderedEntries.map(([spelling]) => spelling),
      spellingCounts: orderedEntries.map(([spelling, productCount]) => ({ spelling, productCount })),
    };
  }).sort((left, right) => right.productCount - left.productCount || compareBrandNames(left.canonical, right.canonical));
}

export type ProductDuplicateReason =
  | 'BARCODE_TAKEN'
  | 'SKU_TAKEN'
  | 'SAME_NAME_MODEL'
  | 'SAME_MODEL_BRAND';

export interface ProductDuplicateMatch {
  id: string;
  name: string;
  model: string;
  brand: string | null;
  sku: string;
  barcode: string | null;
  isActive: boolean;
  reason: ProductDuplicateReason;
}

type ProductDuplicateCandidate = Pick<Product,
  'id' | 'name' | 'model' | 'brand' | 'sku' | 'barcode' | 'isActive' | 'updatedAt'
>;

const duplicateReasonPriority: Record<ProductDuplicateReason, number> = {
  BARCODE_TAKEN: 0,
  SKU_TAKEN: 1,
  SAME_NAME_MODEL: 2,
  SAME_MODEL_BRAND: 3,
};

export const MAX_BRAND_NORMALIZE_PRODUCTS = 500;

export class ProductsService {
  static async brands() {
    return { brands: summarizeProductBrands(await ProductsRepository.groupBrandSpellings()) };
  }

  static async normalizeBrands(
    input: NormalizeProductBrandsInput,
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    assertServiceAdmin(user);

    if (input.dryRun) {
      const products = (await ProductsRepository.findForBrandNormalization(input.sourceBrands, input.targetBrand))
        .map(toBrandNormalizeProduct);
      const targetExists = input.sourceBrands.includes(input.targetBrand)
        || Boolean(await ProductsRepository.findExactBrandUsage(input.targetBrand));
      return {
        targetBrand: input.targetBrand,
        affectedCount: products.length,
        products,
        warnings: targetExists
          ? []
          : [`${input.targetBrand} is not currently used and will create a new brand spelling / هذه التهجئة غير مستخدمة حاليًا وستُنشئ تهجئة جديدة`],
      };
    }

    return runFinancialTransaction(async (tx) => {
      const products = await ProductsRepository.findForBrandNormalization(input.sourceBrands, input.targetBrand, tx);
      if (products.length > MAX_BRAND_NORMALIZE_PRODUCTS) {
        throw new ValidationError(`Brand cleanup cannot update more than ${MAX_BRAND_NORMALIZE_PRODUCTS} products at once`);
      }
      if (products.length === 0) return { targetBrand: input.targetBrand, updatedCount: 0, products: [] };

      const actor = await loadActor(user.userId, tx);
      const updated: Array<{ id: string; sku: string; name: string; brand: string | null }> = [];
      for (const product of products) {
        const beforeBrand = product.brand;
        const result = await ProductsRepository.updateBrand(product.id, input.targetBrand, user.userId, tx);
        await writeServiceAudit({
          recordType: ServiceAuditRecordType.PRODUCT,
          recordId: product.id,
          action: ServiceAuditAction.UPDATE_DETAILS,
          changedById: user.userId,
          changedByName: actor.fullName,
          changedByUsername: actor.username,
          reason: input.reason,
          beforeValues: { brand: beforeBrand },
          afterValues: { brand: input.targetBrand },
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        }, tx);
        updated.push(toBrandNormalizeProduct(result));
      }
      return { targetBrand: input.targetBrand, updatedCount: updated.length, products: updated };
    });
  }

  static async create(input: CreateProductInput, user: ServiceMutationUser, context: RequestContext) {
    const includesPricing = hasProductPricingInput(input);
    if (includesPricing) assertServiceAdmin(user);
    const includesStockSettings = input.trackStock !== undefined || input.lowStockThreshold !== undefined;
    if (includesStockSettings) assertServiceAdmin(user);
    try {
      return await runFinancialTransaction(async (tx) => {
        if (input.barcode && (await ProductsRepository.findByBarcode(input.barcode, tx, { caseInsensitive: true }))) {
          throw barcodeConflict();
        }
        if (input.categoryId) await CategoriesService.assertAssignable(input.categoryId, tx);
        if (input.pricingPresetId) {
          const preset = await ProductsRepository.findPricingPreset(input.pricingPresetId, tx);
          assertActivePricingPreset(preset);
        }
        const product = await ProductsRepository.create(
          {
            sku: await generateProductSku(tx),
            name: input.name,
            model: input.model,
            barcode: input.barcode ?? null,
            brand: input.brand ?? null,
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            price: moneyOrNull(input.price, input.priceCurrency),
            discount: moneyOrNull(input.discount, input.priceCurrency),
            imageUrl: input.imageUrl ?? null,
            notes: input.notes ?? null,
            trackStock: input.trackStock ?? false,
            lowStockThreshold: input.lowStockThreshold ?? null,
            labelBarcodeSource: input.labelBarcodeSource,
            specifications: input.specifications == null ? Prisma.JsonNull : specificationsJson(input.specifications),
            specificationNotes: input.specificationNotes ?? null,
            createdById: user.userId,
            ...pricingCreateData(input),
          },
          tx
        );
        const actor = await loadActor(user.userId, tx);
        await writeServiceAudit({
          recordType: ServiceAuditRecordType.PRODUCT,
          recordId: product.id,
          action: ServiceAuditAction.CREATE,
          changedById: user.userId,
          changedByName: actor.fullName,
          changedByUsername: actor.username,
          reason: 'Product created',
          beforeValues: {},
          afterValues: productSnapshot(product),
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        }, tx);
        return serializeProduct(product, await ProductsRepository.findActiveDefaultPricingPreset(tx), user.role === Role.ADMIN, await defaultTaxProfile(tx));
      });
    } catch (error) {
      throw mapProductError(error);
    }
  }

  static async list(query: ProductListQueryInput, viewer?: { role: string }) {
    const result = await ProductsRepository.list({
      search: query.search,
      isActive: query.isActive,
      brand: query.brand,
      ...(query.categoryId === undefined ? {} : { categoryIds: query.categoryId === 'uncategorized' ? null : await CategoriesService.filterIds(query.categoryId) }),
      hasBarcode: query.hasBarcode,
      trackStock: query.trackStock,
      stockStatus: query.stockStatus,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const [defaultPreset, defaultTax] = await Promise.all([ProductsRepository.findActiveDefaultPricingPreset(), defaultTaxProfile()]);
    const normalizedSearch = query.search?.trim().toUpperCase();
    return {
      ...result,
      items: result.items.map((item) => ({
        ...serializeProduct(item, defaultPreset, viewer?.role === Role.ADMIN, defaultTax),
        exactMatch: Boolean(normalizedSearch && (item.sku.toUpperCase() === normalizedSearch || item.barcode?.toUpperCase() === normalizedSearch)),
        // List-only: the drawer reads the authoritative onboarding status from
        // the inventory endpoint, which also distinguishes PENDING_ONBOARDING.
        notInInventory: isProductOutsideInventory({
          trackStock: item.trackStock,
          stockQuantity: item.stockQuantity,
          movementCount: item._count.stockMovements,
        }),
      })).sort((a, b) => Number(b.exactMatch) - Number(a.exactMatch)),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  static async get(id: string, viewer?: { role: string }) {
    const product = await ProductsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    const [defaultPreset, defaultTax] = await Promise.all([ProductsRepository.findActiveDefaultPricingPreset(), defaultTaxProfile()]);
    return serializeProduct(product, defaultPreset, viewer?.role === Role.ADMIN, defaultTax);
  }

  /**
   * Exact-match lookup for a scanned code, used by the PC scanner today and by
   * the phone scanner over the LAN listener later.
   *
   * Exact-only by design: a fuzzy scan could select the wrong product at the
   * counter. Typed searching stays on `list`, which already runs trigram search
   * and hoists exact matches.
   *
   * Both printed label sources are covered by barcode + SKU alone — the printed
   * value is derived from exactly those two fields in `toLabelPayload` — so no
   * third code column is consulted.
   *
   * The result is built by `serializeScanResult`, never `serializeProduct`:
   * this payload is reachable from a phone that has no user session, so it must
   * not be able to grow pricing, cost, or stock fields by inheritance.
   */
  static async scanLookup(query: ProductScanQueryInput): Promise<ProductScanResult> {
    const normalized = normalizeScanCode(query.code);
    if (!normalized.ok) {
      return { status: 'INVALID_CODE', normalizedCode: null, matchedBy: null, product: null };
    }

    const code = normalized.code;
    const matches = await ProductsRepository.findByScanCode(code);
    const matchedOnBarcode = matches.find((product) => product.barcode?.toLowerCase() === code.toLowerCase());
    const matchedOnSku = matches.find((product) => product.sku.toLowerCase() === code.toLowerCase());
    const product = matchedOnBarcode ?? matchedOnSku ?? null;

    if (!product) {
      return { status: 'NOT_FOUND', normalizedCode: code, matchedBy: null, product: null };
    }

    // A code can be one product's barcode and a different product's SKU. Barcode
    // wins so the counter gets a deterministic result, and the flag lets the UI
    // say so rather than quietly hiding the second product.
    const crossMatched = Boolean(matchedOnBarcode && matchedOnSku && matchedOnSku.id !== matchedOnBarcode.id);

    return {
      status: 'FOUND',
      normalizedCode: code,
      matchedBy: matchedOnBarcode ? 'BARCODE' : 'SKU',
      ...(crossMatched ? { alsoMatchedSku: true } : {}),
      product: serializeScanResult(product),
    };
  }

  static async getPricingPreview(id: string, query: ProductPricingPreviewQueryInput, viewer?: { role: string }) {
    const product = await ProductsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    const preview = addVatPresentation(
      resolveProductPricing(product, await ProductsRepository.findActiveDefaultPricingPreset(), query.installmentMonths),
      product,
      await defaultTaxProfile()
    );
    if (preview.pricingAvailable && viewer?.role !== Role.ADMIN) {
      const inputs = Object.fromEntries(Object.entries(preview.inputs).filter(([key]) => key !== 'costPrice'));
      return { ...preview, inputs };
    }
    return preview;
  }

  static async updatePricing(id: string, input: UpdateProductPricingInput, user: ServiceMutationUser, context: RequestContext) {
    assertServiceAdmin(user);
    const fields = Object.keys(input).filter((field) => !['reason', 'accountPassword'].includes(field));
    return runFinancialTransaction(async (tx) => {
      const existing = await ProductsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Product not found');
      await verifyAdminPassword(user.userId, input.accountPassword, { action: 'UPDATE_PRODUCT_PRICING', recordType: 'PRODUCT', recordId: id, ipAddress: context.ipAddress, domainLabel: 'product pricing changes' }, tx);
      if (input.pricingPresetId) {
        const preset = await ProductsRepository.findPricingPreset(input.pricingPresetId, tx);
        assertActivePricingPreset(preset);
      }
      const data = pricingUpdateData(input, user.userId, input.priceCurrency ?? existing.priceCurrency);
      assertCompleteCustomPricing({ ...existing, ...data });
      const updated = await ProductsRepository.update(id, data, tx);
      const actor = await loadActor(user.userId, tx);
      await writeServiceAudit({ recordType: ServiceAuditRecordType.PRODUCT, recordId: id, action: ServiceAuditAction.CHANGE_PRICE,
        changedById: user.userId, changedByName: actor.fullName, changedByUsername: actor.username, reason: input.reason,
        beforeValues: changedSnapshot(existing, fields), afterValues: changedSnapshot(updated, fields), requestId: context.requestId, ipAddress: context.ipAddress,
      }, tx);
      return serializeProduct(updated, await ProductsRepository.findActiveDefaultPricingPreset(tx), true, await defaultTaxProfile(tx));
    });
  }

  static async update(
    id: string,
    input: UpdateProductInput,
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    const fields = Object.keys(input);
    if (fields.length === 0) throw new ValidationError('At least one product field is required');
    // The field policy still decides WHO may edit what — it just no longer decides
    // whether a password is demanded. Cosmetic fields stay open to any authenticated
    // user exactly as before; everything else stays ADMIN-only.
    if (containsSensitiveProductFields(fields)) assertServiceAdmin(user);

    try {
      return await runFinancialTransaction(async (tx) => {
        const existing = await ProductsRepository.findById(id, tx);
        if (!existing) throw new NotFoundError('Product not found');
        if (input.barcode && input.barcode !== existing.barcode) {
          const duplicate = await ProductsRepository.findByBarcode(input.barcode, tx, {
            caseInsensitive: true,
            excludeProductId: id,
          });
          if (duplicate) throw barcodeConflict();
        }
        const data = productUpdateData(input, user.userId, existing.priceCurrency);
        if (input.categoryId && input.categoryId !== existing.categoryId) await CategoriesService.assertAssignable(input.categoryId, tx);
        assertValidLabelBarcodeSource({
          barcode: input.barcode === undefined ? existing.barcode : input.barcode,
          labelBarcodeSource: input.labelBarcodeSource === undefined ? existing.labelBarcodeSource : input.labelBarcodeSource,
        });
        assertDiscountWithinPrice(
          input.price === undefined ? existing.price : input.price,
          input.discount === undefined ? existing.discount : input.discount
        );
        // A product carries one image source: pointing at a URL drops uploaded bytes.
        if (input.imageUrl) await ProductsRepository.deleteImage(id, tx);
        const updated = await ProductsRepository.update(id, data, tx);
        const actor = await loadActor(user.userId, tx);
        await writeServiceAudit({
          recordType: ServiceAuditRecordType.PRODUCT,
          recordId: id,
          action: fields.every((field) => ['specifications', 'specificationNotes'].includes(field))
            ? ServiceAuditAction.CHANGE_SPECIFICATIONS
            : ServiceAuditAction.UPDATE_DETAILS,
          changedById: user.userId,
          changedByName: actor.fullName,
          changedByUsername: actor.username,
          reason: productUpdateReason(fields),
          beforeValues: changedSnapshot(existing, fields),
          afterValues: changedSnapshot(updated, fields),
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        }, tx);
        return serializeProduct(updated, await ProductsRepository.findActiveDefaultPricingPreset(tx), user.role === Role.ADMIN, await defaultTaxProfile(tx));
      });
    } catch (error) {
      throw mapProductError(error);
    }
  }

  static async getImage(id: string) {
    const image = await ProductsRepository.findImageBytes(id);
    if (!image) throw new NotFoundError('Product image not found');
    return image;
  }

  /**
   * Uploading bytes clears any external image URL, and vice versa, so a product
   * always has exactly one image source.
   */
  static async uploadImage(
    id: string,
    file: { data: Buffer; mimeType: string },
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    return runFinancialTransaction(async (tx) => {
      const existing = await ProductsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Product not found');

      await ProductsRepository.upsertImage(
        id,
        { data: file.data, mimeType: file.mimeType, byteSize: file.data.length },
        tx
      );
      const updated = await ProductsRepository.update(id, { imageUrl: null, updatedById: user.userId }, tx);
      const actor = await loadActor(user.userId, tx);
      await writeServiceAudit({
        recordType: ServiceAuditRecordType.PRODUCT,
        recordId: id,
        action: ServiceAuditAction.UPDATE_DETAILS,
        changedById: user.userId,
        changedByName: actor.fullName,
        changedByUsername: actor.username,
        reason: 'Product image uploaded',
        beforeValues: { imageUrl: existing.imageUrl, hasUploadedImage: Boolean(existing.image) },
        afterValues: { imageUrl: null, hasUploadedImage: true, mimeType: file.mimeType, byteSize: file.data.length },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      }, tx);
      return serializeProduct(updated, await ProductsRepository.findActiveDefaultPricingPreset(tx), user.role === Role.ADMIN, await defaultTaxProfile(tx));
    });
  }

  static async removeImage(id: string, user: ServiceMutationUser, context: RequestContext) {
    return runFinancialTransaction(async (tx) => {
      const existing = await ProductsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Product not found');
      if (!existing.imageUrl && !existing.image) throw new NotFoundError('Product image not found');

      await ProductsRepository.deleteImage(id, tx);
      const updated = await ProductsRepository.update(id, { imageUrl: null, updatedById: user.userId }, tx);
      const actor = await loadActor(user.userId, tx);
      await writeServiceAudit({
        recordType: ServiceAuditRecordType.PRODUCT,
        recordId: id,
        action: ServiceAuditAction.UPDATE_DETAILS,
        changedById: user.userId,
        changedByName: actor.fullName,
        changedByUsername: actor.username,
        reason: 'Product image removed',
        beforeValues: { imageUrl: existing.imageUrl, hasUploadedImage: Boolean(existing.image) },
        afterValues: { imageUrl: null, hasUploadedImage: false },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      }, tx);
      return serializeProduct(updated, await ProductsRepository.findActiveDefaultPricingPreset(tx), user.role === Role.ADMIN, await defaultTaxProfile(tx));
    });
  }

  static archive(id: string, input: ProductActionInput, user: ServiceMutationUser, context: RequestContext) {
    return this.setActive(id, false, ServiceAuditAction.ARCHIVE, input, user, context);
  }

  static restore(id: string, input: ProductActionInput, user: ServiceMutationUser, context: RequestContext) {
    return this.setActive(id, true, ServiceAuditAction.RESTORE, input, user, context);
  }

  static async label(id: string, query: ProductLabelQueryInput) {
    const product = await ProductsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    const defaultPreset = labelNeedsPricing(query) ? await ProductsRepository.findActiveDefaultPricingPreset() : null;
    const defaultTax = query.includePrice ? await defaultTaxProfile() : null;
    return toLabelPayload(product, defaultPreset, query, defaultTax);
  }

  /**
   * Bulk label payload for the print sheet. One product query and one preset
   * lookup regardless of selection size, and a missing or archived product
   * degrades to a warning rather than failing the whole print run.
   */
  static async labels(query: ProductLabelsQueryInput) {
    const products = await ProductsRepository.findManyForLabels(query.ids);
    const byId = new Map(products.map((product) => [product.id, product]));
    const defaultPreset = labelNeedsPricing(query) ? await ProductsRepository.findActiveDefaultPricingPreset() : null;
    const defaultTax = query.includePrice ? await defaultTaxProfile() : null;

    const labels: ProductLabelPayload[] = [];
    const warnings: ProductLabelWarning[] = [];

    // Iterate the requested ids, not the query result, so the sheet order matches
    // what the user selected instead of whatever order the database returned.
    for (const id of query.ids) {
      const product = byId.get(id);
      if (!product) { warnings.push({ productId: id, code: 'NOT_FOUND' }); continue; }
      if (!product.isActive && !query.includeArchived) {
        warnings.push({ productId: id, code: 'ARCHIVED_EXCLUDED', name: product.name });
        continue;
      }
      const { payload, warnings: itemWarnings } = toLabelPayload(product, defaultPreset, query, defaultTax);
      labels.push(payload);
      warnings.push(...itemWarnings);
    }

    return { labels, warnings };
  }

  static updateSku(id: string, input: UpdateProductSkuInput, user: ServiceMutationUser, context: RequestContext) {
    return this.changeSku(id, input.sku, ServiceAuditAction.CHANGE_SKU, user, context);
  }

  static regenerateSku(id: string, user: ServiceMutationUser, context: RequestContext) {
    return this.changeSku(id, null, ServiceAuditAction.REGENERATE_SKU, user, context);
  }

  static async updateStock(id: string, input: UpdateProductStockInput, user: ServiceMutationUser, context: RequestContext) {
    assertServiceAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await ProductsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Product not found');
      // Settings only: this cannot write stockQuantity. Real quantity corrections
      // live in the inventory ledger and keep their admin-password guard.
      const updated = await ProductsRepository.update(id, {
        trackStock: input.trackStock,
        lowStockThreshold: input.lowStockThreshold,
        updatedById: user.userId,
      }, tx);
      const actor = await loadActor(user.userId, tx);
      await writeServiceAudit({
        recordType: ServiceAuditRecordType.PRODUCT, recordId: id, action: ServiceAuditAction.CHANGE_STOCK,
        changedById: user.userId, changedByName: actor.fullName, changedByUsername: actor.username,
        reason: PRODUCT_AUDIT_REASONS.stockSettings,
        beforeValues: stockSnapshot(existing), afterValues: stockSnapshot(updated),
        requestId: context.requestId, ipAddress: context.ipAddress,
      }, tx);
      return serializeProduct(updated, await ProductsRepository.findActiveDefaultPricingPreset(tx), true, await defaultTaxProfile(tx));
    });
  }

  static async audit(id: string, query: ProductAuditQueryInput) {
    await this.get(id);
    return ServiceAuditRepository.list(
      ServiceAuditRecordType.PRODUCT,
      id,
      (query.page - 1) * query.pageSize,
      query.pageSize
    );
  }

  static async checkDuplicate(query: ProductDuplicateQueryInput) {
    const [barcodeMatch, skuMatch, related] = await Promise.all([
      query.barcode ? ProductsRepository.findByBarcode(query.barcode, undefined, {
        caseInsensitive: true,
        excludeProductId: query.excludeProductId,
      }) : Promise.resolve(null),
      query.sku ? ProductsRepository.findBySku(query.sku.toUpperCase(), undefined, {
        caseInsensitive: true,
        excludeProductId: query.excludeProductId,
      }) : Promise.resolve(null),
      query.name && query.model ? ProductsRepository.findDuplicates({
        name: query.name,
        model: query.model,
        brand: query.brand,
        excludeProductId: query.excludeProductId,
      }) : Promise.resolve({ sameNameModel: [], sameModelBrand: [] }),
    ]);

    const matches = new Map<string, ProductDuplicateMatch & { updatedAt: Date }>();
    const add = (product: ProductDuplicateCandidate, reason: ProductDuplicateReason) => {
      if (product.id === query.excludeProductId) return;
      const existing = matches.get(product.id);
      if (existing && duplicateReasonPriority[existing.reason] <= duplicateReasonPriority[reason]) return;
      matches.set(product.id, {
        id: product.id,
        name: product.name,
        model: product.model,
        brand: product.brand,
        sku: product.sku,
        barcode: product.barcode,
        isActive: product.isActive,
        reason,
        updatedAt: product.updatedAt,
      });
    };

    if (barcodeMatch) add(barcodeMatch, 'BARCODE_TAKEN');
    if (skuMatch) add(skuMatch, 'SKU_TAKEN');
    related.sameNameModel.forEach((product) => add(product, 'SAME_NAME_MODEL'));
    related.sameModelBrand.forEach((product) => add(product, 'SAME_MODEL_BRAND'));

    return {
      matches: [...matches.values()]
        .sort((left, right) => Number(right.isActive) - Number(left.isActive)
          || right.updatedAt.getTime() - left.updatedAt.getTime()
          || left.id.localeCompare(right.id))
        .slice(0, 5)
        .map(({ updatedAt: _updatedAt, ...match }) => match),
    };
  }

  static async serviceJobs(id: string, query: ProductServiceJobsQueryInput) {
    await this.get(id);
    const result = await ProductsRepository.serviceJobs(
      id,
      (query.page - 1) * query.pageSize,
      query.pageSize
    );
    return {
      items: result.items.map(serializeServiceJob),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private static async setActive(
    id: string,
    isActive: boolean,
    action: ServiceAuditAction,
    input: ProductActionInput,
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    assertServiceAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await ProductsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Product not found');
      if (existing.isActive === isActive) throw new ValidationError(`Product is already ${isActive ? 'active' : 'archived'}`);
      await verifyAdminPassword(user.userId, input.accountPassword, {
        action: action === ServiceAuditAction.ARCHIVE ? 'ARCHIVE_PRODUCT' : 'RESTORE_PRODUCT',
        recordType: 'PRODUCT', recordId: id, ipAddress: context.ipAddress,
        domainLabel: 'service and product changes',
      }, tx);
      const updated = await ProductsRepository.update(id, { isActive, updatedById: user.userId }, tx);
      const actor = await loadActor(user.userId, tx);
      await writeServiceAudit({
        recordType: ServiceAuditRecordType.PRODUCT, recordId: id, action,
        changedById: user.userId, changedByName: actor.fullName,
        changedByUsername: actor.username, reason: input.reason,
        beforeValues: { isActive: existing.isActive }, afterValues: { isActive },
        requestId: context.requestId, ipAddress: context.ipAddress,
      }, tx);
      return serializeProduct(updated, await ProductsRepository.findActiveDefaultPricingPreset(tx), user.role === Role.ADMIN, await defaultTaxProfile(tx));
    });
  }

  private static async changeSku(
    id: string,
    requestedSku: string | null,
    action: ServiceAuditAction,
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    assertServiceAdmin(user);
    try {
      return await runFinancialTransaction(async (tx) => {
        const existing = await ProductsRepository.findById(id, tx);
        if (!existing) throw new NotFoundError('Product not found');
        const sku = requestedSku ?? await generateProductSku(tx);
        if (sku === existing.sku) throw new ValidationError('The new SKU matches the current SKU');
        if (requestedSku && (await ProductsRepository.findBySku(sku, tx, {
          caseInsensitive: true,
          excludeProductId: id,
        }))) throw skuConflict();
        const updated = await ProductsRepository.update(id, { sku, updatedById: user.userId }, tx);
        const actor = await loadActor(user.userId, tx);
        await writeServiceAudit({
          recordType: ServiceAuditRecordType.PRODUCT, recordId: id, action,
          changedById: user.userId, changedByName: actor.fullName, changedByUsername: actor.username,
          reason: action === ServiceAuditAction.REGENERATE_SKU
            ? PRODUCT_AUDIT_REASONS.skuRegenerated
            : PRODUCT_AUDIT_REASONS.sku,
          beforeValues: { sku: existing.sku }, afterValues: { sku },
          requestId: context.requestId, ipAddress: context.ipAddress,
        }, tx);
        return serializeProduct(updated, await ProductsRepository.findActiveDefaultPricingPreset(tx), true, await defaultTaxProfile(tx));
      });
    } catch (error) {
      throw mapProductError(error);
    }
  }
}

function toBrandNormalizeProduct(product: { id: string; sku: string; name: string; brand: string | null }) {
  return { id: product.id, sku: product.sku, name: product.name, brand: product.brand };
}

function stockSnapshot(product: Product): Prisma.InputJsonObject {
  return { trackStock: product.trackStock, stockQuantity: product.stockQuantity, lowStockThreshold: product.lowStockThreshold };
}

function productUpdateData(input: UpdateProductInput, updatedById: string, currency: Currency): Prisma.ProductUncheckedUpdateInput {
  const data: Prisma.ProductUncheckedUpdateInput = { updatedById };
  if (input.name !== undefined) data.name = input.name;
  if (input.model !== undefined) data.model = input.model;
  if (input.barcode !== undefined) data.barcode = input.barcode;
  if (input.brand !== undefined) data.brand = input.brand;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.price !== undefined) data.price = moneyOrNull(input.price, currency);
  if (input.discount !== undefined) data.discount = moneyOrNull(input.discount, currency);
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.labelBarcodeSource !== undefined) data.labelBarcodeSource = input.labelBarcodeSource;
  if (input.specifications !== undefined) data.specifications = specificationsJson(input.specifications);
  if (input.specificationNotes !== undefined) data.specificationNotes = input.specificationNotes;
  return data;
}

export type ProductLabelWarningCode = 'NOT_FOUND' | 'ARCHIVED_EXCLUDED' | 'NO_PRICING' | 'MANUFACTURER_BARCODE_MISSING' | 'FALLBACK_TO_SKU';
export interface ProductLabelWarning { productId: string; code: ProductLabelWarningCode; name?: string }

interface LabelFieldFlags { includePriceCode: boolean; includePrice: boolean }

const labelNeedsPricing = (query: LabelFieldFlags) => query.includePriceCode || query.includePrice;

/**
 * The single source of truth for what may leave the server on a label.
 *
 * Everything commercial — cost, supplier cost, installment price, profit,
 * expenses, and the discount buffer — is absent by construction: this builds an
 * allow-list rather than stripping fields off a product. A label the renderer
 * never receives is a label that cannot leak through the network tab or an
 * exported PDF. `products.routes.test.ts` asserts the exact key set.
 */
function toLabelPayload(product: ProductRecord, defaultPreset: PricingPreset | null, query: LabelFieldFlags, defaultTax: TaxProfileRecord | null) {
  const warnings: ProductLabelWarning[] = [];
  const wantsManufacturer = product.labelBarcodeSource === 'MANUFACTURER' || product.labelBarcodeSource === 'AUTO';
  const usesManufacturer = wantsManufacturer && Boolean(product.barcode);
  // Falling back to the SKU is correct, but silently is not: the sticker would
  // scan as something other than the barcode the product was configured for.
  if (wantsManufacturer && !usesManufacturer) {
    warnings.push({
      productId: product.id,
      code: product.labelBarcodeSource === 'AUTO' ? 'FALLBACK_TO_SKU' : 'MANUFACTURER_BARCODE_MISSING',
      name: product.name,
    });
  }

  const preview = labelNeedsPricing(query)
    ? addVatPresentation(resolveProductPricing(product, defaultPreset), product, defaultTax)
    : null;
  if (preview && !preview.pricingAvailable) warnings.push({ productId: product.id, code: 'NO_PRICING', name: product.name });
  const internalPriceCode = preview?.pricingAvailable ? preview.internalPriceCode : null;

  const payload = {
    id: product.id,
    name: product.name,
    model: product.model,
    brand: product.brand,
    sku: product.sku,
    barcodeValue: usesManufacturer ? product.barcode! : product.sku,
    barcodeSource: usesManufacturer ? 'MANUFACTURER' as const : 'SKU' as const,
    ...(query.includePriceCode ? {
      internalPriceCode,
      staffLabelCode: internalPriceCode ? formatStaffLabelCode(product.sku, internalPriceCode) : null,
    } : {}),
    ...(query.includePrice ? {
      cashPrice: preview?.pricingAvailable && preview.vatPresentationAvailable ? preview.cashPriceIncVat : null,
      cashPriceExVat: preview?.pricingAvailable && preview.vatPresentationAvailable ? preview.cashPriceExVat : null,
      cashPriceIncVat: preview?.pricingAvailable && preview.vatPresentationAvailable ? preview.cashPriceIncVat : null,
      vatAmount: preview?.pricingAvailable && preview.vatPresentationAvailable ? preview.vatAmount : null,
      taxRatePercent: preview?.pricingAvailable && preview.vatPresentationAvailable ? preview.taxRatePercent : null,
      taxCode: preview?.pricingAvailable && preview.vatPresentationAvailable ? preview.taxCode : null,
    } : {}),
  };

  return { payload, warnings };
}

export type ProductLabelPayload = ReturnType<typeof toLabelPayload>['payload'];

function moneyOrNull(value?: string | null, currency: Currency = Currency.USD) {
  return value == null ? null : parseMoney(value, currency);
}

function specificationsJson(entries: Array<{ label: string; value: string }>): Prisma.InputJsonArray {
  return entries.map(({ label, value }) => ({ label, value }));
}

function assertDiscountWithinPrice(price: { toString(): string } | string | null, discount: { toString(): string } | string | null) {
  if (price != null && discount != null && compareMoney(discount, price) > 0) {
    throw new ValidationError('Discount cannot exceed price', { field: 'discount' });
  }
}

type ProductRecord = Product & {
  category?: (CategoryWithParent & { id: string }) | null;
  createdBy?: { fullName: string; username: string };
  updatedBy?: { fullName: string; username: string } | null;
  pricingPreset?: Prisma.PricingPresetGetPayload<Record<string, never>> | null;
  image?: { mimeType: string; byteSize: number; updatedAt: Date } | null;
  taxProfile?: TaxProfileRecord | null;
};

type TaxProfileRecord = Prisma.TaxProfileGetPayload<{ include: { taxRate: true } }>;

async function defaultTaxProfile(tx?: Prisma.TransactionClient): Promise<TaxProfileRecord | null> {
  return ProductsRepository.findActiveDefaultTaxProfile(businessDateToPrisma(todayInBusinessTimezone()), tx);
}

type ResolvedPricing = ReturnType<typeof resolveProductPricing>;
type AvailablePricing = Extract<ResolvedPricing, { pricingAvailable: true }>;
type VatPresentedPricing = Exclude<ResolvedPricing, { pricingAvailable: true }> | (AvailablePricing & (
  | { vatPresentationAvailable: false }
  | { vatPresentationAvailable: true; cashPriceExVat: string; vatAmount: string; cashPriceIncVat: string; taxRatePercent: string; taxCode: string }
));

function addVatPresentation(
  preview: ResolvedPricing,
  product: ProductRecord,
  defaultTax: TaxProfileRecord | null
): VatPresentedPricing {
  if (!preview.pricingAvailable) return preview;
  const profile = product.taxProfileId ? product.taxProfile ?? null : defaultTax;
  if (!profile || !profile.isActive || !profile.taxRate.isActive) {
    return { ...preview, vatPresentationAvailable: false as const };
  }
  const presented = presentVatPrice(preview.cashPrice, profile.taxRate.ratePercent, product.priceCurrency, product.priceIncludesVat);
  return {
    ...preview,
    vatPresentationAvailable: true as const,
    cashPriceExVat: moneyToApiString(presented.priceExVat, product.priceCurrency),
    vatAmount: moneyToApiString(presented.vatAmount, product.priceCurrency),
    cashPriceIncVat: moneyToApiString(presented.priceIncVat, product.priceCurrency),
    taxRatePercent: profile.taxRate.ratePercent.toFixed(3),
    taxCode: profile.code,
  };
}

/**
 * One shape for both image sources so the client can render without branching on
 * storage. Uploaded images expose `updatedAt` as a cache key for the bytes endpoint.
 */
function serializeProductImage(product: ProductRecord) {
  if (product.imageUrl) return { source: 'URL' as const, url: product.imageUrl };
  if (product.image) {
    return {
      source: 'UPLOAD' as const,
      mimeType: product.image.mimeType,
      byteSize: product.image.byteSize,
      updatedAt: product.image.updatedAt.toISOString(),
    };
  }
  return null;
}

/**
 * The only product shape that may leave the building for a scanner.
 *
 * Written as an explicit literal rather than a pick or an omit over
 * `serializeProduct`: a scan result is reachable from a phone on the shop
 * Wi-Fi with no user session, so adding a field to the product serializer must
 * never be able to widen it. Anything commercially sensitive — price, discount,
 * netPrice, the pricing block, costPrice, the internal price code, stock, notes,
 * specifications, image, actor ids — is absent by construction, and
 * `products.scan.test.ts` asserts the key set stays exactly this.
 *
 * `brand` is here because it is useful for telling near-identical models apart
 * and is already printed on the shelf label. `isActive` is here so an archived
 * product reads as archived instead of as missing.
 */
function serializeScanResult(product: Product): ProductScanPayload {
  return {
    id: product.id,
    name: product.name,
    model: product.model,
    sku: product.sku,
    barcode: product.barcode,
    brand: product.brand,
    isActive: product.isActive,
  };
}

function serializeProduct(product: ProductRecord, defaultPreset: Prisma.PricingPresetGetPayload<Record<string, never>> | null = null, isAdmin = false, defaultTax: TaxProfileRecord | null = null) {
  const preview = addVatPresentation(resolveProductPricing(product, defaultPreset), product, defaultTax);
  const mode = usesAutomaticPricing(product) && product.costPrice != null
    ? product.useCustomPricing ? 'CUSTOM' as const : 'PRESET' as const
    : product.price != null ? 'MANUAL' as const : 'NONE' as const;
  const pricing = preview.pricingAvailable ? {
    pricingAvailable: true, mode, source: preview.source, pricingPresetId: product.pricingPresetId,
    presetName: preview.preset?.name ?? null, useCustomPricing: product.useCustomPricing,
    installmentEnabled: product.installmentEnabled,
    cashPrice: preview.cashPrice,
    ...(preview.vatPresentationAvailable ? {
      cashPriceExVat: preview.cashPriceExVat,
      vatAmount: preview.vatAmount,
      cashPriceIncVat: preview.cashPriceIncVat,
      taxRatePercent: preview.taxRatePercent,
      taxCode: preview.taxCode,
    } : {}),
    ...(product.installmentEnabled ? {
      installmentPrice: preview.installment.installmentPrice,
      downPayment: preview.installment.downPayment,
      remaining: preview.installment.remaining,
      monthlyPayment: preview.installment.monthlyPayment,
      lastInstallmentPayment: preview.installment.lastInstallmentPayment,
      installmentMonths: preview.installment.installmentMonths,
    } : {}),
    ...(isAdmin ? { costPrice: preview.inputs.costPrice, configuration: pricingConfiguration(product) } : {}), warnings: preview.warnings,
  } : { ...preview, mode, pricingPresetId: product.pricingPresetId, presetName: product.pricingPreset?.name ?? null, useCustomPricing: product.useCustomPricing, installmentEnabled: product.installmentEnabled, ...(isAdmin ? { costPrice: product.costPrice ? moneyToApiString(product.costPrice, product.priceCurrency) : null, configuration: pricingConfiguration(product) } : {}) };
  return {
    id: product.id,
    name: product.name,
    model: product.model,
    barcode: product.barcode,
    sku: product.sku,
    brand: product.brand,
    price: product.price ? moneyToApiString(product.price, product.priceCurrency) : null,
    discount: product.discount ? moneyToApiString(product.discount, product.priceCurrency) : null,
    netPrice: product.price && product.discount
      ? moneyToApiString(subtractMoney(product.price, product.discount, product.priceCurrency), product.priceCurrency)
      : product.price ? moneyToApiString(product.price, product.priceCurrency) : null,
    priceCurrency: product.priceCurrency,
    taxProfileId: product.taxProfileId,
    priceIncludesVat: product.priceIncludesVat,
    isActive: product.isActive,
    categoryId: product.categoryId ?? null,
    categoryPath: product.category ? categoryPath(product.category) : null,
    notes: product.notes,
    labelBarcodeSource: product.labelBarcodeSource,
    trackStock: product.trackStock,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    stockStatus: deriveProductStockStatus(product),
    specifications: product.specifications ?? [],
    specificationNotes: product.specificationNotes,
    imageUrl: product.imageUrl,
    image: serializeProductImage(product),
    createdById: product.createdById,
    updatedById: product.updatedById,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    pricing,
    ...(product.createdBy ? { createdBy: product.createdBy } : {}),
    ...(product.updatedBy !== undefined ? { updatedBy: product.updatedBy } : {}),
  };
}

function pricingConfiguration(product: Product) {
  return {
    costPrice: product.costPrice ? moneyToApiString(product.costPrice, product.priceCurrency) : null,
    priceCurrency: product.priceCurrency,
    pricingPresetId: product.pricingPresetId, useCustomPricing: product.useCustomPricing,
    installmentEnabled: product.installmentEnabled,
    customExpensePercent: product.customExpensePercent ? percentToApiString(product.customExpensePercent) : null,
    customProfitPercent: product.customProfitPercent ? percentToApiString(product.customProfitPercent) : null,
    customDiscountBufferPercent: product.customDiscountBufferPercent ? percentToApiString(product.customDiscountBufferPercent) : null,
    customInstallmentMarkupPercent: product.customInstallmentMarkupPercent ? percentToApiString(product.customInstallmentMarkupPercent) : null,
    customDownPaymentPercent: product.customDownPaymentPercent ? percentToApiString(product.customDownPaymentPercent) : null,
    customInstallmentMonths: product.customInstallmentMonths, customCalculationMode: product.customCalculationMode,
    taxProfileId: product.taxProfileId,
    priceIncludesVat: product.priceIncludesVat,
  };
}

function productSnapshot(product: Product): Prisma.InputJsonObject {
  return {
    sku: product.sku, name: product.name, model: product.model, barcode: product.barcode,
    brand: product.brand, price: product.price ? moneyToApiString(product.price, product.priceCurrency) : null,
    categoryId: product.categoryId ?? null,
    discount: product.discount ? moneyToApiString(product.discount, product.priceCurrency) : null,
    priceCurrency: product.priceCurrency,
    isActive: product.isActive, notes: product.notes, imageUrl: product.imageUrl,
    labelBarcodeSource: product.labelBarcodeSource, trackStock: product.trackStock,
    stockQuantity: product.stockQuantity, lowStockThreshold: product.lowStockThreshold,
    specifications: (product.specifications ?? []) as Prisma.InputJsonValue,
    specificationNotes: product.specificationNotes,
    costPrice: product.costPrice ? moneyToApiString(product.costPrice, product.priceCurrency) : null,
    pricingPresetId: product.pricingPresetId, useCustomPricing: product.useCustomPricing,
    installmentEnabled: product.installmentEnabled,
    customExpensePercent: product.customExpensePercent ? percentToApiString(product.customExpensePercent) : null,
    customProfitPercent: product.customProfitPercent ? percentToApiString(product.customProfitPercent) : null,
    customDiscountBufferPercent: product.customDiscountBufferPercent ? percentToApiString(product.customDiscountBufferPercent) : null,
    customInstallmentMarkupPercent: product.customInstallmentMarkupPercent ? percentToApiString(product.customInstallmentMarkupPercent) : null,
    customDownPaymentPercent: product.customDownPaymentPercent ? percentToApiString(product.customDownPaymentPercent) : null,
    customInstallmentMonths: product.customInstallmentMonths, customCalculationMode: product.customCalculationMode,
    taxProfileId: product.taxProfileId, priceIncludesVat: product.priceIncludesVat,
  };
}

function pricingUpdateData(input: UpdateProductPricingInput, updatedById: string, currency: Currency): Prisma.ProductUncheckedUpdateInput {
  const data: Prisma.ProductUncheckedUpdateInput = { updatedById };
  if (input.costPrice !== undefined) data.costPrice = input.costPrice == null ? null : parseMoney(input.costPrice, currency);
  if (input.priceCurrency !== undefined) data.priceCurrency = input.priceCurrency;
  if (input.pricingPresetId !== undefined) data.pricingPresetId = input.pricingPresetId;
  if (input.useCustomPricing !== undefined) data.useCustomPricing = input.useCustomPricing;
  if (input.installmentEnabled !== undefined) data.installmentEnabled = input.installmentEnabled;
  if (input.installmentEnabled === false) {
    data.customInstallmentMarkupPercent = null;
    data.customDownPaymentPercent = null;
    data.customInstallmentMonths = null;
  }
  for (const field of ['customExpensePercent','customProfitPercent','customDiscountBufferPercent','customInstallmentMarkupPercent','customDownPaymentPercent'] as const) if (input[field] !== undefined) data[field] = input[field] == null ? null : parsePricingPercent(input[field]!);
  if (input.customInstallmentMonths !== undefined) data.customInstallmentMonths = input.customInstallmentMonths;
  if (input.customCalculationMode !== undefined) data.customCalculationMode = input.customCalculationMode;
  if (input.taxProfileId !== undefined) data.taxProfileId = input.taxProfileId;
  if (input.priceIncludesVat !== undefined) data.priceIncludesVat = input.priceIncludesVat;
  return data;
}

function hasProductPricingInput(input: CreateProductInput): boolean {
  return PRICING_VALUE_FIELDS.some((field) => input[field] != null)
    || input.useCustomPricing === true
    || input.installmentEnabled === true;
}

const PRICING_VALUE_FIELDS = [
  'costPrice', 'pricingPresetId', 'customExpensePercent', 'customProfitPercent',
  'customDiscountBufferPercent', 'customInstallmentMarkupPercent',
  'customDownPaymentPercent', 'customInstallmentMonths', 'customCalculationMode',
] as const;

type ProductPricingField = typeof PRICING_VALUE_FIELDS[number] | 'priceCurrency' | 'useCustomPricing' | 'installmentEnabled' | 'taxProfileId' | 'priceIncludesVat';

type ProductPricingCreateData = Partial<Pick<
  Prisma.ProductUncheckedCreateInput,
  ProductPricingField
>>;

function pricingCreateData(input: CreateProductInput): ProductPricingCreateData {
  const data: ProductPricingCreateData = {};
  if (input.costPrice != null) data.costPrice = parseMoney(input.costPrice, input.priceCurrency ?? Currency.USD);
  if (input.priceCurrency !== undefined) data.priceCurrency = input.priceCurrency;
  if (input.pricingPresetId != null) data.pricingPresetId = input.pricingPresetId;
  if (input.useCustomPricing !== undefined) data.useCustomPricing = input.useCustomPricing;
  if (input.installmentEnabled !== undefined) data.installmentEnabled = input.installmentEnabled;
  for (const field of ['customExpensePercent','customProfitPercent','customDiscountBufferPercent','customInstallmentMarkupPercent','customDownPaymentPercent'] as const) {
    if (input[field] != null) data[field] = parsePricingPercent(input[field]!);
  }
  if (input.customInstallmentMonths != null) data.customInstallmentMonths = input.customInstallmentMonths;
  if (input.customCalculationMode != null) data.customCalculationMode = input.customCalculationMode;
  if (input.taxProfileId !== undefined) data.taxProfileId = input.taxProfileId;
  if (input.priceIncludesVat !== undefined) data.priceIncludesVat = input.priceIncludesVat;
  return data;
}

function assertActivePricingPreset(preset: Awaited<ReturnType<typeof ProductsRepository.findPricingPreset>>) {
  if (!preset) throw new ValidationError('Pricing preset not found', { field: 'pricingPresetId' });
  if (!preset.isActive || preset.archivedAt) {
    throw new ValidationError('Pricing preset must be active', { field: 'pricingPresetId' });
  }
}

function assertCompleteCustomPricing(product: Record<string, unknown>) {
  if (!product.useCustomPricing) return;
  const fields = ['customExpensePercent','customProfitPercent','customDiscountBufferPercent','customCalculationMode',
    ...(product.installmentEnabled ? ['customInstallmentMarkupPercent','customDownPaymentPercent','customInstallmentMonths'] : [])];
  for (const field of fields) {
    if (product[field] == null) throw new ValidationError('All custom pricing fields are required when custom pricing is enabled', { field });
  }
}

function assertValidLabelBarcodeSource(product: { barcode: string | null; labelBarcodeSource: string }) {
  if (product.labelBarcodeSource === 'MANUFACTURER' && !product.barcode) {
    throw new ValidationError('A manufacturer barcode is required when it is selected for the label', { field: 'barcode' });
  }
}

function changedSnapshot(product: Product, fields: string[]): Prisma.InputJsonObject {
  const snapshot = productSnapshot(product);
  return Object.fromEntries(fields.map((field) => [field, snapshot[field] ?? null]));
}

async function loadActor(userId: string, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found');
  return actor;
}

function barcodeConflict() {
  return new ServiceConflictError('A product with this barcode already exists', { field: 'barcode' });
}

function skuConflict() {
  return new ServiceConflictError('A product with this SKU already exists', { field: 'sku' });
}

function mapProductError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');
    return target.includes('sku') ? skuConflict() : barcodeConflict();
  }
  return error;
}
