import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronDown, Search, ShieldAlert, Sparkles } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { controlApi } from '../../api/control';
import { AlertBanner } from '../../components/ui/AlertBanner';

const rejectReasons = ['WRONG_PERSONA', 'IRRELEVANT_HOOK', 'WRONG_INFORMATION', 'DUPLICATE_ACCOUNT', 'OTHER'];
const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };

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
          <div className="text-slate-500 mb-1.5 uppercase tracking-wider text-[10px] font-semibold">RAG context used</div>
          <ul className="space-y-1.5">
            {data.rag_context.map((r: any) => (
              <li key={r.document_id} className="text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span>
                  <span className="text-slate-200 font-medium">{r.title}</span>
                  {typeof r.score === 'number' && <span className="text-[10px] text-slate-500">relevance {r.score}</span>}
                  <span className="text-[10px] text-slate-600 font-mono ml-auto">{r.document_id.slice(0, 8)}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 ml-5">{r.content.slice(0, 140)}{r.content.length > 140 ? '…' : ''}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : <div className="text-slate-500">No knowledge base documents were retrieved for this draft.</div>}
    </div>
  );
};

export const RepresentativeApprovalInbox: React.FC = () => {
  const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({ queryKey: ['rep-workspace'], queryFn: representativeApi.workspace, refetchInterval: 15000 });
  const { data: killSwitch } = useQuery({ queryKey: ['kill-switch'], queryFn: controlApi.getKillSwitch, refetchInterval: 15000 });
  const killSwitchActive = !!killSwitch?.global_kill_switch;

  const invalidate = () => { client.invalidateQueries({ queryKey: ['rep-workspace'] }); client.invalidateQueries({ queryKey: ['rep-approvals'] }); };
  const action = useMutation({
    mutationFn: async ({ kind, id, value }: any) => kind === 'approve' ? representativeApi.approve(id) : kind === 'edit' ? representativeApi.editApprove(id, value) : representativeApi.reject(id, value),
    onSuccess: () => { setEditing(null); invalidate(); },
  });
  const batchApprove = useMutation({
    mutationFn: () => representativeApi.batchApprove(Array.from(selected)),
    onSuccess: () => { setSelected(new Set()); invalidate(); },
  });

  if (isLoading) return <div className="text-slate-400">Loading your approval inbox…</div>;
  if (error || !data) return <div className="text-rose-300">Unable to load your assigned workspace.</div>;

  const { metrics } = data; const atCapacity = metrics.capacity_used >= metrics.capacity_limit;
  const approvals = (data.approvals || []) as any[];

  const q = search.trim().toLowerCase();
  const filtered = approvals.filter((item) => {
    if (!q) return true;
    return `${item.prospect.first_name} ${item.prospect.last_name} ${item.campaign.name}`.toLowerCase().includes(q);
  });

  const sortedByFit = [...filtered].sort((a, b) => (b.association.qualification_score || 0) - (a.association.qualification_score || 0));
  const hotLeadIds = new Set(sortedByFit.slice(0, Math.min(2, sortedByFit.length)).filter((i) => (i.association.qualification_score || 0) >= 80).map((i) => i.approval.id));

  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.approval.id)));
  const toggleOne = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif italic font-semibold text-white tracking-tight">Approval Inbox</h1>
        <p className="text-sm text-slate-400 mt-1">{approvals.length} draft{approvals.length === 1 ? '' : 's'} waiting for your review{hotLeadIds.size ? `. ${hotLeadIds.size} hot lead${hotLeadIds.size === 1 ? '' : 's'} at the top.` : '.'}</p>
      </div>

      {killSwitchActive && <AlertBanner type="critical" message="All outbound activity has been stopped platform-wide by an administrator." />}
      {atCapacity && <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200"><AlertTriangle className="inline w-4 h-4 mr-2" />Daily sending capacity reached: {metrics.capacity_used}/{metrics.capacity_limit} units used.</div>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospects, campaigns…" className="w-full bg-[#0d0f22] border border-purple-500/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500" />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} className="rounded border-purple-500/30" />
          Select all
        </label>
        {selected.size > 0 && (
          <button disabled={atCapacity || killSwitchActive || batchApprove.isPending} onClick={() => batchApprove.mutate()} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-emerald-700 text-white disabled:opacity-50 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />Approve {selected.size} selected
          </button>
        )}
      </div>

      <div className="space-y-3">
        {sortedByFit.map((item: any) => (
          <div key={item.approval.id} className={`rounded-xl border p-4 ${hotLeadIds.has(item.approval.id) ? 'border-amber-500/30 bg-amber-950/5' : 'border-purple-500/15 bg-[#0d0f22]'}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={selected.has(item.approval.id)} onChange={() => toggleOne(item.approval.id)} className="mt-1.5 rounded border-purple-500/30" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  {hotLeadIds.has(item.approval.id) && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/40 text-amber-300">Hot Lead</span>}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/50 border border-purple-500/30 text-purple-300">{item.campaign.name}</span>
                  <span className="text-[11px] text-slate-500">Conversation · Follow-up · <span className="text-amber-400 font-medium">Personalization</span></span>
                </div>
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{item.prospect.first_name} {item.prospect.last_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{item.prospect.title}{item.prospect.title ? ' · ' : ''}{item.prospect.industry} · {CHANNEL_LABEL[item.approval.payload?.channel] || item.approval.payload?.channel || 'Email'}</div>
                    <div className="text-xs text-emerald-300 mt-1">Fit {Math.round(item.association.qualification_score || 0)}{item.association.qualification_reason ? ` — ${item.association.qualification_reason}` : ''}</div>
                    {item.conflict && <div className="text-[11px] text-rose-300 mt-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />Also active in {item.conflict.other_campaign_name}</div>}
                  </div>
                </div>
                <p className="text-sm text-slate-200 mt-3 whitespace-pre-line">
                  {editing === item.approval.id
                    ? <textarea className="w-full min-h-28 bg-[#070811] border border-purple-500/30 rounded p-2" value={draft} onChange={(e) => setDraft(e.target.value)} />
                    : item.approval.payload?.message || item.approval.payload?.summary}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button disabled={atCapacity || killSwitchActive || action.isPending} title={killSwitchActive ? 'Disabled: global kill switch is active' : undefined} onClick={() => action.mutate({ kind: 'approve', id: item.approval.id })} className="px-3 py-1.5 text-xs rounded bg-emerald-700 text-white disabled:opacity-50"><Check className="inline w-3 h-3 mr-1" />Approve</button>
                  <button onClick={() => { setEditing(item.approval.id); setDraft(item.approval.payload?.message || ''); }} className="px-3 py-1.5 text-xs rounded bg-purple-700 text-white">Edit</button>
                  {editing === item.approval.id && <button disabled={atCapacity || killSwitchActive} title={killSwitchActive ? 'Disabled: global kill switch is active' : undefined} onClick={() => action.mutate({ kind: 'edit', id: item.approval.id, value: draft })} className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white disabled:opacity-50">Edit &amp; Approve</button>}
                  <select onChange={(e) => e.target.value && action.mutate({ kind: 'reject', id: item.approval.id, value: e.target.value })} defaultValue="" className="text-xs bg-[#070811] border border-rose-500/30 rounded px-2 text-rose-200">
                    <option value="">Reject…</option>
                    {rejectReasons.map((x) => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}
                  </select>
                  <button onClick={() => setExpandedContext(expandedContext === item.approval.id ? null : item.approval.id)} className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
                    <Sparkles className="w-3.5 h-3.5" />Context<ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedContext === item.approval.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {expandedContext === item.approval.id && <ApprovalContextDrawer approvalId={item.approval.id} />}
              </div>
            </div>
          </div>
        ))}
        {!sortedByFit.length && <p className="text-slate-400">No approvals waiting for you.</p>}
      </div>
    </div>
  );
};
