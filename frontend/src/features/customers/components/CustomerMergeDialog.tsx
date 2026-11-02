import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { ConfirmPopup } from '../../../components/ui/ConfirmPopup';
import {
  customersApi,
  type CustomerMergeBalance,
  type CustomerMergeCandidate,
  type CustomerMoneyAmount,
} from '../api/customers.api';

const amountIn = (rows: CustomerMoneyAmount[], currency: CustomerMoneyAmount['currency']) =>
  Number(rows.find((row) => row.currency === currency)?.amount ?? 0);
const CURRENCIES: CustomerMoneyAmount['currency'][] = ['USD', 'LBP'];

export function formatMergeMoney(amount: number, currency: CustomerMoneyAmount['currency']) {
  return currency === 'USD' ? '$' + amount.toFixed(2) : amount.toLocaleString('en-US') + ' LBP';
}
export function formatMergeBalances(rows: CustomerMoneyAmount[]) {
  const shown = rows.filter((row) => Number(row.amount) !== 0);
  return shown.length
    ? shown.map((row) => formatMergeMoney(Number(row.amount), row.currency)).join(' + ')
    : '$0.00';
}
const sameBalances = (left: CustomerMergeCandidate, right: CustomerMergeCandidate) =>
  CURRENCIES.every(
    (currency) => amountIn(left.balances, currency) === amountIn(right.balances, currency)
  );
export function defaultBalanceChoice(
  keep: CustomerMergeCandidate,
  other: CustomerMergeCandidate
): CustomerMergeBalance {
  return sameBalances(keep, other) ? 'KEEP_ONLY' : 'ADD_BOTH';
}
/** Display only; the server recomputes everything when the merge runs. */
export function mergeOutcome(
  keep: CustomerMergeCandidate,
  other: CustomerMergeCandidate,
  choice: CustomerMergeBalance
) {
  const cancelled = choice === 'KEEP_ONLY' ? other.cancellable : [];
  const carriedOver = CURRENCIES.map((currency) => ({
    currency,
    amount: String(amountIn(other.balances, currency) - amountIn(cancelled, currency)),
  })).filter((row) => Number(row.amount) !== 0);
  const total = CURRENCIES.map((currency) => ({
    currency,
    amount: String(amountIn(keep.balances, currency) + amountIn(carriedOver, currency)),
  }));
  return { total, carriedOver, cancelled };
}
const historySize = (customer: CustomerMergeCandidate) =>
  Object.values(customer.counts).reduce((sum, value) => sum + value, 0);
/** The record with more history is the natural one to keep. */
export function defaultKeepId(customers: CustomerMergeCandidate[]) {
  return [...customers].sort((a, b) => historySize(b) - historySize(a))[0]?.id ?? '';
}
export function mergeConfirmMessage(
  keep: CustomerMergeCandidate,
  other: CustomerMergeCandidate,
  total: CustomerMoneyAmount[]
) {
  return [
    'Merge ' +
      other.name +
      ' (' +
      other.branchName +
      ') into ' +
      keep.name +
      ' (' +
      keep.branchName +
      ')?',
    '',
    'The balance after the merge will be ' + formatMergeBalances(total) + '.',
    'This cannot be undone.',
  ].join('\n');
}
function apiErrorMessage(error: unknown) {
  const data = (error as { response?: { data?: { error?: { message?: string } } } })?.response
    ?.data;
  return data?.error?.message ?? (error instanceof Error ? error.message : 'The merge failed');
}

function RecordSummary({ customer }: { customer: CustomerMergeCandidate }) {
  return (
    <>
      <span className="user-text block font-semibold text-slate-900" dir="auto">
        {customer.name}
      </span>
      <span className="block text-slate-600" dir="auto">
        {customer.branchName}
      </span>
      <span className="block text-slate-600">{customer.phone || 'No phone'}</span>
      <span className="block font-medium text-slate-900">
        Owes {formatMergeBalances(customer.balances)}
      </span>
      <span className="block text-xs text-slate-500">
        {customer.counts.payments} payments · {customer.counts.sales_orders} orders ·{' '}
        {customer.counts.debts} debts
      </span>
    </>
  );
}

export interface CustomerMergeFormProps {
  customers: CustomerMergeCandidate[];
  keepId: string;
  otherId: string;
  balance: CustomerMergeBalance;
  busy: boolean;
  error: string;
  onKeep: (id: string) => void;
  onOther: (id: string) => void;
  onBalance: (balance: CustomerMergeBalance) => void;
  onSubmit: () => void;
  onClose: () => void;
}
export const CustomerMergeForm: React.FC<CustomerMergeFormProps> = (props) => {
  const { customers, keepId, otherId, balance } = props;
  const keep = customers.find((customer) => customer.id === keepId);
  const other = customers.find((customer) => customer.id === otherId);
  if (customers.length < 2)
    return <p className="text-sm text-slate-600">No other customer has this name any more.</p>;
  const outcome = keep && other ? mergeOutcome(keep, other, balance) : null;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-600">
        Choose the record to keep. The other record's debts, payments, orders and history move to
        it, and that record is archived.
      </p>
      {customers.length > 2 && (
        <label className="block">
          Merge with
          <select
            aria-label="Customer to merge"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            value={otherId}
            onChange={(event) => props.onOther(event.target.value)}
          >
            {customers
              .filter((customer) => customer.id !== keepId)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.branchName} · {customer.phone || 'No phone'} ·{' '}
                  {formatMergeBalances(customer.balances)}
                </option>
              ))}
          </select>
        </label>
      )}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium text-slate-800">Keep this record</legend>
        {customers
          .filter((customer) => customer.id === keepId || customer.id === otherId)
          .map((customer) => (
            <label
              key={customer.id}
              className={
                'block cursor-pointer rounded-lg border p-3 ' +
                (customer.id === keepId ? 'border-brand-500 bg-brand-50' : 'border-slate-200')
              }
            >
              <input
                type="radio"
                name="merge-keep"
                className="mr-2"
                checked={customer.id === keepId}
                onChange={() => props.onKeep(customer.id)}
              />
              <span className="text-xs font-medium text-slate-500">
                {customer.id === keepId ? 'Keep' : 'Merge into the other record'}
              </span>
              <RecordSummary customer={customer} />
            </label>
          ))}
      </fieldset>
      {keep && other && outcome && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium text-slate-800">Balance after the merge</legend>
            <label className="block">
              <input
                type="radio"
                name="merge-balance"
                className="mr-2"
                checked={balance === 'ADD_BOTH'}
                onChange={() => props.onBalance('ADD_BOTH')}
              />
              Add both balances (these are two real debts)
            </label>
            <label className="block">
              <input
                type="radio"
                name="merge-balance"
                className="mr-2"
                checked={balance === 'KEEP_ONLY'}
                onChange={() => props.onBalance('KEEP_ONLY')}
              />
              Keep only the kept record's balance (one debt recorded twice)
            </label>
          </fieldset>
          <div role="status" className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">
              Balance after the merge: {formatMergeBalances(outcome.total)}
            </p>
            {outcome.cancelled.length > 0 && (
              <p className="mt-1 text-slate-600">
                Unpaid debts of {formatMergeBalances(outcome.cancelled)} on the other record will be
                cancelled with the reason "Merged". No payment is deleted.
              </p>
            )}
            {balance === 'KEEP_ONLY' && outcome.carriedOver.length > 0 && (
              <p className="mt-1 font-medium text-amber-800">
                {formatMergeBalances(outcome.carriedOver)} on the other record is part-paid or on an
                installment plan, so it can't be cancelled and carries over.
              </p>
            )}
          </div>
          <p className="text-xs text-slate-500">
            A merge cannot be undone. Blank phone, address and notes on the kept record are filled
            from the other record.
          </p>
        </>
      )}
      {props.error && (
        <p role="alert" className="text-red-700">
          {props.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={props.onClose} disabled={props.busy}>
          Cancel
        </Button>
        <Button onClick={props.onSubmit} disabled={!keep || !other} isLoading={props.busy}>
          Merge customers
        </Button>
      </div>
    </div>
  );
};

export const CustomerMergeDialog: React.FC<{ customerId: string; onClose: () => void }> = ({
  customerId,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const candidates = useQuery({
    queryKey: ['customer-merge-candidates', customerId],
    queryFn: () => customersApi.getMergeCandidates(customerId),
  });
  const customers = candidates.data?.customers ?? [];
  const [keepChoice, setKeepChoice] = useState<string | null>(null);
  const [otherChoice, setOtherChoice] = useState<string | null>(null);
  const [balanceChoice, setBalanceChoice] = useState<CustomerMergeBalance | null>(null);
  const [confirming, setConfirming] = useState(false);
  const keepId = keepChoice ?? defaultKeepId(customers);
  const otherId =
    otherChoice && otherChoice !== keepId
      ? otherChoice
      : (customers.find((customer) => customer.id === customerId && customer.id !== keepId)?.id ??
        customers.find((customer) => customer.id !== keepId)?.id ??
        '');
  const keep = customers.find((customer) => customer.id === keepId);
  const other = customers.find((customer) => customer.id === otherId);
  const balance = balanceChoice ?? (keep && other ? defaultBalanceChoice(keep, other) : 'ADD_BOTH');
  const merge = useMutation({
    mutationFn: () => customersApi.mergeCustomer(keepId, { mergeCustomerId: otherId, balance }),
    onSuccess: () => {
      toast.success('Customers merged');
      void queryClient.invalidateQueries();
      onClose();
    },
  });
  return (
    <>
      <Modal
        isOpen
        onClose={() => {
          if (!merge.isPending) onClose();
        }}
        title="Customers with the same name"
      >
        {candidates.isLoading && <p className="text-sm text-slate-500">Loading customers…</p>}
        {candidates.isError && (
          <p role="alert" className="text-sm text-red-700">
            {apiErrorMessage(candidates.error)}
          </p>
        )}
        {candidates.data && (
          <CustomerMergeForm
            customers={customers}
            keepId={keepId}
            otherId={otherId}
            balance={balance}
            busy={merge.isPending}
            error={merge.isError ? apiErrorMessage(merge.error) : ''}
            onKeep={(id) => {
              // The clicked-away record becomes the one merged.
              if (id === otherId) setOtherChoice(keepId);
              setKeepChoice(id);
            }}
            onOther={setOtherChoice}
            onBalance={setBalanceChoice}
            onSubmit={() => setConfirming(true)}
            onClose={onClose}
          />
        )}
      </Modal>
      {confirming && keep && other && (
        <ConfirmPopup
          title="Merge these customers?"
          message={mergeConfirmMessage(keep, other, mergeOutcome(keep, other, balance).total)}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            merge.mutate();
          }}
        />
      )}
    </>
  );
};
