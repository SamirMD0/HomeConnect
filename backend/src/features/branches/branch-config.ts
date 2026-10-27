/** Phase 2: read this flag only here, until request scoping is released. */
export function multiBranchScopingEnabled(): boolean {
  return process.env.MULTI_BRANCH_SCOPING_ENABLED === 'true';
}
