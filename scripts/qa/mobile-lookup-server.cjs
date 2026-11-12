/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS QA runner; the desktop reference bundle also uses CommonJS. */
// Local-only QA: existing gateway code -> synthetic desktop wire responses.
// Run from the repository root. Never connects to a shop database.
const fs = require('fs'),
  path = require('path'),
  http = require('http'),
  Module = require('module');
const express = require('express'),
  ts = require('typescript'),
  esbuild = require('esbuild');
const f = require('./mobile-lookup-fixtures.cjs');
const root = path.resolve(__dirname, '../..'),
  output = path.join(root, 'node_modules/.cache/mobile-lookup');
fs.mkdirSync(output, { recursive: true });
const requests = [];
function gateway() {
  const file = path.join(root, 'backend/src/features/scanner/mobile-api-gateway.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const instance = new Module(file, module);
  instance.filename = file;
  instance.paths = module.paths;
  instance._compile(source, file);
  return instance.exports.createMobileApiGateway(3001);
}
const desktop = express().use(express.json());
desktop.use((req, res, next) => {
  requests.push({
    method: req.method,
    path: req.path,
    query: req.query,
    branch: req.headers['x-branch-scope'] ?? null,
    authenticated: Boolean(req.headers.authorization),
  });
  next();
});
function envelope(res, data, meta) {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}
function paged(res, rows, query) {
  const page = Number(query.page ?? 1),
    size = Number(query.pageSize ?? query.limit ?? 25);
  envelope(res, rows.slice((page - 1) * size, page * size), {
    pagination: {
      page,
      pageSize: size,
      totalItems: rows.length,
      totalPages: Math.ceil(rows.length / size),
    },
  });
}
desktop.get('/api/v1/system/client-compat', (_req, res) =>
  envelope(res, { apiVersion: '2.1.0', minMobileVersion: '1.2.0' })
);
desktop.post('/api/v1/auth/refresh', (_req, res) => {
  res.cookie('refreshToken', 'fixture-refresh', { httpOnly: true });
  envelope(res, { accessToken: 'fixture-lookup' });
});
desktop.post('/api/v1/auth/login', (req, res) => {
  const role = req.body.username === 'employee' ? 'EMPLOYEE' : 'ADMIN';
  res.cookie('refreshToken', 'fixture-refresh', { httpOnly: true });
  envelope(res, {
    accessToken: role === 'ADMIN' ? 'fixture-lookup' : 'fixture-employee',
    user: { id: 'fixture-user', username: 'operator', fullName: 'Fixture Operator', role },
  });
});
desktop.post('/api/v1/auth/logout', (_req, res) => envelope(res, {}));
desktop.use('/api/v1', (req, res, next) => {
  if (!/^Bearer fixture-/.test(req.headers.authorization ?? ''))
    return res
      .status(401)
      .json({ success: false, error: { message: 'Fixture auth required', code: 'UNAUTHORIZED' } });
  next();
});
desktop.get('/api/v1/auth/me', (req, res) =>
  envelope(res, {
    id: 'fixture-user',
    username: 'operator',
    fullName: 'Fixture Operator',
    role: req.headers.authorization.includes('employee') ? 'EMPLOYEE' : 'ADMIN',
  })
);
desktop.get('/api/v1/branches/accessible', (_req, res) => envelope(res, f.branches));
desktop.get('/api/v1/dashboard/overview', (req, res) =>
  envelope(res, {
    meta: {
      businessDate: '2026-11-12',
      generatedAt: '2026-11-12T09:00:00Z',
      range: { from: req.query.from ?? '2026-11-01', to: req.query.to ?? '2026-11-12' },
    },
    data: {
      inventoryScope: 'all-branches',
      kpis: [
        {
          key: 'outstandingDebt',
          value: req.headers['x-branch-scope'] === f.branchB ? '7777.77' : '9175.75',
          valueKind: 'money',
        },
        { key: 'collectedToday', value: '125.50', valueKind: 'money' },
        { key: 'customersPaidToday', value: 3, valueKind: 'count' },
        { key: 'activeProducts', value: 1, valueKind: 'count' },
      ],
    },
  })
);
desktop.get('/api/v1/customers', (req, res) => {
  let rows =
    req.headers['x-branch-scope'] === f.branchB
      ? [f.otherCustomer]
      : [...f.customers, ...f.extraCustomers];
  const search = String(req.query.search ?? '').toLowerCase();
  rows = rows.filter((row) => (row.name + ' ' + row.phone).toLowerCase().includes(search));
  paged(res, rows, req.query);
});
desktop.get('/api/v1/customers/:id', (req, res) =>
  envelope(
    res,
    [...f.customers, ...f.extraCustomers, f.otherCustomer].find((row) => row.id === req.params.id)
  )
);
desktop.get('/api/v1/customers/:id/financial-summary', (req, res) =>
  envelope(
    res,
    f.customerFinancial(
      [...f.customers, ...f.extraCustomers, f.otherCustomer].find((row) => row.id === req.params.id)
    )
  )
);
desktop.get('/api/v1/customers/:id/statement', (req, res) =>
  envelope(
    res,
    f.statement(
      [...f.customers, ...f.extraCustomers, f.otherCustomer].find(
        (row) => row.id === req.params.id
      ),
      { from: req.query.from, to: req.query.to }
    )
  )
);
desktop.get('/api/v1/suppliers', (req, res) => {
  let rows =
    req.headers['x-branch-scope'] === f.branchB
      ? [f.otherSupplier]
      : [...f.suppliers, ...f.extraSuppliers];
  const search = String(req.query.search ?? '').toLowerCase();
  rows = rows.filter((row) => (row.name + ' ' + row.phone).toLowerCase().includes(search));
  paged(res, rows, req.query);
});
desktop.get('/api/v1/suppliers/:id', (req, res) =>
  envelope(
    res,
    [...f.suppliers, ...f.extraSuppliers, f.otherSupplier].find((row) => row.id === req.params.id)
  )
);
desktop.get('/api/v1/suppliers/:id/summary', (req, res) =>
  envelope(res, f.suppliers.find((row) => row.id === req.params.id)?.summary)
);
desktop.get('/api/v1/suppliers/:id/statement', (req, res) =>
  envelope(
    res,
    f.statement(
      [...f.suppliers, ...f.extraSuppliers, f.otherSupplier].find(
        (row) => row.id === req.params.id
      ),
      { from: req.query.from, to: req.query.to }
    )
  )
);
desktop.get('/api/v1/suppliers/:id/purchases', (req, res) => paged(res, [f.purchase], req.query));
desktop.get('/api/v1/suppliers/:id/bills', (req, res) =>
  envelope(res, req.query.linked === 'true' ? [] : f.bills)
);
desktop.get('/api/v1/supplier-bills/:id/image', (_req, res) => {
  res.type('png').send(fs.readFileSync(path.join(output, 'synthetic-bill.png')));
});
desktop.get('/api/v1/products/brands', (_req, res) =>
  envelope(res, { brands: [{ canonical: 'Cedar', productCount: 1 }] })
);
desktop.get('/api/v1/categories', (_req, res) =>
  envelope(res, [
    { id: 'category-1', name: 'Drills', path: 'Tools / Drills', isActive: true, assignable: true },
  ])
);
desktop.get('/api/v1/products/scan', (_req, res) =>
  envelope(res, {
    status: 'FOUND',
    normalizedCode: f.product.sku,
    matchedBy: 'SKU',
    product: f.product,
  })
);
desktop.get('/api/v1/products', (req, res) =>
  paged(res, String(req.query.search ?? '').includes('nothing') ? [] : [f.product], req.query)
);
desktop.get('/api/v1/products/:id', (_req, res) => envelope(res, f.product));
desktop.get('/api/v1/products/:id/inventory', (_req, res) =>
  envelope(res, {
    product: { ...f.product, lowStockThreshold: 2 },
    onboardingStatus: 'ONBOARDED',
    recentMovements: f.movements.slice(0, 10),
  })
);
desktop.get('/api/v1/inventory/movements', (req, res) => paged(res, f.movements, req.query));
desktop.get('/api/v1/sales-orders', (req, res) =>
  paged(
    res,
    f.orders.filter(
      (row) =>
        (!req.query.customerId || row.customerId === req.query.customerId) &&
        (!req.query.fulfillmentStatus ||
          String(req.query.fulfillmentStatus).split(',').includes(row.fulfillmentStatus))
    ),
    req.query
  )
);
desktop.get('/api/v1/sales-orders/:id', (req, res) =>
  envelope(
    res,
    f.orders.find((row) => row.id === req.params.id)
  )
);
desktop.use('/api/v1/reports', (req, res) => {
  if (req.path === '/monthly-debts')
    return envelope(res, {
      summary: f.summary,
      rows: [f.reportRow],
      pagination: { page: Number(req.query.page ?? 1), totalPages: 1 },
    });
  if (req.path === '/monthly-financial-activity')
    return envelope(res, {
      summary: f.summary,
      items: [f.reportRow],
      pagination: { page: Number(req.query.page ?? 1), totalPages: 1 },
    });
  if (req.path === '/monthly-review')
    return envelope(res, {
      sales: { totalAmount: '125.50', paidAmount: '100.00', unpaidAmount: '25.50', orderCount: 1 },
      customers: {
        movement: { opening: '0.00', newAmount: '125.50', collected: '100.00', closing: '25.50' },
      },
      suppliers: {
        movement: { opening: '0.00', newAmount: '125.50', collected: '0.00', closing: '125.50' },
      },
    });
  if (req.path === '/analysis')
    return envelope(res, {
      health: {
        salesTotal: { current: '125.50', previous: '100.00', change: '25.50', changePercent: 25.5 },
      },
      cashflow: { netCollectionPosition: '100.00' },
      findings: [
        {
          key: 'fixture',
          severity: 'info',
          label: { en: 'Synthetic finding', ar: 'fixture' },
          detail: { en: 'QA only', ar: 'fixture' },
        },
      ],
    });
  envelope(res, { summary: f.summary, rows: [f.reportRow] });
});
desktop.use((_req, res) =>
  res.status(404).json({ success: false, error: { message: 'Unknown fixture route' } })
);
async function references() {
  const entry = `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import{FinancialSummaryCards}from'./frontend/src/features/customer-financial/components/FinancialSummaryCards';import{SupplierSummaryCards}from'./frontend/src/features/suppliers/components/SupplierSummaryCards';import{customerFinancialApi}from'./frontend/src/features/customer-financial/api/customer-financial.api';import{suppliersApi}from'./frontend/src/features/suppliers/api/suppliers.api';import{customerStatementsApi,supplierStatementsApi}from'./frontend/src/features/documents/api/customer-statements.api';import{api,setAccessToken}from'./frontend/src/services/api';import{setBranchScopeHeader}from'./frontend/src/features/branches/scope/branch-scope-store';export async function render(customers,suppliers,branch){setAccessToken('fixture-lookup');setBranchScopeHeader(branch);let html='';for(const c of customers){const data=await customerFinancialApi.getCustomerFinancialSummary(c.id);const statement=await customerStatementsApi.get(c.id,'2026-11-01','2026-11-12');html+='<section id="'+c.id+'"><h2>'+c.name+'</h2>'+renderToStaticMarkup(<FinancialSummaryCards summary={data.summary}/>)+ '<p>Statement opening: '+statement.openingBalance+' · closing: '+statement.closingBalance+'</p></section>';}for(const s of suppliers){const data=await suppliersApi.get(s.id);const statement=await supplierStatementsApi.get(s.id,'2026-11-01','2026-11-12');html+='<section id="'+s.id+'"><h2>'+s.name+'</h2>'+renderToStaticMarkup(<SupplierSummaryCards summary={data.summary}/>)+ '<p>Statement opening: '+statement.openingBalance+' · closing: '+statement.closingBalance+'</p></section>';}return html;}`;
  const build = await esbuild.build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: root },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['react', 'react-dom/server', 'axios'],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('http://127.0.0.1:3001/api/v1') },
  });
  const refFile = path.join(output, 'reference.cjs');
  fs.writeFileSync(refFile, build.outputFiles[0].text);
  const html = await require(refFile).render(f.customers, f.suppliers, f.branchA);
  const page =
    '<!doctype html><meta charset="utf-8"><title>Desktop components · synthetic fixture reference</title><style>body{font:16px system-ui;color:#1B2124;background:#f4f7f8;margin:32px}section{background:white;padding:24px;margin-bottom:24px;border:1px solid #d6dfe3;border-radius:16px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.font-bold{font-weight:700}.text-2xl{font-size:24px}svg{width:24px;height:24px}p{margin:8px 0}h1,h2{color:#155aa3}</style><h1>Actual desktop summary components · synthetic data</h1>' +
    html;
  fs.writeFileSync(path.join(output, 'desktop-reference.html'), page);
  return page;
}
async function main() {
  const api = http.createServer(desktop);
  await new Promise((resolve, reject) => {
    api.once('error', reject);
    api.listen(3001, '127.0.0.1', resolve);
  });
  const reference = await references();
  const lan = express()
    .use(gateway())
    .get('/desktop-reference', (_req, res) => res.type('html').send(reference));
  const server = http.createServer(lan);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3011, '127.0.0.1', resolve);
  });
  const save = () =>
    fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  const timer = setInterval(save, 2000);
  process.on('SIGINT', () => {
    clearInterval(timer);
    save();
    server.close();
    api.close();
    process.exit(0);
  });
  console.log(
    'Lookup QA fixtures ready: desktop :3001, actual LAN gateway :3011. No shop database.'
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
