import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const REP_PREFIX = '/rep';

// Demo auth gate: redirects to /login when no identity exists, then keeps managers out
// of the representative-only route tree and vice versa. Backend role checks
// (require_manager / current_identity) remain the real authorization boundary --
// this only prevents a signed-in user from landing on the wrong workspace's UI.
export const ProtectedRoute: React.FC = () => {
  const { currentUser, loading, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070811] flex items-center justify-center text-slate-400 text-sm">
        Loading your workspace…
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const onRepRoute = location.pathname.startsWith(REP_PREFIX);
  if (role === 'REPRESENTATIVE' && !onRepRoute) return <Navigate to="/rep" replace />;
  if (role === 'MANAGER' && onRepRoute) return <Navigate to="/" replace />;

  return <Outlet />;
};
