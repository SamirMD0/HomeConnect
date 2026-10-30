/**
 * Multi-branch operation is released (2.0.11): an administrator can activate a
 * second branch from Settings without touching configuration files.
 * MULTI_BRANCH_SCOPING_ENABLED=false remains only as an emergency switch that
 * limits an installation to one active branch. Read this flag only here.
 */
export function multiBranchScopingEnabled(): boolean {
  return process.env.MULTI_BRANCH_SCOPING_ENABLED?.trim().toLowerCase() !== 'false';
}
