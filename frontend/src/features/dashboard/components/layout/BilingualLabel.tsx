import { createContext, useContext, type ReactNode } from 'react';
import type { BilingualText } from '../../config/dashboard-labels';

/** Reports are English-only; the dashboard keeps its bilingual labels. */
const EnglishOnlyContext = createContext(false);

export function EnglishOnlyLabels({ children }: { children: ReactNode }) {
  return <EnglishOnlyContext.Provider value>{children}</EnglishOnlyContext.Provider>;
}

export function BilingualLabel({ label, compact = false }: { label: BilingualText; compact?: boolean }) {
  const englishOnly = useContext(EnglishOnlyContext);
  if (englishOnly) return <span>{label.en}</span>;
  return <span className={compact ? 'inline-flex flex-wrap items-baseline gap-x-1.5' : 'flex flex-col'}><span>{label.en}</span><span dir="rtl" className={compact ? 'text-[0.86em] font-normal opacity-75' : 'text-xs font-normal opacity-75'}>{label.ar}</span></span>;
}
