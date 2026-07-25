import http from 'http';

export async function waitForUrl(url: string, timeoutMs: number, label: string) {
  const startedAt = Date.now();
  let lastResponse: HttpProbeResult | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    const response = await probeUrl(url);
    if (response.reachable && response.statusCode && response.statusCode >= 200 && response.statusCode < 500) return;
    if (response.reachable) lastResponse = response;
    await delay(500);
  }

  const statusDetails = lastResponse
    ? ` Last response: HTTP ${lastResponse.statusCode}${lastResponse.body ? ` ${lastResponse.body}` : ''}`
    : '';
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000}s: ${url}.${statusDetails}`);
}

interface HttpProbeResult {
  reachable: boolean;
  statusCode?: number;
  body?: string;
}

export function probeUrl(url: string) {
  return new Promise<HttpProbeResult>((resolve) => {
    const request = http.get(url, (response) => {
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

    request.setTimeout(1000, () => {
      request.destroy();
      resolve({ reachable: false });
    });
    request.on('error', () => resolve({ reachable: false }));
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeBody(body: string) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 500);
}
