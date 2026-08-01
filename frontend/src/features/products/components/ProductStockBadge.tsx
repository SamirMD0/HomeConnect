import React from 'react';
import { AlertTriangle, CircleOff, PackageCheck, PackageX } from 'lucide-react';
import { ProductStockStatus } from '../types/product.types';

const config = {
  NOT_TRACKED: { label: 'Not tracked / غير متتبع', icon: CircleOff, style: 'bg-slate-100 text-slate-700' },
  OUT_OF_STOCK: { label: 'Out of stock / نفد المخزون', icon: PackageX, style: 'bg-red-50 text-red-700 ring-red-200' },
  LOW_STOCK: { label: 'Low stock / مخزون منخفض', icon: AlertTriangle, style: 'bg-amber-50 text-amber-800 ring-amber-200' },
  IN_STOCK: { label: 'In stock / متوفر', icon: PackageCheck, style: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
} as const;

export const ProductStockBadge: React.FC<{ status: ProductStockStatus }> = ({ status }) => {
  const item = config[status]; const Icon = item.icon;
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${item.style}`}><Icon className="h-3.5 w-3.5" />{item.label}</span>;
};
