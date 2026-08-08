import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanStatus, ScannerSession } from '../types/scanner.types';
import { MobileScannerPanel, MobileScannerPanelProps } from './MobileScannerPanel';
import { ScannerSessionsList, ScannerSessionsListProps } from './ScannerSessionsList';

const NOW = Date.parse('2026-08-07T14:20:00.000Z');

const status = (overrides: Partial<LanStatus> = {}): LanStatus => ({
  mode: 'AVAILABLE',
  host: '0.0.0.0',
  port: 3011,
  addresses: ['192.168.0.178', '172.17.208.1'],
  urls: ['http://192.168.0.178:3011/mobile-scanner', 'http://172.17.208.1:3011/mobile-scanner'],
  activeSessionCount: 1,
  error: null,
  firewall: {
    command: 'New-NetFirewallRule -DisplayName "HomeConnect Scanner" -Direction Inbound -LocalPort 3011 -Protocol TCP -Action Allow -Profile Private',
    note: 'Run once in an elevated PowerShell. The PC network must be set to Private, not Public.',
  },
  ...overrides,
});

const panel = (overrides: Partial<MobileScannerPanelProps> = {}) => renderToStaticMarkup(
  <MobileScannerPanel
    status={status()}
    isLoading={false}
    canManage
    pairingCode={null}
    isEnabling={false}
    isGeneratingCode={false}
    onEnable={() => undefined}
    onRequestDisable={() => undefined}
    onGenerateCode={() => undefined}
    now={NOW}
    {...overrides}
  />
);

describe('MobileScannerPanel', () => {
  it('shows the phone address and the hint about being on the same Wi-Fi', () => {
    const html = panel();
    expect(html).toContain('http://192.168.0.178:3011/mobile-scanner');
    expect(html).toContain('نفس الشبكة');
  });

  it('offers the other adapters without making them the default', () => {
    const html = panel();
    expect(html).toContain('172.17.208.1');
    expect(html).toContain('محولات شبكة أخرى');
  });

  it('hides the address entirely while the listener is down', () => {
    const html = panel({ status: status({ mode: 'DISABLED', urls: [], addresses: [] }) });
    expect(html).not.toContain('mobile-scanner');
    expect(html).toContain('ماسح الشبكة متوقف');
  });

  /**
   * The permission boundary the UI is responsible for: an employee must not be
   * offered controls the backend would refuse.
   */
  it('gives an employee no controls at all', () => {
    const html = panel({ canManage: false });
    expect(html).not.toContain('تشغيل');
    expect(html).not.toContain('إيقاف');
    expect(html).not.toContain('إنشاء رمز');
    expect(html).toContain('يمكن للمدير فقط');
  });

  it('still shows an employee the address, so they can use a paired phone', () => {
    expect(panel({ canManage: false })).toContain('http://192.168.0.178:3011/mobile-scanner');
  });

  it('offers turning on when off, and turning off when on', () => {
    expect(panel({ status: status({ mode: 'DISABLED', urls: [] }) })).toContain('تشغيل');
    expect(panel()).toContain('إيقاف');
  });

  it('renders a pairing code with its countdown', () => {
    const html = panel({ pairingCode: { code: '207568', expiresAt: '2026-08-07T14:24:30.000Z' } });
    expect(html).toContain('207568');
    expect(html).toContain('4:30');
  });

  it('says a lapsed code is expired instead of showing a dead clock', () => {
    const html = panel({ pairingCode: { code: '207568', expiresAt: '2026-08-07T14:19:00.000Z' } });
    expect(html).toContain('انتهى');
    expect(html).not.toContain('0:00');
  });

  it('surfaces a listener error as an alert', () => {
    const html = panel({ status: status({ mode: 'ERROR', urls: [], error: 'Port 3011 is already in use.' }) });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Port 3011 is already in use.');
  });

  it('always carries the firewall command, since a blocked port looks identical to a broken app', () => {
    expect(panel()).toContain('New-NetFirewallRule');
    expect(panel({ status: status({ mode: 'DISABLED', urls: [] }) })).toContain('New-NetFirewallRule');
  });
});

const sessions = (overrides: Partial<ScannerSessionsListProps> = {}) => renderToStaticMarkup(
  <ScannerSessionsList sessions={[]} canManage now={NOW} onRevoke={() => undefined} {...overrides} />
);

const session = (overrides: Partial<ScannerSession> = {}): ScannerSession => ({
  id: 'session-1',
  deviceLabel: 'OppoA58',
  createdAt: '2026-08-07T14:16:26.128Z',
  expiresAt: '2026-08-08T02:17:27.828Z',
  lastSeenAt: '2026-08-07T14:19:30.000Z',
  revokedAt: null,
  isActive: true,
  ...overrides,
});

describe('ScannerSessionsList', () => {
  it('shows an empty state when nothing is paired', () => {
    expect(sessions()).toContain('لا توجد هواتف مرتبطة');
  });

  it('lists a paired device with its last-seen time', () => {
    const html = sessions({ sessions: [session()] });
    expect(html).toContain('OppoA58');
    expect(html).toContain('just now');
    expect(html).toContain('Active');
  });

  it('keeps revoked devices visible so the operator can confirm the cut-off', () => {
    const html = sessions({ sessions: [session({ revokedAt: '2026-08-07T14:19:00.000Z', isActive: false })] });
    expect(html).toContain('OppoA58');
    expect(html).toContain('Revoked');
  });

  it('offers revoke to an admin but not to an employee', () => {
    expect(sessions({ sessions: [session()] })).toContain('إلغاء');
    expect(sessions({ sessions: [session()], canManage: false })).not.toContain('إلغاء');
  });

  it('offers no revoke for a session that is already inactive', () => {
    expect(sessions({ sessions: [session({ isActive: false })] })).not.toContain('إلغاء');
  });

  it('never renders anything token-shaped', () => {
    const html = sessions({ sessions: [session()] });
    expect(html).not.toContain('tokenHash');
    expect(html).not.toContain('token');
  });
});
