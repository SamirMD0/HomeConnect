import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export const salesReturnInclude = {
  salesOrder: { select: { id: true, orderNumber: true, orderDate: true } },
  customer: { select: { id: true, name: true, phone: true, address: true } },
  processedBy: { select: { id: true, fullName: true, username: true } },
  items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  receivableAllocations: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  cashRefund: true,
  customerCredit: true,
} satisfies Prisma.SalesReturnInclude;

export type SalesReturnRecord = Prisma.SalesReturnGetPayload<{ include: typeof salesReturnInclude }>;

export class SalesReturnsRepository {
  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).salesReturn.findUnique({ where: { id }, include: salesReturnInclude });
  }

  static findByIdempotencyKey(key: string, tx: Prisma.TransactionClient) {
    return tx.salesReturn.findUnique({ where: { idempotencyKey: key }, include: salesReturnInclude });
  }

  static loadOrder(id: string, tx: Prisma.TransactionClient) {
    return tx.salesOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, trackStock: true, stockQuantity: true } },
            stockFulfillments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            returnItems: { select: { quantity: true, discountAmount: true, subtotalExVat: true, vatAmount: true, totalIncVat: true, baseSubtotalExVat: true, baseVatAmount: true, baseTotalIncVat: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        returns: {
          select: { id: true, deliveryReturned: true, totalIncVat: true },
          orderBy: { sequence: 'asc' },
        },
        debt: {
          include: {
            paymentAllocations: { include: { payment: { select: { voidedAt: true } } } },
            returnAllocations: true,
          },
        },
        installmentPlan: {
          include: {
            installments: {
              include: {
                paymentAllocations: { include: { payment: { select: { voidedAt: true } } } },
                returnAllocations: true,
              },
              orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
  }

  static findSettings(tx: Prisma.TransactionClient) {
    return tx.businessSettings.findUnique({ where: { id: 'primary' } });
  }

  static findActor(id: string, tx: Prisma.TransactionClient) {
    return tx.user.findUnique({ where: { id }, select: { id: true, fullName: true, username: true } });
  }

  static createHeader(data: Prisma.SalesReturnUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.salesReturn.create({ data });
  }

  static createItem(data: Prisma.SalesReturnItemUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.salesReturnItem.create({ data });
  }
}
