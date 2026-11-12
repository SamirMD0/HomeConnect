export interface QueryScope {
  server: string;
  userId: string;
  branchId: string;
}
const scopeKey = (scope: QueryScope) =>
  ['erp', scope.server, scope.userId, scope.branchId] as const;
export const queryKeys = {
  all: ['erp'] as const,
  scope: scopeKey,
  lookup: (scope: QueryScope, resource: string, params: object = {}) =>
    [...scopeKey(scope), 'lookup', resource, params] as const,
  suppliers: (scope: QueryScope) => [...scopeKey(scope), 'suppliers'] as const,
  pendingBills: (scope: QueryScope) => [...scopeKey(scope), 'pending-bills'] as const,
  product: (scope: QueryScope, id: string) => [...scopeKey(scope), 'products', id] as const,
  customers: (scope: QueryScope, search = '') =>
    [...scopeKey(scope), 'customers', { search }] as const,
};
