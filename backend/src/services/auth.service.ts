import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AuthenticationError, AuthorizationError, AppError } from '../lib/errors';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class AuthService {
  /**
   * Generates Access and Refresh tokens
   */
  static generateTokens(userId: string, role: string) {
    const payload = { userId, role };
    
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRY as any });
    const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_EXPIRY as any });
    
    return { accessToken, refreshToken };
  }

  /**
   * Login user and handle lockout
   */
  static async login(username: string, passwordString: string) {
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || user.deletedAt) {
      throw new AuthenticationError('Invalid username or password');
    }

    if (!user.isActive) {
      throw new AuthorizationError('Account is deactivated. Please contact an administrator.');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthenticationError('Account is temporarily locked due to too many failed login attempts. Try again later.');
    }

    // Verify password
    const isMatch = await bcrypt.compare(passwordString, user.password);

    if (!isMatch) {
      // Increment failed attempts
      const newAttempts = user.failedLoginAttempts + 1;
      let lockUntil: Date | null = null;
      
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { 
          failedLoginAttempts: newAttempts,
          lockedUntil: lockUntil
        }
      });

      if (lockUntil) {
        throw new AuthenticationError(`Account locked for 15 minutes due to too many failed attempts.`);
      }

      throw new AuthenticationError('Invalid username or password');
    }

    // Successful login: reset attempts
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null }
    });

    const tokens = this.generateTokens(user.id, user.role);
    
    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      ...tokens
    };
  }

  /**
   * Verify refresh token and issue new tokens
   */
  static async refreshToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string, role: string };
      
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      
      if (!user || user.deletedAt || !user.isActive) {
        throw new AuthenticationError('Invalid token or account deactivated');
      }

      const tokens = this.generateTokens(user.id, user.role);
      return tokens;
    } catch (error) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }
  }

  /**
   * Initial Setup: Create the first admin account
   */
  static async setupFirstAdmin(username: string, passwordString: string, fullName: string) {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: Role.ADMIN }
    });

    if (existingAdmin) {
      throw new AppError('An admin account already exists. Setup is disabled.', 400);
    }

    const hashedPassword = await bcrypt.hash(passwordString, 12);

    const newAdmin = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        role: Role.ADMIN,
      }
    });

    const tokens = this.generateTokens(newAdmin.id, newAdmin.role);

    return {
      user: {
        id: newAdmin.id,
        username: newAdmin.username,
        fullName: newAdmin.fullName,
        role: newAdmin.role,
      },
      ...tokens
    };
  }
}
