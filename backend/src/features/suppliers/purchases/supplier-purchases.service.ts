import {
  LabelBarcodeSource, Prisma, ServiceAuditAction, ServiceAuditRecordType, StockMovementType,
  SupplierAuditAction, SupplierAuditRecordType, SupplierPurchaseLineKind,
  SupplierTransactionDirection, SupplierTransactionType,
} from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError, ValidationError } from '../../../lib/errors';
import { assertPositiveMoney, moneyToApiString, multiplyMoney, parseMoney, subtractMoney, sumMoney, ZERO_MONEY } from '../../financial/domain/money';
import { businessDateToPrisma, prismaDateToBusinessDate } from '../../financial/domain/business-date';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { InventoryRepository } from '../../inventory/inventory.repository';
import { assertReceivingDateNotFuture, postSupplierReceiving } from '../../inventory/receiving/supplier-receivings.service';
import { ProductsRepository } from '../../service/products/products.repository';
import { generateProductSku } from '../../service/products/product-sku';
import { writeServiceAudit } from '../../service/audit/service-audit';
import { writeSupplierAudit } from '../audit/supplier-audit';
import { assertSupplierAdmin } from '../authorization/supplier-policy';
import { SupplierMutationUser, SupplierRequestContext } from '../domain/supplier-types';
import { SuppliersRepository } from '../suppliers/suppliers.repository';
import { SupplierTransactionsRepository } from '../transactions/supplier-transactions.repository';
import { SupplierPurchasesRepository } from './supplier-purchases.repository';
import { CreateSupplierPurchaseInput, ReceiptCheckInput, SupplierPurchaseListInput } from './supplier-purchases.validator';

/** A line after products have been resolved and money has been computed. */
interface ResolvedLine {
  kind: SupplierPurchaseLineKind;
  productId: string | null;
  description: string;
  quantity: number | null;
  unitPrice: Prisma.Decimal | null;
  lineTotal: Prisma.Decimal;
  /** Product lines that should move stock; manual lines never can. */
  receivesStock: boolean;
}

/**
 * Composes a supplier purchase: priced lines, an optional stock receipt, and the
 * supplier debt they add up to — in one transaction.
 *
 * This orchestrates; it does not reimplement. Stock is written only by
 * `postSupplierReceiving`, the supplier ledger only by the supplier transaction
 * repository, and a product is onboarded only through the same admin-password
 * verification the standalone opening-count flow uses. If any half fails, the
 * whole purchase rolls back and the shop is left exactly as it was.
 */
export class SupplierPurchasesService {
  static async create(
    supplierId: string,
    input: CreateSupplierPurchaseInput,
    user: SupplierMutationUser,
    context: SupplierRequestContext
  ) {
    assertSupplierAdmin(user);
    const receiptNumber = input.receiptNumber ?? null;

    return runFinancialTransaction(async (tx) => {
      const supplier = await SuppliersRepository.findById(supplierId, tx);
      if (!supplier) throw new NotFoundError('Supplier not found / المورد غير موجود');
      if (!supplier.isActive) throw new AppError('Archived suppliers cannot receive new transactions', 409, 'SUPPLIER_ARCHIVED');

      // One verification for the whole purchase, before anything is written.
      const quickAddCount = input.lines.filter((line) => line.kind === 'NEW_PRODUCT').length;
      if (quickAddCount) {
        await verifyAdminPassword(user.userId, input.accountPassword!, {
          action: 'QUICK_ADD_PRODUCT_FROM_PURCHASE',
          recordType: 'SUPPLIER',
          recordId: supplierId,
          ipAddress: context.ipAddress,
          domainLabel: 'inventory opening count',
        }, tx);
      }

      const lines: ResolvedLine[] = [];
      for (const line of input.lines) {
        if (line.kind === 'MANUAL') {
          lines.push({
            kind: SupplierPurchaseLineKind.MANUAL,
            productId: null, description: line.description, quantity: null, unitPrice: null,
            lineTotal: parseMoney(line.amount), receivesStock: false,
          });
          continue;
        }

        const productId = line.kind === 'NEW_PRODUCT'
          ? await createQuickAddProduct(line, user, context, tx)
          : line.productId;
        const product = await InventoryRepository.findProduct(productId, tx);
        if (!product) throw new NotFoundError('Product not found / المنتج غير موجود');

        // A product that does not track stock can still be bought — it just
        // cannot be received. Refusing here is better than quietly billing for
        // goods the user believes were added to inventory.
        if (input.receiveStock && !product.trackStock) {
          throw new ValidationError(`Stock tracking is disabled for ${product.name} — record it as a description line or enable stock tracking first / تتبع المخزون غير مفعّل لهذا المنتج`);
        }

        lines.push({
          kind: SupplierPurchaseLineKind.PRODUCT,
          productId,
          description: `${product.name} · ${product.sku}`,
          quantity: line.quantity,
          unitPrice: parseMoney(line.unitPrice),
          lineTotal: multiplyMoney(line.unitPrice, String(line.quantity)),
          receivesStock: input.receiveStock,
        });
      }

      const stockLines = lines.filter((line) => line.receivesStock);
      let receivingId: string | null = null;
      let itemIdByProductId = new Map<string, string>();
      if (stockLines.length) {
        assertReceivingDateNotFuture(input.transactionDate);
        const posted = await postSupplierReceiving({
          supplier: { id: supplier.id, name: supplier.name, isActive: supplier.isActive },
          referenceNumber: receiptNumber,
          note: input.notes ?? null,
          receivedOn: input.transactionDate,
          items: stockLines.map((line) => ({ productId: line.productId!, quantity: line.quantity! })),
          userId: user.userId,
        }, tx);
        receivingId = posted.receivingId;
        itemIdByProductId = posted.itemIdByProductId;
      }

      const lineSum = sumMoney(lines.map((line) => line.lineTotal));
      // The override is the user's stated total; the line sum is still stored on
      // the lines, so an adjusted invoice keeps both numbers visible.
      const amount = assertPositiveMoney(input.amountOverride ?? lineSum);

      const transaction = await SupplierTransactionsRepository.create({
        supplierId,
        supplierReceivingId: receivingId,
        type: SupplierTransactionType.SUPPLIER_DEBT,
        direction: SupplierTransactionDirection.INCREASE_OWED,
        amount,
        transactionDate: businessDateToPrisma(input.transactionDate),
        description: input.description,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        receiptNumber,
        amountOverride: Boolean(input.amountOverride),
        amountOverrideReason: input.amountOverride ? input.amountOverrideReason ?? null : null,
        createdById: user.userId,
      }, tx);

      // The settled portion is a second, ordinary supplier payment rather than a
      // smaller debt: the bill must keep saying what was billed, and the balance
      // still comes from direction and amount exactly as it always has.
      const paid = parseMoney(input.paidAmount ?? '0');
      if (paid.greaterThan(amount)) {
        throw new ValidationError(`Paid amount cannot exceed the purchase total of ${moneyToApiString(amount)} / المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة`);
      }
      if (paid.greaterThan(ZERO_MONEY)) {
        await SupplierTransactionsRepository.create({
          supplierId,
          // A payment may never carry the receiving link; the database enforces it.
          supplierReceivingId: null,
          type: SupplierTransactionType.SUPPLIER_PAYMENT,
          direction: SupplierTransactionDirection.DECREASE_OWED,
          amount: paid,
          transactionDate: businessDateToPrisma(input.transactionDate),
          description: paymentDescription(receiptNumber, moneyToApiString(paid)),
          reference: input.paymentReference ?? null,
          notes: null,
          receiptNumber,
          createdById: user.userId,
        }, tx);
      }

      for (const [position, line] of lines.entries()) {
        await SupplierPurchasesRepository.createLine({
          supplierTransactionId: transaction.id,
          kind: line.kind,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          receivingItemId: line.receivesStock ? receivedItemId(line, itemIdByProductId) : null,
          position,
        }, tx);
      }

      const actor = await loadActor(user.userId, tx);
      await writeSupplierAudit({
        recordType: SupplierAuditRecordType.SUPPLIER_TRANSACTION,
        recordId: transaction.id,
        supplierId,
        supplierTransactionId: transaction.id,
        action: SupplierAuditAction.CREATE,
        changedById: user.userId,
        changedByName: actor.fullName,
        changedByUsername: actor.username,
        reason: 'Supplier purchase recorded',
        beforeValues: {},
        afterValues: {
          receiptNumber,
          amount: moneyToApiString(amount),
          lineSum: moneyToApiString(lineSum),
          amountOverride: Boolean(input.amountOverride),
          amountOverrideReason: input.amountOverride ? input.amountOverrideReason ?? null : null,
          transactionDate: input.transactionDate,
          supplierReceivingId: receivingId,
          lineCount: lines.length,
          stockLineCount: stockLines.length,
          quickAddedProducts: quickAddCount,
          paidAmount: moneyToApiString(paid),
          remainingOwed: moneyToApiString(subtractMoney(amount, paid)),
        },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      }, tx);

      const created = await SupplierPurchasesRepository.findById(transaction.id, tx);
      if (!created) throw new NotFoundError('Purchase not found after creation');
      return serializePurchase(created);
    });
  }

  static async get(id: string) {
    const purchase = await SupplierPurchasesRepository.findById(id);
    if (!purchase) throw new NotFoundError('Purchase not found / الفاتورة غير موجودة');
    return serializePurchase(purchase);
  }

  static async listForSupplier(supplierId: string, query: SupplierPurchaseListInput) {
    if (!(await SuppliersRepository.findById(supplierId))) throw new NotFoundError('Supplier not found');
    const result = await SupplierPurchasesRepository.listForSupplier(supplierId, query.page, query.pageSize);
    return { items: result.items.map(serializePurchase), total: result.total, page: query.page, pageSize: query.pageSize };
  }

  /** Advisory only — never blocks a purchase. */
  static async receiptCheck(input: ReceiptCheckInput) {
    const matches = await SupplierPurchasesRepository.findReceiptMatches(input.supplierId, input.receiptNumber);
    return {
      duplicate: matches.length > 0,
      matches: matches.map((match) => ({
        ...match,
        amount: moneyToApiString(match.amount),
        transactionDate: prismaDateToBusinessDate(match.transactionDate),
      })),
    };
  }
}

/**
 * Creates a product and its zero opening count in one step.
 *
 * The opening-count guard exists because an established product's true physical
 * quantity is unknown. A product created here has no history to be wrong about,
 * so zero is observed fact rather than a guess — but it still costs an admin
 * password and still writes both the audit row and the OPENING_BALANCE movement,
 * so nothing about the existing control is bypassed. A product that already
 * exists can never reach this path: it has no id to supply.
 */
async function createQuickAddProduct(
  line: { name: string; model: string; barcode?: string | null; brand?: string | null; sellingPrice?: string | null },
  user: SupplierMutationUser,
  context: SupplierRequestContext,
  tx: Prisma.TransactionClient
): Promise<string> {
  if (line.barcode && (await ProductsRepository.findByBarcode(line.barcode, tx))) {
    throw new AppError('A product with this barcode already exists / يوجد منتج بهذا الباركود', 409, 'PRODUCT_BARCODE_CONFLICT');
  }

  const product = await ProductsRepository.create({
    sku: await generateProductSku(tx),
    name: line.name,
    model: line.model,
    barcode: line.barcode ?? null,
    brand: line.brand ?? null,
    price: line.sellingPrice ? parseMoney(line.sellingPrice) : null,
    labelBarcodeSource: LabelBarcodeSource.AUTO,
    trackStock: true,
    stockQuantity: 0,
    createdById: user.userId,
  }, tx);

  await InventoryRepository.createMovement({
    productId: product.id,
    movementType: StockMovementType.OPENING_BALANCE,
    quantityChange: 0,
    quantityBefore: 0,
    quantityAfter: 0,
    reason: 'Opening count of zero for a product created on a supplier purchase / جرد افتتاحي صفر لمنتج أُنشئ ضمن فاتورة مورد',
    note: null,
    referenceType: 'SUPPLIER_PURCHASE_QUICK_ADD',
    referenceId: null,
    createdById: user.userId,
  }, tx);

  const actor = await loadActor(user.userId, tx);
  await writeServiceAudit({
    recordType: ServiceAuditRecordType.PRODUCT,
    recordId: product.id,
    action: ServiceAuditAction.CREATE,
    changedById: user.userId,
    changedByName: actor.fullName,
    changedByUsername: actor.username,
    reason: 'Product created from a supplier purchase with a verified zero opening count',
    beforeValues: {},
    afterValues: {
      sku: product.sku, name: product.name, model: product.model, barcode: product.barcode,
      brand: product.brand, trackStock: true, stockQuantity: 0,
      price: product.price ? moneyToApiString(product.price) : null,
    },
    requestId: context.requestId,
    ipAddress: context.ipAddress,
  }, tx);

  return product.id;
}

/**
 * The receiving item that moved this line's stock.
 *
 * Failing loudly matters here: storing null instead would post a debt whose
 * line claims stock moved but records nothing that proves it, leaving a
 * discrepancy for reconciliation to find later rather than the transaction to
 * roll back now.
 */
function receivedItemId(line: ResolvedLine, itemIdByProductId: Map<string, string>): string {
  const itemId = line.productId ? itemIdByProductId.get(line.productId) : undefined;
  if (!itemId) throw new AppError('Received stock could not be linked to its purchase line', 500, 'RECEIVING_LINK_MISSING');
  return itemId;
}

/** Ledger text for the settled portion, in the same two-line bilingual shape as a purchase. */
function paymentDescription(receiptNumber: string | null, paid: string): string {
  const invoice = receiptNumber ? ` on invoice ${receiptNumber}` : '';
  const fatura = receiptNumber ? ` بموجب الفاتورة ${receiptNumber}` : '';
  return `Paid ${paid} to the supplier${invoice}\nتم دفع ${paid} للمورد${fatura}`;
}

async function loadActor(id: string, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found');
  return actor;
}

type PurchaseRecord = NonNullable<Awaited<ReturnType<typeof SupplierPurchasesRepository.findById>>>;

function serializePurchase(purchase: PurchaseRecord) {
  const lineSum = purchase.purchaseLines.length
    ? sumMoney(purchase.purchaseLines.map((line) => line.lineTotal))
    : ZERO_MONEY;
  return {
    ...purchase,
    amount: moneyToApiString(purchase.amount),
    lineSum: moneyToApiString(lineSum),
    transactionDate: prismaDateToBusinessDate(purchase.transactionDate),
    supplierReceiving: purchase.supplierReceiving
      ? { ...purchase.supplierReceiving, receivedOn: prismaDateToBusinessDate(purchase.supplierReceiving.receivedOn) }
      : null,
    purchaseLines: purchase.purchaseLines.map((line) => ({
      ...line,
      unitPrice: line.unitPrice ? moneyToApiString(line.unitPrice) : null,
      lineTotal: moneyToApiString(line.lineTotal),
    })),
  };
}
