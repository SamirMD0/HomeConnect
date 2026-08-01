import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FormFieldProps {
  label: React.ReactNode;
  /** Rendered as `aria-describedby` help text below the control. */
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /**
   * Receives the wiring the control needs. Spread it onto Input/Select/Textarea
   * so label association and error announcement are correct by construction.
   */
  children: (field: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
    'aria-required'?: true;
  }) => React.ReactNode;
}

/**
 * Label-above-control field wrapper. Placeholder-as-label is not used anywhere
 * in this app: the label disappears as soon as the user types, which is exactly
 * when they need it.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  hint,
  error,
  required = false,
  className,
  children,
}) => {
  const reactId = useId();
  const id = `field-${reactId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
};
