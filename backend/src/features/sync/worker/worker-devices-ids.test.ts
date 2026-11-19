import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../lib/prisma', () => ({ prisma: {} }));
import { pairDeviceSchema } from './worker-devices';

// A real shop's Main branch id: UUID-shaped, but its variant digit (0) is not RFC 4122.
const shopBranch = 'de9fa656-1fa7-579a-0c16-63cd6cbbed95';

describe('phone pairing ids', () => {
  it('lets the PC pair a phone to a branch whose id is UUID-shaped but not RFC 4122', () => {
    expect(pairDeviceSchema.safeParse({ userId: '0062e780-9083-4fff-84d5-28b9b6b6dd14', name: 'Phone', branchIds: [shopBranch] }).success).toBe(true);
    expect(pairDeviceSchema.safeParse({ userId: '0062e780-9083-4fff-84d5-28b9b6b6dd14', name: 'Phone', branchIds: ['main'] }).success).toBe(false);
  });
});
