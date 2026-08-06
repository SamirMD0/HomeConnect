import React from 'react';
import { CustomerActivityItem } from '../../../features/customers/api/customers.api';
import { formatMoney } from '../../../features/customer-financial/utils/financial-format';

export const CustomerActivityTimeline: React.FC<{ items: CustomerActivityItem[] }> = ({ items }) => <div className="space-y-3">{items.length === 0 ? <p className="text-sm text-slate-500">No activity / لا يوجد نشاط</p> : items.map((item) => <article key={item.id} className="border-l-2 border-emerald-200 pl-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium text-slate-900">{item.label}</p>{item.amount && <span className="font-semibold">{formatMoney(item.amount)}</span>}</div><p className="text-xs text-slate-500">{new Date(item.at).toLocaleString()} · {item.actor ?? 'System'}</p></article>)}</div>;
