import { Prisma, ServiceAuditAction, ServiceAuditRecordType, StockMovementType } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../../lib/errors';
import { prisma } from '../../../lib/prisma';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { CategoriesService } from '../../categories/categories.service';
import { assertServiceAdmin } from '../authorization/service-policy';
import type { RequestContext, ServiceMutationUser } from '../domain/service-types';
import { writeServiceAudit } from '../audit/service-audit';
import { generateInternalBarcode } from './product-internal-barcode';
import { generateProductSku } from './product-sku';
import {
  importFileHash,
  normalizeExternalCode,
  parseProductInventoryCsv,
  type ParsedProductImportRow,
} from './product-import.parser';
import type {
  CommitProductImportInput,
  CreateProductImportInput,
  UpdateProductImportInput,
} from './product-import.validator';

type DbClient = Prisma.TransactionClient;
type ImportDraft = Prisma.ProductImportGetPayload<Record<string, never>>;

export interface ProductImportMatch {
  id: string;
  sku: string;
  name: string;
  model: string;
  brand: string | null;
  isActive: boolean;
  trackStock: boolean;
  stockQuantity: number;
  hasOpeningBalance: boolean;
}

export interface ProductImportConflict {
  kind: 'FILE_CODE' | 'EXTERNAL_CODE' | 'MODEL' | 'NAME_MODEL' | 'CATEGORY';
  message: string;
  productId?: string;
}

export interface ProductImportPreviewRow extends ParsedProductImportRow {
  categoryId: string | null | undefined;
  status: 'READY' | 'CONFLICT' | 'INVALID';
  conflicts: ProductImportConflict[];
  matches: ProductImportMatch[];
}

export class ProductImportService {
  static async createDraft(input: CreateProductImportInput, user: ServiceMutationUser) {
    assertServiceAdmin(user);
    const rows = parseProductInventoryCsv(input.csvText);
    const draft = await prisma.productImport.create({
      data: {
        fileName: input.fileName,
        fileHash: importFileHash(input.csvText),
        sourceSystem: normalizeSourceSystem(input.sourceSystem),
        brand: input.brand.trim(),
        rows: rows as unknown as Prisma.InputJsonValue,
        categoryMappings: {},
        createdById: user.userId,
      },
    });
    return buildPreview(draft);
  }

  static async getDraft(id: string, user: ServiceMutationUser) {
    assertServiceAdmin(user);
    const draft = await findDraft(id);
    return buildPreview(draft);
  }

  static async updateDraft(id: string, input: UpdateProductImportInput, user: ServiceMutationUser) {
    assertServiceAdmin(user);
    const existing = await findDraft(id);
    assertDraft(existing);
    const draft = await prisma.productImport.update({
      where: { id },
      data: { categoryMappings: input.categoryMappings as Prisma.InputJsonValue },
    });
    return buildPreview(draft);
  }

  static async commit(
    id: string,
    input: CommitProductImportInput,
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    assertServiceAdmin(user);
    const result = await runFinancialTransaction(async (tx) => {
      const draft = await tx.productImport.findUnique({ where: { id } });
      if (!draft) throw new NotFoundError('Product import not found');
      if (draft.status === 'COMMITTED') return draft.result;
      assertDraft(draft);

      const preview = await buildPreview(draft, tx);
      const decisions = new Map(input.decisions.map((decision) => [decision.rowNumber, decision]));
      if (input.decisions.some((decision) => decision.inventoryAction === 'RECONCILE')) {
        if (!input.accountPassword) throw new ValidationError('Account password is required to reconcile existing inventory');
        await verifyAdminPassword(user.userId, input.accountPassword, {
          action: 'COMMIT_PRODUCT_CSV_IMPORT',
          recordType: 'PRODUCT_IMPORT',
          recordId: id,
          ipAddress: context.ipAddress,
          domainLabel: 'product import inventory reconciliation',
        }, tx);
      }

      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.userId }, select: { fullName: true, username: true } });
      const summary = { created: 0, merged: 0, combined: 0, excluded: 0, openingCounts: 0, reconciled: 0 };
      const items: Array<{ rowNumber: number; action: string; productId?: string }> = [];
      const combinedQuantities = new Map(preview.rows.map((row) => [row.rowNumber, row.quantity]));
      for (const decision of input.decisions.filter((item) => item.action === 'COMBINE')) {
        const source = preview.rows.find((row) => row.rowNumber === decision.rowNumber);
        const target = preview.rows.find((row) => row.rowNumber === decision.targetRowNumber);
        if (!source || !target || source.rowNumber === target.rowNumber) throw unresolved(source ?? { rowNumber: decision.rowNumber }, 'Choose a different CSV row to combine into');
        if (normalizeExternalCode(source.externalCode) !== normalizeExternalCode(target.externalCode)) throw unresolved(source, 'Only rows with the same external code can be combined');
        if (decisions.get(target.rowNumber)?.action === 'COMBINE') throw unresolved(source, 'The target CSV row must create, merge, or exclude the combined product');
        combinedQuantities.set(target.rowNumber, (combinedQuantities.get(target.rowNumber) ?? target.quantity) + source.quantity);
      }

      for (const row of preview.rows) {
        const decision = decisions.get(row.rowNumber);
        if (row.status === 'INVALID') throw unresolved(row, 'Fix invalid row values or category mappings');
        if (row.status === 'CONFLICT' && !decision) throw unresolved(row, 'Choose how to resolve this conflict');
        const action = decision?.action ?? 'CREATE';
        if (action === 'COMBINE') {
          summary.combined += 1;
          items.push({ rowNumber: row.rowNumber, action });
          continue;
        }
        if (action === 'EXCLUDE') {
          if ([...input.decisions].some((item) => item.action === 'COMBINE' && item.targetRowNumber === row.rowNumber)) {
            throw unresolved(row, 'A combined target cannot be excluded');
          }
          summary.excluded += 1;
          items.push({ rowNumber: row.rowNumber, action });
          continue;
        }

        const externalCode = (decision?.externalCode ?? row.externalCode).trim();
        const normalizedCode = normalizeExternalCode(externalCode);
        const name = (decision?.name ?? row.description).trim();
        const importQuantity = combinedQuantities.get(row.rowNumber) ?? row.quantity;
        if (!externalCode || !name) throw unresolved(row, 'Code and name are required');
        if (action === 'CREATE' && row.status === 'CONFLICT') {
          const codeChanged = normalizedCode !== normalizeExternalCode(row.externalCode);
          const nameChanged = normalizeText(name) !== normalizeText(row.description);
          if (row.conflicts.some((conflict) => ['EXTERNAL_CODE', 'MODEL'].includes(conflict.kind)) && !codeChanged) {
            throw unresolved(row, 'Change the imported code or merge into the existing product');
          }
          if (row.conflicts.some((conflict) => conflict.kind === 'NAME_MODEL') && !codeChanged && !nameChanged) {
            throw unresolved(row, 'Change the imported code or name, or merge into the existing product');
          }
        }
        const categoryId = row.categoryId ?? null;
        if (categoryId) await CategoriesService.assertAssignable(categoryId, tx);

        if (action === 'CREATE') {
          await assertCreateAvailable(draft.sourceSystem, normalizedCode, draft.brand, externalCode, tx);
          const product = await tx.product.create({
            data: {
              sku: await generateProductSku(tx),
              name,
              model: externalCode,
              barcode: await generateInternalBarcode(tx),
              brand: draft.brand,
              categoryId,
              costPrice: row.costUsd == null ? null : new Prisma.Decimal(row.costUsd),
              priceCurrency: 'USD',
              trackStock: true,
              stockQuantity: importQuantity,
              createdById: user.userId,
            },
          });
          await attachExternalIdentifier(product.id, draft, externalCode, normalizedCode, tx);
          await createStockMovement(product.id, StockMovementType.OPENING_BALANCE, 0, importQuantity, draft.id, user.userId, tx);
          await writeServiceAudit({
            recordType: ServiceAuditRecordType.PRODUCT,
            recordId: product.id,
            action: ServiceAuditAction.CREATE,
            changedById: user.userId,
            changedByName: actor.fullName,
            changedByUsername: actor.username,
            reason: 'Product created from CSV import',
            beforeValues: {},
            afterValues: importProductSnapshot(product, externalCode),
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          }, tx);
          summary.created += 1;
          summary.openingCounts += 1;
          items.push({ rowNumber: row.rowNumber, action, productId: product.id });
          continue;
        }

        const targetId = decision?.targetProductId;
        if (!targetId) throw unresolved(row, 'Select a product to merge into');
        const existing = await tx.product.findUnique({ where: { id: targetId } });
        if (!existing) throw unresolved(row, 'The selected product no longer exists');
        await assertIdentifierOwner(draft.sourceSystem, normalizedCode, targetId, tx);

        const mergeFields = new Set(decision?.mergeFields ?? []);
        const updated = await tx.product.update({
          where: { id: targetId },
          data: {
            ...(mergeFields.has('name') ? { name } : {}),
            ...(mergeFields.has('model') ? { model: externalCode } : {}),
            ...(mergeFields.has('brand') ? { brand: draft.brand } : {}),
            ...(mergeFields.has('category') ? { categoryId } : {}),
            updatedById: user.userId,
          },
        });
        await attachExternalIdentifier(targetId, draft, externalCode, normalizedCode, tx);

        const inventoryAction = decision?.inventoryAction ?? 'KEEP';
        const opening = await tx.stockMovement.findFirst({
          where: { productId: targetId, movementType: StockMovementType.OPENING_BALANCE },
          select: { id: true },
        });
        if (inventoryAction === 'OPENING') {
          if (opening) throw unresolved(row, 'The selected product already has an opening balance');
          await tx.product.update({ where: { id: targetId }, data: { trackStock: true, stockQuantity: importQuantity, updatedById: user.userId } });
          await createStockMovement(targetId, StockMovementType.OPENING_BALANCE, 0, importQuantity, draft.id, user.userId, tx);
          summary.openingCounts += 1;
        } else if (inventoryAction === 'RECONCILE') {
          if (!opening) throw unresolved(row, 'Use opening count for a product that has not been onboarded');
          if (existing.stockQuantity !== importQuantity) {
            await tx.product.update({ where: { id: targetId }, data: { trackStock: true, stockQuantity: importQuantity, updatedById: user.userId } });
            await createStockMovement(targetId, StockMovementType.STOCK_COUNT, existing.stockQuantity, importQuantity, draft.id, user.userId, tx);
            summary.reconciled += 1;
          }
        }

        await writeServiceAudit({
          recordType: ServiceAuditRecordType.PRODUCT,
          recordId: targetId,
          action: ServiceAuditAction.UPDATE_DETAILS,
          changedById: user.userId,
          changedByName: actor.fullName,
          changedByUsername: actor.username,
          reason: 'Product merged from CSV import',
          beforeValues: importProductSnapshot(existing, null),
          afterValues: importProductSnapshot(updated, externalCode),
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        }, tx);
        summary.merged += 1;
        items.push({ rowNumber: row.rowNumber, action, productId: targetId });
      }

      const committed = { importId: id, summary, items };
      await tx.productImport.update({
        where: { id },
        data: {
          status: 'COMMITTED',
          decisions: input.decisions as unknown as Prisma.InputJsonValue,
          result: committed as unknown as Prisma.InputJsonValue,
          committedById: user.userId,
          committedAt: new Date(),
        },
      });
      return committed;
    });
    return result;
  }
}

async function findDraft(id: string) {
  const draft = await prisma.productImport.findUnique({ where: { id } });
  if (!draft) throw new NotFoundError('Product import not found');
  return draft;
}

function assertDraft(draft: ImportDraft) {
  if (draft.status !== 'DRAFT') throw new AppError('This product import has already been committed', 409, 'PRODUCT_IMPORT_COMMITTED');
}

async function buildPreview(draft: ImportDraft, client: DbClient = prisma as unknown as DbClient) {
  const rows = draft.rows as unknown as ParsedProductImportRow[];
  const mappings = draft.categoryMappings as Record<string, string | null>;
  const codes = [...new Set(rows.map((row) => normalizeExternalCode(row.externalCode)))];
  const names = [...new Set(rows.map((row) => row.description.trim()))];
  const categoryIds = [...new Set(Object.values(mappings).filter((value): value is string => Boolean(value)))];
  const [identifiers, products, categories, previous] = await Promise.all([
    client.productExternalIdentifier.findMany({
      where: { sourceSystem: draft.sourceSystem, normalizedCode: { in: codes } },
      include: { product: true },
    }),
    client.product.findMany({
      where: { OR: [
        { model: { in: rows.map((row) => row.externalCode), mode: 'insensitive' } },
        { name: { in: names, mode: 'insensitive' } },
      ] },
    }),
    categoryIds.length ? client.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, isActive: true, parent: { select: { isActive: true, parent: { select: { isActive: true } } } } } }) : [],
    client.productImport.findFirst({ where: { fileHash: draft.fileHash, status: 'COMMITTED', id: { not: draft.id } }, orderBy: { committedAt: 'desc' }, select: { id: true, committedAt: true } }),
  ]);
  const productIds = [...new Set([...identifiers.map((item) => item.productId), ...products.map((item) => item.id)])];
  const openingBalances = productIds.length ? await client.stockMovement.findMany({
    where: { productId: { in: productIds }, movementType: StockMovementType.OPENING_BALANCE },
    select: { productId: true },
  }) : [];
  const openingSet = new Set(openingBalances.map((item) => item.productId));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const codeCounts = new Map<string, number>();
  rows.forEach((row) => codeCounts.set(normalizeExternalCode(row.externalCode), (codeCounts.get(normalizeExternalCode(row.externalCode)) ?? 0) + 1));

  const previewRows: ProductImportPreviewRow[] = rows.map((row) => {
    const conflicts: ProductImportConflict[] = [];
    const matched = new Map<string, (typeof products)[number]>();
    const normalizedCode = normalizeExternalCode(row.externalCode);
    if ((codeCounts.get(normalizedCode) ?? 0) > 1) conflicts.push({ kind: 'FILE_CODE', message: 'This code appears more than once in the CSV' });

    for (const identifier of identifiers.filter((item) => item.normalizedCode === normalizedCode)) {
      matched.set(identifier.product.id, identifier.product);
      conflicts.push({ kind: 'EXTERNAL_CODE', productId: identifier.product.id, message: 'This external code is already attached to a product' });
    }
    for (const product of products) {
      const sameBrand = normalizeText(product.brand) === normalizeText(draft.brand);
      const sameModel = normalizeText(product.model) === normalizeText(row.externalCode);
      const sameName = normalizeText(product.name) === normalizeText(row.description);
      if (sameBrand && sameModel) {
        matched.set(product.id, product);
        conflicts.push({ kind: 'MODEL', productId: product.id, message: 'A product with the same brand and model already exists' });
      } else if (sameName && sameModel) {
        matched.set(product.id, product);
        conflicts.push({ kind: 'NAME_MODEL', productId: product.id, message: 'A product with the same name and model already exists' });
      }
    }

    const hasMapping = Object.prototype.hasOwnProperty.call(mappings, row.family);
    const categoryId = hasMapping ? mappings[row.family] : undefined;
    const issues = [...row.issues];
    if (!hasMapping) conflicts.push({ kind: 'CATEGORY', message: `Choose a category mapping for ${row.family}` });
    if (categoryId) {
      const category = categoryById.get(categoryId);
      if (!category) issues.push('Mapped category no longer exists');
      else if (!category.isActive || category.parent?.isActive === false || category.parent?.parent?.isActive === false) issues.push('Mapped category is inactive');
    }
    const matches = [...matched.values()].map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      model: product.model,
      brand: product.brand,
      isActive: product.isActive,
      trackStock: product.trackStock,
      stockQuantity: product.stockQuantity,
      hasOpeningBalance: openingSet.has(product.id),
    }));
    return {
      ...row,
      issues,
      categoryId,
      conflicts: uniqueConflicts(conflicts),
      matches,
      status: issues.length ? 'INVALID' : conflicts.length ? 'CONFLICT' : 'READY',
    };
  });

  return {
    id: draft.id,
    fileName: draft.fileName,
    fileHash: draft.fileHash,
    sourceSystem: draft.sourceSystem,
    brand: draft.brand,
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
    committedAt: draft.committedAt?.toISOString() ?? null,
    categoryMappings: mappings,
    families: [...new Set(rows.map((row) => row.family))],
    previousCommittedImport: previous ? { id: previous.id, committedAt: previous.committedAt?.toISOString() ?? null } : null,
    counts: {
      total: previewRows.length,
      ready: previewRows.filter((row) => row.status === 'READY').length,
      conflicts: previewRows.filter((row) => row.status === 'CONFLICT').length,
      invalid: previewRows.filter((row) => row.status === 'INVALID').length,
      quantity: previewRows.reduce((sum, row) => sum + row.quantity, 0),
    },
    rows: previewRows,
    result: draft.result,
  };
}

async function assertCreateAvailable(sourceSystem: string, normalizedCode: string, brand: string, model: string, tx: DbClient) {
  const [identifier, product] = await Promise.all([
    tx.productExternalIdentifier.findUnique({ where: { sourceSystem_normalizedCode: { sourceSystem, normalizedCode } } }),
    tx.product.findFirst({ where: { brand: { equals: brand, mode: 'insensitive' }, model: { equals: model, mode: 'insensitive' } }, select: { id: true } }),
  ]);
  if (identifier || product) throw new AppError('The product code now conflicts with an existing product; review the import again', 409, 'PRODUCT_IMPORT_STALE');
}

async function assertIdentifierOwner(sourceSystem: string, normalizedCode: string, productId: string, tx: DbClient) {
  const identifier = await tx.productExternalIdentifier.findUnique({ where: { sourceSystem_normalizedCode: { sourceSystem, normalizedCode } } });
  if (identifier && identifier.productId !== productId) {
    throw new AppError('The external code belongs to another product', 409, 'PRODUCT_IMPORT_CODE_CONFLICT');
  }
}

async function attachExternalIdentifier(productId: string, draft: ImportDraft, externalCode: string, normalizedCode: string, tx: DbClient) {
  const existing = await tx.productExternalIdentifier.findUnique({ where: { sourceSystem_normalizedCode: { sourceSystem: draft.sourceSystem, normalizedCode } } });
  if (existing) {
    if (existing.productId !== productId) throw new AppError('The external code belongs to another product', 409, 'PRODUCT_IMPORT_CODE_CONFLICT');
    return existing;
  }
  return tx.productExternalIdentifier.create({ data: { productId, sourceSystem: draft.sourceSystem, externalCode, normalizedCode, importId: draft.id } });
}

function createStockMovement(productId: string, movementType: StockMovementType, before: number, after: number, importId: string, userId: string, tx: DbClient) {
  return tx.stockMovement.create({ data: {
    productId,
    movementType,
    quantityChange: after - before,
    quantityBefore: before,
    quantityAfter: after,
    reason: movementType === StockMovementType.OPENING_BALANCE ? 'CSV import opening count' : 'CSV import inventory reconciliation',
    note: 'Imported from inventory CSV',
    referenceType: 'PRODUCT_IMPORT',
    referenceId: importId,
    createdById: userId,
  } });
}

function importProductSnapshot(product: { id: string; sku: string; name: string; model: string; brand: string | null; categoryId: string | null; stockQuantity: number }, externalCode: string | null): Prisma.InputJsonObject {
  return { id: product.id, sku: product.sku, name: product.name, model: product.model, brand: product.brand, categoryId: product.categoryId, stockQuantity: product.stockQuantity, externalCode };
}

function unresolved(row: Pick<ProductImportPreviewRow, 'rowNumber'>, message: string) {
  return new AppError(`Row ${row.rowNumber}: ${message}`, 409, 'PRODUCT_IMPORT_UNRESOLVED');
}

function normalizeSourceSystem(value: string) {
  return value.trim().replace(/\s+/g, '-').toLocaleLowerCase('en-US');
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function uniqueConflicts(conflicts: ProductImportConflict[]) {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.kind}:${conflict.productId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
