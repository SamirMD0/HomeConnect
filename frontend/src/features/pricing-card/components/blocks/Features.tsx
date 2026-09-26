import type { PricingCardFeature } from '../../types/pricing-card.types';

interface FeaturesProps {
  features?: PricingCardFeature[];
  layout: 'row' | 'grid-chip';
  showLabels: boolean;
  showValues: boolean;
}

export function Features({ features, layout, showLabels, showValues }: FeaturesProps) {
  const visible = features?.filter((feature) => feature.label.trim() || feature.iconSvg) ?? [];
  if (!visible.length) return null;
  return (
    <div className={`pricing-card-features pricing-card-features-${layout}`} aria-label="Features">
      {visible.map((feature) => (
        <div className="pricing-card-feature" key={`${feature.position}-${feature.iconCode}`}>
          {feature.iconSvg && (
            <span className="pricing-card-feature-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: feature.iconSvg }} />
          )}
          <span className="pricing-card-feature-copy">
            {showLabels && <strong>{feature.label}</strong>}
            {showValues && feature.value && <span>{feature.value}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
