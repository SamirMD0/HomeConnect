import { AuthenticationError } from './errors';
import { prisma } from './prisma';

export const USER_SESSION_STATUS_CACHE_TTL_MS = 30_000;

type ActiveUserSession = {
  role: string;
};

type CachedActiveUserSession = {
  user: ActiveUserSession;
  expiresAt: number;
};

const activeUserCache = new Map<string, CachedActiveUserSession>();

export async function requireActiveUserSession(userId: string): Promise<ActiveUserSession> {
  const cached = activeUserCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  activeUserCache.delete(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, deletedAt: true },
  });

  if (!user || user.deletedAt || !user.isActive) {
    throw new AuthenticationError('Invalid token or account deactivated');
  }

  const activeUser = { role: user.role };
  activeUserCache.set(userId, {
    user: activeUser,
    expiresAt: Date.now() + USER_SESSION_STATUS_CACHE_TTL_MS,
  });

  return activeUser;
}

export function invalidateUserSessionStatus(userId: string): void {
  activeUserCache.delete(userId);
}

export function clearUserSessionStatusCache(): void {
  activeUserCache.clear();
}
