import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_PRODUCT_CATEGORIES,
  CSV_PRODUCT_FAMILIES,
} from '../service/products/product-catalog-defaults';
import {
  PRODUCT_CATEGORY_FAMILIES,
  detectProductCategory,
  productCategoryFamily,
} from '../service/products/product-category-detection';

/** Organizes default product types below their logical family, preserving IDs. */
export async function seedDefaultCategories(client: PrismaClient) {
  return client.$transaction(
    async (tx) => {
      const existing = await tx.category.findMany({
        select: { id: true, name: true, parentId: true },
      });
      const normalize = (name: string) => name.trim().toLocaleUpperCase('en-US');
      const created: string[] = [];
      for (const [familyName, types] of Object.entries(PRODUCT_CATEGORY_FAMILIES)) {
        let family = existing.find(
          (row) =>
            row.parentId === null &&
            normalize(row.name) === normalize(familyName) &&
            !DEFAULT_PRODUCT_CATEGORIES.includes(row.name)
        );
        if (!family) {
          family = await tx.category.create({ data: { name: familyName } });
          existing.push(family);
          created.push(familyName);
        }
        for (const name of types) {
          const child = existing.find(
            (row) => row.parentId === family.id && normalize(row.name) === normalize(name)
          );
          if (child) continue;
          const root = existing.find(
            (row) =>
              row.parentId === null &&
              normalize(row.name) === normalize(name) &&
              row.id !== family.id
          );
          if (root) {
            await tx.category.update({ where: { id: root.id }, data: { parentId: family.id } });
            root.parentId = family.id;
          } else {
            const row = await tx.category.create({ data: { name, parentId: family.id } });
            existing.push(row);
            created.push(`${familyName} → ${name}`);
          }
        }
      }
      // Older catalogs may use singular names such as REFRIGERATOR. Keep their
      // IDs and attached products, but place these categories below a family too.
      for (const row of existing.filter((row) => row.parentId === null)) {
        if (
          Object.keys(PRODUCT_CATEGORY_FAMILIES).some(
            (family) => normalize(family) === normalize(row.name)
          )
        )
          continue;
        const type = detectProductCategory(row.name);
        const familyName = type ? productCategoryFamily(type) : null;
        const family = existing.find(
          (candidate) => candidate.parentId === null && candidate.name === familyName
        );
        if (family)
          await tx.category.update({ where: { id: row.id }, data: { parentId: family.id } });
      }
      return created;
    },
    { timeout: 30_000 }
  );
}

/** Removes only empty family placeholders created by the earlier default seed. */
export async function removeUnusedCsvFamilyCategories(client: PrismaClient) {
  return client.category.deleteMany({
    where: {
      parentId: null,
      name: { in: [...CSV_PRODUCT_FAMILIES] },
      products: { none: {} },
      children: { none: {} },
    },
  });
}
