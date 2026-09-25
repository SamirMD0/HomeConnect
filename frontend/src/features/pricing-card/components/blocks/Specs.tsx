import type { PricingCardResolvedSpec } from '../../types/pricing-card.types';

export function Specs({ specs, maxRows }: { specs?: PricingCardResolvedSpec[]; maxRows: number }) {
  const visible = specs?.filter(({ value }) => value.trim()).slice(0, maxRows) ?? [];
  if (!visible.length) return null;
  return (
    <dl className="pricing-card-specs">
      {visible.map((spec) => (
        <div key={spec.canonicalKey} className="pricing-card-spec-row">
          <dt>{spec.label}</dt>
          <dd>{spec.value}{spec.unit ? ` ${spec.unit}` : ''}</dd>
        </div>
      ))}
    </dl>
  );
}
