import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../services/api', () => ({ api: {} }));
vi.mock('../scanner/components/PairingQrCode', () => ({ PairingQrCode: () => null }));
import { DeviceSecurityStatus, deletePhonesMessage } from './PairedPhonesPanel';
describe('deleting revoked phones', () => {
  it('names one phone, counts several, and says waiting phones are kept', () => {
    expect(deletePhonesMessage([{ name: 'Counter', userName: 'Ali' }])).toContain('"Counter · Ali"');
    const many = deletePhonesMessage([{ name: 'A', userName: 'x' }, { name: 'B', userName: 'y' }]);
    expect(many).toContain('2 revoked phones');
    expect(many).toContain('cannot be undone');
    expect(many).toContain('still waiting for the PC is kept');
  });
});
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
