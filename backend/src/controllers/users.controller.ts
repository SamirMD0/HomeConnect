import { Request, Response, NextFunction } from 'express';
import { UsersService } from '../services/users.service';
import { createUserSchema, updateUserSchema } from '../validators/users.validator';
import { ValidationError } from '../lib/errors';

export class UsersController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = createUserSchema.parse(req.body);
      const result = await UsersService.createUser({
        username: validatedData.username,
        passwordString: validatedData.password,
        fullName: validatedData.fullName,
        role: validatedData.role,
      });

      res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        next(new ValidationError('Invalid user data', error.errors));
      } else {
        next(error);
      }
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const skip = req.query.skip ? parseInt(req.query.skip as string) : undefined;
      const take = req.query.take ? parseInt(req.query.take as string) : undefined;
      
      const users = await UsersService.listUsers(skip, take);
      res.status(200).json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UsersService.getUser(req.params.id as string);
      res.status(200).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = updateUserSchema.parse(req.body);
      const result = await UsersService.updateUser(req.params.id as string, {
        fullName: validatedData.fullName,
        passwordString: validatedData.password,
        role: validatedData.role,
        isActive: validatedData.isActive,
      });

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        next(new ValidationError('Invalid user data', error.errors));
      } else {
        next(error);
      }
    }
  }

  static async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await UsersService.deactivateUser(req.params.id as string);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}
