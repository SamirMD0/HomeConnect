import http from 'http';

export interface ReadinessOptions {
  signal?: AbortSignal;
  onProbe?: (elapsedMs: number, response: HttpProbeResult) => void;
  requireDatabase?: boolean;
}

export async function waitForUrl(url: string, timeoutMs: number, label: string, options: ReadinessOptions = {}) {
  const startedAt = Date.now();
  let lastResponse: HttpProbeResult | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    options.signal?.throwIfAborted();
    const response = await probeUrl(url, Math.min(1000, timeoutMs - (Date.now() - startedAt)), options.signal);
    options.signal?.throwIfAborted();
    options.onProbe?.(Date.now() - startedAt, response);
    if (response.reachable && response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
      if (!options.requireDatabase) return;
      try {
        const data = JSON.parse(response.body || '{}');
        if (data.success === true && data.data?.status === 'healthy' && data.data?.database === 'connected') return;
      } catch { /* An unrelated HTTP service is not the application backend. */ }
    }

    // Fast-fail for known fatal conditions
    if (response.reachable && response.statusCode === 503 && response.body?.includes('"DATABASE_UNAVAILABLE"')) {
      const statusDetails = ` Last response: HTTP 503 ${response.body}`;
      throw new Error(`${label} fast-failed during startup: ${url}.${statusDetails}`);
    }

    if (response.reachable) lastResponse = response;
    await delay(Math.min(500, Math.max(0, timeoutMs - (Date.now() - startedAt))), options.signal);
  }

  const statusDetails = lastResponse
    ? ` Last response: HTTP ${lastResponse.statusCode}${lastResponse.body ? ` ${lastResponse.body}` : ''}`
    : '';
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000}s: ${url}.${statusDetails}`);
}

export interface HttpProbeResult {
  reachable: boolean;
  statusCode?: number;
  body?: string;
}

export function probeUrl(url: string, timeoutMs = 1000, signal?: AbortSignal) {
  return new Promise<HttpProbeResult>((resolve) => {
    const request = http.get(url, { signal }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (body.length < 1000) body += chunk;
      });
      response.on('end', () => {
        resolve({
          reachable: true,
          statusCode: response.statusCode,
          body: summarizeBody(body),
        });
      });
    });

    request.setTimeout(Math.max(1, timeoutMs), () => {
      request.destroy();
      resolve({ reachable: false });
    });
    request.on('error', () => resolve({ reachable: false }));
  });
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function summarizeBody(body: string) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 500);
}
