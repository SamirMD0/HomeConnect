# Phase 3A implementation handoff

## 1. Branch and implementation commits

Branch: `feature/multi-branch-phase-3`; based on `develop` at `bab651f`. The main checkout was left untouched. No push, merge, or Phase 3B work.

```text
e8f3099 feat(branches): resolve customer and supplier request scopes
a27233a feat(branches): guard customer and supplier parent routes
2f874f5 test(branches): support Node16 scoped fixture imports
470548f feat(branches): scope customer access and phone checks
9638269 feat(branches): scope supplier reads and mutations
5a146ef test(branches): prove customer and supplier isolation
4407ad6 test(branches): resolve migrated employee scope from grants
```

The final evidence commit is listed in the final handoff message (a commit cannot contain its own hash).

## 2. Middleware, helpers, and guard code

### backend/src/middleware/branch-scope.middleware.ts

```ts
import type { NextFunction, Request, Response } from 'express';
import { BranchesService } from '../features/branches/branches.service';
import { AppError, AuthenticationError, ValidationError } from '../lib/errors';
import { databaseUuidSchema } from '../validators/database-uuid';

export async function branchScopeMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AuthenticationError();
    const header = req.headers['x-branch-scope'];
    if (
      header !== undefined &&
      header !== 'all' &&
      !databaseUuidSchema().safeParse(header).success
    ) {
      throw new ValidationError('Invalid X-Branch-Scope; expected a branch UUID or "all"');
    }
    // Fetch on every request: branch deactivation and grant revocation apply immediately.
    const branches = await BranchesService.accessibleBranches(req.user);
    const branchIds = branches.map((branch) => branch.id);
    if (header !== undefined && header !== 'all') {
      const id = (header as string).toLowerCase();
      if (!branchIds.includes(id)) {
        throw new AppError('You do not have access to this branch.', 403, 'BRANCH_ACCESS_DENIED');
      }
      req.branchScope = { mode: 'single', branchIds: [id] };
    } else {
      req.branchScope = { mode: 'all', branchIds };
    }
    next();
  } catch (error) {
    next(error);
  }
}
```

### backend/src/features/branches/branch-scope.ts

```ts
import { AppError, NotFoundError } from '../../lib/errors';

export interface BranchScope {
  mode: 'single' | 'all';
  branchIds: string[];
}

/** An empty accessible set deliberately matches no records. */
export function scopeWhere(scope: BranchScope) {
  return { branchId: { in: scope.branchIds } };
}

/** Missing headers remain writable for a shop with exactly one accessible branch. */
export function writeBranch(scope: BranchScope): string {
  if (scope.branchIds.length === 0) {
    throw new AppError(
      'No active branch is available for this user. An administrator must assign one in Settings → Branches.',
      409,
      'NO_BRANCH_AVAILABLE'
    );
  }
  if (scope.branchIds.length !== 1) {
    throw new AppError(
      'Select a branch before creating records.',
      409,
      'BRANCH_SELECTION_REQUIRED'
    );
  }
  return scope.branchIds[0];
}

export function assertInScope(
  branchId: string,
  scope: BranchScope,
  missingMessage = 'Resource not found'
): void {
  if (!scope.branchIds.includes(branchId)) throw new NotFoundError(missingMessage);
}
```

### backend/src/middleware/branch-parent.middleware.ts

```ts
import type { NextFunction, Request, Response } from 'express';
import { assertInScope, writeBranch } from '../features/branches/branch-scope';
import { prisma } from '../lib/prisma';
import { databaseUuidSchema } from '../validators/database-uuid';

/** Mounted at the entity prefix, before every router sharing that prefix. */
function parentScopeGuard(kind: 'customer' | 'supplier') {
  return async function guardParentScope(req: Request, _res: Response, next: NextFunction) {
    try {
      // Decode the same segment Express will expose to downstream parameter handlers.
      // An encoded UUID must not bypass the parent guard.
      const rawId = req.path.split('/')[1] ?? '';
      let id: string;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        return next();
      }
      if (!databaseUuidSchema().safeParse(id).success) return next();
      const parent =
        kind === 'customer'
          ? await prisma.customer.findUnique({ where: { id }, select: { branchId: true } })
          : await prisma.supplier.findUnique({ where: { id }, select: { branchId: true } });
      // Preserve downstream missing-parent handling (including validation and role checks).
      if (parent) {
        const message =
          kind === 'customer'
            ? 'Customer not found'
            : req.method === 'POST' && req.path.split('/')[2]?.toLowerCase() === 'purchases'
              ? 'Supplier not found / المورد غير موجود'
              : 'Supplier not found';
        assertInScope(parent.branchId, req.branchScope!, message);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) writeBranch(req.branchScope!);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const customerParentGuard = parentScopeGuard('customer');
export const supplierParentGuard = parentScopeGuard('supplier');
```

Request declaration in `backend/src/middleware/auth.middleware.ts` (with its BranchScope type import):

```ts
declare global {
  namespace Express {
    interface Request {
      branchScope?: BranchScope;
      user?: {
        userId: string;
        role: string;
      };
    }
  }
}
```

The scope and parent guard mounts precede every router sharing either prefix. Accessible active branches are fetched through BranchesService.accessibleBranches on each request. Missing-parent handling remains downstream; out-of-scope parents use existing missing-record messages. Supplier purchase creation retains its existing bilingual message. UUID path segments are decoded before checking the parent. Non-read nested requests also use writeBranch.

## 3. Complete customer and supplier route inventory

All 31 method/path pairs below are from the actual Express stack, captured by the registry-based meta-test. Every route inherits requireAuth, branchScopeMiddleware, and its parent guard. Parent guards perform a branchId-only select only for a UUID first segment; literal search paths pass through.

| Method | Path | Scoping |
|---|---|---|
| GET | `/api/v1/customers/:customerId/debts` | By-parent guard; downstream service unchanged for 3B |
| POST | `/api/v1/customers/:customerId/debts` | By-parent guard; writeBranch before downstream mutation; downstream service unchanged for 3B |
| POST | `/api/v1/customers/:customerId/prepaid-purchases` | By-parent guard; writeBranch before downstream mutation; downstream service unchanged for 3B |
| GET | `/api/v1/customers/:customerId/installment-plans` | By-parent guard; downstream service unchanged for 3B |
| POST | `/api/v1/customers/:customerId/installment-plans` | By-parent guard; writeBranch before downstream mutation; downstream service unchanged for 3B |
| GET | `/api/v1/customers/:customerId/activity` | By-parent guard; downstream service unchanged for 3B |
| GET | `/api/v1/customers/:customerId/financial-summary` | By-parent guard; downstream service unchanged for 3B |
| GET | `/api/v1/customers/:customerId/statement` | By-parent guard; downstream service unchanged for 3B |
| GET | `/api/v1/customers/:customerId/corrections` | By-parent guard; downstream service unchanged for 3B |
| GET | `/api/v1/customers/:customerId/service-jobs` | By-parent guard; downstream service unchanged for 3B |
| GET | `/api/v1/customers/:customerId/sales-orders` | By-parent guard; downstream service unchanged for 3B |
| GET | `/api/v1/customers` | scopeWhere on list/count; search SQL receives scope |
| GET | `/api/v1/customers/search` | scopeWhere + parameterized SQL branch filter before LIMIT |
| GET | `/api/v1/customers/search-suggestions` | Parameterized branch filter on primary matches, candidate names and suggestion counts; literal path passes parent guard |
| POST | `/api/v1/customers` | writeBranch; explicit branch on create |
| GET | `/api/v1/customers/:id` | By-parent guard + repository scopeWhere + assertInScope |
| PUT | `/api/v1/customers/:id` | By-parent guard + repository scopeWhere + assertInScope; writeBranch before mutation |
| DELETE | `/api/v1/customers/:id` | By-parent guard + repository scopeWhere + assertInScope; writeBranch before mutation |
| GET | `/api/v1/suppliers/:supplierId/transactions` | By-parent guard; downstream service unchanged for 3B |
| POST | `/api/v1/suppliers/:supplierId/transactions` | By-parent guard; writeBranch before downstream mutation; downstream service unchanged for 3B |
| GET | `/api/v1/suppliers/:supplierId/purchases` | By-parent guard; downstream service unchanged for 3B |
| POST | `/api/v1/suppliers/:supplierId/purchases` | By-parent guard; writeBranch before downstream mutation; downstream service unchanged for 3B |
| GET | `/api/v1/suppliers` | scopeWhere on list/count; search SQL receives scope |
| POST | `/api/v1/suppliers` | writeBranch; explicit branch on create |
| GET | `/api/v1/suppliers/:supplierId/summary` | By-parent guard + assertInScope |
| GET | `/api/v1/suppliers/:supplierId/audit` | By-parent guard + assertInScope |
| POST | `/api/v1/suppliers/:supplierId/archive` | By-parent guard + assertInScope; writeBranch before mutation |
| POST | `/api/v1/suppliers/:supplierId/restore` | By-parent guard + assertInScope; writeBranch before mutation |
| PATCH | `/api/v1/suppliers/:supplierId` | By-parent guard + assertInScope; writeBranch before mutation |
| DELETE | `/api/v1/suppliers/:supplierId` | By-parent guard + assertInScope; writeBranch before mutation |
| GET | `/api/v1/suppliers/:supplierId` | By-parent guard + assertInScope |

Customer and supplier list/detail records already came from full Prisma rows at this baseline, including branchId. 3A preserves those fields and pins branchId with API tests. Financial summary fields and all other response fields are unchanged.

## 4. Raw SQL diff

```diff
diff --git a/backend/src/features/customers/customer-suggestions.service.ts b/backend/src/features/customers/customer-suggestions.service.ts
index ce3eb07..bfc53db 100644
--- a/backend/src/features/customers/customer-suggestions.service.ts
+++ b/backend/src/features/customers/customer-suggestions.service.ts
@@ -0,0 +1 @@
+import type { BranchScope } from '../branches/branch-scope';
@@ -19 +20,2 @@ export class CustomerSuggestionsService {
-  static async suggest(rawTerm: string | null | undefined, requestedLimit = MAX_SUGGESTIONS) {
+  static async suggest(rawTerm: string | null | undefined, scope: BranchScope, requestedLimit = MAX_SUGGESTIONS) {
+    if (scope.branchIds.length === 0) return [];
@@ -25 +27 @@ export class CustomerSuggestionsService {
-    const primaryMatches = await findSearchMatchIds('customer', trimmed);
+    const primaryMatches = await findSearchMatchIds('customer', trimmed, undefined, scope);
@@ -33,0 +36 @@ export class CustomerSuggestionsService {
+          AND "branchId" = ANY(${scope.branchIds}::uuid[])
@@ -46 +49 @@ export class CustomerSuggestionsService {
-      const matches = await findSearchMatchIds('customerNamePhone', candidate.query);
+      const matches = await findSearchMatchIds('customerNamePhone', candidate.query, undefined, scope);
diff --git a/backend/src/lib/search-query.ts b/backend/src/lib/search-query.ts
index aaa5626..a237751 100644
--- a/backend/src/lib/search-query.ts
+++ b/backend/src/lib/search-query.ts
@@ -0,0 +1 @@
+import type { BranchScope } from '../features/branches/branch-scope';
@@ -118 +119,2 @@ export async function findSearchMatchIds(
-  limit: number = MAX_SEARCH_IDS
+  limit: number = MAX_SEARCH_IDS,
+  scope?: BranchScope
@@ -119,0 +122,2 @@ export async function findSearchMatchIds(
+  // 3A supplies scope for customer/supplier routes. Financial callers migrate in 3B.
+  if (scope && scope.branchIds.length === 0) return [];
@@ -174,0 +179,3 @@ export async function findSearchMatchIds(
+  const branchFilter = scope
+    ? Prisma.sql`AND "branchId" = ANY(${scope.branchIds}::uuid[])`
+    : Prisma.empty;
@@ -176 +183 @@ export async function findSearchMatchIds(
-    Prisma.sql`SELECT id FROM ${config.table} WHERE ${where} LIMIT ${limit}`
+    Prisma.sql`SELECT id FROM ${config.table} WHERE ${where} ${branchFilter} LIMIT ${limit}`
```

The shared search helper keeps its scope argument optional because existing financial-ledger, receivables and supplier-transaction callers belong to 3B. Every 3A customer/supplier caller supplies scope explicitly. Their repository/service scope parameters are required. Filters bind the UUID array before LIMIT; empty sets yield no rows.

## 5. Phone uniqueness

No DB index or migration was added. The user explicitly confirmed that the no-migrations rule takes precedence and that the index is deferred. Guarded precheck on homeconnect_test_phase4_phase5_phase6 found 0 duplicate non-deleted (branchId, phone) groups. This is test-database evidence; production was not inspected.

Create and update check exact, unnormalized phone strings in the record’s branch, excluding soft-deleted rows as before. The check and write use the same serializable runFinancialTransaction. The real-DB concurrency test admits one simultaneous same-branch creation and rejects the other. Cross-branch create/update and phone formatting are also tested.

```sql
SELECT COUNT(*)::int AS duplicate_groups
FROM (
  SELECT "branchId", phone FROM customers WHERE "deletedAt" IS NULL
  GROUP BY "branchId", phone HAVING COUNT(*) > 1
) d;
-- duplicate_groups = 0 (authorized throwaway test database only)
```

## 6. Validation and new isolation tests

```json
{
  "database": "homeconnect_test_phase4_phase5_phase6",
  "files": 400,
  "passed": 3099,
  "failed": 0,
  "skipped": 0,
  "todo": 0,
  "addedTests": 69,
  "isolationTests": 33,
  "typecheck": "PASS",
  "lint": {
    "errors": 0,
    "warnings": 91,
    "addedWarnings": 0
  },
  "migrationTestSupplementalTypecheck": "PASS",
  "migrationTestSupplementalLint": "PASS",
  "graphify": "PASS",
  "migrationSha256": "776a8bb45e18c487cf8841c4f53416f7faba327c44e43e67e42327e98ca55ee5"
}
```

`npm run typecheck` passed (frontend + backend, 0 errors). `npm run lint` passed (0 errors, 91 existing warnings, 0 added warning instances). The changed migration test under backend/prisma was additionally typechecked with the existing Electron ambient types and linted explicitly. Graphify update completed using local structural extraction before final CI.

The first new isolated run exposed a fuzzy-search fixture collision; distinct notes fixed the fixture without changing the search algorithm. The first full CI run caught a missed direct createCustomer call in the existing migration test and an unchanged SVG seed cold-load timeout. Only that test’s scope/lookup fixture changed; every prior assertion remains. The SVG test was left unchanged. Final CI and focused rerun results are recorded in validation.txt.

New API isolation tests:

- Phase 3A customer and supplier branch isolation employee lists and searches only A customers, including financial filtering and notes search
- Phase 3A customer and supplier branch isolation employee suggestions exclude B primary matches, candidate names and counts; literal path stays a search route
- Phase 3A customer and supplier branch isolation denies the employee B header on customers with BRANCH_ACCESS_DENIED
- Phase 3A customer and supplier branch isolation denies the employee B header on suppliers with BRANCH_ACCESS_DENIED
- Phase 3A customer and supplier branch isolation rejects an invalid branch header on customers
- Phase 3A customer and supplier branch isolation rejects an invalid branch header on suppliers
- Phase 3A customer and supplier branch isolation returns the same customer 404 for employee GET, PUT and DELETE of a B record, without changing it
- Phase 3A customer and supplier branch isolation hides B supplier detail, summary, audit, PATCH, archive, restore and DELETE before role checks
- Phase 3A customer and supplier branch isolation guards the B customer nested route /debts by parent
- Phase 3A customer and supplier branch isolation guards the B customer nested route /installment-plans by parent
- Phase 3A customer and supplier branch isolation guards the B customer nested route /statement?from=2026-01-01&to=2026-01-31 by parent
- Phase 3A customer and supplier branch isolation guards the B customer nested route /financial-summary by parent
- Phase 3A customer and supplier branch isolation guards the B customer nested route /activity by parent
- Phase 3A customer and supplier branch isolation guards the B customer nested route /corrections by parent
- Phase 3A customer and supplier branch isolation guards the B customer nested route /sales-orders by parent
- Phase 3A customer and supplier branch isolation guards the B customer nested route /service-jobs by parent
- Phase 3A customer and supplier branch isolation guards the B supplier nested route /transactions by parent
- Phase 3A customer and supplier branch isolation guards the B supplier nested route /purchases by parent
- Phase 3A customer and supplier branch isolation employee supplier list, search, balance sort and detail contain only A
- Phase 3A customer and supplier branch isolation admin header A sees A and all sees A+B for customers
- Phase 3A customer and supplier branch isolation admin header A sees A and all sees A+B for suppliers
- Phase 3A customer and supplier branch isolation admin header A hides B customer and supplier detail
- Phase 3A customer and supplier branch isolation admin cannot create customers in multi-branch all scope
- Phase 3A customer and supplier branch isolation admin cannot create suppliers in multi-branch all scope
- Phase 3A customer and supplier branch isolation multi-branch all scope rejects direct and nested writes before downstream mutations
- Phase 3A customer and supplier branch isolation same phone is allowed across branches and rejected within A on creation
- Phase 3A customer and supplier branch isolation phone updates compare only the record branch and preserve phone formatting
- Phase 3A customer and supplier branch isolation serializable phone checks admit only one concurrent create in the same branch
- Phase 3A customer and supplier branch isolation no-header single-accessible-branch requests preserve customer read/create/update/delete behavior
- Phase 3A customer and supplier branch isolation selected-branch supplier create, contact edit, archive, restore and delete retain their behavior
- Phase 3A customer and supplier branch isolation no-grant employee sees empty lists/search/suggestions and cannot create
- Phase 3A customer and supplier branch isolation grant revocation is effective on the next request despite unchanged JWT claims
- Phase 3A customer and supplier branch isolation branch deactivation removes access on the next request

All 69 newly added test names (including scope helpers, header resolution, parent guards, SQL binding and route coverage) are recorded in test-names.json.

## 7. Decisions, assumptions, and checkpoint boundaries

- The user approved explicit scope fixtures and branch-access mocks for existing tests while preserving all assertions. This includes the Phase 2 migration grant test, whose scope comes from actual migrated employee grants.

- The prompt overrides the older plan’s 400/all-write wording: missing and all headers resolve to all accessible active branches; writes work with exactly one and return 409 NO_BRANCH_AVAILABLE or BRANCH_SELECTION_REQUIRED otherwise.

- The user confirmed no migrations: the phone index is deferred. No schema, migration SQL, money calculation, balance computation or stored financial value changed. The Phase 2 migration SHA-256 remains 776a8bb45e18c487cf8841c4f53416f7faba327c44e43e67e42327e98ca55ee5.

- Authenticated req.user roles keep their existing authentication/JWT behavior; branch IDs and grants are loaded from the database per request and are never trusted from JWT claims. Grant revocation and branch deactivation are tested on the very next request.

- Only /api/v1/customers and /api/v1/suppliers are scoped in 3A. Their nested financial routes are protected by parent at the app boundary; downstream 3B services and top-level financial/sales routes remain unchanged. Reports/dashboards/raw SQL in 3C, selector UI, printed documents, mobile session binding and production readiness remain later checkpoints.

- The develop baseline at bab651f has the scanner-only LAN listener; the ERP mobile gateway exists among the unrelated main-checkout work and was not copied or modified. Headerless supplier HTTP API reads were verified; mobile session binding remains 3D.

- MULTI_BRANCH_SCOPING_ENABLED and the single-active/last-active branch guards are unchanged. Only the isolation fixture temporarily enables the flag. Multi-branch production readiness is not enabled.

- node_modules reuses the existing identical Phase 2 dependencies through a local junction. backend/.env is ignored and changes only DATABASE_URL’s database name. All DB commands used the throwaway-name guard; scratch migration DBs were created/dropped by the existing CI suite. No production/backup/business DB was used.

- No 3A change required modifying production code in 3B–3D; no checkpoint boundary was expanded.
