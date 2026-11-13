/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Playwright QA runner. */
const { chromium, expect } = require('@playwright/test'), fs = require('fs'), path = require('path');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'docs/reviews/mobile-erp-sales');
const session = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/.cache/mobile-sales/session.json'), 'utf8'));
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5439/mobile_sales_qa';
const db = new PrismaClient();
fs.mkdirSync(output, { recursive: true });
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  let loseOrderResponse = true, losePaymentResponse = true;
  const calls = [], errors = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const headers = { 'access-control-allow-origin': 'http://localhost:8088', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-expose-headers': 'X-Refresh-Token' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const response = await route.fetch();
    const body = request.postDataJSON();
    calls.push({ method: request.method(), path: url.pathname, status: response.status(), idempotencyKey: body?.idempotencyKey ?? null });
    if (request.method() === 'POST' && response.ok() && ((url.pathname === '/api/v1/sales-orders' && loseOrderResponse) || (/\/(debts|installment-plans)\/[^/]+\/payments$/.test(url.pathname) && losePaymentResponse))) {
      if (url.pathname === '/api/v1/sales-orders') loseOrderResponse = false; else losePaymentResponse = false;
      return route.abort('failed'); // The REAL API has committed; only its response is lost.
    }
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message)); page.setDefaultTimeout(15_000);
  const text = (value) => page.getByText(value, { exact: true }).and(page.locator(':not([aria-hidden="true"] *)')).filter({ visible: true });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const shot = (name) => page.screenshot({ path: path.join(output, name) });
  const readApi = async (route) => { const response = await fetch(`http://127.0.0.1:3001/api/v1${route}`, { headers: { Authorization: `Bearer ${session.admin.token}`, 'X-Branch-Scope': session.branchId } }); const json = await response.json(); if (!json.success) throw new Error(JSON.stringify(json)); return json.data; };
  const field = async (label, value) => expect(text(label).locator('..').getByText(value, { exact: true }).first()).toBeVisible();
  const draftRecords = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('qa-file:') && key.includes('sales-drafts-v1')).map(([, value]) => JSON.parse(value)));
  try {
    await page.goto('http://localhost:8088', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await button('Fixture branch A').click({ timeout: 180_000 });
    await page.getByRole('tab', { name: /Sell/ }).click(); await text('New order').click();
    await button('Create customer').click();
    await page.getByLabel('Customer name', { exact: true }).fill('Fixture Sales Customer');
    await page.getByLabel('Customer phone', { exact: true }).fill('00000000');
    await page.getByLabel('Customer address', { exact: true }).fill('Synthetic address');
    await button('Save customer').click();
    await expect(text('Fixture Sales Customer')).toBeVisible();
    await button('Search products').click(); await text('Fixture drill').click();
    await page.getByLabel('Amount received', { exact: true }).fill('39.00');
    await page.getByLabel('Debt due date', { exact: true }).fill('2026-12-12');
    await shot('order-form.png');
    await expect.poll(async () => (await draftRecords()).some((record) => record.form?.paidAmount === '39.00')).toBe(true);
    const initialKey = (await draftRecords()).find((record) => record.form?.paidAmount === '39.00').idempotencyKey;
    await page.reload(); await expect(page.getByLabel('Amount received', { exact: true })).toHaveValue('39.00');
    expect((await draftRecords()).some((record) => record.idempotencyKey === initialKey)).toBe(true);
    await button('Confirm order').click();
    await expect(text('Cannot reach the Home Connect server. Check Wi-Fi and the backend URL.')).toBeVisible();
    await shot('order-retry.png');
    await context.setOffline(true); await button('Retry original submission').click();
    await expect(button('Retry original submission')).toBeEnabled(); await context.setOffline(false);
    await page.reload(); await button('Retry original submission').click();
    await expect(text('Order saved')).toBeVisible();
    await field('Total from PC', '$139.00'); await field('VAT', '$13.77'); await field('Remaining', '$100.00');
    await shot('order-saved.png');
    const orders = await db.salesOrder.findMany({ where: { idempotencyKey: initialKey } });
    expect(orders).toHaveLength(1);
    const desktopOrder = await readApi(`/sales-orders/${orders[0].id}`);
    expect(desktopOrder.totalAmount).toBe('139.00'); expect(desktopOrder.vatAmount).toBe('13.77'); expect(desktopOrder.remainingAmount).toBe('100.00');
    await button('View saved order').click(); await field('Total', '$139.00');
    const customer = await db.customer.findUniqueOrThrow({ where: { id: orders[0].customerId } });
    await page.goto(`http://localhost:8088/sell/customer/${customer.id}`);
    await button('Take payment').click(); await button(new RegExp('^Pay Sales order ')).click();
    await page.getByLabel('Payment amount (USD)', { exact: true }).fill('25.50');
    await page.getByLabel('Payment reference', { exact: true }).fill('SYNTHETIC-QA');
    await shot('payment-form.png');
    await expect.poll(async () => (await draftRecords()).some((record) => record.form?.amount === '25.50')).toBe(true);
    const paymentKey = (await draftRecords()).find((record) => record.form?.amount === '25.50').idempotencyKey;
    await button('Record payment').click(); await expect(button('Retry original payment')).toBeVisible();
    await expect(text('Cannot reach the Home Connect server. Check Wi-Fi and the backend URL.')).toBeVisible();
    await context.setOffline(true); await button('Retry original payment').click(); await expect(button('Retry original payment')).toBeEnabled(); await context.setOffline(false);
    await page.reload(); await button('Retry original payment').click();
    await expect(text('Payment saved')).toBeVisible(); await field('New customer balance from PC', '$74.50');
    await shot('payment-saved.png');
    const payments = await db.payment.findMany({ where: { idempotencyKey: paymentKey } }); expect(payments).toHaveLength(1);
    const desktopFinancial = await readApi(`/customers/${customer.id}/financial-summary`); expect(desktopFinancial.summary.totalOutstanding).toBe('74.50');
    await button('View and share receipt').click(); await field('Amount received', '$25.50'); await shot('receipt.png');
    await button('Share receipt PDF').click();
    await expect.poll(() => page.evaluate(() => window.__receiptShare?.mimeType)).toBe('application/pdf');
    const html = await page.evaluate(() => window.__receiptHtml); expect(html).toContain('$25.50'); expect(html).toContain('$74.50');
    const receiptPage = await browser.newPage({ viewport: { width: 794, height: 1123 } }); await receiptPage.setContent(html);
    await receiptPage.screenshot({ path: path.join(output, 'receipt-document.png'), fullPage: true });
    await receiptPage.pdf({ path: path.join(output, 'synthetic-receipt.pdf'), format: 'A4', printBackground: true }); await receiptPage.close();
    await page.setViewportSize({ width: 375, height: 812 }); await shot('small-phone.png');
    await page.setViewportSize({ width: 852, height: 393 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await shot('landscape.png');
    const receipt = await readApi(`/payments/${payments[0].id}/receipt`);
    const result = { order: { count: orders.length, total: desktopOrder.totalAmount, vat: desktopOrder.vatAmount, paid: desktopOrder.paidAmount, remaining: desktopOrder.remainingAmount, idempotencyKey: initialKey }, payment: { count: payments.length, amount: receipt.totalAmount, updatedCustomerBalance: desktopFinancial.summary.totalOutstanding, idempotencyKey: paymentKey }, calls, errors, limitations: 'Real production API/gateway and disposable Postgres. Browser native adapters; response loss and offline mode simulated. Android camera and share sheet not exercised. PDF artifact rendered with Chromium from the same receipt HTML.' };
    expect(errors).toEqual([]);
    fs.writeFileSync(path.join(output, 'runtime-checks.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.log('BODY', (await page.locator('body').innerText()).slice(0, 7000)); console.log('ERRORS', errors); throw error; }
  finally { await browser.close(); await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
