export const salesOrderCreateUrl = (productId: string) =>
  `/sales-orders?action=add&productId=${encodeURIComponent(productId)}`;
