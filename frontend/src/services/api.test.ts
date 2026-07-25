import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { api, setAccessToken } from './api';

describe('API Interceptors', () => {
  let responseInterceptor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    setAccessToken(null);
    if (typeof window === 'undefined') {
      (globalThis as any).window = {
        location: { pathname: '/dashboard', hash: '' },
        dispatchEvent: vi.fn(),
      };
    } else {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/dashboard', hash: '' },
        writable: true
      });
    }

    // Extract the rejected handler from the response interceptor
    const handlers = (api.interceptors.response as any).handlers;
    responseInterceptor = handlers[handlers.length - 1].rejected;
  });

  it('filters out expected 401 on /auth/me from error reporting', async () => {
    const error = {
      response: { status: 401 },
      config: { url: 'http://localhost/auth/me' },
    };
    
    try {
      await responseInterceptor(error);
    } catch (e) {
      // Ignored
    }

    const postCalls = vi.mocked(axios.post).mock.calls;
    const reportCalls = postCalls.filter(call => call[0].includes('report-error'));
    expect(reportCalls.length).toBe(0);
  });

  it('reports unexpected API failures without exposing request bodies', async () => {
    const error = {
      response: { 
        status: 500,
        data: { error: { code: 'DATABASE_ERROR' } }
      },
      config: { 
        url: 'http://localhost/api/v1/customers', 
        method: 'post',
        data: JSON.stringify({ secretPayload: "hidden", password: "123" }), // Should NOT be logged
      },
    };

    try {
      await responseInterceptor(error);
    } catch (e) {
      // Ignored
    }

    const postCalls = vi.mocked(axios.post).mock.calls;
    const reportCalls = postCalls.filter(call => call[0].includes('report-error'));
    expect(reportCalls.length).toBe(1);
    
    const reportData = reportCalls[0][1] as any;
    expect(reportData.errorCode).toBe('API_FAILURE');
    expect(reportData.route).toBe('/dashboard');
    expect(reportData.message).toContain('Status: 500');
    expect(reportData.stack).toContain('DATABASE_ERROR');
    
    // Ensure payload isn't leaked
    const jsonString = JSON.stringify(reportData);
    expect(jsonString).not.toContain('secretPayload');
    expect(jsonString).not.toContain('password');
  });
});
