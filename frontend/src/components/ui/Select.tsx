import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { controlClasses } from './Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Rendered as a disabled first option when the value is empty. */
  placeholder?: string;
}

/**
 * Native `<select>` with the shared control styling.
 *
 * Deliberately native: it inherits correct keyboard behaviour, typeahead and
 * mobile pickers for free, and every select in this app is a plain list of
 * options. A custom listbox (Radix) is only worth it for multi-select, option
 * groups with rich content, or async search — none of which exist here yet.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { placeholder, className, children, value, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        value={value}
        className={controlClasses(
          props['aria-invalid'] === true,
          cn('cursor-pointer appearance-none pr-9', className)
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
    </div>
  );
});
