import axios from 'axios';

// Base API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

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

    return Promise.reject(error);
  }
);
