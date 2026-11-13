import type {
  ProductRead,
  InventoryRead,
  StockMovementRead,
  BrandRead,
  CategoryRead,
} from '@shared/lookup-contracts';
import { lookupGet } from './lookup-http';
import type { AuthedClient } from './hc-client';
import { serverPage, LOOKUP_PAGE_SIZE } from '../lookup/pagination';
/** Same reads as products.api.ts, inventory.api.ts and categories.ts on desktop. */
export interface ProductLookupFilters {
  search?: string;
  brand?: string;
  categoryId?: string;
  isActive?: boolean;
}
export async function listProducts(client: AuthedClient, filters: ProductLookupFilters, page = 1) {
  return serverPage(
    await lookupGet<ProductRead[]>(client, '/products', {
      ...filters,
      page,
      pageSize: LOOKUP_PAGE_SIZE,
      sortBy: 'name',
      sortOrder: 'asc',
    }),
    page
  );
}
export const getProduct = (client: AuthedClient, id: string) =>
  lookupGet<ProductRead>(client, `/products/${encodeURIComponent(id)}`);
export const getInventory = (client: AuthedClient, id: string) =>
  lookupGet<InventoryRead>(client, `/products/${encodeURIComponent(id)}/inventory`);
export async function listMovements(client: AuthedClient, productId: string, page = 1) {
  return serverPage(
    await lookupGet<StockMovementRead[]>(client, '/inventory/movements', {
      productId,
      page,
      pageSize: LOOKUP_PAGE_SIZE,
    }),
    page
  );
}
export async function getBrands(client: AuthedClient) {
  return (await lookupGet<{ brands: BrandRead[] }>(client, '/products/brands')).brands;
}
export const getCategories = (client: AuthedClient) =>
  lookupGet<CategoryRead[]>(client, '/categories');
