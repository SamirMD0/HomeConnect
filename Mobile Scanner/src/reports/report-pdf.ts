import { cellFor, type ReportColumnSpec, type SummaryFigure } from '@shared/report-columns';

export interface ReportDocument {
  title: string;
  /** e.g. "This month · 01/11/2026 – 14/11/2026" or "November 2026". */
  period: string;
  branch: string;
  summary: SummaryFigure[];
  columns: ReportColumnSpec[];
  rows: Record<string, unknown>[];
  generatedAt: Date;
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TONE: Record<string, string> = { good: '#066F49', bad: '#B81B38', warn: '#8A4A0F', info: '#155AA3' };

/**
 * The report as a printable A4 landscape page: title, branch and period,
 * the summary figures, then the same table as on screen. Pure, so it is
 * tested without a phone; expo-print turns it into the PDF.
 */
export function buildReportHtml(doc: ReportDocument): string {
  const summary = doc.summary
    .map(
      (figure) =>
        `<div class="fig"><div class="lab">${escape(figure.label)}</div><div class="val">${escape(figure.text)}</div></div>`
    )
    .join('');
  const head = doc.columns
    .map((column) => `<th class="${column.numeric ? 'num' : ''}">${escape(column.label)}</th>`)
    .join('');
  const body = doc.rows
    .map((row) => {
      const cells = doc.columns
        .map((column) => {
          const cell = cellFor(column, row);
          const color = cell.tone ? ` style="color:${TONE[cell.tone]}"` : '';
          return `<td class="${column.numeric ? 'num' : ''}"${color}>${escape(cell.text)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const stamp = doc.generatedAt.toLocaleString('en-GB');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: "Plus Jakarta Sans", "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif; color: #1B2124; font-size: 10.5px; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A6FC9; padding-bottom: 8px; margin-bottom: 12px; }
h1 { font-size: 20px; margin: 0; }
.meta { color: #4D595E; font-size: 11px; text-align: right; line-height: 1.5; }
.brand { color: #1A6FC9; font-weight: 700; }
.figs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.fig { border: 1px solid #DCE7EC; border-radius: 8px; padding: 6px 10px; min-width: 120px; }
.lab { color: #66777F; font-size: 9.5px; }
.val { font-weight: 700; font-size: 13px; }
table { width: 100%; border-collapse: collapse; }
th { background: #EBF2F5; color: #3B464B; text-align: left; font-size: 9.5px; padding: 6px; border-bottom: 1px solid #C3D3DB; }
td { padding: 5px 6px; border-bottom: 1px solid #EBF2F5; vertical-align: top; }
tr:nth-child(even) td { background: #F7FAFC; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
footer { margin-top: 10px; color: #8FA3AD; font-size: 9px; }
</style></head><body>
<header><div><div class="brand">Home Connect</div><h1>${escape(doc.title)}</h1></div>
<div class="meta">${escape(doc.branch)}<br>${escape(doc.period)}<br>${doc.rows.length} rows</div></header>
${summary ? `<div class="figs">${summary}</div>` : ''}
${doc.columns.length ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` : ''}
<footer>Printed ${escape(stamp)} from the Home Connect phone app. Figures come from the shop PC.</footer>
</body></html>`;
}

/** Builds the PDF on the phone and opens the share sheet (WhatsApp, Drive, print). */
export async function exportReportPdf(doc: ReportDocument): Promise<void> {
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html: buildReportHtml(doc), width: 842, height: 595 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: doc.title,
  });
}
