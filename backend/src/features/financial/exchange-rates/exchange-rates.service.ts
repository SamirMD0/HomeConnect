import { Currency, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ValidationError } from '../../../lib/errors';
import { parseExchangeRate } from '../domain/money';
import { ExchangeRatesRepository } from './exchange-rates.repository';
import type { CreateExchangeRateInput } from './exchange-rates.validator';

export class ExchangeRatesService {
  static async create(input: CreateExchangeRateInput, createdById: string) {
    const rate = parseExchangeRate(input.rate);
    try {
      return serialize(await ExchangeRatesRepository.create({
        fromCurrency: Currency.USD,
        toCurrency: Currency.LBP,
        rate,
        effectiveFrom: new Date(input.effectiveFrom),
        createdById,
        note: input.note ?? null,
      }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError('An exchange rate already exists at that effective time');
      }
      throw error;
    }
  }

  static async list() {
    return Promise.all((await ExchangeRatesRepository.list()).map(serialize));
  }

  static async snapshotFor(currency: Currency, effectiveAt: Date, tx?: Prisma.TransactionClient) {
    if (currency === Currency.USD) return new Decimal(1);
    const record = await ExchangeRatesRepository.applicable(effectiveAt, tx);
    if (!record) throw new ValidationError('No USD to LBP exchange rate is effective for this date');
    return record.rate;
  }
}

function serialize(record: Awaited<ReturnType<typeof ExchangeRatesRepository.create>>) {
  return {
    ...record,
    rate: record.rate.toFixed(6),
    effectiveFrom: record.effectiveFrom.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}
