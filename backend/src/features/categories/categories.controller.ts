import { Request, Response, NextFunction } from 'express';
import { CategoriesService } from './categories.service';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validator';

export class CategoriesController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await CategoriesService.list() });
    } catch (error) {
      next(error);
    }
  }
  static async get(req: Request<{ categoryId: string }>, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await CategoriesService.get(req.params.categoryId) });
    } catch (error) {
      next(error);
    }
  }
  static async create(
    req: Request<unknown, unknown, CreateCategoryInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      res
        .status(201)
        .json({ success: true, data: await CategoriesService.create(req.body, req.user!) });
    } catch (error) {
      next(error);
    }
  }
  static async update(
    req: Request<{ categoryId: string }, unknown, UpdateCategoryInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      res.json({
        success: true,
        data: await CategoriesService.update(req.params.categoryId, req.body, req.user!),
      });
    } catch (error) {
      next(error);
    }
  }
  static async remove(req: Request<{ categoryId: string }>, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: await CategoriesService.remove(req.params.categoryId, req.user!),
      });
    } catch (error) {
      next(error);
    }
  }
}
