import { useCallback, useState } from 'react';
import { formatMoney } from '../utils/financial-format';

export interface CreditLimitOverride {
  overrideCreditLimit?: boolean;
  creditLimitOverrideReason?: string | null;
  accountPassword?: string;
}
interface Warning {
  currency: 'USD'; currentOutstanding: string; creditLimit: string;
  projectedOutstanding: string; overage: string;
}
export function creditLimitWarningFromError(error: unknown): Warning | null {
  const record = error as { response?: { data?: { error?: { code?: string; details?: Warning } } } } | null;
  const serverError = record?.response?.data?.error;
  const details = serverError?.details;
  return serverError?.code === 'CREDIT_LIMIT_EXCEEDED' && details?.currency === 'USD'
    && [details.currentOutstanding, details.creditLimit, details.projectedOutstanding, details.overage].every((v) => typeof v === 'string') ? details : null;
}
export function useCreditLimitWarning() {
  const [warning, setWarning] = useState<Warning | null>(null);
  const [value, onChange] = useState<CreditLimitOverride>({});
  const reset = useCallback(() => { setWarning(null); onChange({}); }, []);
  return {
    warning, value, onChange,
    payload: value.overrideCreditLimit ? value : {},
    capture(error: unknown) { const next = creditLimitWarningFromError(error); if (next) setWarning(next); return next !== null; },
    reset,
  };
}
export function CreditLimitWarning({ warning, isAdmin, value, onChange }: {
  warning: Warning | null; isAdmin: boolean; value: CreditLimitOverride; onChange: (value: CreditLimitOverride) => void;
}) {
  if (!warning) return null;
  return <div role="alert" className="my-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-semibold">Credit limit exceeded / تم تجاوز حد الائتمان</p>
    <dl className="grid grid-cols-2 gap-2">
      <dt>Current outstanding / الرصيد المستحق</dt><dd>{formatMoney(warning.currentOutstanding)}</dd>
      <dt>Credit limit / حد الائتمان</dt><dd>{formatMoney(warning.creditLimit)}</dd>
      <dt>Projected outstanding / الرصيد المتوقع</dt><dd>{formatMoney(warning.projectedOutstanding)}</dd>
      <dt>Overage / مبلغ التجاوز</dt><dd>{formatMoney(warning.overage)}</dd>
    </dl>
    {isAdmin ? <>
      <label className="block"><input type="checkbox" checked={value.overrideCreditLimit ?? false} onChange={(e) => onChange({ ...value, overrideCreditLimit: e.target.checked })} /> Approve ADMIN override / الموافقة على تجاوز المسؤول</label>
      <label className="block">Override reason / سبب التجاوز<textarea dir="auto" value={value.creditLimitOverrideReason ?? ''} minLength={5} maxLength={1000} onChange={(e) => onChange({ ...value, creditLimitOverrideReason: e.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="block">ADMIN account password / كلمة مرور حساب المسؤول<input type="password" autoComplete="current-password" value={value.accountPassword ?? ''} onChange={(e) => onChange({ ...value, accountPassword: e.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
    </> : <p>ADMIN approval required / يلزم موافقة المسؤول</p>}
  </div>;
}
