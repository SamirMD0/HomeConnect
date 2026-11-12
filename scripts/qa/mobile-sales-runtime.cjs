/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node QA runner and compiled CommonJS backend. */
// Requires ONLY the disposable hc-mobile-sales-qa database on localhost:5439.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const esbuild = require('esbuild'), express = require('express'), bcrypt = require('bcrypt');
const root = path.resolve(__dirname, '../..'), scratch = path.join(root, 'node_modules/.cache/mobile-sales');
fs.mkdirSync(scratch, { recursive: true });
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5439/mobile_sales_qa';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
process.env.NODE_ENV = 'test';
process.env.HOSTED_MODE = 'true';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  if ((await prisma.$queryRawUnsafe('SELECT current_database() AS name'))[0].name !== 'mobile_sales_qa') throw new Error('Wrong QA database');
  const password = 'Synthetic-QA-password-123!';
  const admin = await prisma.user.upsert({ where: { username: 'mobile-sales-qa' }, update: {}, create: { username: 'mobile-sales-qa', fullName: 'Fixture Operator', password: await bcrypt.hash(password, 10), role: 'ADMIN' } });
  const employee = await prisma.user.upsert({ where: { username: 'mobile-sales-employee' }, update: {}, create: { username: 'mobile-sales-employee', fullName: 'Fixture Employee', password: await bcrypt.hash(password, 10), role: 'EMPLOYEE' } });
  const branch = await prisma.branch.upsert({ where: { code: 'MOBILE-QA' }, update: {}, create: { code: 'MOBILE-QA', name: 'Fixture branch A', createdById: admin.id } });
  await prisma.userBranchAccess.upsert({ where: { userId_branchId: { userId: employee.id, branchId: branch.id } }, update: {}, create: { userId: employee.id, branchId: branch.id, grantedById: admin.id } });
  let tax = await prisma.taxProfile.findFirst({ where: { isDefault: true } });
  if (!tax) { const rate = await prisma.taxRate.create({ data: { code: 'QA-VAT-11', name: 'Fixture VAT 11%', nameAr: 'Fixture VAT', ratePercent: '11.000', effectiveFrom: new Date('2020-01-01T00:00:00Z'), createdById: admin.id } }); tax = await prisma.taxProfile.create({ data: { code: 'QA-STANDARD', name: 'Fixture standard', nameAr: 'Fixture standard', taxRateId: rate.id, isDefault: true } }); }
  const product = await prisma.product.upsert({ where: { sku: 'QA-MOBILE-DRILL' }, update: {}, create: { sku: 'QA-MOBILE-DRILL', name: 'Fixture drill', model: 'QA only', barcode: '1234567890128', price: '139.00', priceCurrency: 'USD', priceIncludesVat: true, trackStock: true, stockQuantity: 12, createdById: admin.id, taxProfileId: tax.id } });
  await prisma.businessSettings.upsert({ where: { id: 'primary' }, update: {}, create: { id: 'primary', shopName: 'Fixture Shop', address: 'Synthetic address', phone: '+961 00 000 000', email: 'fixture@example.test', taxNumber: 'QA-VAT' } });
  const backendFile = path.join(scratch, 'backend.cjs');
  await esbuild.build({ stdin: { contents: `export {app} from './backend/src/app'; export {createMobileApiGateway} from './backend/src/features/scanner/mobile-api-gateway';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: backendFile, logLevel: 'silent' });
  const { app, createMobileApiGateway } = require(backendFile);
  const api = await new Promise((resolve, reject) => { const server = app.listen(3001, '127.0.0.1', () => resolve(server)); server.on('error', reject); });
  const gateway = express().use(createMobileApiGateway(3001));
  const lan = await new Promise((resolve, reject) => { const server = gateway.listen(3011, '127.0.0.1', () => resolve(server)); server.on('error', reject); });
  const credentials = {};
  for (const [role, username] of [['admin', admin.username], ['employee', employee.username]]) {
    const response = await fetch('http://127.0.0.1:3011/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const payload = await response.json();
    if (!payload.success) throw new Error('Synthetic login failed: ' + JSON.stringify(payload));
    credentials[role] = { token: payload.data.accessToken, refreshToken: response.headers.get('X-Refresh-Token'), user: payload.data.user };
  }
  fs.writeFileSync(path.join(scratch, 'session.json'), JSON.stringify({ ...credentials, branchId: branch.id, productId: product.id }));
  console.log('Real desktop API :3001 and production gateway :3011 ready against isolated mobile_sales_qa.');
  const finish = async () => { api.close(); lan.close(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGINT', finish); process.on('SIGTERM', finish);
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
