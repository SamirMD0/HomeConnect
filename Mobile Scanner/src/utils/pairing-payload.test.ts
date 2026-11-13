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

  it('reads the other PC addresses from the Scanner Hub QR', () => {
    expect(
      parsePairingPayload('http://192.168.0.178:3011/mobile-scanner?alt=172.17.208.1,10.0.0.4')
    ).toEqual({ host: '192.168.0.178', port: 3011, alternates: ['172.17.208.1', '10.0.0.4'] });
    expect(parsePairingPayload('hc://pair?h=192.168.1.20&p=3011&alt=10.0.0.5')).toEqual({
      host: '192.168.1.20',
      port: 3011,
      alternates: ['10.0.0.5'],
    });
  });

  it('drops broken, repeated and duplicate-of-main alternates', () => {
    expect(
      parsePairingPayload('http://192.168.0.178:3011/?alt=nope,192.168.0.178,10.0.0.4,10.0.0.4,')
    ).toEqual({ host: '192.168.0.178', port: 3011, alternates: ['10.0.0.4'] });
    expect(parsePairingPayload('http://192.168.0.178:3011/mobile-scanner?alt=')).toEqual({
      host: '192.168.0.178',
      port: 3011,
    });
  });

  it('round-trips with buildPairingPayload', () => {
    const settings = { host: '192.168.1.20', port: 3011 };
    expect(parsePairingPayload(buildPairingPayload(settings))).toEqual(settings);
  });
});
