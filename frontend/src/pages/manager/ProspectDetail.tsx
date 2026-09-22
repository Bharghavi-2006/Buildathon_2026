import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Bot, Sparkles, Building2, User, Loader2, Phone } from 'lucide-react';
import { prospectsApi } from '../../api/prospects';
import { campaignsApi } from '../../api/campaigns';
import { StatusBadge } from '../../components/ui/StatusBadge';

export const ProspectDetail: React.FC = () => {
  const { campaignId, prospectId } = useParams<{ campaignId: string; prospectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: prospect, isLoading: pLoading } = useQuery({
    queryKey: ['prospect', prospectId],
    queryFn: () => prospectsApi.getProspect(prospectId!),
    enabled: !!prospectId,
  });

  const { data: research, isLoading: rLoading, refetch: refetchResearch } = useQuery({
    queryKey: ['prospect-research', campaignId, prospectId],
    queryFn: () => prospectsApi.getResearch(campaignId!, prospectId!, false),
    enabled: !!campaignId && !!prospectId,
    retry: false,
  });

  const { data: fitment, isLoading: fLoading, refetch: refetchFitment } = useQuery({
    queryKey: ['prospect-fitment', campaignId, prospectId],
    queryFn: () => prospectsApi.getFitment(campaignId!, prospectId!, false),
    enabled: !!campaignId && !!prospectId && !!research,
    retry: false,
  });

  const runResearchMutation = useMutation({
    mutationFn: async (forceRefresh: boolean) => {
      return await prospectsApi.getResearch(campaignId!, prospectId!, forceRefresh);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospect-research', campaignId, prospectId] });
      queryClient.invalidateQueries({ queryKey: ['prospect-fitment', campaignId, prospectId] });
      queryClient.invalidateQueries({ queryKey: ['prospect', prospectId] });
    },
    onError: (err: any) => {
      alert(err.message || 'Research execution failed');
    },
  });

  const runFitmentMutation = useMutation({
    mutationFn: async (forceRefresh: boolean) => {
      return await prospectsApi.getFitment(campaignId!, prospectId!, forceRefresh);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospect-fitment', campaignId, prospectId] });
    },
    onError: (err: any) => {
      alert(err.message || 'Fitment evaluation failed');
    },
  });

  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceCallMutation = useMutation({
    mutationFn: () => campaignsApi.simulateVoiceCall(campaignId!, prospectId!),
    onSuccess: () => setVoiceError(null),
    onError: (err: any) => setVoiceError(err.message || 'Voice call simulation failed'),
  });

  if (pLoading || !prospect) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <div className="text-sm text-slate-400">Loading prospect profile...</div>
      </div>
    );
  }

  const companyName = prospect.metadata_?.company_name || prospect.website || prospect.industry;

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <button
        onClick={() => navigate(`/campaigns/${campaignId}`)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaign
      </button>

      {/* Prospect Identity Header */}
      <div className="bg-[#0c0e1f] border border-purple-500/15 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-purple-900/40">
              {prospect.first_name.charAt(0)}{prospect.last_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {prospect.first_name} {prospect.last_name}
                </h1>
                <StatusBadge status={prospect.lifecycle_status} />
              </div>
              <div className="text-sm text-purple-300 font-medium mt-0.5">
                {prospect.title} at {companyName}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                <span>{prospect.email}</span>
                {prospect.phone && <span>· {prospect.phone}</span>}
                <span>· {prospect.location || 'Location unverified'}</span>
                {prospect.linkedin_url && (
                  <a
                    href={prospect.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 underline"
                  >
                    LinkedIn <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => runResearchMutation.mutate(true)}
              disabled={runResearchMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#12152d] border border-purple-500/20 text-slate-200 hover:border-purple-500/50 text-xs font-semibold transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runResearchMutation.isPending ? 'animate-spin' : ''}`} />
              {runResearchMutation.isPending ? 'Researching...' : 'Force Refresh Research'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Research Card */}
        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-purple-500/10">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Bot className="w-4 h-4 text-purple-400" />
                Prospect Research
              </div>
              <StatusBadge status={research?.status || 'unverified'} />
            </div>

            {rLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" /> Loading research...
              </div>
            ) : !research ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                <p>No research collected for this prospect yet.</p>
                <button
                  onClick={() => runResearchMutation.mutate(false)}
                  disabled={runResearchMutation.isPending}
                  className="mt-3 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                >
                  {runResearchMutation.isPending ? 'Running Research...' : 'Run Web Research Agent'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Summary */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Executive Summary
                  </div>
                  <p className="text-slate-200 bg-[#070811] p-3 rounded-xl border border-purple-500/10 leading-relaxed">
                    {research.research_summary}
                  </p>
                </div>

                {/* Cited ICP Evidence */}
                {research.icp_evidence && research.icp_evidence.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Cited ICP Evidence
                    </div>
                    <div className="space-y-2">
                      {research.icp_evidence.map((ev, idx) => (
                        <div
                          key={idx}
                          className="bg-[#0e1022] border border-purple-500/10 rounded-xl p-3 flex items-start gap-2.5"
                        >
                          {ev.status === 'MATCHED' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between font-semibold text-slate-200">
                              <span>{ev.criterion}</span>
                              <StatusBadge status={ev.status} size="sm" showDot={false} />
                            </div>
                            <p className="text-slate-300 mt-1">{ev.evidence}</p>
                            {ev.source && (
                              <div className="text-[10px] text-slate-500 mt-1">Source: {ev.source}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Personalization Signals */}
                {research.personalization_signals && research.personalization_signals.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Personalization Signals
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {research.personalization_signals.map((sig, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-md bg-purple-950/40 border border-purple-500/20 text-purple-300">
                          {sig}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {research.sources && research.sources.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Verified Sources
                    </div>
                    <ul className="space-y-1 text-slate-400">
                      {research.sources.map((s, idx) => (
                        <li key={idx} className="truncate">
                          <a href={s} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">
                            {s}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Deterministic ICP Fitment Card */}
        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-purple-500/10">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Deterministic ICP Fitment
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                icp-fitment-v1
              </span>
            </div>

            {fLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" /> Calculating fitment...
              </div>
            ) : !fitment ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                <p>Fitment not evaluated yet.</p>
                <button
                  onClick={() => runFitmentMutation.mutate(false)}
                  disabled={runFitmentMutation.isPending || !research}
                  className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold"
                >
                  {runFitmentMutation.isPending ? 'Evaluating...' : 'Evaluate ICP Fitment'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Overall Score Box */}
                <div className="bg-[#090b1a] border border-purple-500/15 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Overall Deterministic Fit
                    </div>
                    <div className="text-3xl font-extrabold text-white mt-1">
                      {Math.round(fitment.overall_fit_score)}%
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Next: <span className="text-emerald-400 font-semibold">{fitment.recommended_next_stage}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <StatusBadge status={fitment.overall_fit_status} size="md" />
                    <div className="text-[11px] text-slate-400">
                      Org: {Math.round(fitment.organization_fit_score)}% · Contact: {Math.round(fitment.contact_fit_score)}%
                    </div>
                  </div>
                </div>

                {/* Criteria Breakdown Table */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Deterministic Criteria Breakdown
                  </div>
                  <div className="border border-purple-500/10 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#070811] text-[10px] text-slate-400 uppercase tracking-wider border-b border-purple-500/10">
                        <tr>
                          <th className="py-2 px-3">Criterion</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Expected / Actual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-500/5">
                        {[...fitment.organization_criteria, ...fitment.contact_criteria].map((crit, idx) => (
                          <tr key={idx} className="hover:bg-[#12152d]">
                            <td className="py-2 px-3 font-semibold text-slate-200 capitalize">
                              {crit.criterion}
                            </td>
                            <td className="py-2 px-3">
                              <StatusBadge status={crit.status} size="sm" showDot={false} />
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              <div className="truncate max-w-[180px]">
                                {crit.actual_value !== null ? String(crit.actual_value) : <span className="text-slate-500 italic">No evidence</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Key Fit Signals */}
                {fitment.key_fit_signals && fitment.key_fit_signals.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Key Fit Signals
                    </div>
                    <ul className="space-y-1 text-emerald-300">
                      {fitment.key_fit_signals.map((sig, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>{sig}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risk Factors */}
                {fitment.key_risk_factors && fitment.key_risk_factors.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Risk Factors
                    </div>
                    <ul className="space-y-1 text-rose-300">
                      {fitment.key_risk_factors.map((risk, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voice SDR -- explicitly simulated, never a real telephony call */}
      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-purple-500/10">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Phone className="w-4 h-4 text-indigo-400" />
            Voice SDR
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-500/30 text-amber-300 uppercase tracking-wider">Simulated / Demo</span>
          </div>
          <button
            onClick={() => voiceCallMutation.mutate()}
            disabled={voiceCallMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-all"
          >
            {voiceCallMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
            {voiceCallMutation.isPending ? 'Placing simulated call…' : 'Simulate Voice Call'}
          </button>
        </div>
        {voiceError && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs mb-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {voiceError}
          </div>
        )}
        {voiceCallMutation.data ? (
          <div className="space-y-4 text-xs">
            <div className="space-y-2">
              {voiceCallMutation.data.transcript.map((line, idx) => (
                <div key={idx} className={`max-w-[85%] rounded-lg px-3 py-2 ${line.speaker === 'AI' ? 'bg-indigo-950/40 text-indigo-100' : 'bg-[#12152d] text-slate-200 ml-auto'}`}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{line.speaker}</div>
                  {line.text}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-[#070811] border border-purple-500/10 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Intent</div>
                <div className="text-emerald-300 font-semibold">{voiceCallMutation.data.intent}</div>
              </div>
              <div className="bg-[#070811] border border-purple-500/10 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Outcome</div>
                <div className="text-amber-300 font-semibold">{voiceCallMutation.data.outcome}</div>
              </div>
              <div className="bg-[#070811] border border-purple-500/10 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Policy</div>
                <div className="text-emerald-300 font-semibold">{voiceCallMutation.data.policy}</div>
              </div>
              <div className="bg-[#070811] border border-purple-500/10 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Human Escalation</div>
                <div className="text-slate-300 font-semibold">{voiceCallMutation.data.human_escalation ? 'YES' : 'NO'}</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-xs">No simulated call yet for this prospect. This creates real Conversation/Message/AgentRun records gated by the same PolicyEngine as every other channel -- no real phone call is placed.</p>
        )}
      </div>
    </div>
  );
};
