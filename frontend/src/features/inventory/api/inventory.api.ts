import { api } from '../../../services/api';
import type {
  CreateStockMovementInput,
  InventoryListFilters,
  InventorySummary,
  LowStockProduct,
  MovementFilters,
  PaginationMeta,
  ProductInventory,
  StockMovement,
  StockMovementResult,
  VerifyOpeningCountInput,
} from '../types/inventory.types';

const paramsFor = (values: object) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));

export const inventoryApi = {
  summary: async (): Promise<InventorySummary> => (await api.get('/inventory/summary')).data.data,
  lowStock: async (filters: InventoryListFilters = {}): Promise<{ items: LowStockProduct[]; pagination: PaginationMeta }> => {
    const response = await api.get('/inventory/low-stock', { params: paramsFor(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  movements: async (filters: MovementFilters = {}): Promise<{ items: StockMovement[]; pagination: PaginationMeta }> => {
    const response = await api.get('/inventory/movements', { params: paramsFor(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  product: async (productId: string): Promise<ProductInventory> =>
    (await api.get(`/products/${productId}/inventory`)).data.data,
  createMovement: async (productId: string, input: CreateStockMovementInput): Promise<StockMovementResult> =>
    (await api.post(`/products/${productId}/stock-movements`, input)).data.data,
  verifyOpeningCount: async (productId: string, input: VerifyOpeningCountInput): Promise<StockMovementResult> =>
    (await api.post(`/products/${productId}/opening-count`, input)).data.data,
};
