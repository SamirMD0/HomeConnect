import React, { useState } from 'react';
import {
  branchErrorMessage,
  useBranchMutation,
  useBranches,
  useSetUserBranchAccess,
  useStaffBranchAccess,
  type Branch,
  type StaffBranchAccess,
} from './branches';

const emptyForm = { code: '', name: '', address: '', phone: '' };
const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2';

export const BranchesPanel: React.FC = () => {
  const branches = useBranches();
  const save = useBranchMutation();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (branch: Branch) => {
    setEditing(branch);
    setError(null);
    setForm({ code: branch.code, name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '' });
  };
  const reset = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const input = {
      code: form.code.trim(),
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
    };
    try {
      await save.mutateAsync(editing ? { id: editing.id, input } : { input: { ...input, isActive: true } });
      reset();
    } catch (cause) {
      setError(branchErrorMessage(cause, 'Branch could not be saved.'));
    }
  };
  const toggleActive = async (branch: Branch) => {
    setError(null);
    try {
      await save.mutateAsync({ id: branch.id, input: { isActive: !branch.isActive } });
    } catch (cause) {
      setError(branchErrorMessage(cause, 'Branch status could not be changed.'));
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Branches</h2>
        <p className="mt-1 text-sm text-slate-500">
          Set up shop branches and choose which branches each employee works in. Administrators always have access to every branch.
        </p>
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Customers, suppliers, sales and balances are not separated by branch yet. Every user still sees all records until branch separation is released.
        </p>
      </div>

      <form className="mt-5 grid gap-4 md:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={submit} aria-label={editing ? 'Edit branch' : 'Add branch'}>
        <label className="text-sm font-medium text-slate-700">
          Code
          <input required maxLength={12} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} placeholder="MAIN" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Name
          <input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Main shop" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Address
          <input maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Phone
          <input maxLength={40} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={save.isPending} className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
            {save.isPending ? 'Saving…' : editing ? 'Save branch' : 'Add branch'}
          </button>
          {editing && (
            <button type="button" onClick={reset} className="rounded-md border border-slate-300 px-4 py-2 text-slate-700">
              Cancel
            </button>
          )}
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      {branches.isLoading && <p className="mt-5 text-sm text-slate-500">Loading branches…</p>}
      {branches.isError && <p className="mt-5 text-sm text-red-600">Branches could not be loaded.</p>}
      {branches.data && (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr><th className="py-2 pr-4">Code</th><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Address</th><th className="py-2 pr-4">Phone</th><th className="py-2 pr-4">Employees</th><th className="py-2 pr-4">Status</th><th className="py-2" /></tr>
            </thead>
            <tbody>
              {branches.data.map((branch) => (
                <tr key={branch.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-mono">{branch.code}</td>
                  <td className="py-2 pr-4 font-medium">{branch.name}</td>
                  <td className="py-2 pr-4">{branch.address ?? '—'}</td>
                  <td className="py-2 pr-4">{branch.phone ?? '—'}</td>
                  <td className="py-2 pr-4">{branch.assignedUserCount ?? 0}</td>
                  <td className="py-2 pr-4">{branch.isActive ? 'Active' : 'Inactive'}</td>
                  <td className="space-x-3 py-2 text-right whitespace-nowrap">
                    <button type="button" className="text-brand-700 hover:underline" onClick={() => startEdit(branch)}>Edit</button>
                    <button type="button" className="text-slate-600 hover:underline" disabled={save.isPending} onClick={() => toggleActive(branch)}>
                      {branch.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {branches.data.length === 0 && <p className="py-4 text-sm text-slate-500">No branches have been set up.</p>}
        </div>
      )}

      {branches.data && branches.data.some((branch) => branch.isActive) && (
        <StaffAccessTable branches={branches.data.filter((branch) => branch.isActive)} />
      )}
    </section>
  );
};

const StaffAccessTable: React.FC<{ branches: Branch[] }> = ({ branches }) => {
  const staff = useStaffBranchAccess();
  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-slate-900">Staff branch access</h3>
      {staff.isLoading && <p className="mt-3 text-sm text-slate-500">Loading staff…</p>}
      {staff.isError && <p className="mt-3 text-sm text-red-600">Staff access could not be loaded.</p>}
      {staff.data && (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2 pr-4">User</th>
                {branches.map((branch) => <th key={branch.id} className="py-2 pr-4">{branch.name}</th>)}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {staff.data.map((member) => <StaffAccessRow key={member.id} member={member} branches={branches} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const StaffAccessRow: React.FC<{ member: StaffBranchAccess; branches: Branch[] }> = ({ member, branches }) => {
  const setAccess = useSetUserBranchAccess();
  const activeIds = new Set(branches.map((branch) => branch.id));
  const initial = member.branchIds.filter((id) => activeIds.has(id));
  const [selected, setSelected] = useState<string[]>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = selected.length !== initial.length || selected.some((id) => !initial.includes(id));

  const toggle = (branchId: string) =>
    setSelected((current) => (current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId]));
  const saveAccess = async () => {
    setMessage(null);
    try {
      await setAccess.mutateAsync({ userId: member.id, branchIds: selected });
      setMessage('Saved');
    } catch (cause) {
      setMessage(branchErrorMessage(cause, 'Access could not be saved.'));
    }
  };

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4">
        <span className="font-medium">{member.fullName}</span>
        <span className="ml-2 text-slate-500">@{member.username}</span>
        {!member.isActive && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
      </td>
      {member.allBranches ? (
        <td colSpan={branches.length} className="py-2 pr-4 text-slate-500">All branches (administrator)</td>
      ) : (
        branches.map((branch) => (
          <td key={branch.id} className="py-2 pr-4">
            <input
              type="checkbox"
              aria-label={`${member.fullName} works in ${branch.name}`}
              checked={selected.includes(branch.id)}
              onChange={() => toggle(branch.id)}
            />
          </td>
        ))
      )}
      <td className="py-2 text-right whitespace-nowrap">
        {!member.allBranches && (
          <button type="button" disabled={!dirty || setAccess.isPending} onClick={saveAccess} className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 disabled:opacity-40">
            {setAccess.isPending ? 'Saving…' : 'Save'}
          </button>
        )}
        {message && <span className="ml-2 text-xs text-slate-500">{message}</span>}
      </td>
    </tr>
  );
};
