import { describe, expect, it } from 'vitest';
import { pairedUser, parseCloudPairing } from './cloud-pairing';
const value = { v: 1, relay: 'https://relay.example.com', deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 'x'.repeat(43),
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', userName: 'Shop user', branchIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] };
describe('cloud QR connection mode', () => {
  it('validates and retains the paired identity without granting admin privileges from untrusted QR fields', () => {
    const parsed = parseCloudPairing(JSON.stringify({ ...value, role: 'ADMIN' }));
    expect(parsed).toEqual(value);
    expect(pairedUser(parsed!).role).toBe('EMPLOYEE');
  });
  it.each([{ relay: 'http://relay.example.com' }, { relay: 'https://user:secret@relay.example.com' }, { token: 'short' }, { branchIds: [] }, { v: 2 }])('rejects malformed pairing data %j', change => {
    expect(parseCloudPairing(JSON.stringify({ ...value, ...change }))).toBeNull();
  });
});
