import React, { useEffect, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_ACCEPT, productImageError } from '../utils/product-image';
import { Product } from '../types/product.types';
import { ProductImageView } from './ProductImageView';

interface ProductImageFieldProps {
  product?: Product | null;
  /** Image URL currently typed into the form. */
  url: string;
  onUrlChange: (value: string) => void;
  /** File chosen but not yet uploaded — uploads run after the product is saved. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  savedImageRemoved: boolean;
  onSavedImageRemovedChange: (removed: boolean) => void;
  error?: string;
}

export const ProductImageField: React.FC<ProductImageFieldProps> = ({
  product, url, onUrlChange, file, onFileChange, savedImageRemoved, onSavedImageRemovedChange, error,
}) => {
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');

  useEffect(() => {
    if (!file) { setFilePreview(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const pickFile = (selected: File | null) => {
    if (!selected) { onFileChange(null); setFileError(''); return; }
    const message = productImageError(selected);
    if (message) { setFileError(message); onFileChange(null); return; }
    setFileError('');
    onFileChange(selected);
    onUrlChange('');
    onSavedImageRemovedChange(false);
  };

  const hasSavedImage = Boolean(product?.image) && !savedImageRemoved;
  const showRemove = hasSavedImage || Boolean(file) || Boolean(url.trim());

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Product Image / صورة المنتج</h3>
      <p className="mt-1 text-xs text-slate-500">
        Paste a link or upload a file from this computer / الصق رابطاً أو ارفع ملفاً من الجهاز
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200">
          {filePreview
            ? <img src={filePreview} alt="Selected product image preview" className="h-full w-full object-cover" />
            : url.trim()
              ? <ProductImageView productId={product?.id ?? ''} image={{ source: 'URL', url: url.trim() }} alt="" className="h-full w-full" />
              : <ProductImageView productId={product?.id ?? ''} image={savedImageRemoved ? null : product?.image ?? null} alt="" className="h-full w-full" />}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Choose File / اختيار ملف
              <input
                type="file"
                accept={PRODUCT_IMAGE_ACCEPT}
                className="sr-only"
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {showRemove && (
              <button
                type="button"
                onClick={() => { onFileChange(null); onUrlChange(''); setFileError(''); if (product?.image) onSavedImageRemovedChange(true); }}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove / إزالة
              </button>
            )}
          </div>

          {file && (
            <p className="truncate text-xs text-slate-500">
              {file.name} — uploads when you save / يتم الرفع عند الحفظ
            </p>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Image URL / رابط الصورة
            <input
              value={url}
              onChange={(event) => { onUrlChange(event.target.value); if (event.target.value.trim()) { onFileChange(null); onSavedImageRemovedChange(false); } }}
              placeholder="https://…"
              dir="ltr"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <p className="text-[11px] text-slate-400">
            PNG, JPEG, WebP or GIF · max {Math.round(MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024))} MB
          </p>
          {(fileError || error) && <p className="text-xs text-red-600">{fileError || error}</p>}
        </div>
      </div>
    </section>
  );
};
