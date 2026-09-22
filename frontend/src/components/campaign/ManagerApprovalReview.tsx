import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles, X } from 'lucide-react';
import { campaignsApi } from '../../api/campaigns';

const rejectReasons = ['WRONG_PERSONA', 'IRRELEVANT_HOOK', 'WRONG_INFORMATION', 'DUPLICATE_ACCOUNT', 'OTHER'];
const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };

// Opened from an aging-approval alert: gives the manager the same approve/edit/reject
// authority a representative has on their own queue, plus the full conversation history
// and drafting context, so a manager can act directly on the item that triggered the alert.
export const ManagerApprovalReview: React.FC<{ approvalId: string; onClose: () => void }> = ({ approvalId, onClose }) => {
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const [draftInitialized, setDraftInitialized] = useState(false);

  const { data: approval, isLoading } = useQuery({ queryKey: ['manager-approval', approvalId], queryFn: () => campaignsApi.getManagerApproval(approvalId) });
  const { data: context } = useQuery({ queryKey: ['manager-approval-context', approvalId], queryFn: () => campaignsApi.getManagerApprovalContext(approvalId) });

  useEffect(() => {
    if (approval && !draftInitialized) {
      setDraft(approval.generated_message || '');
      setDraftInitialized(true);
    }
  }, [approval, draftInitialized]);

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ['manager-alerts'] });
    client.invalidateQueries({ queryKey: ['manager-dashboard'] });
    client.invalidateQueries({ queryKey: ['manager-aging-approvals'] });
    client.invalidateQueries({ queryKey: ['manager-approvals-summary'] });
  };
  const approveMutation = useMutation({ mutationFn: () => campaignsApi.managerApproveApproval(approvalId), onSuccess: () => { invalidate(); onClose(); } });
  const editApproveMutation = useMutation({ mutationFn: () => campaignsApi.managerEditApproveApproval(approvalId, draft), onSuccess: () => { invalidate(); onClose(); } });
  const rejectMutation = useMutation({ mutationFn: (reason: string) => campaignsApi.managerRejectApproval(approvalId, reason), onSuccess: () => { invalidate(); onClose(); } });
  const anyPending = approveMutation.isPending || editApproveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-[#0a0c1c] border-l border-purple-500/20 overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Review Approval</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {isLoading || !approval ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="rounded-xl border border-purple-500/15 bg-[#0d0f22] p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/50 border border-purple-500/30 text-purple-300">{approval.campaign?.name}</span>
                <span className="text-[11px] text-slate-500">{approval.agent || 'Personalization'} · {CHANNEL_LABEL[approval.channel] || approval.channel}</span>
              </div>
              <div className="font-semibold text-white">{approval.prospect?.first_name} {approval.prospect?.last_name}</div>
              <div className="text-xs text-slate-400 mt-0.5">{approval.prospect?.title}{approval.prospect?.title ? ' · ' : ''}{approval.prospect?.industry}</div>
              {approval.fit_score != null && <div className="text-xs text-emerald-300 mt-1">Fit {Math.round(approval.fit_score)}{approval.fit_reason ? ` — ${approval.fit_reason}` : ''}</div>}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Draft message</div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full min-h-40 bg-[#070811] border border-purple-500/20 rounded-lg p-3 text-sm text-slate-200 leading-relaxed focus:outline-none focus:border-purple-500/50"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={anyPending} onClick={() => approveMutation.mutate()} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white disabled:opacity-50 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Approve</button>
                  <button disabled={anyPending || !draft.trim()} onClick={() => editApproveMutation.mutate()} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 text-white disabled:opacity-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />Approve with edits</button>
                  <select
                    onChange={(e) => { if (e.target.value) { rejectMutation.mutate(e.target.value); e.target.value = ''; } }}
                    defaultValue=""
                    disabled={anyPending}
                    className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-rose-700 text-white border-none appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="" disabled>Reject</option>
                    {rejectReasons.map((x) => <option key={x} value={x} className="bg-[#0d0f22] text-rose-200">{x.replaceAll('_', ' ')}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-[#070811] border border-[#7C3AED] rounded-lg p-3.5 space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />Context used
                </div>
                {!context ? <p className="text-xs text-slate-500">Loading context…</p> : (
                  <>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Prospect summary</div>
                      <p className="text-xs text-slate-300 leading-relaxed">{context.prospect_summary || 'No structured prospect summary available yet.'}</p>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Research snippet</div>
                      <div className="rounded-lg border border-[#7C3AED] bg-[#0d0f22] p-2.5 text-xs text-slate-300 leading-relaxed">
                        {context.research_snippet || 'No research on file for this prospect yet.'}
                      </div>
                    </div>
                    {context.conversation && context.conversation.messages?.length > 0 && (
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Past conversation</div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {context.conversation.messages.map((m: any) => (
                            <div key={m.id} className={`text-xs p-2 rounded ${m.direction === 'INBOUND' ? 'bg-purple-950/30 text-purple-200' : 'bg-[#12152d] text-slate-300'}`}>
                              <span className="font-semibold">{m.direction === 'INBOUND' ? 'Prospect' : 'You'}:</span> {m.content}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {context.rag_context?.length > 0 && (
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Knowledge base sources</div>
                        <ul className="space-y-1.5">
                          {context.rag_context.map((r: any) => (
                            <li key={r.document_id} className="text-slate-400 text-[11px]">
                              <span className="text-emerald-400">✓</span> <span className="text-slate-200 font-medium">{r.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
