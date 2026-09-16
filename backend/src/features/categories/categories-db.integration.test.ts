import { isIsolatedTestDatabase } from '../../test/database';
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CategoriesService } from './categories.service';
import { validateHierarchy } from './category-hierarchy';
import { ProductsService } from '../service/products/products.service';
import {
  createProductSchema,
  productListQuerySchema,
} from '../service/products/products.validator';


const describeDb =
  process.env.RUN_INVENTORY_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL)
    ? describe
    : describe.skip;
const db = new PrismaClient();
let userId: string;
let prefix: string;
let ids: string[];
const user = () => ({ userId, role: Role.ADMIN, username: prefix });
const create = async (name: string, parentId: string | null = null) => {
  const row = await CategoriesService.create(
    { name: `${prefix} ${name}`, parentId, isActive: true },
    user()
  );
  ids.push(row.id);
  return row;
};
const product = (categoryId?: string | null) =>
  ProductsService.create(
    createProductSchema.parse({
      name: `${prefix} Product`,
      model: randomUUID(),
      price: '50.00',
      categoryId,
    }),
    user(),
    {}
  );
const list = (categoryId?: string) =>
  ProductsService.list(
    productListQuerySchema.parse({ search: prefix, categoryId, pageSize: 100 }),
    user()
  );

describeDb('product category database integration', () => {
  beforeEach(async () => {
    userId = randomUUID();
    prefix = `category-${randomUUID()}`;
    ids = [];
    await db.user.create({
      data: {
        id: userId,
        username: prefix,
        fullName: 'Category Admin',
        password: 'unused',
        role: Role.ADMIN,
      },
    });
  });
  afterEach(async () => {
    await db.serviceAudit.deleteMany({ where: { changedById: userId } });
    await db.product.deleteMany({ where: { createdById: userId } });
    // Children first, including arbitrary successful reparent order. Test-owned IDs only.
    const pending = new Map(
      (await db.category.findMany({ where: { id: { in: ids } } })).map((row) => [row.id, row])
    );
    while (pending.size) {
      const leaves = [...pending.values()].filter(
        (row) => ![...pending.values()].some((child) => child.parentId === row.id)
      );
      if (!leaves.length) throw new Error('Unexpected cycle in test-owned category cleanup');
      await db.category.deleteMany({ where: { id: { in: leaves.map((row) => row.id) } } });
      leaves.forEach((row) => pending.delete(row.id));
    }
    await db.user.delete({ where: { id: userId } });
  });
  afterAll(() => db.$disconnect());

  it('serializes concurrent duplicate names so exactly one category is created', async () => {
    const outcomes = await Promise.allSettled([create('Duplicate'), create('Duplicate')]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const failed = outcomes.find(
      (outcome) => outcome.status === 'rejected'
    ) as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ statusCode: 409 });
    expect(await db.category.count({ where: { id: { in: ids } } })).toBe(1);
  });
  it('cannot create a cycle through concurrent reparenting', async () => {
    const a = await create('Root A');
    const b = await create('Root B');
    const outcomes = await Promise.allSettled([
      CategoriesService.update(a.id, { parentId: b.id }, user()),
      CategoriesService.update(b.id, { parentId: a.id }, user()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rows = await db.category.findMany({ where: { id: { in: ids } } });
    expect(() => validateHierarchy(rows)).not.toThrow();
  });

  it('creates/reads/renames/reparents/deactivates/deletes English categories', async () => {
    const root = await create('Home Appliances');
    const leaf = await create('TV');
    const updated = await CategoriesService.update(
      leaf.id,
      { name: `${prefix} Cookers`, parentId: root.id },
      user()
    );
    expect(updated.path).toBe(`${root.name} → ${prefix} Cookers`);
    expect((await CategoriesService.list()).find((r) => r.id === leaf.id)?.name).toBe(
      `${prefix} Cookers`
    );
    await CategoriesService.update(leaf.id, { isActive: false }, user());
    expect((await CategoriesService.get(leaf.id)).isActive).toBe(false);
    await CategoriesService.remove(leaf.id, user());
    await expect(CategoriesService.get(leaf.id)).rejects.toMatchObject({ statusCode: 404 });
    await CategoriesService.remove(root.id, user());
  });
  it('assigns products without changing price, VAT, or stock and filters descendants/uncategorized', async () => {
    const root = await create('Home Appliances');
    const kitchen = await create('Kitchen', root.id);
    const cookers = await create('Cookers', kitchen.id);
    const assigned = await product(cookers.id);
    const empty = await product();
    expect(assigned.categoryPath).toBe(`${root.name} → ${kitchen.name} → ${cookers.name}`);
    expect((await list(root.id)).items.map((r) => r.id)).toEqual([assigned.id]);
    expect((await list(kitchen.id)).total).toBe(1);
    expect((await list('uncategorized')).items.map((r) => r.id)).toEqual([empty.id]);
    expect((await list()).total).toBe(2);
    const before = await db.product.findUniqueOrThrow({ where: { id: empty.id } });
    await ProductsService.update(empty.id, { categoryId: cookers.id }, user(), {});
    const after = await db.product.findUniqueOrThrow({ where: { id: empty.id } });
    expect(after.price?.toString()).toBe(before.price?.toString());
    expect(after.stockQuantity).toBe(before.stockQuantity);
    expect(after.priceIncludesVat).toBe(before.priceIncludesVat);
    expect(after.priceCurrency).toBe(before.priceCurrency);
    expect(after.taxProfileId).toBe(before.taxProfileId);
    const audit = await db.serviceAudit.findFirstOrThrow({
      where: { recordId: empty.id, action: 'UPDATE_DETAILS' },
    });
    expect(audit.afterValues).toMatchObject({ categoryId: cookers.id });
    await ProductsService.update(empty.id, { categoryId: null }, user(), {});
    expect((await list('uncategorized')).total).toBe(1);
  });
  it('blocks deleting categories with products or children, including direct DB deletion', async () => {
    const root = await create('Root');
    const leaf = await create('Leaf', root.id);
    await product(leaf.id);
    await expect(CategoriesService.remove(root.id, user())).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(CategoriesService.remove(leaf.id, user())).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(db.category.delete({ where: { id: leaf.id } })).rejects.toThrow(
      /products_categoryId_fkey/
    );
    await expect(db.category.delete({ where: { id: root.id } })).rejects.toThrow(
      /categories_parentId_fkey/
    );
  });
  it('requires ADMIN writes and blocks cycles, depth overflow, and inactive new assignments', async () => {
    const root = await create('Root');
    const child = await create('Child', root.id);
    const leaf = await create('Leaf', child.id);
    await expect(
      CategoriesService.create(
        { name: 'Forbidden', isActive: true },
        { ...user(), role: Role.EMPLOYEE }
      )
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      CategoriesService.update(root.id, { parentId: leaf.id }, user())
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      CategoriesService.create(
        { name: `${prefix} Fourth`, parentId: leaf.id, isActive: true },
        user()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    const existing = await product(leaf.id);
    await CategoriesService.update(root.id, { isActive: false }, user());
    await expect(product(leaf.id)).rejects.toMatchObject({ statusCode: 400 });
    expect((await ProductsService.get(existing.id, user())).categoryId).toBe(leaf.id);
    await ProductsService.update(existing.id, { categoryId: leaf.id }, user(), {});
    await expect(
      ProductsService.update(
        existing.id,
        { categoryId: null },
        { ...user(), role: Role.EMPLOYEE },
        {}
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rejects case-insensitive duplicate sibling names but allows separate branches', async () => {
    const first = await create('Root');
    const second = await create('Other');
    await create('Kitchen', first.id);
    await expect(
      CategoriesService.create(
        { name: `${prefix} kitchen`, parentId: first.id, isActive: true },
        user()
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    await create('Kitchen', second.id);
  });
});
