import { describe, expect, it } from 'vitest';
import {
  BILINGUAL_SEPARATOR,
  activeBodyLanguages,
  combineMessageBodies,
  renderLine,
  renderLines,
  renderMessage,
  renderParagraphs,
} from './render-template';
import { MessageValues } from '../types/communication.types';

const values: Partial<MessageValues> = {
  customerName: 'محمد سالم عمار',
  businessName: 'HomeConnect',
  amount: '$1,250.00',
  remainingAmount: '$400.00',
  dateAdded: '02/05/2026',
  dueDate: '02/06/2026',
  daysLate: '71',
  daysLateText: '71 يوم',
  paymentDate: '10/08/2026',
  serviceStatus: 'جاهز للاستلام',
  customNote: '',
};

describe('placeholder rendering', () => {
  it('substitutes every known placeholder', () => {
    expect(renderLine('You owe [amount] since [dateAdded].', values)).toBe(
      'You owe $1,250.00 since 02/05/2026.'
    );
  });

  it('leaves an unknown placeholder verbatim so a template typo is visible', () => {
    expect(renderLine('Total [amountt] due.', values)).toBe('Total [amountt] due.');
    expect(renderLine('Total [amountt] due.', values)).not.toContain('undefined');
  });

  it('drops the whole line when a known placeholder has no value', () => {
    expect(renderLine('تاريخ الاستحقاق هو [dueDate].', { dueDate: '' })).toBeNull();
    expect(renderLine('Note: [customNote]', values)).toBeNull();
  });

  it('drops a line that resolves to bare punctuation', () => {
    expect(renderLine('[customNote].', { customNote: '   ' })).toBeNull();
  });
});

describe('line alternatives', () => {
  const line = [
    'The due date was [dueDate], and the amount is now [daysLateText] late.',
    'The due date is [dueDate].',
    'The amount is now [daysLateText] late.',
  ];

  it('takes the first alternative when every value is present', () => {
    expect(renderLine(line, { dueDate: '02/06/2026', daysLateText: '71 days' })).toBe(
      'The due date was 02/06/2026, and the amount is now 71 days late.'
    );
  });

  it('falls back to the next alternative rather than inventing a value', () => {
    expect(renderLine(line, { dueDate: '02/06/2026', daysLateText: '' })).toBe(
      'The due date is 02/06/2026.'
    );
    expect(renderLine(line, { dueDate: '', daysLateText: '71 days' })).toBe(
      'The amount is now 71 days late.'
    );
  });

  it('drops the line when no alternative can render', () => {
    expect(renderLine(line, { dueDate: '', daysLateText: '' })).toBeNull();
  });
});

describe('paragraphs', () => {
  it('joins surviving lines with newlines and paragraphs with a blank line', () => {
    const rendered = renderParagraphs(
      [
        ['Hello [customerName],', 'We hope you are well.'],
        ['Amount: [amount].', 'Due: [dueDate].'],
      ],
      { customerName: 'Ali', amount: '$100.00', dueDate: '' }
    );

    expect(rendered).toBe('Hello Ali,\nWe hope you are well.\n\nAmount: $100.00.');
  });

  it('drops a paragraph whose lines all dropped, leaving no blank gap', () => {
    const rendered = renderParagraphs(
      [['Hello [customerName],'], ['[customNote]'], ['Thank you,']],
      { customerName: 'Ali', customNote: '' }
    );

    expect(rendered).toBe('Hello Ali,\n\nThank you,');
    expect(rendered).not.toMatch(/\n{3,}/);
  });

  it('never emits a dangling or punctuation-only line', () => {
    const rendered = renderLines(['Hello [customerName].', '[customNote]', 'Due [dueDate].'], {
      customerName: 'Ali',
      dueDate: '',
      customNote: '',
    });

    expect(rendered).toEqual(['Hello Ali.']);
  });
});

describe('renderMessage', () => {
  it('renders a warm, complete Arabic debt reminder', () => {
    const body = renderMessage({ type: 'DEBT_REMINDER', language: 'AR', tone: 'polite', values });

    expect(body).toContain('مرحباً محمد سالم عمار،');
    expect(body).toContain('نتمنى أن تكونوا بخير.');
    expect(body).toContain('نذكّركم بوجود مبلغ مستحق بقيمة $1,250.00 على حسابكم من تاريخ 02/05/2026.');
    expect(body).toContain('وكان تاريخ الاستحقاق 02/06/2026، والمبلغ متأخر منذ 71 يوم.');
    expect(body).toContain('يرجى إعلامنا بموعد مناسب لترتيب الدفع.');
    expect(body).toContain('شكراً لكم،\nHomeConnect');
    expect(body).not.toContain('undefined');
    expect(body).not.toMatch(/\[[a-zA-Z]+\]/);
    expect(body).not.toMatch(/\n{3,}/);
  });

  it('renders a warm, complete English debt reminder', () => {
    const body = renderMessage({
      type: 'DEBT_REMINDER',
      language: 'EN',
      tone: 'polite',
      values: { ...values, daysLateText: '71 days' },
    });

    expect(body).toContain('Hello محمد سالم عمار,');
    expect(body).toContain('We hope you are well.');
    expect(body).toContain(
      'This is a friendly reminder that there is an outstanding amount of $1,250.00 on your account from 02/05/2026.'
    );
    expect(body).toContain('The due date was 02/06/2026, and the amount is now 71 days late.');
    expect(body).toContain('Please let us know when you can arrange the payment.');
    expect(body).toContain('Thank you,\nHomeConnect');
    // The old robotic opener is gone.
    expect(body).not.toContain('Dear');
    expect(body).not.toContain('this is HomeConnect');
  });

  it('does not invent a date added or due date for a total-outstanding message', () => {
    const totalValues: Partial<MessageValues> = {
      customerName: 'Ali',
      businessName: 'HomeConnect',
      amount: '$1,850.00',
      dateAdded: '',
      dueDate: '',
      daysLate: '',
      daysLateText: '',
    };

    const body = renderMessage({
      type: 'DEBT_REMINDER',
      language: 'EN',
      tone: 'polite',
      values: totalValues,
    });

    expect(body).toContain(
      'This is a friendly reminder that there is an outstanding amount of $1,850.00 on your account.'
    );
    expect(body).not.toContain('from ');
    expect(body).not.toContain('due date');
    expect(body).not.toContain('The due date');
    expect(body).not.toContain('late');
    expect(body).not.toContain('undefined');
  });

  it('does not say "late" when nothing is overdue', () => {
    const body = renderMessage({
      type: 'LATE_PAYMENT_REMINDER',
      language: 'EN',
      tone: 'polite',
      values: { ...values, daysLate: '', daysLateText: '' },
    });

    expect(body).toContain('It was due on 02/06/2026.');
    expect(body).not.toContain('days late');
  });

  it('keeps the short tone genuinely short', () => {
    const short = renderMessage({ type: 'DEBT_REMINDER', language: 'EN', tone: 'short', values });
    const polite = renderMessage({ type: 'DEBT_REMINDER', language: 'EN', tone: 'polite', values });

    expect(short.length).toBeLessThan(polite.length);
    expect(short).toContain('Outstanding amount on your account: $1,250.00.');
    expect(short).not.toContain('We hope you are well.');
  });

  it('includes the custom note as its own paragraph when present', () => {
    const body = renderMessage({
      type: 'DEBT_REMINDER',
      language: 'EN',
      tone: 'polite',
      values: { ...values, customNote: 'We can split this over two payments if easier.' },
    });

    expect(body).toContain('\n\nWe can split this over two payments if easier.\n\n');
  });

  it('renders a custom message through the same pipeline, once', () => {
    const body = renderMessage({
      type: 'CUSTOM',
      language: 'AR',
      tone: 'polite',
      values: { ...values, customNote: 'الرصيد المتبقي [remainingAmount]' },
    });

    expect(body).toBe('الرصيد المتبقي $400.00');
  });

  it('returns an empty string when nothing survives the line rules', () => {
    expect(renderMessage({ type: 'CUSTOM', language: 'AR', tone: 'short', values: {} })).toBe('');
  });
});

describe('AR + EN body handling', () => {
  const bodies = { AR: 'مرحباً علي،', EN: 'Hello Ali,' };

  it('edits one block for AR and one for EN', () => {
    expect(activeBodyLanguages('DEBT_REMINDER', 'AR')).toEqual(['AR']);
    expect(activeBodyLanguages('DEBT_REMINDER', 'EN')).toEqual(['EN']);
  });

  it('edits two separate blocks for AR+EN', () => {
    expect(activeBodyLanguages('DEBT_REMINDER', 'AR_EN')).toEqual(['AR', 'EN']);
  });

  it('writes a custom message once whatever the language switch says', () => {
    expect(activeBodyLanguages('CUSTOM', 'AR_EN')).toEqual(['AR']);
  });

  it('sends only the selected block for a single language', () => {
    expect(combineMessageBodies('DEBT_REMINDER', 'AR', bodies)).toBe('مرحباً علي،');
    expect(combineMessageBodies('DEBT_REMINDER', 'EN', bodies)).toBe('Hello Ali,');
  });

  it('combines AR+EN as Arabic, separator, English', () => {
    expect(combineMessageBodies('DEBT_REMINDER', 'AR_EN', bodies)).toBe(
      `مرحباً علي،\n\n${BILINGUAL_SEPARATOR}\n\nHello Ali,`
    );
  });

  it('omits an empty block instead of leaving a stray separator', () => {
    expect(combineMessageBodies('DEBT_REMINDER', 'AR_EN', { AR: 'مرحباً علي،', EN: '  ' })).toBe(
      'مرحباً علي،'
    );
    expect(combineMessageBodies('DEBT_REMINDER', 'AR_EN', { AR: '', EN: '' })).toBe('');
  });
});
