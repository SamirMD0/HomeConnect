import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../../lib/cn';

export interface DashboardAnchor {
  id: string;
  label: string;
}

/**
 * Sticky in-page nav strip above the analytics chapters. Always rendered so
 * `position: sticky` handles the pinning; watches the anchor targets with a
 * shared IntersectionObserver and highlights whichever is closest to the top
 * of the viewport. Clicking scrolls the anchor into view via native
 * `element.scrollIntoView` and never changes the URL.
 */
export function DashboardAnchorNav({ anchors }: { anchors: readonly DashboardAnchor[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    scrollRootRef.current = document.querySelector('main');
  }, []);

  useEffect(() => {
    const targets: HTMLElement[] = anchors
      .map((a) => document.getElementById(a.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting[0]) setActiveId(intersecting[0].target.id);
      },
      {
        root: scrollRootRef.current,
        rootMargin: '-96px 0px -55% 0px',
        threshold: [0, 0.25, 0.5],
      }
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [anchors]);

  return (
    <nav
      aria-label="Dashboard sections"
      className="no-print"
    >
      <div className="flex items-center gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {anchors.map((anchor) => {
          const isActive = anchor.id === activeId;
          return (
            <a
              key={anchor.id}
              href={`#${anchor.id}`}
              onClick={(event) => {
                event.preventDefault();
                const el = document.getElementById(anchor.id);
                if (!el) return;
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              {anchor.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
