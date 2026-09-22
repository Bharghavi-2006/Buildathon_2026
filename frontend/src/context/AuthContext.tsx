import React, { createContext, useContext, useEffect, useState } from 'react';
import { CurrentUser } from '../types';
import { authApi } from '../api/auth';
import { getActiveUserEmail, setActiveUserEmail } from '../api/client';

interface AuthContextType {
  currentUser: CurrentUser | null;
  activeEmail: string;
  role: 'MANAGER' | 'REPRESENTATIVE' | null;
  loading: boolean;
  error: string | null;
  switchUser: (email: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeEmail, setActiveEmail] = useState<string>(getActiveUserEmail());
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIdentity = async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      setActiveUserEmail(email);
      setActiveEmail(email);
      const data = await authApi.getMe();
      // A misconfigured API base URL (or a backend that's down) can still resolve to a
      // 200 response — e.g. the SPA's own index.html — that isn't shaped like a identity
      // payload. Treat anything without a user/role as a failed identity fetch rather than
      // trusting it, so the rest of the app never has to guard against a malformed shape.
      if (!data || !data.user || !data.role) {
        throw new Error('Received an unexpected response while loading your identity.');
      }
      setCurrentUser(data);
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate user');
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // No stored identity means nobody has logged in yet -- land on /login instead of
    // silently authenticating, rather than calling /me with an empty header.
    if (activeEmail) fetchIdentity(activeEmail);
    else setLoading(false);
  }, []);

  const switchUser = async (email: string) => {
    await fetchIdentity(email);
  };

  const refreshAuth = async () => {
    await fetchIdentity(activeEmail);
  };

  const login = async (email: string, password: string) => {
    await authApi.demoLogin(email, password);
    await fetchIdentity(email.trim().toLowerCase());
  };

  const logout = () => {
    setActiveUserEmail('');
    setActiveEmail('');
    setCurrentUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        activeEmail,
        role: currentUser?.role || null,
        loading,
        error,
        switchUser,
        refreshAuth,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
