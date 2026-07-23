import { Request, Response, NextFunction } from 'express';
import { CustomersService } from '../services/customers.service';

export class CustomersController {
  static async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomersService.createCustomer({
        ...req.body,
        createdBy: req.user!.userId,
      });
      res.status(201).json({
        success: true,
        data: customer,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async listCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, sortBy, sortOrder } = req.query as any;
      const pageNum = Number(req.query.page) || 1;
      const limitNum = Number(req.query.limit) || 10;
      const skip = (pageNum - 1) * limitNum;
      
      const { customers, total } = await CustomersService.listCustomers({
        skip,
        take: limitNum,
        search,
        sortBy,
        sortOrder,
      });

      res.status(200).json({
        success: true,
        data: customers,
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

  static async getCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomersService.getCustomer(req.params.id as string);
      res.status(200).json({
        success: true,
        data: customer,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomersService.updateCustomer(req.params.id as string, req.body);
      res.status(200).json({
        success: true,
        data: customer,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      await CustomersService.deleteCustomer(req.params.id as string);
      res.status(200).json({
        success: true,
        data: { message: 'Customer successfully deleted' },
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { TransactionsService } = require('../services/transactions.service');
      const transactions = await TransactionsService.getCustomerTransactionsWithBalance(req.params.id as string);
      res.status(200).json({
        success: true,
        data: transactions,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCustomerBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const { TransactionsService } = require('../services/transactions.service');
      const balance = await TransactionsService.getCustomerBalance(req.params.id as string);
      res.status(200).json({
        success: true,
        data: { balance },
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }
}
