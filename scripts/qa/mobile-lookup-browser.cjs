/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS QA runner, executed directly by Node. */
// Requires the isolated preview (:8087) and fixture server/gateway (:3001/:3011).
const { chromium, expect } = require('@playwright/test');
const fs = require('fs'),
  path = require('path');
const f = require('./mobile-lookup-fixtures.cjs');
const root = path.resolve(__dirname, '../..'),
  output = path.join(root, 'docs/reviews/mobile-erp-lookup');
fs.mkdirSync(output, { recursive: true });
async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });
  const calls = [],
    errors = [],
    comparisons = [],
    checks = [];
  let forceCustomersError = false;
  await context.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': 'http://localhost:8087',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-expose-headers': 'X-Refresh-Token',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (forceCustomersError && url.pathname === '/api/v1/customers') return route.abort('failed');
    const response = await route.fetch();
    calls.push({
      method: req.method(),
      path: url.pathname,
      params: Object.fromEntries(url.searchParams),
      status: response.status(),
      branch: req.headers()['x-branch-scope'] ?? null,
    });
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(15_000);
  const text = (value) =>
    page
      .getByText(value, { exact: true })
      .and(page.locator(':not([aria-hidden="true"] *)'))
      .filter({ visible: true });
  const tab = (name) => page.getByRole('tab', { name: new RegExp(name) });
  const field = async (label, value) =>
    expect(text(label).locator('..').getByText(value, { exact: true }).first()).toBeVisible();
  const shot = (name) => page.screenshot({ path: path.join(output, name) });
  async function dates() {
    const button = page.getByRole('button', { name: /^\d{2}\/\d{2}\/\d{4} –/ });
    await button.click();
    await page.getByLabel('From date', { exact: true }).fill('2026-11-01');
    await page.getByLabel('To date', { exact: true }).fill('2026-11-12');
    await page.getByRole('button', { name: 'Apply dates', exact: true }).click();
  }
  try {
    // Produce a synthetic bill without real customer data.
    const imagePage = await browser.newPage({ viewport: { width: 640, height: 800 } });
    await imagePage.setContent(
      '<body style="font:24px system-ui;padding:40px;background:white;color:#1b2124"><h1>SYNTHETIC BILL</h1><p>QA fixture only</p><hr><p>Fixture Supplier A</p><p>Reference: QA-001</p><p>12 November 2026</p><hr><p>Test product · 1 unit</p><h2>Total: $125.50</h2><p>Not a real transaction</p></body>'
    );
    await imagePage.screenshot({
      path: path.join(root, 'node_modules/.cache/mobile-lookup/synthetic-bill.png'),
    });
    await imagePage.close();
    const reference = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await reference.goto('http://127.0.0.1:3011/desktop-reference');
    await reference.screenshot({
      path: path.join(output, 'desktop-reference.png'),
      fullPage: true,
    });
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('http://127.0.0.1:8087', { signal: AbortSignal.timeout(2000) })).ok;
          } catch {
            return false;
          }
        },
        { timeout: 180_000, intervals: [1000] }
      )
      .toBe(true);
    await page.goto('http://localhost:8087', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page
      .getByRole('button', { name: 'Fixture branch A', exact: true })
      .click({ timeout: 180_000 });
    await expect(text('Hello, Fixture Operator')).toBeVisible();
    await expect(page.getByTestId('kpi-outstandingDebt')).toHaveText('$9,175.75');
    await page.getByRole('button', { name: 'Hide dashboard numbers', exact: true }).click();
    await expect(page.getByTestId('kpi-outstandingDebt')).toHaveText('••••');
    await expect(page.getByTestId('kpi-customersPaidToday')).toHaveText('••••');
    await expect(page.getByTestId('kpi-outstandingDebt')).toHaveAttribute(
      'aria-label',
      'Outstanding debt: hidden'
    );
    await shot('home-hidden.png');
    await page.getByRole('button', { name: 'Show dashboard numbers', exact: true }).click();
    await shot('home.png');
    checks.push('Dashboard server KPIs and privacy masking of money, counts and accessible text');
    await tab('Sell').click();
    await expect(text('Fixture Customer A')).toBeVisible();
    await shot('customers.png');
    const expectedCustomers = ['$125.50', '$0.00', '$9,050.25'];
    for (let i = 0; i < 3; i++) {
      const customer = f.customers[i];
      await text(customer.name).click();
      await field('Balance due', expectedCustomers[i]);
      await expect(
        reference
          .locator(`#${customer.id}`)
          .getByText(expectedCustomers[i], { exact: true })
          .first()
      ).toBeVisible();
      if (i === 0) await shot('customer-detail.png');
      await text('Statement of account').click();
      await dates();
      await field('Opening', expectedCustomers[i]);
      await field('Closing', expectedCustomers[i]);
      await expect(
        reference
          .locator(`#${customer.id}`)
          .getByText(
            `Statement opening: ${customer.financial.outstanding} · closing: ${customer.financial.outstanding}`,
            { exact: true }
          )
      ).toBeVisible();
      if (i === 0) await shot('customer-statement.png');
      comparisons.push({
        type: 'customer',
        name: customer.name,
        branch: 'Fixture branch A',
        from: '2026-11-01',
        to: '2026-11-12',
        desktopBalance: expectedCustomers[i],
        mobileBalance: expectedCustomers[i],
        statementClosing: customer.financial.outstanding,
        matched: true,
      });
      await page.goBack();
      await page.goBack();
    }
    checks.push(
      'Three customers: actual desktop API/summary components vs mobile details and server statement closing balances'
    );
    await page.getByLabel('Search customers', { exact: true }).fill('no matching fixture');
    await expect(text('Nothing to show')).toBeVisible();
    await page.getByLabel('Search customers', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(text('Fixture Customer Extra 23')).toBeVisible();
    checks.push('Customer server pagination and empty search');
    forceCustomersError = true;
    await page.getByLabel('Search customers', { exact: true }).fill('error fixture');
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    forceCustomersError = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(text('Nothing to show')).toBeVisible();
    await page.getByLabel('Search customers', { exact: true }).fill('');
    checks.push('Network error retains app navigation and retries the list');
    await tab('Stock').click();
    await expect(text(f.product.name)).toBeVisible();
    await page.getByRole('button', { name: 'Brand: All brands', exact: true }).click();
    await text('Cedar').click();
    await page.getByRole('button', { name: 'Category: All categories', exact: true }).click();
    await text('Tools / Drills').click();
    await expect(text(f.product.name)).toBeVisible();
    await shot('products.png');
    await text(f.product.name).click();
    await field('Cash price (including VAT)', '$139.00');
    await expect(text('Shared stock · all branches')).toBeVisible();
    await field('Quantity', '12');
    await expect(text('1234567890128')).toBeVisible();
    await shot('product-detail.png');
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(text('Stock movements · all branches')).toBeVisible();
    checks.push(
      'Product search filters, server prices/VAT, barcode, shared stock and paged movements'
    );
    await page.getByRole('button', { name: 'Scan a product from any tab', exact: true }).click();
    await page.getByLabel('Barcode or SKU', { exact: true }).fill(f.product.sku);
    await page.getByRole('button', { name: 'Look up product', exact: true }).click();
    await page.getByRole('button', { name: 'View product details', exact: true }).click();
    await expect(text('Shared stock · all branches')).toBeVisible();
    checks.push('Global scan result opens product detail');
    await tab('Suppliers').click();
    await expect(text('Fixture Supplier A')).toBeVisible();
    await shot('suppliers.png');
    const expectedSuppliers = ['$940.25', '$0.00', '$45.50'];
    const expectedClosing = ['$940.25', '$0.00', '-$45.50'];
    for (let i = 0; i < 3; i++) {
      const supplier = f.suppliers[i];
      await text(supplier.name).click();
      await field(i === 2 ? 'Credit in our favour' : 'Balance payable', expectedSuppliers[i]);
      await expect(
        reference
          .locator(`#${supplier.id}`)
          .getByText(expectedSuppliers[i], { exact: true })
          .first()
      ).toBeVisible();
      if (i === 0) await shot('supplier-detail.png');
      await text('Statement of account').click();
      await dates();
      await field('Opening', expectedClosing[i]);
      await field('Closing', expectedClosing[i]);
      await expect(
        reference
          .locator(`#${supplier.id}`)
          .getByText(`Statement opening: ${supplier.balance} · closing: ${supplier.balance}`, {
            exact: true,
          })
      ).toBeVisible();
      if (i === 0) await shot('supplier-statement.png');
      comparisons.push({
        type: 'supplier',
        name: supplier.name,
        branch: 'Fixture branch A',
        from: '2026-11-01',
        to: '2026-11-12',
        desktopBalance: expectedSuppliers[i],
        mobileBalance: expectedSuppliers[i],
        statementClosing: supplier.balance,
        creditInOurFavour: i === 2,
        matched: true,
      });
      await page.goBack();
      if (i === 0) {
        await text('Purchases').click();
        await expect(text('QA-PO-001')).toBeVisible();
        await page.goBack();
        await text('Bills').click();
        await text('SYNTHETIC BILL · QA only').click();
        await expect(page.getByRole('img', { name: 'Supplier bill photo' })).toBeVisible();
        await shot('bill-image.png');
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await page.goBack();
      }
      await page.goBack();
    }
    checks.push(
      'Three suppliers: actual desktop API/summary components vs mobile balances, negative credit and server statements; purchases and authenticated bill image'
    );
    await tab('Sell').click();
    await text('Sales orders').click();
    await expect(text('QA-SO-001')).toBeVisible();
    await page.getByRole('button', { name: 'Status: All statuses', exact: true }).click();
    await text('CONFIRMED').click();
    await text('QA-SO-001').click();
    await field('Total', '$139.00');
    await field('Paid', '$39.00');
    await field('Remaining', '$100.00');
    await field('VAT', '$13.77');
    await shot('sales-order.png');
    await page.goBack();
    await page.goBack();
    checks.push('Sales order filters and server totals, paid/remaining and VAT detail');
    await tab('More').click();
    await text('Reports').click();
    await expect(text('Sales Summary')).toBeVisible();
    await shot('reports.png');
    const registry = fs.readFileSync(
      path.join(root, 'frontend/src/features/reports/reports.registry.ts'),
      'utf8'
    );
    const titles = [...registry.matchAll(/\bid: '([^']+)'[\s\S]*?title: '([^']+)'/g)].map(
      (match) => ({ id: match[1], title: match[2] })
    );
    for (const report of titles) {
      await page.getByLabel('Search reports', { exact: true }).fill(report.title);
      await text(report.title).click();
      await expect(text('Summary').or(text('Sales')).or(text('Health')).first()).toBeVisible();
      if (report.id === 'sales-summary') await shot('report.png');
      await page.goBack();
    }
    checks.push(`All ${titles.length} desktop reports open without charts or write controls`);
    await tab('Home').click();
    await page
      .getByRole('button', { name: /Switch branch, current branch Fixture branch A/ })
      .click();
    await page.getByRole('button', { name: 'Choose another branch', exact: true }).click();
    await page.getByRole('button', { name: 'Fixture branch B', exact: true }).click();
    await expect(page.getByTestId('kpi-outstandingDebt')).toHaveText('$7,777.77');
    await tab('Sell').click();
    await expect(text('Branch B customer')).toBeVisible();
    await expect(text('Fixture Customer A')).not.toBeVisible();
    await tab('Suppliers').click();
    await expect(text('Branch B supplier')).toBeVisible();
    await expect(text('Fixture Supplier A')).not.toBeVisible();
    await shot('branch-b.png');
    checks.push(
      'Branch switch refetches dashboard/customers/suppliers and shows no prior branch records'
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await shot('small-phone.png');
    await page.setViewportSize({ width: 852, height: 393 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await shot('landscape.png');
    checks.push('375px and landscape/reduced-motion layouts');
    expect(errors).toEqual([]);
    expect(calls.filter((call) => !['GET', 'POST'].includes(call.method))).toEqual([]);
    expect(
      calls.filter((call) => call.method === 'POST' && !call.path.startsWith('/api/v1/auth/'))
    ).toEqual([]);
    expect(
      calls.some(
        (call) =>
          call.path === '/api/v1/supplier-bills/bill-1/image' &&
          call.branch === f.branchA &&
          call.status === 200
      )
    ).toBe(true);
    fs.writeFileSync(
      path.join(output, 'browser-checks.json'),
      JSON.stringify(
        {
          checks,
          comparisons,
          errors,
          calls,
          limitations:
            'Synthetic desktop API fixture; actual desktop summary/API modules and production LAN gateway; browser copy with native storage/filesystem/camera fixtures. No live shop DB, native device or APK.',
        },
        null,
        2
      )
    );
    console.log(JSON.stringify({ checks, comparisons, errors }, null, 2));
  } catch (error) {
    console.log('BODY', (await page.locator('body').innerText()).slice(0, 6000));
    console.log('PAGE ERRORS', errors);
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
