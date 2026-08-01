import axios from 'axios';


// Base API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api/v1';

// Create Axios instance
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for sending/receiving HTTP-only cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Variable to hold the current access token
let currentAccessToken: string | null = null;
let refreshRequest: Promise<string | null> | null = null;

export const setAccessToken = (token: string | null) => {
  currentAccessToken = token;
};

// Request interceptor to attach access token
api.interceptors.request.use(
  (config) => {
    if (currentAccessToken) {
      config.headers['Authorization'] = `Bearer ${currentAccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Exchanges the http-only refresh cookie for a new access token.
 * Uses a bare axios call so it never re-enters the interceptor below.
 * Returns null when there is no usable session — callers treat that as
 * "signed out", not as an error worth reporting.
 */
export const refreshAccessToken = (): Promise<string | null> => {
  if (refreshRequest) return refreshRequest;

  refreshRequest = (async () => {
    try {
      const response = await axios.post(`${API_URL}/auth/refresh`, {}, {
        withCredentials: true,
      });
      const newAccessToken: string | null = response.data?.data?.accessToken ?? null;
      if (!newAccessToken) return null;

      setAccessToken(newAccessToken);
      window.dispatchEvent(new CustomEvent('token_refreshed', { detail: newAccessToken }));
      return newAccessToken;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshRequest = null;
  });

  return refreshRequest;
};

// Requests that must never trigger a refresh attempt: a rejected login is a
// credential problem, and the refresh call itself cannot refresh itself.
const skipsRefresh = (url?: string) =>
  Boolean(url && (url.includes('/auth/login') || url.includes('/auth/refresh')));

// Response interceptor to handle 401s and auto-refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't retried yet
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !skipsRefresh(originalRequest.url)
    ) {
      originalRequest._retry = true;

      const newAccessToken = await refreshAccessToken();

      if (!newAccessToken) {
        // Refresh failed (token expired or missing). We must log out.
        setAccessToken(null);
        window.dispatchEvent(new Event('auth_logout'));
        return Promise.reject(error);
      }

      // Retry the original request with the new token
      originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    }

    // Log the API failure securely before rejecting
    try {
      const isExpected401 = error.response?.status === 401 && 
        (originalRequest.url?.includes('/auth/me') || originalRequest.url?.includes('/auth/login'));
      const isReportEndpoint = originalRequest.url?.includes('/admin/diagnostics/report-error');

      if (!isExpected401 && !isReportEndpoint && currentAccessToken) {
        // Use a generic axios instance to avoid infinite interceptor loops if report fails
        const endpoint = originalRequest.url;
        const status = error.response?.status;
        const errorCode = error.response?.data?.error?.code || 'UNKNOWN_API_ERROR';
        const message = `API Call Failed: ${originalRequest.method?.toUpperCase()} ${endpoint}`;

        const reportData = {
          route: window.location.pathname + window.location.hash,
          message: `${message} (Status: ${status})`,
          stack: `Backend Code: ${errorCode}\nEndpoint: ${endpoint}`,
          timestamp: new Date().toISOString(),
          errorCode: 'API_FAILURE'
        };

        // Attach auth token if available, but bypass main `api` interceptors
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (currentAccessToken) {
          headers['Authorization'] = `Bearer ${currentAccessToken}`;
        }
        
        axios.post(`${API_URL}/admin/diagnostics/report-error`, reportData, {
          headers,
          withCredentials: true
        }).catch(() => {
          // Silently ignore report failure to prevent feedback loops
        });
      }
    } catch (e) {
      // Ignore errors in error reporter
    }

    return Promise.reject(error);
  }
);
