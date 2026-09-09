import {
  Currency, LabelBarcodeSource, Prisma, ServiceAuditAction, ServiceAuditRecordType, StockMovementType,
  SupplierAuditAction, SupplierAuditRecordType, SupplierPurchaseLineKind,
  SupplierTransactionDirection, SupplierTransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError, ValidationError } from '../../../lib/errors';
import { assertPositiveMoney, divideMoney, moneyToApiString, parseMoney, subtractMoney, sumMoney, toBaseAmount, ZERO_MONEY } from '../../financial/domain/money';
import { businessDateToPrisma, prismaDateToBusinessDate } from '../../financial/domain/business-date';
import {
  assertIdempotentReplay,
  createIdempotencyFingerprint,
  normalizeIdempotencyKey,
} from '../../financial/infrastructure/idempotency';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { calculateVatLine } from '../../tax/domain/vat';
import { TaxRepository } from '../../tax/tax.repository';
import { ExchangeRatesService } from '../../financial/exchange-rates/exchange-rates.service';
import { InventoryRepository } from '../../inventory/inventory.repository';
import { assertReceivingDateNotFuture, postSupplierReceiving } from '../../inventory/receiving/supplier-receivings.service';
import { ProductsRepository } from '../../service/products/products.repository';
import { generateProductSku } from '../../service/products/product-sku';
import { writeServiceAudit } from '../../service/audit/service-audit';
import { resolveProductPricing, usesAutomaticPricing } from '../../pricing/calculator/pricing-resolution';
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
  taxRateSnapshot: Prisma.Decimal;
  taxCodeSnapshot: string;
  unitPriceExVat: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  lineTotalIncVat: Prisma.Decimal;
  currency: Currency;
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
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const receiptNumber = input.receiptNumber ?? null;

    return runFinancialTransaction(async (tx) => {
      const currency = input.currency ?? Currency.USD;
      const effectiveAt = businessDateToPrisma(input.transactionDate);
      const exchangeRate = await ExchangeRatesService.snapshotFor(currency, effectiveAt, tx);
      const supplier = await SuppliersRepository.findById(supplierId, tx);
      if (!supplier) throw new NotFoundError('Supplier not found / المورد غير موجود');
      if (!supplier.isActive) throw new AppError('Archived suppliers cannot receive new transactions', 409, 'SUPPLIER_ARCHIVED');

      if (idempotencyKey) {
        const existingPurchase = await SupplierPurchasesRepository.findByIdempotencyKey(tx, idempotencyKey);
        if (existingPurchase) {
          assertIdempotentReplay({
            existingFingerprint: createExistingPurchaseFingerprint(existingPurchase, input),
            incomingFingerprint: await createIncomingPurchaseFingerprint(
              supplierId,
              input,
              idempotencyKey,
              user.userId,
              tx
            ),
          });
          return serializeIdempotentPurchase(existingPurchase);
        }
      }

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
          const profile = await TaxRepository.requireEffectiveProfile(line.taxProfileId, businessDateToPrisma(input.transactionDate), tx);
          const vat = calculateVatLine({
            currency, quotedUnitPrice: line.amount, quantity: 1,
            priceIncludesVat: line.priceIncludesVat ?? false, taxRatePercent: profile.taxRate.ratePercent, taxCode: profile.code,
          });
          lines.push({
            kind: SupplierPurchaseLineKind.MANUAL,
            productId: null, description: line.description, quantity: null, unitPrice: null,
            lineTotal: vat.lineTotalExVat,
            taxRateSnapshot: vat.taxRateSnapshot, taxCodeSnapshot: vat.taxCodeSnapshot,
            unitPriceExVat: vat.unitPriceExVat, vatAmount: vat.vatAmount, lineTotalIncVat: vat.lineTotalIncVat,
            receivesStock: false, currency,
          });
          continue;
        }

        const productId = line.kind === 'NEW_PRODUCT'
          ? await createQuickAddProduct(line, currency, user, context, tx)
          : line.productId;
        const product = await InventoryRepository.findProduct(productId, tx);
        if (!product) throw new NotFoundError('Product not found / المنتج غير موجود');
        if ((product.priceCurrency ?? Currency.USD) !== currency) {
          throw new ValidationError(`Purchase currency must match ${product.name}'s configured price currency until cross-currency product costing is enabled`);
        }

        // A product that does not track stock can still be bought — it just
        // cannot be received. Refusing here is better than quietly billing for
        // goods the user believes were added to inventory.
        if (input.receiveStock && !product.trackStock) {
          throw new ValidationError(`Stock tracking is disabled for ${product.name} — record it as a description line or enable stock tracking first / تتبع المخزون غير مفعّل لهذا المنتج`);
        }

        const profile = await TaxRepository.requireEffectiveProfile(line.taxProfileId ?? product.taxProfileId, businessDateToPrisma(input.transactionDate), tx);
        const vat = calculateVatLine({
          currency, quotedUnitPrice: line.unitPrice, quantity: line.quantity,
          priceIncludesVat: line.priceIncludesVat ?? false, taxRatePercent: profile.taxRate.ratePercent, taxCode: profile.code,
        });
        lines.push({
          kind: SupplierPurchaseLineKind.PRODUCT,
          productId,
          description: `${product.name} · ${product.sku}`,
          quantity: line.quantity,
          unitPrice: parseMoney(line.unitPrice, currency),
          lineTotal: vat.lineTotalExVat,
          taxRateSnapshot: vat.taxRateSnapshot, taxCodeSnapshot: vat.taxCodeSnapshot,
          unitPriceExVat: vat.unitPriceExVat, vatAmount: vat.vatAmount, lineTotalIncVat: vat.lineTotalIncVat,
          receivesStock: input.receiveStock, currency,
        });
      }

      const stockLines = lines.filter((line) => line.receivesStock);
      let receivingId: string | null = null;
      let itemIdByProductId = new Map<string, string>();
      if (stockLines.length) {
        assertReceivingDateNotFuture(input.transactionDate);
        const posted = await postSupplierReceiving({
          idempotencyKey,
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

      const lineSum = sumMoney(lines.map((line) => line.lineTotalIncVat), currency);
      // The override is the user's stated total; the line sum is still stored on
      // the lines, so an adjusted invoice keeps both numbers visible.
      const amount = assertPositiveMoney(input.amountOverride ?? lineSum, currency);

      const transaction = await SupplierTransactionsRepository.create({
        idempotencyKey,
        supplierId,
        supplierReceivingId: receivingId,
        type: SupplierTransactionType.SUPPLIER_DEBT,
        direction: SupplierTransactionDirection.INCREASE_OWED,
        amount,
        currency,
        exchangeRate,
        baseAmount: toBaseAmount(amount, currency, exchangeRate, Decimal.ROUND_HALF_UP),
        transactionDate: businessDateToPrisma(input.transactionDate),
        description: input.description,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        receiptNumber,
        amountOverride: Boolean(input.amountOverride),
        amountOverrideReason: input.amountOverride ? input.amountOverrideReason ?? null : null,
        createdById: user.userId,
      }, tx);

      const actor = await loadActor(user.userId, tx);
      await updateProductCostsFromPurchase({
        lines,
        supplierTransactionId: transaction.id,
        supplierReceivingId: receivingId,
        receiptNumber,
        user,
        actor,
        context,
      }, tx);

      // The settled portion is a second, ordinary supplier payment rather than a
      // smaller debt: the bill must keep saying what was billed, and the balance
      // still comes from direction and amount exactly as it always has.
      const paid = parseMoney(input.paidAmount ?? '0', currency);
      if (paid.greaterThan(amount)) {
        throw new ValidationError(`Paid amount cannot exceed the purchase total of ${moneyToApiString(amount, currency)} / المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة`);
      }
      if (paid.greaterThan(ZERO_MONEY)) {
        await SupplierTransactionsRepository.create({
          supplierId,
          // A payment may never carry the receiving link; the database enforces it.
          supplierReceivingId: null,
          type: SupplierTransactionType.SUPPLIER_PAYMENT,
          direction: SupplierTransactionDirection.DECREASE_OWED,
          amount: paid,
          currency,
          exchangeRate,
          baseAmount: toBaseAmount(paid, currency, exchangeRate, Decimal.ROUND_HALF_UP),
          transactionDate: businessDateToPrisma(input.transactionDate),
          description: paymentDescription(receiptNumber, moneyToApiString(paid, currency)),
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
          baseUnitPrice: line.unitPrice == null ? null : toBaseAmount(line.unitPrice, currency, exchangeRate, Decimal.ROUND_HALF_UP),
          baseLineTotal: toBaseAmount(line.lineTotal, currency, exchangeRate, Decimal.ROUND_HALF_UP),
          taxRateSnapshot: line.taxRateSnapshot,
          taxCodeSnapshot: line.taxCodeSnapshot,
          unitPriceExVat: line.unitPriceExVat,
          vatAmount: line.vatAmount,
          lineTotalIncVat: line.lineTotalIncVat,
          receivingItemId: line.receivesStock ? receivedItemId(line, itemIdByProductId) : null,
          position,
        }, tx);
      }

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
          amount: moneyToApiString(amount, currency),
          currency,
          exchangeRate: exchangeRate.toFixed(6),
          lineSum: moneyToApiString(lineSum, currency),
          amountOverride: Boolean(input.amountOverride),
          amountOverrideReason: input.amountOverride ? input.amountOverrideReason ?? null : null,
          transactionDate: input.transactionDate,
          supplierReceivingId: receivingId,
          lineCount: lines.length,
          stockLineCount: stockLines.length,
          quickAddedProducts: quickAddCount,
          paidAmount: moneyToApiString(paid, currency),
          paymentReference: paid.greaterThan(ZERO_MONEY) ? input.paymentReference ?? null : null,
          remainingOwed: moneyToApiString(subtractMoney(amount, paid, currency), currency),
        },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      }, tx);

      const created = await SupplierPurchasesRepository.findById(transaction.id, tx);
      if (!created) throw new NotFoundError('Purchase not found after creation');
      return serializePurchase(created);
    }, idempotencyKey ? { maxRetries: 0 } : undefined);
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
        amount: moneyToApiString(match.amount, match.currency ?? Currency.USD),
        transactionDate: prismaDateToBusinessDate(match.transactionDate),
      })),
    };
  }
}

interface PurchaseCostUpdateContext {
  lines: ResolvedLine[];
  supplierTransactionId: string;
  supplierReceivingId: string | null;
  receiptNumber: string | null;
  user: SupplierMutationUser;
  actor: { fullName: string; username: string };
  context: SupplierRequestContext;
}

/**
 * Updates each purchased product once, using the weighted price of every
 * qualifying PRODUCT line in this purchase. This deliberately runs inside the
 * purchase's existing transaction: a later payment, line, or audit failure
 * rolls the product update and its audit back with the rest of the document.
 */
async function updateProductCostsFromPurchase(input: PurchaseCostUpdateContext, tx: Prisma.TransactionClient) {
  const byProduct = new Map<string, { quantity: number; extendedCost: Decimal; lineCount: number; currency: Currency }>();
  for (const line of input.lines) {
    if (line.kind !== SupplierPurchaseLineKind.PRODUCT || !line.productId || line.quantity == null || line.unitPrice == null) continue;
    const current = byProduct.get(line.productId) ?? { quantity: 0, extendedCost: new Decimal(0), lineCount: 0, currency: line.currency };
    current.quantity += line.quantity;
    current.extendedCost = current.extendedCost.plus(line.unitPriceExVat.mul(line.quantity));
    current.lineCount += 1;
    byProduct.set(line.productId, current);
  }

  for (const [productId, weighted] of byProduct) {
    if (weighted.quantity === 0) continue;
    const product = await ProductsRepository.findById(productId, tx);
    if (!product) throw new NotFoundError('Product not found / المنتج غير موجود');
    const nextCost = divideMoney(weighted.extendedCost, new Decimal(weighted.quantity), weighted.currency, Decimal.ROUND_HALF_UP);
    const previousCost = product.costPrice == null ? null : parseMoney(product.costPrice, weighted.currency);
    if (previousCost?.equals(nextCost)) continue;

    const defaultPreset = await ProductsRepository.findActiveDefaultPricingPreset(tx);
    const beforePricing = sellingPriceAuditSnapshot(product, defaultPreset, weighted.currency);
    const afterPricing = sellingPriceAuditSnapshot({ ...product, costPrice: nextCost }, defaultPreset, weighted.currency);
    await ProductsRepository.update(productId, { costPrice: nextCost, updatedById: input.user.userId }, tx);
    await writeServiceAudit({
      recordType: ServiceAuditRecordType.PRODUCT,
      recordId: productId,
      action: ServiceAuditAction.CHANGE_PRICE,
      changedById: input.user.userId,
      changedByName: input.actor.fullName,
      changedByUsername: input.actor.username,
      reason: purchaseCostReason(input.receiptNumber, input.supplierTransactionId),
      beforeValues: {
        costPrice: previousCost ? moneyToApiString(previousCost, weighted.currency) : null,
        ...beforePricing,
      },
      afterValues: {
        costPrice: moneyToApiString(nextCost, weighted.currency),
        ...afterPricing,
        sellingPriceChanged: beforePricing.sellingPrice !== afterPricing.sellingPrice,
        priceCurrency: weighted.currency,
        costSource: 'SUPPLIER_PURCHASE',
        supplierTransactionId: input.supplierTransactionId,
        supplierReceivingId: input.supplierReceivingId,
        receiptNumber: input.receiptNumber,
        weightedQuantity: weighted.quantity,
        weightedLineCount: weighted.lineCount,
      },
      requestId: input.context.requestId,
      ipAddress: input.context.ipAddress,
    }, tx);
  }
}

function sellingPriceAuditSnapshot(
  product: Awaited<ReturnType<typeof ProductsRepository.findById>> & Record<string, unknown>,
  defaultPreset: Awaited<ReturnType<typeof ProductsRepository.findActiveDefaultPricingPreset>>,
  currency: Currency
) {
  if (!product) return { sellingPrice: null, sellingPriceSource: 'UNAVAILABLE', pricingPreset: null };
  if (!usesAutomaticPricing(product as never)) {
    return {
      sellingPrice: product.price == null ? null : moneyToApiString(product.price as never, currency),
      sellingPriceSource: 'MANUAL',
      pricingPreset: null,
      priceIncludesVat: Boolean(product.priceIncludesVat),
    };
  }
  const resolved = resolveProductPricing(product as never, defaultPreset);
  return resolved.pricingAvailable
    ? {
        sellingPrice: resolved.cashPrice,
        sellingPriceSource: resolved.source,
        pricingPreset: resolved.preset ? { id: resolved.preset.id, name: resolved.preset.name } : null,
        priceIncludesVat: Boolean(product.priceIncludesVat),
      }
    : { sellingPrice: null, sellingPriceSource: resolved.reason, pricingPreset: null, priceIncludesVat: Boolean(product.priceIncludesVat) };
}

function purchaseCostReason(receiptNumber: string | null, supplierTransactionId: string): string {
  const purchase = receiptNumber ? `receipt ${receiptNumber}` : `purchase ${supplierTransactionId}`;
  return `Product cost updated from supplier ${purchase} / تحديث كلفة المنتج من ${purchase}`;
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
  currency: Currency,
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
    price: line.sellingPrice ? parseMoney(line.sellingPrice, currency) : null,
    priceCurrency: currency,
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
      price: product.price ? moneyToApiString(product.price, currency) : null,
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
type IdempotentPurchaseRecord = NonNullable<Awaited<ReturnType<typeof SupplierPurchasesRepository.findByIdempotencyKey>>>;

function serializePurchase(purchase: PurchaseRecord) {
  const currency = purchase.currency ?? Currency.USD;
  const lineSum = purchase.purchaseLines.length
    ? sumMoney(purchase.purchaseLines.map((line) => line.lineTotalIncVat ?? line.lineTotal), currency)
    : ZERO_MONEY;
  return {
    ...purchase,
    amount: moneyToApiString(purchase.amount, currency),
    lineSum: moneyToApiString(lineSum, currency),
    transactionDate: prismaDateToBusinessDate(purchase.transactionDate),
    supplierReceiving: purchase.supplierReceiving
      ? { ...purchase.supplierReceiving, receivedOn: prismaDateToBusinessDate(purchase.supplierReceiving.receivedOn) }
      : null,
    purchaseLines: purchase.purchaseLines.map((line) => ({
      ...line,
      unitPrice: line.unitPrice ? moneyToApiString(line.unitPrice, currency) : null,
      lineTotal: moneyToApiString(line.lineTotal, currency),
      taxRateSnapshot: line.taxRateSnapshot?.toFixed(3) ?? '0.000',
      unitPriceExVat: moneyToApiString(line.unitPriceExVat ?? line.unitPrice ?? line.lineTotal, currency),
      vatAmount: moneyToApiString(line.vatAmount ?? ZERO_MONEY, currency),
      lineTotalIncVat: moneyToApiString(line.lineTotalIncVat ?? line.lineTotal, currency),
    })),
  };
}

function serializeIdempotentPurchase(purchase: IdempotentPurchaseRecord) {
  const { audits, ...record } = purchase;
  void audits;
  return serializePurchase(record);
}

async function createIncomingPurchaseFingerprint(
  supplierId: string,
  input: CreateSupplierPurchaseInput,
  idempotencyKey: string,
  createdById: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const currency = input.currency ?? Currency.USD;
  const lines = [];
  const inclusiveTotals: Decimal[] = [];
  for (const line of input.lines) {
    if (line.kind === 'MANUAL') {
      const profile = await TaxRepository.requireEffectiveProfile(line.taxProfileId, businessDateToPrisma(input.transactionDate), tx);
      const vat = calculateVatLine({ currency, quotedUnitPrice: line.amount, quantity: 1, priceIncludesVat: line.priceIncludesVat ?? false, taxRatePercent: profile.taxRate.ratePercent, taxCode: profile.code });
      inclusiveTotals.push(vat.lineTotalIncVat);
      lines.push({
        kind: 'MANUAL',
        description: line.description,
        lineTotal: moneyToApiString(vat.lineTotalExVat, currency),
        taxRateSnapshot: vat.taxRateSnapshot.toFixed(3),
        taxCodeSnapshot: vat.taxCodeSnapshot,
        unitPriceExVat: moneyToApiString(vat.unitPriceExVat, currency),
        vatAmount: moneyToApiString(vat.vatAmount, currency),
        lineTotalIncVat: moneyToApiString(vat.lineTotalIncVat, currency),
      });
      continue;
    }

    const product = line.kind === 'EXISTING_PRODUCT' ? await InventoryRepository.findProduct(line.productId, tx) : null;
    if (line.kind === 'EXISTING_PRODUCT' && !product) throw new NotFoundError('Product not found / المنتج غير موجود');
    const profile = await TaxRepository.requireEffectiveProfile(line.taxProfileId ?? product?.taxProfileId, businessDateToPrisma(input.transactionDate), tx);
    const vat = calculateVatLine({ currency, quotedUnitPrice: line.unitPrice, quantity: line.quantity, priceIncludesVat: line.priceIncludesVat ?? false, taxRatePercent: profile.taxRate.ratePercent, taxCode: profile.code });
    inclusiveTotals.push(vat.lineTotalIncVat);
    const identity = line.kind === 'NEW_PRODUCT'
      ? {
          mode: 'NEW_PRODUCT',
          name: line.name,
          model: line.model,
          barcode: line.barcode ?? null,
          brand: line.brand ?? null,
          sellingPrice: line.sellingPrice ? moneyToApiString(parseMoney(line.sellingPrice, currency), currency) : null,
        }
      : await existingProductIdentity(line.productId, tx);
    lines.push({
      kind: 'PRODUCT',
      identity,
      quantity: line.quantity,
      unitPrice: moneyToApiString(parseMoney(line.unitPrice, currency), currency),
      lineTotal: moneyToApiString(vat.lineTotalExVat, currency),
      taxRateSnapshot: vat.taxRateSnapshot.toFixed(3),
      taxCodeSnapshot: vat.taxCodeSnapshot,
      unitPriceExVat: moneyToApiString(vat.unitPriceExVat, currency),
      vatAmount: moneyToApiString(vat.vatAmount, currency),
      lineTotalIncVat: moneyToApiString(vat.lineTotalIncVat, currency),
      receivesStock: input.receiveStock,
    });
  }

  const lineSum = sumMoney(inclusiveTotals, currency);
  const amount = assertPositiveMoney(input.amountOverride ?? lineSum, currency);
  const paidAmount = parseMoney(input.paidAmount ?? '0', currency);

  return createIdempotencyFingerprint({
    supplierId,
    receiptNumber: input.receiptNumber ?? null,
    transactionDate: input.transactionDate,
    description: input.description,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    receiveStock: input.receiveStock && input.lines.some((line) => line.kind !== 'MANUAL'),
    currency,
    amount: moneyToApiString(amount, currency),
    amountOverride: Boolean(input.amountOverride),
    amountOverrideReason: input.amountOverride ? input.amountOverrideReason ?? null : null,
    paidAmount: moneyToApiString(paidAmount, currency),
    paymentReference: paidAmount.greaterThan(ZERO_MONEY) ? input.paymentReference ?? null : null,
    lines,
    idempotencyKey,
    createdById,
  });
}

function createExistingPurchaseFingerprint(
  purchase: IdempotentPurchaseRecord,
  incoming: CreateSupplierPurchaseInput
): string {
  const currency = purchase.currency ?? Currency.USD;
  const auditValues = jsonObject(purchase.audits[0]?.afterValues);
  const lines = purchase.purchaseLines.map((line, index) => {
    const incomingLine = incoming.lines[index];
    if (line.kind === SupplierPurchaseLineKind.MANUAL || incomingLine?.kind === 'MANUAL') {
      return {
        kind: 'MANUAL',
        description: line.description,
        lineTotal: moneyToApiString(line.lineTotal, currency),
        taxRateSnapshot: line.taxRateSnapshot?.toFixed(3) ?? '0.000',
        taxCodeSnapshot: line.taxCodeSnapshot ?? null,
        unitPriceExVat: moneyToApiString(line.unitPriceExVat ?? line.lineTotal, currency),
        vatAmount: moneyToApiString(line.vatAmount ?? ZERO_MONEY, currency),
        lineTotalIncVat: moneyToApiString(line.lineTotalIncVat ?? line.lineTotal, currency),
      };
    }

    const identity = incomingLine?.kind === 'NEW_PRODUCT'
      ? {
          mode: 'NEW_PRODUCT',
          name: line.product?.name ?? null,
          model: line.product?.model ?? null,
          barcode: line.product?.barcode ?? null,
          brand: line.product?.brand ?? null,
          sellingPrice: line.product?.price ? moneyToApiString(line.product.price, currency) : null,
        }
      : { mode: 'EXISTING_PRODUCT', productId: line.productId };
    return {
      kind: 'PRODUCT',
      identity,
      quantity: line.quantity,
      unitPrice: line.unitPrice ? moneyToApiString(line.unitPrice, currency) : null,
      lineTotal: moneyToApiString(line.lineTotal, currency),
      taxRateSnapshot: line.taxRateSnapshot?.toFixed(3) ?? '0.000',
      taxCodeSnapshot: line.taxCodeSnapshot ?? null,
      unitPriceExVat: moneyToApiString(line.unitPriceExVat ?? line.unitPrice ?? line.lineTotal, currency),
      vatAmount: moneyToApiString(line.vatAmount ?? ZERO_MONEY, currency),
      lineTotalIncVat: moneyToApiString(line.lineTotalIncVat ?? line.lineTotal, currency),
      receivesStock: Boolean(line.receivingItemId),
    };
  });

  return createIdempotencyFingerprint({
    supplierId: purchase.supplierId,
    receiptNumber: purchase.receiptNumber,
    transactionDate: prismaDateToBusinessDate(purchase.transactionDate),
    description: purchase.description,
    reference: purchase.reference,
    notes: purchase.notes,
    receiveStock: Boolean(purchase.supplierReceivingId),
    currency,
    amount: moneyToApiString(purchase.amount, currency),
    amountOverride: purchase.amountOverride,
    amountOverrideReason: purchase.amountOverrideReason,
    paidAmount: typeof auditValues.paidAmount === 'string' ? auditValues.paidAmount : moneyToApiString(ZERO_MONEY, currency),
    paymentReference: typeof auditValues.paymentReference === 'string' ? auditValues.paymentReference : null,
    lines,
    idempotencyKey: purchase.idempotencyKey,
    createdById: purchase.createdById,
  });
}

async function existingProductIdentity(productId: string, tx: Prisma.TransactionClient) {
  const product = await InventoryRepository.findProduct(productId, tx);
  if (!product) throw new NotFoundError('Product not found / المنتج غير موجود');
  return { mode: 'EXISTING_PRODUCT', productId: product.id };
}

function jsonObject(value: Prisma.JsonValue | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}
