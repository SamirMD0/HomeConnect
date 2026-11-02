import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/shadcn/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/shadcn/command';
import { useAuth } from '../hooks/useAuth';
import { NAVIGATION, isItemVisible } from './navigation';

/**
 * The top bar's search field. It searches the pages this user can open, by
 * English or Arabic name, and Ctrl+K opens it from anywhere. It does not search
 * records: each module's own list does that with the right filters.
 */
export const PageJump: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Jump to a page"
          className="flex h-10 w-10 shrink-0 items-center gap-2.5 rounded-full bg-slate-100 px-3 text-sm text-slate-500 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:w-72"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden flex-1 truncate text-left md:block">Jump to a page…</span>
          <kbd className="hidden rounded-md bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-500 md:block">
            Ctrl K
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Type a page name…" />
          <CommandList>
            <CommandEmpty>No page with that name.</CommandEmpty>
            {NAVIGATION.map((section) => {
              const items = section.items.filter((item) => isItemVisible(item, user?.role));
              if (items.length === 0) return null;
              return (
                <CommandGroup key={section.id} heading={section.heading.en}>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.key}
                        value={`${item.label.en} ${item.label.ar}`}
                        onSelect={() => {
                          setOpen(false);
                          navigate(item.path);
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                        <span className="flex-1 truncate">{item.label.en}</span>
                        <span dir="rtl" className="truncate text-xs text-slate-500">
                          {item.label.ar}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
