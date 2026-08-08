import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocalStatusChips, LocalStatusChipsProps } from './LocalStatusChips';

const healthy: LocalStatusChipsProps = {
  backendConnected: true,
  database: 'CONNECTED',
  lanScanner: 'DISABLED',
  internetOnline: true,
};

const render = (props: Partial<LocalStatusChipsProps> = {}) =>
  renderToStaticMarkup(<LocalStatusChips {...healthy} {...props} />);

describe('LocalStatusChips', () => {
  it('renders every signal bilingually when all is well', () => {
    const html = render();
    expect(html).toContain('الخادم متصل');
    expect(html).toContain('قاعدة البيانات متصلة');
    expect(html).toContain('ماسح الشبكة متوقف');
    expect(html).toContain('الإنترنت متصل');
  });

  it('marks the backend disconnected', () => {
    expect(render({ backendConnected: false })).toContain('الخادم غير متصل');
  });

  it('distinguishes an unavailable database from an unknown one', () => {
    expect(render({ database: 'UNAVAILABLE' })).toContain('قاعدة البيانات غير متاحة');
    expect(render({ database: 'UNKNOWN' })).toContain('حالة قاعدة البيانات غير معروفة');
  });

  it('shows the LAN scanner as available once a listener reports one', () => {
    expect(render({ lanScanner: 'AVAILABLE' })).toContain('ماسح الشبكة متاح');
  });

  /**
   * The point of the whole status strip: a local ERP does not stop working
   * because the shop's internet did. Offline must read as informational, never
   * as a fault.
   */
  it('reports internet offline without colouring it as a fault', () => {
    const html = render({ internetOnline: false });
    expect(html).toContain('الإنترنت غير متصل');
    expect(html).toContain('النظام المحلي يعمل');
    expect(html).not.toContain('bg-red-500');
  });

  it('colours a real fault red but never the internet chip', () => {
    expect(render({ backendConnected: false })).toContain('bg-red-500');
    expect(render({ database: 'UNAVAILABLE' })).toContain('bg-red-500');
    expect(render({ internetOnline: false, database: 'CONNECTED', backendConnected: true })).not.toContain('bg-red-500');
  });

  it('announces itself as a status region', () => {
    expect(render()).toContain('role="status"');
  });
});
