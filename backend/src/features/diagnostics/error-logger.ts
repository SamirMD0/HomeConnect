import fs from 'fs';
import path from 'path';

export interface ErrorLogRecord {
  timestamp: string;
  method?: string;
  path?: string;
  query?: Record<string, any>;
  status?: number;
  errorCode?: string;
  message: string;
  stack?: string;
  appVersion: string;
}

export const getLogFilePath = () => {
  const logDir = process.env.LOG_DIR || 
    (process.env.HOME_CONNECT_USER_DATA ? path.join(process.env.HOME_CONNECT_USER_DATA, 'logs') : path.join(process.cwd(), 'logs'));
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return path.join(logDir, 'errors.jsonl');
};

const REDACT_STRING = '[REDACTED]';

export const redactSecrets = (data: any): any => {
  if (typeof data === 'string') {
    let redacted = data;
    // Redact DATABASE_URL
    redacted = redacted.replace(/(DATABASE_URL=)[^\s"]+/gi, `$1${REDACT_STRING}`);
    // Redact postgres URLs (e.g. postgresql://user:password@host)
    redacted = redacted.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, `$1${REDACT_STRING}$2`);
    // Redact JWTs
    redacted = redacted.replace(/(eyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,})/g, REDACT_STRING);
    // Redact Cookies
    redacted = redacted.replace(/(cookie\s*:\s*)[^\n\r]+/gi, `$1${REDACT_STRING}`);
    // Redact Auth headers
    redacted = redacted.replace(/(authorization\s*:\s*(?:bearer\s+)?)[^\n\r]+/gi, `$1${REDACT_STRING}`);
    
    return redacted;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => redactSecrets(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    const redactedObj: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') || 
        lowerKey.includes('secret') || 
        lowerKey.includes('token') || 
        lowerKey === 'authorization' || 
        lowerKey === 'cookie' ||
        lowerKey === 'database_url'
      ) {
        redactedObj[key] = REDACT_STRING;
      } else {
        redactedObj[key] = redactSecrets(data[key]);
      }
    }
    return redactedObj;
  }
  
  return data;
};

export const logBackendError = (record: Partial<ErrorLogRecord>) => {
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_ERROR_LOG) {
    return;
  }

  const appVersion = process.env.npm_package_version || process.env.APP_VERSION || '1.0.0';
  
  const finalRecord: ErrorLogRecord = {
    timestamp: new Date().toISOString(),
    appVersion,
    message: record.message || 'Unknown error',
    ...record,
  };

  const redactedRecord = redactSecrets(finalRecord);
  
  try {
    const logFilePath = getLogFilePath();
    fs.appendFileSync(logFilePath, JSON.stringify(redactedRecord) + '\n');
  } catch (err) {
    // Fallback to console if file system write fails, avoiding throw in middleware
    console.error('Failed to write to error log:', err);
  }
};
