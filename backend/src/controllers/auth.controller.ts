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
      const result = await AuthService.setupAccount({
        username: validatedData.username,
        passwordString: validatedData.password,
        fullName: validatedData.fullName,
        role: validatedData.role,
        adminUsername: validatedData.adminUsername,
        adminPassword: validatedData.adminPassword,
      });

      if ('refreshToken' in result && result.refreshToken) {
        res.cookie('refreshToken', result.refreshToken, {
          httpOnly: true,
          secure: process.env.COOKIE_SECURE === 'true',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }

      const responseData: {
        user: typeof result.user;
        accessToken?: string;
      } = {
        user: result.user,
      };

      if ('accessToken' in result && result.accessToken) {
        responseData.accessToken = result.accessToken;
      }

      res.status(201).json({
        success: true,
        data: responseData
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
        secure: process.env.COOKIE_SECURE === 'true',
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
        // A missing cookie means there is no session to restore. This is a
        // normal cold-start state, not a failed authentication attempt.
        return res.status(204).send();
      }

      const tokens = await AuthService.refreshToken(refreshToken);

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
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
