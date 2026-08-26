import { UsersRepository } from '../repositories/users.repository';
import { AppError, NotFoundError, ValidationError } from '../lib/errors';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { invalidateUserSessionStatus } from '../lib/user-session-status';

export class UsersService {
  static async createUser(data: { username: string; passwordString: string; fullName: string; role?: 'ADMIN' | 'EMPLOYEE' }) {
    const existing = await UsersRepository.findByUsername(data.username);
    if (existing) {
      throw new ValidationError('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(data.passwordString, 12);
    
    return UsersRepository.create({
      username: data.username,
      password: hashedPassword,
      fullName: data.fullName,
      role: data.role || 'EMPLOYEE',
    });
  }

  static async listUsers(skip?: number, take?: number) {
    return UsersRepository.findAll(skip, take);
  }

  static async getUser(id: string) {
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  static async updateUser(
    id: string,
    data: { fullName?: string; passwordString?: string; role?: 'ADMIN' | 'EMPLOYEE'; isActive?: boolean },
    actorUserId: string,
  ) {
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (id === actorUserId && data.isActive === false) {
      throw new ValidationError('You cannot deactivate your own account');
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (data.fullName) updateData.fullName = data.fullName;
    if (data.role) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (data.passwordString) {
      updateData.password = await bcrypt.hash(data.passwordString, 12);
    }

    const updatedUser = await UsersRepository.update(id, updateData);
    invalidateUserSessionStatus(id);
    return updatedUser;
  }

  static async deactivateUser(id: string, actorUserId: string) {
    const user = await UsersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (id === actorUserId) {
      throw new ValidationError('You cannot deactivate your own account');
    }
    
    if (user.role === 'ADMIN') {
      // Prevent deleting the last admin
      const allUsers = await UsersRepository.findAll();
      const adminCount = allUsers.filter(u => u.role === 'ADMIN' && u.isActive).length;
      if (adminCount <= 1) {
        throw new ValidationError('Cannot deactivate the last active admin account');
      }
    }

    const deletedUser = await UsersRepository.softDelete(id);
    invalidateUserSessionStatus(id);
    return deletedUser;
  }
}
