import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, ShieldAlert } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { StatusBadge } from '../../components/ui/StatusBadge';

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };
const AGENT_ORDER = ['PERSONALIZATION', 'FOLLOW_UP', 'CONVERSATION'];
const AGENT_LABEL: Record<string, string> = { PERSONALIZATION: 'Personalization', FOLLOW_UP: 'Follow-up', CONVERSATION: 'Conversation' };

const AgentsCell: React.FC<{ enabledAgents: string[] }> = ({ enabledAgents }) => {
  const enabled = AGENT_ORDER.filter((a) => (enabledAgents || []).includes(a));
  if (!enabled.length) return <span className="text-slate-600">—</span>;
  return <>{enabled.map((a, i) => <span key={a} className={i === enabled.length - 1 ? 'text-amber-400 font-medium' : ''}>{AGENT_LABEL[a]}{i < enabled.length - 1 ? ' · ' : ''}</span>)}</>;
};

export const RepresentativeCampaigns: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const { data: workspace, isLoading, error } = useQuery({ queryKey: ['rep-workspace'], queryFn: representativeApi.workspace, refetchInterval: 15000 });
  const { data: monitoring } = useQuery({ queryKey: ['rep-monitoring'], queryFn: representativeApi.monitoring, refetchInterval: 20000 });

  const perf = useMemo(() => {
    const map: Record<string, any> = {};
    (monitoring?.performance_by_campaign || []).forEach((p: any) => { map[p.campaign_id] = p; });
    return map;
  }, [monitoring]);

  if (isLoading) return <div className="text-slate-400">Loading campaigns…</div>;
  if (error || !workspace) return <div className="text-rose-300">Unable to load your assigned campaigns.</div>;

  const rows = (workspace.campaigns || []).filter((item: any) => {
    const q = search.trim().toLowerCase();
    if (q && !item.campaign.name.toLowerCase().includes(q) && !(item.campaign.target_roles || []).join(' ').toLowerCase().includes(q)) return false;
    if (statusFilter !== 'all' && item.campaign.status !== statusFilter) return false;
    if (channelFilter !== 'all' && !item.channels.some((c: any) => c.channel === channelFilter)) return false;
    return true;
  });

  const totalCampaigns = (workspace.campaigns || []).length;
  const live = (workspace.campaigns || []).filter((c: any) => c.campaign.status === 'LIVE').length;
  const totalProspects = (workspace.campaigns || []).reduce((sum: number, c: any) => sum + c.workload, 0);
  const totalOutreach = Object.values(perf).reduce((sum: number, p: any) => sum + (p.outreach_sent || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif italic font-medium text-white tracking-tight">Campaigns</h1>
        <p className="text-sm text-slate-400 mt-1">Manage the campaigns, audiences and outreach assigned to you.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className="w-full bg-[#0d0f22] border border-purple-500/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4"><div className="text-2xl font-bold text-white">{totalCampaigns}</div><div className="text-xs text-slate-400 mt-1">Total campaigns</div></div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4"><div className="text-2xl font-bold text-emerald-400">{live}</div><div className="text-xs text-slate-400 mt-1">Live</div></div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4"><div className="text-2xl font-bold text-white">{totalProspects}</div><div className="text-xs text-slate-400 mt-1">Assigned prospects</div></div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4"><div className="text-2xl font-bold text-white">{totalOutreach}</div><div className="text-xs text-slate-400 mt-1">Outreach sent</div></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs bg-[#0d0f22] border border-purple-500/15 rounded-lg px-2.5 py-1.5 text-slate-300">
          <option value="all">All statuses</option>
          <option value="LIVE">Live</option>
          <option value="PAUSED">Paused</option>
          <option value="DRAFT">Draft</option>
        </select>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="text-xs bg-[#0d0f22] border border-purple-500/15 rounded-lg px-2.5 py-1.5 text-slate-300">
          <option value="all">All channels</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-500">{rows.length} campaign{rows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="rounded-xl border border-purple-500/10 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#0d0f22] text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Campaign</th>
              <th className="text-left font-medium px-4 py-2.5">ICP</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
              <th className="text-left font-medium px-4 py-2.5">Prospects</th>
              <th className="text-left font-medium px-4 py-2.5">Outreach sent</th>
              <th className="text-left font-medium px-4 py-2.5">Meetings booked</th>
              <th className="text-left font-medium px-4 py-2.5">Agents</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item: any) => {
              const p = perf[item.campaign.id];
              return (
                <tr key={item.campaign.id} onClick={() => navigate(`/rep/campaigns/${item.campaign.id}`)} className="border-t border-purple-500/5 hover:bg-[#12152d] cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-slate-100 font-semibold">{item.campaign.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.channels.map((c: any) => CHANNEL_LABEL[c.channel] || c.channel).join(' · ')}</div>
                    {item.has_conflict && <div className="text-[11px] text-rose-300 mt-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />Conflict</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 max-w-xs">{item.campaign.target_roles?.join(', ') || 'Configured ICP'} · {item.campaign.target_industries?.join(', ') || 'All industries'}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.campaign.status} /></td>
                  <td className="px-4 py-3 text-slate-200">{item.workload}</td>
                  <td className="px-4 py-3 text-slate-200">{p?.outreach_sent ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-200">{p?.meetings ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400"><AgentsCell enabledAgents={item.enabled_agents} /></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No campaigns match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
