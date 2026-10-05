import { describe, expect, it } from 'vitest';
import { buildPairingPayload, parsePairingPayload } from './pairing-payload';

describe('parsePairingPayload', () => {
  it('accepts the canonical hc://pair payload', () => {
    expect(parsePairingPayload('hc://pair?h=192.168.1.20&p=3011')).toEqual({ host: '192.168.1.20', port: 3011 });
  });

  it('accepts the plain http backend URL', () => {
    expect(parsePairingPayload('http://192.168.1.20:3011')).toEqual({ host: '192.168.1.20', port: 3011 });
    expect(parsePairingPayload('http://192.168.1.20:3011/')).toEqual({ host: '192.168.1.20', port: 3011 });
  });

  it('trims surrounding whitespace', () => {
    expect(parsePairingPayload('  hc://pair?h=10.0.0.5&p=3011\n')).toEqual({ host: '10.0.0.5', port: 3011 });
  });

  it('rejects https and non-ipv4 hosts', () => {
    expect(parsePairingPayload('https://192.168.1.20:3011')).toBeNull();
    expect(parsePairingPayload('http://example.com:3011')).toBeNull();
  });

  it('rejects invalid ports and empty input', () => {
    expect(parsePairingPayload('hc://pair?h=192.168.1.20&p=0')).toBeNull();
    expect(parsePairingPayload('hc://pair?h=192.168.1.20&p=99999')).toBeNull();
    expect(parsePairingPayload('')).toBeNull();
    expect(parsePairingPayload('not a url')).toBeNull();
  });

  it('round-trips with buildPairingPayload', () => {
    const settings = { host: '192.168.1.20', port: 3011 };
    expect(parsePairingPayload(buildPairingPayload(settings))).toEqual(settings);
  });
});
