import { Role } from '@prisma/client';

export interface ServiceMutationUser {
  userId: string;
  role: Role | string;
}

export interface RequestContext {
  requestId?: string | null;
  ipAddress?: string | null;
}
