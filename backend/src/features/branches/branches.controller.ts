import { NextFunction, Request, Response } from 'express';
import { BranchesService } from './branches.service';
import type { CreateBranchInput, SetUserBranchAccessInput, UpdateBranchInput } from './branches.validator';

export class BranchesController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await BranchesService.list(req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async accessible(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await BranchesService.accessibleBranches(req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async get(req: Request<{ branchId: string }>, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await BranchesService.get(req.params.branchId, req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async create(req: Request<unknown, unknown, CreateBranchInput>, res: Response, next: NextFunction) {
    try {
      res.status(201).json({ success: true, data: await BranchesService.create(req.body, req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async update(
    req: Request<{ branchId: string }, unknown, UpdateBranchInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      res.json({ success: true, data: await BranchesService.update(req.params.branchId, req.body, req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async listStaffAccess(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await BranchesService.listStaffAccess(req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async getUserAccess(req: Request<{ userId: string }>, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await BranchesService.getUserAccess(req.params.userId, req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async setUserAccess(
    req: Request<{ userId: string }, unknown, SetUserBranchAccessInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      res.json({ success: true, data: await BranchesService.setUserAccess(req.params.userId, req.body, req.user!) });
    } catch (error) {
      next(error);
    }
  }
}
