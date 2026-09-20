import React, { createContext, useContext, useEffect, useState } from 'react';
import { CurrentUser } from '../types';
import { authApi } from '../api/auth';
import { getActiveUserEmail, setActiveUserEmail } from '../api/client';

export interface DemoAccount {
  email: string;
  name: string;
  role: 'MANAGER' | 'REPRESENTATIVE';
  desc: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'manager@demo.local', name: 'Demo Manager', role: 'MANAGER', desc: 'Campaigns, ICP, settings & team oversight' },
  { email: 'aisha@demo.local', name: 'Aisha Rep', role: 'REPRESENTATIVE', desc: 'US / SaaS SDR (Campaigns A & C assigned)' },
  { email: 'vikram@demo.local', name: 'Vikram Rep', role: 'REPRESENTATIVE', desc: 'India / BFSI SDR (Campaign B assigned)' },
];

interface AuthContextType {
  currentUser: CurrentUser | null;
  activeEmail: string;
  role: 'MANAGER' | 'REPRESENTATIVE' | null;
  loading: boolean;
  error: string | null;
  switchUser: (email: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
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
      setCurrentUser(data);
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate user');
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdentity(activeEmail);
  }, []);

  const switchUser = async (email: string) => {
    await fetchIdentity(email);
  };

  const refreshAuth = async () => {
    await fetchIdentity(activeEmail);
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
