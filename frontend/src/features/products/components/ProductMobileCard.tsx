import React from 'react';
import { ProductCard, ProductCardProps } from './ProductCard';

type ProductMobileCardProps = Omit<ProductCardProps, 'variant'>;

export const ProductMobileCard: React.FC<ProductMobileCardProps> = (props) => (
  <ProductCard {...props} variant="list" />
);
