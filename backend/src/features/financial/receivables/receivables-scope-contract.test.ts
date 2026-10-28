import { describe, expectTypeOf, it } from 'vitest';
import type { BranchScope } from '../../branches/branch-scope';
import { ReceivablesRepository } from './receivables.repository';
import { ReceivablesService } from './receivables.service';

// These calls are never executed. tsc must reject omitted scope at both boundaries.
function requiredScopeContract() {
  // @ts-expect-error branch scope is required
  void ReceivablesRepository.loadReceivableRecords({ includeInactive: true });
  // @ts-expect-error projection consumers must supply scope too
  void ReceivablesService.computeReceivableProjections({ customerIds: [] });
}
void requiredScopeContract;
describe('receivables required scope contract', () => {
  it('requires BranchScope in repository loads and customer projections', () => {
    expectTypeOf<
      Parameters<typeof ReceivablesRepository.loadReceivableRecords>[0]['scope']
    >().toEqualTypeOf<BranchScope>();
    expectTypeOf<
      Parameters<typeof ReceivablesService.computeReceivableProjections>[0]['scope']
    >().toEqualTypeOf<BranchScope>();
  });
});
