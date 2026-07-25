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

// Response interceptor to handle 401s and auto-refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Attempt to refresh the token using the http-only cookie
        const response = await axios.post(`${API_URL}/auth/refresh`, {}, {
          withCredentials: true 
        });

        const newAccessToken = response.data.data.accessToken;
        
        // Update the access token
        setAccessToken(newAccessToken);
        
        // Dispatch a custom event so the AuthContext knows the token was refreshed
        window.dispatchEvent(new CustomEvent('token_refreshed', { detail: newAccessToken }));

        // Retry the original request with the new token
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed (token expired or missing). We must log out.
        setAccessToken(null);
        window.dispatchEvent(new Event('auth_logout'));
        return Promise.reject(refreshError);
      }
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
