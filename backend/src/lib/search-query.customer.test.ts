import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSearchTerm, tokenizeSearchTerm } from './search-normalize';

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }));

vi.mock('./prisma', () => ({
  prisma: { $queryRaw: queryRawMock },
}));

import { findSearchMatchIds } from './search-query';

interface SqlShape {
  sql?: string;
  text?: string;
  strings?: string[];
  values: unknown[];
}

function statementText(query: SqlShape): string {
  return query.sql ?? query.text ?? query.strings?.join('?') ?? '';
}

function exactNameTokenMatch(name: string, query: string): boolean {
  const normalizedName = normalizeSearchTerm(name);
  return tokenizeSearchTerm(query).every((token) => normalizedName.includes(token));
}

describe('customer token search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([{ id: 'customer-1' }]);
  });

  it.each([
    ['محمد عمار', 'محمد سالم عمار'],
    ['عمار محمد', 'محمد سالم عمار'],
    ['سالم عمار', 'محمد سالم عمار'],
    ['Ahmad Ammar', 'Ahmad Mohammad Ammar'],
    ['  محمد   عمار  ', 'محمد سالم عمار'],
    ['إحمَد عَمّـار', 'احمد سالم عمار'],
  ])('matches every normalized token in %j against %j', (query, customerName) => {
    expect(exactNameTokenMatch(customerName, query)).toBe(true);
  });

  it('does not match when any query token is unrelated', () => {
    expect(exactNameTokenMatch('محمد سالم عمار', 'محمد خليل')).toBe(false);
  });

  it('builds one parameterized matcher per token and joins customer tokens with AND', async () => {
    await expect(findSearchMatchIds('customer', '  محمد   عمار  ')).resolves.toEqual(['customer-1']);

    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    const sql = statementText(statement);
    // One AND applies the live-row filter; another must join the two token groups.
    expect(sql.match(/ AND /g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).not.toContain('محمد');
    expect(sql).not.toContain('عمار');
    expect(statement.values).toEqual(expect.arrayContaining(['محمد', 'عمار']));
  });

  it.each([
    ['address', 'طرابلس'],
    ['notes', 'ضمان'],
  ])('builds a parameterized customer matcher for %s', async (column, rawTerm) => {
    await expect(findSearchMatchIds('customer', rawTerm)).resolves.toEqual(['customer-1']);

    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    const sql = statementText(statement);
    expect(sql).toContain(`hc_search_normalize(${column})`);
    expect(sql).not.toContain(rawTerm);
    expect(statement.values).toContain(normalizeSearchTerm(rawTerm));
  });

  it('keeps the provenance target restricted to customer name and phone', async () => {
    await findSearchMatchIds('customerNamePhone', '7012');

    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    const sql = statementText(statement);
    expect(sql).toContain('hc_search_normalize(name)');
    expect(sql).toContain('hc_phone_normalize(phone)');
    expect(sql).not.toContain('hc_search_normalize(address)');
    expect(sql).not.toContain('hc_search_normalize(notes)');
  });

  it.each([
    ['123456', '123456'],
    ['+961 (70) 123456', '96170123456'],
  ])('keeps phone query %j whole and searches digit substring %j', async (query, digits) => {
    await findSearchMatchIds('customer', query);

    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    expect(statement.values).toContain(digits);
    expect(statementText(statement)).toContain('hc_phone_normalize');
    expect(statementText(statement)).not.toMatch(/hc_phone_normalize\([^)]*\)\s+%/);
  });

  it('binds injection-like input instead of interpolating it into SQL', async () => {
    const malicious = "محمد' OR 1=1 --";
    await findSearchMatchIds('customer', malicious);

    const statement = queryRawMock.mock.calls[0][0] as SqlShape;
    expect(statementText(statement)).not.toContain(malicious);
    expect(statement.values).toContain("محمد'");
  });
});
