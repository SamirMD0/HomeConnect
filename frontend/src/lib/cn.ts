import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, letting later classes win over earlier ones.
 *
 * `clsx` resolves conditionals/arrays into a string; `twMerge` then drops
 * earlier classes that target the same Tailwind property, so a caller can
 * override a component's default without fighting specificity:
 *
 *   cn('px-4 py-2 bg-brand-600', 'bg-white')  ->  'px-4 py-2 bg-white'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
