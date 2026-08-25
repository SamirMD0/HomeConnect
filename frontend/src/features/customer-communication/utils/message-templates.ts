import { MessageTone, MessageType, TemplateLanguage } from '../types/communication.types';

/**
 * Deterministic bilingual templates. No AI generation, no AI rewriting — the
 * same inputs always produce the same text, which is what makes the preview
 * trustworthy.
 *
 * A template is a list of **paragraphs**, each a list of lines, so the output
 * reads like something a person wrote rather than a form dump. Two rules in
 * `render-template.ts` do the work:
 *
 *  - a line whose known placeholder has no value drops entirely, and a
 *    paragraph left with no lines drops with it;
 *  - a line may instead be a list of **alternatives**, and the first one whose
 *    placeholders all resolve wins. That is how "The due date was X, and the
 *    amount is now Y late" degrades to "The due date is X" when nothing is
 *    overdue, and to nothing at all when there is no due date — without ever
 *    inventing a value.
 */

export const BUSINESS_NAME = 'HomeConnect';

/** Body cap for the wa.me deep link; above this the employee must copy instead. */
export const MAX_MESSAGE_LENGTH = 2000;

/** A single line, or alternatives tried in order until one renders. */
export type TemplateLine = string | string[];
export type TemplateParagraph = TemplateLine[];

export const MESSAGE_TYPES: MessageType[] = [
  'DEBT_REMINDER',
  'LATE_PAYMENT_REMINDER',
  'PAYMENT_CONFIRMATION',
  'INSTALLMENT_REMINDER',
  'SERVICE_UPDATE',
  'CUSTOM',
];

export const MESSAGE_TONES: MessageTone[] = ['polite', 'firm', 'short', 'friendly'];

export const messageTypeLabels: Record<MessageType, string> = {
  DEBT_REMINDER: 'Debt reminder / تذكير بالدين',
  LATE_PAYMENT_REMINDER: 'Late payment reminder / تذكير بتأخير الدفع',
  PAYMENT_CONFIRMATION: 'Payment confirmation / تأكيد الدفع',
  INSTALLMENT_REMINDER: 'Installment reminder / تذكير بالقسط',
  SERVICE_UPDATE: 'Service update / تحديث الصيانة',
  CUSTOM: 'Custom message / رسالة مخصصة',
};

export const messageToneLabels: Record<MessageTone, string> = {
  polite: 'Polite / مهذب',
  firm: 'Firm / حازم',
  short: 'Short / مختصر',
  friendly: 'Friendly / ودّي',
};

const greetings: Record<TemplateLanguage, Record<MessageTone, string[]>> = {
  EN: {
    polite: ['Hello [customerName],', 'We hope you are well.'],
    firm: ['Hello [customerName],'],
    short: ['Hello [customerName],'],
    friendly: ['Hi [customerName],', 'Hope you are doing well!'],
  },
  AR: {
    polite: ['مرحباً [customerName]،', 'نتمنى أن تكونوا بخير.'],
    firm: ['مرحباً [customerName]،'],
    short: ['مرحباً [customerName]،'],
    friendly: ['أهلاً [customerName]،', 'نتمنى تكونوا بخير!'],
  },
};

const closings: Record<TemplateLanguage, Record<MessageTone, string[]>> = {
  EN: {
    polite: ['Thank you,', '[businessName]'],
    firm: ['Thank you,', '[businessName]'],
    short: ['[businessName]'],
    friendly: ['Thank you!', '[businessName]'],
  },
  AR: {
    polite: ['شكراً لكم،', '[businessName]'],
    firm: ['شكراً لكم،', '[businessName]'],
    short: ['[businessName]'],
    friendly: ['شكراً كتير،', '[businessName]'],
  },
};

type ToneText = Record<MessageTone, string>;

/** The closing request. Firm is direct, never threatening. */
const settleAsk: Record<TemplateLanguage, ToneText> = {
  EN: {
    polite: 'Please let us know when you can arrange the payment.',
    firm: 'We would appreciate it if you could settle this amount as soon as possible.',
    short: 'Please let us know when you can pay.',
    friendly: 'Whenever it suits you, just let us know and we will arrange it together.',
  },
  AR: {
    polite: 'يرجى إعلامنا بموعد مناسب لترتيب الدفع.',
    firm: 'نرجو تسديد المبلغ في أقرب وقت ممكن.',
    short: 'يرجى إعلامنا بموعد الدفع.',
    friendly: 'متى ما تيسّر لكم، إعلمونا ومنرتّبها سوا.',
  },
};

const questionsAsk: Record<TemplateLanguage, ToneText> = {
  EN: {
    polite: 'If you have any questions, please let us know.',
    firm: 'If you have any questions, please let us know.',
    short: '',
    friendly: 'Any questions, just message us here!',
  },
  AR: {
    polite: 'لأي استفسار، نحن بخدمتكم.',
    firm: 'لأي استفسار، نحن بخدمتكم.',
    short: '',
    friendly: 'لأي سؤال، راسلونا هون!',
  },
};

const serviceAsk: Record<TemplateLanguage, ToneText> = {
  EN: {
    polite: 'Please contact us if you have any questions.',
    firm: 'Please contact us if you have any questions.',
    short: '',
    friendly: 'Message us any time if you need anything!',
  },
  AR: {
    polite: 'يرجى التواصل معنا لأي استفسار.',
    firm: 'يرجى التواصل معنا لأي استفسار.',
    short: '',
    friendly: 'راسلونا بأي وقت إذا بتحتاجوا شي!',
  },
};

interface TemplateShape {
  /**
   * The facts, as the lines of a single paragraph. `short` trades prose for
   * compact labelled lines that read well in a chat bubble.
   */
  facts: Record<TemplateLanguage, { full: TemplateParagraph; short: TemplateParagraph }>;
  ask: Record<TemplateLanguage, ToneText>;
}

const templates: Record<Exclude<MessageType, 'CUSTOM'>, TemplateShape> = {
  DEBT_REMINDER: {
    facts: {
      EN: {
        full: [
          [
            'This is a friendly reminder that there is an outstanding amount of [amount] on your account from [dateAdded].',
            'This is a friendly reminder that there is an outstanding amount of [amount] on your account.',
          ],
          [
            'The due date was [dueDate], and the amount is now [daysLateText] late.',
            'The due date is [dueDate].',
            'The amount is now [daysLateText] late.',
          ],
        ],
        short: [
          ['Outstanding amount on your account: [amount].'],
          ['Due date: [dueDate].'],
          ['Late by: [daysLateText].'],
        ],
      },
      AR: {
        full: [
          [
            'نذكّركم بوجود مبلغ مستحق بقيمة [amount] على حسابكم من تاريخ [dateAdded].',
            'نذكّركم بوجود مبلغ مستحق بقيمة [amount] على حسابكم.',
          ],
          [
            'وكان تاريخ الاستحقاق [dueDate]، والمبلغ متأخر منذ [daysLateText].',
            'تاريخ الاستحقاق هو [dueDate].',
            'والمبلغ متأخر منذ [daysLateText].',
          ],
        ],
        short: [
          ['المبلغ المستحق على حسابكم: [amount].'],
          ['تاريخ الاستحقاق: [dueDate].'],
          ['متأخر منذ: [daysLateText].'],
        ],
      },
    },
    ask: settleAsk,
  },

  LATE_PAYMENT_REMINDER: {
    facts: {
      EN: {
        full: [
          ['We noticed that an amount of [amount] on your account is still open.'],
          [
            'It was due on [dueDate] and is now [daysLateText] late.',
            'It is now [daysLateText] late.',
            'It was due on [dueDate].',
          ],
        ],
        short: [
          ['Amount still open: [amount].'],
          ['Late by: [daysLateText].'],
          ['Due date was: [dueDate].'],
        ],
      },
      AR: {
        full: [
          ['لاحظنا أن مبلغ [amount] على حسابكم ما زال غير مسدد.'],
          [
            'كان تاريخ استحقاقه [dueDate]، وهو الآن متأخر منذ [daysLateText].',
            'وهو الآن متأخر منذ [daysLateText].',
            'كان تاريخ استحقاقه [dueDate].',
          ],
        ],
        short: [
          ['المبلغ غير المسدد: [amount].'],
          ['متأخر منذ: [daysLateText].'],
          ['تاريخ الاستحقاق كان: [dueDate].'],
        ],
      },
    },
    ask: settleAsk,
  },

  PAYMENT_CONFIRMATION: {
    facts: {
      EN: {
        full: [
          [
            'Thank you — we have received your payment of [amount] on [paymentDate].',
            'Thank you — we have received your payment of [amount].',
          ],
          ['Your remaining balance is now [remainingAmount].'],
        ],
        short: [
          ['Payment received: [amount].'],
          ['Date: [paymentDate].'],
          ['Remaining balance: [remainingAmount].'],
        ],
      },
      AR: {
        full: [
          [
            'شكراً لكم، لقد استلمنا دفعتكم بقيمة [amount] بتاريخ [paymentDate].',
            'شكراً لكم، لقد استلمنا دفعتكم بقيمة [amount].',
          ],
          ['المبلغ المتبقي على حسابكم الآن [remainingAmount].'],
        ],
        short: [
          ['تم استلام دفعة: [amount].'],
          ['التاريخ: [paymentDate].'],
          ['المبلغ المتبقي: [remainingAmount].'],
        ],
      },
    },
    ask: questionsAsk,
  },

  INSTALLMENT_REMINDER: {
    facts: {
      EN: {
        full: [
          [
            'This is a reminder about your installment of [amount], due on [dueDate].',
            'This is a reminder about your installment of [amount].',
          ],
          ['It is now [daysLateText] late.'],
          ['The remaining balance on your plan is [remainingAmount].'],
        ],
        short: [
          ['Installment due: [amount].'],
          ['Due date: [dueDate].'],
          ['Late by: [daysLateText].'],
          ['Remaining on plan: [remainingAmount].'],
        ],
      },
      AR: {
        full: [
          [
            'نذكّركم بقسطكم بقيمة [amount] المستحق بتاريخ [dueDate].',
            'نذكّركم بقسطكم بقيمة [amount].',
          ],
          ['وهو متأخر منذ [daysLateText].'],
          ['المبلغ المتبقي على خطتكم [remainingAmount].'],
        ],
        short: [
          ['القسط المستحق: [amount].'],
          ['تاريخ الاستحقاق: [dueDate].'],
          ['متأخر منذ: [daysLateText].'],
          ['المتبقي على الخطة: [remainingAmount].'],
        ],
      },
    },
    ask: settleAsk,
  },

  SERVICE_UPDATE: {
    facts: {
      EN: {
        full: [
          ['Here is an update on your service request.'],
          ['Current status: [serviceStatus].'],
        ],
        short: [['Service update — current status: [serviceStatus].']],
      },
      AR: {
        full: [
          ['نوافيكم بآخر تحديث لطلب الصيانة الخاص بكم.'],
          ['الحالة الحالية: [serviceStatus].'],
        ],
        short: [['تحديث الصيانة — الحالة الحالية: [serviceStatus].']],
      },
    },
    ask: serviceAsk,
  },
};

/**
 * Assembles the paragraphs for one language block. Placeholders are still
 * unresolved here — substitution happens in `render-template.ts`.
 *
 * `CUSTOM` returns the bare note placeholder: the employee's own text *is* the
 * template, expanded by `renderMessage` so `[amount]` still resolves inside it.
 */
export function buildTemplateParagraphs(
  type: MessageType,
  language: TemplateLanguage,
  tone: MessageTone
): TemplateParagraph[] {
  if (type === 'CUSTOM') return [['[customNote]']];

  const shape = templates[type];
  const ask = shape.ask[language][tone];

  const paragraphs: TemplateParagraph[] = [
    greetings[language][tone],
    tone === 'short' ? shape.facts[language].short : shape.facts[language].full,
    // The employee's own sentence gets its own paragraph, and drops when empty.
    ['[customNote]'],
  ];

  if (ask) paragraphs.push([ask]);
  paragraphs.push(closings[language][tone]);

  return paragraphs;
}

/**
 * Escalation language is out of scope: `firm` is firm, not threatening.
 * `message-templates.test.ts` asserts no template ever contains one of these.
 */
export const FORBIDDEN_ESCALATION_PHRASES = [
  'pay immediately',
  'or else',
  'legal action',
  'final warning',
  'lawyer',
  'court',
  'police',
  'محكمة',
  'محامي',
  'إنذار أخير',
  'إجراءات قانونية',
  'ادفع فوراً',
];
