import { Role } from '@prisma/client';

export interface SupplierMutationUser {
  userId: string;
  role: Role | string;
}

export interface SupplierRequestContext {
  requestId?: string | null;
  ipAddress?: string | null;
}
