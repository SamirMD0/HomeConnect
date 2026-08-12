export type AppPhase = 'RESTORING' | 'SETUP' | 'PAIRING' | 'SCANNING';

export type SessionFlowEvent =
  | { type: 'RESTORED_WITHOUT_CONNECTION' }
  | { type: 'RESTORED_WITHOUT_TOKEN' }
  | { type: 'SESSION_VALID' }
  | { type: 'SESSION_INVALID' }
  | { type: 'CONNECTION_SAVED' }
  | { type: 'PAIRED' }
  | { type: 'CHANGE_CONNECTION' };

export function sessionFlowReducer(_phase: AppPhase, event: SessionFlowEvent): AppPhase {
  switch (event.type) {
    case 'RESTORED_WITHOUT_CONNECTION':
    case 'CHANGE_CONNECTION':
      return 'SETUP';
    case 'RESTORED_WITHOUT_TOKEN':
    case 'SESSION_INVALID':
    case 'CONNECTION_SAVED':
      return 'PAIRING';
    case 'SESSION_VALID':
    case 'PAIRED':
      return 'SCANNING';
  }
}
