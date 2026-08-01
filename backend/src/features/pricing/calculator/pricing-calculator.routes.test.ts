import { Decimal } from '@prisma/client/runtime/library';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { repository } = vi.hoisted(() => ({ repository: { findById: vi.fn(), findActiveDefault: vi.fn() } }));
vi.mock('../presets/pricing-presets.repository', () => ({ PricingPresetsRepository: repository }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));
const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);

describe('pricing calculator route', () => {
  it('is authenticated, read-only, and returns string amounts', async () => {
    repository.findActiveDefault.mockResolvedValue({
      expensePercent: new Decimal(10), profitPercent: new Decimal(7), discountBufferPercent: new Decimal(7),
      installmentMarkupPercent: new Decimal(20), downPaymentPercent: new Decimal(40), defaultInstallmentMonths: 3,
      calculationMode: 'COMPOUND', roundingMode: 'NONE',
    });
    expect((await request(app).post('/api/v1/pricing/calculate').send({ costPrice: '300.00' })).status).toBe(401);
    const response = await request(app).post('/api/v1/pricing/calculate').set('Authorization', `Bearer ${employee}`).send({ costPrice: '300.00' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ cashPrice: '377.82', installmentPrice: '453.38' });
  });

  it('uses an active selected preset and applies installment preview overrides', async () => {
    repository.findById.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333', name: 'AC pricing', isActive: true, archivedAt: null,
      expensePercent: new Decimal(10), profitPercent: new Decimal(7), discountBufferPercent: new Decimal(7),
      installmentMarkupPercent: new Decimal(20), downPaymentPercent: new Decimal(40), defaultInstallmentMonths: 3,
      calculationMode: 'COMPOUND', roundingMode: 'NONE',
    });
    const response = await request(app).post('/api/v1/pricing/calculate').set('Authorization', `Bearer ${employee}`).send({
      costPrice: '300.00',
      presetId: '33333333-3333-4333-8333-333333333333',
      installmentMonths: 5,
      overrides: { downPaymentPercent: '25', installmentMarkupPercent: '10' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      cashPrice: '377.82', installmentPrice: '415.60', downPayment: '103.90',
      remaining: '311.70', monthlyPayment: '62.34', installmentMonths: 5,
    });
    for (const field of ['cashPrice','installmentPrice','downPayment','remaining','monthlyPayment','expensesAmount','profitAmount','discountBufferAmount']) {
      expect(typeof response.body.data[field]).toBe('string');
    }
  });

  it('rejects an explicitly selected archived preset', async () => {
    repository.findById.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333', isActive: false, archivedAt: new Date(),
    });
    const response = await request(app).post('/api/v1/pricing/calculate').set('Authorization', `Bearer ${employee}`).send({
      costPrice: '300.00', presetId: '33333333-3333-4333-8333-333333333333',
    });
    expect(response.status).toBe(400);
  });
});
