import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, FormField, Input, Modal, Select } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import {
  useCategories,
  useCategoryMutation,
  type Category,
  type CategoryInput,
} from '../../features/categories/categories';

export function CategoriesPage() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const query = useCategories();
  const mutation = useCategoryMutation();
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [error, setError] = useState('');
  const rows = [...(query.data ?? [])].sort(
    (a, b) => a.path.localeCompare(b.path, 'en') || a.id.localeCompare(b.id)
  );
  const save = async (input: CategoryInput) => {
    setError('');
    try {
      await mutation.mutateAsync({ id: editing?.id, input });
      setEditing(undefined);
    } catch (failure) {
      setError(message(failure));
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setError('');
    try {
      await mutation.mutateAsync({ id: deleting.id, remove: true });
      setDeleting(null);
    } catch (failure) {
      setError(message(failure));
    }
  };
  return (
    <div className="space-y-5" lang="en" dir="ltr">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product categories</h1>
          <p className="text-sm text-slate-500">
            Organize products by parent, subcategory, and leaf category. Uncategorized products
            remain valid.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/products" className="self-center text-emerald-700">
            Products
          </Link>
          {admin && (
            <Button
              onClick={() => {
                setError('');
                setEditing(null);
              }}
            >
              Add category
            </Button>
          )}
        </div>
      </header>
      {query.isLoading && <p>Loading categories…</p>}
      {query.isError && (
        <p role="alert">
          Unable to load categories.{' '}
          <button className="underline" onClick={() => query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {query.data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Category path</th>
                <th className="p-3">Products (direct)</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <Link
                      className="text-emerald-700 hover:underline"
                      to={`/products?categoryId=${encodeURIComponent(row.id)}`}
                    >
                      {row.path}
                    </Link>
                  </td>
                  <td className="p-3">{row.productCount}</td>
                  <td className="p-3">
                    {row.isActive ? (row.assignable ? 'Active' : 'Inactive parent') : 'Inactive'}
                  </td>
                  <td className="flex gap-2 p-3">
                    {admin && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setError('');
                            setEditing(row);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={row.productCount > 0 || row.childCount > 0}
                          title={
                            row.productCount || row.childCount
                              ? 'In-use categories cannot be deleted. Deactivate instead.'
                              : 'Delete empty category'
                          }
                          onClick={() => {
                            setError('');
                            setDeleting(row);
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    No categories yet. Create your own groupings; existing products stay
                    uncategorized.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing !== undefined && (
        <CategoryEditor
          key={editing?.id ?? 'new'}
          category={editing}
          rows={rows}
          pending={mutation.isPending}
          error={error}
          onClose={() => {
            if (!mutation.isPending) setEditing(undefined);
          }}
          onSave={save}
        />
      )}
      <Modal
        isOpen={Boolean(deleting)}
        title="Delete category"
        onClose={() => {
          if (!mutation.isPending) setDeleting(null);
        }}
      >
        <p>Delete {deleting?.path}? Only an empty category without children can be deleted.</p>
        {error && (
          <p role="alert" className="mt-3 text-red-600">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={mutation.isPending} onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={remove}>
            Delete category
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CategoryEditor({
  category,
  rows,
  pending,
  error,
  onClose,
  onSave,
}: {
  category: Category | null;
  rows: Category[];
  pending: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: CategoryInput) => Promise<void>;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [active, setActive] = useState(category?.isActive ?? true);
  const excluded = new Set(category ? [category.id] : []);
  for (let pass = 0; pass < rows.length; pass++)
    for (const row of rows) if (row.parentId && excluded.has(row.parentId)) excluded.add(row.id);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending) void onSave({ name: name.trim(), parentId: parentId || null, isActive: active });
  };
  return (
    <Modal isOpen title={category ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
        <FormField label="Category name" required>
          {(field) => (
            <Input
              {...field}
              required
              maxLength={120}
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          label="Parent category"
          hint="Leave empty for a top-level category. Maximum three levels."
        >
          {(field) => (
            <Select
              {...field}
              value={parentId}
              disabled={pending}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">No parent (top level)</option>
              {rows
                .filter((row) => !excluded.has(row.id) && row.level < 3)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.path}
                  </option>
                ))}
            </Select>
          )}
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            disabled={pending}
            onChange={(event) => setActive(event.target.checked)}
          />
          Active
        </label>
        <p className="text-xs text-slate-500">
          Inactive categories retain existing products but cannot receive new assignments.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            Save category
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function message(error: unknown): string {
  const response = (
    error as { response?: { data?: { error?: { message?: string }; message?: string } } }
  )?.response?.data;
  return response?.error?.message ?? response?.message ?? 'Unable to save category. Please retry.';
}
