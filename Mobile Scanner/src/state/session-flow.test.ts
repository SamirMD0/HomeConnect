import { describe, expect, it } from 'vitest';
import { sessionFlowReducer } from './session-flow';

describe('scanner session state machine', () => {
  it('routes restored state to setup, pairing, or scanning', () => {
    expect(sessionFlowReducer('RESTORING', { type: 'RESTORED_WITHOUT_CONNECTION' })).toBe('SETUP');
    expect(sessionFlowReducer('RESTORING', { type: 'RESTORED_WITHOUT_TOKEN' })).toBe('PAIRING');
    expect(sessionFlowReducer('RESTORING', { type: 'SESSION_VALID' })).toBe('SCANNING');
  });

  it('returns an invalid or revoked scanner session to pairing', () => {
    expect(sessionFlowReducer('SCANNING', { type: 'SESSION_INVALID' })).toBe('PAIRING');
  });

  it('requires pairing after saving a connection and setup after changing it', () => {
    expect(sessionFlowReducer('SETUP', { type: 'CONNECTION_SAVED' })).toBe('PAIRING');
    expect(sessionFlowReducer('SCANNING', { type: 'CHANGE_CONNECTION' })).toBe('SETUP');
  });
});
