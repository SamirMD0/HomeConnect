import { randomUUID } from 'crypto';
import { test, expect, login, api, apiOrigin, db, password } from './support';

test.afterAll(async () => {
  await db.$disconnect();
});

test('authentication: UI login/logout and rejected disabled/invalid sessions', async ({
  page,
  request,
}) => {
  await login(page);
  await page.getByRole('button', { name: /log out|logout|sign out/i }).click();
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  const disabled = await request.post(`${apiOrigin}/auth/login`, {
    data: { username: 'audit_disabled', password },
  });
  expect([401, 403]).toContain(disabled.status());
  const invalid = await request.get(`${apiOrigin}/products`, {
    headers: { Authorization: 'Bearer invalid-session' },
  });
  expect(invalid.status()).toBe(401);
});

test('products: search, edit notes, preserve price and barcode', async ({ page }) => {
  await login(page);
  // Isolate the notes-edit assertion from any prior run's notes on the same
  // fixture row: pin the starting value and choose a new target string per
  // run. Both make the test insensitive to whatever the DB currently holds
  // for AUDIT-KETTLE-AUDIT.notes.
  const priorNotes = `pre-edit ${randomUUID()}`;
  const targetNotes = `Release audit verified product notes ${randomUUID()}`;
  const product = await db.product.update({
    where: { sku: 'AUDIT-KETTLE-AUDIT' },
    data: { notes: priorNotes },
  });
  await page.goto('/#/products?search=KETTLE-AUDIT');
  await page.getByRole('button', { name: /Open Audit Kettle details/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Edit/ }).first().click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel(/^Product Notes/).fill(targetNotes);
  const pw = modal.locator('input[type=password]');
  if (await pw.count()) await pw.fill(password);
  await modal
    .getByRole('button', { name: /Save|Update/ })
    .last()
    .click();
  await expect(modal).not.toBeVisible();
  const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(after.notes).toBe(targetNotes);
  expect(after.price?.toString()).toBe(product.price?.toString());
  expect(after.barcode).toBe(product.barcode);
});

test('CSV import: existing product is shown and requires an explicit merge choice', async ({ page }) => {
  const product = await db.product.findUniqueOrThrow({ where: { sku: 'AUDIT-KETTLE-AUDIT' } });
  const productCount = await db.product.count();
  const sourceSystem = `audit-${randomUUID()}`;
  const csv = 'Family:,Audit Kettle,Code,Description,Qty,Cost USD,Total,KETTLE-AUDIT,Audit Kettle,2,0,0';

  await login(page);
  await page.goto('/#/products');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('input[type=file]').setInputFiles({
    name: 'audit-existing-product.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await modal.getByLabel('Brand', { exact: true }).fill('Generic');
  await modal.getByLabel('Source system').fill(sourceSystem);
  await modal.getByRole('button', { name: 'Read CSV' }).click();
  await expect(modal.getByRole('button', { name: 'Import products' })).toBeDisabled();

  // The matching active category is suggested automatically, but still needs
  // an explicit confirmation before the existing-product conflict is shown.
  await modal.getByRole('button', { name: 'Save mappings and continue to conflict review' }).click();
  const review = modal.locator('section').filter({ hasText: 'Conflict review' });
  await expect(review.getByText(`${product.sku} — ${product.name}`)).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Import products' })).toBeDisabled();
  await review.getByLabel('Decision').selectOption('MERGE');
  await review.getByLabel('Existing product').selectOption(product.id);
  await expect(modal.getByRole('button', { name: 'Import products' })).toBeEnabled();
  await modal.getByRole('button', { name: 'Import products' }).click();
  await expect(modal).not.toBeVisible();

  expect(await db.product.count()).toBe(productCount);
  const identifier = await db.productExternalIdentifier.findFirst({
    where: { sourceSystem, normalizedCode: 'KETTLE-AUDIT' },
  });
  expect(identifier?.productId).toBe(product.id);
  const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(after.stockQuantity).toBe(product.stockQuantity);
});

for (const currency of ['USD', 'LBP'] as const)
  test(`customer ${currency} sale: UI mixed cash/debt, stock deduction and partial refund`, async ({
    page,
    request,
  }, info) => {
    await login(page);
    const call = await api(request);
    const model = currency === 'USD' ? 'TV-AUDIT' : 'LBP-AUDIT';
    const product = await db.product.findUniqueOrThrow({ where: { sku: `AUDIT-${model}` } });
    const startStock = product.stockQuantity;
    await page.goto('/#/sales-orders');
    await page
      .getByRole('button', { name: /Add Order/ })
      .first()
      .click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel(/Transaction currency/).selectOption(currency);
    await modal.getByLabel(/^Payment/).selectOption('PARTIAL');
    await modal.getByLabel(/Paid amount/).fill(currency === 'USD' ? '600' : '53700000');
    await modal.getByLabel(/Debt due date/).fill('2026-12-31');
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await modal.getByRole('button', { name: /Audit Customer/ }).click();
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await modal.getByPlaceholder(/Name, model, SKU or barcode/).fill(model);
    await modal.getByRole('button').filter({ hasText: product.name }).first().click();
    await modal.getByLabel(/^Quantity/).fill('2');
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/sales-orders') && r.request().method() === 'POST'
    );
    await modal.getByRole('button', { name: 'Confirm order', exact: true }).click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    const order = (await response.json()).data;
    expect(order.totalAmount).toBe(currency === 'USD' ? '800.00' : '71600000');
    const original = await db.salesOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    await page.goto(`/#/sales-orders/${order.id}`);
    await page.getByRole('checkbox', { name: `Select ${product.name}`, exact: true }).check();
    await page.getByRole('button', { name: /Deduct Stock/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Confirm/ })
      .click();
    await expect
      .poll(
        async () =>
          (await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity
      )
      .toBe(startStock - 2);
    await page.getByRole('button', { name: 'Return', exact: true }).click();
    const returnModal = page.getByRole('dialog');
    await returnModal.getByLabel(/Return quantity/).fill('1');
    await returnModal.getByLabel(/Refund destination/).selectOption('CASH_OUT');
    await returnModal.getByLabel(/Return reason/).fill('Release audit partial return');
    await returnModal.getByLabel(/Account password/).fill(password);
    const posted = page.waitForResponse(
      (r) => r.url().endsWith(`/${order.id}/return`) && r.request().method() === 'POST'
    );
    await returnModal.getByRole('button', { name: /Post return/ }).click();
    const returnedResponse = await posted;
    expect(returnedResponse.ok(), await returnedResponse.text()).toBeTruthy();
    const returned = (await returnedResponse.json()).data;
    await expect(page).toHaveURL(/sales-returns/);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
      startStock - 1
    );
    const persisted = await db.salesReturn.findUniqueOrThrow({ where: { id: returned.id } });
    const after = await db.salesOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(after.exchangeRate.toString()).toBe(original.exchangeRate.toString());
    expect(after.items[0].vatAmount.toString()).toBe(original.items[0].vatAmount.toString());
    const replay = await call(
      'POST',
      `/sales-orders/${order.id}/return`,
      posted ? returnedResponse.request().postDataJSON() : undefined
    );
    expect(replay.id).toBe(returned.id);
    expect(await db.salesReturn.count({ where: { salesOrderId: order.id } })).toBe(1);
    await info.attach('financial-scenario', {
      body: Buffer.from(
        JSON.stringify(
          {
            currency,
            orderId: order.id,
            total: order.totalAmount,
            return: persisted,
            stockBefore: startStock,
            stockAfter: startStock - 1,
          },
          null,
          2
        )
      ),
      contentType: 'application/json',
    });
  });

test('walk-in cash: UI sale creates exactly one customerless receipt', async ({ page }) => {
  await login(page);
  const product = await db.product.findUniqueOrThrow({ where: { sku: 'AUDIT-VGR-AUDIT' } });
  await page.goto(`/#/sales-orders?productId=${product.id}`);
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel(/Unit price/)).toHaveValue('400.00');
  await modal.getByRole('button', { name: 'Next', exact: true }).click();
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/sales-orders') && r.request().method() === 'POST'
  );
  await modal.getByRole('button', { name: 'Confirm order', exact: true }).click();
  const r = await created;
  expect(r.status(), await r.text()).toBe(201);
  const order = (await r.json()).data;
  const receipts = await db.payment.findMany({ where: { salesOrderId: order.id } });
  expect(receipts).toHaveLength(1);
  expect(receipts[0].customerId).toBeNull();
  expect(receipts[0].totalAmount.toString()).toBe('400');
});

test('purchasing and receiving: retry preserves stock, cost, manual price and supplier ledger', async ({
  page,
  request,
}) => {
  await login(page);
  const call = await api(request);
  const supplier = await call('POST', '/suppliers', {
    name: `Audit Supplier ${randomUUID().slice(0, 8)}`,
    phone: '71000002',
  });
  const product = await db.product.findUniqueOrThrow({ where: { sku: 'AUDIT-WASH-AUDIT' } });
  const data = {
    idempotencyKey: `audit-${randomUUID()}`,
    transactionDate: new Date().toISOString().slice(0, 10),
    dueDate: '2026-12-31',
    description: 'Release audit receiving',
    currency: 'USD',
    receiveStock: true,
    lines: [
      {
        kind: 'EXISTING_PRODUCT',
        productId: product.id,
        quantity: 3,
        unitPrice: '380.00',
        priceIncludesVat: true,
      },
    ],
  };
  const first = await call('POST', `/suppliers/${supplier.id}/purchases`, data);
  const second = await call('POST', `/suppliers/${supplier.id}/purchases`, data);
  expect(second).toEqual(first);
  const updated = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(updated.stockQuantity).toBe(product.stockQuantity + 3);
  expect(updated.price?.toString()).toBe('400');
  expect(updated.costPrice?.toString()).toBe('342.34'); // 380 VAT-inclusive / 1.11, rounded to cents
  await page.goto(`/#/suppliers/${supplier.id}`);
  await expect(
    page.getByText('Release audit receiving', { exact: true }).filter({ visible: true }).first()
  ).toBeVisible();
});

for (const model of ['TV-AUDIT', 'WASH-AUDIT', 'FRIDGE-AUDIT', 'KETTLE-AUDIT', 'VGR-AUDIT'])
  test(`pricing card ${model}: resolved preview and print preserve barcode and price`, async ({
    page,
  }) => {
    await login(page);
    const product = await db.product.findUniqueOrThrow({ where: { sku: `AUDIT-${model}` } });
    await page.goto('/#/pricing-cards');
    await page.goto(`/#/products/${product.id}/pricing-card`);
    await expect(
      page
        .locator('svg')
        .filter({ has: page.locator('rect') })
        .first()
    ).toBeVisible();
    await expect(page.getByText(model, { exact: false }).first()).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { auditPrints: number }).auditPrints = 0;
      window.print = () => {
        (window as unknown as { auditPrints: number }).auditPrints++;
      };
    });
    await page
      .getByRole('button', { name: /^Print/ })
      .first()
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { auditPrints: number }).auditPrints))
      .toBe(1);
    const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.barcode).toBe(product.barcode);
    expect(after.sku).toBe(product.sku);
    expect(after.price?.toString()).toBe(product.price?.toString());
  });

test('reports reconcile with real workflow data and dashboard loads', async ({ page, request }) => {
  await login(page);
  const call = await api(request);
  for (const route of ['customers/financial-integrity', 'suppliers/financial-integrity']) {
    const report = await call('GET', `/reports/${route}?period=thisMonth`);
    expect(report.summary.mismatches).toBe(0);
    expect(report.summary.difference).toBe('0.00');
  }
  await page.goto('/#/dashboard');
  await expect(page.locator('main')).toBeVisible();
});

test('pricing card: category default, shop fallback, and product override', async ({ page }) => {
  const product = await db.product.findUniqueOrThrow({ where: { sku: 'AUDIT-WASH-AUDIT' }, include: { category: true } });
  const profile = await db.shopProfile.findFirstOrThrow();
  const categoryTemplate = '20000000-0000-4000-8000-000000000002';
  const categoryTemplateRow = await db.pricingCardTemplate.findUniqueOrThrow({ where: { id: categoryTemplate } });
  const productTemplate = '20000000-0000-4000-8000-000000000003';
  const shopTemplate = profile.defaultPricingCardTemplateId!;
  const categoryDefaults = profile.categoryDefaultTemplates as Record<string, string>;
  const card = page.locator('.pricing-card').first();
  await login(page);
  try {
    await db.product.update({ where: { id: product.id }, data: { pricingCardTemplateId: null } });
    await db.shopProfile.update({ where: { id: profile.id }, data: { categoryDefaultTemplates: { ...categoryDefaults, [product.category!.name]: categoryTemplate } } });
    await page.goto(`/#/products/${product.id}/pricing-card`);
    await expect(page.getByLabel('Template')).toHaveValue(categoryTemplate);
    await expect(card).toHaveCSS('--pricing-card-width', `${categoryTemplateRow.cardWidthMm}mm`);

    await db.shopProfile.update({ where: { id: profile.id }, data: { categoryDefaultTemplates: categoryDefaults } });
    await page.reload();
    await expect(page.getByLabel('Template')).toHaveValue(shopTemplate);

    await db.product.update({ where: { id: product.id }, data: { pricingCardTemplateId: productTemplate } });
    await db.shopProfile.update({ where: { id: profile.id }, data: { categoryDefaultTemplates: { ...categoryDefaults, [product.category!.name]: categoryTemplate } } });
    await page.reload();
    await expect(page.getByLabel('Template')).toHaveValue(productTemplate);
  } finally {
    await db.product.update({ where: { id: product.id }, data: { pricingCardTemplateId: product.pricingCardTemplateId } });
    await db.shopProfile.update({ where: { id: profile.id }, data: { categoryDefaultTemplates: profile.categoryDefaultTemplates as object } });
  }
});

test('pricing card: secret preset changes staff code, not public price or barcode', async ({ page }) => {
  const product = await db.product.findUniqueOrThrow({ where: { sku: 'AUDIT-TV-AUDIT' } });
  const admin = await db.user.findUniqueOrThrow({ where: { username: 'audit_admin' } });
  const publicPreset = await db.pricingPreset.create({ data: {
    name: `Audit public ${randomUUID()}`, expensePercent: '0', profitPercent: '20',
    discountBufferPercent: '0', installmentMarkupPercent: '0', downPaymentPercent: '100',
    defaultInstallmentMonths: 1, createdById: admin.id,
  } });
  const hiddenPreset = await db.pricingPreset.create({ data: {
    name: `Audit hidden ${randomUUID()}`, expensePercent: '0', profitPercent: '0',
    discountBufferPercent: '0', installmentMarkupPercent: '0', downPaymentPercent: '100',
    defaultInstallmentMonths: 1, isLabelSecretAllowed: true, createdById: admin.id,
  } });
  await login(page);
  try {
    await db.product.update({ where: { id: product.id }, data: { price: null, pricingPresetId: publicPreset.id } });
    await page.goto(`/#/products/${product.id}/pricing-card`);
    const card = page.locator('.pricing-card').first();
    const publicPrice = await card.locator('.pricing-card-price').innerText();
    const originalBarcode = await card.locator('.pricing-card-barcode').getAttribute('aria-label');
    await page.getByLabel('Hidden pricing preset').selectOption(hiddenPreset.id);
    await page.getByLabel('Encoding').selectOption('6d66215e-8224-4c1c-9cd6-70c8c2ffde01');
    await page.getByLabel('Admin password').fill(password);
    const responsePromise = page.waitForResponse((r) => r.url().includes(`/products/${product.id}/pricing-card/secret-preview`) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Apply to this print run' }).click();
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(200);
    const payload = (await response.json()).data.payload;
    expect(payload.secretPrice).toBe('370.00');
    expect(payload.internalPriceCode).toBeTruthy();
    expect(payload.staffLabelCode).toContain(payload.internalPriceCode);
    expect(payload.barcodeValue).toBe(product.sku);
    expect(payload.barcodeValue).not.toContain(payload.internalPriceCode);
    await expect(card.locator('.pricing-card-price')).toHaveText(publicPrice);
    await expect(card.locator('.pricing-card-sku')).toContainText(payload.staffLabelCode);
    await expect(card.locator('.pricing-card-barcode')).toHaveAttribute('aria-label', originalBarcode!);
    await expect(page.getByText('Internal source price:')).toContainText('370.00');
    const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.barcode).toBe(product.barcode);
    expect(after.sku).toBe(product.sku);
    expect(after.price).toBeNull();
  } finally {
    await db.product.update({ where: { id: product.id }, data: { price: product.price, pricingPresetId: product.pricingPresetId } });
    await db.pricingPreset.delete({ where: { id: hiddenPreset.id } });
    await db.pricingPreset.delete({ where: { id: publicPreset.id } });
  }
});

test('pricing card: brand logo and feature icons render with text fallback', async ({ page }) => {
  const product = await db.product.findUniqueOrThrow({ where: { sku: 'AUDIT-TV-AUDIT' } });
  const existingBrand = await db.brandLogo.findUnique({ where: { canonicalName: 'tcl' } });
  const qled = await db.pricingCardFeatureIcon.findUniqueOrThrow({ where: { code: 'qled' } });
  const logoBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
  await login(page);
  try {
    await db.brandLogo.upsert({ where: { canonicalName: 'tcl' }, update: {
      displayName: 'TCL', logoBytes, logoMimeType: 'image/png', logoByteSize: logoBytes.length, isActive: true,
    }, create: { canonicalName: 'tcl', displayName: 'TCL', logoBytes, logoMimeType: 'image/png', logoByteSize: logoBytes.length } });
    await page.goto(`/#/products/${product.id}/pricing-card`);
    const brand = page.locator('.pricing-card-brand-mark').first();
    await expect(brand.locator('.pricing-card-brand-logo')).toBeVisible();
    await expect(brand).not.toContainText('TCL TCL');
    const qledFeature = page.locator('.pricing-card-feature').filter({ hasText: 'QLED' }).first();
    await expect(qledFeature.locator('.pricing-card-feature-icon svg')).toBeVisible();

    await db.brandLogo.update({ where: { canonicalName: 'tcl' }, data: { logoBytes: null, logoMimeType: null, logoByteSize: null } });
    await db.pricingCardFeatureIcon.update({ where: { id: qled.id }, data: { isActive: false } });
    await page.reload();
    await expect(brand.locator('.pricing-card-brand-logo')).toHaveCount(0);
    await expect(brand).toHaveText('TCL');
    await expect(qledFeature).toContainText(/qled/i);
    await expect(qledFeature.locator('.pricing-card-feature-icon svg')).toHaveCount(0);
  } finally {
    await db.pricingCardFeatureIcon.update({ where: { id: qled.id }, data: { isActive: qled.isActive } });
    if (existingBrand) await db.brandLogo.update({ where: { id: existingBrand.id }, data: {
      displayName: existingBrand.displayName, logoBytes: existingBrand.logoBytes,
      logoMimeType: existingBrand.logoMimeType, logoByteSize: existingBrand.logoByteSize,
      isActive: existingBrand.isActive,
    } });
    else await db.brandLogo.delete({ where: { canonicalName: 'tcl' } });
  }
});
