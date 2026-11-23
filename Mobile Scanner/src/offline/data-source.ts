import type { LocalDb, SqlValue } from './local-db';
import { normalizeScanCode } from '@shared/scan-code';
import { cloudReport, reportAtPath } from './cloud-figures';

const unavailable = () => new Error('This detail is available on the shop Wi-Fi.');
const decimalCompare = (left: string, right: string) => {
  const [a = '', af = ''] = left.replace(/^0+(?=\d)/, '').split('.'),
    [b = '', bf = ''] = right.replace(/^0+(?=\d)/, '').split('.');
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  const size = Math.max(af.length, bf.length),
    x = af.padEnd(size, '0'),
    y = bf.padEnd(size, '0');
  return x === y ? 0 : x < y ? -1 : 1;
};

/** Existing API paths/shapes, backed solely by PC-owned JSON in SQLite. */
export class CloudDataSource {
  constructor(
    private readonly db: LocalDb,
    private readonly branchIds: string[],
    private readonly role = 'EMPLOYEE',
    private readonly owner?: string
  ) {}
  async read(url: string, init: RequestInit = {}): Promise<any> {
    if ((init.method ?? 'GET').toUpperCase() !== 'GET')
      throw new Error('Coming soon over the cloud. Use the shop Wi-Fi');
    const parsed = new URL(url),
      path = parsed.pathname.replace(/^\/api\/v1/, ''),
      q = parsed.searchParams;
    const selected = new Headers(init.headers).get('X-Branch-Scope');
    if (selected && !this.branchIds.includes(selected))
      throw new Error('This branch is not paired with this phone.');
    const branches = selected ? [selected] : this.branchIds;
    const scope = `(branch_id IS NULL OR branch_id IN (${branches.map(() => '?').join(',') || 'NULL'}))${this.role === 'ADMIN' ? '' : " AND (min_role IS NULL OR min_role<>'ADMIN')"}`;
    const query = async (
      entity: string,
      where = '',
      values: SqlValue[] = [],
      order = 'name COLLATE NOCASE,id',
      limit?: number,
      offset = 0
    ) => {
      const rows = await this.db.query<{ data: string }>(
        `SELECT data FROM records WHERE entity=? AND ${scope}${where ? ' AND (' + where + ')' : ''} ORDER BY ${order}${limit === undefined ? '' : ' LIMIT ? OFFSET ?'}`,
        [entity, ...branches, ...values, ...(limit === undefined ? [] : [limit, offset])]
      );
      return rows.map((row) => JSON.parse(row.data));
    };
    const detail = async (entity: string, id: string) => {
      const row = (await query(entity, "id=? OR json_extract(data,'$.id')=?", [id, id]))[0];
      if (!row) throw new Error('This record is not in your phone data. Sync and try again.');
      return row;
    };
    const page = Math.max(1, Number(q.get('page') || 1)),
      limit = Math.min(500, Math.max(1, Number(q.get('pageSize') || q.get('limit') || 25)));
    const figure = async (entity: string, where = '', values: SqlValue[] = []) => {
      if (branches.length !== 1) throw new Error('Choose a branch to view its figures.');
      return (await query(entity, where, values))[0];
    };
    if (path === '/dashboard/overview') {
      const record = await figure('dashboard', "json_extract(data,'$.period')=?", [
        q.get('range') ?? 'today',
      ]);
      return record
        ? {
            ...record.response,
            cloudSnapshot: { updatedAt: record.updatedAt, businessDate: record.businessDate },
          }
        : { cloudMissing: true };
    }
    if (path.startsWith('/reports/')) {
      const definition = reportAtPath(path);
      if (!definition) throw unavailable();
      return cloudReport(this.db, branches, this.role, this.owner, definition.id, {
        period: (q.get('period') ?? 'thisMonth') as any,
        from: q.get('from') ?? undefined,
        to: q.get('to') ?? undefined,
        month: q.get('month') ?? undefined,
      });
    }
    const search = q.get('search')?.trim() ?? '';
    const like = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    const searchWhere = search
      ? "(name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')"
      : '';
    const searchValues = search ? [like, like, like] : [];
    if (path === '/branches/accessible') return query('branch');
    if (path === '/categories') return query('category');
    if (path === '/products/brands') {
      const counts = new Map<string, number>();
      for (const item of await query('product'))
        if (item.brand) counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
      return {
        brands: [...counts].map(([canonical, productCount]) => ({ canonical, productCount })),
      };
    }
    if (path === '/products/scan') {
      const code = normalizeScanCode(q.get('code') ?? '');
      if (!code.ok)
        return { status: 'INVALID_CODE', normalizedCode: null, matchedBy: null, product: null };
      const candidates = await query(
        'product',
        "lower(json_extract(data,'$.barcode'))=lower(?) OR lower(json_extract(data,'$.sku'))=lower(?)",
        [code.code, code.code]
      );
      const barcode = candidates.find(
        (item) => item.barcode?.toLowerCase() === code.code.toLowerCase()
      );
      const sku = candidates.find((item) => item.sku?.toLowerCase() === code.code.toLowerCase());
      const item = barcode ?? sku;
      const product = item
        ? Object.fromEntries(
            ['id', 'name', 'model', 'sku', 'barcode', 'brand', 'isActive'].map((key) => [
              key,
              item[key],
            ])
          )
        : null;
      return {
        status: item ? 'FOUND' : 'NOT_FOUND',
        normalizedCode: code.code,
        matchedBy: barcode ? 'BARCODE' : sku ? 'SKU' : null,
        ...(barcode && sku && barcode.id !== sku.id ? { alsoMatchedSku: true } : {}),
        product,
      };
    }
    const product = /^\/products\/([^/]+)(\/inventory)?$/.exec(path);
    if (product) {
      const data = await detail('product', decodeURIComponent(product[1]!));
      if (product[2]) {
        if (!data.inventory) throw unavailable();
        return data.inventory;
      }
      return data;
    }
    if (path === '/inventory/movements') {
      const data = await detail('product', q.get('productId') ?? '');
      if (!data.inventory) throw unavailable();
      return data.inventory.recentMovements.slice((page - 1) * limit, page * limit);
    }
    const customer = /^\/customers\/([^/]+)(\/financial-summary)?$/.exec(path);
    if (customer) {
      const data = await detail('customer', decodeURIComponent(customer[1]!));
      if (customer[2]) {
        if (!data.financialSummary) throw unavailable();
        return data.financialSummary;
      }
      return data;
    }
    // Recent purchases and active payments come with the supplier record
    // (PC 2.4.6+), so a bill can be linked away from the shop.
    const ledger = /^\/suppliers\/([^/]+)\/(purchases|transactions)$/.exec(path);
    if (ledger) {
      const record = (await detail('supplier', decodeURIComponent(ledger[1]!))) as {
        recentPurchases?: unknown[];
        recentPayments?: unknown[];
      };
      const rows = ledger[2] === 'purchases' ? record.recentPurchases : record.recentPayments;
      if (!rows) throw unavailable();
      return rows;
    }
    const supplier = /^\/suppliers\/([^/]+)(\/bills)?$/.exec(path);
    if (supplier) {
      if (supplier[2])
        return q.get('linked') === 'true'
          ? []
          : query('supplier_bill', "json_extract(data,'$.supplierId')=?", [
              decodeURIComponent(supplier[1]!),
            ]);
      return detail('supplier', decodeURIComponent(supplier[1]!));
    }
    const order = /^\/sales-orders\/([^/]+)$/.exec(path);
    if (order) return detail('sales_order', decodeURIComponent(order[1]!));
    if (path === '/supplier-bills/unlinked-count')
      return { count: (await query('supplier_bill')).length };
    if (path === '/supplier-bills')
      return query(
        'supplier_bill',
        '',
        [],
        "json_extract(data,'$.capturedAt') DESC,id",
        Math.min(200, Number(q.get('limit') || 100))
      );
    if (path === '/receivables') {
      const totals = await figure('receivables_summary');
      let items = (await query('customer', searchWhere, searchValues))
        .filter((item) => item.financial && !/^0+(?:\.0+)?$/.test(item.financial.outstanding))
        .map((item) => ({
          branchId: item.branchId,
          customer: { id: item.id, name: item.name, phone: item.phone, isActive: item.isActive },
          tier: item.financial.tier,
          tierReason: item.financial.tierReason,
          maxOverdueDays: item.financial.maxOverdueDays,
          outstanding: item.financial.outstanding,
          overdueAmount: item.financial.overdueAmount,
          nextDueDate: item.financial.nextDueDate,
          lastPaymentDate: item.financial.lastPaymentDate,
        }));
      const tiers = q.getAll('tier').flatMap((value) => value.split(','));
      if (tiers.length) items = items.filter((item) => tiers.includes(item.tier));
      const ranks = ['CRITICAL', 'SEVERE', 'LATE', 'WATCH', 'CURRENT', 'NO_ACTIVITY'];
      const sort = q.get('sortBy');
      items.sort((a, b) =>
        sort === 'name'
          ? a.customer.name.localeCompare(b.customer.name)
          : sort === 'standing'
            ? ranks.indexOf(a.tier) - ranks.indexOf(b.tier)
            : decimalCompare(
                String(b[sort === 'overdue' ? 'overdueAmount' : 'outstanding']),
                String(a[sort === 'overdue' ? 'overdueAmount' : 'outstanding'])
              )
      );
      return {
        businessDate: totals?.businessDate ?? null,
        summary: totals?.response.summary ?? null,
        tierCounts: totals?.response.tierCounts ?? {},
        cloudSnapshot: totals ? { updatedAt: totals.updatedAt } : undefined,
        items: items.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: items.length,
          totalPages: Math.ceil(items.length / limit),
        },
      };
    }
    const entities: Record<string, string> = {
      '/products': 'product',
      '/customers': 'customer',
      '/suppliers': 'supplier',
      '/sales-orders': 'sales_order',
    };
    const entity = entities[path];
    if (entity) {
      const conditions = searchWhere ? [searchWhere] : [],
        values: SqlValue[] = [...searchValues];
      if (q.has('isActive')) {
        conditions.push("json_extract(data,'$.isActive')=?");
        values.push(q.get('isActive') === 'true' ? 1 : 0);
      }
      if (q.has('brand')) {
        conditions.push("json_extract(data,'$.brand')=?");
        values.push(q.get('brand')!);
      }
      if (q.has('categoryId')) {
        conditions.push(
          "json_extract(data,'$.categoryId') IN (WITH RECURSIVE descendants(id) AS (SELECT ? UNION SELECT r.id FROM records r JOIN descendants d ON json_extract(r.data,'$.parentId')=d.id WHERE r.entity='category') SELECT id FROM descendants)"
        );
        values.push(q.get('categoryId')!);
      }
      for (const key of [
        'customerId',
        'dateFrom',
        'dateTo',
        'fulfillmentStatus',
        'paymentStatus',
      ]) {
        const value = q.get(key);
        if (!value) continue;
        if (key === 'dateFrom' || key === 'dateTo') {
          conditions.push(
            `substr(json_extract(data,'$.orderDate'),1,10) ${key === 'dateFrom' ? '>=' : '<='} ?`
          );
          values.push(value);
        } else {
          const list = value.split(',');
          conditions.push(`json_extract(data,'$.${key}') IN (${list.map(() => '?').join(',')})`);
          values.push(...list);
        }
      }
      return query(
        entity,
        conditions.join(' AND '),
        values,
        entity === 'sales_order' ? "json_extract(data,'$.orderDate') DESC,id" : undefined,
        limit,
        (page - 1) * limit
      );
    }
    throw unavailable();
  }
}
