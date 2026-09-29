import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

async function main() {
  const state = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
  if (!/^hc_audit_test_browser_\d+$/.test(new URL(state.urls.browser).pathname.slice(1)))
    throw new Error('Unsafe E2E database');
  const db = new PrismaClient({ datasources: { db: { url: state.urls.browser } } });
  const password = await bcrypt.hash('Audit-only-password-2026!', 10);
  const admin = await db.user.upsert({
    where: { username: 'audit_admin' },
    update: { isActive: true },
    create: { username: 'audit_admin', password, fullName: 'Audit Administrator', role: 'ADMIN' },
  });
  // Mirror required seed configuration; migration deployment alone does not seed VAT.
  for (const [code, ratePercent, isDefault] of [
    ['LB_STANDARD', '11.000', true],
    ['LB_ZERO', '0.000', false],
  ] as const) {
    const rate = await db.taxRate.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: code,
        nameAr: code,
        ratePercent,
        effectiveFrom: new Date('2026-01-01'),
        createdById: admin.id,
      },
    });
    await db.taxProfile.upsert({
      where: { code },
      update: {},
      create: { code, name: code, nameAr: code, taxRateId: rate.id, isDefault },
    });
  }
  await db.user.upsert({
    where: { username: 'audit_employee' },
    update: {},
    create: { username: 'audit_employee', password, fullName: 'Audit Employee', role: 'EMPLOYEE' },
  });
  await db.user.upsert({
    where: { username: 'audit_disabled' },
    update: {},
    create: {
      username: 'audit_disabled',
      password,
      fullName: 'Audit Disabled',
      role: 'EMPLOYEE',
      isActive: false,
    },
  });
  if (!(await db.customer.findFirst({ where: { name: 'Audit Customer' } })))
    await db.customer.create({
      data: { name: 'Audit Customer', phone: '71000001', createdBy: admin.id },
    });
  const products = [
    ['TV', 'TCL', 'TV-AUDIT'],
    ['Washer', 'TCL', 'WASH-AUDIT'],
    ['Fridge', 'TCL', 'FRIDGE-AUDIT'],
    ['Kettle', 'Generic', 'KETTLE-AUDIT'],
    ['Trimmer', 'VGR', 'VGR-AUDIT'],
    ['LBP TV', 'TCL', 'LBP-AUDIT'],
  ];
  for (const [kind, brand, model] of products) {
    const existing = await db.product.findUnique({ where: { sku: `AUDIT-${model}` } });
    if (existing) {
      // Browser sales consume fixture stock. Replenish only this isolated audit
      // product, with a matching ledger movement, so repeat runs stay valid.
      if (existing.stockQuantity < 10) {
        await db.$transaction([
          db.product.update({ where: { id: existing.id }, data: { stockQuantity: 10 } }),
          db.stockMovement.create({
            data: {
              productId: existing.id,
              movementType: 'MANUAL_ADD',
              quantityChange: 10 - existing.stockQuantity,
              quantityBefore: existing.stockQuantity,
              quantityAfter: 10,
              reason: 'Replenish isolated release audit fixture before browser run',
              createdById: admin.id,
            },
          }),
        ]);
      }
      continue;
    }
    const category = await db.category.create({ data: { name: `Audit ${kind}` } });
    const product = await db.product.create({
      data: {
        name: `Audit ${kind}`,
        model,
        brand,
        sku: `AUDIT-${model}`,
        barcode: `AUDIT-${model}`,
        price: kind === 'LBP TV' ? '35800000' : '400',
        costPrice: kind === 'LBP TV' ? '33115000' : '370',
        priceCurrency: kind === 'LBP TV' ? 'LBP' : 'USD',
        categoryId: category.id,
        createdById: admin.id,
        trackStock: true,
        stockQuantity: 10,
        pricingCardTemplateId: '20000000-0000-4000-8000-000000000001',
        specifications: [
          { key: 'screen_size', value: '55 inch' },
          { key: 'resolution', value: '4K' },
        ],
      },
    });
    await db.stockMovement.create({
      data: {
        productId: product.id,
        movementType: 'OPENING_BALANCE',
        quantityChange: 10,
        quantityBefore: 0,
        quantityAfter: 10,
        reason: 'Isolated release audit fixture',
        createdById: admin.id,
      },
    });
  }
  const tv = await db.product.findUniqueOrThrow({ where: { sku: 'AUDIT-TV-AUDIT' } });
  await db.product.updateMany({
    where: { sku: { in: products.map(([, , model]) => `AUDIT-${model}`) } },
    data: {
      specifications: [
        { label: 'Screen size', value: '55 inch' },
        { label: 'Resolution', value: '4K' },
      ],
    },
  });
  for (const [index, iconCode] of ['qled', 'uhd-4k', 'dolby-vision', 'google-tv'].entries())
    await db.productPricingCardFeature.upsert({
      where: { productId_position: { productId: tv.id, position: index + 1 } },
      update: {},
      create: { productId: tv.id, iconCode, position: index + 1 },
    });
  await db.shopProfile.updateMany({
    data: {
      defaultPricingCardTemplateId: '20000000-0000-4000-8000-000000000001',
      pricingCardRolloutMode: 'BOTH',
    },
  });
  if (!(await db.exchangeRate.findFirst()))
    await db.exchangeRate.create({
      data: {
        fromCurrency: 'USD',
        toCurrency: 'LBP',
        rate: '89500',
        effectiveFrom: new Date('2026-01-01'),
        createdById: admin.id,
      },
    });
  await db.$disconnect();
  const userData = path.resolve('e2e/.runtime/browser-user-data');
  fs.mkdirSync(userData, { recursive: true });
  const backend = spawn(process.execPath, ['dist/server/backend/src/index.js'], {
    windowsHide: true,
    env: {
      ...process.env,
      DATABASE_URL: state.urls.browser,
      JWT_SECRET: state.JWT_SECRET,
      JWT_REFRESH_SECRET: state.JWT_REFRESH_SECRET,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '4311',
      FRONTEND_URL: 'http://127.0.0.1:4312',
      CORS_ORIGINS: 'http://127.0.0.1:4312',
      COOKIE_SECURE: 'false',
      HOME_CONNECT_USER_DATA: userData,
      LOG_DIR: path.join(userData, 'logs'),
      BACKUP_DIR: path.join(userData, 'backups'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream('e2e/.runtime/backend.log', { flags: 'a' });
  backend.stdout.pipe(log);
  backend.stderr.pipe(log);
  backend.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  backend.on('exit', (code) => {
    if (!stopping) {
      console.error(`Audit backend exited ${code}`);
      process.exit(1);
    }
  });
  const frontend = express();
  frontend.use(express.static(path.resolve('frontend/dist')));
  const server = frontend.listen(4312, '127.0.0.1');
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    backend.kill();
    backend.once('exit', () => process.exit(0));
    setTimeout(() => {
      backend.kill('SIGKILL');
      process.exit(1);
    }, 5000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.on('message', (message) => {
    if (message === 'shutdown') stop();
  });
  process.once('disconnect', stop);
  process.send?.({ type: 'audit-server-pids', serverPid: process.pid, backendPid: backend.pid });
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
