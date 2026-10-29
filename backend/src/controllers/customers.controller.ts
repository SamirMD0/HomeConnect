import { Request, Response, NextFunction } from 'express';
import { CustomersService } from '../services/customers.service';
import { CustomerSuggestionsService } from '../features/customers/customer-suggestions.service';
import { CustomerBranchTransferService } from '../features/customers/customer-branch-transfer.service';

export class CustomersController {
  static async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomersService.createCustomer({
        ...req.body,
        createdBy: req.user!.userId,
      }, req.branchScope!, req.user!);
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
      const { search, sortBy, sortOrder, include, filter } = req.query as any;
      const pageNum = Number(req.query.page) || 1;
      const limitNum = Number(req.query.limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      const { customers, total } = await CustomersService.listCustomers({
        skip,
        take: limitNum,
        search,
        sortBy,
        sortOrder,
        includeFinancial: include === 'financial',
        filter,
      }, req.branchScope!);

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

  static async searchSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, limit } = req.query as unknown as { q: string; limit: number };
      const suggestions = await CustomerSuggestionsService.suggest(q, req.branchScope!, Number(limit));
      res.status(200).json({ success: true, data: { suggestions } });
    } catch (error) {
      next(error);
    }
  }

  static async getCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomersService.getCustomer(req.params.id as string, req.branchScope!);
      res.status(200).json({
        success: true,
        data: customer,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }

  static async previewBranchTransfer(req: Request, res: Response, next: NextFunction) {
    try {
      const preview = await CustomerBranchTransferService.preview(req.params.id as string, req.query.toBranchId as string);
      res.status(200).json({ success: true, data: preview, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }

  static async transferBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await CustomerBranchTransferService.transfer({
        customerId: req.params.id as string,
        toBranchId: req.body.toBranchId,
        accountPassword: req.body.accountPassword,
        actor: { userId: req.user!.userId, role: req.user!.role },
        ipAddress: req.ip ?? null,
      });
      res.status(200).json({ success: true, data: result, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }

  static async updateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomersService.updateCustomer(req.params.id as string, req.body, req.branchScope!, req.user!);
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
      await CustomersService.deleteCustomer(req.params.id as string, req.branchScope!);
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
