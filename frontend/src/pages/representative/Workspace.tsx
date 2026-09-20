import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, ChevronDown, MessageSquare, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { conversationsApi } from '../../api/conversations';
import { controlApi } from '../../api/control';
import { MetricCard } from '../../components/ui/MetricCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AlertBanner } from '../../components/ui/AlertBanner';

const rejectReasons = ['WRONG_PERSONA', 'IRRELEVANT_HOOK', 'WRONG_INFORMATION', 'DUPLICATE_ACCOUNT', 'OTHER'];
const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };

const ConversationThread: React.FC<{ item: any; paused: boolean }> = ({ item, paused }) => {
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const conversationId = item.conversation.id;
  const { data: messages, isLoading } = useQuery({ queryKey: ['rep-conversation-messages', conversationId], queryFn: () => conversationsApi.getMessages(conversationId) });
  const reply = useMutation({
    mutationFn: () => conversationsApi.sendReply(conversationId, draft),
    onSuccess: () => { setDraft(''); client.invalidateQueries({ queryKey: ['rep-conversation-messages', conversationId] }); client.invalidateQueries({ queryKey: ['rep-workspace'] }); },
  });
  const replyError = reply.isError ? (reply.error as any)?.message || 'Failed to send reply' : null;
  return (
    <div className="border-t border-purple-500/10 bg-[#070811] p-4 space-y-3">
      {paused && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/20 border border-amber-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Campaign paused — you can finish this conversation, but no new prospects will enter this campaign until resumed.
        </div>
      )}
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {isLoading && <p className="text-xs text-slate-500">Loading messages…</p>}
        {messages?.map((m: any) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${m.direction === 'INBOUND' ? 'bg-[#12152d] text-slate-200' : 'bg-purple-900/40 text-purple-100 ml-auto'}`}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{m.direction === 'INBOUND' ? 'Prospect' : 'You'} · {m.channel}</div>
            {m.content}
          </div>
        ))}
        {messages && messages.length === 0 && <p className="text-xs text-slate-500">No messages yet.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a reply…"
          className="flex-1 bg-[#0d0f22] border border-purple-500/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500"
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) reply.mutate(); }}
        />
        <button
          disabled={!draft.trim() || reply.isPending}
          onClick={() => reply.mutate()}
          className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />Reply
        </button>
      </div>
      {replyError && <p className="text-[11px] text-rose-300">{replyError}</p>}
    </div>
  );
};

const ApprovalContextDrawer: React.FC<{ approvalId: string }> = ({ approvalId }) => {
  const { data, isLoading } = useQuery({ queryKey: ['rep-approval-context', approvalId], queryFn: () => representativeApi.approvalContext(approvalId) });
  if (isLoading) return <p className="text-xs text-slate-500 mt-2">Loading context…</p>;
  if (!data) return null;
  return (
    <div className="mt-3 rounded-lg border border-purple-500/15 bg-[#070811] p-3 space-y-2 text-xs">
      <div className="text-slate-300"><span className="text-slate-500">Agent:</span> {data.agent}{data.prompt_version ? ` · Prompt v${data.prompt_version}` : ''}</div>
      {data.agent_run && <div className="text-slate-300"><span className="text-slate-500">Engine:</span> {data.agent_run.engine_version || data.agent_run.provider || data.agent_run.status}</div>}
      {data.rag_context.length > 0 ? (
        <div>
          <div className="text-slate-500 mb-1">RAG context used:</div>
          <ul className="space-y-1">
            {data.rag_context.map((r) => (
              <li key={r.document_id} className="text-slate-400"><span className="text-slate-300 font-medium">{r.title}:</span> {r.content.slice(0, 140)}{r.content.length > 140 ? '…' : ''}</li>
            ))}
          </ul>
        </div>
      ) : <div className="text-slate-500">No knowledge base documents were retrieved for this draft.</div>}
    </div>
  );
};

export const RepresentativeWorkspace: React.FC = () => {
  const location = useLocation(); const navigate = useNavigate(); const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null); const [draft, setDraft] = useState('');
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['rep-workspace'], queryFn: representativeApi.workspace, refetchInterval: 15000 });
  const { data: killSwitch } = useQuery({ queryKey: ['kill-switch'], queryFn: controlApi.getKillSwitch, refetchInterval: 15000 });
  const killSwitchActive = !!killSwitch?.global_kill_switch;
  const action = useMutation({ mutationFn: async ({ kind, id, value }: any) => kind === 'approve' ? representativeApi.approve(id) : kind === 'edit' ? representativeApi.editApprove(id, value) : representativeApi.reject(id, value), onSuccess: () => { setEditing(null); client.invalidateQueries({ queryKey: ['rep-workspace'] }); client.invalidateQueries({ queryKey: ['rep-approvals'] }); } });
  if (isLoading) return <div className="text-slate-400">Loading your workspace…</div>;
  if (error || !data) return <div className="text-rose-300">Unable to load your assigned workspace.</div>;
  const tab = location.pathname.includes('conversations') ? 'conversations' : location.pathname.includes('approvals') ? 'approvals' : 'queue';
  const { metrics } = data; const atCapacity = metrics.capacity_used >= metrics.capacity_limit;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-white">My Queue</h1><p className="text-sm text-slate-400">All assigned work at a glance.</p></div>
    {killSwitchActive && <AlertBanner type="critical" message="All outbound activity has been stopped platform-wide by an administrator." />}
    {atCapacity && <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200"><AlertTriangle className="inline w-4 h-4 mr-2" />Daily sending capacity reached: {metrics.capacity_used}/{metrics.capacity_limit} units used.</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard value={metrics.pending_approvals} label="Pending approvals" color="purple" /><MetricCard value={metrics.active_conversations} label="Active conversations" color="amber" /><MetricCard value={metrics.meetings_booked} label="Meetings booked" color="emerald" /><MetricCard value={`${metrics.capacity_used} / ${metrics.capacity_limit}`} label="Daily sending capacity" subtext={`${metrics.capacity_used}/${metrics.capacity_limit} units used · ${metrics.capacity_remaining} remaining`} color={atCapacity ? 'rose' : 'default'} />
    </div>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-purple-500/10 bg-[#0d0f22] p-3">
      <span className="text-[11px] uppercase tracking-wider text-slate-500 mr-1">Agent status</span>
      {metrics.channel_status?.map((c: any) => (
        <span key={c.channel} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${c.live ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/80 border-slate-700/60 text-slate-400'}`}>
          {CHANNEL_LABEL[c.channel] || c.channel}: {c.live ? 'Live' : 'Paused'}
        </span>
      ))}
    </div>
    <div className="flex gap-2 border-b border-purple-500/10 pb-2">{[['queue','Overview'],['approvals','Approvals'],['conversations','Conversations']].map(([key,label]) => <button key={key} onClick={() => navigate(key === 'queue' ? '/rep' : `/rep/${key}`)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${tab === key ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-[#12152d]'}`}>{label}</button>)}</div>
    {tab === 'queue' && <><h2 className="font-semibold text-white">Assigned campaigns</h2><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{(data.campaigns || []).map((item: any) => <div key={item.campaign.id} className={`rounded-xl border p-4 ${item.campaign.status === 'PAUSED' ? 'opacity-60 border-amber-500/30 bg-amber-950/10' : 'border-purple-500/20 bg-[#0d0f22]'}`}><div className="flex justify-between gap-2"><strong className="text-sm text-white">{item.campaign.name}</strong><StatusBadge status={item.campaign.status} /></div><p className="text-xs text-slate-400 mt-2">{item.campaign.target_roles?.join(', ') || 'Configured ICP'} · {item.campaign.target_industries?.join(', ') || 'All industries'}</p><p className="text-xs text-slate-300 mt-3">{item.channels.map((c:any) => `${CHANNEL_LABEL[c.channel] || c.channel} ${c.enabled ? 'LIVE' : 'PAUSED'}`).join(' · ')}</p><p className="text-xs text-purple-300 mt-2">{item.workload} assigned leads{item.campaign.status !== 'PAUSED' ? ` · ${item.open_conversations} conversations still open` : ''}</p>{item.campaign.status === 'PAUSED' && item.open_conversations > 0 && (<div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-950/50 border border-amber-500/30 text-amber-300 text-[11px] font-medium"><AlertTriangle className="w-3 h-3" />{item.open_conversations} conversation{item.open_conversations === 1 ? '' : 's'} still open, you can reply</div>)}{item.campaign.status === 'PAUSED' && item.open_conversations === 0 && (<span className="block mt-2 text-[11px] text-amber-400">Paused by Manager</span>)}{item.has_conflict && (<div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-950/50 border border-rose-500/30 text-rose-300 text-[11px] font-medium"><ShieldAlert className="w-3 h-3" />Conflict: a prospect here is also active in another campaign</div>)}</div>)}</div></>}
    {tab === 'approvals' && <div className="space-y-3">{(data.approvals || []).map((item:any) => <div key={item.approval.id} className="rounded-xl border border-purple-500/15 bg-[#0d0f22] p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="font-semibold text-white">{item.prospect.first_name} {item.prospect.last_name} <span className="text-slate-400 font-normal">· {item.campaign.name}</span></div><div className="text-xs text-slate-400 mt-1">{item.prospect.title} · {item.prospect.industry} · {CHANNEL_LABEL[item.approval.payload?.channel] || item.approval.payload?.channel || 'Email'}</div><div className="text-xs text-emerald-300 mt-1">Fit {Math.round(item.association.qualification_score || 0)}{item.association.qualification_reason ? ` — ${item.association.qualification_reason}` : ''}</div>{item.conflict && <div className="text-[11px] text-rose-300 mt-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />Also active in {item.conflict.other_campaign_name}</div>}</div><StatusBadge status={item.approval.payload?.priority || 'PENDING'} /></div><p className="text-sm text-slate-200 mt-3 whitespace-pre-line">{editing === item.approval.id ? <textarea className="w-full min-h-28 bg-[#070811] border border-purple-500/30 rounded p-2" value={draft} onChange={e=>setDraft(e.target.value)} /> : item.approval.payload?.message || item.approval.payload?.summary}</p><div className="flex flex-wrap items-center gap-2 mt-3"><button disabled={atCapacity || killSwitchActive || action.isPending} title={killSwitchActive ? 'Disabled: global kill switch is active' : undefined} onClick={()=>action.mutate({kind:'approve',id:item.approval.id})} className="px-3 py-1.5 text-xs rounded bg-emerald-700 text-white disabled:opacity-50"><Check className="inline w-3 h-3 mr-1" />Approve</button><button onClick={()=>{setEditing(item.approval.id);setDraft(item.approval.payload?.message || '')}} className="px-3 py-1.5 text-xs rounded bg-purple-700 text-white">Edit</button>{editing===item.approval.id && <button disabled={atCapacity || killSwitchActive} title={killSwitchActive ? 'Disabled: global kill switch is active' : undefined} onClick={()=>action.mutate({kind:'edit',id:item.approval.id,value:draft})} className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white disabled:opacity-50">Edit & Approve</button>}<select onChange={e=>e.target.value && action.mutate({kind:'reject',id:item.approval.id,value:e.target.value})} defaultValue="" className="text-xs bg-[#070811] border border-rose-500/30 rounded px-2 text-rose-200"><option value="">Reject…</option>{rejectReasons.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select><button onClick={()=>setExpandedContext(expandedContext===item.approval.id?null:item.approval.id)} className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"><Sparkles className="w-3.5 h-3.5" />Context<ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedContext===item.approval.id ? 'rotate-180' : ''}`} /></button></div>{expandedContext === item.approval.id && <ApprovalContextDrawer approvalId={item.approval.id} />}</div>)}{!(data.approvals || []).length && <p className="text-slate-400">No approvals waiting for you.</p>}</div>}
    {tab === 'conversations' && <div className="space-y-3">{(data.conversations || []).map((item:any) => { const paused = item.campaign.status === 'PAUSED'; const expanded = expandedConversation === item.conversation.id; return <div key={item.conversation.id} className="rounded-xl border border-purple-500/15 bg-[#0d0f22] overflow-hidden"><button onClick={() => setExpandedConversation(expanded ? null : item.conversation.id)} className="w-full flex justify-between p-4 text-left"><div><div className="font-semibold text-white">{item.prospect.first_name} {item.prospect.last_name}</div><div className="text-xs text-slate-400 mt-1">{item.campaign.name} · {item.prospect.title}</div>{paused && <p className="text-xs text-amber-300 mt-2">Campaign paused — you can finish this conversation, but no new prospects will enter.</p>}</div><div className="flex items-center gap-2"><StatusBadge status={item.conversation.status} /><MessageSquare className="w-4 h-4 text-purple-300" /><ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} /></div></button>{expanded && <ConversationThread item={item} paused={paused} />}</div>; })}{!(data.conversations || []).length && <p className="text-slate-400">No assigned conversations.</p>}</div>}
  </div>;
};
