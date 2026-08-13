import { Role, StockMovementType } from '@prisma/client';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { AuthorizationError, NotFoundError, ValidationError } from '../../lib/errors';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { deriveProductStockStatus } from '../service/products/product-stock';
import { InventoryRepository } from './inventory.repository';
import {
  GuardedStockMovementInput,
  InventoryRequestContext,
  InventoryUser,
  LowStockListInput,
  MaintenanceStockIntegrity,
  MovementListInput,
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

type Direction = 'ADD' | 'REMOVE' | 'COUNT';

type WiredMovementType = Exclude<
  StockMovementType,
  | 'PURCHASE_RECEIPT'
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
  static async verifyOpeningCount(
    productId: string,
    input: VerifyOpeningCountInput,
    user: InventoryUser,
    context: InventoryRequestContext = {}
  ) {
    if (!user?.userId) throw new AuthorizationError('User not authenticated');
    if (user.role !== Role.ADMIN) throw new AuthorizationError('Only administrators can verify an opening count');
    assertStockCountTarget(input.verifiedCount);
    const reason = normalizeRequiredReason(input.reason);
    if (!input.accountPassword) throw new ValidationError('Account password is required');

    return runFinancialTransaction(async (tx) => {
      const product = await InventoryRepository.findProduct(productId, tx);
      if (!product) throw new NotFoundError('Product not found');

      await verifyAdminPassword(user.userId, input.accountPassword, {
        action: 'VERIFY_OPENING_COUNT',
        recordType: 'PRODUCT',
        recordId: productId,
        ipAddress: context.ipAddress,
        domainLabel: 'inventory opening count',
      }, tx);

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
