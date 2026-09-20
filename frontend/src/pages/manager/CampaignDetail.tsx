import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pause, Play, Users, Bot, Layers, MessageSquare, Loader2, Sparkles, AlertCircle, Send, Mail, Linkedin, Phone } from 'lucide-react';
import { campaignsApi } from '../../api/campaigns';
import { StatusBadge } from '../../components/ui/StatusBadge';

const CHANNEL_ICON: Record<string, React.ElementType> = { email: Mail, linkedin: Linkedin, voice: Phone, message: MessageSquare };

export const CampaignDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'prospects' | 'team' | 'conversations' | 'agents'>('overview');
  const [demoRecipient, setDemoRecipient] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const { data: campaign, isLoading: campLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.getCampaign(id!),
    enabled: !!id,
  });

  const { data: analytics } = useQuery({
    queryKey: ['campaign-analytics', id],
    queryFn: () => campaignsApi.getCampaignAnalytics(id!),
    enabled: !!id,
  });

  const { data: prospects = [] } = useQuery({
    queryKey: ['campaign-prospects', id],
    queryFn: () => campaignsApi.getCampaignProspects(id!),
    enabled: !!id,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['campaign-agents', id],
    queryFn: () => campaignsApi.getCampaignAgents(id!),
    enabled: !!id,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['campaign-channels', id],
    queryFn: () => campaignsApi.getChannels(id!),
    enabled: !!id,
  });

  const { data: team = [], isLoading: teamLoading } = useQuery({
    queryKey: ['campaign-team', id],
    queryFn: () => campaignsApi.getCampaignTeam(id!),
    enabled: !!id && activeTab === 'team',
  });

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ['campaign-conversations', id],
    queryFn: () => campaignsApi.getCampaignConversations(id!),
    enabled: !!id && activeTab === 'conversations',
  });

  const replyMutation = useMutation({
    mutationFn: async ({ conversationId, content, channel }: { conversationId: string; content: string; channel: string }) => {
      return await campaignsApi.sendConversationReply(conversationId, content, channel);
    },
    onSuccess: (_, { conversationId }) => {
      setReplyDrafts((prev) => ({ ...prev, [conversationId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['campaign-conversations', id] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to send reply');
    },
  });

  const togglePauseMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume') => {
      return await campaignsApi.toggleCampaignPause(id!, action);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Action failed');
    },
  });

  const toggleAgentMutation = useMutation({
    mutationFn: async ({ agentId, action }: { agentId: string; action: 'pause' | 'resume' }) => {
      return await campaignsApi.toggleAgent(id!, agentId, action);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-agents', id] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to toggle agent');
    },
  });

  const demoModeMutation = useMutation({
    mutationFn: () => campaignsApi.updateDemoMode(id!, { demo_mode: !campaign?.demo_mode, demo_recipient_email: demoRecipient || campaign?.demo_recipient_email }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  if (campLoading || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <div className="text-sm text-slate-400">Loading campaign details...</div>
      </div>
    );
  }

  const isPaused = campaign.status === 'PAUSED';

  // Compute funnel stats from actual prospects data
  const totalDiscovered = prospects.length;
  const researchedCount = prospects.filter(p => ['RESEARCHED', 'QUALIFIED', 'CONTACTED'].includes(p.prospect.lifecycle_status)).length;
  const icpFitCount = prospects.filter(p => p.association.qualification_status === 'QUALIFIED' || p.association.qualification_score >= 60).length;
  const contactedCount = analytics?.outreach_sent || prospects.filter(p => p.association.current_stage === 'CONTACTED').length;
  const meetingsCount = prospects.filter(p => p.association.current_stage === 'MEETING_INTENT').length;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => togglePauseMutation.mutate(isPaused ? 'resume' : 'pause')}
            disabled={togglePauseMutation.isPending}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isPaused
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? 'Resume Campaign' : 'Pause Campaign'}
          </button>
        </div>
      </div>

      {/* Campaign Header Card */}
      <div className="bg-[#0c0e1f] border border-purple-500/15 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">{campaign.name}</h1>
              <StatusBadge status={campaign.status === 'LIVE' ? 'Active' : campaign.status} />
            </div>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              {campaign.description || 'Autonomous outbound SDR campaign with policy-governed orchestration.'}
            </p>
          </div>

          <div className="text-right text-xs space-y-1 text-slate-400">
            <div><span className="text-slate-500">Geography:</span> <span className="text-slate-200 font-medium">{campaign.target_geography || 'Global'}</span></div>
            <div><span className="text-slate-500">Target Roles:</span> <span className="text-slate-200 font-medium">{campaign.target_roles.join(', ') || 'Any'}</span></div>
            <div><span className="text-slate-500">Industries:</span> <span className="text-slate-200 font-medium">{campaign.target_industries.join(', ') || 'Any'}</span></div>
            <div><span className="text-slate-500">Daily Limit:</span> <span className="text-purple-300 font-semibold">{campaign.daily_outreach_limit} / day</span></div>
          </div>
        </div>

        {/* Paused Banner Notification */}
        {isPaused && (
          <div className="mt-4 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              Campaign is currently paused by manager. Active conversations may continue to completion, but no new automated outbound outreach will execute.
            </span>
          </div>
        )}
        <div className={`mt-4 p-3 rounded-xl border text-xs flex flex-wrap items-center gap-3 ${campaign.demo_mode ? 'bg-amber-950/30 border-amber-500/40 text-amber-200' : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200'}`}>
          <strong>{campaign.demo_mode ? 'DEMO MODE ACTIVE' : 'LIVE DELIVERY'}</strong>
          {campaign.demo_mode && <span>Outbound email redirects to {campaign.demo_recipient_email}; prospect-specific content is preserved.</span>}
          <input value={demoRecipient} onChange={(event) => setDemoRecipient(event.target.value)} placeholder="demo-recipient@example.com" className="px-2 py-1 rounded bg-[#070811] border border-purple-500/30 text-white" />
          <button onClick={() => demoModeMutation.mutate()} disabled={demoModeMutation.isPending || ( !campaign.demo_mode && !(demoRecipient || campaign.demo_recipient_email))} className="px-3 py-1 rounded bg-purple-600 text-white font-semibold disabled:opacity-50">
            {campaign.demo_mode ? 'Disable Demo Mode' : 'Enable Demo Mode'}
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-purple-500/10 pb-1">
        {[
          { id: 'overview', label: 'Funnel Overview', icon: Layers },
          { id: 'prospects', label: `Prospects (${prospects.length})`, icon: Users },
          { id: 'team', label: 'Team', icon: Users },
          { id: 'conversations', label: 'Open Conversations', icon: MessageSquare },
          { id: 'agents', label: `Agents & Channels (${agents.length})`, icon: Bot },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#12152d]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Funnel Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{totalDiscovered}</div>
              <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">Discovered</div>
            </div>
            <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-purple-300">{researchedCount}</div>
              <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">Researched</div>
            </div>
            <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{icpFitCount}</div>
              <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">ICP Fit</div>
            </div>
            <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">{contactedCount}</div>
              <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">Contacted</div>
            </div>
            <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-300">{meetingsCount}</div>
              <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">Meetings</div>
            </div>
          </div>

          <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Policy Instructions</h3>
            <p className="text-sm text-slate-300 leading-relaxed font-mono bg-[#070811] p-4 rounded-xl border border-purple-500/10">
              {campaign.instructions || 'Standard deterministic policy rules apply.'}
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Prospects Table */}
      {activeTab === 'prospects' && (
        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-purple-500/10 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-[#090b1a]">
                  <th className="py-3.5 px-5">Contact</th>
                  <th className="py-3.5 px-4">Title & Organization</th>
                  <th className="py-3.5 px-4">Fit Score</th>
                  <th className="py-3.5 px-4">Stage</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Deep Dive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5 text-sm">
                {prospects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                      No prospects assigned to this campaign yet.
                    </td>
                  </tr>
                ) : (
                  prospects.map(({ prospect: p, association: a }) => {
                    const companyName = p.metadata_?.company_name || p.website || p.industry;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/campaigns/${campaign.id}/prospects/${p.id}`)}
                        className="hover:bg-[#121633] transition-colors cursor-pointer group"
                      >
                        <td className="py-4 px-5">
                          <div className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                            {p.first_name} {p.last_name}
                          </div>
                          <div className="text-xs text-slate-400">{p.email}</div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-slate-200 text-xs font-medium">{p.title}</div>
                          <div className="text-xs text-slate-400">{companyName}</div>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`text-xs font-bold ${a.qualification_score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {a.qualification_score ? `${Math.round(a.qualification_score)}%` : '—'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-300">
                          {a.current_stage}
                        </td>
                        <td className="py-4 px-4">
                          <StatusBadge status={p.lifecycle_status} />
                        </td>
                        <td className="py-4 px-5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/campaigns/${campaign.id}/prospects/${p.id}`);
                            }}
                            className="px-3 py-1 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white text-xs font-semibold transition-all"
                          >
                            Research & ICP
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Team — who's working this campaign and which prospect each rep is talking to */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          {teamLoading && <div className="text-sm text-slate-400">Loading team...</div>}
          {!teamLoading && !team.length && (
            <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-8 text-center text-slate-500 text-sm">
              No representatives assigned to this campaign yet.
            </div>
          )}
          {team.map((row) => (
            <div key={row.representative.id} className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600/40 to-indigo-700/40 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-200">
                    {row.representative.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm">{row.representative.name}</div>
                    <div className="text-xs text-slate-400">{row.representative.email}</div>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  {row.leads.length} prospect{row.leads.length === 1 ? '' : 's'} assigned
                  {row.assignment.daily_send_limit != null && ` · limit ${row.assignment.daily_send_limit}/day`}
                </div>
              </div>
              {row.leads.length === 0 ? (
                <p className="text-xs text-slate-500">No prospects assigned to this rep yet.</p>
              ) : (
                <div className="divide-y divide-purple-500/5">
                  {row.leads.map((lead) => (
                    <div key={lead.prospect.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-200">{lead.prospect.first_name} {lead.prospect.last_name}</div>
                        <div className="text-xs text-slate-500">{lead.prospect.title} · {lead.stage}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={lead.qualification_status} />
                        {lead.conversation_status && <StatusBadge status={lead.conversation_status} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Open Conversations — every thread still mid-flow, replyable even while paused */}
      {activeTab === 'conversations' && (
        <div className="space-y-4">
          {isPaused && (
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              Campaign is paused — you can still finish these threads. No new prospects will enter this campaign until it resumes.
            </div>
          )}
          {conversationsLoading && <div className="text-sm text-slate-400">Loading conversations...</div>}
          {!conversationsLoading && !conversations.filter((c) => c.status === 'OPEN' || c.status === 'MEETING_INTENT').length && (
            <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-8 text-center text-slate-500 text-sm">
              No open conversations right now.
            </div>
          )}
          {conversations.filter((c) => c.status === 'OPEN' || c.status === 'MEETING_INTENT').map((conv) => (
            <div key={conv.id} className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <div className="font-semibold text-white text-sm">
                    {conv.prospect ? `${conv.prospect.first_name} ${conv.prospect.last_name}` : 'Prospect'}
                  </div>
                  <div className="text-xs text-slate-400">{conv.prospect?.title}</div>
                </div>
                <StatusBadge status={conv.status} />
              </div>
              {conv.last_message && (
                <p className="text-sm text-slate-300 bg-[#070811] border border-purple-500/10 rounded-xl p-3 mb-3">
                  {conv.last_message.content}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  value={replyDrafts[conv.id] || ''}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [conv.id]: e.target.value }))}
                  placeholder="Write a reply..."
                  className="flex-1 px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => replyMutation.mutate({ conversationId: conv.id, content: (replyDrafts[conv.id] || '').trim(), channel: conv.last_message?.channel || 'email' })}
                  disabled={!replyDrafts[conv.id]?.trim() || replyMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  Reply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 5: Agents & Channels */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400 mb-2">
            Notice: <span className="text-purple-300 font-semibold">ICP Fitment</span> is deterministic backend engine logic, while discovery and research use agent execution layers.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map(({ agent: a }) => {
              const isDeterministic = a.agent_type === 'ICP_FITMENT';
              return (
                <div
                  key={a.id}
                  className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDeterministic ? 'bg-indigo-950/60 border border-indigo-500/40 text-indigo-300' : 'bg-purple-950/60 border border-purple-500/40 text-purple-300'}`}>
                      {isDeterministic ? <Sparkles className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm">{a.agent_type.replace('_', ' ')}</div>
                      <div className="text-[11px] text-slate-400">
                        {isDeterministic ? 'Deterministic Backend Engine (icp-fitment-v1)' : 'Autonomous Agent Worker'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.enabled ? 'Active' : 'Paused'} />
                    <button
                      onClick={() =>
                        toggleAgentMutation.mutate({
                          agentId: a.id,
                          action: a.enabled ? 'pause' : 'resume',
                        })
                      }
                      disabled={toggleAgentMutation.isPending}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-purple-500/20 bg-[#12152d] hover:border-purple-500/50 text-slate-300 transition-colors"
                    >
                      {a.enabled ? 'Pause' : 'Enable'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Channel Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {channels.map((ch) => {
                const Icon = CHANNEL_ICON[ch.channel] || MessageSquare;
                return (
                  <div key={ch.channel} className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-950/60 border border-blue-500/40 text-blue-300">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm capitalize">{ch.channel}</div>
                        <div className="text-[11px] text-slate-400">Daily limit: {ch.daily_limit} · {ch.approval_required ? 'Approval required' : 'No approval required'}</div>
                      </div>
                    </div>
                    <StatusBadge status={ch.enabled ? 'Active' : 'Paused'} />
                  </div>
                );
              })}
              {!channels.length && (
                <div className="text-xs text-slate-500 md:col-span-2">No channels configured for this campaign.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
