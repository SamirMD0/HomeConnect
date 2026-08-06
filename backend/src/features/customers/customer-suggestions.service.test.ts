import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRawMock, findIdsMock } = vi.hoisted(() => ({ queryRawMock: vi.fn(), findIdsMock: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: queryRawMock } }));
vi.mock('../../lib/search-query', () => ({ findSearchMatchIds: findIdsMock }));
import { CustomerSuggestionsService } from './customer-suggestions.service';

describe('CustomerSuggestionsService', () => {
  beforeEach(() => { vi.clearAllMocks(); findIdsMock.mockResolvedValue([]); });

  it('returns a parameterized, validated name suggestion for a zero-result typo', async () => {
    queryRawMock.mockResolvedValue([{ query: 'احمد', score: 0.8 }]);
    findIdsMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['customer-1']);
    await expect(CustomerSuggestionsService.suggest('اخمد')).resolves.toEqual([{ query: 'احمد', count: 1 }]);
    const statement = queryRawMock.mock.calls[0][0];
    expect((statement.sql ?? statement.text ?? statement.strings?.join('?'))).not.toContain('اخمد');
    expect(statement.values).toContain('اخمد');
  });

  it('does not suggest when the primary search matched', async () => {
    findIdsMock.mockResolvedValue(['customer-1']);
    await expect(CustomerSuggestionsService.suggest('احمد')).resolves.toEqual([]);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('never suggests for phone-shaped queries', async () => {
    await expect(CustomerSuggestionsService.suggest('70123')).resolves.toEqual([]);
    expect(findIdsMock).not.toHaveBeenCalled();
  });
});
