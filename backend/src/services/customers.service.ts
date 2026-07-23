import { CustomersRepository } from '../repositories/customers.repository';
import { NotFoundError, ValidationError } from '../lib/errors';
import { Prisma } from '@prisma/client';

export class CustomersService {
  static async createCustomer(data: { name: string; phone: string; address?: string | null; notes?: string | null; createdBy: string }) {
    const existingPhone = await CustomersRepository.findByPhone(data.phone);
    if (existingPhone) {
      throw new ValidationError('A customer with this phone number already exists.');
    }

    return CustomersRepository.create({
      name: data.name,
      phone: data.phone,
      address: data.address,
      notes: data.notes,
      createdBy: data.createdBy,
    });
  }

  static async listCustomers(params: {
    skip?: number;
    take?: number;
    search?: string;
    sortBy?: 'name' | 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
  }) {
    return CustomersRepository.findAll(params);
  }

  static async getCustomer(id: string) {
    const customer = await CustomersRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    return customer;
  }

  static async updateCustomer(id: string, data: { name?: string; phone?: string; address?: string | null; notes?: string | null; isActive?: boolean }) {
    const customer = await CustomersRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    if (data.phone && data.phone !== customer.phone) {
      const existingPhone = await CustomersRepository.findByPhone(data.phone);
      if (existingPhone) {
        throw new ValidationError('A customer with this phone number already exists.');
      }
    }

    const updateData: Prisma.CustomerUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return CustomersRepository.update(id, updateData);
  }

  static async deleteCustomer(id: string) {
    const customer = await CustomersRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    return CustomersRepository.softDelete(id);
  }
}
