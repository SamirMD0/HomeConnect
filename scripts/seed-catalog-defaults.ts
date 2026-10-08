import '../backend/src/load-env';
import { prisma } from '../backend/src/lib/prisma';
import { seedDefaultCategories, removeUnusedCsvFamilyCategories } from '../backend/src/features/categories/category-defaults';
import { DEFAULT_PRODUCT_BRANDS } from '../backend/src/features/service/products/product-catalog-defaults';

seedDefaultCategories(prisma)
  .then(async (created) => {
    const removed = process.argv.includes('--replace-families') ? await removeUnusedCsvFamilyCategories(prisma) : { count: 0 };
    console.log(JSON.stringify({ createdCategories: created, removedEmptyFamilies: removed.count, defaultBrands: DEFAULT_PRODUCT_BRANDS.length }));
  })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
