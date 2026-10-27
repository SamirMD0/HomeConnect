import {describe,expect,it,vi} from 'vitest';
import {assertScratchDatabase,canonical,closureChecks} from './branch-reconciliation';
describe('branch reconciliation safeguards',()=>{
 it('refuses business names, including percent-encoded names',()=>{
  for(const name of ['homeconnect','%68omeconnect','homeconnect_production','test_homeconnect']) expect(()=>assertScratchDatabase('postgresql://localhost/'+name)).toThrow(/Refusing/);
  expect(()=>assertScratchDatabase(undefined)).toThrow();
 });
 it('allows only explicitly isolated names',()=>{
  for(const name of ['homeconnect_test_phase4_phase5_phase6','homeconnect_reconcile','homeconnect_test_mb_seed','hc_audit_test']) expect(assertScratchDatabase('postgresql://localhost/'+name)).toBe(name);
 });
 it('compares every business value while ignoring clocks and row order',()=>{
  expect(canonical({rows:[{id:'b',amount:'1.00'},{id:'a',amount:'2.00'}],generatedAt:'before'})).toEqual(canonical({rows:[{id:'a',amount:'2.00'},{id:'b',amount:'1.00'}],generatedAt:'after'}));
  expect(canonical({amount:'1.00'})).not.toEqual(canonical({amount:'1.01'}));
 });
 it('skips closure on the pre-branch schema and rejects a partial upgrade',async()=>{
  const query=vi.fn().mockResolvedValue([{table_name:'customers'}]);
  const db={$queryRaw:query} as unknown as Parameters<typeof closureChecks>[0];
  expect(await closureChecks(db)).toBeNull();
  query.mockResolvedValue([{table_name:'customers'},{table_name:'debts'}]);
  await expect(closureChecks(db)).rejects.toThrow(/Partial branch schema/);
 });
});
