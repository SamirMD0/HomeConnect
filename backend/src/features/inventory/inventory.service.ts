import { Prisma, Role, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { AuthorizationError, NotFoundError, ValidationError } from '../../lib/errors';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { deriveProductStockStatus } from '../service/products/product-stock';
import { InventoryRepository } from './inventory.repository';
import {
  GuardedStockMovementInput,
  BatchOpeningCountItem,
  BatchOnboardingDryRunResult,
  BatchOnboardingSkippedItem,
  BatchOnboardingValidItem,
  BatchOnboardingWriteResult,
  BatchVerifyOpeningCountInput,
  InventoryRequestContext,
  InventoryUser,
  LowStockListInput,
  MaintenanceStockIntegrity,
  MovementListInput,
  OnboardingWorklistInput,
  StockCountInput,
  StockIntegrityResult,
  StockMovementBaseInput,
  VerifyOpeningCountInput,
} from './inventory.types';
import {
  assertExpectedBefore,
  assertMovementQuantity,
  assertStockCountTarget,
  normalizeOptionalText,
  normalizeRequiredReason,
} from './inventory.validator';

const ONBOARDING_REQUIRED =
  'This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون';
const COUNT_MATCHES =
  'Count matches current stock. Nothing to record. / الجرد مطابق للمخزون الحالي. لا يوجد ما يُسجَّل.';
export const BATCH_ONBOARDING_REASON = 'Initial shop-floor stock count / جرد افتتاحي';

type Direction = 'ADD' | 'REMOVE' | 'COUNT';

type WiredMovementType = Exclude<
  StockMovementType,
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_RECEIPT_REVERSAL'
  | 'SALE_FULFILLMENT'
  | 'SALE_CANCEL_RESTORE'
  | 'SERVICE_PART_USED'
>;

interface MutationSpec {
  movementType: WiredMovementType;
  direction: Direction;
  requiresAdmin: boolean;
  action: string;
}

export class InventoryService {
  static async batchVerifyOpeningCount(
    input: BatchVerifyOpeningCountInput,
    user: InventoryUser,
    _context: InventoryRequestContext = {}
  ): Promise<BatchOnboardingDryRunResult | BatchOnboardingWriteResult> {
    if (!user?.userId) throw new AuthorizationError('User not authenticated');
    if (user.role !== Role.ADMIN) throw new AuthorizationError('Only administrators can verify opening counts in batch');
    assertBatchOpeningCountInput(input);

    if (input.dryRun === true) {
      const classification = await classifyBatchOnboarding(input.items);
      return {
        dryRun: true,
        batchId: null,
        valid: classification.valid.map(toValidResult),
        skipped: classification.skipped,
        counts: { valid: classification.valid.length, skipped: classification.skipped.length },
      };
    }

    return runFinancialTransaction(async (tx) => {
      const classification = await classifyBatchOnboarding(input.items, tx);
      const batchId = randomUUID();
      const skipped = [...classification.skipped];
      const written: BatchOnboardingWriteResult['written'] = [];

      for (const item of classification.valid) {
        // Classification and this guard both run inside the serializable transaction.
        // The second read keeps a stale/overlapping row out of the write path.
        if (await InventoryRepository.hasOpeningBalance(item.productId, tx)) {
          skipped.push({ productId: item.productId, reason: 'ALREADY_ONBOARDED' });
          continue;
        }
        await InventoryRepository.setVerifiedOpeningCount(item.productId, item.openingCount, user.userId, tx);
        const movement = await InventoryRepository.createMovement({
          productId: item.productId,
          movementType: StockMovementType.OPENING_BALANCE,
          quantityChange: item.openingCount,
          quantityBefore: 0,
          quantityAfter: item.openingCount,
          reason: BATCH_ONBOARDING_REASON,
          note: normalizeOptionalText(item.note),
          referenceType: 'MANUAL_BATCH',
          referenceId: batchId,
          createdById: user.userId,
        }, tx);
        written.push({ productId: item.productId, openingCount: item.openingCount, movementId: movement.id });
      }

      return {
        dryRun: false,
        batchId,
        written,
        skipped,
        counts: { written: written.length, skipped: skipped.length },
      };
    });
  }

  static async verifyOpeningCount(
    productId: string,
    input: VerifyOpeningCountInput,
    user: InventoryUser,
    _context: InventoryRequestContext = {}
  ) {
    if (!user?.userId) throw new AuthorizationError('User not authenticated');
    if (user.role !== Role.ADMIN) throw new AuthorizationError('Only administrators can verify an opening count');
    assertStockCountTarget(input.verifiedCount);
    const reason = normalizeRequiredReason(input.reason);

    return runFinancialTransaction(async (tx) => {
      const product = await InventoryRepository.findProduct(productId, tx);
      if (!product) throw new NotFoundError('Product not found');

      if (await InventoryRepository.hasOpeningBalance(productId, tx)) {
        throw new ValidationError('This product already has a verified opening count / لهذا المنتج جرد افتتاحي مؤكد بالفعل');
      }

      const updatedProduct = await InventoryRepository.setVerifiedOpeningCount(
        productId,
        input.verifiedCount,
        user.userId,
        tx
      );
      const movement = await InventoryRepository.createMovement({
        productId,
        movementType: StockMovementType.OPENING_BALANCE,
        quantityChange: input.verifiedCount,
        quantityBefore: 0,
        quantityAfter: input.verifiedCount,
        reason,
        note: normalizeOptionalText(input.note),
        referenceType: 'MANUAL',
        referenceId: null,
        createdById: user.userId,
      }, tx);

      return {
        changed: true as const,
        message: null,
        product: { ...updatedProduct, stockStatus: deriveProductStockStatus(updatedProduct) },
        movement,
      };
    });
  }

  static addStock(productId: string, input: StockMovementBaseInput, user: InventoryUser, context: InventoryRequestContext = {}) {
    return mutate(productId, input, user, context, {
      movementType: StockMovementType.MANUAL_ADD,
      direction: 'ADD',
      requiresAdmin: false,
      action: 'ADD_STOCK',
    });
  }

  static removeStock(productId: string, input: GuardedStockMovementInput, user: InventoryUser, context: InventoryRequestContext = {}) {
    return mutate(productId, input, user, context, {
      movementType: StockMovementType.MANUAL_REMOVE,
      direction: 'REMOVE',
      requiresAdmin: true,
      action: 'REMOVE_STOCK',
    });
  }

  static correctStockCount(productId: string, input: StockCountInput, user: InventoryUser, context: InventoryRequestContext = {}) {
    return mutate(productId, { ...input, quantity: input.targetTotal }, user, context, {
      movementType: StockMovementType.STOCK_COUNT,
      direction: 'COUNT',
      requiresAdmin: true,
      action: 'CORRECT_STOCK_COUNT',
    });
  }

  static markDamagedLost(productId: string, input: GuardedStockMovementInput, user: InventoryUser, context: InventoryRequestContext = {}) {
    return mutate(productId, input, user, context, {
      movementType: StockMovementType.DAMAGE_LOSS,
      direction: 'REMOVE',
      requiresAdmin: true,
      action: 'MARK_STOCK_DAMAGED_LOST',
    });
  }

  static returnToStock(productId: string, input: StockMovementBaseInput, user: InventoryUser, context: InventoryRequestContext = {}) {
    return mutate(productId, input, user, context, {
      movementType: StockMovementType.RETURN_TO_STOCK,
      direction: 'ADD',
      requiresAdmin: false,
      action: 'RETURN_TO_STOCK',
    });
  }

  static async getProductInventory(productId: string) {
    const product = await InventoryRepository.findProduct(productId);
    if (!product) throw new NotFoundError('Product not found');
    const [openingBalance, movements] = await Promise.all([
      InventoryRepository.hasOpeningBalance(productId),
      InventoryRepository.listMovements({ productId, page: 1, pageSize: 10 }),
    ]);
    return {
      product: { ...product, stockStatus: deriveProductStockStatus(product) },
      onboardingStatus: openingBalance
        ? 'ONBOARDED' as const
        : movements.total === 0 && !product.trackStock && product.stockQuantity === 0
          ? 'NOT_IN_INVENTORY' as const
          : 'PENDING_ONBOARDING' as const,
      recentMovements: movements.items,
    };
  }

  static getProductMovements(input: MovementListInput = {}) {
    return InventoryRepository.listMovements(input);
  }

  static getLowStockProducts(input: LowStockListInput = {}) {
    return InventoryRepository.listLowStock(input);
  }

  static getPendingOnboarding(input: OnboardingWorklistInput = {}) {
    return InventoryRepository.listPendingOnboarding(input);
  }

  static getInventorySummary() {
    return InventoryRepository.summary();
  }

  static async getStockIntegrity(): Promise<StockIntegrityResult> {
    const items = await InventoryRepository.stockIntegrity();
    return {
      available: true,
      checkedAt: new Date().toISOString(),
      totalProducts: items.length,
      ok: items.filter((item) => item.status === 'OK').length,
      notInInventory: items.filter((item) => item.status === 'NOT_IN_INVENTORY').length,
      pendingOnboarding: items.filter((item) => item.status === 'PENDING_ONBOARDING').length,
      mismatch: items.filter((item) => item.status === 'MISMATCH').length,
      items: items.filter((item) => item.status !== 'OK'),
    };
  }

  static async getMaintenanceStockIntegrity(): Promise<MaintenanceStockIntegrity> {
    try {
      return await this.getStockIntegrity();
    } catch {
      return {
        available: false,
        checkedAt: new Date().toISOString(),
        message: 'Stock integrity is unavailable until the inventory database update has been applied.',
      };
    }
  }
}

function assertBatchOpeningCountInput(input: BatchVerifyOpeningCountInput): void {
  if (!input || !Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError('At least one product is required');
  }
  if (input.items.length > 100) throw new ValidationError('A batch may contain at most 100 products');
  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.productId)) throw new ValidationError('Product IDs must be unique within a batch');
    seen.add(item.productId);
    assertStockCountTarget(item.openingCount);
  }
}

async function classifyBatchOnboarding(items: BatchOpeningCountItem[], tx?: Prisma.TransactionClient): Promise<{
  valid: BatchOpeningCountItem[];
  skipped: BatchOnboardingSkippedItem[];
}> {
  const productIds = items.map((item) => item.productId);
  const [products, openingBalances] = await Promise.all([
    InventoryRepository.findProductsForOnboarding(productIds, tx),
    InventoryRepository.findOpeningBalances(productIds, tx),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const onboardedIds = new Set(openingBalances.map((movement) => movement.productId));
  const valid: BatchOpeningCountItem[] = [];
  const skipped: BatchOnboardingSkippedItem[] = [];
  for (const item of items) {
    const product = productsById.get(item.productId);
    if (!product) skipped.push({ productId: item.productId, reason: 'PRODUCT_NOT_FOUND' });
    else if (!product.isActive) skipped.push({ productId: item.productId, reason: 'PRODUCT_ARCHIVED' });
    else if (onboardedIds.has(item.productId)) skipped.push({ productId: item.productId, reason: 'ALREADY_ONBOARDED' });
    else valid.push(item);
  }
  return { valid, skipped };
}

function toValidResult(item: BatchOpeningCountItem): BatchOnboardingValidItem {
  return { productId: item.productId, openingCount: item.openingCount };
}

async function mutate(
  productId: string,
  input: StockMovementBaseInput & { accountPassword?: string },
  user: InventoryUser,
  context: InventoryRequestContext,
  spec: MutationSpec
) {
  if (!user?.userId) throw new AuthorizationError('User not authenticated');
  if (spec.requiresAdmin && user.role !== Role.ADMIN) {
    throw new AuthorizationError('Only administrators can remove or correct stock');
  }
  const reason = normalizeRequiredReason(input.reason);
  assertExpectedBefore(input.expectedBefore);
  if (spec.direction === 'COUNT') assertStockCountTarget(input.quantity);
  else assertMovementQuantity(input.quantity);
  if (spec.requiresAdmin && !input.accountPassword) throw new ValidationError('Account password is required');

  return runFinancialTransaction(async (tx) => {
    const product = await InventoryRepository.findProduct(productId, tx);
    if (!product) throw new NotFoundError('Product not found');
    if (!product.trackStock) {
      throw new ValidationError('Stock tracking is disabled for this product / تتبع المخزون غير مفعّل لهذا المنتج');
    }
    if (!(await InventoryRepository.hasOpeningBalance(productId, tx))) throw new ValidationError(ONBOARDING_REQUIRED);

    const before = product.stockQuantity;
    if (input.expectedBefore !== undefined && input.expectedBefore !== before) {
      throw staleStock(input.expectedBefore, before);
    }
    const after = spec.direction === 'ADD'
      ? before + input.quantity
      : spec.direction === 'REMOVE'
        ? before - input.quantity
        : input.quantity;
    const change = after - before;

    if (!Number.isSafeInteger(after) || after > 2_147_483_647) {
      throw new ValidationError('Resulting stock quantity is too large');
    }

    if (after < 0) {
      throw new ValidationError(
        `Cannot remove ${input.quantity}; only ${before} units are in stock / لا يمكن إزالة ${input.quantity}؛ المتوفر ${before} فقط`
      );
    }
    if (spec.requiresAdmin) {
      await verifyAdminPassword(user.userId, input.accountPassword!, {
        action: spec.action,
        recordType: 'PRODUCT',
        recordId: productId,
        ipAddress: context.ipAddress,
        domainLabel: 'inventory stock changes',
      }, tx);
    }

    if (spec.direction === 'COUNT' && change === 0) {
      return { changed: false as const, message: COUNT_MATCHES, product, movement: null };
    }
    if (change === 0) throw new ValidationError('Stock movement must change the quantity');

    const updated = await InventoryRepository.compareAndSetQuantity(productId, before, after, tx);
    if (updated.count !== 1) throw staleStock(before);

    const movement = await InventoryRepository.createMovement({
      productId,
      movementType: spec.movementType,
      quantityChange: change,
      quantityBefore: before,
      quantityAfter: after,
      reason,
      note: normalizeOptionalText(input.note),
      referenceType: normalizeOptionalText(input.referenceType),
      referenceId: normalizeOptionalText(input.referenceId),
      createdById: user.userId,
    }, tx);

    return {
      changed: true as const,
      message: null,
      product: { ...product, stockQuantity: after },
      movement,
    };
  });
}

function staleStock(expected: number, actual?: number): ValidationError {
  const actualText = actual === undefined ? 'a different value' : String(actual);
  return new ValidationError(
    `Stock changed from expected ${expected} to ${actualText}. Refresh and retry / تغيّر المخزون، يرجى التحديث والمحاولة مجددًا`
  );
}
