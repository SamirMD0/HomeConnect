import { ValidationError } from '../../lib/errors';

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}
export interface CategoryWithParent {
  name: string;
  parent?: CategoryWithParent | null;
}
export const categoryInclude = { parent: { include: { parent: true } } } as const;

export function categoryPath(category: CategoryWithParent): string {
  return category.parent ? `${categoryPath(category.parent)} → ${category.name}` : category.name;
}

export function validateHierarchy(rows: CategoryNode[]): void {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    const visited = new Set<string>();
    let cursor: CategoryNode | undefined = row;
    while (cursor) {
      if (visited.has(cursor.id))
        throw new ValidationError('Category hierarchy cannot contain a cycle');
      visited.add(cursor.id);
      if (cursor.parentId === null) break;
      cursor = byId.get(cursor.parentId);
      if (!cursor) throw new ValidationError('Parent category not found');
    }
    if (visited.size > 3) throw new ValidationError('Categories support at most three levels');
  }
}

export function descendantIds(rows: CategoryNode[], id: string): string[] {
  const included = new Set(rows.some((row) => row.id === id) ? [id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows)
      if (row.parentId && included.has(row.parentId) && !included.has(row.id)) {
        included.add(row.id);
        changed = true;
      }
  }
  return [...included].sort();
}
