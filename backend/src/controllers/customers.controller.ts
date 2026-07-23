import { Request, Response, NextFunction } from 'express';
import { CustomersService } from '../services/customers.service';

export class CustomersController {
  static async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomersService.createCustomer({
        ...req.body,
        createdBy: req.user!.id,
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
      const { page, limit, search, sortBy, sortOrder } = req.query as any;
      const skip = (page - 1) * limit;
      
      const { customers, total } = await CustomersService.listCustomers({
        skip,
        take: limit,
        search,
        sortBy,
        sortOrder,
      });

      res.status(200).json({
        success: true,
        data: customers,
        meta: {
          pagination: {
            page,
            pageSize: limit,
            totalItems: total,
            totalPages: Math.ceil(total / limit),
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
      const customer = await CustomersService.getCustomer(req.params.id);
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
      const customer = await CustomersService.updateCustomer(req.params.id, req.body);
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
      await CustomersService.deleteCustomer(req.params.id);
      res.status(200).json({
        success: true,
        data: { message: 'Customer successfully deleted' },
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }
}
