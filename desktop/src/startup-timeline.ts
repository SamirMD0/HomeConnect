import fs from 'fs';
import path from 'path';
import { redactLogChunk } from './backend-process';

/** One append-only file per attempt preserves the failed run when Retry succeeds. */
export function createStartupTimeline(userDataPath: string, publish: (message: string) => void) {
  const started = performance.now();
  const directory = path.join(userDataPath, 'logs');
  const file = path.join(directory, `startup-${Date.now()}.jsonl`);
  let writable = true;
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch {
    writable = false;
    publish('Startup log directory is unavailable; diagnostics remain visible here.');
  }
  return (event: string) => {
    const elapsedMs = Math.round(performance.now() - started);
    const message = redactLogChunk(event);
    if (writable) {
      try {
        fs.appendFileSync(
          file,
          JSON.stringify({ timestamp: new Date().toISOString(), elapsedMs, message }) + '\n'
        );
      } catch {
        writable = false;
        publish('Could not write startup log; diagnostics remain visible here.');
      }
    }
    publish(`[${(elapsedMs / 1000).toFixed(3)}s] ${message}`);
  };
}
