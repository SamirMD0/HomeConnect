import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: { $queryRaw: queryRawMock } }));

import { findSearchMatchIds } from './search-query';

interface SqlShape { sql?: string; text?: string; strings?: string[]; values: unknown[] }
const statementText = (query: SqlShape) => query.sql ?? query.text ?? query.strings?.join('?') ?? '';

describe('product token search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([{ id: 'product-1' }]);
  });

  it('requires every product query token while allowing different columns to satisfy them', async () => {
    await expect(findSearchMatchIds('product', 'no frost fridge')).resolves.toEqual(['product-1']);
    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    expect(statementText(statement).match(/ AND /g)?.length).toBeGreaterThanOrEqual(2);
    expect(statement.values).toEqual(expect.arrayContaining(['no', 'frost', 'fridge']));
    expect(statementText(statement)).toContain('specifications::text');
    expect(statementText(statement)).toContain('"specificationNotes"');
  });

  it('emits compact and spaced alternatives for a unit token', async () => {
    await findSearchMatchIds('product', '15kg washer');
    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    expect(statement.values).toEqual(expect.arrayContaining(['15kg', '15 kg', 'washer']));
  });

  it('binds escaped percent and underscore terms literally', async () => {
    await findSearchMatchIds('product', '50% model_x');
    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    expect(statement.values).toEqual(expect.arrayContaining(['50\\%', 'model\\_x']));
    expect(statementText(statement)).not.toContain('50%');
    expect(statementText(statement)).not.toContain('model_x');
  });

  it('returns an empty id set without changing its shape', async () => {
    queryRawMock.mockResolvedValue([]);
    await expect(findSearchMatchIds('product', 'unmatchable token')).resolves.toEqual([]);
  });
});
