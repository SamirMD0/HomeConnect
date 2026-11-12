import type { PaymentReceipt, BusinessSettings } from '../api/sales-write-api';
import { paymentReceiptHtml } from './receipt-html';
export interface ReceiptExport {
  isAvailableAsync(): Promise<boolean>;
  printToFileAsync(options: {
    html: string;
    width: number;
    height: number;
  }): Promise<{ uri: string }>;
  shareAsync(
    uri: string,
    options: { mimeType: string; UTI: string; dialogTitle: string }
  ): Promise<void>;
}
export async function exportPaymentReceipt(
  receipt: PaymentReceipt,
  business: BusinessSettings,
  native: ReceiptExport
) {
  if (!(await native.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  const { uri } = await native.printToFileAsync({
    html: paymentReceiptHtml(receipt, business),
    width: 595,
    height: 842,
  });
  await native.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: '.pdf',
    dialogTitle: 'Share payment receipt',
  });
}
