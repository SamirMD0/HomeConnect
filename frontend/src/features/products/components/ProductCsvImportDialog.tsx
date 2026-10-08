import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, FileUp, GitMerge, ShieldAlert } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useCategories } from '../../categories/categories';
import type { Category } from '../../categories/categories';
import {
  useCommitProductImport,
  useCreateProductImport,
  useUpdateProductImport,
  useProductBrands,
} from '../hooks/useProducts';
import type {
  ProductImportDecision,
  ProductImportPreview,
  ProductImportPreviewRow,
} from '../types/product.types';
import { productCategoryGroup } from '../../../../../shared/product-category-detection';

interface ProductCsvImportDialogProps {
  open: boolean;
  onClose: () => void;
}

const control =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
export const ALL_BRANDS_VALUE = '__ALL_BRANDS__';
export const importCategoryGroups = (preview: ProductImportPreview) =>
  preview.rows?.length
    ? [
        ...new Map(
          preview.rows.map((row) => {
            const group = productCategoryGroup(row);
            return [group.key, group] as const;
          })
        ).values(),
      ]
    : (preview.categoryGroups ?? []);

export function importFamilySections(preview: ProductImportPreview) {
  const families = new Map<
    string,
    Map<string, ReturnType<typeof productCategoryGroup> & { rowCount: number }>
  >();
  for (const row of preview.rows) {
    const group = productCategoryGroup(row);
    const family = group.family ?? 'Needs classification';
    const groups = families.get(family) ?? new Map();
    groups.set(group.key, { ...group, rowCount: (groups.get(group.key)?.rowCount ?? 0) + 1 });
    families.set(family, groups);
  }
  return [...families].map(([family, groups]) => ({ family, groups: [...groups.values()] }));
}

export function suggestedCategoryMappings(preview: ProductImportPreview, categories: Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const normalize = (name?: string | null) => name?.trim().toLocaleUpperCase('en-US');
  return Object.fromEntries(
    importCategoryGroups(preview).flatMap((group) => {
      if (!group.suggestedCategory) return [];
      const family = productCategoryGroup({
        family: '',
        productType: group.suggestedCategory,
      }).family;
      const match = categories.find(
        (category) =>
          category.assignable &&
          normalize(category.name) === normalize(group.suggestedCategory) &&
          category.parentId &&
          normalize(byId.get(category.parentId)?.name) === normalize(family ?? undefined)
      );
      return match ? [[group.key, match.id]] : [];
    })
  );
}

export const ProductCsvImportDialog: React.FC<ProductCsvImportDialogProps> = ({
  open,
  onClose,
}) => {
  const categories = useCategories();
  const brands = useProductBrands();
  const createImport = useCreateProductImport();
  const updateImport = useUpdateProductImport();
  const commitImport = useCommitProductImport();
  const [file, setFile] = useState<File | null>(null);
  const [brand, setBrand] = useState(ALL_BRANDS_VALUE);
  const [sourceSystem, setSourceSystem] = useState('legacy-inventory');
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [classificationFamilies, setClassificationFamilies] = useState<Record<number, string>>({});
  const [classificationDirty, setClassificationDirty] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, ProductImportDecision>>({});
  const [accountPassword, setAccountPassword] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setBrand(ALL_BRANDS_VALUE);
    setSourceSystem('legacy-inventory');
    setPreview(null);
    setMappings({});
    setDecisions({});
    setAccountPassword('');
    setError('');
    setClassificationFamilies({});
    setClassificationDirty(false);
  };
  const close = () => {
    if (!createImport.isPending && !updateImport.isPending && !commitImport.isPending) {
      reset();
      onClose();
    }
  };

  const upload = async () => {
    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }
    setError('');
    try {
      const data = await createImport.mutateAsync({
        fileName: file.name,
        csvText: await file.text(),
        sourceSystem,
        brand,
      });
      const available = (await categories.refetch()).data ?? categories.data ?? [];
      const suggested = suggestedCategoryMappings(data, available);
      const analyzed = await updateImport.mutateAsync({ id: data.id, categoryMappings: suggested });
      setPreview(analyzed);
      setMappings(suggested);
      setClassificationDirty(false);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const analyze = async () => {
    if (!preview) return;
    const missing = preview.rows.filter((row) => {
      const group = productCategoryGroup(row);
      const key = group.suggestedCategory ? group.key : `row:${row.rowNumber}`;
      return !Object.prototype.hasOwnProperty.call(mappings, key);
    });
    if (missing.length) {
      setError(
        `Choose a family and category, or "Uncategorized", for: ${missing
          .slice(0, 5)
          .map((row) => row.externalCode)
          .join(', ')}`
      );
      return;
    }
    setError('');
    try {
      const data = await updateImport.mutateAsync({ id: preview.id, categoryMappings: mappings });
      setPreview(data);
      setDecisions({});
      setClassificationDirty(false);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const conflictRows = preview?.rows.filter((row) => row.status === 'CONFLICT') ?? [];
  const invalidRows = preview?.rows.filter((row) => row.status === 'INVALID') ?? [];
  const hasPendingCategoryMappings =
    classificationDirty ||
    conflictRows.some((row) => row.conflicts.some((conflict) => conflict.kind === 'CATEGORY'));
  const allConflictsResolved =
    !hasPendingCategoryMappings &&
    conflictRows.every((row) => validProductImportDecision(row, decisions[row.rowNumber]));
  const needsPassword = Object.values(decisions).some(
    (decision) => decision.inventoryAction === 'RECONCILE'
  );
  const canCommit = Boolean(
    preview &&
    invalidRows.length === 0 &&
    allConflictsResolved &&
    (!needsPassword || accountPassword.trim())
  );

  const commit = async () => {
    if (!preview || !canCommit) return;
    setError('');
    try {
      const result = await commitImport.mutateAsync({
        id: preview.id,
        decisions: Object.values(decisions),
        accountPassword: accountPassword || undefined,
      });
      toast.success(
        `Import complete: ${result.summary.created} created, ${result.summary.merged} merged`
      );
      close();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const chooseRowFamily = (rowNumber: number, familyId: string) => {
    setClassificationDirty(true);
    setClassificationFamilies((current) => ({ ...current, [rowNumber]: familyId }));
    setMappings((current) => {
      const next = { ...current };
      if (familyId === '__none__') next[`row:${rowNumber}`] = null;
      else delete next[`row:${rowNumber}`];
      return next;
    });
  };

  const chooseRowCategory = (rowNumber: number, categoryId: string) => {
    setClassificationDirty(true);
    setMappings((current) => {
      const next = { ...current };
      if (categoryId) next[`row:${rowNumber}`] = categoryId;
      else delete next[`row:${rowNumber}`];
      return next;
    });
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title="Import products from CSV"
      description="Preview every row and resolve conflicts before anything is written. Existing products are never skipped automatically."
      maxWidth="max-w-7xl"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {preview && (
            <Button onClick={commit} isLoading={commitImport.isPending} disabled={!canCommit}>
              Import products
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {!preview ? (
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">
                CSV file
                <input
                  className={`${control} mt-1`}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Brand
                <select
                  className={`${control} mt-1`}
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                >
                  <option value={ALL_BRANDS_VALUE}>All brands</option>
                  {[...(brands.data ?? [])]
                    .sort((left, right) => left.canonical.localeCompare(right.canonical))
                    .map((item) => (
                      <option key={item.canonical} value={item.canonical}>
                        {item.canonical}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Source system
                <input
                  className={`${control} mt-1`}
                  value={sourceSystem}
                  onChange={(event) => setSourceSystem(event.target.value)}
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              {brand === ALL_BRANDS_VALUE
                ? 'Detect each brand from the product description. Unidentified products keep no brand.'
                : `Assign ${brand} to every product in this file.`}
            </p>
            {brands.isError && (
              <p role="alert" className="text-sm text-red-700">
                Unable to load brands.{' '}
                <button type="button" className="underline" onClick={() => brands.refetch()}>
                  Retry
                </button>
              </p>
            )}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              CSV Code becomes an external code and model. Home Connect keeps its generated UUID,
              SKU, and barcode.
            </div>
            <Button
              icon={<FileUp />}
              onClick={upload}
              isLoading={createImport.isPending || updateImport.isPending}
              disabled={!file || !brand.trim() || !sourceSystem.trim()}
            >
              Read CSV
            </Button>
          </section>
        ) : (
          <>
            <ImportSummary preview={preview} />
            {preview.previousCommittedImport && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A file with the same contents
                was committed before. This draft is still reviewed normally; nothing is silently
                skipped.
              </p>
            )}

            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3">
                <h3 className="font-bold text-slate-800">Families and categories</h3>
                <p className="text-xs text-slate-500">
                  Detected categories are assigned automatically under their logical family.
                  Classify only the unidentified products below.
                </p>
              </div>
              <div className="space-y-5">
                {importFamilySections(preview)
                  .filter(({ family }) => family !== 'Needs classification')
                  .map(({ family, groups }) => (
                    <fieldset key={family} className="rounded-lg border border-slate-200 p-3">
                      <legend className="px-1 text-sm font-semibold text-slate-800">
                        {family}
                      </legend>
                      <div className="grid gap-3 md:grid-cols-2">
                        {groups.map((group) => (
                          <div
                            key={group.key}
                            className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"
                          >
                            <p className="font-medium">
                              {group.label}{' '}
                              <span className="text-xs font-normal text-slate-500">
                                ({group.rowCount} products)
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {mappings[group.key]
                                ? `${family} → ${group.label}`
                                : 'Category unavailable. Refresh the import after adding this category.'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  ))}
              </div>
              {preview.rows.some((row) => !productCategoryGroup(row).suggestedCategory) && (
                <div className="mt-5 space-y-3">
                  <h4 className="font-semibold text-slate-800">Products needing classification</h4>
                  {preview.rows
                    .filter((row) => !productCategoryGroup(row).suggestedCategory)
                    .map((row) => (
                      <div
                        key={row.rowNumber}
                        className="rounded-lg border border-amber-200 bg-amber-50/40 p-3"
                      >
                        <p className="mb-2 text-sm font-medium">
                          {row.externalCode} — {row.description}
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-sm">
                            Family
                            <select
                              className={`${control} mt-1`}
                              value={classificationFamilies[row.rowNumber] ?? ''}
                              onChange={(event) =>
                                chooseRowFamily(row.rowNumber, event.target.value)
                              }
                            >
                              <option value="">Choose family…</option>
                              <option value="__none__">Uncategorized</option>
                              {(categories.data ?? [])
                                .filter(
                                  (category) =>
                                    category.isActive &&
                                    category.parentId === null &&
                                    category.childCount > 0
                                )
                                .map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {classificationFamilies[row.rowNumber] &&
                            classificationFamilies[row.rowNumber] !== '__none__' && (
                              <label className="text-sm">
                                Category
                                <select
                                  className={`${control} mt-1`}
                                  value={mappings[`row:${row.rowNumber}`] ?? ''}
                                  onChange={(event) =>
                                    chooseRowCategory(row.rowNumber, event.target.value)
                                  }
                                >
                                  <option value="">Choose category…</option>
                                  {(categories.data ?? [])
                                    .filter(
                                      (category) =>
                                        category.assignable &&
                                        category.parentId === classificationFamilies[row.rowNumber]
                                    )
                                    .map((category) => (
                                      <option key={category.id} value={category.id}>
                                        {category.name}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {hasPendingCategoryMappings && (
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={analyze}
                  isLoading={updateImport.isPending}
                >
                  Save classifications and continue
                </Button>
              )}
            </section>

            {hasPendingCategoryMappings && (
              <p className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Choose a family and category for each unidentified product, or explicitly leave it
                uncategorized, then save the classifications.
              </p>
            )}

            {invalidRows.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 font-bold text-red-800">
                  <ShieldAlert className="h-4 w-4" />
                  Invalid rows
                </h3>
                {invalidRows.map((row) => (
                  <RowShell key={row.rowNumber} row={row}>
                    <ul className="list-disc pl-5 text-sm text-red-700">
                      {row.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </RowShell>
                ))}
              </section>
            )}

            {!hasPendingCategoryMappings && conflictRows.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-amber-900">
                    <GitMerge className="h-4 w-4" />
                    Conflict review
                  </h3>
                  <p className="text-xs text-slate-500">Each row requires an explicit choice.</p>
                </div>
                {conflictRows.map((row) => (
                  <ConflictRow
                    key={row.rowNumber}
                    row={row}
                    allRows={preview.rows}
                    decision={decisions[row.rowNumber]}
                    onChange={(decision) =>
                      setDecisions((current) => ({ ...current, [row.rowNumber]: decision }))
                    }
                  />
                ))}
              </section>
            )}

            {preview.counts.ready > 0 && (
              <details className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <summary className="cursor-pointer font-semibold text-emerald-800">
                  {preview.counts.ready} products ready to create
                </summary>
                <div className="mt-3 space-y-2">
                  {preview.rows
                    .filter((row) => row.status === 'READY')
                    .map((row) => (
                      <RowShell key={row.rowNumber} row={row} />
                    ))}
                </div>
              </details>
            )}

            {needsPassword && (
              <label className="block max-w-md text-sm font-medium text-slate-700">
                Account password for stock reconciliation
                <input
                  className={`${control} mt-1`}
                  type="password"
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                />
              </label>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

const ImportSummary: React.FC<{ preview: ProductImportPreview }> = ({ preview }) => (
  <div className="grid gap-3 sm:grid-cols-5">
    {[
      ['Rows', preview.counts.total, 'text-slate-800'],
      ['Units', preview.counts.quantity, 'text-slate-800'],
      ['Ready', preview.counts.ready, 'text-emerald-700'],
      ['Conflicts', preview.counts.conflicts, 'text-amber-700'],
      ['Invalid', preview.counts.invalid, 'text-red-700'],
    ].map(([label, value, color]) => (
      <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </div>
    ))}
  </div>
);

const RowShell: React.FC<{ row: ProductImportPreviewRow; children?: React.ReactNode }> = ({
  row,
  children,
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-semibold text-slate-900">
          {row.externalCode} — {row.description}
        </p>
        <p className="text-xs text-slate-500">
          Row {row.rowNumber} · {row.family} · Brand {row.brand ?? 'not identified'} · Qty{' '}
          {row.quantity} · Cost {row.costUsd ?? 'not supplied'}
        </p>
      </div>
      {row.status === 'READY' && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Ready
        </span>
      )}
    </div>
    {children && <div className="mt-3">{children}</div>}
  </div>
);

const ConflictRow: React.FC<{
  row: ProductImportPreviewRow;
  allRows: ProductImportPreviewRow[];
  decision?: ProductImportDecision;
  onChange: (decision: ProductImportDecision) => void;
}> = ({ row, allRows, decision, onChange }) => {
  const action = decision?.action ?? '';
  const set = (patch: Partial<ProductImportDecision>) =>
    onChange({
      rowNumber: row.rowNumber,
      action: (action || 'CREATE') as ProductImportDecision['action'],
      ...decision,
      ...patch,
    });
  const target = row.matches.find((match) => match.id === decision?.targetProductId);
  return (
    <RowShell row={row}>
      <ul className="mb-3 list-disc pl-5 text-xs text-amber-800">
        {row.conflicts.map((conflict) => (
          <li key={`${conflict.kind}-${conflict.productId ?? ''}`}>{conflict.message}</li>
        ))}
      </ul>
      {row.matches.length > 0 && (
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          {row.matches.map((match) => (
            <div
              key={match.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
            >
              <p className="font-semibold">
                {match.sku} — {match.name}
              </p>
              <p>
                {match.brand ?? 'No brand'} · {match.model}
              </p>
              <p>
                Stock {match.stockQuantity} ·{' '}
                {match.hasOpeningBalance ? 'Onboarded' : 'No opening balance'}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-medium text-slate-700">
          Decision
          <select
            className={`${control} mt-1`}
            value={action}
            onChange={(event) =>
              set({
                action: event.target.value as ProductImportDecision['action'],
                targetProductId: undefined,
                inventoryAction: 'KEEP',
              })
            }
          >
            <option value="">Choose…</option>
            <option value="CREATE">Create separately</option>
            {canMergeProductImportRow(row) && <option value="MERGE">Merge into existing</option>}
            {row.conflicts.some((conflict) => conflict.kind === 'FILE_CODE') && (
              <option value="COMBINE">Combine with another CSV row</option>
            )}
            <option value="EXCLUDE">Exclude manually</option>
          </select>
        </label>
        {action === 'CREATE' && (
          <>
            <label className="text-xs font-medium text-slate-700">
              Imported code
              <input
                className={`${control} mt-1`}
                value={decision?.externalCode ?? row.externalCode}
                onChange={(event) => set({ externalCode: event.target.value })}
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Imported name
              <input
                className={`${control} mt-1`}
                value={decision?.name ?? row.description}
                onChange={(event) => set({ name: event.target.value })}
              />
            </label>
          </>
        )}
        {action === 'MERGE' && (
          <>
            <label className="text-xs font-medium text-slate-700">
              Existing product
              <select
                className={`${control} mt-1`}
                value={decision?.targetProductId ?? ''}
                onChange={(event) => set({ targetProductId: event.target.value || undefined })}
              >
                <option value="">Choose…</option>
                {row.matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.sku} — {match.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Inventory
              <select
                className={`${control} mt-1`}
                value={decision?.inventoryAction ?? 'KEEP'}
                onChange={(event) =>
                  set({
                    inventoryAction: event.target.value as ProductImportDecision['inventoryAction'],
                  })
                }
              >
                <option value="KEEP">Keep current stock</option>
                {target && !target.hasOpeningBalance && (
                  <option value="OPENING">Use CSV as opening count</option>
                )}
                {target?.hasOpeningBalance && (
                  <option value="RECONCILE">Reconcile to CSV quantity</option>
                )}
              </select>
            </label>
            <div className="md:col-span-3">
              <p className="mb-1 text-xs font-medium text-slate-700">Fields to take from CSV</p>
              <div className="flex flex-wrap gap-3">
                {(['name', 'model', 'brand', 'category'] as const).map((field) => (
                  <label key={field} className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={decision?.mergeFields?.includes(field) ?? false}
                      onChange={(event) =>
                        set({
                          mergeFields: event.target.checked
                            ? [...(decision?.mergeFields ?? []), field]
                            : (decision?.mergeFields ?? []).filter((item) => item !== field),
                        })
                      }
                    />
                    {field}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {action === 'COMBINE' && (
          <label className="text-xs font-medium text-slate-700">
            Combine into CSV row
            <select
              className={`${control} mt-1`}
              value={decision?.targetRowNumber ?? ''}
              onChange={(event) =>
                set({
                  targetRowNumber: event.target.value ? Number(event.target.value) : undefined,
                })
              }
            >
              <option value="">Choose…</option>
              {allRows
                .filter(
                  (candidate) =>
                    candidate.rowNumber !== row.rowNumber &&
                    candidate.externalCode.trim().toLowerCase() ===
                      row.externalCode.trim().toLowerCase()
                )
                .map((candidate) => (
                  <option key={candidate.rowNumber} value={candidate.rowNumber}>
                    Row {candidate.rowNumber} — {candidate.description}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
    </RowShell>
  );
};

export function validProductImportDecision(
  row: ProductImportPreviewRow,
  decision?: ProductImportDecision
) {
  if (!decision) return false;
  if (decision.action === 'EXCLUDE') return true;
  if (decision.action === 'MERGE') return Boolean(decision.targetProductId);
  if (decision.action === 'COMBINE')
    return Boolean(decision.targetRowNumber && decision.targetRowNumber !== row.rowNumber);
  const codeChanged = Boolean(
    decision.externalCode?.trim() &&
    decision.externalCode.trim().toLowerCase() !== row.externalCode.trim().toLowerCase()
  );
  if (row.conflicts.some((conflict) => ['EXTERNAL_CODE', 'MODEL'].includes(conflict.kind)))
    return codeChanged;
  if (row.conflicts.some((conflict) => conflict.kind === 'NAME_MODEL')) {
    const nameChanged = Boolean(
      decision.name?.trim() &&
      decision.name.trim().toLowerCase() !== row.description.trim().toLowerCase()
    );
    return codeChanged || nameChanged;
  }
  return true;
}

export const canMergeProductImportRow = (row: ProductImportPreviewRow) => row.matches.length > 0;

function messageOf(error: unknown) {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;
  return (
    response?.data?.error?.message ??
    (error instanceof Error ? error.message : 'The import could not be completed')
  );
}
