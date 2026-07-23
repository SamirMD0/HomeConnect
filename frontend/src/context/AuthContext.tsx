import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api, setAccessToken } from '../services/api';

interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: User, token: string) => void;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 15 minutes max inactivity
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; 

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Inactivity logout timer reference
  let inactivityTimer: ReturnType<typeof setTimeout>;

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      // Auto-logout user after 15 minutes of inactivity
      handleLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  const handleLogin = (userData: User, token: string) => {
    setUser(userData);
    setToken(token);
    setAccessToken(token);
    resetInactivityTimer();
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore errors on logout (they're probably already logged out)
    } finally {
      setUser(null);
      setToken(null);
      setAccessToken(null);
      if (inactivityTimer) clearTimeout(inactivityTimer);
    }
  };

  const updateUser = (userData: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...userData } : null);
  };

  // Check current session on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        // We try to hit the /me endpoint. If we have no token, or it's expired,
        // the API interceptor will automatically attempt to use the refresh token
        // cookie to get a new token.
        const response = await api.get('/auth/me');
        if (response.data.success) {
          setUser(response.data.data);
          // Wait, if it refreshed successfully, the interceptor fired a 'token_refreshed' event
          // but we still need the accessToken in our state. The interceptor doesn't return it
          // directly here. However, our next API calls will work.
        }
      } catch (error) {
        // Not authenticated
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();

    // Listen for custom token refresh events from the API interceptor
    const handleTokenRefreshed = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setToken(customEvent.detail);
    };

    // Listen for forced logouts from the API interceptor
    const handleForcedLogout = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('token_refreshed', handleTokenRefreshed);
    window.addEventListener('auth_logout', handleForcedLogout);

    // Setup user activity listeners for the inactivity timeout
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer);
    });

    return () => {
      window.removeEventListener('token_refreshed', handleTokenRefreshed);
      window.removeEventListener('auth_logout', handleForcedLogout);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
      });
      if (inactivityTimer) clearTimeout(inactivityTimer);
    };
  }, [resetInactivityTimer]);

  const value = {
    user,
    accessToken,
    isAuthenticated: !!user,
    isLoading,
    login: handleLogin,
    logout: handleLogout,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
