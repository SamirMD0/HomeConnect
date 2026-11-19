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
const supported = new Set(['customer_payment.create', 'sales_order.create', 'supplier_payment.create', 'supplier_bill.upload','report.request']);
// PC record ids are UUID-shaped but not always RFC 4122 (see relay/inputs.ts).
const id = z.guid();
const object = z.record(z.string(), z.unknown());

function actionRequest(action: ClaimedAction) {
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
    case 'supplier_bill.upload': {
      const bill = z.object({ supplierId: id, note: z.string().max(2000).optional(), billGroupId: id.optional() }).strict().parse(payload);
      return { path: `/suppliers/${bill.supplierId}/bills${bill.note ? '?note=' + encodeURIComponent(bill.note) : ''}`,
        bill, body: undefined };
    }
    default: throw new Error('Unsupported action');
  }
}

function keyFields(data: Record<string, any>, actionId: string): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const key of ['id', 'orderNumber', 'referenceNumber', 'supplierId', 'customerId', 'currency', 'totalAmount', 'amount', 'transactionDate', 'status', 'billGroupId']) {
    if (typeof data[key] === 'string' || typeof data[key] === 'number') result[key] = data[key];
  }
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
  let request: ReturnType<typeof actionRequest>;
  try { request = actionRequest(action); }
  catch {
    await remember({ status: 'refused', result: { code: 'VALIDATION_ERROR', message: 'The queued action has invalid fields or is missing its target.' } }); return;
  }
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + jwt.sign({ userId: user.id, role: user.role }, requireSecretEnv('JWT_SECRET'), { expiresIn: '2m' }),
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
    headers['X-Receipt-Id'] = action.id;
    if (request.bill.billGroupId) headers['X-Bill-Group'] = request.bill.billGroupId;
    body = blob.bytes;
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new CycleExpired();
  let response: Response;
  let data: any;
  try {
    response = await deps.fetch(`http://127.0.0.1:${Number(process.env.PORT || 3001)}/api/v1${request.path}`, {
      method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(Math.min(20000, remaining)),
    });
    data = await response.json();
  } catch {
    if (action.attempts >= 5) await report({ status: 'failed', result: { reason: 'PC_ERROR' } });
    return;
  }
  if (response.ok) {
    const result={...keyFields(data.data??{},action.id)};
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
