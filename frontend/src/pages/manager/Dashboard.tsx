import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Pause, Play, ArrowRight, Loader2 } from 'lucide-react';
import { campaignsApi } from '../../api/campaigns';
import { MetricCard } from '../../components/ui/MetricCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AlertBanner } from '../../components/ui/AlertBanner';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: campaignsApi.getDashboard,
    refetchInterval: 10000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['manager-alerts'],
    queryFn: campaignsApi.getAlerts,
    refetchInterval: 10000,
  });

  const togglePauseMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'pause' | 'resume' }) => {
      return await campaignsApi.toggleCampaignPause(id, action);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to update campaign state');
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <div className="text-sm text-slate-400">Loading manager dashboard...</div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-rose-300">
        <h3 className="font-bold mb-1">Failed to load dashboard</h3>
        <p className="text-sm">{(error as any)?.message || 'Could not fetch data from backend.'}</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] })}
          className="mt-4 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header matching Screenshot 2 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-serif italic font-semibold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Good morning, Alex. Here's what's happening today.
          </p>
        </div>
        <button
          onClick={() => navigate('/campaigns/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          + New Campaign
        </button>
      </div>

      {/* Warning Alert Banner (from Backend aging approvals) */}
      {alerts && alerts.length > 0 && (
        <AlertBanner
          message={alerts[0].message}
          actionLabel="Review Now"
          onAction={() => navigate('/monitoring')}
        />
      )}

      {/* 4 Metric Cards matching Screenshot 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          value={dashboard.pending_approvals}
          label="Pending Approvals"
          subtext={dashboard.active_alerts > 0 ? `${dashboard.active_alerts} aging > 24hrs` : 'Within SLA'}
          color="amber"
          onClick={() => navigate('/monitoring')}
        />
        <MetricCard
          value={dashboard.replies_needing_attention}
          label="Replies Needing Attention"
          subtext="Active prospect responses"
          color="amber"
        />
        <MetricCard
          value={dashboard.meetings_booked_today}
          label="Meetings Booked Today"
          subtext="Meeting intent verified"
          color="emerald"
        />
        <MetricCard
          value={dashboard.active_alerts}
          label="Active Alerts"
          subtext={dashboard.active_alerts > 0 ? 'Requires attention' : 'All systems normal'}
          color="purple"
        />
      </div>

      {/* Campaigns Section */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white tracking-tight">Campaigns</h2>
          <span className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 cursor-pointer">
            View all campaigns <ArrowRight className="w-3 h-3" />
          </span>
        </div>

        {/* Dense Campaigns Table */}
        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-purple-500/10 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-[#090b1a]">
                  <th className="py-3.5 px-5">Campaign Name</th>
                  <th className="py-3.5 px-4">Rep</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Prospects</th>
                  <th className="py-3.5 px-4 text-right">Outreach Sent</th>
                  <th className="py-3.5 px-4 text-right">Meetings Booked</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5 text-sm">
                {dashboard.campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 text-sm">
                      No campaigns yet. Create your first campaign to begin discovering prospects.
                    </td>
                  </tr>
                ) : (
                  dashboard.campaigns.map((c) => {
                    const isPaused = c.status === 'PAUSED';
                    const isDraft = c.status === 'DRAFT';
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/campaigns/${c.id}`)}
                        className="hover:bg-[#121633] transition-colors cursor-pointer group"
                      >
                        <td className="py-4 px-5">
                          <div className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                            {c.name}
                          </div>
                          <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                            {c.icp_summary || 'No ICP defined'}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-300">
                          {c.rep || 'Unassigned'}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={c.status === 'LIVE' ? 'Active' : c.status} />
                            {isPaused && (
                              <span className="text-[11px] text-amber-400/80 font-medium">
                                · 2 open
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right font-medium text-slate-200">
                          {c.prospect_count}
                        </td>
                        <td className="py-4 px-4 text-right font-medium text-slate-200">
                          {c.outreach_sent}
                        </td>
                        <td className="py-4 px-4 text-right font-medium text-slate-200">
                          {c.meetings_booked}
                        </td>
                        <td className="py-4 px-5 text-right">
                          {!isDraft && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePauseMutation.mutate({
                                  id: c.id,
                                  action: isPaused ? 'resume' : 'pause',
                                });
                              }}
                              disabled={togglePauseMutation.isPending}
                              title={isPaused ? 'Resume Campaign' : 'Pause Campaign'}
                              className={`p-1.5 rounded-lg border transition-all ${
                                isPaused
                                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60'
                                  : 'bg-amber-950/40 border-amber-500/40 text-amber-400 hover:bg-amber-900/60'
                              }`}
                            >
                              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
