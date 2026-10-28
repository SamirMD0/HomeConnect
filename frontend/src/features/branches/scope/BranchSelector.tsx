import React from 'react';
import { AlertTriangle, Check, ChevronsUpDown, Layers } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/shadcn/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '../../../components/shadcn/command';
import type { Branch } from '../branches';
import { useBranchScope } from './BranchScopeProvider';
import type { BranchSelection } from './branch-scope-store';

const CHIP =
  'inline-flex h-9 max-w-[240px] items-center gap-2 rounded-lg border border-border bg-white px-2 text-sm font-medium text-slate-800';

function CodeBadge({ children, tone = 'brand' }: { children: React.ReactNode; tone?: 'brand' | 'slate' | 'amber' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-bold uppercase tracking-wide',
        tone === 'brand' && 'bg-brand-600 text-white',
        tone === 'slate' && 'bg-slate-800 text-white',
        tone === 'amber' && 'bg-amber-100 text-amber-800'
      )}
    >
      {children}
    </span>
  );
}

export interface BranchChipProps {
  branches: Branch[];
  selection: BranchSelection | null;
}

/** The chip's static face. Exported for tests: it renders with no providers. */
export function BranchChip({ branches, selection }: BranchChipProps) {
  if (!selection) {
    return <span className={cn(CHIP, 'w-40 animate-pulse bg-slate-100')} aria-label="Loading branches" />;
  }
  if (selection.kind === 'none') {
    return (
      <span className={cn(CHIP, 'border-amber-200 bg-amber-50 text-amber-900')} role="status">
        <CodeBadge tone="amber">
          <AlertTriangle className="h-3.5 w-3.5" />
        </CodeBadge>
        <span className="truncate">No branch assigned</span>
      </span>
    );
  }
  const branch = selection.kind === 'branch' ? branches.find((item) => item.id === selection.branchId) : null;
  return (
    <>
      {branch ? <CodeBadge>{branch.code.slice(0, 4)}</CodeBadge> : <CodeBadge tone="slate"><Layers className="h-3.5 w-3.5" /></CodeBadge>}
      <span className="user-text truncate" dir="auto">
        {branch ? branch.name : 'All branches'}
      </span>
    </>
  );
}

/**
 * Header branch selector, in the place the reference design keeps its
 * workspace switcher. One branch: a read-only chip. Several: a searchable list
 * with "All branches" first. The choice drives X-Branch-Scope on every request.
 */
export function BranchSelector() {
  const { ready, branches, selection, select } = useBranchScope();
  const [open, setOpen] = React.useState(false);

  if (!ready || !selection || selection.kind === 'none' || branches.length <= 1) {
    const single = selection?.kind === 'branch';
    return (
      <span
        className={cn(selection?.kind !== 'none' && selection && CHIP, 'hidden md:inline-flex')}
        title={single ? 'Your branch' : undefined}
        aria-label={single ? `Branch: ${branches[0]?.name ?? ''}` : undefined}
      >
        <BranchChip branches={branches} selection={ready ? selection : null} />
      </span>
    );
  }

  const choose = (next: BranchSelection) => {
    select(next);
    setOpen(false);
  };
  const isSelected = (next: BranchSelection) =>
    next.kind === selection.kind && (next.kind !== 'branch' || (selection.kind === 'branch' && selection.branchId === next.branchId));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Select branch"
          className={cn(
            CHIP,
            'hidden transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:inline-flex'
          )}
        >
          <BranchChip branches={branches} selection={selection} />
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search branches…" />
          <CommandList>
            <CommandEmpty>No branch found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all branches" onSelect={() => choose({ kind: 'all' })}>
                <CodeBadge tone="slate"><Layers className="h-3.5 w-3.5" /></CodeBadge>
                <span className="flex-1">All branches</span>
                {isSelected({ kind: 'all' }) && <Check className="h-4 w-4 text-brand-600" aria-label="Selected" />}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Branches">
              {branches.map((branch) => (
                <CommandItem
                  key={branch.id}
                  value={`${branch.code} ${branch.name}`}
                  onSelect={() => choose({ kind: 'branch', branchId: branch.id })}
                >
                  <CodeBadge>{branch.code.slice(0, 4)}</CodeBadge>
                  <span className="user-text flex-1 truncate" dir="auto">{branch.name}</span>
                  {isSelected({ kind: 'branch', branchId: branch.id }) && (
                    <Check className="h-4 w-4 text-brand-600" aria-label="Selected" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
