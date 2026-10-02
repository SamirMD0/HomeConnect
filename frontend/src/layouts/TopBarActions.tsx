import { Bell, ChevronDown, Lock, Mail, Search } from 'lucide-react';

/**
 * Shell features inspired by the Dreams ERP top bar. Everything that is not
 * yet backed by Home Connect's data model carries a small lock badge and a
 * "coming soon" tooltip, so the operator sees the roadmap without being
 * confused by half-wired controls. All controls here are declarative — no
 * network calls, no routing.
 */

interface LockedActionProps {
  label: string;
  hint: string;
  icon: React.ReactNode;
}

/**
 * A square icon button with a small lock badge in the top-right corner and a
 * native tooltip. Rendered as a disabled button so keyboard navigation skips
 * past it predictably.
 */
export function LockedAction({ label, hint, icon }: LockedActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      disabled
      className="relative flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-md text-slate-500 opacity-70 transition-colors hover:bg-slate-100 focus-visible:outline-none"
    >
      {icon}
      <span
        aria-hidden="true"
        className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-300 ring-2 ring-white"
      >
        <Lock className="h-2 w-2 text-slate-700" strokeWidth={3} />
      </span>
    </button>
  );
}

/**
 * Workspace selector styled to look like Dreams ERP's "Falcon LLP" dropdown.
 * Home Connect is single-shop, so the control is locked. The initials chip
 * uses the first two characters of the display name, falling back to "HC".
 */
export function WorkspaceSelector({ businessName }: { businessName?: string }) {
  const name = businessName?.trim() || 'Home Connect';
  const initials = name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      disabled
      aria-label={`Workspace: ${name}`}
      title="Multi-shop support is coming soon"
      className="relative hidden cursor-not-allowed items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 opacity-90 md:flex"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-emerald-600 text-[10px] font-bold uppercase tracking-wide text-white"
      >
        {initials}
      </span>
      <span className="max-w-[140px] truncate text-slate-800">{name}</span>
      <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      <span
        aria-hidden="true"
        className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-300 ring-2 ring-white"
      >
        <Lock className="h-2 w-2 text-slate-700" strokeWidth={3} />
      </span>
    </button>
  );
}

/**
 * The three right-side locked actions: search, notifications, messages. Each
 * carries its own concise tooltip so the operator understands which part of
 * the roadmap they're looking at.
 */
export function TopBarActions() {
  return (
    <div className="hidden items-center gap-1 sm:flex">
      <LockedAction label="Global search" hint="Global search is coming soon" icon={<Search className="h-4 w-4" />} />
      <LockedAction
        label="Notifications"
        hint="In-app notifications are coming soon"
        icon={<Bell className="h-4 w-4" />}
      />
      <LockedAction label="Messages" hint="In-app messages are coming soon" icon={<Mail className="h-4 w-4" />} />
    </div>
  );
}

/**
 * User avatar chip. Not locked — the auth story is already wired and sign-out
 * remains available in the sidebar footer. This is a visual anchor on the
 * right of the header; a menu can be added later without touching this
 * component's shape.
 */
export function UserAvatar({ name }: { name?: string }) {
  const trimmed = name?.trim() ?? '';
  const initial = trimmed.charAt(0).toUpperCase() || '?';
  return (
    <button
      type="button"
      aria-label={trimmed ? `Account: ${trimmed}` : 'Account'}
      title={trimmed || 'Account'}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/25 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
    >
      {initial}
    </button>
  );
}
