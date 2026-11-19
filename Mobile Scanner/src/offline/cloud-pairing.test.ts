import { describe, expect, it } from 'vitest';
import { pairedUser, parseCloudPairing } from './cloud-pairing';
const value = { v: 1, relay: 'https://relay.example.com', deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 'x'.repeat(43),
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', userName: 'Shop user', branchIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] };
describe('cloud QR connection mode', () => {
  it('retains the PC role for cloud menus', () => {
    const parsed = parseCloudPairing(JSON.stringify({ ...value, role: 'ADMIN' }));
    expect(parsed).toEqual({ ...value, role: 'ADMIN' });
    expect(pairedUser(parsed!).role).toBe('ADMIN');
  });
  it('defaults older QR codes without a role to EMPLOYEE', () => {
    expect(pairedUser(parseCloudPairing(JSON.stringify(value))!).role).toBe('EMPLOYEE');
  });
  it('does not let cached PC user JSON override the refreshed device role', () => {
    const pairing = parseCloudPairing(JSON.stringify({ ...value, role: 'EMPLOYEE' }))!;
    expect(pairedUser(pairing, { id: pairing.userId, username: 'shop', fullName: 'Old name', role: 'ADMIN' })).toMatchObject({
      role: 'EMPLOYEE', username: 'shop', fullName: pairing.userName,
    });
  });
  it('accepts shop ids that are UUID-shaped but not RFC 4122', () => {
    const parsed = parseCloudPairing(JSON.stringify({ ...value, branchIds: ['de9fa656-1fa7-579a-0c16-63cd6cbbed95'] }));
    expect(parsed?.branchIds).toEqual(['de9fa656-1fa7-579a-0c16-63cd6cbbed95']);
  });
  it.each([{ branchIds: ['not-a-uuid'] }, { branchIds: ['de9fa656-1fa7-579a-0c16-63cd6cbbed9'] }, { role: 'MANAGER' }, { role: null }, { role: 'admin' }, { relay: 'http://relay.example.com' }, { relay: 'https://user:secret@relay.example.com' }, { token: 'short' }, { branchIds: [] }, { v: 2 }])('rejects malformed pairing data %j', change => {
    expect(parseCloudPairing(JSON.stringify({ ...value, ...change }))).toBeNull();
  });
});
