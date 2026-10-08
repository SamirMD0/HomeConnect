import { describe, expect, it } from 'vitest';
import { sessionFlowReducer } from './session-flow';

describe('scanner session state machine (direct-API)', () => {
  it('routes restored state to setup, login, or scanning', () => {
    expect(sessionFlowReducer('RESTORING', { type: 'RESTORED_WITHOUT_CONNECTION' })).toBe('SETUP');
    expect(sessionFlowReducer('RESTORING', { type: 'RESTORED_WITHOUT_TOKEN' })).toBe('LOGIN');
    expect(sessionFlowReducer('RESTORING', { type: 'SESSION_VALID' })).toBe('SCANNING');
  });

  it('returns an invalid or revoked session to login', () => {
    expect(sessionFlowReducer('SCANNING', { type: 'SESSION_INVALID' })).toBe('LOGIN');
  });

  it('requires login after saving a connection and setup after changing it', () => {
    expect(sessionFlowReducer('SETUP', { type: 'CONNECTION_SAVED' })).toBe('LOGIN');
    expect(sessionFlowReducer('SCANNING', { type: 'CHANGE_CONNECTION' })).toBe('SETUP');
  });

  it('moves to scanning after a successful login', () => {
    expect(sessionFlowReducer('LOGIN', { type: 'LOGGED_IN' })).toBe('SCANNING');
  });
});
