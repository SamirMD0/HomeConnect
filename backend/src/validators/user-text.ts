import { z } from 'zod';

const unsafeHtmlPattern = /<[^>]*>|<\/?[a-z][\s\S]*>/i;

interface UserTextOptions {
  field: string;
  min?: number;
  max?: number;
}

export function userTextSchema({ field, min, max }: UserTextOptions) {
  let schema = z
    .string()
    .trim()
    .refine((value) => !containsUnsafeControlCharacter(value), `${field} contains unsupported characters`)
    .refine((value) => !unsafeHtmlPattern.test(value), `${field} must not contain HTML`);

  if (min !== undefined) {
    schema = schema.min(min, `${field} must be at least ${min} characters`);
  }

  if (max !== undefined) {
    schema = schema.max(max, `${field} is too long`);
  }

  return schema;
}

function containsUnsafeControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (
      codePoint === 0x7F ||
      (codePoint >= 0x00 && codePoint <= 0x08) ||
      codePoint === 0x0B ||
      codePoint === 0x0C ||
      (codePoint >= 0x0E && codePoint <= 0x1F)
    );
  });
}
