import { afterEach, describe, expect, it, vi } from 'vitest';
import { multiBranchScopingEnabled } from './branch-config';

describe('multi-branch release switch', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is on by default, so installed copies need no configuration file edit', () => {
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', undefined as unknown as string);
    expect(multiBranchScopingEnabled()).toBe(true);
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', '');
    expect(multiBranchScopingEnabled()).toBe(true);
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'true');
    expect(multiBranchScopingEnabled()).toBe(true);
  });

  it('can still be turned off as an emergency switch', () => {
    for (const value of ['false', 'FALSE', ' false ']) {
      vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', value);
      expect(multiBranchScopingEnabled(), value).toBe(false);
    }
  });
});
