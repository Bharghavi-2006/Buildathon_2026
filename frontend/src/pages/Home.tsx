import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Dashboard } from './manager/Dashboard';

export const Home: React.FC = () => {
  const { role, loading } = useAuth();
  if (loading) return <div className="text-slate-400">Loading workspace…</div>;
  return role === 'REPRESENTATIVE' ? <Navigate to="/rep" replace /> : <Dashboard />;
};
