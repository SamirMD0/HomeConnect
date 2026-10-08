/**
 * Phase 1 (direct-API) flow:
 *   RESTORING -> SETUP (no backend URL stored)
 *   RESTORING -> LOGIN (URL stored, no token)
 *   RESTORING -> SCANNING (URL + token stored)
 *   SETUP -> LOGIN after the operator saves a URL
 *   LOGIN -> SCANNING after successful /auth/login
 *   SCANNING -> LOGIN on 401 (session expired)
 *   any -> SETUP when the operator chooses "Change backend URL"
 */
export type AppPhase = 'RESTORING' | 'SETUP' | 'LOGIN' | 'SCANNING';

export type SessionFlowEvent =
  | { type: 'RESTORED_WITHOUT_CONNECTION' }
  | { type: 'RESTORED_WITHOUT_TOKEN' }
  | { type: 'SESSION_VALID' }
  | { type: 'SESSION_INVALID' }
  | { type: 'CONNECTION_SAVED' }
  | { type: 'LOGGED_IN' }
  | { type: 'CHANGE_CONNECTION' };

export function sessionFlowReducer(_phase: AppPhase, event: SessionFlowEvent): AppPhase {
  switch (event.type) {
    case 'RESTORED_WITHOUT_CONNECTION':
    case 'CHANGE_CONNECTION':
      return 'SETUP';
    case 'RESTORED_WITHOUT_TOKEN':
    case 'SESSION_INVALID':
    case 'CONNECTION_SAVED':
      return 'LOGIN';
    case 'SESSION_VALID':
    case 'LOGGED_IN':
      return 'SCANNING';
  }
}
