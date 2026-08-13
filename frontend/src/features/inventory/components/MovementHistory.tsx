import React from 'react';
import { Link } from 'react-router-dom';
import type { StockMovement } from '../types/inventory.types';

export const MovementHistory: React.FC<{ movements: StockMovement[]; emptyLabel?: string }> = ({ movements, emptyLabel = 'No stock movements / لا توجد حركات مخزون' }) => movements.length
  ? <div className="divide-y divide-slate-100">{movements.map((movement) => { const sourceOrder = movement.salesFulfillmentMovement?.salesOrder ?? movement.salesFulfillmentReversalMovement?.salesOrder; return <article key={movement.id} className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{movement.movementType.replaceAll('_', ' ')}</strong><time className="text-xs text-slate-500">{new Date(movement.createdAt).toLocaleString()}</time></div>
      <p className="mt-1 font-semibold tabular-nums">{movement.quantityBefore} → {movement.quantityAfter} <span className={movement.quantityChange > 0 ? 'text-emerald-700' : movement.quantityChange < 0 ? 'text-red-700' : 'text-slate-500'}>({movement.quantityChange > 0 ? '+' : ''}{movement.quantityChange})</span></p>
      <p className="user-text mt-1 text-slate-700" dir="auto">{movement.reason}</p>
      {movement.note && <p className="user-text mt-1 text-xs text-slate-500" dir="auto">{movement.note}</p>}
      <p className="mt-1 text-xs text-slate-500">{movement.createdBy ? `${movement.createdBy.fullName} (${movement.createdBy.username})` : 'System / النظام'}</p>
      {sourceOrder && <Link className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline" to={`/sales-orders/${sourceOrder.id}`}>Sales order {sourceOrder.orderNumber} / طلب البيع {sourceOrder.orderNumber}</Link>}
    </article>;})}</div>
  : <p className="text-sm text-slate-500">{emptyLabel}</p>;
