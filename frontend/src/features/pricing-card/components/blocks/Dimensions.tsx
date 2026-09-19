import type { PricingCardData } from '../../types/pricing-card.types';

export function Dimensions({ dimensions }: { dimensions?: PricingCardData['dimensionsMm'] }) {
  if (!dimensions || Object.values(dimensions).every((value) => value == null)) return null;
  const axes = [
    ['W', dimensions.widthMm],
    ['H', dimensions.heightMm],
    ['D', dimensions.depthMm],
  ].filter((entry): entry is [string, number] => entry[1] != null);
  return <p className="pricing-card-dimensions" aria-label="Dimensions">{axes.map(([axis, value]) => `${axis} ${value} mm`).join(' × ')}</p>;
}
