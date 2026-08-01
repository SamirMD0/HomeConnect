import React from 'react';
import { ProductSpecification } from '../types/product.types';

export const ProductSpecificationsView: React.FC<{ specifications: ProductSpecification[]; notes: string | null }> = ({ specifications, notes }) => {
  if (!specifications.length && !notes) return <p className="text-sm text-slate-500">No specifications / لا توجد مواصفات</p>;
  return <div className="space-y-3">{specifications.length > 0 && <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">{specifications.map((item, index) => <div key={`${item.label}-${index}`}><dt className="text-xs font-medium text-slate-500" dir="auto">{item.label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900" dir="auto">{item.value}</dd></div>)}</dl>}{notes && <p className="whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm" dir="auto">{notes}</p>}</div>;
};
