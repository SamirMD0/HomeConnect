import { useThermalReconcileNotes } from '../hooks/useThermalReconcileNotes';

export function ThermalReconcileNotesPanel() {
  const { data, isLoading, isError } = useThermalReconcileNotes();

  return (
    <section aria-label="Thermal template reconciliation" className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Thermal template reconciliation</h3>
        {data && <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold">{data.status}</span>}
      </div>
      {isLoading && <p className="mt-2 text-xs text-slate-600">Loading audit notes…</p>}
      {isError && <p role="alert" className="mt-2 text-xs text-red-700">Could not read thermal template audit notes.</p>}
      {data && <p className="mt-2 text-xs text-slate-600">{data.hint}</p>}
      {data?.status === 'READY' && data.notes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.notes.map((note) => (
            <li key={note.id} className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <div className="flex flex-wrap gap-2 font-semibold">
                <time dateTime={note.runAt}>{new Date(note.runAt).toLocaleString()}</time>
                <span>{note.outcome}</span>
              </div>
              <p className="mt-1">{note.reason}</p>
              {note.diffFields.length > 0 && <p className="mt-1">Changed fields: {note.diffFields.join(', ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
