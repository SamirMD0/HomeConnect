import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  createBrowserWindowOptions,
  DEFAULT_DEV_SERVER_URL,
  resolveProductionFrontendPath,
} from './window';
import { FRONTEND_ORIGIN } from './runtime-config';

describe('Electron window configuration', () => {
  it('uses the localhost development URL', () => {
    expect(DEFAULT_DEV_SERVER_URL).toBe('http://127.0.0.1:3002');
  });

  it('uses the production frontend origin from runtime config', () => {
    expect(FRONTEND_ORIGIN).toBe('http://127.0.0.1:3002');
  });

  it('enforces secure renderer options', () => {
    const options = createBrowserWindowOptions();

    expect(options.show).toBe(false);
    expect(options.webPreferences.nodeIntegration).toBe(false);
    expect(options.webPreferences.contextIsolation).toBe(true);
    expect(options.webPreferences.sandbox).toBe(true);
    expect(options.webPreferences.preload).toBe(path.join(__dirname, 'preload.js'));
    expect(options.webPreferences).not.toHaveProperty('webSecurity', false);
  });

  it('resolves the production frontend file path for fallback loading', () => {
    expect(resolveProductionFrontendPath()).toContain(path.join('frontend', 'dist', 'index.html'));
  });
});
