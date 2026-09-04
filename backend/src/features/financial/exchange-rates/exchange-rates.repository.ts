import { Currency, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const exchangeRateInclude = {
  createdBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.ExchangeRateInclude;

export class ExchangeRatesRepository {
  static create(data: Prisma.ExchangeRateUncheckedCreateInput) {
    return prisma.exchangeRate.create({ data, include: exchangeRateInclude });
  }

  static list() {
    return prisma.exchangeRate.findMany({
      where: { fromCurrency: Currency.USD, toCurrency: Currency.LBP },
      include: exchangeRateInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static applicable(effectiveAt: Date, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).exchangeRate.findFirst({
      where: {
        fromCurrency: Currency.USD,
        toCurrency: Currency.LBP,
        effectiveFrom: { lte: effectiveAt },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
