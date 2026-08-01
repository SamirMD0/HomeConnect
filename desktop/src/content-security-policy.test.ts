import { describe, expect, it, vi } from 'vitest';
import {
  applyContentSecurityPolicy,
  buildContentSecurityPolicy,
  resolveCspMode,
} from './content-security-policy';
import { BACKEND_ORIGIN } from './runtime-config';

function directive(policy: string, name: string): string {
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  if (!found) throw new Error(`Directive ${name} missing from policy: ${policy}`);
  return found;
}

describe('resolveCspMode', () => {
  it('only treats an explicit development NODE_ENV as development', () => {
    expect(resolveCspMode('development')).toBe('development');
    expect(resolveCspMode('production')).toBe('production');
    expect(resolveCspMode(undefined)).toBe('production');
    expect(resolveCspMode('test')).toBe('production');
  });
});

describe('production content security policy', () => {
  const policy = buildContentSecurityPolicy('production');

  it('never allows eval or inline script', () => {
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directive(policy, 'script-src')).toBe("script-src 'self'");
  });

  it('locks down the dangerous directives', () => {
    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('reaches only the local backend and never uses a wildcard', () => {
    expect(directive(policy, 'connect-src')).toBe(`connect-src 'self' ${BACKEND_ORIGIN}`);
    expect(policy).not.toContain('*');
    expect(policy).not.toContain('ws://');
    expect(policy).not.toContain('localhost');
  });

  it('allows inline style attributes only, plus local fonts', () => {
    expect(directive(policy, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(policy, 'font-src')).toBe("font-src 'self' data:");
  });

  it('allows remote product images without widening any other directive', () => {
    expect(directive(policy, 'img-src')).toBe("img-src 'self' data: blob: https: http:");
    // The relaxation must stay scoped to images.
    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'script-src')).toBe("script-src 'self'");
    expect(directive(policy, 'connect-src')).not.toContain('https:');
  });
});

describe('development content security policy', () => {
  const policy = buildContentSecurityPolicy('development');

  it('allows the inline react-refresh preamble but never eval', () => {
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('blocks eval in every mode, which is what clears the Electron warning', () => {
    expect(buildContentSecurityPolicy('development')).not.toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy('production')).not.toContain("'unsafe-eval'");
  });

  it('permits the HMR websocket on both loopback spellings', () => {
    const connectSrc = directive(policy, 'connect-src');
    expect(connectSrc).toContain('ws://127.0.0.1:3002');
    expect(connectSrc).toContain('ws://localhost:3002');
    expect(connectSrc).toContain(BACKEND_ORIGIN);
    expect(connectSrc).not.toContain('*');
  });

  it('keeps the same hard limits as production', () => {
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });
});

describe('applyContentSecurityPolicy', () => {
  function fakeSession() {
    const handlers: Array<(details: never, callback: never) => void> = [];
    return {
      handlers,
      webRequest: {
        onHeadersReceived: vi.fn((handler) => handlers.push(handler)),
      },
    };
  }

  function runHandler(
    responseHeaders: Record<string, string | string[]>,
    mode: 'development' | 'production' = 'production'
  ) {
    const session = fakeSession();
    applyContentSecurityPolicy(session as never, mode);

    const callback = vi.fn();
    (session.handlers[0] as unknown as (d: unknown, c: unknown) => void)(
      { responseHeaders },
      callback
    );

    return callback.mock.calls[0][0] as { responseHeaders: Record<string, string[]> };
  }

  it('sets the policy on every response', () => {
    const result = runHandler({ 'Content-Type': ['text/html'] });

    expect(result.responseHeaders['Content-Security-Policy']).toEqual([
      buildContentSecurityPolicy('production'),
    ]);
    expect(result.responseHeaders['Content-Type']).toEqual(['text/html']);
  });

  it('replaces an upstream policy so only one is in force', () => {
    const result = runHandler({
      'content-security-policy': ["default-src 'none'"],
      'Content-Security-Policy-Report-Only': ["default-src 'none'"],
    });

    expect(result.responseHeaders['content-security-policy']).toBeUndefined();
    expect(result.responseHeaders['Content-Security-Policy-Report-Only']).toBeUndefined();
    expect(result.responseHeaders['Content-Security-Policy']).toEqual([
      buildContentSecurityPolicy('production'),
    ]);
  });

  it('applies the development policy when running in development', () => {
    const result = runHandler({}, 'development');

    expect(result.responseHeaders['Content-Security-Policy']).toEqual([
      buildContentSecurityPolicy('development'),
    ]);
  });
});
