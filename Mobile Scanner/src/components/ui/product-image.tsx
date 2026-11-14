import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react-native';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { fetchAuthedImage } from '../../api/hc-image';
import { useLookup } from '../../lookup/useLookup';
import { cn } from '../../lib/utils';

export interface ProductImageSource {
  id: string;
  name?: string;
  imageUrl?: string | null;
  image?: { updatedAt: string } | null;
}

/**
 * The product's photo from the PC: an uploaded photo (fetched with the login
 * token, cached per product and version) or an external link. Without a
 * photo, or when it fails, a quiet box icon keeps rows aligned.
 */
export function ProductImage({ product, size = 48, className }: { product: ProductImageSource; size?: number; className?: string }) {
  const { client, key } = useLookup();
  const [failed, setFailed] = useState(false);
  const uploaded = Boolean(product.image);
  const photo = useQuery({
    queryKey: key('product-image', { id: product.id, v: product.image?.updatedAt ?? '' }),
    queryFn: () => fetchAuthedImage(client, `/products/${encodeURIComponent(product.id)}/image`),
    enabled: uploaded,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  const uri = uploaded ? photo.data : (product.imageUrl ?? undefined);
  const frame = cn('items-center justify-center overflow-hidden rounded-lg border border-border bg-slate-50', className);
  if (!uri || failed)
    return (
      <View style={{ width: size, height: size }} className={frame} accessibilityLabel={product.name ? `${product.name}, no photo` : undefined}>
        <Package size={Math.round(size * 0.45)} color="#8FA3AD" />
      </View>
    );
  return (
    <View style={{ width: size, height: size }} className={cn(frame, 'bg-white')}>
      <Image
        source={{ uri }}
        resizeMode="contain"
        onError={() => setFailed(true)}
        accessibilityLabel={product.name ? `Photo of ${product.name}` : 'Product photo'}
        style={{ width: size, height: size }}
      />
    </View>
  );
}
