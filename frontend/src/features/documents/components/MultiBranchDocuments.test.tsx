import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { business, order, receipt, statement, salesReturn } from './branch-document.test-fixtures';
import { SalesInvoiceDocument } from './SalesInvoiceDocument';
import { PaymentReceiptDocument } from './PaymentReceiptDocument';
import { CustomerStatementDocument } from './CustomerStatementDocument';
import { SalesReturnDocument } from './SalesReturnDocument';
import { DocumentBranchLine } from './DocumentBranchLine';
const metadata = { branch: { name: 'Main branch', address: 'Beirut', phone: '01 234 567' }, showBranchLine: true };

describe('multi-branch printed documents', () => {
  it('prints the record branch on the sales invoice', () => {
    expect(renderToStaticMarkup(<SalesInvoiceDocument business={business} order={{ ...order, ...metadata }} />)).toMatchSnapshot();
  });
  it('prints the record branch on the payment receipt', () => {
    expect(renderToStaticMarkup(<PaymentReceiptDocument business={business} receipt={{ ...receipt, ...metadata }} />)).toMatchSnapshot();
  });
  it('prints the record branch on the sales return', () => {
    expect(renderToStaticMarkup(<SalesReturnDocument business={business} salesReturn={{ ...salesReturn, ...metadata }} />)).toMatchSnapshot();
  });
  it('prints the customer branch on the statement', () => {
    expect(renderToStaticMarkup(<CustomerStatementDocument business={business} statement={{ ...statement, ...metadata }} />)).toMatchSnapshot();
  });
  it('omits the branch for a single active branch even when metadata is supplied', () => {
    expect(renderToStaticMarkup(<DocumentBranchLine data={{ ...metadata, showBranchLine: false }} />)).toBe('');
    expect(renderToStaticMarkup(<SalesInvoiceDocument business={business} order={{ ...order, ...metadata, showBranchLine: false }} />)).toBe(renderToStaticMarkup(<SalesInvoiceDocument business={business} order={order} />));
  });
  it('skips empty address and phone without separators', () => {
    expect(renderToStaticMarkup(<DocumentBranchLine data={{ showBranchLine: true, branch: { name: 'Second', address: ' ', phone: null } }} />)).toContain('Branch: Second</p>');
  });
});
