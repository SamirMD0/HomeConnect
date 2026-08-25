import { describe, expect, it } from 'vitest';
import {
  BUSINESS_NAME,
  FORBIDDEN_ESCALATION_PHRASES,
  MESSAGE_TONES,
  MESSAGE_TYPES,
  TemplateParagraph,
  buildTemplateParagraphs,
} from './message-templates';
import { TemplateLanguage } from '../types/communication.types';
import { KNOWN_PLACEHOLDERS } from './render-template';

const languages: TemplateLanguage[] = ['AR', 'EN'];

function flatten(paragraphs: TemplateParagraph[]): string {
  return paragraphs
    .map((paragraph) => paragraph.map((line) => (Array.isArray(line) ? line.join('\n') : line)).join('\n'))
    .join('\n');
}

function forEachTemplate(visit: (text: string, paragraphs: TemplateParagraph[]) => void): void {
  for (const type of MESSAGE_TYPES) {
    for (const language of languages) {
      for (const tone of MESSAGE_TONES) {
        const paragraphs = buildTemplateParagraphs(type, language, tone);
        visit(flatten(paragraphs), paragraphs);
      }
    }
  }
}

describe('message templates', () => {
  it('covers all six types in both languages and all four tones', () => {
    expect(MESSAGE_TYPES).toHaveLength(6);
    forEachTemplate((_text, paragraphs) => {
      expect(paragraphs.length).toBeGreaterThan(0);
    });
  });

  it('uses only known placeholders', () => {
    forEachTemplate((text) => {
      for (const [, token] of text.matchAll(/\[([A-Za-z][A-Za-z0-9_]*)\]/g)) {
        expect(KNOWN_PLACEHOLDERS).toContain(token);
      }
    });
  });

  it('never contains escalation or threatening language', () => {
    forEachTemplate((text) => {
      const lowered = text.toLowerCase();
      for (const phrase of FORBIDDEN_ESCALATION_PHRASES) {
        expect(lowered).not.toContain(phrase.toLowerCase());
      }
    });
  });

  it('opens warmly rather than robotically', () => {
    forEachTemplate((text) => {
      expect(text).not.toContain('Dear [customerName], this is [businessName].');
      expect(text).not.toContain('معك [businessName]');
    });

    expect(buildTemplateParagraphs('DEBT_REMINDER', 'EN', 'polite')[0]).toEqual([
      'Hello [customerName],',
      'We hope you are well.',
    ]);
    expect(buildTemplateParagraphs('DEBT_REMINDER', 'AR', 'polite')[0]).toEqual([
      'مرحباً [customerName]،',
      'نتمنى أن تكونوا بخير.',
    ]);
  });

  it('signs off with the business name on its own line', () => {
    const paragraphs = buildTemplateParagraphs('DEBT_REMINDER', 'EN', 'polite');
    expect(paragraphs[paragraphs.length - 1]).toEqual(['Thank you,', '[businessName]']);
  });

  it('keeps the firm tone direct but not threatening', () => {
    const firm = flatten(buildTemplateParagraphs('DEBT_REMINDER', 'AR', 'firm'));
    expect(firm).toContain('نرجو تسديد المبلغ في أقرب وقت ممكن.');
  });

  it('gives the short tone compact labelled facts and no pleasantries', () => {
    const short = flatten(buildTemplateParagraphs('DEBT_REMINDER', 'EN', 'short'));
    expect(short).toContain('Outstanding amount on your account: [amount].');
    expect(short).not.toContain('We hope you are well.');
    expect(short).not.toContain('Thank you,');
  });

  it('offers alternatives so a missing date degrades instead of inventing one', () => {
    const facts = buildTemplateParagraphs('DEBT_REMINDER', 'EN', 'polite')[1];
    const amountLine = facts[0];
    const dateLine = facts[1];

    expect(Array.isArray(amountLine)).toBe(true);
    expect(amountLine[1]).not.toContain('[dateAdded]');
    expect(Array.isArray(dateLine)).toBe(true);
    expect((dateLine as string[]).length).toBe(3);
  });

  it('lets every template carry an optional custom note paragraph', () => {
    forEachTemplate((text) => {
      expect(text).toContain('[customNote]');
    });
  });

  it('renders a custom message as the employee text alone', () => {
    expect(buildTemplateParagraphs('CUSTOM', 'AR', 'polite')).toEqual([['[customNote]']]);
  });

  it('names the business HomeConnect for v1', () => {
    expect(BUSINESS_NAME).toBe('HomeConnect');
  });
});
