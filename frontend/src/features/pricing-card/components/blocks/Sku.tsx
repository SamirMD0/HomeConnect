import { formatStaffLabelCode } from '../../../../../../backend/src/features/pricing/domain/internal-price-code';

interface SkuProps {
  sku: string;
  staffLabelCode?: string | null;
  internalPriceCode?: string | null;
  showSecretCode: boolean;
  prefix: string;
}

export function Sku({ sku, staffLabelCode, internalPriceCode, showSecretCode, prefix }: SkuProps) {
  if (!sku.trim()) return null;
  const encodedCode = internalPriceCode ?? stripSkuPrefix(sku, staffLabelCode);
  const displayed = showSecretCode && encodedCode ? formatStaffLabelCode(sku, encodedCode) : sku;
  return <p className="pricing-card-sku">{prefix && <span>{prefix} </span>}<strong>{displayed}</strong></p>;
}

function stripSkuPrefix(sku: string, value?: string | null) {
  if (!value) return null;
  const prefix = `${sku}-`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
