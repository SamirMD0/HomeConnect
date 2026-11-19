import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { cloudE2eEnabled } from '../../test/cloud-e2e-databases';
vi.unmock('../../lib/user-session-status');

const enabled = cloudE2eEnabled();
// Dynamic imports keep the Node-only harness and independent relay out of the PC build graph.
const root = process.cwd(),
  phonePath = resolve(root, 'Mobile Scanner/src/offline/testing/cloud-phone.ts'),
  relayPath = resolve(root, 'backend/src/relay');
const nativeFetch = globalThis.fetch,
  origin = 'https://cloud-e2e.invalid';
type Modules = Record<string, any>;
type Metric = { scenario: string; requests: number; bytesIn: number; bytesOut: number };
(enabled ? describe : describe.skip).sequential(
  'whole cloud chain on disposable PC and relay databases',
  () => {
    let pc: PrismaClient,
      relayDb: any,
      pcServer: Server,
      relayServer: Server,
      relayApp: express.Express,
      worker: Modules,
      phoneModule: Modules;
    let pairing: Modules,
      phone: any,
      staffPhone: any,
      restorePhone: any,
      branchId: string,
      debtId: string,
      pcUrl: string,
      relayUrl: string;
    const userId = randomUUID(),
      staffId = randomUUID(),
      customerId = randomUUID(),
      supplierId = randomUUID(),
      productId = randomUUID();
    const secret = randomBytes(32).toString('hex'),
      date = new Date().toISOString().slice(0, 10),
      metrics: Metric[] = [];
    const original = {
      DATABASE_URL: process.env.DATABASE_URL,
      RELAY_DATABASE_URL: process.env.RELAY_DATABASE_URL,
      PORT: process.env.PORT,
    };
    const owned: { client: PrismaClient; name: string }[] = [];
    const globalPc = globalThis as typeof globalThis & { prisma?: PrismaClient };
    const originalPc = globalPc.prisma;
    let privatePcName = '';
    let relayFactory: () => express.Express;
    const staffWire: any[] = [];
    let killPush = false,
      killed: Promise<void> | undefined,
      scenarioClock = 0;
    let metric: Metric = { scenario: 'setup', requests: 0, bytesIn: 0, bytesOut: 0 };
    const listen = async (app: express.Express, port = 0) => {
      const server = app.listen(port, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', resolve));
      return server;
    };
    const close = async (server: Server | undefined) => {
      if (!server?.listening) return;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    };
    async function database(base: string, label: string) {
      const client = new PrismaClient({ datasources: { db: { url: base } } }),
        name = `cloud_e2e_${label}_${randomBytes(6).toString('hex')}_test`;
      await client.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      owned.push({ client, name });
      const url = new URL(base);
      url.pathname = '/' + name;
      return url.toString();
    }
    const transport: typeof fetch = (url, init) =>
      nativeFetch(
        String(url).startsWith(origin + '/') ? relayUrl + String(url).slice(origin.length) : url,
        init
      );
    async function pcRequest(
      path: string,
      body?: unknown,
      method = body === undefined ? 'GET' : 'POST'
    ) {
      const response = await nativeFetch(pcUrl + '/api/v1' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + jwt.sign({ userId, role: 'ADMIN' }, process.env.JWT_SECRET!),
          'X-Branch-Scope': branchId,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBeLessThan(300);
      return result.data;
    }
    const cycle = async () => {
      await worker.syncWorker.cycle();
      const state = await pc.syncWorkerState.findUniqueOrThrow({ where: { id: 1 } });
      expect(state.lastError).toBeNull();
      return state;
    };
    const row = async (device: any, entity: string, id: string) =>
      (await device.db.query('SELECT data FROM records WHERE entity=? AND id=?', [entity, id]))[0];
    async function expectCopyMatchesPc(device: any) {
      const { sourcePage, snapshotEntities } = await import('./worker/worker-source.js');
      const cutoff = new Date(date + 'T00:00:00Z');
      cutoff.setUTCDate(cutoff.getUTCDate() - 90);
      const expected: { entity: string; id: string; branch_id: string | null; data: unknown }[] =
        [];
      for (const entity of snapshotEntities) {
        let after = '';
        while (true) {
          const page = await sourcePage(entity, after, cutoff.toISOString(), {
            mode: 'all',
            branchIds: [branchId],
          });
          for (const record of page.records)
            if (record.op === 'upsert')
              expected.push({
                entity: record.entity,
                id: record.id,
                branch_id: record.branchId,
                data: JSON.parse(JSON.stringify(record.data)),
              });
          if (page.done) break;
          after = page.after;
        }
      }
      const compare = (a: { entity: string; id: string }, b: { entity: string; id: string }) =>
        (a.entity + ':' + a.id).localeCompare(b.entity + ':' + b.id);
      const actual = (await device.db.query('SELECT entity,id,branch_id,data FROM records')).map(
        (row: any) => ({ ...row, data: JSON.parse(row.data) })
      );
      expect(
        actual.filter((row: any) => snapshotEntities.includes(row.entity)).sort(compare)
      ).toEqual(expected.sort(compare));
      const relayed = (await relayDb.relayRecord.findMany({ where: { op: 'upsert' } })).map(
        (row: any) => ({
          entity: row.entity,
          id: row.entityId,
          branch_id: row.branchId,
          data: row.data,
        })
      );
      expect(actual.sort(compare)).toEqual(relayed.sort(compare));
    }
    async function seed(restoring = false) {
      const current = await pc.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      expect(current[0]?.name).toBe(privatePcName);
      await pc.user.createMany({
        data: [
          {
            id: userId,
            username: 'e2e-admin',
            fullName: 'Cloud admin',
            password: 'unused',
            role: 'ADMIN',
          },
          {
            id: staffId,
            username: 'e2e-staff',
            fullName: 'Cloud staff',
            password: 'unused',
            role: 'EMPLOYEE',
          },
        ],
      });
      const branch = await pc.branch.create({
        data: {
          ...(branchId ? { id: branchId } : {}),
          code: 'E2E',
          name: 'Cloud shop',
          createdById: userId,
        },
      });
      branchId = branch.id;
      await pc.userBranchAccess.create({
        data: { userId: staffId, branchId, grantedById: userId },
      });
      const tax = await pc.taxRate.create({
        data: {
          code: 'E2E-VAT',
          name: 'VAT',
          nameAr: 'VAT',
          ratePercent: '11.000',
          effectiveFrom: new Date('2020-01-01'),
          createdById: userId,
        },
      });
      await pc.taxProfile.create({
        data: {
          code: 'E2E-DEFAULT',
          name: 'Standard VAT',
          nameAr: 'VAT',
          taxRateId: tax.id,
          isDefault: true,
        },
      });
      await pc.product.create({
        data: {
          id: productId,
          sku: 'E2E-PRODUCT',
          model: 'Test',
          name: restoring ? 'Restored fan' : 'Cloud fan',
          price: restoring ? '33.00' : '20.00',
          trackStock: true,
          stockQuantity: 20,
          createdById: userId,
        },
      });
      await pc.customer.create({
        data: {
          id: customerId,
          branchId,
          name: restoring ? 'Restored customer' : 'Cloud customer',
          phone: '123456789',
          createdBy: userId,
        },
      });
      await pc.supplier.create({
        data: {
          id: supplierId,
          branchId,
          name: 'Cloud supplier',
          phone: '123456789',
          createdById: userId,
        },
      });
      const debt = await pc.debt.create({
        data: {
          branchId,
          customerId,
          description: 'Cloud debt',
          originalAmount: '100.00',
          baseOriginalAmount: '100.00',
          dueDate: new Date(date),
          createdById: userId,
        },
      });
      debtId = debt.id;
    }
    function scenario(name: string, work: () => Promise<void>) {
      it(
        name,
        async () => {
          scenarioClock += 61000;
          metric = { scenario: name, requests: 0, bytesIn: 0, bytesOut: 0 };
          try {
            await work();
          } finally {
            metrics.push(metric);
            console.info('CLOUD_E2E_METRICS ' + JSON.stringify(metric));
          }
        },
        120000
      );
    }
    beforeAll(async () => {
      vi.stubEnv('RECEIPT_STORAGE', 'db');
      vi.stubEnv('LOG_LEVEL', 'error');
      process.env.DATABASE_URL = await database(original.DATABASE_URL!, 'pc');
      process.env.RELAY_DATABASE_URL = await database(original.RELAY_DATABASE_URL!, 'relay');
      for (const schema of ['backend/prisma/schema.prisma', 'backend/prisma/relay/schema.prisma']) {
        const result = spawnSync(
          process.execPath,
          [
            resolve(root, 'node_modules/prisma/build/index.js'),
            'migrate',
            'deploy',
            '--schema',
            schema,
          ],
          { cwd: root, env: process.env, encoding: 'utf8', windowsHide: true }
        );
        if (result.status !== 0) throw Error('Isolated migration failed: ' + result.stderr);
      }
      vi.stubGlobal('fetch', transport);
      // Do not inherit a previous suite's global Prisma client and its shared CI database.
      vi.resetModules();
      pc = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
      privatePcName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
      globalPc.prisma = pc;
      const pcApp = await import('../../app.js');
      pc = (await import('../../lib/prisma.js')).prisma;
      const relayClient = await import(relayPath + '/client.ts'),
        relayStore = await import(relayPath + '/store.ts'),
        relay = await import(relayPath + '/app.ts');
      relayDb = relayClient.createRelayClient();
      const meter: express.RequestHandler = (req, res, next) => {
        const current = metric;
        const requestPath = req.path;
        current.requests++;
        // Observe Content-Length without consuming the stream before async device auth.
        current.bytesIn += Number(req.headers['content-length'] ?? 0);
        const end = res.end.bind(res),
          write = res.write.bind(res);
        res.write = ((chunk: any, ...args: any[]) => {
          if (chunk) current.bytesOut += Buffer.byteLength(chunk);
          return (write as any)(chunk, ...args);
        }) as typeof res.write;
        res.end = ((chunk: any, ...args: any[]) => {
          if (killPush && requestPath === '/relay/v1/worker/records') {
            killPush = false;
            res.socket?.destroy();
            killed = close(relayServer);
            return res;
          }
          if (chunk) current.bytesOut += Buffer.byteLength(chunk);
          return (end as any)(chunk, ...args);
        }) as typeof res.end;
        next();
      };
      relayFactory = () =>
        express().use(
          meter,
          relay.createRelayApp({
            store: new relayStore.RelayStore(relayDb),
            workerTokenSha256: createHash('sha256').update(secret).digest('hex'),
            log: () => {},
            now: () => Date.now() + scenarioClock,
          })
        );
      relayApp = relayFactory();
      pcServer = await listen(pcApp.app);
      pcUrl = `http://127.0.0.1:${(pcServer.address() as any).port}`;
      process.env.PORT = String((pcServer.address() as any).port);
      relayServer = await listen(relayApp);
      relayUrl = `http://127.0.0.1:${(relayServer.address() as any).port}`;
      await seed();
      worker = await import('./worker/worker-scheduler.js');
      phoneModule = await import(phonePath);
      await pcRequest(
        '/sync/worker',
        {
          enabled: true,
          relayUrl: origin,
          workerSecret: secret,
          openingStart: '00:00',
          openingEnd: '00:00',
        },
        'PUT'
      );
    }, 120000);
    afterAll(async () => {
      worker?.syncWorker.stop();
      console.info('CLOUD_E2E_METRICS_ALL ' + JSON.stringify(metrics));
      const artifact = resolve(root, 'node_modules/.cache/home-connect/cloud-e2e-metrics.json');
      await mkdir(resolve(root, 'node_modules/.cache/home-connect'), { recursive: true });
      await writeFile(artifact, JSON.stringify(metrics, null, 2) + '\n');
      for (const measurement of metrics)
        process.stdout.write('CLOUD_E2E_MEASURED ' + JSON.stringify(measurement) + '\n');
      console.info('Cloud e2e cleanup: HTTP');
      await close(pcServer);
      await close(relayServer);
      await killed;
      console.info('Cloud e2e cleanup: clients');
      await pc?.$disconnect();
      await relayDb?.$disconnect();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      if (originalPc) globalPc.prisma = originalPc;
      else delete globalPc.prisma;
      console.info('Cloud e2e cleanup: private databases');
      for (const { client, name } of owned) {
        try {
          await client.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
        } finally {
          await client.$disconnect();
        }
      }
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }, 120000);
    scenario('1 pair and full copy', async () => {
      worker.syncWorker.start();
      await vi.waitFor(
        async () =>
          expect(
            (await pc.syncWorkerState.findUnique({ where: { id: 1 } }))?.lastSuccessAt
          ).toBeInstanceOf(Date),
        { timeout: 90000, interval: 100 }
      );
      pairing = await pcRequest('/sync/worker/devices', {
        userId,
        name: 'Admin phone',
        branchIds: [branchId],
      });
      phone = await phoneModule.createCloudPhone(pairing, transport);
      await phone.sync();
      expect(await row(phone, 'product', productId)).toBeDefined();
      expect(
        JSON.parse((await row(phone, 'customer', customerId)).data).financialSummary
      ).toBeDefined();
      expect(await row(phone, 'supplier', supplierId)).toBeDefined();
      const entities = (await phone.db.query('SELECT DISTINCT entity FROM records')).map(
        (r: any) => r.entity
      );
      expect(entities).toEqual(
        expect.arrayContaining(['dashboard', 'receivables_summary', 'report'])
      );
      expect(await relayDb.relayDevice.count()).toBe(1);
      expect(await pc.product.count()).toBe(1);
      expect(phone.engine.getStatus().error).toBeNull();
    });
    scenario('2 PC price and payment delta', async () => {
      await pc.product.update({ where: { id: productId }, data: { price: '25.00' } });
      await pcRequest(`/debts/${debtId}/payments`, {
        amount: '10.00',
        paymentDate: date,
        paymentMethod: 'CASH',
        idempotencyKey: randomUUID(),
      });
      await cycle();
      await phone.sync();
      const summary = await pcRequest(
        `/customers/${customerId}/financial-summary?includeCancelled=false&includePayments=false&debtLimit=100&planLimit=100`
      );
      const local = JSON.parse((await row(phone, 'customer', customerId)).data).financialSummary;
      expect(local).toEqual(summary);
      expect(Buffer.from(local.summary.totalOutstanding)).toEqual(
        Buffer.from(summary.summary.totalOutstanding)
      );
      expect(JSON.parse((await row(phone, 'product', productId)).data).price).toBe('25.00');
      expect(
        (
          await relayDb.relayRecord.findUnique({
            where: { entity_entityId: { entity: 'product', entityId: productId } },
          })
        ).data.price
      ).toBe('25.00');
      expect(await pc.payment.count()).toBe(1);
    });
    scenario('3 offline actions, duplicate sends and replayed claim', async () => {
      phone.offline();
      const base = { branchId, submissionKey: randomUUID(), summary: 'Customer payment' };
      const payment = await phone.queue({
        ...base,
        type: 'customer_payment.create',
        payload: {
          targetType: 'DEBT',
          targetId: debtId,
          amount: '5.00',
          paymentDate: date,
          paymentMethod: 'CASH',
        },
      });
      const supplier = await phone.queue({
        ...base,
        submissionKey: randomUUID(),
        summary: 'Supplier payment',
        type: 'supplier_payment.create',
        payload: {
          supplierId,
          type: 'SUPPLIER_PAYMENT',
          amount: '2.00',
          currency: 'USD',
          paymentMethod: 'CASH_USD',
          transactionDate: date,
          description: 'Cloud supplier payment',
        },
      });
      const order = await phone.queue({
        ...base,
        submissionKey: randomUUID(),
        summary: 'Cloud order',
        type: 'sales_order.create',
        payload: {
          customerId,
          currency: 'USD',
          salesChannel: 'SHOP_DIRECT',
          orderDate: date,
          fulfillmentStatus: 'DELIVERED',
          paidAmount: '0.00',
          debtDueDate: date,
          items: [{ productId, quantity: 1, unitPrice: '25.00', discountAmount: '0.00' }],
        },
      });
      // A real valid 1x1 PNG; only the phone file adapter is in-memory.
      phone.photos.set(
        'capture',
        new Uint8Array(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'base64'
          )
        )
      );
      const bill = await phone.queue({
        ...base,
        submissionKey: randomUUID(),
        summary: 'Bill photo',
        type: 'supplier_bill.upload',
        payload: { supplierId },
        photo: { uri: 'capture', mime: 'image/png' },
      });
      await phone.sync();
      expect(
        (await phone.rows()).map((r: any) => r.local_status),
        JSON.stringify((await phone.rows()).map((r: any) => ({ type: r.type, result: r.result })))
      ).toEqual(['queued', 'queued', 'queued', 'queued']);
      expect(await relayDb.relayOutbox.count()).toBe(0);
      phone.reconnect();
      await phone.sync();
      for (const action of [payment, supplier, order, bill]) {
        const response = await transport(origin + '/relay/v1/device/actions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${pairing.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: action.id,
            type: action.type,
            branchId,
            payload: JSON.parse(action.payload),
            createdAt: action.created_at,
            ...(action.photo_path
              ? { photo: { mime: action.photo_mime, size: action.photo_size } }
              : {}),
          }),
        });
        expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
      }
      const { WorkerRelay } = await import('./worker/relay-client.js'),
        relay = new WorkerRelay(origin, secret, Date.now() + 60000);
      const claims = await relay.request('/outbox/claim', { limit: 20 });
      expect(claims).toHaveLength(4);
      const { applyAction } = await import('./worker/worker-actions.js');
      for (const action of claims) {
        await applyAction(action, relay, Date.now() + 60000);
        await applyAction(action, relay, Date.now() + 60000);
        const outcome = await pc.syncAppliedAction.findUniqueOrThrow({
          where: { actionId: action.id },
        });
        expect(outcome.status, JSON.stringify({ type: action.type, result: outcome.result })).toBe(
          'applied'
        );
      }
      await cycle();
      await phone.sync();
      expect(
        (await phone.rows()).map((r: any) => r.local_status),
        JSON.stringify((await phone.rows()).map((r: any) => ({ type: r.type, result: r.result })))
      ).toEqual(['applied', 'applied', 'applied', 'applied']);
      expect(
        JSON.parse((await phone.rows()).find((r: any) => r.id === payment.id).result).receipt
      ).toHaveProperty('payment');
      expect(await pc.payment.count({ where: { idempotencyKey: payment.id } })).toBe(1);
      expect(await pc.supplierTransaction.count({ where: { idempotencyKey: supplier.id } })).toBe(
        1
      );
      expect(await pc.salesOrder.count({ where: { idempotencyKey: order.id } })).toBe(1);
      expect(await pc.supplierReceivingReceipt.count({ where: { id: bill.id } })).toBe(1);
      expect(
        Buffer.from(
          (await pc.supplierReceiptBlob.findUniqueOrThrow({ where: { receiptId: bill.id } })).data
        )
      ).toEqual(Buffer.from(phone.photos.get('capture')));
      expect(await relayDb.relayOutbox.count({ where: { status: 'applied' } })).toBe(4);
      expect(await pc.syncAppliedAction.count()).toBe(4);
    });
    scenario('4 refusal preserves the exact PC message', async () => {
      const staffPair = await pcRequest('/sync/worker/devices', {
        userId: staffId,
        name: 'Staff phone',
        branchIds: [branchId],
      });
      staffPhone = await phoneModule.createCloudPhone(staffPair, async (url: any, init: any) => {
        const response = await transport(url, init);
        if (new URL(String(url)).pathname.endsWith('/records'))
          staffWire.push(...(await response.clone().json()).records);
        return response;
      });
      await staffPhone.sync();
      const report = await staffPhone.queue({
        branchId,
        submissionKey: randomUUID(),
        summary: 'Admin report',
        type: 'report.request',
        payload: { reportId: 'sales-summary', filters: { period: 'today' } },
      });
      await staffPhone.sync();
      await cycle();
      await staffPhone.sync();
      const journal = await pc.syncAppliedAction.findUniqueOrThrow({
        where: { actionId: report.id },
      });
      expect(journal.status).toBe('refused');
      const local = (await staffPhone.rows())[0];
      expect(JSON.parse(local.result)).toEqual(journal.result);
      expect((journal.result as any).message).toBeTruthy();
      const { readReport } = await import('./worker/report-read.js');
      let deniedError: unknown;
      await readReport('sales-summary', { period: 'today' }, async (path) => {
        const denied = await nativeFetch(pcUrl + '/api/v1' + path, {
          headers: {
            Authorization:
              'Bearer ' + jwt.sign({ userId: staffId, role: 'EMPLOYEE' }, process.env.JWT_SECRET!),
            'X-Branch-Scope': branchId,
          },
        });
        expect(denied.status).toBe(403);
        deniedError = (await denied.json()).error;
        return {};
      });
      expect(journal.result).toEqual(deniedError);
      expect((await relayDb.relayOutbox.findUnique({ where: { id: report.id } })).result).toEqual(
        journal.result
      );
    });
    scenario('5 staff visibility and role downgrade deletes', async () => {
      expect(
        staffWire.filter(
          (record) =>
            record.op === 'upsert' &&
            (record.minRole === 'ADMIN' || ['report', 'user'].includes(record.entity))
        )
      ).toEqual([]);
      expect(
        await staffPhone.db.query(
          "SELECT id FROM records WHERE min_role='ADMIN' OR entity IN ('user','report')"
        )
      ).toEqual([]);
      expect(
        (await phone.db.query("SELECT id FROM records WHERE entity='report'")).length
      ).toBeGreaterThan(0);
      await relayDb.relayDevice.update({
        where: { id: pairing.deviceId },
        data: { role: 'EMPLOYEE' },
      });
      await phone.sync();
      expect(
        await phone.db.query(
          "SELECT id FROM records WHERE min_role='ADMIN' OR entity IN ('user','report')"
        )
      ).toEqual([]);
      expect(await pc.user.findUnique({ where: { id: userId } })).toMatchObject({ role: 'ADMIN' });
      expect((await relayDb.relayDevice.findUnique({ where: { id: pairing.deviceId } })).role).toBe(
        'EMPLOYEE'
      );
    });
    scenario('6 PC revoke wipes data and retains unsent summaries', async () => {
      await phone.queue({
        branchId,
        submissionKey: randomUUID(),
        summary: 'Unsent payment retained',
        type: 'customer_payment.create',
        payload: {
          targetType: 'DEBT',
          targetId: debtId,
          amount: '1.00',
          paymentDate: date,
          paymentMethod: 'CASH',
        },
      });
      const before = await pc.payment.count();
      await pcRequest(`/sync/worker/devices/${pairing.deviceId}/revoke`, {});
      // The engine's /me rejection must happen before any sender can deliver the queued work.
      await phone.sync();
      expect(phone.revoked).toBe(true);
      expect(await phone.db.query('SELECT * FROM records')).toEqual([]);
      expect(await phone.db.query('SELECT * FROM staging_records')).toEqual([]);
      expect(await phone.db.query('SELECT * FROM sync_state')).toEqual([]);
      expect(
        (await phone.rows()).find((r: any) => r.summary === 'Unsent payment retained')
      ).toMatchObject({ archived: 1, payload: '{}', photo_path: null });
      expect(await pc.payment.count()).toBe(before);
      expect(
        (await relayDb.relayDevice.findUnique({ where: { id: pairing.deviceId } })).revokedAt
      ).not.toBeNull();
    });
    scenario('7 backup restore replaces relay snapshot without ghosts', async () => {
      const restorePair = await pcRequest('/sync/worker/devices', {
        userId,
        name: 'Restore phone',
        branchIds: [branchId],
      });
      restorePhone = await phoneModule.createCloudPhone(restorePair, transport);
      await restorePhone.sync();
      const ghost = randomUUID();
      await pc.product.create({
        data: {
          id: ghost,
          sku: 'GHOST',
          model: 'Old',
          name: 'Not in backup',
          price: '9.00',
          createdById: userId,
        },
      });
      await cycle();
      await restorePhone.sync();
      expect(await row(restorePhone, 'product', ghost)).toBeDefined();
      // Only this suite's private database is truncated; CI's shared fixture databases are never reset.
      const oldRelayCursor = (await relayDb.relayWorker.findUniqueOrThrow({ where: { id: 1 } }))
        .lastPcSeq;
      const current = await pc.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      expect(current[0]?.name).toBe(privatePcName);
      const tables = await pc.$queryRaw<
        { tablename: string }[]
      >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
      await pc.$executeRawUnsafe(
        'TRUNCATE ' +
          tables.map(({ tablename }) => '"' + tablename.replaceAll('"', '""') + '"').join(',') +
          ' RESTART IDENTITY CASCADE'
      );
      await seed(true);
      await pcRequest(
        '/sync/worker',
        {
          enabled: true,
          relayUrl: origin,
          workerSecret: secret,
          openingStart: '00:00',
          openingEnd: '00:00',
        },
        'PUT'
      );
      const restoredState = await cycle();
      expect(BigInt(restoredState.lastPushedSeq)).toBeLessThan(BigInt(oldRelayCursor));
      await restorePhone.sync();
      expect(await row(restorePhone, 'product', ghost)).toBeUndefined();
      expect(JSON.parse((await row(restorePhone, 'product', productId)).data).name).toBe(
        'Restored fan'
      );
      const { sourcePage } = await import('./worker/worker-source.js');
      const expected = await sourcePage('product', '', '', { mode: 'all', branchIds: [branchId] });
      const expectedProduct = expected.records[0];
      expect(expectedProduct?.op).toBe('upsert');
      expect(JSON.parse((await row(restorePhone, 'product', productId)).data)).toEqual(
        expectedProduct?.op === 'upsert' ? JSON.parse(JSON.stringify(expectedProduct.data)) : null
      );
      expect(
        (
          await relayDb.relayRecord.findUnique({
            where: { entity_entityId: { entity: 'product', entityId: ghost } },
          })
        ).op
      ).toBe('delete');
      expect(await pc.product.count()).toBe(1);
      await expectCopyMatchesPc(restorePhone);
    });
    scenario('8 relay dies after commit before acknowledgement, cursor resumes', async () => {
      const before = await pc.syncWorkerState.findUniqueOrThrow({ where: { id: 1 } });
      await pc.product.update({
        where: { id: productId },
        data: { name: 'After relay restart', price: '44.00' },
      });
      killPush = true;
      await worker.syncWorker.cycle();
      await killed;
      expect(killPush).toBe(false);
      expect((await pc.syncWorkerState.findUniqueOrThrow({ where: { id: 1 } })).lastPushedSeq).toBe(
        before.lastPushedSeq
      );
      const port = Number(new URL(relayUrl).port);
      relayApp = relayFactory();
      relayServer = await listen(relayApp, port);
      const state = await cycle();
      await restorePhone.sync();
      expect(BigInt(state.lastPushedSeq)).toBeGreaterThan(BigInt(before.lastPushedSeq));
      expect(
        await relayDb.relayRecord.count({ where: { entity: 'product', entityId: productId } })
      ).toBe(1);
      expect(
        await restorePhone.db.query('SELECT id FROM records WHERE entity=? AND id=?', [
          'product',
          productId,
        ])
      ).toHaveLength(1);
      expect(JSON.parse((await row(restorePhone, 'product', productId)).data).name).toBe(
        'After relay restart'
      );
      expect(
        (await pc.product.findUniqueOrThrow({ where: { id: productId } })).price?.toFixed(2)
      ).toBe('44.00');
      await expectCopyMatchesPc(restorePhone);
    });
  }
);
