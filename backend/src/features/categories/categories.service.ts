import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError, NotFoundError, ValidationError } from '../../lib/errors';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { assertServiceAdmin } from '../service/authorization/service-policy';
import { CategoriesRepository } from './categories.repository';
import {
  categoryPath,
  descendantIds,
  validateHierarchy,
  type CategoryNode,
} from './category-hierarchy';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from './categories.validator';

export class CategoriesService {
  static async list() {
    return (await CategoriesRepository.list()).map((row) => ({
      ...row,
      path: categoryPath(row),
      level: row.parent ? (row.parent.parent ? 3 : 2) : 1,
      assignable:
        row.isActive && (row.parent?.isActive ?? true) && (row.parent?.parent?.isActive ?? true),
      productCount: row._count.products,
      childCount: row._count.children,
    }));
  }
  static async get(id: string) {
    const row = await CategoriesRepository.find(id);
    if (!row) throw new NotFoundError('Category not found');
    return { ...row, path: categoryPath(row) };
  }
  static async create(input: CreateCategoryInput, user: { role: string }) {
    assertServiceAdmin(user);
    const values = createCategorySchema.parse(input);
    return runFinancialTransaction(async (tx) => {
      const rows = await CategoriesRepository.list(tx);
      const data = {
        id: randomUUID(),
        name: values.name,
        parentId: values.parentId ?? null,
        isActive: values.isActive ?? true,
      };
      assertUniqueSibling(rows, data);
      validateHierarchy([...rows, data]);
      const row = await CategoriesRepository.create(data, tx);
      return { ...row, path: categoryPath(row) };
    }).catch(mapCategoryError);
  }
  static async update(id: string, input: UpdateCategoryInput, user: { role: string }) {
    assertServiceAdmin(user);
    id = id.toLowerCase();
    const values = updateCategorySchema.parse(input);
    return runFinancialTransaction(async (tx) => {
      const rows = await CategoriesRepository.list(tx);
      const existing = rows.find((row) => row.id === id);
      if (!existing) throw new NotFoundError('Category not found');
      const data = { ...existing, ...values };
      assertUniqueSibling(rows, data);
      validateHierarchy(rows.map((row) => (row.id === id ? data : row)));
      const row = await CategoriesRepository.update(id, values, tx);
      return { ...row, path: categoryPath(row) };
    }).catch(mapCategoryError);
  }
  static async remove(id: string, user: { role: string }) {
    assertServiceAdmin(user);
    try {
      return await runFinancialTransaction(async (tx) => {
        const row = await CategoriesRepository.find(id, tx);
        if (!row) throw new NotFoundError('Category not found');
        if (row._count.products || row._count.children) throw inUse();
        await CategoriesRepository.remove(id, tx);
        return { id };
      });
    } catch (error) {
      return mapCategoryError(error);
    }
  }
  static async assertAssignable(id: string, tx: Prisma.TransactionClient) {
    const row = await CategoriesRepository.find(id, tx);
    if (!row) throw new ValidationError('Category not found');
    if (!row.isActive || row.parent?.isActive === false || row.parent?.parent?.isActive === false)
      throw new ValidationError('Category or parent is inactive');
  }
  static async filterIds(id: string) {
    return descendantIds(await CategoriesRepository.list(), id.toLowerCase());
  }
}

function assertUniqueSibling(rows: CategoryNode[], data: CategoryNode) {
  if (
    rows.some(
      (row) =>
        row.id !== data.id &&
        row.parentId === data.parentId &&
        row.name.toLowerCase() === data.name.toLowerCase()
    )
  )
    throw new AppError('A sibling category already uses this name', 409, 'CATEGORY_NAME_CONFLICT');
}
const inUse = () =>
  new AppError(
    'Category has products or child categories; deactivate it instead',
    409,
    'CATEGORY_IN_USE'
  );
function mapCategoryError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') throw inUse();
    if (error.code === 'P2002')
      throw new AppError(
        'A sibling category already uses this name',
        409,
        'CATEGORY_NAME_CONFLICT'
      );
  }
  // PostgreSQL RESTRICT (23001) can surface as an unknown Prisma connector error.
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /(?:products_categoryId_fkey|categories_parentId_fkey)/.test(error.message)
  )
    throw inUse();
  throw error;
}
