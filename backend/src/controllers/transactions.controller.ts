import { Request, Response, NextFunction } from 'express';
import { TransactionsService } from '../services/transactions.service';

export class TransactionsController {
  static async createTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const transaction = await TransactionsService.createTransaction(
        req.body,
        req.user!,
        req.ip
      );
      res.status(201).json({
        success: true,
        data: transaction,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async listTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { transactions, total } = await TransactionsService.listTransactions(req.query as any);
      
      const pageNum = Number(req.query.page) || 1;
      const limitNum = Number(req.query.limit) || 10;

      res.status(200).json({
        success: true,
        data: transactions,
        meta: {
          pagination: {
            page: pageNum,
            pageSize: limitNum,
            totalItems: total,
            totalPages: Math.ceil(total / limitNum),
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const transaction = await TransactionsService.getTransaction(req.params.id as string);
      if (!transaction) {
        res.status(404).json({ success: false, error: { message: 'Transaction not found' } });
        return;
      }
      res.status(200).json({
        success: true,
        data: transaction,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const transaction = await TransactionsService.updateTransaction(
        req.params.id,
        req.body,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: transaction,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      await TransactionsService.deleteTransaction(
        req.params.id,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        message: 'Transaction deleted successfully',
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }
}
