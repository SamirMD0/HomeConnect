import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecentScan, ScanLookupResult } from '../types/scanner.types';
import { toRecentScan } from '../utils/scan-intent';
import { RecentScansList } from './RecentScansList';
import { ScanFeedback } from './ScanFeedback';

const found: ScanLookupResult = {
  status: 'FOUND',
  normalizedCode: '0012345678905',
  matchedBy: 'BARCODE',
  product: { id: 'product-1', name: 'مروحة سقف', model: 'CF-52', sku: 'HC-000001', barcode: '0012345678905', brand: 'Toshiba', isActive: true },
};

const render = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe('ScanFeedback', () => {
  it('renders the matched product without any price or stock field', () => {
    const html = render(<ScanFeedback result={found} isLooking={false} isError={false} />);
    expect(html).toContain('تم العثور على المنتج');
    expect(html).toContain('مروحة سقف');
    expect(html).toContain('HC-000001');
    for (const forbidden of ['250.00', 'Price', 'السعر', 'Stock', 'المخزون']) {
      expect(html).not.toContain(forbidden);
    }
  });

  it('says which code matched', () => {
    expect(render(<ScanFeedback result={found} isLooking={false} isError={false} />)).toContain('Matched by barcode');
    expect(render(<ScanFeedback result={{ ...found, matchedBy: 'SKU' }} isLooking={false} isError={false} />)).toContain('Matched by SKU');
  });

  it('warns when the code is also another product SKU', () => {
    const html = render(<ScanFeedback result={{ ...found, alsoMatchedSku: true }} isLooking={false} isError={false} />);
    expect(html).toContain('also another product SKU');
  });

  it('marks an archived product instead of hiding it', () => {
    const html = render(<ScanFeedback result={{ ...found, product: { ...found.product!, isActive: false } }} isLooking={false} isError={false} />);
    expect(html).toContain('منتج مؤرشف');
  });

  it('renders the not-found state with the scanned code', () => {
    const html = render(<ScanFeedback result={{ status: 'NOT_FOUND', normalizedCode: '9999999999999', matchedBy: null, product: null }} isLooking={false} isError={false} />);
    expect(html).toContain('لم يتم العثور على المنتج');
    expect(html).toContain('9999999999999');
  });

  it('separates an unreadable code from a code that simply matched nothing', () => {
    const html = render(<ScanFeedback result={{ status: 'INVALID_CODE', normalizedCode: null, matchedBy: null, product: null }} isLooking={false} isError={false} />);
    expect(html).toContain('رمز غير صالح');
    expect(html).not.toContain('لم يتم العثور على المنتج');
  });

  it('reports a failed lookup as an alert rather than a missing product', () => {
    const html = render(<ScanFeedback result={null} isLooking={false} isError />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('تعذر تنفيذ المسح');
  });

  it('renders nothing before the first scan', () => {
    expect(render(<ScanFeedback result={null} isLooking={false} isError={false} />)).toBe('');
  });
});

describe('RecentScansList', () => {
  const scans: RecentScan[] = [
    toRecentScan(found, '0012345678905', 'PC_SCANNER', new Date('2026-08-07T10:15:00.000Z')),
    toRecentScan({ status: 'NOT_FOUND', normalizedCode: '9999999999999', matchedBy: null, product: null }, '9999999999999', 'PHONE_SCANNER', new Date('2026-08-07T10:14:00.000Z')),
  ];

  it('lists each scan with its code, status, and source', () => {
    const html = render(<RecentScansList scans={scans} />);
    expect(html).toContain('0012345678905');
    expect(html).toContain('9999999999999');
    expect(html).toContain('تم العثور على المنتج');
    expect(html).toContain('لم يتم العثور على المنتج');
    expect(html).toContain('ماسح الجهاز');
    expect(html).toContain('ماسح الهاتف');
  });

  it('shows an empty state before anything is scanned', () => {
    const html = render(<RecentScansList scans={[]} />);
    expect(html).toContain('لا توجد عمليات مسح');
  });

  it('offers clearing only once there is something to clear', () => {
    expect(render(<RecentScansList scans={[]} onClear={() => undefined} />)).not.toContain('مسح السجل');
    expect(render(<RecentScansList scans={scans} onClear={() => undefined} />)).toContain('مسح السجل');
  });

  /** History is only useful if an earlier scan can be brought back up. */
  it('offers a preview action for a found scan', () => {
    const html = render(<RecentScansList scans={scans} onPreview={() => undefined} />);
    expect(html).toContain('Preview / معاينة');
    // One found scan and one not-found: only the found row may be previewed.
    expect(html.match(/Preview \/ معاينة/g)).toHaveLength(1);
  });

  it('offers no preview action for a scan that matched nothing', () => {
    const notFound = [scans[1]];
    expect(render(<RecentScansList scans={notFound} onPreview={() => undefined} />)).not.toContain('Preview / معاينة');
  });
});
