import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Pause, Play, ArrowRight, Loader2, X, Clock, MessageSquare, CalendarCheck, AlertOctagon, ChevronRight } from 'lucide-react';
import { campaignsApi } from '../../api/campaigns';
import { MetricCard } from '../../components/ui/MetricCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { ManagerApprovalReview } from '../../components/campaign/ManagerApprovalReview';

type PanelKind = 'approvals' | 'replies' | 'meetings' | 'alerts' | null;

const PANEL_TITLE: Record<Exclude<PanelKind, null>, string> = {
  approvals: 'Pending Approvals',
  replies: 'Replies Needing Attention',
  meetings: 'Meetings Booked Today',
  alerts: 'Active Alerts',
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<PanelKind>(null);
  const [reviewApprovalId, setReviewApprovalId] = useState<string | null>(null);

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

  // Pending approvals + replies/meetings all need real per-conversation/per-approval
  // detail the summary dashboard endpoint doesn't carry, so each panel fetches lazily
  // only once the manager actually opens it.
  const { data: agingApprovals, isLoading: loadingApprovals } = useQuery({
    queryKey: ['manager-aging-approvals'],
    queryFn: campaignsApi.getAgingApprovals,
    enabled: activePanel === 'approvals',
  });
  const { data: approvalsSummary } = useQuery({
    queryKey: ['manager-approvals-summary'],
    queryFn: campaignsApi.getApprovalsSummary,
    enabled: activePanel === 'approvals',
  });

  const campaignIds = useMemo(() => (dashboard?.campaigns || []).map((c) => c.id), [dashboard]);
  const { data: conversationsByCampaign, isLoading: loadingConversations } = useQuery({
    queryKey: ['dashboard-conversations', campaignIds],
    queryFn: async () => {
      const results = await Promise.all(
        (dashboard?.campaigns || []).map(async (c) => ({
          campaign: c,
          conversations: await campaignsApi.getCampaignConversations(c.id),
        }))
      );
      return results;
    },
    enabled: (activePanel === 'replies' || activePanel === 'meetings') && campaignIds.length > 0,
  });

  const openReplies = useMemo(
    () => (conversationsByCampaign || []).flatMap(({ campaign, conversations }) =>
      conversations.filter((c) => c.status === 'OPEN').map((c) => ({ campaign, conversation: c }))
    ),
    [conversationsByCampaign]
  );
  const bookedMeetings = useMemo(
    () => (conversationsByCampaign || []).flatMap(({ campaign, conversations }) =>
      conversations.filter((c) => c.status === 'MEETING_INTENT').map((c) => ({ campaign, conversation: c }))
    ),
    [conversationsByCampaign]
  );

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
          <h1 className="text-4xl font-serif italic font-medium text-white tracking-tight">
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
          New Campaign
        </button>
      </div>

      {/* Global banner: platform-wide warnings (aging approvals, reps over capacity, suppression
          blocks, escalated hurdles) surfaced above the table so nothing urgent is buried inside
          a specific campaign. Shows the most severe issue plus a count of anything else waiting. */}
      {alerts && alerts.length > 0 && (
        <AlertBanner
          message={alerts.length > 1 ? `${alerts[0].message}  ·  +${alerts.length - 1} more issue${alerts.length - 1 === 1 ? '' : 's'} waiting` : alerts[0].message}
          actionLabel="Review Now"
          onAction={() => setActivePanel('alerts')}
        />
      )}

      {/* 4 equally-sized metric widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          value={dashboard.pending_approvals}
          label="Pending Approvals"
          subtext={dashboard.active_alerts > 0 ? `${dashboard.active_alerts} aging > 24hrs` : 'Within SLA'}
          color="amber"
          onClick={() => setActivePanel('approvals')}
        />
        <MetricCard
          value={dashboard.replies_needing_attention}
          label="Replies Needing Attention"
          subtext="Active prospect responses"
          color="amber"
          onClick={() => setActivePanel('replies')}
        />
        <MetricCard
          value={dashboard.meetings_booked_today}
          label="Meetings Booked Today"
          subtext="Meeting intent verified"
          color="emerald"
          onClick={() => setActivePanel('meetings')}
        />
        <MetricCard
          value={dashboard.active_alerts}
          label="Active Alerts"
          subtext={dashboard.active_alerts > 0 ? `${alerts?.length ?? 0} issue${(alerts?.length ?? 0) === 1 ? '' : 's'} across the platform` : 'All systems normal'}
          color="purple"
          onClick={() => setActivePanel('alerts')}
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
        <div className="bg-[#0c0e1f] border border-[#7C3AED] rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-purple-500/10 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-[#090b1a]">
                  <th className="py-3.5 px-5">Campaign Name</th>
                  <th className="py-3.5 px-4">ICP</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Prospects</th>
                  <th className="py-3.5 px-4 text-right">Outreach Sent</th>
                  <th className="py-3.5 px-4 text-right">Meetings Booked</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5 text-sm">
                {(dashboard.campaigns || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 text-sm">
                      No campaigns yet. Create your first campaign to begin discovering prospects.
                    </td>
                  </tr>
                ) : (
                  (dashboard.campaigns || []).map((c) => {
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
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-300 max-w-[220px]">
                          <span className="line-clamp-1">{c.icp_summary || 'No ICP defined'}</span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={c.status === 'LIVE' ? 'Active' : c.status} />
                            {isPaused && c.open_conversations > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400/80 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                {c.open_conversations} open
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

      {activePanel && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/50" onClick={() => setActivePanel(null)}>
          <div className="w-full max-w-xl h-full bg-[#0a0c1c] border-l border-purple-500/20 overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{PANEL_TITLE[activePanel]}</h2>
              <button onClick={() => setActivePanel(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {activePanel === 'approvals' && (
              <div className="space-y-3">
                {approvalsSummary && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-lg p-3">
                      <div className="text-xl font-bold text-white">{approvalsSummary.total_pending}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Total pending</div>
                    </div>
                    <div className="bg-[#0d0f22] border border-rose-500/10 rounded-lg p-3">
                      <div className="text-xl font-bold text-rose-400">{approvalsSummary.aging_count}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Aging &gt;{approvalsSummary.aging_threshold_hours}h</div>
                    </div>
                    <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-lg p-3">
                      <div className="text-xl font-bold text-white">{approvalsSummary.oldest_age_hours}h</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Oldest waiting</div>
                    </div>
                  </div>
                )}
                <h3 className="text-xs font-semibold uppercase text-slate-500 pt-2">Aging drafts (past SLA)</h3>
                {loadingApprovals && <div className="text-sm text-slate-400">Loading...</div>}
                {agingApprovals?.map((a) => (
                  <div key={a.approval_id} className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">{a.prospect ? `${a.prospect.first_name} ${a.prospect.last_name}` : 'Unknown prospect'}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{a.campaign.name} · {a.representative.name} · {a.channel}</div>
                      </div>
                      <span className="text-xs font-bold text-rose-300 flex items-center gap-1 whitespace-nowrap"><Clock className="w-3 h-3" />{a.age_hours}h</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-2 line-clamp-2">{a.message_preview}</p>
                  </div>
                ))}
                {!loadingApprovals && !agingApprovals?.length && (
                  <p className="text-sm text-slate-400">No approvals are past the SLA threshold right now.</p>
                )}
                {!!approvalsSummary?.by_representative.length && (
                  <>
                    <h3 className="text-xs font-semibold uppercase text-slate-500 pt-3">By representative</h3>
                    {approvalsSummary.by_representative.map((r) => (
                      <div key={r.representative_id} className="flex justify-between items-center text-xs bg-[#0d0f22] border border-[#7C3AED] rounded-lg px-3 py-2">
                        <span className="text-slate-200">{r.representative}</span>
                        <span className="text-slate-400">{r.pending} pending{r.aging > 0 ? ` · ${r.aging} aging` : ''}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {activePanel === 'replies' && (
              <div className="space-y-3">
                {loadingConversations && <div className="text-sm text-slate-400">Loading...</div>}
                {openReplies.map(({ campaign, conversation }) => (
                  <div
                    key={conversation.id}
                    onClick={() => { setActivePanel(null); navigate(`/campaigns/${campaign.id}`); }}
                    className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3.5 cursor-pointer hover:border-amber-500/40 transition-colors flex items-start gap-3"
                  >
                    <MessageSquare className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {conversation.prospect ? `${conversation.prospect.first_name} ${conversation.prospect.last_name}` : 'Prospect'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{campaign.name}</div>
                      {conversation.last_message && (
                        <p className="text-xs text-slate-300 mt-1.5 line-clamp-2">{conversation.last_message.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {!loadingConversations && !openReplies.length && (
                  <p className="text-sm text-slate-400">No open prospect replies right now.</p>
                )}
              </div>
            )}

            {activePanel === 'meetings' && (
              <div className="space-y-3">
                {loadingConversations && <div className="text-sm text-slate-400">Loading...</div>}
                {bookedMeetings.map(({ campaign, conversation }) => (
                  <div
                    key={conversation.id}
                    onClick={() => { setActivePanel(null); navigate(`/campaigns/${campaign.id}`); }}
                    className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3.5 cursor-pointer hover:border-emerald-500/40 transition-colors flex items-start gap-3"
                  >
                    <CalendarCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {conversation.prospect ? `${conversation.prospect.first_name} ${conversation.prospect.last_name}` : 'Prospect'}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{campaign.name} · Meeting intent verified</div>
                      {conversation.last_message && (
                        <p className="text-xs text-slate-300 mt-1.5 line-clamp-2">{conversation.last_message.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {!loadingConversations && !bookedMeetings.length && (
                  <p className="text-sm text-slate-400">No meetings booked yet today.</p>
                )}
              </div>
            )}

            {activePanel === 'alerts' && (
              <div className="space-y-3">
                {alerts?.map((a) => {
                  const isApproval = a.type === 'AGING_APPROVAL';
                  const content = (
                    <>
                      <AlertOctagon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${a.severity === 'HIGH' ? 'text-rose-400' : 'text-amber-400'}`} />
                      <div className="flex-1 text-left">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.type.replace(/_/g, ' ')}</div>
                        <p className="text-sm text-white mt-0.5">{a.message}</p>
                        {isApproval && <span className="text-[11px] text-purple-300 font-medium mt-1 inline-flex items-center gap-0.5">Review, approve, edit or reject <ChevronRight className="w-3 h-3" /></span>}
                      </div>
                    </>
                  );
                  return isApproval ? (
                    <button
                      key={a.id}
                      onClick={() => { setActivePanel(null); setReviewApprovalId(a.id); }}
                      className="w-full rounded-xl border border-purple-500/20 bg-[#0d0f22] hover:border-purple-500/50 hover:bg-[#12152d] p-3.5 flex items-start gap-3 transition-colors"
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={a.id} className="rounded-xl border border-purple-500/20 bg-[#0d0f22] p-3.5 flex items-start gap-3">
                      {content}
                    </div>
                  );
                })}
                {!alerts?.length && <p className="text-sm text-slate-400">All systems normal — no active alerts.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {reviewApprovalId && (
        <ManagerApprovalReview approvalId={reviewApprovalId} onClose={() => setReviewApprovalId(null)} />
      )}
    </div>
  );
};
