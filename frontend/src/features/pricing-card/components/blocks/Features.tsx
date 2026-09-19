import type { PricingCardFeature } from '../../types/pricing-card.types';

interface FeaturesProps {
  features?: PricingCardFeature[];
  showLabels: boolean;
  showValues: boolean;
}

export function Features({ features, showLabels, showValues }: FeaturesProps) {
  const visible = features?.filter((feature) => feature.label.trim() || feature.iconSvg) ?? [];
  if (!visible.length) return null;
  return (
    <div className="pricing-card-features" aria-label="Features">
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
