import { FormField, Select } from '../../components/ui';
import { useCategories, type Category } from './categories';

interface Props {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  filter?: boolean;
  loading?: boolean;
}
export function CategorySelect({
  categories,
  value,
  onChange,
  disabled,
  filter = false,
  loading = false,
}: Props) {
  return (
    <FormField label={filter ? 'Filter by category' : 'Category'}>
      {(field) => (
        <Select
          {...field}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={filter ? 'Filter by category' : 'Category'}
        >
          <option value="">
            {loading ? 'Loading categories…' : filter ? 'All categories' : 'Uncategorized'}
          </option>
          {filter && <option value="uncategorized">Uncategorized</option>}
          {value && value !== 'uncategorized' && !categories.some((row) => row.id === value) && (
            <option value={value}>Current category (unavailable)</option>
          )}
          {[...categories]
            .sort((a, b) => a.path.localeCompare(b.path, 'en') || a.id.localeCompare(b.id))
            .map((row) => (
              <option
                key={row.id}
                value={row.id}
                disabled={!filter && !row.assignable && row.id !== value}
              >
                {row.path}
                {row.assignable ? '' : ' (inactive)'}
              </option>
            ))}
        </Select>
      )}
    </FormField>
  );
}
export function CategoryPicker(props: Omit<Props, 'categories' | 'filter' | 'loading'>) {
  const query = useCategories();
  return (
    <div>
      <CategorySelect {...props} categories={query.data ?? []} loading={query.isLoading} />
      {query.isError && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          Unable to load categories. Current assignment is preserved.{' '}
          <button type="button" className="underline" onClick={() => query.refetch()}>
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
