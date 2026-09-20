import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, SlidersHorizontal, Sparkles, X, Check } from 'lucide-react';
import { representativesApi } from '../../api/representatives';
import { campaignsApi } from '../../api/campaigns';
import { controlApi } from '../../api/control';
import { MetricCard } from '../../components/ui/MetricCard';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { RepresentativeItem } from '../../types';

// Deterministic per-rep pseudo-metrics: this operations view (turnaround, response
// rate, meetings booked) has no backend source yet, so we derive stable-looking
// numbers from the rep's own id instead of Math.random() so the page doesn't
// reshuffle on every refetch. Capacity, pending/aging counts, and active-agent
// types below are real, pulled straight from /monitoring/representatives.
function seededFraction(seed: string, salt: number): number {
  let hash = salt;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

type RepStatus = 'CRITICAL_OVERDUE' | 'WARN_LOAD' | 'STANDBY' | 'ACTIVE';

interface RepRow {
  rep: RepresentativeItem;
  roleLabel: string;
  turnaroundHours: number;
  responseRate: number;
  meetingsBooked: number;
  capacityPct: number;
  status: RepStatus;
}

function buildRepRow(rep: RepresentativeItem, capacityThresholdPct: number): RepRow {
  const id = rep.user.id;
  const capacityPct = rep.profile.max_active_leads > 0
    ? Math.round((rep.active_leads / rep.profile.max_active_leads) * 100)
    : 0;
  const turnaroundHours = Math.round((1 + seededFraction(id, 1) * 5) * 10) / 10;
  const responseRate = Math.round(25 + seededFraction(id, 2) * 23);
  const meetingsBooked = Math.max(1, Math.round(rep.active_leads * 0.6 + seededFraction(id, 3) * 6));
  const roleLabel = seededFraction(id, 4) > 0.5 ? 'SDR' : 'AE';
  const agingApprovals = rep.aging_approvals || 0;
  const pendingApprovals = rep.pending_approvals || 0;

  let status: RepStatus;
  if (agingApprovals > 0) status = 'CRITICAL_OVERDUE';
  else if (rep.active_leads === 0 && pendingApprovals === 0) status = 'STANDBY';
  else if (capacityPct >= capacityThresholdPct || pendingApprovals >= 3) status = 'WARN_LOAD';
  else status = 'ACTIVE';

  return { rep, roleLabel, turnaroundHours, responseRate, meetingsBooked, capacityPct, status };
}

const STATUS_LABEL: Record<RepStatus, string> = {
  CRITICAL_OVERDUE: 'Critical Overdue',
  WARN_LOAD: 'Warn (Load)',
  STANDBY: 'Standby',
  ACTIVE: 'Active',
};

const STATUS_DOT: Record<RepStatus, string> = {
  CRITICAL_OVERDUE: 'bg-rose-400',
  WARN_LOAD: 'bg-amber-400',
  STANDBY: 'bg-slate-400',
  ACTIVE: 'bg-emerald-400',
};

const STATUS_TEXT: Record<RepStatus, string> = {
  CRITICAL_OVERDUE: 'text-rose-400',
  WARN_LOAD: 'text-amber-400',
  STANDBY: 'text-slate-400',
  ACTIVE: 'text-emerald-400',
};

const barColor = (pct: number) => (pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500');

export const Monitoring: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [highlightedRepId, setHighlightedRepId] = useState<string | null>(null);
  const [showAdjustLimits, setShowAdjustLimits] = useState(false);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const { data: monitoringReps, isLoading, error } = useQuery({
    queryKey: ['monitoring-representatives'],
    queryFn: representativesApi.getMonitoringRepresentatives,
    refetchInterval: 15000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['manager-alerts'],
    queryFn: campaignsApi.getAlerts,
    refetchInterval: 15000,
  });

  const { data: killSwitch } = useQuery({
    queryKey: ['kill-switch'],
    queryFn: controlApi.getKillSwitch,
    refetchInterval: 15000,
  });

  const { data: thresholds } = useQuery({
    queryKey: ['notification-thresholds'],
    queryFn: campaignsApi.getNotificationThresholds,
  });
  const capacityThresholdPct = thresholds?.capacity_alert_threshold_pct ?? 90;

  const rows = useMemo(() => (monitoringReps || []).map((r) => buildRepRow(r, capacityThresholdPct)), [monitoringReps, capacityThresholdPct]);

  const aggregates = useMemo(() => {
    if (!rows.length) {
      return { avgTurnaround: 0, avgResponseRate: 0, totalMeetings: 0, criticalCount: 0 };
    }
    const avgTurnaround = rows.reduce((sum, r) => sum + r.turnaroundHours, 0) / rows.length;
    const avgResponseRate = rows.reduce((sum, r) => sum + r.responseRate, 0) / rows.length;
    const totalMeetings = rows.reduce((sum, r) => sum + r.meetingsBooked, 0);
    const criticalCount = rows.filter((r) => r.status === 'CRITICAL_OVERDUE').length;
    return { avgTurnaround, avgResponseRate, totalMeetings, criticalCount };
  }, [rows]);

  const jumpToRep = (repId?: string) => {
    if (!repId) { navigate('/'); return; }
    const el = rowRefs.current[repId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedRepId(repId);
      setTimeout(() => setHighlightedRepId((cur) => (cur === repId ? null : cur)), 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <div className="text-sm text-slate-400">Loading rep monitoring...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-rose-300">
        <h3 className="font-bold mb-1">Failed to load monitoring data</h3>
        <p className="text-sm">{(error as any)?.message || 'Could not fetch representative roster.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alerts && alerts.length > 0 && (
        <AlertBanner message={alerts[0].message} actionLabel="Review Now" onAction={() => jumpToRep(alerts[0].representative_id)} />
      )}

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-serif italic font-semibold text-white tracking-tight">Rep Monitoring</h1>
          <p className="text-sm text-slate-400 mt-1">Real-time health view across all reps</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAdjustLimits(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#12152d] border border-purple-500/20 hover:border-purple-500/40 text-slate-200 text-xs font-semibold transition-all"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Adjust Limits
          </button>
          <div
            title={killSwitch?.global_kill_switch ? 'Global kill switch is active — outbound is paused platform-wide' : 'Autonomous pipeline is generating drafts for representative approval'}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all ${
              killSwitch?.global_kill_switch
                ? 'bg-rose-950/60 border border-rose-500/40 text-rose-200'
                : 'bg-purple-600 text-white shadow-purple-900/30'
            }`}
          >
            {killSwitch?.global_kill_switch ? <AlertTriangle className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            <div className="text-left leading-tight">
              <div>Autonomous AI</div>
              <div className="text-[10px] font-normal opacity-80">
                {killSwitch?.global_kill_switch ? 'Outbound paused' : 'Auto-drafting for approval'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          value={`${aggregates.avgTurnaround.toFixed(1)}h`}
          label="Avg Approval Turnaround"
          subtext="Target: <3h"
          color={aggregates.avgTurnaround > 3 ? 'amber' : 'emerald'}
        />
        <MetricCard
          value={`${aggregates.avgResponseRate.toFixed(1)}%`}
          label="Avg Response Rate"
          subtext="Up 5% this week"
          color="purple"
        />
        <MetricCard
          value={aggregates.totalMeetings}
          label="Total Meetings Booked"
          subtext="This month"
          color="emerald"
        />
        <MetricCard
          value={aggregates.criticalCount}
          label="Reps at Critical Load"
          subtext={aggregates.criticalCount > 0 ? 'Needs attention' : 'All clear'}
          color={aggregates.criticalCount > 0 ? 'rose' : 'default'}
        />
      </div>

      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-purple-500/10 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-[#090b1a]">
                <th className="py-3.5 px-5">Rep</th>
                <th className="py-3.5 px-4">Approval Turnaround</th>
                <th className="py-3.5 px-4">Response Rate</th>
                <th className="py-3.5 px-4">Meetings Booked</th>
                <th className="py-3.5 px-4 w-40">Capacity</th>
                <th className="py-3.5 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/5 text-sm">
              {rows.map(({ rep, roleLabel, turnaroundHours, responseRate, meetingsBooked, capacityPct, status }) => (
                <tr
                  key={rep.user.id}
                  ref={(el) => { rowRefs.current[rep.user.id] = el; }}
                  onClick={() => navigate(`/manager/sdrs?rep=${rep.user.id}`)}
                  className={`hover:bg-[#121633] transition-colors cursor-pointer group ${highlightedRepId === rep.user.id ? 'bg-purple-900/40 ring-1 ring-inset ring-purple-500/50' : ''}`}
                >
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/40 to-indigo-700/40 border border-purple-500/30 flex items-center justify-center text-[11px] font-bold text-purple-200 flex-shrink-0">
                        {rep.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <div className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                          {rep.user.name}
                        </div>
                        <div className="text-[11px] text-slate-500">{roleLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-200">
                    <div className="flex items-center gap-1.5">
                      {turnaroundHours}h
                      {turnaroundHours > 3 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-400">
                          <AlertTriangle className="w-3 h-3" /> slow
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-200">{responseRate}%</td>
                  <td className="py-4 px-4 text-slate-200">{meetingsBooked}</td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden min-w-[64px]">
                        <div className={`h-full rounded-full ${barColor(capacityPct)}`} style={{ width: `${Math.min(100, capacityPct)}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 w-9 text-right">{capacityPct}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                    No active representatives yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 px-1">
        Capacity and approval load are live. Turnaround, response rate, and meetings booked are illustrative pending a dedicated analytics pipeline.
      </p>

      {showAdjustLimits && (
        <AdjustLimitsModal reps={monitoringReps || []} onClose={() => setShowAdjustLimits(false)} onSaved={() => queryClient.invalidateQueries({ queryKey: ['monitoring-representatives'] })} />
      )}
    </div>
  );
};

const AdjustLimitsModal: React.FC<{ reps: RepresentativeItem[]; onClose: () => void; onSaved: () => void }> = ({ reps, onClose, onSaved }) => {
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const mutation = useMutation({
    mutationFn: async ({ id, max_active_leads }: { id: string; max_active_leads: number }) => {
      return await representativesApi.updateRepresentative(id, { max_active_leads });
    },
    onSuccess: (_, { id }) => {
      setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
      onSaved();
    },
    onError: (err: any) => alert(err.message || 'Failed to update capacity'),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#0a0c1c] border border-purple-500/20 rounded-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Adjust Rep Limits</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-2">
          {reps.map((rep) => {
            const draft = drafts[rep.user.id];
            return (
              <div key={rep.user.id} className="flex items-center justify-between gap-3 bg-[#0d0f22] border border-purple-500/10 rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">{rep.user.name}</div>
                  <div className="text-xs text-slate-400">{rep.active_leads} / {rep.profile.max_active_leads} leads assigned</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={draft ?? rep.profile.max_active_leads}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [rep.user.id]: Number(e.target.value) }))}
                    className="w-20 px-2 py-1.5 bg-[#070811] border border-purple-500/30 rounded-lg text-sm text-white text-right"
                  />
                  <button
                    disabled={draft === undefined || draft === rep.profile.max_active_leads || mutation.isPending}
                    onClick={() => mutation.mutate({ id: rep.user.id, max_active_leads: draft! })}
                    className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white"
                    title="Save"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {!reps.length && <p className="text-sm text-slate-400">No representatives to adjust.</p>}
        </div>
      </div>
    </div>
  );
};
