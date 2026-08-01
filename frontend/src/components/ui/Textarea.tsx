import React from 'react';
import { cn } from '../../lib/cn';
import { controlClasses } from './Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Applies `.user-text-input` for free-text the user types. */
  userText?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { userText = true, className, rows = 3, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={controlClasses(
        props['aria-invalid'] === true,
        cn('resize-y', userText && 'user-text-input', className)
      )}
      {...props}
    />
  );
});
