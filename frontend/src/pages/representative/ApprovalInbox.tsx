import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Mail, Search, ShieldAlert, Sparkles } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { controlApi } from '../../api/control';
import { AlertBanner } from '../../components/ui/AlertBanner';

const rejectReasons = ['WRONG_PERSONA', 'IRRELEVANT_HOOK', 'WRONG_INFORMATION', 'DUPLICATE_ACCOUNT', 'OTHER'];
const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };
const approvalActionClass = 'h-9 min-w-24 inline-flex items-center justify-center gap-1 px-3 text-xs font-semibold rounded-lg disabled:opacity-50';

const RejectSelect: React.FC<{ onReject: (reason: string) => void; className?: string }> = ({ onReject, className }) => (
  <select
    onChange={(e) => { if (e.target.value) { onReject(e.target.value); e.target.value = ''; } }}
    defaultValue=""
    className={className || `${approvalActionClass} bg-rose-700 text-white border-none appearance-none cursor-pointer`}
  >
    <option value="" disabled>Reject</option>
    {rejectReasons.map((x) => <option key={x} value={x} className="bg-[#0d0f22] text-rose-200">{x.replaceAll('_', ' ')}</option>)}
  </select>
);

const ContextUsedPanel: React.FC<{ approvalId: string }> = ({ approvalId }) => {
  const { data, isLoading } = useQuery({ queryKey: ['rep-approval-context', approvalId], queryFn: () => representativeApi.approvalContext(approvalId) });
  if (isLoading) return <p className="text-xs text-slate-500">Loading context…</p>;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />Context used
      </div>
      <div className="text-[10px] text-slate-500">{data.agent}{data.prompt_version ? ` · Prompt v${data.prompt_version}` : ''}</div>

      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Prospect summary</div>
        <p className="text-xs text-slate-300 leading-relaxed">{data.prospect_summary || 'No structured prospect summary available yet.'}</p>
      </div>

      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Research snippet</div>
        <div className="rounded-lg border border-purple-500/10 bg-[#070811] p-2.5 text-xs text-slate-300 leading-relaxed">
          {data.research_snippet || 'No research on file for this prospect yet.'}
        </div>
      </div>

      {data.conversation && data.conversation.messages?.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Past conversation</div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {data.conversation.messages.map((m: any) => (
              <div key={m.id} className={`text-xs p-2 rounded ${m.direction === 'INBOUND' ? 'bg-purple-950/30 text-purple-200' : 'bg-[#070811] text-slate-300'}`}>
                <span className="font-semibold">{m.direction === 'INBOUND' ? 'Prospect' : 'You'}:</span> {m.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.rag_context.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Knowledge base sources</div>
          <ul className="space-y-1.5">
            {data.rag_context.map((r: any) => (
              <li key={r.document_id} className="text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span>
                  <span className="text-slate-200 font-medium text-xs">{r.title}</span>
                  {typeof r.score === 'number' && <span className="text-[10px] text-slate-500">relevance {r.score}</span>}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 ml-5">{r.content.slice(0, 120)}{r.content.length > 120 ? '…' : ''}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const RepresentativeApprovalInbox: React.FC = () => {
  const client = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({ queryKey: ['rep-workspace'], queryFn: representativeApi.workspace, refetchInterval: 15000 });
  const { data: killSwitch } = useQuery({ queryKey: ['kill-switch'], queryFn: controlApi.getKillSwitch, refetchInterval: 15000 });
  const killSwitchActive = !!killSwitch?.global_kill_switch;

  const invalidate = () => { client.invalidateQueries({ queryKey: ['rep-workspace'] }); client.invalidateQueries({ queryKey: ['rep-approvals'] }); };
  const action = useMutation({
    mutationFn: async ({ kind, id, value }: any) => kind === 'approve' ? representativeApi.approve(id) : kind === 'edit' ? representativeApi.editApprove(id, value) : representativeApi.reject(id, value),
    onSuccess: () => { setExpandedId(null); invalidate(); },
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
  const toggleExpand = (item: any) => {
    if (expandedId === item.approval.id) { setExpandedId(null); return; }
    setExpandedId(item.approval.id);
    setDraftText(item.approval.payload?.message || item.approval.payload?.summary || '');
  };

  const isReviewingDraft = expandedId !== null;

  return (
    <div className="space-y-6">
      {isReviewingDraft && <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span>Approval Inbox</span><span>/</span><span className="text-slate-300">Draft approvals</span>
      </div>}
      <div>
        <h1 className="text-2xl font-serif italic font-medium text-white tracking-tight">{isReviewingDraft ? 'Draft approvals' : 'Approval Inbox'}</h1>
        <p className="text-sm text-slate-400 mt-1">
          {isReviewingDraft
            ? `${approvals.length} draft${approvals.length === 1 ? '' : 's'} need${approvals.length === 1 ? 's' : ''} your review before ${approvals.length === 1 ? 'it can' : 'they can'} be sent.`
            : `${approvals.length} draft${approvals.length === 1 ? '' : 's'} waiting for your review.`}
          {hotLeadIds.size ? ` ${hotLeadIds.size} hot lead${hotLeadIds.size === 1 ? '' : 's'} at the top.` : ''}
        </p>
      </div>

      {killSwitchActive && <AlertBanner type="critical" message="All outbound activity has been stopped platform-wide by an administrator." />}
      {atCapacity && <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200"><AlertTriangle className="inline w-4 h-4 mr-2" />Daily sending capacity reached: {metrics.capacity_used}/{metrics.capacity_limit} units used.</div>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospects, campaigns…" className="w-full bg-[#0d0f22] border border-purple-500/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500" />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={filtered.length > 0 && selected.size === filtered.length}
            onChange={toggleAll}
            className="appearance-none w-4 h-4 rounded border border-purple-500/30 bg-[#17122F] checked:bg-purple-600 checked:border-purple-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M3%208l3%203%207-7%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer transition-colors"
          />
          Select all
        </label>
        <span className="text-xs text-slate-500">{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} draft${filtered.length === 1 ? '' : 's'}`}</span>
        {selected.size > 0 && (
          <button disabled={atCapacity || killSwitchActive || batchApprove.isPending} onClick={() => batchApprove.mutate()} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-emerald-700 text-white disabled:opacity-50 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />Approve {selected.size} selected
          </button>
        )}
      </div>

      <div className="space-y-3">
        {sortedByFit.map((item: any) => {
          const isExpanded = expandedId === item.approval.id;
          const channel = item.approval.payload?.channel || 'email';
          return (
            <div
              key={item.approval.id}
              onClick={() => toggleExpand(item)}
              className={`rounded-xl border p-4 cursor-pointer transition-colors ${isExpanded ? 'border-purple-500/50 bg-[#17122f]' : hotLeadIds.has(item.approval.id) ? 'border-amber-500/30 bg-amber-950/5 hover:border-amber-500/50' : 'border-purple-500/30 bg-[#17122f] hover:border-purple-500/50'}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.approval.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleOne(item.approval.id)}
                  className="appearance-none mt-1 w-4 h-4 rounded border border-purple-500/30 bg-[#17122F] checked:bg-purple-600 checked:border-purple-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M3%208l3%203%207-7%22%2F%3E%3C%2Fsvg%3E')] bg-center bg-no-repeat cursor-pointer transition-colors flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {hotLeadIds.has(item.approval.id) && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/40 text-amber-300">Hot Lead</span>}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/50 border border-purple-500/30 text-purple-300">{item.campaign.name}</span>
                    <span className="text-[11px] text-slate-500"><span className="text-amber-400 font-medium">Personalization</span> · {CHANNEL_LABEL[channel] || channel}</span>

                    <div className="ml-auto flex items-center gap-2">
                      <button disabled={atCapacity || killSwitchActive || action.isPending} title={killSwitchActive ? 'Disabled: global kill switch is active' : undefined} onClick={(e) => { e.stopPropagation(); action.mutate({ kind: 'approve', id: item.approval.id }); }} className={`${approvalActionClass} bg-emerald-700 text-white`}><Check className="w-3.5 h-3.5" />Approve</button>
                      <button onClick={(e) => { e.stopPropagation(); toggleExpand(item); }} className={`${approvalActionClass} min-w-32 bg-purple-600 text-white`}><Sparkles className="w-3.5 h-3.5" />Edit &amp; Approve</button>
                      <span onClick={(e) => e.stopPropagation()}><RejectSelect onReject={(reason) => action.mutate({ kind: 'reject', id: item.approval.id, value: reason })} /></span>
                      <button onClick={(e) => { e.stopPropagation(); toggleExpand(item); }} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#12152d]">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-white">{item.prospect.first_name} {item.prospect.last_name}</span>
                    <span className="text-xs text-slate-400">{item.prospect.title}{item.prospect.title ? ' · ' : ''}{item.prospect.industry}</span>
                  </div>
                  <div className="text-xs text-emerald-300 mt-0.5">Fit {Math.round(item.association.qualification_score || 0)}{item.association.qualification_reason ? ` — ${item.association.qualification_reason}` : ''}</div>
                  {item.conflict && <div className="text-[11px] text-rose-300 mt-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />Also active in {item.conflict.other_campaign_name}</div>}
                  {!isExpanded && (
                    <p className="text-xs text-slate-400 mt-2 truncate flex items-center gap-1.5">
                      <Mail className="w-3 h-3 flex-shrink-0" />{item.approval.payload?.message || item.approval.payload?.summary}
                    </p>
                  )}

                  {isExpanded && (
                    <div onClick={(e) => e.stopPropagation()} className="grid md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-purple-500/10">
                      <div className="md:col-span-2 space-y-3">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">Draft message</div>
                        <textarea
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          className="w-full min-h-32 bg-[#070811] border border-purple-500/20 rounded-lg p-3 text-sm text-slate-200 leading-relaxed focus:outline-none focus:border-purple-500/50"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            disabled={atCapacity || killSwitchActive || !draftText.trim() || action.isPending}
                            title={killSwitchActive ? 'Disabled: global kill switch is active' : undefined}
                            onClick={() => action.mutate({ kind: 'edit', id: item.approval.id, value: draftText })}
                            className={`${approvalActionClass} min-w-32 bg-purple-600 text-white`}
                          >
                            Approve with edits
                          </button>
                          <RejectSelect onReject={(reason) => action.mutate({ kind: 'reject', id: item.approval.id, value: reason })} className={`${approvalActionClass} bg-rose-700/90 text-white border-none appearance-none cursor-pointer`} />
                        </div>
                      </div>
                      <div className="bg-[#070811] border border-purple-500/10 rounded-lg p-3.5">
                        <ContextUsedPanel approvalId={item.approval.id} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!sortedByFit.length && <p className="text-slate-400">No approvals waiting for you.</p>}
      </div>
    </div>
  );
};
