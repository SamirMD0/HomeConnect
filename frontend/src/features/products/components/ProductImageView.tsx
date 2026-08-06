import React, { useEffect, useState } from 'react';
import { ImageOff, Package } from 'lucide-react';
import { useProductImageUrl } from '../hooks/useProducts';
import { ProductImage } from '../types/product.types';

interface ProductImageViewProps {
  productId: string;
  image: ProductImage | null;
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
  /** Rendered when the product has no image at all. */
  placeholder?: React.ReactNode;
}

/**
 * Renders either source behind one API. Each branch is its own component so the
 * fetch hook is only mounted for uploaded images — products without one render
 * without touching the query client.
 */
export const ProductImageView: React.FC<ProductImageViewProps> = ({
  productId, image, alt, className = '', fit = 'cover', placeholder,
}) => {
  if (!image) return <>{placeholder ?? <ProductImagePlaceholder className={className} />}</>;
  if (image.source === 'URL') return <ExternalImage url={image.url} alt={alt} className={className} fit={fit} />;
  return <UploadedImage productId={productId} version={image.updatedAt} alt={alt} className={className} fit={fit} />;
};

const ExternalImage: React.FC<{ url: string; alt: string; className: string; fit: 'cover' | 'contain' }> = ({ url, alt, className, fit }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);

  if (failed) return <ProductImageBroken className={className} />;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
    />
  );
};

const UploadedImage: React.FC<{ productId: string; version: string; alt: string; className: string; fit: 'cover' | 'contain' }> = ({
  productId, version, alt, className, fit,
}) => {
  const { url, isError } = useProductImageUrl(productId, version);

  if (isError) return <ProductImageBroken className={className} />;
  if (!url) return <div className={`animate-pulse bg-slate-100 ${className}`} aria-hidden />;
  return <img src={url} alt={alt} className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`} />;
};

export const ProductImagePlaceholder: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`} aria-hidden>
    <Package className="h-1/2 w-1/2" />
  </div>
);

export const ProductImageBroken: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}
    title="Image could not be loaded / تعذر تحميل الصورة"
  >
    <ImageOff className="h-1/2 w-1/2" />
  </div>
);
