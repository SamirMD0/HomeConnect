import { describe, expect, it } from 'vitest';
import {
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from './categories.validator';
import { productListQuerySchema } from '../service/products/products.validator';

const upper = 'ABCDEFAB-1234-4123-8123-123456789ABC';
describe('English category validation', () => {
  it('has one editable name, accepts uncategorized roots and trims user text', () => {
    expect(createCategorySchema.parse({ name: ' Kitchen ', parentId: null })).toEqual({
      name: 'Kitchen',
      parentId: null,
    });
    expect(createCategorySchema.safeParse({ name: 'Kitchen', nameAr: 'مطبخ' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: '<script>x</script>' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
  });
  it('canonicalizes valid UUID casing for tree comparisons and filters', () => {
    expect(createCategorySchema.parse({ name: 'Cookers', parentId: upper }).parentId).toBe(
      upper.toLowerCase()
    );
    expect(categoryParamsSchema.parse({ categoryId: upper }).categoryId).toBe(upper.toLowerCase());
    expect(productListQuerySchema.parse({ categoryId: upper }).categoryId).toBe(
      upper.toLowerCase()
    );
  });
});
