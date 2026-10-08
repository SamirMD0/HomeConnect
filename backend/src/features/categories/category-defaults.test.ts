import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { seedDefaultCategories } from './category-defaults';
import { PRODUCT_CATEGORY_FAMILIES } from '../service/products/product-category-detection';

type Row = { id: string; name: string; parentId: string | null };
function categoryClient(initial: Row[]) {
  const rows = initial.map((row) => ({ ...row }));
  const create = vi.fn(async ({ data }: { data: { name: string; parentId?: string } }) => {
    const row = { id: `created-${rows.length}`, name: data.name, parentId: data.parentId ?? null };
    rows.push(row);
    return { ...row };
  });
  const update = vi.fn(
    async ({ where, data }: { where: { id: string }; data: { parentId: string } }) => {
      const row = rows.find((row) => row.id === where.id)!;
      row.parentId = data.parentId;
      return { ...row };
    }
  );
  const client = {
    $transaction: (work: (tx: unknown) => unknown) =>
      work({
        category: {
          findMany: vi.fn(async () => rows.map((row) => ({ ...row }))),
          create,
          update,
        },
      }),
  } as unknown as PrismaClient;
  return { client, rows, create, update };
}

describe('catalog seeding', () => {
  it('moves flat categories into logical families while preserving IDs and names', async () => {
    const { client, rows, update } = categoryClient([
      { id: 'dryer', name: 'hair dryers', parentId: null },
      { id: 'ac', name: 'Air Conditioners', parentId: null },
      { id: 'legacy-ref', name: 'REFRIGERATOR', parentId: null },
    ]);
    await seedDefaultCategories(client);
    const familyOf = (id: string) =>
      rows.find((row) => row.id === rows.find((row) => row.id === id)?.parentId)?.name;
    expect(familyOf('dryer')).toBe('Beauty');
    expect(familyOf('ac')).toBe('Home Appliances');
    expect(familyOf('legacy-ref')).toBe('Home Appliances');
    expect(rows.find((row) => row.id === 'dryer')?.name).toBe('hair dryers');
    expect(update).toHaveBeenCalledTimes(3);
    for (const [family, types] of Object.entries(PRODUCT_CATEGORY_FAMILIES)) {
      const parent = rows.find((row) => row.name === family && row.parentId === null)!;
      expect(
        rows
          .filter((row) => row.parentId === parent.id && row.id !== 'legacy-ref')
          .map((row) => row.name.toLowerCase())
          .sort()
      ).toEqual(types.map((name) => name.toLowerCase()).sort());
    }
  });
  it('does nothing once all defaults exist', async () => {
    const { client, create, update } = categoryClient([]);
    await seedDefaultCategories(client);
    create.mockClear();
    update.mockClear();
    expect(await seedDefaultCategories(client)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
