import React, { useContext, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { BranchScopeContext } from '../../branches/scope/BranchScopeProvider';
import { inputClass, SubmitButton, TextField } from '../../customer-financial/components/CreateDebtForm';
import { customersApi, type CustomerBranchTransferCounts } from '../api/customers.api';

const COUNT_LABELS: Record<keyof CustomerBranchTransferCounts, string> = {
  sales_orders: 'Sales orders / طلبات البيع',
  sales_returns: 'Returns / المرتجعات',
  cash_refunds: 'Cash refunds / المبالغ المستردة',
  customer_credits: 'Store credits / الرصيد',
  payments: 'Payments / الدفعات',
  debts: 'Debts / الديون',
  installment_plans: 'Installment plans / خطط التقسيط',
  service_jobs: 'Service jobs / طلبات الصيانة',
};

function apiErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data;
  return data?.error?.message ?? data?.message ?? (error instanceof Error ? error.message : 'Branch transfer failed');
}

export interface CustomerBranchTransferDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer: { id: string; name: string; branchId?: string };
}

/**
 * Moves a customer and their whole history to another branch. The server does
 * it in one transaction (all or nothing) and requires the account password.
 */
export const CustomerBranchTransferDialog: React.FC<CustomerBranchTransferDialogProps> = ({ isOpen, onClose, customer }) => {
  const scope = useContext(BranchScopeContext);
  const queryClient = useQueryClient();
  const [toBranchId, setToBranchId] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const destinations = (scope?.branches ?? []).filter((branch) => branch.isActive && branch.id !== customer.branchId);
  const current = scope?.branches.find((branch) => branch.id === customer.branchId);

  const preview = useQuery({
    queryKey: ['customer-branch-transfer-preview', customer.id, toBranchId],
    queryFn: () => customersApi.previewBranchTransfer(customer.id, toBranchId),
    enabled: isOpen && Boolean(toBranchId),
  });

  const transfer = useMutation({
    mutationFn: () => customersApi.transferBranch(customer.id, { toBranchId, accountPassword }),
    onSuccess: (result) => {
      const destination = scope?.branches.find((branch) => branch.id === result.toBranchId);
      toast.success(`Moved to ${destination?.name ?? 'the new branch'} / تم النقل`);
      // Keep the customer visible: a single-branch view of the old branch would no longer include them.
      if (scope?.selection?.kind === 'branch' && scope.selection.branchId !== result.toBranchId) {
        scope.select({ kind: 'branch', branchId: result.toBranchId });
      }
      void queryClient.invalidateQueries();
      close();
    },
  });

  const close = () => {
    setToBranchId('');
    setAccountPassword('');
    transfer.reset();
    onClose();
  };

  const counts = preview.data?.counts;
  const total = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0;
  const blocker = preview.data?.blocker;
  const canSubmit = Boolean(toBranchId && accountPassword && preview.data && !blocker && !transfer.isPending);

  return (
    <Modal isOpen={isOpen} onClose={() => !transfer.isPending && close()} title="Change branch / تغيير الفرع">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) transfer.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          Moves <span className="user-text font-semibold text-slate-900" dir="auto">{customer.name}</span>
          {current ? <> from <span className="user-text font-semibold" dir="auto">{current.name}</span></> : null}, together with all of
          their history. Balances do not change.
        </p>

        <TextField label="Destination branch / الفرع الجديد">
          <select
            value={toBranchId}
            onChange={(event) => setToBranchId(event.target.value)}
            className={inputClass(false)}
            aria-label="Destination branch"
          >
            <option value="">Choose a branch…</option>
            {destinations.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>
            ))}
          </select>
        </TextField>

        {toBranchId && preview.isLoading && <p className="text-sm text-slate-500">Checking what will move…</p>}
        {preview.isError && <p role="alert" className="text-sm text-red-700">{apiErrorMessage(preview.error)}</p>}

        {counts && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="branch-transfer-preview">
            <p className="font-medium text-slate-800">Records that move with the customer: {total}</p>
            <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-slate-600 sm:grid-cols-2">
              {(Object.keys(COUNT_LABELS) as Array<keyof CustomerBranchTransferCounts>)
                .filter((key) => counts[key] > 0)
                .map((key) => (
                  <li key={key} className="flex justify-between gap-2">
                    <span>{COUNT_LABELS[key]}</span>
                    <span className="tabular-nums font-medium text-slate-800">{counts[key]}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {preview.data && !blocker && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p>Past reports for the old branch will no longer include this customer's sales, payments and debts.</p>
              {preview.data.importAccounts.length > 0 && (
                <p>
                  The link to trial-balance account {preview.data.importAccounts.map((account) => account.accountCode).join(', ')} stays
                  with the old branch and will be removed. Re-importing that trial balance there would treat the account as new.
                </p>
              )}
            </div>
          </div>
        )}

        {blocker && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{blocker.message}</p>}

        <TextField label="Account password / كلمة المرور">
          <input
            type="password"
            autoComplete="current-password"
            value={accountPassword}
            onChange={(event) => setAccountPassword(event.target.value)}
            className={inputClass(transfer.isError)}
          />
        </TextField>

        {transfer.isError && <p role="alert" className="text-sm text-red-700">{apiErrorMessage(transfer.error)}</p>}

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={close} disabled={transfer.isPending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel / إلغاء
          </button>
          <span className={canSubmit ? '' : 'pointer-events-none opacity-50'}>
            <SubmitButton isPending={transfer.isPending} label="Move customer / نقل" pendingLabel="Moving… / جارٍ النقل" />
          </span>
        </div>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" /> All records move together, or nothing moves.
        </p>
      </form>
    </Modal>
  );
};
