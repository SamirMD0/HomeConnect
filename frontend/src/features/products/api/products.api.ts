import { api } from '../../../services/api';
import {
  CreateProductInput,
  Product,
  ProductActionInput,
  ProductAudit,
  ProductDuplicateMatch,
  ProductDuplicateQuery,
  ProductFilters,
  ProductLabelData,
  ProductPaginationMeta,
  ProductServiceJobsResult,
  UpdateProductInput,
  UpdateProductPricingInput, ProductPricingPreview,
  UpdateProductSkuInput, UpdateProductStockInput,
} from '../types/product.types';

const paramsFor = <T extends object>(values: T) => Object.fromEntries(
  Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

export const productsApi = {
  list: async (filters: ProductFilters = {}): Promise<{ items: Product[]; pagination: ProductPaginationMeta }> => {
    const response = await api.get('/products', { params: paramsFor(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  get: async (id: string): Promise<Product> => (await api.get(`/products/${id}`)).data.data,
  create: async (input: CreateProductInput): Promise<Product> => (await api.post('/products', input)).data.data,
  update: async (id: string, input: UpdateProductInput): Promise<Product> => (await api.patch(`/products/${id}`, input)).data.data,
  archive: async (id: string, input: ProductActionInput): Promise<Product> => (await api.post(`/products/${id}/archive`, input)).data.data,
  restore: async (id: string, input: ProductActionInput): Promise<Product> => (await api.post(`/products/${id}/restore`, input)).data.data,
  label: async (id: string, includePriceCode = false, includePrice = true): Promise<ProductLabelData> => (await api.get(`/products/${id}/label`, { params: { includePriceCode, includePrice } })).data.data,
  updateSku: async (id: string, input: UpdateProductSkuInput): Promise<Product> => (await api.patch(`/products/${id}/sku`, input)).data.data,
  regenerateSku: async (id: string, input: ProductActionInput): Promise<Product> => (await api.post(`/products/${id}/regenerate-sku`, input)).data.data,
  updateStock: async (id: string, input: UpdateProductStockInput): Promise<Product> => (await api.patch(`/products/${id}/stock`, input)).data.data,
  audit: async (id: string, page = 1, pageSize = 50): Promise<ProductAudit[]> =>
    (await api.get(`/products/${id}/audit`, { params: { page, pageSize } })).data.data,
  checkDuplicate: async (query: ProductDuplicateQuery): Promise<ProductDuplicateMatch[]> =>
    (await api.get('/products/check-duplicate', { params: paramsFor(query) })).data.data.matches,
  serviceJobs: async (id: string, page = 1, pageSize = 10): Promise<ProductServiceJobsResult> => {
    const response = await api.get(`/products/${id}/service-jobs`, { params: { page, pageSize } });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  // The image endpoint is authenticated, so bytes must come through axios rather
  // than a bare <img src>, which cannot send the Bearer token.
  imageBlob: async (id: string): Promise<Blob> =>
    (await api.get(`/products/${id}/image`, { responseType: 'blob' })).data,
  uploadImage: async (id: string, file: File): Promise<Product> =>
    (await api.put(`/products/${id}/image`, file, { headers: { 'Content-Type': file.type } })).data.data,
  removeImage: async (id: string): Promise<Product> => (await api.delete(`/products/${id}/image`)).data.data,
  pricingPreview: async (id:string,installmentMonths?:number):Promise<ProductPricingPreview> => (await api.get(`/products/${id}/pricing-preview`,{params:{installmentMonths}})).data.data,
  updatePricing: async(id:string,input:UpdateProductPricingInput):Promise<Product> => (await api.patch(`/products/${id}/pricing`,input)).data.data,
};
