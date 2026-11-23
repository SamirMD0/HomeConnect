import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { requireSecretEnv } from '../../../lib/env';
import { WorkerRelay, CycleExpired } from './relay-client';
import { pcRead,PcReadError } from './pc-read';
import { readReport,reportDefinition,REPORT_LIMIT } from './report-read';

export interface ClaimedAction {
  id: string; type: string; userId: string; branchId: string; payload: unknown; attempts: number; hasBlob: boolean;
}
type Outcome = { status: 'applied' | 'refused'; result: Prisma.InputJsonObject };
const defaults = {
  fetch: globalThis.fetch,
  user: (id: string) => prisma.user.findUnique({ where: { id } }),
  previous: (id: string) => prisma.syncAppliedAction.findUnique({ where: { actionId: id } }),
  remember: (action: ClaimedAction, outcome: Outcome) => prisma.$transaction(tx => tx.syncAppliedAction.upsert({
    where: { actionId: action.id }, create: { actionId: action.id, type: action.type, ...outcome }, update: {},
  })),
};
export type ActionDependencies = typeof defaults;
const supported = new Set(['customer_payment.create', 'sales_order.create', 'supplier_payment.create', 'supplier_bill.upload','report.request',
  'stock_movement.create', 'stock_receiving.create', 'supplier_purchase.create', 'prepaid.create',
  'supplier_bill.link', 'supplier_bill.delete', 'supplier_bill.replace']);
// PC record ids are UUID-shaped but not always RFC 4122 (see relay/inputs.ts).
const id = z.guid();
const object = z.record(z.string(), z.unknown());

type PcRequest = {
  path: string; body: unknown; method?: 'POST' | 'PATCH' | 'DELETE';
  /** The action's photo is the body: a new bill page (upload) or a retaken one (replace). */
  bill?: { billGroupId?: string; upload: boolean };
  /** After a purchase from a bill: attach that bill to the new purchase. */
  linkBillId?: string;
};
function actionRequest(action: ClaimedAction): PcRequest {
  const payload = object.parse(action.payload);
  const body: Record<string, unknown> = { ...payload, idempotencyKey: action.id };
  switch (action.type) {
    case 'sales_order.create': return { path: '/sales-orders', body };
    case 'customer_payment.create': {
      const { targetType, targetId, ...payment } = body;
      const target = id.parse(targetId);
      const route = z.enum(['DEBT', 'INSTALLMENT_PLAN']).parse(targetType) === 'DEBT' ? 'debts' : 'installment-plans';
      return { path: `/${route}/${target}/payments`, body: payment };
    }
    case 'supplier_payment.create': {
      const { supplierId, ...payment } = body;
      if (payment.type !== 'SUPPLIER_PAYMENT') throw new Error('Only supplier payments are supported.');
      return { path: `/suppliers/${id.parse(supplierId)}/transactions`, body: payment };
    }
    case 'stock_movement.create': {
      // The PC finds an earlier write by this reference (repeat protection).
      const { productId, accountPassword: _never, idempotencyKey: _key, ...movement } = body;
      return { path: `/products/${id.parse(productId)}/stock-movements`,
        body: { ...movement, referenceType: 'SYNC_ACTION', referenceId: action.id } };
    }
    case 'stock_receiving.create': return { path: '/inventory/receivings', body };
    case 'supplier_purchase.create': {
      const { supplierId, billId, ...purchase } = body;
      return { path: `/suppliers/${id.parse(supplierId)}/purchases`, body: purchase,
        ...(billId === undefined ? {} : { linkBillId: id.parse(billId) }) };
    }
    case 'supplier_bill.link': {
      // A purchase or a payment: the PC routes a purchase with stock to its receiving.
      const link = z.object({ billId: id, transactionId: id }).strict().parse(payload);
      return { path: `/supplier-bills/${link.billId}`, method: 'PATCH', body: { supplierTransactionId: link.transactionId } };
    }
    case 'supplier_bill.delete': {
      const remove = z.object({ billId: id, wholeBill: z.boolean() }).strict().parse(payload);
      return { path: `/supplier-bills/${remove.billId}?bill=${remove.wholeBill}`, method: 'DELETE', body: undefined };
    }
    case 'supplier_bill.replace': {
      const page = z.object({ billId: id }).strict().parse(payload);
      return { path: `/supplier-bills/${page.billId}/replace`, bill: { upload: false }, body: undefined };
    }
    case 'prepaid.create': {
      const { customerId, ...prepaid } = body;
      return { path: `/customers/${id.parse(customerId)}/prepaid-purchases`, body: prepaid };
    }
    case 'supplier_bill.upload': {
      const bill = z.object({ supplierId: id, note: z.string().max(2000).optional(), billGroupId: id.optional() }).strict().parse(payload);
      return { path: `/suppliers/${bill.supplierId}/bills${bill.note ? '?note=' + encodeURIComponent(bill.note) : ''}`,
        bill: { billGroupId: bill.billGroupId, upload: true }, body: undefined };
    }
    default: throw new Error('Unsupported action');
  }
}

function keyFields(data: Record<string, any>, actionId: string): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const key of ['id', 'orderNumber', 'referenceNumber', 'supplierId', 'customerId', 'currency', 'totalAmount', 'amount', 'transactionDate', 'status', 'billGroupId']) {
    if (typeof data[key] === 'string' || typeof data[key] === 'number') result[key] = data[key];
  }
  // Stock moves answer { changed, message, product, movement }.
  if (data.movement && typeof data.movement.id === 'string') result.id = data.movement.id;
  if (data.product && typeof data.product.stockQuantity === 'number') {
    result.productId = data.product.id;
    result.stockQuantity = data.product.stockQuantity;
  }
  if (data.changed === false && typeof data.message === 'string') result.message = data.message;
  if (Array.isArray(data.payments)) {
    const payments = data.payments.filter((p: any) => p.idempotencyKey === actionId).map((p: any) => ({ id: p.id, idempotencyKey: actionId }));
    result.payments = payments;
    if (payments[0]) result.id = payments[0].id;
  }
  return result;
}

export async function applyAction(action: ClaimedAction, relay: Pick<WorkerRelay, 'request'>, deadline: number, deps = defaults) {
  const report = (outcome: { status: string; result: unknown }) => relay.request(`/outbox/${action.id}/result`, outcome);
  const previous = await deps.previous(action.id);
  if (previous) { await report({ status: previous.status, result: previous.result }); return; }
  const remember = async (outcome: Outcome) => {
    const stored = await deps.remember(action, outcome);
    await report({ status: stored.status, result: stored.result });
  };
  if (!supported.has(action.type)) { await remember({ status: 'refused', result: { reason: 'UNSUPPORTED_ACTION' } }); return; }
  const user = await deps.user(action.userId);
  if (!user || !user.isActive || user.deletedAt) { await remember({ status: 'refused', result: { reason: 'USER_INACTIVE' } }); return; }
  if(action.type==='report.request'){
    let input:{reportId:string;filters:{period:'thisMonth'|'lastMonth'|'today'|'thisWeek'|'custom';from?:string;to?:string;month?:string}};
    try{
      input=z.object({reportId:z.string(),filters:z.object({period:z.enum(['thisMonth','lastMonth','today','thisWeek','custom']),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),month:z.string().regex(/^\d{4}-\d{2}$/).optional()}).strict()}).strict().parse(action.payload);
      reportDefinition(input.reportId);
    }catch{await remember({status:'refused',result:{code:'VALIDATION_ERROR',message:'Choose a valid report and filters.'}});return;}
    try{
      const result=await readReport(input.reportId,input.filters,path=>pcRead(path,action.branchId,user,deadline,deps.fetch));
      if(result.tooLarge||Buffer.byteLength(JSON.stringify(result),'utf8')>REPORT_LIMIT){await remember({status:'refused',result:{code:'REPORT_TOO_LARGE',message:'Open this report on the shop Wi-Fi.'}});return;}
      await remember({status:'applied',result:JSON.parse(JSON.stringify({report:result,reportId:input.reportId,filters:input.filters,updatedAt:new Date().toISOString()}))});
    }catch(error){
      if(error instanceof CycleExpired)throw error;
      if(error instanceof PcReadError&&error.status>=400&&error.status<500)await remember({status:'refused',result:{code:error.code,message:error.pcMessage}});
      else if(action.attempts>=5)await report({status:'failed',result:{reason:'PC_ERROR'}});
    }
    return;
  }
  let request: PcRequest;
  try { request = actionRequest(action); }
  catch {
    await remember({ status: 'refused', result: { code: 'VALIDATION_ERROR', message: 'The queued action has invalid fields or is missing its target.' } }); return;
  }
  const headers: Record<string, string> = {
    // pinConfirmed: the paired phone was unlocked with its PIN. Only this
    // worker signs it; it stands in for the password on admin stock changes.
    Authorization: 'Bearer ' + jwt.sign({ userId: user.id, role: user.role, pinConfirmed: true }, requireSecretEnv('JWT_SECRET'), { expiresIn: '2m' }),
    'X-Branch-Scope': action.branchId, 'X-Sync-Action': action.id,
    'Content-Type': 'application/json',
  };
  let body: BodyInit = JSON.stringify(request.body);
  if (request.bill) {
    // Relay errors leave the lease retryable, including errors retrieving a photo.
    const blob = await relay.request(`/outbox/${action.id}/blob`, undefined, true);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.mime) || blob.bytes.byteLength > 2 * 1024 * 1024) {
      await remember({ status: 'refused', result: { code: 'INVALID_PHOTO', message: 'The bill photo format or size is invalid.' } }); return;
    }
    headers['Content-Type'] = blob.mime;
    if (request.bill.upload) headers['X-Receipt-Id'] = action.id;
    if (request.bill.billGroupId) headers['X-Bill-Group'] = request.bill.billGroupId;
    body = blob.bytes;
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new CycleExpired();
  let response: Response;
  let data: any;
  try {
    response = await deps.fetch(`http://127.0.0.1:${Number(process.env.PORT || 3001)}/api/v1${request.path}`, {
      method: request.method ?? 'POST', headers, body: request.body === undefined && !request.bill ? undefined : body, redirect: 'error', signal: AbortSignal.timeout(Math.min(20000, remaining)),
    });
    data = await response.json();
  } catch {
    if (action.attempts >= 5) await report({ status: 'failed', result: { reason: 'PC_ERROR' } });
    return;
  }
  if (response.ok) {
    const result={...keyFields(data.data??{},action.id)};
    if (request.linkBillId && typeof result.id === 'string') {
      // Best effort, as on the phone over Wi-Fi: the purchase stands either way.
      try {
        const linked = await deps.fetch(`http://127.0.0.1:${Number(process.env.PORT || 3001)}/api/v1/supplier-bills/${request.linkBillId}`, {
          method: 'PATCH', headers, body: JSON.stringify({ supplierTransactionId: result.id }), redirect: 'error',
          signal: AbortSignal.timeout(Math.max(1000, Math.min(20000, deadline - Date.now()))),
        });
        result.billLinked = linked.ok;
        if (!linked.ok) result.billMessage = 'The purchase was saved, but the bill could not be attached. It stays in the bills inbox.';
      } catch {
        result.billLinked = false;
        result.billMessage = 'The purchase was saved, but the bill could not be attached. It stays in the bills inbox.';
      }
    }
    if(action.type==='customer_payment.create'&&typeof result.id==='string'){
      try{
        const payment=await pcRead(`/payments/${encodeURIComponent(result.id)}/receipt`,action.branchId,user,deadline,deps.fetch);
        const settings=await pcRead('/business-settings',action.branchId,user,deadline,deps.fetch);
        const business=Object.fromEntries(['shopName','address','phone','email','taxNumber'].map(key=>[key,settings[key]??null]));
        result.receipt=JSON.parse(JSON.stringify({payment,business,updatedAt:new Date().toISOString()}));
      }catch(error){if(error instanceof CycleExpired)throw error;if(action.attempts>=5)await report({status:'failed',result:{reason:'PC_ERROR'}});return;}
    }
    await remember({ status: 'applied', result });
  }
  else if (response.status >= 400 && response.status < 500) {
    await remember({ status: 'refused', result: {
      code: typeof data.error?.code === 'string' ? data.error.code : 'PC_REFUSED',
      message: typeof data.error?.message === 'string' ? data.error.message : 'The shop PC refused this action.',
    } });
  } else if (action.attempts >= 5) await report({ status: 'failed', result: { reason: 'PC_ERROR' } });
}

export async function applyClaimedActions(relay: Pick<WorkerRelay, 'request'>, deadline: number, deps = defaults) {
  const actions: ClaimedAction[] = await relay.request('/outbox/claim', { limit: 20 });
  for (const action of actions) {
    if (Date.now() >= deadline) break;
    await applyAction(action, relay, deadline, deps);
  }
}
