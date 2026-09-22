import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Lock } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { StatusBadge } from '../../components/ui/StatusBadge';

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };
const AGENT_ORDER = ['DISCOVERY', 'ICP_FITMENT', 'RESEARCH', 'CONVERSATION', 'PERSONALIZATION'];
const AGENT_LABEL: Record<string, string> = { DISCOVERY: 'Discovery', ICP_FITMENT: 'ICP Fitment', RESEARCH: 'Research', CONVERSATION: 'Conversation', PERSONALIZATION: 'Personalization' };

const FUNNEL_COLORS = ['bg-purple-500', 'bg-purple-400', 'bg-blue-500', 'bg-blue-400', 'bg-blue-300', 'bg-emerald-400'];

const PipelineFunnel: React.FC<{ funnel: Array<{ stage: string; count: number }> }> = ({ funnel }) => {
  const withPct = funnel.map((s, i) => ({ ...s, pct: i === 0 ? 100 : funnel[i - 1].count ? Math.round((s.count / funnel[i - 1].count) * 1000) / 10 : 0 }));
  return (
    <div>
      <div className="grid grid-cols-6 gap-2 mb-1.5">
        {withPct.map((s) => (
          <div key={s.stage} className="min-w-0">
            <span className="text-base font-bold text-white">{s.count.toLocaleString()}</span>
            <span className="text-[10px] text-slate-500 ml-1">{s.pct}%</span>
          </div>
        ))}
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {withPct.map((s, i) => <div key={s.stage} style={{ flex: Math.max(s.count, 1) }} className={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />)}
      </div>
      <div className="grid grid-cols-6 gap-2 mt-1.5">
        {withPct.map((s) => (
          <div key={s.stage} className="min-w-0 text-[10px] text-slate-500 uppercase tracking-wide truncate" title={s.stage}>{s.stage}</div>
        ))}
      </div>
    </div>
  );
};

const CHANNEL_ORDER = ['linkedin', 'email', 'message', 'voice'];

const OutreachByChannel: React.FC<{ breakdown: Array<{ channel: string; count: number }> }> = ({ breakdown }) => {
  const countByChannel: Record<string, number> = {};
  breakdown.forEach((b) => { countByChannel[b.channel] = b.count; });
  const bars = CHANNEL_ORDER.map((channel) => ({ channel, count: countByChannel[channel] || 0 }));
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="flex items-end justify-between gap-4 h-40 mt-4">
      {bars.map((b) => (
        <div key={b.channel} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
          <span className="text-xs text-slate-300 font-medium">{b.count}</span>
          <div className={`w-full max-w-[64px] rounded-t ${b.channel === 'email' ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ height: `${Math.max(6, (b.count / max) * 100)}%` }} />
          <span className="text-[11px] text-slate-500">{CHANNEL_LABEL[b.channel] || b.channel}</span>
        </div>
      ))}
    </div>
  );
};

export const RepresentativeCampaignDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<'overview' | 'agents' | 'team'>('overview');
  const { data, isLoading, error } = useQuery({ queryKey: ['rep-campaign-detail', id], queryFn: () => representativeApi.campaignDetail(id!), enabled: !!id, refetchInterval: 20000 });

  if (isLoading) return <div className="text-slate-400">Loading campaign…</div>;
  if (error || !data) return <div className="text-rose-300">Unable to load this campaign, or you're not assigned to it.</div>;

  const { campaign, owner_name, days_live, funnel, messages_sent, positive_replies, meetings_booked, channel_breakdown, prompt_version, approval_required, enabled_agents, team } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link to="/rep/campaigns" className="hover:text-slate-300">Campaigns</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slate-300">{campaign.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-serif italic font-medium text-white tracking-tight">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {campaign.target_roles?.join(', ') || 'Configured ICP'} · {campaign.company_size?.min ?? 0}–{campaign.company_size?.max ?? '∞'} employees
            {owner_name ? ` · Owner: ${owner_name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button disabled title="Managed by your campaign owner" className="px-3 py-1.5 text-xs rounded-lg border border-purple-500/15 text-slate-500 flex items-center gap-1.5 cursor-not-allowed"><Lock className="w-3 h-3" />Edit campaign</button>
          <button disabled title="Managed by your campaign owner" className="px-3 py-1.5 text-xs rounded-lg bg-purple-950/40 border border-purple-500/20 text-slate-500 flex items-center gap-1.5 cursor-not-allowed"><Lock className="w-3 h-3" />{campaign.status === 'PAUSED' ? 'Resume campaign' : 'Pause campaign'}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Messages sent</div>
          <div className="text-2xl font-bold text-white">{messages_sent.toLocaleString()}</div>
        </div>
        <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Positive replies</div>
          <div className="text-2xl font-bold text-white">{positive_replies.toLocaleString()}</div>
        </div>
        <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Meetings booked</div>
          <div className="text-2xl font-bold text-emerald-400">{meetings_booked}</div>
        </div>
        <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Campaign status</div>
          <div className="text-lg font-bold text-white">{campaign.status === 'LIVE' ? 'Live' : campaign.status} · {days_live} day{days_live === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Pipeline funnel</h3>
          <span className="text-[11px] text-slate-500">Live totals across the campaign</span>
        </div>
        <PipelineFunnel funnel={funnel} />
      </div>

      <div className="flex gap-2 border-b border-purple-500/10 pb-2">
        {[['overview', 'Overview'], ['agents', 'Agent activity'], ['team', 'Team']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as any)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${tab === key ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-[#12152d]'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white">Outreach by channel</h3>
            <p className="text-xs text-slate-500 mt-0.5">Messages sent across each channel in this campaign.</p>
            <OutreachByChannel breakdown={channel_breakdown} />
          </div>
          <div className="space-y-4">
            <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Prompt version</div>
              {prompt_version ? (
                <>
                  <div className="text-sm font-semibold text-white">{prompt_version.version}</div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{prompt_version.description}</p>
                </>
              ) : <p className="text-xs text-slate-500">No campaign-specific prompt version is active — the default agent prompt is in use.</p>}
            </div>
            <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Approval setting</div>
              <div className="text-sm text-slate-200">{approval_required ? 'Require rep approval before send' : 'No approval required before send'}</div>
              <span className={`inline-block mt-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${approval_required ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400'}`}>{approval_required ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl p-5 space-y-2.5">
          {AGENT_ORDER.filter((a) => (enabled_agents || []).includes(a)).map((a) => (
            <div key={a} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#070811] border border-[#7C3AED]">
              <span className="text-sm text-slate-200">{AGENT_LABEL[a]}</span>
              <StatusBadge status="Active" />
            </div>
          ))}
          {!(enabled_agents || []).length && <p className="text-xs text-slate-500">No agents are enabled on this campaign.</p>}
        </div>
      )}

      {tab === 'team' && (
        <div className="bg-[#0d0f22] border border-[#7C3AED] rounded-xl divide-y divide-purple-500/5">
          {(team || []).map((row: any) => (
            <div key={row.representative.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/40 to-indigo-700/40 border border-purple-500/30 flex items-center justify-center text-[11px] font-bold text-purple-200">
                  {row.representative.name.split(' ').map((p: string) => p[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{row.representative.name}{row.is_you ? <span className="text-purple-400 font-normal"> (you)</span> : ''}</div>
                  <div className="text-xs text-slate-500">{row.representative.email}</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">{row.assigned_leads} assigned lead{row.assigned_leads === 1 ? '' : 's'}{row.daily_send_limit != null ? ` · limit ${row.daily_send_limit}/day` : ''}</div>
            </div>
          ))}
          {!(team || []).length && <p className="text-xs text-slate-500 px-5 py-6">No representatives assigned to this campaign yet.</p>}
        </div>
      )}
    </div>
  );
};
