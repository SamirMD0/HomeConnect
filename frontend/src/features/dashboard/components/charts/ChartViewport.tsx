import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Mount charts only after their container has a visible layout size. */
export function ChartViewport({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSize, setHasSize] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = ({ width, height }: { width: number; height: number }) => {
      setHasSize(width > 0 && height > 0);
    };
    updateSize(container.getBoundingClientRect());
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateSize(entry.contentRect);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className="h-full w-full min-w-0">{hasSize ? children : null}</div>;
}
