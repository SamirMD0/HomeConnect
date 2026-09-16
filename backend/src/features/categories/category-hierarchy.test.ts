import { describe, expect, it } from 'vitest';
import { categoryPath, descendantIds, validateHierarchy } from './category-hierarchy';

const root = { id: 'a', name: 'Home Appliances', parentId: null, isActive: true };
const kitchen = { id: 'b', name: 'Kitchen', parentId: 'a', isActive: true };
const cooker = { id: 'c', name: 'Cookers', parentId: 'b', isActive: true };
const electronics = { id: 'd', name: 'Electronics', parentId: null, isActive: true };
const tv = { id: 'e', name: 'TV', parentId: 'd', isActive: true };
const tree = [root, kitchen, cooker, electronics, tv];

describe('English category hierarchy', () => {
  it('supports the owner’s three-level grouping and English paths', () => {
    expect(() => validateHierarchy(tree)).not.toThrow();
    expect(categoryPath(cooker)).toBe('Cookers');
    expect(categoryPath({ ...cooker, parent: { ...kitchen, parent: root } })).toBe(
      'Home Appliances → Kitchen → Cookers'
    );
    expect(descendantIds(tree, 'a')).toEqual(['a', 'b', 'c']);
    expect(descendantIds(tree, 'd')).toEqual(['d', 'e']);
    expect(descendantIds(tree, 'unknown')).toEqual([]);
  });
  it('rejects self parenting, cycles and missing parents', () => {
    expect(() => validateHierarchy([{ ...root, parentId: 'a' }])).toThrow(/cycle/i);
    expect(() => validateHierarchy([{ ...root, parentId: 'b' }, kitchen])).toThrow(/cycle/i);
    expect(() => validateHierarchy([kitchen])).toThrow(/parent/i);
  });
  it('rejects a fourth level and a reparent that makes a descendant too deep', () => {
    expect(() =>
      validateHierarchy([...tree, { id: 'f', name: 'Gas', parentId: 'c', isActive: true }])
    ).toThrow(/three/i);
    expect(() =>
      validateHierarchy(tree.map((row) => (row.id === 'a' ? { ...row, parentId: 'd' } : row)))
    ).toThrow(/three/i);
  });
  it('returns deterministic descendants regardless of input order', () => {
    expect(descendantIds([...tree].reverse(), 'a')).toEqual(descendantIds(tree, 'a'));
  });
});
