import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';
import { isIsolatedTestDatabase } from '../../test/database';

const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;
const db = new PrismaClient();
type Actor = 'admin' | 'employee' | 'ungranted';
let a: string;
let b: string;
let admin: string;
let employee: string;
let ungranted: string;
let customerA: string;
let customerB: string;
let supplierA: string;
let supplierB: string;
let run: string;
let name: string;
let phone: string;
let passwordHash: string;
let tokens: Record<Actor, string>;
const password = 'phase3a-synthetic-password';
const headers = (actor: Actor = 'employee', scope?: string) => ({
  Authorization: 'Bearer ' + tokens[actor],
  ...(scope === undefined ? {} : { 'X-Branch-Scope': scope }),
});
const get = (path: string, actor: Actor = 'employee', scope?: string) =>
  request(app)
    .get('/api/v1/' + path)
    .set(headers(actor, scope));
const ids = (response: { body: { data: Array<{ id: string }> } }) =>
  response.body.data.map((row) => row.id);
const action = { reason: 'Phase 3A isolation test', accountPassword: password };

describeDb('Phase 3A customer and supplier branch isolation', () => {
  beforeAll(async () => {
    const target = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1));
    if (target === 'homeconnect' || !/^homeconnect_test(?:[_-].*)?$/.test(target)) {
      throw new Error('Refusing unsafe Phase 3A database');
    }
    console.log('Confirmed Phase 3A isolation database: ' + target);
    passwordHash = await bcrypt.hash(password, 4);
  });
  beforeEach(async () => {
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'true');
    run = randomUUID().replaceAll('-', '');
    a = randomUUID();
    b = randomUUID();
    admin = randomUUID();
    employee = randomUUID();
    ungranted = randomUUID();
    customerA = randomUUID();
    customerB = randomUUID();
    supplierA = randomUUID();
    supplierB = randomUUID();
    name = 'Alexander Garden ' + run;
    phone = '70' + Date.now().toString().slice(-11);
    await db.user.createMany({
      data: [
        {
          id: admin,
          username: 'p3a-admin-' + run,
          fullName: '3A admin',
          role: 'ADMIN',
          password: passwordHash,
        },
        {
          id: employee,
          username: 'p3a-employee-' + run,
          fullName: '3A employee',
          role: 'EMPLOYEE',
          password: passwordHash,
        },
        {
          id: ungranted,
          username: 'p3a-ungranted-' + run,
          fullName: '3A no grants',
          role: 'EMPLOYEE',
          password: passwordHash,
        },
      ],
    });
    await db.branch.createMany({
      data: [
        { id: a, code: 'A' + run.slice(0, 10), name: '3A A ' + run, createdById: admin },
        { id: b, code: 'B' + run.slice(0, 10), name: '3A B ' + run, createdById: admin },
      ],
    });
    // Explicit grants, without branchFixture or the automatic employee grant helper.
    await db.userBranchAccess.create({
      data: { userId: employee, branchId: a, grantedById: admin },
    });
    await db.customer.createMany({
      data: [
        { id: customerA, branchId: a, name, phone, notes: 'Zephyr Harbor', createdBy: admin },
        { id: customerB, branchId: b, name, phone, notes: 'Tangerine Observatory', createdBy: admin },
      ],
    });
    await db.supplier.createMany({
      data: [
        { id: supplierA, branchId: a, name: 'Supplier A ' + run, phone, createdById: admin },
        { id: supplierB, branchId: b, name: 'Supplier B ' + run, phone, createdById: admin },
      ],
    });
    tokens = Object.fromEntries(
      (['admin', 'employee', 'ungranted'] as const).map((actor) => [
        actor,
        jwt.sign(
          {
            userId: { admin, employee, ungranted }[actor],
            role: actor === 'admin' ? 'ADMIN' : 'EMPLOYEE',
            // These crafted claims must never grant access; middleware reads grants from the DB.
            branchIds: [b],
            branchId: b,
          },
          process.env.JWT_SECRET!,
          { expiresIn: '1h' }
        ),
      ])
    ) as Record<Actor, string>;
  });
  afterEach(async () => {
    try {
      await db.supplierAudit.deleteMany({
        where: { changedById: { in: [admin, employee, ungranted] } },
      });
      await db.adminVerificationLog.deleteMany({
        where: { userId: { in: [admin, employee, ungranted] } },
      });
      await db.activityLog.deleteMany({ where: { userId: { in: [admin, employee, ungranted] } } });
      await db.customer.deleteMany({ where: { branchId: { in: [a, b] } } });
      await db.supplier.deleteMany({ where: { branchId: { in: [a, b] } } });
      await db.userBranchAccess.deleteMany({ where: { branchId: { in: [a, b] } } });
      await db.branch.deleteMany({ where: { id: { in: [a, b] } } });
      await db.user.deleteMany({ where: { id: { in: [admin, employee, ungranted] } } });
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30_000);
  afterAll(() => db.$disconnect());

  it('employee lists and searches only A customers, including financial filtering and notes search', async () => {
    for (const path of [
      'customers',
      'customers/search?search=' + run,
      'customers?search=' + run,
      'customers?include=financial&filter=noDebt&sortBy=outstanding',
    ]) {
      const response = await get(path);
      expect(response.status, path).toBe(200);
      expect(ids(response), path).toEqual([customerA]);
      expect(response.body.data[0].branchId).toBe(a);
      expect(response.body.meta.pagination.totalItems).toBe(1);
    }
    const response = await get('customers/search?search=Tangerine%20Observatory');
    expect(response.status).toBe(200);
    expect(ids(response)).toEqual([]);
  });

  it('employee suggestions exclude B primary matches, candidate names and counts; literal path stays a search route', async () => {
    await db.customer.create({
      data: {
        name: 'Alexandr Hidden ' + run,
        phone: 'hidden-' + run.slice(0, 10),
        branchId: b,
        createdBy: admin,
      },
    });
    const response = await get('customers/search-suggestions?q=Alexandr');
    expect(response.status).toBe(200);
    expect(response.body.data.suggestions).toEqual([{ query: name, count: 1 }]);
  });

  it.each(['customers', 'suppliers'])(
    'denies the employee B header on %s with BRANCH_ACCESS_DENIED',
    async (prefix) => {
      const response = await get(prefix, 'employee', b);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('BRANCH_ACCESS_DENIED');
    }
  );

  it.each(['customers', 'suppliers'])('rejects an invalid branch header on %s', async (prefix) => {
    expect((await get(prefix, 'admin', 'not-a-uuid')).status).toBe(400);
  });

  it('returns the same customer 404 for employee GET, PUT and DELETE of a B record, without changing it', async () => {
    const before = await db.customer.findUniqueOrThrow({ where: { id: customerB } });
    const path = '/api/v1/customers/' + customerB;
    const responses = [
      await request(app).get(path).set(headers()),
      await request(app).put(path).set(headers()).send({ name: 'Hidden edit' }),
      await request(app).delete(path).set(headers()),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Customer not found');
    }
    expect(await db.customer.findUniqueOrThrow({ where: { id: customerB } })).toEqual(before);
  });

  it('hides B supplier detail, summary, audit, PATCH, archive, restore and DELETE before role checks', async () => {
    const before = await db.supplier.findUniqueOrThrow({ where: { id: supplierB } });
    const path = '/api/v1/suppliers/' + supplierB;
    const responses = [
      await request(app).get(path).set(headers()),
      await request(app)
        .get(path + '/summary')
        .set(headers()),
      await request(app)
        .get(path + '/audit')
        .set(headers()),
      await request(app).patch(path).set(headers()).send({ notes: 'Hidden edit' }),
      await request(app)
        .post(path + '/archive')
        .set(headers())
        .send(action),
      await request(app)
        .post(path + '/restore')
        .set(headers())
        .send(action),
      await request(app).delete(path).set(headers()).send(action),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Supplier not found');
    }
    expect(await db.supplier.findUniqueOrThrow({ where: { id: supplierB } })).toEqual(before);
  });

  it.each([
    'debts',
    'installment-plans',
    'statement?from=2026-01-01&to=2026-01-31',
    'financial-summary',
    'activity',
    'corrections',
    'sales-orders',
    'service-jobs',
  ])('guards the B customer nested route /%s by parent', async (suffix) => {
    const response = await get('customers/' + customerB + '/' + suffix);
    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('Customer not found');
  });

  it.each(['transactions', 'purchases'])(
    'guards the B supplier nested route /%s by parent',
    async (suffix) => {
      const response = await get('suppliers/' + supplierB + '/' + suffix);
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Supplier not found');
    }
  );

  it('employee supplier list, search, balance sort and detail contain only A', async () => {
    for (const path of ['suppliers', 'suppliers?search=' + run, 'suppliers?sortBy=balance']) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(ids(response)).toEqual([supplierA]);
      expect(response.body.data[0].branchId).toBe(a);
    }
    const response = await get('suppliers/' + supplierA);
    expect(response.status).toBe(200);
    expect(response.body.data.branchId).toBe(a);
  });

  it.each(['customers', 'suppliers'])(
    'admin header A sees A and all sees A+B for %s',
    async (prefix) => {
      const expected = prefix === 'customers' ? [customerA, customerB] : [supplierA, supplierB];
      const selected = await get(prefix + '?search=' + run, 'admin', a);
      expect(selected.status).toBe(200);
      expect(ids(selected)).toEqual([expected[0]]);
      const all = await get(prefix + '?search=' + run, 'admin', 'all');
      expect(all.status).toBe(200);
      expect(ids(all).sort()).toEqual(expected.sort());
    }
  );

  it('admin header A hides B customer and supplier detail', async () => {
    expect((await get('customers/' + customerB, 'admin', a)).status).toBe(404);
    expect((await get('suppliers/' + supplierB, 'admin', a)).status).toBe(404);
  });

  it.each(['customers', 'suppliers'])(
    'admin cannot create %s in multi-branch all scope',
    async (prefix) => {
      const response = await request(app)
        .post('/api/v1/' + prefix)
        .set(headers('admin', 'all'))
        .send({
          name: 'Unselected record',
          phone: '701234567',
        });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('BRANCH_SELECTION_REQUIRED');
    }
  );

  it('multi-branch all scope rejects direct and nested writes before downstream mutations', async () => {
    const responses = [
      await request(app)
        .put('/api/v1/customers/' + customerA)
        .set(headers('admin', 'all'))
        .send({ name: 'Ambiguous' }),
      await request(app)
        .delete('/api/v1/customers/' + customerA)
        .set(headers('admin', 'all')),
      await request(app)
        .patch('/api/v1/suppliers/' + supplierA)
        .set(headers('admin', 'all'))
        .send({ notes: 'Ambiguous' }),
      await request(app)
        .post('/api/v1/customers/' + customerA + '/debts')
        .set(headers('admin', 'all'))
        .send({}),
      await request(app)
        .post('/api/v1/suppliers/' + supplierA + '/transactions')
        .set(headers('admin', 'all'))
        .send({}),
    ];
    for (const response of responses) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('BRANCH_SELECTION_REQUIRED');
    }
    expect(await db.customer.findUniqueOrThrow({ where: { id: customerA } })).toMatchObject({
      name,
      deletedAt: null,
    });
    expect(await db.supplier.findUniqueOrThrow({ where: { id: supplierA } })).toMatchObject({
      notes: null,
    });
  });

  it('same phone is allowed across branches and rejected within A on creation', async () => {
    const crossPhone = 'cross-' + run.slice(0, 12);
    const payload = { name: 'Shared contact', phone: crossPhone };
    const inB = await request(app).post('/api/v1/customers').set(headers('admin', b)).send(payload);
    const inA = await request(app).post('/api/v1/customers').set(headers('admin', a)).send(payload);
    expect(inB.status).toBe(201);
    expect(inA.status).toBe(201);
    expect(inB.body.data.branchId).toBe(b);
    expect(inA.body.data.branchId).toBe(a);
    const duplicate = await request(app)
      .post('/api/v1/customers')
      .set(headers('admin', a))
      .send(payload);
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.message).toBe('A customer with this phone number already exists.');
  });

  it('phone updates compare only the record branch and preserve phone formatting', async () => {
    const crossPhone = '70 ' + run.slice(0, 12);
    await db.customer.create({
      data: { name: 'B contact', phone: crossPhone, branchId: b, createdBy: admin },
    });
    const response = await request(app)
      .put('/api/v1/customers/' + customerA)
      .set(headers())
      .send({ phone: crossPhone });
    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBe(crossPhone);
    const created = await request(app)
      .post('/api/v1/customers')
      .set(headers())
      .send({ name: 'Another A', phone: 'other-' + run.slice(0, 12) });
    expect(created.status).toBe(201);
    const duplicate = await request(app)
      .put('/api/v1/customers/' + created.body.data.id)
      .set(headers())
      .send({ phone: crossPhone });
    expect(duplicate.status).toBe(400);
  });

  it('serializable phone checks admit only one concurrent create in the same branch', async () => {
    const payload = { name: 'Concurrent contact', phone: 'race-' + run.slice(0, 12) };
    const responses = await Promise.all([
      request(app).post('/api/v1/customers').set(headers()).send(payload),
      request(app).post('/api/v1/customers').set(headers()).send(payload),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(
      await db.customer.count({ where: { branchId: a, phone: payload.phone, deletedAt: null } })
    ).toBe(1);
  });

  it('no-header single-accessible-branch requests preserve customer read/create/update/delete behavior', async () => {
    expect((await get('customers/' + customerA)).body.data.branchId).toBe(a);
    const created = await request(app)
      .post('/api/v1/customers')
      .set(headers())
      .send({ name: 'No header contact', phone: 'fresh-' + run.slice(0, 12) });
    expect(created.status).toBe(201);
    expect(created.body.data.branchId).toBe(a);
    expect(
      (
        await request(app)
          .put('/api/v1/customers/' + created.body.data.id)
          .set(headers())
          .send({ notes: 'Changed' })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete('/api/v1/customers/' + created.body.data.id)
          .set(headers())
      ).status
    ).toBe(200);
    expect((await get('customers/' + created.body.data.id)).status).toBe(404);
  });

  it('selected-branch supplier create, contact edit, archive, restore and delete retain their behavior', async () => {
    const created = await request(app)
      .post('/api/v1/suppliers')
      .set(headers('admin', a))
      .send({ name: 'Selected supplier', phone: '701234567' });
    expect(created.status).toBe(201);
    expect(created.body.data.branchId).toBe(a);
    const path = '/api/v1/suppliers/' + created.body.data.id;
    expect(
      (await request(app).patch(path).set(headers('admin', a)).send({ notes: 'Contact note' }))
        .status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(path + '/archive')
          .set(headers('admin', a))
          .send(action)
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(path + '/restore')
          .set(headers('admin', a))
          .send(action)
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(path + '/audit')
          .set(headers('admin', a))
      ).status
    ).toBe(200);
    expect((await request(app).delete(path).set(headers('admin', a)).send(action)).status).toBe(
      200
    );
  });

  it('no-grant employee sees empty lists/search/suggestions and cannot create', async () => {
    for (const path of ['customers', 'customers/search?search=' + run, 'suppliers?search=' + run]) {
      const response = await get(path, 'ungranted');
      expect(response.status).toBe(200);
      expect(ids(response)).toEqual([]);
    }
    expect(
      (await get('customers/search-suggestions?q=Alexandr', 'ungranted')).body.data.suggestions
    ).toEqual([]);
    const response = await request(app)
      .post('/api/v1/customers')
      .set(headers('ungranted'))
      .send({ name: 'No grant', phone: '7012345' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NO_BRANCH_AVAILABLE');
  });

  it('grant revocation is effective on the next request despite unchanged JWT claims', async () => {
    expect((await get('customers/' + customerA)).status).toBe(200);
    await db.userBranchAccess.delete({
      where: { userId_branchId: { userId: employee, branchId: a } },
    });
    expect(ids(await get('customers'))).toEqual([]);
    expect((await get('customers/' + customerA)).status).toBe(404);
    expect((await get('suppliers', 'employee', a)).status).toBe(403);
  });

  it('branch deactivation removes access on the next request', async () => {
    expect((await get('suppliers/' + supplierA)).status).toBe(200);
    await db.branch.update({ where: { id: a }, data: { isActive: false } });
    expect(ids(await get('suppliers'))).toEqual([]);
    expect((await get('customers', 'employee', a)).status).toBe(403);
  });
});
