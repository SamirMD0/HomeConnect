import React, { useState } from 'react';
import { useCreateExchangeRate, useExchangeRates } from '../hooks/useExchangeRates';

export const ExchangeRatePanel: React.FC = () => {
  const rates = useExchangeRates();
  const createRate = useCreateExchangeRate();
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await createRate.mutateAsync({
      rate,
      effectiveFrom: new Date().toISOString(),
      note: note.trim() || null,
    });
    setRate('');
    setNote('');
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">USD to LBP exchange rate</h2>
        <p className="mt-1 text-sm text-slate-500">
          LBP per USD. Entries are append-only and preserve the administrator, effective time, and note.
        </p>
      </div>

      <form className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]" onSubmit={submit}>
        <label className="text-sm font-medium text-slate-700">
          LBP per USD
          <input
            required
            inputMode="decimal"
            pattern="(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="90000"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Audit note
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Source or reason for this rate"
          />
        </label>
        <button
          type="submit"
          disabled={createRate.isPending}
          className="self-end rounded-md bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {createRate.isPending ? 'Saving…' : 'Add rate'}
        </button>
      </form>

      {createRate.isError && <p className="mt-3 text-sm text-red-600">Exchange rate could not be saved.</p>}
      {rates.isLoading && <p className="mt-5 text-sm text-slate-500">Loading exchange-rate history…</p>}
      {rates.isError && <p className="mt-5 text-sm text-red-600">Exchange-rate history could not be loaded.</p>}
      {rates.data && (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-slate-500"><tr><th className="py-2 pr-4">Rate</th><th className="py-2 pr-4">Effective</th><th className="py-2 pr-4">Entered by</th><th className="py-2">Note</th></tr></thead>
            <tbody>
              {rates.data.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium">{entry.rate} LBP</td>
                  <td className="py-2 pr-4">{new Date(entry.effectiveFrom).toLocaleString()}</td>
                  <td className="py-2 pr-4">{entry.createdBy.fullName}</td>
                  <td className="py-2">{entry.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rates.data.length === 0 && <p className="py-4 text-sm text-slate-500">No exchange rate has been entered.</p>}
        </div>
      )}
    </section>
  );
};
