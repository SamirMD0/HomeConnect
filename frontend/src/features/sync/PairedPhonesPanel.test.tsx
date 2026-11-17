import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../services/api', () => ({ api: {} }));
vi.mock('../scanner/components/PairingQrCode', () => ({ PairingQrCode: () => null }));
import { DeviceSecurityStatus } from './PairedPhonesPanel';
describe('paired phone security status', () => {
  it('shows the PIN state and reported last unlock, with defaults for older phones', () => {
    const before = renderToStaticMarkup(createElement(DeviceSecurityStatus, {}));
    expect(before).toContain('PIN set: No');
    expect(before).toContain('Last unlock: Never');
    const date = '2026-11-17T12:00:00Z';
    const after = renderToStaticMarkup(
      createElement(DeviceSecurityStatus, { pinSet: true, lastUnlockAt: date })
    );
    expect(after).toContain('PIN set: Yes');
    expect(after).toContain(new Date(date).toLocaleString());
  });
});
