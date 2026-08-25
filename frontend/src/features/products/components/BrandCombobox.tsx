import React, { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProductBrands } from '../hooks/useProducts';
import type { ProductBrandSummary } from '../types/product.types';

interface BrandComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Opens the list during static component tests; normal forms leave it false. */
  defaultOpen?: boolean;
}

export interface BrandKeyAction {
  open: boolean;
  activeIndex: number;
  selectIndex?: number;
}

export const BrandNearMatchHint: React.FC<{
  match: ProductBrandSummary;
  onAdopt: (canonical: string) => void;
}> = ({ match, onAdopt }) => <p className="mt-1 text-xs text-amber-700">
  Did you mean <button type="button" onClick={() => onAdopt(match.canonical)} className="font-semibold underline" dir="auto">{match.canonical}</button>?
  {' / '}هل تقصد <button type="button" onClick={() => onAdopt(match.canonical)} className="font-semibold underline" dir="auto">{match.canonical}</button>؟
</p>;

const normalizeBrand = (value: string) => value.trim().replace(/\s+/gu, ' ').toLowerCase();
const EMPTY_BRANDS: ProductBrandSummary[] = [];

export function filterBrandOptions(brands: readonly ProductBrandSummary[], value: string) {
  const query = normalizeBrand(value);
  if (!query) return [...brands];
  return brands.filter((brand) =>
    brand.canonical.toLowerCase().includes(query)
    || brand.spellings.some((spelling) => spelling.toLowerCase().includes(query))
  );
}

export function findBrandNearMatch(brands: readonly ProductBrandSummary[], value: string) {
  const normalized = normalizeBrand(value);
  if (!normalized) return undefined;
  return brands.find((brand) =>
    normalizeBrand(brand.canonical) === normalized && brand.canonical !== value.trim().replace(/\s+/gu, ' ')
  );
}

export function brandKeyAction(
  key: string,
  activeIndex: number,
  optionCount: number,
  open: boolean
): BrandKeyAction | undefined {
  if (key === 'Escape') return { open: false, activeIndex: -1 };
  if (key === 'ArrowDown') {
    return { open: true, activeIndex: optionCount ? (open ? (activeIndex + 1) % optionCount : 0) : -1 };
  }
  if (key === 'ArrowUp') {
    return { open: true, activeIndex: optionCount ? (open ? (activeIndex <= 0 ? optionCount - 1 : activeIndex - 1) : optionCount - 1) : -1 };
  }
  if (key === 'Enter' && open && activeIndex >= 0 && activeIndex < optionCount) {
    return { open: false, activeIndex, selectIndex: activeIndex };
  }
  return undefined;
}

export const BrandCombobox: React.FC<BrandComboboxProps> = ({
  label, value, onChange, error, disabled, defaultOpen = false,
}) => {
  const brandsQuery = useProductBrands();
  const brands = brandsQuery.data ?? EMPTY_BRANDS;
  const [open, setOpen] = useState(defaultOpen);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = `${inputId}-list`;
  const options = useMemo(() => filterBrandOptions(brands, value), [brands, value]);
  const nearMatch = findBrandNearMatch(brands, value);
  const selectedSummary = brands.find((brand) => normalizeBrand(brand.canonical) === normalizeBrand(value));

  const choose = (brand: ProductBrandSummary) => {
    onChange(brand.canonical);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const action = brandKeyAction(event.key, activeIndex, options.length, open);
    if (!action) return;
    event.preventDefault();
    if (action.selectIndex !== undefined) choose(options[action.selectIndex]);
    else {
      setOpen(action.open);
      setActiveIndex(action.activeIndex);
    }
  };

  return <div ref={rootRef} className="relative">
    <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">{label}</label>
    <input
      id={inputId}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      autoComplete="off"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        setOpen(true);
        setActiveIndex(0);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={onKeyDown}
      disabled={disabled}
      dir="auto"
      className="user-text-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
    />
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    {nearMatch && !disabled && <BrandNearMatchHint match={nearMatch} onAdopt={() => choose(nearMatch)} />}
    {selectedSummary && selectedSummary.spellings.length > 1 && !disabled && (
      <Link to="/products/brands" className="mt-1 inline-block text-xs text-slate-500 underline-offset-2 hover:text-brand-700 hover:underline">
        This brand has {selectedSummary.spellings.length} spellings — Fix in Brands / لهذه الماركة {selectedSummary.spellings.length} تهجئات — إصلاحها في الماركات
      </Link>
    )}
    {open && options.length > 0 && !disabled && <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
      {options.map((brand, index) => <li key={brand.canonical}>
        <button
          id={`${listId}-${index}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(brand)}
          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'}`}
        >
          <span dir="auto">{brand.canonical}</span>
          <span className="shrink-0 text-xs text-slate-500">{brand.productCount} {brand.productCount === 1 ? 'product' : 'products'}</span>
        </button>
      </li>)}
    </ul>}
  </div>;
};
