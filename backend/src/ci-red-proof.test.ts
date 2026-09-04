import { expect, it } from 'vitest';

it('deliberately proves that CI reports a failing test', () => {
  expect('red').toBe('green');
});
