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
      className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white ring-2 ring-brand-100 transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-brand-300"
    >
      {initial}
    </button>
  );
}
