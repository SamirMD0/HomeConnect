import {
  MessageBodies,
  MessageLanguage,
  MessagePlaceholder,
  MessageTone,
  MessageType,
  MessageValues,
  TemplateLanguage,
} from '../types/communication.types';
import { TemplateLine, TemplateParagraph, buildTemplateParagraphs } from './message-templates';

/**
 * Line-level placeholder renderer.
 *
 * Three rules carry the whole design:
 *  - a **known** placeholder with no value drops the *entire line*, so a missing
 *    due date never produces "تاريخ الاستحقاق هو ." ;
 *  - an **unknown** placeholder is left verbatim, so a template typo shows up in
 *    the preview instead of silently becoming `undefined`;
 *  - a line given as a list of **alternatives** renders the first one that
 *    survives those rules, which lets a sentence degrade gracefully rather than
 *    inventing a value it does not have.
 */

export const KNOWN_PLACEHOLDERS: MessagePlaceholder[] = [
  'customerName',
  'phone',
  'amount',
  'remainingAmount',
  'dateAdded',
  'dueDate',
  'daysLate',
  'daysLateText',
  'paymentDate',
  'lastPaymentDate',
  'serviceStatus',
  'customNote',
  'businessName',
];

/** Separates the Arabic and English blocks of an AR+EN message. */
export const BILINGUAL_SEPARATOR = '---';

const PLACEHOLDER_PATTERN = /\[([A-Za-z][A-Za-z0-9_]*)\]/g;

const knownSet = new Set<string>(KNOWN_PLACEHOLDERS);

function isKnown(token: string): token is MessagePlaceholder {
  return knownSet.has(token);
}

/** A line that ended up as bare punctuation carries no information — drop it. */
function hasContent(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line);
}

function renderSingleLine(line: string, values: Partial<MessageValues>): string | null {
  const tokens = Array.from(line.matchAll(PLACEHOLDER_PATTERN), (match) => match[1]);

  for (const token of tokens) {
    if (!isKnown(token)) continue;
    const value = values[token];
    if (value === undefined || value === null || String(value).trim() === '') return null;
  }

  const rendered = line.replace(PLACEHOLDER_PATTERN, (match, token: string) =>
    isKnown(token) ? String(values[token]).trim() : match
  );

  const trimmed = rendered.trim();
  return trimmed !== '' && hasContent(trimmed) ? trimmed : null;
}

/** Renders one template line, or `null` when the line must be dropped. */
export function renderLine(line: TemplateLine, values: Partial<MessageValues>): string | null {
  const alternatives = Array.isArray(line) ? line : [line];

  for (const alternative of alternatives) {
    const rendered = renderSingleLine(alternative, values);
    if (rendered !== null) return rendered;
  }

  return null;
}

export function renderLines(
  lines: TemplateParagraph,
  values: Partial<MessageValues>
): string[] {
  return lines
    .map((line) => renderLine(line, values))
    .filter((line): line is string => line !== null);
}

/** Renders paragraphs, dropping any left with no surviving lines. */
export function renderParagraphs(
  paragraphs: TemplateParagraph[],
  values: Partial<MessageValues>
): string {
  return paragraphs
    .map((paragraph) => renderLines(paragraph, values).join('\n'))
    .filter((paragraph) => paragraph.trim() !== '')
    .join('\n\n');
}

/** Renders a single-language block. */
export function renderTemplateBlock(
  type: MessageType,
  language: TemplateLanguage,
  tone: MessageTone,
  values: Partial<MessageValues>
): string {
  return renderParagraphs(buildTemplateParagraphs(type, language, tone), values).trim();
}

export interface RenderMessageInput {
  type: MessageType;
  language: TemplateLanguage;
  tone: MessageTone;
  values: Partial<MessageValues>;
}

/**
 * Renders one language block. AR and EN are rendered separately and kept in
 * separate editable areas — see `combineMessageBodies` for how they are joined
 * at copy/send time.
 */
export function renderMessage({ type, language, tone, values }: RenderMessageInput): string {
  // A custom message *is* its own template: the employee's text runs through the
  // same pipeline so `[amount]` and friends still resolve.
  if (type === 'CUSTOM') {
    const note = (values.customNote ?? '').trim();
    if (note === '') return '';
    // Blanking `customNote` stops a `[customNote]` typed inside the note from
    // expanding into itself; that line simply drops instead.
    return renderParagraphs(
      note.split(/\n{2,}/).map((paragraph) => paragraph.split('\n')),
      { ...values, customNote: '' }
    ).trim();
  }

  return renderTemplateBlock(type, language, tone, values);
}

/** The blocks an employee actually edits for the chosen language. */
export function activeBodyLanguages(
  type: MessageType,
  language: MessageLanguage
): TemplateLanguage[] {
  // A custom message is written once, whatever the language switch says.
  if (type === 'CUSTOM') return ['AR'];
  return language === 'AR_EN' ? ['AR', 'EN'] : [language];
}

/**
 * Joins the blocks for copying and for the wa.me link. AR+EN sends Arabic
 * first, then a plain `---` separator, then English.
 */
export function combineMessageBodies(
  type: MessageType,
  language: MessageLanguage,
  bodies: MessageBodies
): string {
  const blocks = activeBodyLanguages(type, language)
    .map((templateLanguage) => bodies[templateLanguage].trim())
    .filter((block) => block !== '');

  return blocks.join(`\n\n${BILINGUAL_SEPARATOR}\n\n`);
}
