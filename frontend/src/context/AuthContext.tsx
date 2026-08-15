import React, { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { api, refreshAccessToken, setAccessToken } from '../services/api';

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

// One hour of genuine inactivity. A counter is often left open between
// customers, and signing the operator out mid-shift costs more than the small
// exposure of a session that outlives a short break.
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

/** What counts as the operator still being there. */
export const activityEvents = ['mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;
/** Capture so events that never reach the window still count; passive so none of this blocks scrolling. */
const ACTIVITY_LISTENER_OPTIONS = { capture: true, passive: true } as const;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Held in a ref, not a plain variable: a variable declared in the component body
  // is rebound on every render, so the id set by one render is invisible to the
  // next one and the timer can never be cleared reliably.
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    clearInactivityTimer();

    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore errors on logout (they're probably already logged out)
    } finally {
      setUser(null);
      setToken(null);
      setAccessToken(null);
    }
  }, [clearInactivityTimer]);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      // Auto-logout user after 15 minutes of inactivity
      handleLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer, handleLogout]);

  const handleLogin = (userData: User, token: string) => {
    setUser(userData);
    setToken(token);
    setAccessToken(token);
  };

  const updateUser = (userData: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...userData } : null);
  };

  // Check current session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // On a cold start there is no access token in memory, so calling /auth/me
        // first would always fail with a 401 before the interceptor recovered it.
        // The refresh cookie is the real session, so ask for a token from it first
        // and only then find out who the user is.
        const token = await refreshAccessToken();

        if (!token) {
          setUser(null);
          return;
        }

        setToken(token);

        const response = await api.get('/auth/me');
        if (response.data.success) {
          setUser(response.data.data);
        }
      } catch (error) {
        // Not authenticated
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

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

    // Started after the listeners are attached so a refresh cannot fire first.
    restoreSession();

    return () => {
      window.removeEventListener('token_refreshed', handleTokenRefreshed);
      window.removeEventListener('auth_logout', handleForcedLogout);
    };
    // Session restore runs once per mount; the setters it uses are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inactivity auto-logout, armed only while a session exists. Watching activity
  // on the login screen would otherwise schedule a logout for a user who is not
  // signed in, firing a pointless POST /auth/logout fifteen minutes later.
  const isLoggedIn = !!user;

  useEffect(() => {
    if (!isLoggedIn) {
      clearInactivityTimer();
      return;
    }

    resetInactivityTimer();

    // Captured, because a scroll inside a table or dialog does not bubble to
    // the window: reading a long ledger by wheel counted as being idle, and the
    // operator was signed out while actively using the screen. `wheel` covers
    // the same gesture over a pane that has nothing left to scroll.
    activityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer, ACTIVITY_LISTENER_OPTIONS);
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer, ACTIVITY_LISTENER_OPTIONS);
      });
      clearInactivityTimer();
    };
  }, [isLoggedIn, resetInactivityTimer, clearInactivityTimer]);

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
