import { describe, expect, it } from 'vitest';
import { accessTokenNeedsRefresh } from './jwt-expiry';
const now = 1_800_000_000_000;
const jwt = (payload: unknown) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.unverified`;
describe('access expiry scheduling without verification', () => {
  it.each([-60, 0, 120, 299])('refreshes when exp is %s seconds away', (seconds) => {
    expect(accessTokenNeedsRefresh(jwt({ exp: now / 1000 + seconds }), now)).toBe(true);
  });
  it.each([300, 3600])('keeps a token with %s seconds remaining', (seconds) => {
    expect(accessTokenNeedsRefresh(jwt({ exp: now / 1000 + seconds }), now)).toBe(false);
  });
  it.each(['not-a-jwt', 'header.###.sig', jwt({}), jwt({ exp: 'tomorrow' })])(
    'ignores missing or invalid expiry: %s',
    (token) => {
      expect(accessTokenNeedsRefresh(token, now)).toBe(false);
    }
  );
});
