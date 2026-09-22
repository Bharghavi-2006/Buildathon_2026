import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ShieldCheck, LogIn, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { email: 'manager@demo.local', password: 'manager123', label: 'Manager' },
  { email: 'aisha@demo.local', password: 'aisha123', label: 'Representative — Aisha' },
  { email: 'vikram@demo.local', password: 'vikram123', label: 'Representative — Vikram' },
];

export const Login: React.FC = () => {
  const { currentUser, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in (e.g. navigated back to /login manually) -- don't show the form.
  if (!loading && currentUser) {
    const from = (location.state as any)?.from;
    return <Navigate to={from || (currentUser.role === 'REPRESENTATIVE' ? '/rep' : '/')} replace />;
  }

  const handleSubmit = async (e: React.FormEvent, overrideEmail?: string, overridePassword?: string) => {
    e.preventDefault();
    const useEmail = overrideEmail ?? email;
    const usePassword = overridePassword ?? password;
    if (!useEmail.trim() || !usePassword) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(useEmail.trim(), usePassword);
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070811] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-purple-900/40 mb-4">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Autonomous SDR Platform</h1>
          <p className="text-xs text-slate-500 mt-1">Sign in to your workspace</p>
        </div>

        <div className="bg-[#0c0e1f] border border-purple-500/15 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@demo.local"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#070811] border border-purple-500/20 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#070811] border border-purple-500/20 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-purple-900/30 transition-all"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {submitting ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-purple-500/10">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2.5">Demo accounts</div>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={(e) => { setEmail(acc.email); setPassword(acc.password); handleSubmit(e as any, acc.email, acc.password); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#070811] border border-purple-500/10 hover:border-purple-500/40 text-left transition-colors"
                >
                  <span className="text-xs text-slate-300">{acc.label}</span>
                  <span className="text-[10px] font-mono text-slate-600">{acc.email}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
              Demo authentication for this buildathon build — not a production login. Credentials are fixed and documented in the README.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
