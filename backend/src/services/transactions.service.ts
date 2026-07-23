import { TransactionsRepository } from '../repositories/transactions.repository';
import { CreateTransactionInput, TransactionQueryInput, UpdateTransactionInput } from '../validators/transactions.validator';
import { ValidationError, AuthorizationError, NotFoundError } from '../lib/errors';
import { User, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class TransactionsService {
  static async createTransaction(data: CreateTransactionInput, user: { userId: string; role: string }, ipAddress?: string) {
    if (data.type === 'ADJUSTMENT' && user.role !== 'ADMIN') {
      throw new AuthorizationError('Only administrators can create adjustments');
    }

    if (data.amount <= 0) {
      throw new ValidationError('Amount must be positive');
    }

    let customerId = data.customerId;

    // Inline customer creation
    if (!customerId) {
      if (!data.customerName || !data.customerPhone) {
        throw new ValidationError('Either customerId or customerName and customerPhone are required');
      }
      const newCustomer = await (prisma as any).customer.create({
        data: {
          name: data.customerName,
          phone: data.customerPhone,
          createdBy: user.userId,
        }
      });
      customerId = newCustomer.id;
    }

    const transactionId = require('crypto').randomUUID();

    const transaction = await TransactionsRepository.create(
      {
        id: transactionId,
        customerId: customerId as string,
        type: data.type,
        amount: data.amount,
        description: data.description,
        date: data.date ? new Date(data.date) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        referenceNumber: data.referenceNumber || undefined,
        metadata: data.metadata || undefined,
        createdBy: user.userId,
        parentId: data.parentId || undefined,
      },
      {
        userId: user.userId,
        action: `TRANSACTION_CREATED`,
        entityType: 'transaction',
        entityId: transactionId,
        details: { type: data.type, amount: data.amount, description: data.description },
        ipAddress,
      }
    );

    return transaction;
  }

  static async updateTransaction(id: string, data: UpdateTransactionInput, user: { userId: string; role: string }, ipAddress?: string) {
    const existing = await TransactionsRepository.findById(id);
    if (!existing || existing.deletedAt) throw new NotFoundError('Transaction not found');

    const transaction = await TransactionsRepository.update(
      id,
      {
        amount: data.amount,
        description: data.description,
        date: data.date ? new Date(data.date) : undefined,
        dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
        referenceNumber: data.referenceNumber !== undefined ? (data.referenceNumber || undefined) : undefined,
        metadata: data.metadata !== undefined ? (data.metadata || undefined) : undefined,
      },
      {
        userId: user.userId,
        action: `TRANSACTION_UPDATED`,
        entityType: 'transaction',
        entityId: id,
        details: { amount: data.amount, description: data.description },
        ipAddress,
      }
    );
    return transaction;
  }

  static async deleteTransaction(id: string, user: { userId: string; role: string }, ipAddress?: string) {
    const existing = await TransactionsRepository.findById(id);
    if (!existing || existing.deletedAt) throw new NotFoundError('Transaction not found');

    const transaction = await TransactionsRepository.softDelete(
      id,
      {
        userId: user.userId,
        action: `TRANSACTION_DELETED`,
        entityType: 'transaction',
        entityId: id,
        details: { reason: 'User requested deletion' },
        ipAddress,
      }
    );
    return transaction;
  }

  static async listTransactions(query: TransactionQueryInput) {
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 15;
    
    return TransactionsRepository.findAll({
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      customerId: query.customerId,
      type: query.type,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  static async getTransaction(id: string) {
    return TransactionsRepository.findById(id);
  }

  static async getCustomerTransactionsWithBalance(customerId: string) {
    const transactions = await TransactionsRepository.findByCustomer(customerId);
    
    let runningBalance = 0;
    const withRunningBalance = transactions.map((t: any) => {
      const amount = Number(t.amount);
      if (t.type === 'SALE') runningBalance += amount;
      else if (t.type === 'PAYMENT') runningBalance -= amount;
      else if (t.type === 'ADJUSTMENT') runningBalance += amount;
      
      return {
        ...t,
        runningBalance
      };
    });

    return withRunningBalance.reverse();
  }

  static async getCustomerBalance(customerId: string) {
    return TransactionsRepository.calculateCustomerBalance(customerId);
  }
}
