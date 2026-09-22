import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, ShieldCheck, Sparkles, Bot, Phone, Search, Target, CheckCircle2 } from 'lucide-react';
import { campaignsApi } from '../../../api/campaigns';
import { CampaignAgentItem } from '../../../types';

interface Step3AgentsProps {
  campaignId: string;
  onBack: () => void;
  onSuccess: () => void;
}

interface AgentMetadata {
  displayName: string;
  category: 'deterministic' | 'autonomous' | 'voice';
  description: string;
  details: string;
  defaultResponsibilities: string[];
}

const AGENT_INFO_MAP: Record<string, AgentMetadata> = {
  DISCOVERY: {
    displayName: 'Apollo Discovery Agent',
    category: 'autonomous',
    description: 'High-recall lead discovery targeting roles, industries, and headcount criteria via Apollo & DronaHQ.',
    details: 'Searches executive talent across company domains, verifies contact identity, and yields candidates for evidence extraction.',
    defaultResponsibilities: ['Discover prospect identities', 'Query Apollo company directories', 'Normalize contact metadata'],
  },
  ICP_FITMENT: {
    displayName: 'ICP Fitment Engine',
    category: 'deterministic',
    description: 'Deterministic rule-based qualification (icp-fitment-v1). Validates strict criteria without LLM hallucination.',
    details: 'Evaluates organization and contact attributes against campaign ICP thresholds. Produces auditable 0–100 match scores.',
    defaultResponsibilities: ['Deterministic criterion evaluation', 'Suppress conflicts & competitors', 'Compute overall fitment score'],
  },
  RESEARCH: {
    displayName: 'Deep Research Agent',
    category: 'autonomous',
    description: 'Autonomous web search & fact extraction to uncover executive priorities, recent initiatives, and tech stack signals.',
    details: 'Analyzes SEC filings, company blog posts, press releases, and engineering blogs to find evidence of active pain points.',
    defaultResponsibilities: ['Web search candidate verification', 'Extract verified business facts', 'Identify personalization angles'],
  },
  OUTREACH_STRATEGY: {
    displayName: 'Outreach Strategy Agent',
    category: 'autonomous',
    description: 'Determines optimal multi-channel sequencing, touchpoint cadence, and value angle for each account tier.',
    details: 'Maps buyer personas to proven engagement tracks and selects appropriate channel mix (Email, LinkedIn, Calls).',
    defaultResponsibilities: ['Channel sequencing selection', 'Value proposition framing', 'Pacing and send intervals'],
  },
  PERSONALIZATION: {
    displayName: 'Personalization Agent',
    category: 'autonomous',
    description: 'Generates bespoke outreach copy connecting prospect research evidence directly to product capabilities.',
    details: 'Drafts contextual, peer-level messages tailored to executive challenges. Adheres to tone guidelines and anti-jargon rules.',
    defaultResponsibilities: ['Draft bespoke outreach messages', 'Cite factual research evidence', 'Apply representative tone policies'],
  },
  CONVERSATION: {
    displayName: 'Inbound Conversation Agent',
    category: 'autonomous',
    description: 'Parses inbound replies, categorizes objection/interest intent, and prepares high-conversion responses.',
    details: 'Handles scheduling requests, answers technical FAQs from knowledge base, and flags meeting-ready intent for reps.',
    defaultResponsibilities: ['Reply intent classification', 'FAQ & objection handling', 'Meeting scheduling assistance'],
  },
  FOLLOW_UP: {
    displayName: 'Cadence Follow-Up Agent',
    category: 'autonomous',
    description: 'Manages scheduled follow-ups, time-sensitive nudges, and graceful breakup notes across channels.',
    details: 'Executes timed touchpoints only when prospects remain responsive and non-suppressed, pausing upon reply.',
    defaultResponsibilities: ['Schedule follow-up events', 'Respect frequency caps', 'Halt cadences on inbound response'],
  },
  VOICE: {
    displayName: 'Conversational Voice Agent',
    category: 'voice',
    description: 'Optional warm follow-up calling capability for discovery qualification and event invitations.',
    details: 'Low-latency natural speech synthesis and real-time interruption handling for high-touch accounts.',
    defaultResponsibilities: ['Phone discovery qualification', 'Appointment reminders', 'Voicemail follow-ups'],
  },
};

export const Step3Agents: React.FC<Step3AgentsProps> = ({
  campaignId,
  onBack,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch agents for this campaign
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['campaign-agents', campaignId],
    queryFn: () => campaignsApi.getCampaignAgents(campaignId),
    enabled: !!campaignId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ agentId, enabled, agentType }: { agentId: string; enabled: boolean; agentType: string }) => {
      setErrorMessage(null);
      const meta = AGENT_INFO_MAP[agentType] || { defaultResponsibilities: [] };
      return await campaignsApi.configureAgent(campaignId, agentId, {
        enabled,
        responsibilities: meta.defaultResponsibilities,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-agents', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-launch-check', campaignId] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to update agent configuration');
    },
  });

  const enabledCount = agents.filter((a) => a.agent.enabled).length;
  const canProceed = enabledCount > 0;

  // Batch toggle all recommended agents
  const enableAllRecommendedMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      for (const item of agents) {
        if (!item.agent.enabled) {
          const meta = AGENT_INFO_MAP[item.agent.agent_type] || { defaultResponsibilities: [] };
          await campaignsApi.configureAgent(campaignId, item.agent.id, {
            enabled: true,
            responsibilities: meta.defaultResponsibilities,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-agents', campaignId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <span>Loading campaign agents and policies...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-serif italic font-medium text-white tracking-tight">Campaign Autonomous Agents & Engines</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure which AI agents and deterministic engines operate autonomously for this campaign.
          </p>
        </div>

        <button
          type="button"
          disabled={enableAllRecommendedMutation.isPending}
          onClick={() => enableAllRecommendedMutation.mutate()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-semibold transition-all"
        >
          {enableAllRecommendedMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          Enable Recommended Stack
        </button>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-3 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Agents List */}
      <div className="space-y-3">
        {agents.map(({ agent }) => {
          const meta = AGENT_INFO_MAP[agent.agent_type] || {
            displayName: agent.agent_type,
            category: 'autonomous',
            description: 'Campaign execution component',
            details: '',
            defaultResponsibilities: [],
          };

          const isDeterministic = meta.category === 'deterministic';
          const isVoice = meta.category === 'voice';

          return (
            <div
              key={agent.id}
              className={`p-4 rounded-2xl border transition-all ${
                agent.enabled
                  ? 'bg-[#0c0e1f] border-purple-500/30 shadow-lg shadow-purple-950/20'
                  : 'bg-[#070811]/70 border-purple-500/10 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      agent.enabled
                        ? isDeterministic
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                          : isVoice
                          ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                          : 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {isDeterministic ? (
                      <ShieldCheck className="w-5 h-5" />
                    ) : isVoice ? (
                      <Phone className="w-4 h-4" />
                    ) : (
                      <Bot className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">{meta.displayName}</h3>

                      {isDeterministic ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Deterministic Engine (icp-fitment-v1)
                        </span>
                      ) : isVoice ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/50 border border-amber-500/30 text-amber-300">
                          Optional Capability
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/50 border border-purple-500/30 text-purple-300">
                          Autonomous AI Agent
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 mt-1">{meta.description}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{meta.details}</p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agent.enabled}
                      disabled={toggleMutation.isPending}
                      onChange={(e) =>
                        toggleMutation.mutate({
                          agentId: agent.id,
                          enabled: e.target.checked,
                          agentType: agent.agent_type,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary status */}
      <div className="flex items-center justify-between text-xs text-slate-400 bg-white/5 border border-purple-500/10 rounded-xl px-4 py-3">
        <span>Active Agents for Campaign: <strong className="text-white">{enabledCount} of {agents.length} enabled</strong></span>
        {!canProceed && (
          <span className="text-amber-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Enable at least one execution agent to proceed.
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Targeting
        </button>

        <button
          type="button"
          disabled={!canProceed}
          onClick={onSuccess}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            canProceed
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          <span>Save & Continue to Prospect Sourcing</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
