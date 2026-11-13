import { describe, expect, it } from 'vitest';
import { compareVersions } from './version';
describe('semantic client versions', () => {
  it.each([
    ['1.2.0', '1.2.0', 0],
    ['1.10.0', '1.9.9', 1],
    ['2.0.0', '1.99.99', 1],
    ['1.2.0', '1.2.1', -1],
    ['1.2.0-beta.2', '1.2.0-beta.10', -1],
    ['1.2.0-rc.1', '1.2.0', -1],
    ['1.2.0+4', '1.2.0+3', 0],
  ])('compares %s against %s', (a, b, result) => expect(compareVersions(a, b)).toBe(result));
  it('rejects a malformed server version instead of guessing compatibility', () =>
    expect(() => compareVersions('unknown', '1.2.0')).toThrow('Invalid version'));
});
