import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { hurdlesApi } from '../../api/hurdles';
import { controlApi } from '../../api/control';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AlertBanner } from '../../components/ui/AlertBanner';

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };

function ageLabel(iso?: string): string {
  if (!iso) return '';
  const hrs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  return hrs < 1 ? '<1h ago' : `${hrs}h ago`;
}

export const RepresentativeOverview: React.FC = () => {
  const { currentUser } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['rep-workspace'], queryFn: representativeApi.workspace, refetchInterval: 15000 });
  const { data: hurdles } = useQuery({ queryKey: ['rep-hurdles'], queryFn: hurdlesApi.list, refetchInterval: 20000 });
  const { data: killSwitch } = useQuery({ queryKey: ['kill-switch'], queryFn: controlApi.getKillSwitch, refetchInterval: 15000 });

  if (isLoading) return <div className="text-slate-400">Loading your workspace…</div>;
  if (error || !data) return <div className="text-rose-300">Unable to load your assigned workspace.</div>;

  const { metrics } = data;
  const atCapacity = metrics.capacity_used >= metrics.capacity_limit;
  const firstName = (currentUser?.user?.name || '').split(' ')[0];
  const escalated = (hurdles || []).filter((h: any) => h.status !== 'RESOLVED');
  const oldestApproval = (data.approvals || [])[0]?.approval?.created_at;
  const openConvs = (data.conversations || []).filter((c: any) => c.conversation.status === 'OPEN');
  const oldestOpenConv = openConvs.length
    ? openConvs.reduce((min: any, c: any) => (new Date(c.conversation.created_at) < new Date(min.conversation.created_at) ? c : min), openConvs[0]).conversation.created_at
    : undefined;
  const oldestEscalation = escalated.length
    ? escalated.reduce((min: any, h: any) => (new Date(h.created_at) < new Date(min.created_at) ? h : min), escalated[0]).created_at
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Good Morning{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-slate-400 mt-1">All assigned work at a glance.</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-300">Live Operations</span>
      </div>

      {killSwitch?.global_kill_switch && <AlertBanner type="critical" message="All outbound activity has been stopped platform-wide by an administrator." />}
      {atCapacity && <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200"><AlertTriangle className="inline w-4 h-4 mr-2" />Daily sending capacity reached: {metrics.capacity_used}/{metrics.capacity_limit} units used.</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{metrics.pending_approvals}</div>
          <div className="text-sm text-slate-300 mt-1">Pending Approvals</div>
          {oldestApproval && <div className="text-[11px] text-rose-300 mt-1.5 font-medium">Oldest: {ageLabel(oldestApproval)}</div>}
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{metrics.active_conversations}</div>
          <div className="text-sm text-slate-300 mt-1">Replies Needing Attention</div>
          {oldestOpenConv && <div className="text-[11px] text-rose-300 mt-1.5 font-medium">Oldest: {ageLabel(oldestOpenConv)}</div>}
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{metrics.meetings_booked}</div>
          <div className="text-sm text-slate-300 mt-1">Meetings booked</div>
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{escalated.length}</div>
          <div className="text-sm text-slate-300 mt-1">AI Escalations</div>
          {oldestEscalation && <div className="text-[11px] text-amber-300 mt-1.5 font-medium">Oldest: {ageLabel(oldestEscalation)}</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-purple-500/10 bg-[#0d0f22] p-3">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 mr-1">Agent status</span>
        {metrics.channel_status?.map((c: any) => (
          <span key={c.channel} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${c.live ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/80 border-slate-700/60 text-slate-400'}`}>
            {CHANNEL_LABEL[c.channel] || c.channel}: {c.live ? 'Live' : 'Paused'}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Assigned campaigns</h2>
        <span className="text-xs text-slate-500">{(data.campaigns || []).length} campaign{(data.campaigns || []).length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(data.campaigns || []).map((item: any) => (
          <div key={item.campaign.id} className={`rounded-xl border p-4 ${item.campaign.status === 'PAUSED' ? 'opacity-70 border-amber-500/30 bg-amber-950/10' : 'border-purple-500/20 bg-[#0d0f22]'}`}>
            <div className="flex justify-between gap-2"><strong className="text-sm text-white">{item.campaign.name}</strong><StatusBadge status={item.campaign.status} /></div>
            <p className="text-xs text-slate-400 mt-2">{item.campaign.target_roles?.join(', ') || 'Configured ICP'} · {item.campaign.target_industries?.join(', ') || 'All industries'}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.channels.map((c: any) => (
                <span key={c.channel} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${c.enabled ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400'}`}>
                  {CHANNEL_LABEL[c.channel] || c.channel}: {c.enabled ? 'Live' : 'Paused'}
                </span>
              ))}
            </div>
            <p className="text-xs text-purple-300 mt-2">{item.workload} assigned leads{item.campaign.status !== 'PAUSED' ? ` · ${item.open_conversations} conversations still open` : ''}</p>
            {item.campaign.status === 'PAUSED' && item.open_conversations > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-950/50 border border-amber-500/30 text-amber-300 text-[11px] font-medium">
                <AlertTriangle className="w-3 h-3" />{item.open_conversations} conversation{item.open_conversations === 1 ? '' : 's'} still open, reply anytime
              </div>
            )}
            {item.campaign.status === 'PAUSED' && item.open_conversations === 0 && <span className="block mt-2 text-[11px] text-amber-400">Paused by Manager</span>}
            {item.has_conflict && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-950/50 border border-rose-500/30 text-rose-300 text-[11px] font-medium">
                <ShieldAlert className="w-3 h-3" />Conflict: a prospect here is also active in another campaign
              </div>
            )}
          </div>
        ))}
        {!(data.campaigns || []).length && <p className="text-slate-400">No active campaign assignments.</p>}
      </div>
    </div>
  );
};
