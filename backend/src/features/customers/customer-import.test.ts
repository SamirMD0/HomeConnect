import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { detectColumnMapping, mapCustomerRows, parseCustomerCsv } from './customer-import.parser';
import {
  customerImportDecisionSchema,
  commitCustomerImportSchema,
  updateCustomerImportSchema,
} from './customer-import.validator';
import { buildCustomerImportPreview } from './customer-import.service';

const csv =
  'Name,Phone,Address,Notes,Credit limit,Opening balance,Currency,Due date,Active\nAli, 03 123 456 ,Beirut,Note,25,10,USD,2026-10-28,yes';
describe('customer import CSV mapping and validation', () => {
  it('detects every English and Arabic alias', () => {
    const expected = {
      name: 0,
      phone: 1,
      address: 2,
      notes: 3,
      creditLimit: 4,
      openingBalance: 5,
      currency: 6,
      dueDate: 7,
      isActive: 8,
    };
    expect(detectColumnMapping(csv.split('\n')[0].split(','))).toEqual(expected);
    expect(
      detectColumnMapping([
        'الاسم',
        'الهاتف',
        'العنوان',
        'ملاحظات',
        'سقف الدين',
        'رصيد افتتاحي',
        'العملة',
        'تاريخ الاستحقاق',
        'نشط',
      ])
    ).toEqual(expected);
  });
  it('uses digits-only identity but stores trimmed input without country-code folding', () => {
    const document = parseCustomerCsv(csv);
    const row = mapCustomerRows(document, detectColumnMapping(document.headers))[0];
    expect(row).toMatchObject({
      name: 'Ali',
      phone: '03 123 456',
      phoneKey: '03123456',
      issues: [],
    });
    const variants = parseCustomerCsv('Name,Phone\nAli,+9613123456\nAli,03123456');
    expect(mapCustomerRows(variants, { name: 0, phone: 1 }).map((item) => item.phoneKey)).toEqual([
      '9613123456',
      '03123456',
    ]);
  });
  it.each(['abcde', '1234', '123456789012345678901'])(
    'rejects an empty digit key or phone outside the existing length rule: %s',
    (phone) => {
      expect(
        mapCustomerRows(parseCustomerCsv('Name,Phone\nAli,' + phone), { name: 0, phone: 1 })[0]
          .issues.length
      ).toBeGreaterThan(0);
    }
  );
  it.each(['A,03123456', '<b>Ali</b>,03123456'])(
    'reuses customer name validation: %s',
    (values) => {
      expect(
        mapCustomerRows(parseCustomerCsv('Name,Phone\n' + values), { name: 0, phone: 1 })[0].issues
          .length
      ).toBeGreaterThan(0);
    }
  );
  it('validates credit limits, LBP precision, calendar dates, active flags and column assignments', () => {
    const document = parseCustomerCsv(
      'Name,Phone,Credit limit,Opening balance,Currency,Due date,Active\nAli,03123456,-1,1.5,LBP,2026-02-30,maybe'
    );
    expect(mapCustomerRows(document, detectColumnMapping(document.headers))[0].issues).toHaveLength(
      4
    );
    expect(() => mapCustomerRows(document, { name: 0, phone: 0 })).toThrow(/only once/);
    expect(() => mapCustomerRows(document, { name: 99 })).toThrow(/exist/);
  });
  it('enforces byte and row limits without business fixtures', () => {
    expect(() => parseCustomerCsv('أ'.repeat(375001))).toThrow(/750 KB/);
    expect(() => parseCustomerCsv('Name,Phone\n' + 'Ali,03123456\n'.repeat(2001))).toThrow(/2000/);
    expect(parseCustomerCsv('Name,Phone\n' + 'Ali,03123456\n'.repeat(2000)).records).toHaveLength(
      2000
    );
  });
});
describe('customer import decisions', () => {
  it('requires an UPDATE target and rejects arbitrary fields or duplicate decisions', () => {
    expect(customerImportDecisionSchema.safeParse({ rowNumber: 2, action: 'UPDATE' }).success).toBe(
      false
    );
    expect(
      customerImportDecisionSchema.safeParse({
        rowNumber: 2,
        action: 'CREATE',
        targetCustomerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }).success
    ).toBe(false);
    expect(
      customerImportDecisionSchema.safeParse({
        rowNumber: 2,
        action: 'UPDATE',
        targetCustomerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        updateFields: ['phone'],
      }).success
    ).toBe(false);
    expect(
      customerImportDecisionSchema.safeParse({
        rowNumber: 2,
        action: 'UPDATE',
        targetCustomerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        updateFields: ['name', 'name'],
      }).success
    ).toBe(false);
    expect(
      commitCustomerImportSchema.safeParse({
        decisions: [
          { rowNumber: 2, action: 'SKIP' },
          { rowNumber: 2, action: 'SKIP' },
        ],
      }).success
    ).toBe(false);
    expect(
      updateCustomerImportSchema.safeParse({ branchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
        .success
    ).toBe(false);
  });
  it('accepts skip-opening and explicit selected contact fields', () => {
    expect(
      customerImportDecisionSchema.parse({
        rowNumber: 2,
        action: 'UPDATE',
        targetCustomerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        updateFields: ['notes'],
        skipOpeningBalance: true,
      }).skipOpeningBalance
    ).toBe(true);
  });
});
describe('customer import preview conflict kinds', () => {
  it('distinguishes file duplicates, destination matches, other-branch hints, name warnings and opening-debt blocks', async () => {
    const document = parseCustomerCsv(
      'Name,Phone,Opening balance\nAli,03 123 456,10\nAli,03123456,0\nSame Name,70111111,0\nNew Name,70222222,0'
    );
    const draft = {
      id: 'draft',
      branchId: 'a',
      createdById: 'admin',
      fileHash: 'hash',
      rows: document,
      columnMapping: detectColumnMapping(document.headers),
      decisions: null,
    } as unknown as Parameters<typeof buildCustomerImportPreview>[0];
    const tx = {
      user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ role: 'ADMIN' }) },
      branch: { findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) },
      customerImport: { findFirst: vi.fn().mockResolvedValue(null) },
      customer: {
        findMany: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.branchId === 'a'
              ? [
                  {
                    id: 'existing',
                    name: 'Ali',
                    phone: '03123456',
                    isActive: true,
                    debts: [{ id: 'old-debt' }],
                  },
                  {
                    id: 'same-name',
                    name: 'Same Name',
                    phone: '70333333',
                    isActive: true,
                    debts: [],
                  },
                ]
              : [{ phone: '70 222 222', branch: { id: 'b', name: 'Branch B' } }]
          )
        ),
      },
    } as unknown as Prisma.TransactionClient;
    const preview = await buildCustomerImportPreview(draft, tx);
    expect(preview.rows[0].conflicts.map((conflict) => conflict.kind)).toEqual([
      'FILE_PHONE',
      'EXISTING_PHONE',
      'OPENING_DEBT',
    ]);
    expect(preview.rows[2]).toMatchObject({
      status: 'READY',
      conflicts: [{ kind: 'NAME_SIMILAR', blocking: false }],
    });
    expect(preview.rows[3]).toMatchObject({
      status: 'READY',
      matches: [],
      decision: { action: 'CREATE' },
      conflicts: [{ kind: 'OTHER_BRANCH_PHONE', blocking: false }],
    });
  });
});

const trialHeaders = 'Account,Name,Curr,Total Debit,Total Credit,Balance Debit,Balance Credit';
describe('trial-balance customer reports', () => {
  const mapped = (csv: string) => {
    const document = parseCustomerCsv(csv);
    return { document, rows: mapCustomerRows(document, detectColumnMapping(document.headers)) };
  };
  it('extracts the flat report table and Balance Debit, preserving Arabic names and account strings', () => {
    const { document, rows } = mapped(
      '"Trial Balance","By Date",10/28/2026,,,"Account Currency",,,"From :","01/01/2026","From Account : 411","To :","31/12/2026","Till Account : 411",,,' +
        trialHeaders +
        ',"0411000099","زبون تجريبي",USD,865.00,420.00,445.00,0.00,Debit,Credit,Balance,Totals :,"214,289.24","142,842.83","71,446.41",1'
    );
    expect(document.headers).toEqual(trialHeaders.split(','));
    expect(document.format).toBe('TRIAL_BALANCE');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountCode: '0411000099',
      identityKey: 'ACCOUNT:0411000099',
      name: 'زبون تجريبي',
      phone: '',
      openingBalance: '445.00',
      currency: 'USD',
      issues: [],
    });
  });
  it('accepts preambles, repeated report rows and multiple accounts, without summary customers', () => {
    const { rows } = mapped(
      'Trial Balance,By Date\nFrom :,01/01/2026\n' +
        trialHeaders +
        '\n41101,First,USD,100,0,100,0\n41102,Second,USD,200,200,0,0\nTotals :,300,200,100\nTrial Balance,By Date,' +
        trialHeaders +
        ',41103,Third,USD,300,0,300,0,Debit,Credit,Balance,Totals :,300,0,300'
    );
    expect(rows.map((row) => row.accountCode)).toEqual(['41101', '41102', '41103']);
    expect(rows.every((row) => !row.issues.length)).toBe(true);
  });
  it('handles strictly grouped amounts while rejecting credit balances and incomplete accounts', () => {
    const { rows } = mapped(
      trialHeaders +
        '\n41101,First,USD,2000,0,"1,234.56",0\n41102,Second,USD,0,10,0,10\n41103,Third,LBP,0,0,"1,000.50",0\n41104,Fourth,USD\n41105,Fifth,,0,0,10,0'
    );
    expect(rows[0]).toMatchObject({ openingBalance: '1234.56', issues: [] });
    expect(rows[1].issues.join()).toMatch(/Credit balances/);
    expect(rows[2].issues.length).toBeGreaterThan(0);
    expect(rows[3].issues).toContain('Incomplete trial-balance account row');
    expect(rows[4].issues).toContain('Trial-balance currency is required');
  });
  it('allows absent phones only with a valid account and still validates supplied phones', () => {
    const { rows } = mapped(
      'Name,Account,Phone\nFirst,000123,\nSecond,,\nThird,not-an-account,\nFourth,1234,abcde'
    );
    expect(rows[0].issues).toEqual([]);
    expect(rows.slice(1).every((row) => row.issues.length)).toBe(true);
  });
});
