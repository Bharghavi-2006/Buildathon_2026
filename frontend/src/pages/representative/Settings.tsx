import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { guardrailsApi } from '../../api/hurdles';
import { useAuth } from '../../context/AuthContext';

export const RepresentativeSettings: React.FC = () => {
  const { currentUser, activeEmail } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['rep-guardrails'], queryFn: guardrailsApi.get });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif italic font-medium text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Your profile and working parameters. Campaign configuration is managed by your manager.</p>
      </div>

      <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Profile</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div><div className="text-slate-500">Name</div><div className="text-slate-200 mt-0.5">{currentUser?.user?.name || '—'}</div></div>
          <div><div className="text-slate-500">Email</div><div className="text-slate-200 mt-0.5">{activeEmail}</div></div>
          <div><div className="text-slate-500">Role</div><div className="text-slate-200 mt-0.5 capitalize">{currentUser?.role?.toLowerCase() || '—'}</div></div>
        </div>
      </div>

      {isLoading && <div className="text-slate-400 text-sm">Loading working profile…</div>}
      {error && <div className="text-rose-300 text-sm">Unable to load working profile.</div>}
      {data && (
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Working profile</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div><div className="text-slate-500">Timezone</div><div className="text-slate-200 mt-0.5">{data.representative_profile.timezone || 'Not configured'}</div></div>
            <div><div className="text-slate-500">Supported channels</div><div className="text-slate-200 mt-0.5">{(data.representative_profile.supported_channels || []).join(', ') || 'Not configured'}</div></div>
          </div>
          <p className="text-[11px] text-slate-500 pt-2 border-t border-purple-500/10">Working hours, capacity, and campaign assignments are set by your manager and enforced by the backend PolicyEngine — see Guardrails for the live view.</p>
        </div>
      )}
    </div>
  );
};
