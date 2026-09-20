import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, BookOpen, Check, ChevronRight, Clock, Phone, Send, ShieldAlert, X } from 'lucide-react';
import { hurdlesApi } from '../../api/hurdles';
import { controlApi } from '../../api/control';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AlertBanner } from '../../components/ui/AlertBanner';
import type { HurdleListItem } from '../../types';

const CATEGORY_LABEL: Record<string, string> = {
  SUPPRESSION_DNC: 'Suppression / DNC issue',
  DUPLICATE_CONFLICT: 'Duplicate / conflict prospect',
  CHANNEL_UNAVAILABLE: 'Channel unavailable',
  POLICY_VIOLATION: 'Policy violation',
  APPROVAL_BOTTLENECK: 'Approval bottleneck',
  MISSING_KNOWLEDGE: 'Missing knowledge',
  UNSUPPORTED_CLAIM: 'Unsupported product claim',
  CONFLICTING_INSTRUCTIONS: 'Conflicting campaign instructions',
  ICP_AMBIGUITY: 'ICP ambiguity',
  VOICE_ESCALATION: 'Voice escalation',
};

const severityStyles: Record<string, string> = {
  ESCALATED: 'border-rose-500/50 bg-rose-950/20',
  WARNING: 'border-amber-500/40 bg-amber-950/10',
  RESOLVED: 'border-emerald-500/20 bg-[#0d0f22] opacity-70',
};

export const RepresentativeHurdles: React.FC = () => {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');

  const { data: killSwitch } = useQuery({ queryKey: ['kill-switch'], queryFn: controlApi.getKillSwitch, refetchInterval: 15000 });
  const { data: hurdles, isLoading, error } = useQuery({ queryKey: ['rep-hurdles'], queryFn: hurdlesApi.list, refetchInterval: 20000 });
  const { data: detail } = useQuery({ queryKey: ['rep-hurdle', selectedId], queryFn: () => hurdlesApi.detail(selectedId as string), enabled: !!selectedId });

  const invalidate = () => { client.invalidateQueries({ queryKey: ['rep-hurdles'] }); client.invalidateQueries({ queryKey: ['rep-hurdle', selectedId] }); };
  const resolve = useMutation({ mutationFn: () => hurdlesApi.resolve(selectedId as string, note), onSuccess: () => { setNote(''); invalidate(); } });
  const escalate = useMutation({ mutationFn: () => hurdlesApi.escalate(selectedId as string), onSuccess: invalidate });
  const flagGap = useMutation({ mutationFn: () => hurdlesApi.flagKnowledgeGap(selectedId as string), onSuccess: invalidate });
  const attachKb = useMutation({ mutationFn: () => hurdlesApi.attachKnowledge(selectedId as string, kbTitle, kbContent), onSuccess: () => { setKbTitle(''); setKbContent(''); invalidate(); } });

  if (isLoading) return <div className="text-slate-400">Loading AI hurdles…</div>;
  if (error || !hurdles) return <div className="text-rose-300">Unable to load hurdles.</div>;

  const open = hurdles.filter((h: HurdleListItem) => h.status !== 'RESOLVED');
  const resolved = hurdles.filter((h: HurdleListItem) => h.status === 'RESOLVED');

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-white">AI Hurdles</h1>
      <p className="text-sm text-slate-400">Escalations and warnings raised by the AI pipeline that need your attention.</p>
    </div>
    {killSwitch?.global_kill_switch && (
      <AlertBanner type="critical" message="All outbound activity has been stopped platform-wide by an administrator." />
    )}
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4"><div className="text-2xl font-bold text-rose-400">{open.filter((h: HurdleListItem) => h.status === 'ESCALATED').length}</div><div className="text-xs text-slate-400 mt-1">Escalated</div></div>
      <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4"><div className="text-2xl font-bold text-amber-400">{open.filter((h: HurdleListItem) => h.status === 'WARNING').length}</div><div className="text-xs text-slate-400 mt-1">Warning</div></div>
      <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4"><div className="text-2xl font-bold text-emerald-400">{resolved.length}</div><div className="text-xs text-slate-400 mt-1">Resolved</div></div>
    </div>

    <div className="rounded-xl border border-purple-500/10 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-[#0d0f22] text-slate-500 uppercase tracking-wider">
          <tr>
            <th className="text-left font-medium px-4 py-2.5">Status</th>
            <th className="text-left font-medium px-4 py-2.5">Campaign</th>
            <th className="text-left font-medium px-4 py-2.5">Prospect</th>
            <th className="text-left font-medium px-4 py-2.5">Channel</th>
            <th className="text-left font-medium px-4 py-2.5">Category</th>
            <th className="text-left font-medium px-4 py-2.5">Diagnostic</th>
            <th className="text-left font-medium px-4 py-2.5">Age</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...open, ...resolved].map((h: HurdleListItem) => (
            <tr key={h.id} onClick={() => setSelectedId(h.id)} className={`border-t cursor-pointer hover:bg-[#12152d] transition-colors ${severityStyles[h.status]}`}>
              <td className="px-4 py-3">
                {h.status === 'ESCALATED' ? <span className="inline-flex items-center gap-1 text-rose-300 font-semibold"><AlertOctagon className="w-3.5 h-3.5" />Escalated</span>
                  : h.status === 'WARNING' ? <span className="inline-flex items-center gap-1 text-amber-300 font-semibold"><ShieldAlert className="w-3.5 h-3.5" />Warning</span>
                  : <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold"><Check className="w-3.5 h-3.5" />Resolved</span>}
              </td>
              <td className="px-4 py-3 text-slate-200">{h.campaign?.name || '—'}</td>
              <td className="px-4 py-3 text-slate-200">{h.prospect ? `${h.prospect.first_name} ${h.prospect.last_name}` : '—'}</td>
              <td className="px-4 py-3 text-slate-400">{h.channel ? (h.channel === 'voice' ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />voice</span> : h.channel) : '—'}</td>
              <td className="px-4 py-3 text-slate-300">{CATEGORY_LABEL[h.category] || h.category}</td>
              <td className="px-4 py-3 text-slate-400 max-w-xs truncate" title={h.reason}>{h.reason}</td>
              <td className="px-4 py-3 text-slate-400"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{h.age_hours}h</span></td>
              <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-slate-500 inline" /></td>
            </tr>
          ))}
          {!hurdles.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No AI hurdles right now — everything is flowing cleanly.</td></tr>}
        </tbody>
      </table>
    </div>

    {selectedId && (
      <div className="fixed inset-0 z-30 flex justify-end bg-black/50" onClick={() => setSelectedId(null)}>
        <div className="w-full max-w-xl h-full bg-[#0a0c1c] border-l border-purple-500/20 overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge status={detail?.status || '...'} />
                <span className="text-xs text-slate-400">{CATEGORY_LABEL[detail?.category] || detail?.category}</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-2">{detail?.prospect ? `${detail.prospect.first_name} ${detail.prospect.last_name}` : 'Hurdle detail'}</h2>
              <p className="text-xs text-slate-400">{detail?.campaign?.name} · {detail?.channel || 'no channel'} · {detail?.age_hours}h old</p>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          {!detail ? <div className="text-slate-400 text-sm">Loading…</div> : <>
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Why the AI escalated</h3>
              <p className="text-sm text-slate-200">{detail.reason}</p>
              <p className="text-xs text-purple-300 mt-1">Recommended: {detail.recommended_action}</p>
            </section>

            {detail.recurring?.is_recurring && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-200 flex items-center justify-between gap-3">
                <span>This has come up {detail.recurring.count_this_week} times this week — flag as a knowledge gap?</span>
                {detail.recurring.already_flagged
                  ? <span className="text-xs text-emerald-300 whitespace-nowrap">Flagged</span>
                  : <button disabled={flagGap.isPending} onClick={() => flagGap.mutate()} className="px-2.5 py-1 text-xs rounded bg-amber-700 text-white whitespace-nowrap">Flag as knowledge gap</button>}
              </div>
            )}

            <section className="grid grid-cols-2 gap-3 text-xs">
              <div><div className="text-slate-500">Organization</div><div className="text-slate-200 mt-0.5">{detail.organization?.name || detail.prospect?.industry || '—'}</div></div>
              <div><div className="text-slate-500">Agent escalated</div><div className="text-slate-200 mt-0.5">{detail.agent_escalated?.agent_type || detail.agent_type || '—'}</div></div>
              <div><div className="text-slate-500">Agent / harness version</div><div className="text-slate-200 mt-0.5">{detail.agent_escalated?.engine_version || detail.agent_escalated?.dronahq_execution_id || 'Not available'}</div></div>
              <div><div className="text-slate-500">PolicyEngine decision</div><div className="text-slate-200 mt-0.5">{detail.policy_decision ? detail.policy_decision.rule : 'N/A for this hurdle type'}</div></div>
            </section>

            {detail.channel === 'voice' && (
              <section className="space-y-1 rounded-lg border border-purple-500/15 p-3">
                <h3 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />Voice interaction</h3>
                {detail.voice?.transcript ? <>
                  <p className="text-xs text-slate-400">Call status: {detail.voice.call_status || 'Unknown'}</p>
                  <p className="text-xs text-slate-400">Sentiment: {detail.voice.sentiment || 'Not available'}</p>
                  <p className="text-xs text-slate-400">Transfer/handoff: {detail.voice.transfer_status || 'Not available'}</p>
                  <p className="text-xs text-slate-400">Callback required: {detail.voice.callback_required ? 'Yes' : 'No'}</p>
                  <p className="text-sm text-slate-200 mt-2 whitespace-pre-line">{detail.voice.transcript}</p>
                </> : <p className="text-xs text-slate-500">{detail.voice?.note || 'Voice telemetry is not available from the backend for this hurdle.'}</p>}
              </section>
            )}

            {detail.conversation && (
              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase text-slate-500">Relevant conversation</h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {detail.conversation.messages.map((m: any) => (
                    <div key={m.id} className={`text-xs p-2 rounded ${m.direction === 'INBOUND' ? 'bg-purple-950/30 text-purple-200' : 'bg-[#12152d] text-slate-300'}`}>
                      <span className="font-semibold">{m.direction === 'INBOUND' ? 'Prospect' : 'Outbound'}:</span> {m.content}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!!detail.rag_context?.length && (
              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase text-slate-500">RAG context considered</h3>
                {detail.rag_context.map((d: any) => (
                  <div key={d.document_id} className="text-xs bg-[#12152d] rounded p-2 text-slate-300"><span className="font-semibold text-slate-200">{d.title}</span>: {d.content.slice(0, 160)}…</div>
                ))}
              </section>
            )}

            <div className="border-t border-purple-500/10 pt-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Resolution</h3>
              {detail.status === 'RESOLVED' ? (
                <p className="text-xs text-emerald-300">Resolved{detail.resolution.resolution_note ? `: ${detail.resolution.resolution_note}` : '.'}</p>
              ) : <>
                <div className="flex gap-2">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note (optional)" className="flex-1 bg-[#070811] border border-purple-500/30 rounded px-2 py-1.5 text-xs text-white" />
                  <button disabled={resolve.isPending} onClick={() => resolve.mutate()} className="px-3 py-1.5 text-xs rounded bg-emerald-700 text-white flex items-center gap-1"><Check className="w-3 h-3" />Resolve</button>
                </div>
                <button disabled={escalate.isPending || detail.escalated_to_manager} onClick={() => escalate.mutate()} className="w-full px-3 py-1.5 text-xs rounded bg-rose-700 disabled:opacity-50 text-white flex items-center justify-center gap-1">
                  <Send className="w-3 h-3" />{detail.escalated_to_manager ? 'Already escalated to manager' : 'Escalate to manager'}
                </button>

                <div className="rounded-lg border border-purple-500/15 p-3 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />Attach knowledge to this campaign</h4>
                  <input value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} placeholder="Document title" className="w-full bg-[#070811] border border-purple-500/30 rounded px-2 py-1.5 text-xs text-white" />
                  <textarea value={kbContent} onChange={(e) => setKbContent(e.target.value)} placeholder="What should the agent know?" className="w-full min-h-16 bg-[#070811] border border-purple-500/30 rounded px-2 py-1.5 text-xs text-white" />
                  <button disabled={attachKb.isPending || !kbTitle.trim() || !kbContent.trim()} onClick={() => attachKb.mutate()} className="px-3 py-1.5 text-xs rounded bg-purple-700 disabled:opacity-40 text-white">Attach to campaign knowledge base</button>
                  <p className="text-[10px] text-slate-500">You cannot edit campaign ICP, prompts, or routing — only add reference knowledge.</p>
                </div>
              </>}
            </div>
          </>}
        </div>
      </div>
    )}
  </div>;
};
