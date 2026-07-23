import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { loginSchema, setupSchema, changePasswordSchema } from '../validators/auth.validator';
import { ValidationError } from '../lib/errors';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

export class AuthController {
  static async setup(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = setupSchema.parse(req.body);
      const result = await AuthService.setupFirstAdmin(
        validatedData.username,
        validatedData.password,
        validatedData.fullName
      );

      // Set HTTP-only cookie for refresh token
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        next(new ValidationError('Invalid setup data', error.errors));
      } else {
        next(error);
      }
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await AuthService.login(validatedData.username, validatedData.password);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        next(new ValidationError('Invalid login data', error.errors));
      } else {
        next(error);
      }
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      res.clearCookie('refreshToken');
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      
      if (!refreshToken) {
        throw new ValidationError('Refresh token not found');
      }

      const tokens = await AuthService.refreshToken(refreshToken);

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken: tokens.accessToken
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, fullName: true, role: true, isActive: true, branchId: true }
      });

      if (!user) {
        throw new ValidationError('User not found');
      }

      res.status(200).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const validatedData = changePasswordSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new ValidationError('User not found');

      const isMatch = await bcrypt.compare(validatedData.currentPassword, user.password);
      if (!isMatch) {
        throw new ValidationError('Incorrect current password');
      }

      const hashedPassword = await bcrypt.hash(validatedData.newPassword, 12);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        next(new ValidationError('Invalid password data', error.errors));
      } else {
        next(error);
      }
    }
  }
}
