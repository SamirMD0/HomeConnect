import * as Slot from '@rn-primitives/slot';
import { createContext, useContext } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { cn } from '../../lib/utils';

/** Lets a parent (Button, Badge) set the text style of the labels inside it. */
export const TextClassContext = createContext<string | undefined>(undefined);

/**
 * shadcn Text. Plus Jakarta Sans like the PC; Arabic falls back to the
 * system face, which renders it natively. Weight comes from the font family
 * classes (`font-sans-semibold`), because Android does not synthesise weights
 * for custom fonts.
 */
export function Text({ className, asChild = false, ...props }: TextProps & { className?: string; asChild?: boolean }) {
  const inherited = useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return <Component className={cn('font-sans text-base text-foreground', inherited, className)} {...props} />;
}
