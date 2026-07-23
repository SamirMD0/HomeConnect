import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export class UsersRepository {
  static async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        branchId: true,
      }
    });
  }

  static async findByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username }
    });
  }

  static async findAll(skip?: number, take?: number) {
    return prisma.user.findMany({
      where: { deletedAt: null },
      skip,
      take,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        branchId: true,
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async create(data: Prisma.UserCreateInput) {
    return prisma.user.create({
      data,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      }
    });
  }

  static async update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      }
    });
  }

  static async softDelete(id: string) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
  }
}
