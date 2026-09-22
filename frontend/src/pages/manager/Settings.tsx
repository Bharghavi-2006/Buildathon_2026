import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Bell, Loader2, Plug, Plus, Save, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { campaignsApi } from '../../api/campaigns';
import { useAuth } from '../../context/AuthContext';

const SectionCard: React.FC<{ title: string; icon: React.ElementType; description?: string; children: React.ReactNode }> = ({ title, icon: Icon, description, children }) => (
  <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl space-y-4">
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {description && <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>}
      </div>
    </div>
    {children}
  </div>
);

export const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();

  // --- Suppression / DNC list ---
  const { data: suppressionList = [], isLoading: loadingSuppression } = useQuery({
    queryKey: ['suppression-list'],
    queryFn: campaignsApi.getSuppressionList,
  });
  const [suppressEmail, setSuppressEmail] = useState('');
  const [suppressReason, setSuppressReason] = useState('');
  const addSuppressionMutation = useMutation({
    mutationFn: () => campaignsApi.addSuppression(suppressEmail.trim(), suppressReason.trim() || 'Manual DNC entry'),
    onSuccess: () => {
      setSuppressEmail(''); setSuppressReason('');
      queryClient.invalidateQueries({ queryKey: ['suppression-list'] });
    },
    onError: (err: any) => alert(err.message || 'Failed to add suppression entry'),
  });
  const removeSuppressionMutation = useMutation({
    mutationFn: (entryId: string) => campaignsApi.removeSuppression(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppression-list'] }),
  });

  // --- Notification thresholds ---
  const { data: thresholds } = useQuery({
    queryKey: ['notification-thresholds'],
    queryFn: campaignsApi.getNotificationThresholds,
  });
  const [agingHours, setAgingHours] = useState(24);
  const [capacityPct, setCapacityPct] = useState(90);
  useEffect(() => {
    if (thresholds) {
      setAgingHours(thresholds.approval_aging_threshold_hours);
      setCapacityPct(thresholds.capacity_alert_threshold_pct);
    }
  }, [thresholds]);
  const saveThresholdsMutation = useMutation({
    mutationFn: () => campaignsApi.updateNotificationThresholds({ approval_aging_threshold_hours: agingHours, capacity_alert_threshold_pct: capacityPct }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['manager-alerts'] });
    },
    onError: (err: any) => alert(err.message || 'Failed to update thresholds'),
  });

  // --- Team / permissions ---
  const { data: managers = [], isLoading: loadingManagers } = useQuery({
    queryKey: ['team-permissions'],
    queryFn: campaignsApi.getTeamPermissions,
  });
  const [newManagerName, setNewManagerName] = useState('');
  const [newManagerEmail, setNewManagerEmail] = useState('');
  const grantMutation = useMutation({
    mutationFn: () => campaignsApi.grantManagerAccess(newManagerName.trim(), newManagerEmail.trim()),
    onSuccess: () => {
      setNewManagerName(''); setNewManagerEmail('');
      queryClient.invalidateQueries({ queryKey: ['team-permissions'] });
    },
    onError: (err: any) => alert(err.message || 'Failed to grant manager access'),
  });
  const revokeMutation = useMutation({
    mutationFn: (userId: string) => campaignsApi.revokeManagerAccess(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-permissions'] }),
    onError: (err: any) => alert(err.message || 'Failed to revoke manager access'),
  });

  // --- Integrations status (read-only) ---
  const { data: integrations } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: campaignsApi.getIntegrationsStatus,
  });

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div>
        <h1 className="text-2xl font-serif italic font-medium text-white tracking-tight">Platform Settings</h1>
        <p className="text-xs text-slate-400 mt-1">
          Global configuration, distinct from the per-campaign settings in the campaign wizard. The global kill switch stays in the top bar on every screen — it's too important to bury here.
        </p>
      </div>

      <SectionCard title="Global Guardrails" icon={Shield} description="Deterministic policy checks the backend enforces on every send — always-on, not toggled from here.">
        <ul className="grid sm:grid-cols-2 gap-2 text-xs text-slate-300">
          {[
            'Global kill switch halts all outbound instantly (top bar, every screen)',
            'Suppression / DNC list blocks outreach at send time, not just at import',
            'A paused campaign accepts no new outreach, but open conversations may still be replied to',
            'Per-campaign daily send limits and working hours are enforced server-side',
            'Cross-campaign prospect conflicts are blocked before a second campaign can contact them',
            'Every send requires representative approval unless a campaign explicitly disables it',
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2 bg-[#070811] border border-purple-500/10 rounded-lg px-3 py-2">
              <Shield className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Suppression / DNC List" icon={Ban} description="Prospects here can never be contacted — enforced by the policy engine on every send attempt, not just here.">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={suppressEmail}
            onChange={(e) => setSuppressEmail(e.target.value)}
            placeholder="Prospect email"
            className="flex-1 px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
          />
          <input
            value={suppressReason}
            onChange={(e) => setSuppressReason(e.target.value)}
            placeholder="Reason (optional)"
            className="flex-1 px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
          />
          <button
            disabled={!suppressEmail.trim() || addSuppressionMutation.isPending}
            onClick={() => addSuppressionMutation.mutate()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all justify-center"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        {loadingSuppression ? (
          <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
        ) : suppressionList.filter((row) => row.entry.active).length === 0 ? (
          <p className="text-xs text-slate-500">No prospects are currently suppressed.</p>
        ) : (
          <div className="divide-y divide-purple-500/5">
            {suppressionList.filter((row) => row.entry.active).map((row) => (
              <div key={row.entry.id} className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <div className="text-slate-200 font-medium">{row.prospect?.first_name} {row.prospect?.last_name} · {row.prospect?.email}</div>
                  <div className="text-slate-500">{row.entry.reason}</div>
                </div>
                <button
                  onClick={() => removeSuppressionMutation.mutate(row.entry.id)}
                  disabled={removeSuppressionMutation.isPending}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 transition-colors"
                  title="Remove from suppression list"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Notification Preferences" icon={Bell} description="The thresholds that trigger aging-approval and over-capacity alerts across the Dashboard, Reps, and Monitoring screens.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">Approval aging threshold (hours)</label>
            <input
              type="number" min={1} max={168}
              value={agingHours}
              onChange={(e) => setAgingHours(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">An approval draft older than this is flagged as aging.</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">Capacity alert threshold (%)</label>
            <input
              type="number" min={1} max={100}
              value={capacityPct}
              onChange={(e) => setCapacityPct(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">A rep at or above this load triggers a capacity alert.</span>
          </div>
        </div>
        <button
          onClick={() => saveThresholdsMutation.mutate()}
          disabled={saveThresholdsMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all"
        >
          {saveThresholdsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Thresholds
        </button>
      </SectionCard>

      <SectionCard title="Team & Permissions" icon={Users} description="Who else has manager-level access to this platform.">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newManagerName}
            onChange={(e) => setNewManagerName(e.target.value)}
            placeholder="Name"
            className="flex-1 px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
          />
          <input
            value={newManagerEmail}
            onChange={(e) => setNewManagerEmail(e.target.value)}
            placeholder="Email"
            className="flex-1 px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
          />
          <button
            disabled={!newManagerName.trim() || !newManagerEmail.trim() || grantMutation.isPending}
            onClick={() => grantMutation.mutate()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all justify-center"
          >
            <UserPlus className="w-3.5 h-3.5" /> Grant Access
          </button>
        </div>
        {loadingManagers ? (
          <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
        ) : (
          <div className="divide-y divide-purple-500/5">
            {managers.filter((m) => m.profile.active).map((m) => (
              <div key={m.user.id} className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <div className="text-slate-200 font-medium">{m.user.name}{m.user.id === currentUser?.user?.id && <span className="text-purple-400 ml-1.5">(you)</span>}</div>
                  <div className="text-slate-500">{m.user.email}</div>
                </div>
                {m.user.id !== currentUser?.user?.id && (
                  <button
                    onClick={() => revokeMutation.mutate(m.user.id)}
                    disabled={revokeMutation.isPending}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 transition-colors"
                    title="Revoke manager access"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Integrations & Agents" icon={Plug} description="Environment-managed — webhook URLs and API keys are set via deployment variables, not editable here.">
        {integrations ? (
          <div className="text-xs text-slate-300 space-y-2">
            <div className="flex justify-between"><span className="text-slate-500">LLM Provider</span><span>{integrations.llm_provider}</span></div>
            <div className="pt-2 border-t border-purple-500/10 space-y-1.5">
              {Object.entries(integrations.agents).map(([agent, status]) => (
                <div key={agent} className="flex justify-between">
                  <span className="text-slate-500 capitalize">{agent.replace(/_/g, ' ')}</span>
                  <span className={status === 'DEMO' ? 'text-amber-400' : status === 'CONFIGURED' ? 'text-emerald-400' : 'text-rose-400'}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</div>
        )}
      </SectionCard>
    </div>
  );
};
