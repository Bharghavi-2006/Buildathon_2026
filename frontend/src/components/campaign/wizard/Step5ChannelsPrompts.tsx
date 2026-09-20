import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertCircle,
  Mail,
  Linkedin,
  MessageSquare,
  Phone,
  Bot,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  FileCode,
  Check,
} from 'lucide-react';
import { campaignsApi } from '../../../api/campaigns';
import { ChannelSetting, PromptVersionItem } from '../../../types';

interface Step5ChannelsPromptsProps {
  campaignId: string;
  onBack: () => void;
  onSuccess: () => void;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  SYSTEM: `You are an elite autonomous SDR representing our enterprise platform.
Tone guidelines: Consultative, concise, peer-level executive communication. Never use cheesy sales jargon, buzzwords, or unsubstantiated claims. Always reference factual research evidence and active technology initiatives.`,
  RESEARCH: `Task: Conduct deep discovery on target accounts and buyer personas.
Extract verified engineering challenges, active cloud initiatives, and executive quotes from public sources. Flag tech stack transitions and compliance requirements.`,
  OUTREACH_STRATEGY: `Task: Determine the optimal touchpoint sequence, channel balance, and timing for executive personas.
Prioritize email for technical problem formulation and LinkedIn for brief thought leadership alignment. Maintain a minimum 3-day buffer between touches.`,
  PERSONALIZATION: `Task: Synthesize prospect research evidence into a tailored value proposition.
Structure:
1. Contextual observation (1 sentence citing specific tech stack or public initiative).
2. Relevant capability match (1-2 sentences on how we address that specific pain point).
3. Friction-free call to action (open-ended inquiry, no forced 30-min calendar booking).`,
  CONVERSATION: `Task: Handle inbound replies with high-precision classification.
If prospect expresses interest: offer seamless meeting times matching representative calendar.
If objection raised: validate their concern and provide concise architectural clarification.
If not interested: acknowledge gracefully and schedule compliance suppression.`,
  FOLLOW_UP: `Task: Execute value-add cadence reminders.
Every follow-up must introduce a new relevant asset, case study, or industry benchmark. Never send generic "just checking in" or "bumping this" messages.`,
  VOICE: `Task: Conduct structured conversational phone qualification.
Introduce yourself clearly, confirm availability, and ask 2 targeted qualifying questions regarding active infrastructure migration timelines. Respect immediate opt-outs.`,
};

export const Step5ChannelsPrompts: React.FC<Step5ChannelsPromptsProps> = ({
  campaignId,
  onBack,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Channels state
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailLimit, setEmailLimit] = useState(25);
  const [linkedinEnabled, setLinkedinEnabled] = useState(true);
  const [linkedinLimit, setLinkedinLimit] = useState(20);
  const [messageEnabled, setMessageEnabled] = useState(false);
  const [messageLimit, setMessageLimit] = useState(15);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceLimit, setVoiceLimit] = useState(10);

  // Prompts state
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_TEMPLATES.SYSTEM);
  const [agentPrompts, setAgentPrompts] = useState<Record<string, string>>({});
  const [activePromptsMap, setActivePromptsMap] = useState<Record<string, PromptVersionItem>>({});

  // Fetch campaign prospects to derive actual channel availability
  const { data: prospects = [] } = useQuery({
    queryKey: ['campaign-prospects', campaignId],
    queryFn: () => campaignsApi.getCampaignProspects(campaignId),
    enabled: !!campaignId,
  });

  // Fetch campaign agents to know which agent prompts to show
  const { data: agents = [] } = useQuery({
    queryKey: ['campaign-agents', campaignId],
    queryFn: () => campaignsApi.getCampaignAgents(campaignId),
    enabled: !!campaignId,
  });

  // Fetch existing channels
  const { data: channelsData = [] } = useQuery({
    queryKey: ['campaign-channels', campaignId],
    queryFn: () => campaignsApi.getChannels(campaignId),
    enabled: !!campaignId,
  });

  // Fetch existing prompts
  const { data: existingPrompts = [] } = useQuery({
    queryKey: ['campaign-prompts', campaignId],
    queryFn: () => campaignsApi.getPrompts(campaignId),
    enabled: !!campaignId,
  });

  // Populate channels from backend
  useEffect(() => {
    if (channelsData.length > 0) {
      channelsData.forEach((c) => {
        const name = c.channel.toLowerCase();
        if (name === 'email') {
          setEmailEnabled(c.enabled);
          setEmailLimit(c.daily_limit);
          if (c.approval_required !== undefined) setApprovalRequired(c.approval_required);
        } else if (name === 'linkedin') {
          setLinkedinEnabled(c.enabled);
          setLinkedinLimit(c.daily_limit);
        } else if (name === 'message' || name === 'messages') {
          setMessageEnabled(c.enabled);
          setMessageLimit(c.daily_limit);
        } else if (name === 'voice' || name === 'call') {
          setVoiceEnabled(c.enabled);
          setVoiceLimit(c.daily_limit);
        }
      });
    }
  }, [channelsData]);

  // Populate active prompts from backend
  useEffect(() => {
    if (existingPrompts.length > 0) {
      const activeMap: Record<string, PromptVersionItem> = {};
      const texts: Record<string, string> = {};

      existingPrompts.forEach((p) => {
        if (p.active) {
          activeMap[p.agent_type] = p;
          texts[p.agent_type] = p.prompt_text;
          if (p.agent_type === 'SYSTEM') {
            setSystemPrompt(p.prompt_text);
          }
        }
      });

      setActivePromptsMap(activeMap);
      setAgentPrompts((prev) => ({ ...prev, ...texts }));
    }
  }, [existingPrompts]);

  // Derived channel availability from actual prospect contact data. Email always has a
  // fallback (nearly every prospect record carries an email, real or placeholder) but
  // LinkedIn/voice/message are only ever offered when prospects actually carry that
  // contact method — otherwise the channel is genuinely unusable, not just unchecked.
  const emailAvailableCount = prospects.filter((p) => !!p.prospect.email && !p.prospect.email.endsWith('@apollo.invalid')).length || prospects.length;
  const linkedinAvailableCount = prospects.filter((p) => !!p.prospect.linkedin_url).length;
  const voiceAvailableCount = prospects.filter((p) => !!p.prospect.phone).length;
  const messageAvailableCount = prospects.filter((p) => !!p.prospect.phone || !!p.prospect.email).length;

  useEffect(() => {
    if (linkedinAvailableCount === 0 && linkedinEnabled) setLinkedinEnabled(false);
    if (voiceAvailableCount === 0 && voiceEnabled) setVoiceEnabled(false);
    if (messageAvailableCount === 0 && messageEnabled) setMessageEnabled(false);
  }, [linkedinAvailableCount, voiceAvailableCount, messageAvailableCount]);

  // Enabled agents list for prompting (excluding ICP_FITMENT which is deterministic engine)
  const enabledExecutionAgents = agents
    .filter((a) => a.agent.enabled && a.agent.agent_type !== 'ICP_FITMENT' && a.agent.agent_type !== 'DISCOVERY')
    .map((a) => a.agent.agent_type);

  // Initialize prompt texts with templates if empty
  useEffect(() => {
    enabledExecutionAgents.forEach((agentType) => {
      if (!agentPrompts[agentType] && DEFAULT_TEMPLATES[agentType]) {
        setAgentPrompts((prev) => ({
          ...prev,
          [agentType]: DEFAULT_TEMPLATES[agentType],
        }));
      }
    });
  }, [enabledExecutionAgents, agentPrompts]);

  // Save Channels Mutation
  const saveChannelsMutation = useMutation({
    mutationFn: async () => {
      const payload: ChannelSetting[] = [
        {
          channel: 'email',
          enabled: emailEnabled,
          daily_limit: emailLimit,
          approval_required: approvalRequired,
          working_hours: {},
        },
        {
          channel: 'linkedin',
          enabled: linkedinEnabled,
          daily_limit: linkedinLimit,
          approval_required: approvalRequired,
          working_hours: {},
        },
        {
          channel: 'message',
          enabled: messageEnabled,
          daily_limit: messageLimit,
          approval_required: approvalRequired,
          working_hours: {},
        },
        {
          channel: 'voice',
          enabled: voiceEnabled,
          daily_limit: voiceLimit,
          approval_required: approvalRequired,
          working_hours: {},
        },
      ];
      return await campaignsApi.updateChannels(campaignId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-channels', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-launch-check', campaignId] });
    },
  });

  // Save & Activate Prompt Mutation
  const savePromptMutation = useMutation({
    mutationFn: async ({ agentType, promptText }: { agentType: string; promptText: string }) => {
      setErrorMessage(null);
      // 1. Create prompt version
      const created = await campaignsApi.createPrompt(campaignId, {
        agent_type: agentType,
        prompt_text: promptText,
      });
      // 2. Activate prompt version
      const activated = await campaignsApi.activatePrompt(campaignId, created.id);
      return activated;
    },
    onSuccess: (activated) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-prompts', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-launch-check', campaignId] });
      setActivePromptsMap((prev) => ({ ...prev, [activated.agent_type]: activated }));
      setSuccessMessage(`Prompt for ${activated.agent_type} saved and activated as version ${activated.version}!`);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to activate prompt');
    },
  });

  // Save All and Continue
  const handleSaveAllAndContinue = async () => {
    try {
      setErrorMessage(null);
      // 1. Save channels
      await saveChannelsMutation.mutateAsync();

      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to persist channel and prompt configuration');
    }
  };

  const hasAtLeastOneChannel = emailEnabled || linkedinEnabled || messageEnabled || voiceEnabled;
  const hasActivePrompt = Object.keys(activePromptsMap).length > 0;
  const canProceed = hasAtLeastOneChannel && hasActivePrompt;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">Channels & Agent Prompt Configuration</h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure outreach communication channels based on sourced contact availability, and tune agent prompt harnesses.
        </p>
      </div>

      {successMessage && (
        <div className="flex items-center gap-3 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-3 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* SECTION 1: CHANNELS */}
      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-purple-500/10 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Outreach Channels & Pacing</h3>
            <p className="text-[11px] text-slate-400">
              Availability counts are derived directly from your approved prospect contact records.
            </p>
          </div>

          {/* Rep Approval Policy Toggle */}
          <div className="flex items-center gap-3 bg-[#070811] px-3.5 py-2 rounded-xl border border-purple-500/20">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <div className="text-left">
              <span className="text-xs font-semibold text-white block">Require Rep Approval</span>
              <span className="text-[10px] text-slate-400">Before outbound send</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Email Channel */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              emailEnabled
                ? 'bg-[#070811] border-purple-500/30'
                : 'bg-[#070811]/50 border-purple-500/10 opacity-70'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-300 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Email Outreach</h4>
                  <span className="text-[11px] text-emerald-400 font-medium">
                    {emailAvailableCount} prospects reachable
                  </span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="rounded border-purple-500/30 accent-purple-600 cursor-pointer"
              />
            </div>

            {emailEnabled && (
              <div className="mt-3 pt-3 border-t border-purple-500/10 flex items-center justify-between text-xs">
                <span className="text-slate-400">Daily send limit:</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={emailLimit}
                  onChange={(e) => setEmailLimit(Number(e.target.value))}
                  className="w-16 px-2 py-1 bg-[#0c0e1f] border border-purple-500/20 rounded text-right text-white"
                />
              </div>
            )}
          </div>

          {/* LinkedIn Channel */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              linkedinEnabled
                ? 'bg-[#070811] border-purple-500/30'
                : 'bg-[#070811]/50 border-purple-500/10 opacity-70'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-300 flex items-center justify-center">
                  <Linkedin className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">LinkedIn Touchpoints</h4>
                  <span className={`text-[11px] font-medium ${linkedinAvailableCount === 0 ? 'text-slate-500' : 'text-blue-400'}`}>
                    {linkedinAvailableCount === 0 ? 'No prospects have a LinkedIn URL yet' : `${linkedinAvailableCount} prospects reachable`}
                  </span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={linkedinEnabled}
                disabled={linkedinAvailableCount === 0}
                onChange={(e) => setLinkedinEnabled(e.target.checked)}
                className="rounded border-purple-500/30 accent-purple-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>

            {linkedinEnabled && (
              <div className="mt-3 pt-3 border-t border-purple-500/10 flex items-center justify-between text-xs">
                <span className="text-slate-400">Daily message limit:</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={linkedinLimit}
                  onChange={(e) => setLinkedinLimit(Number(e.target.value))}
                  className="w-16 px-2 py-1 bg-[#0c0e1f] border border-purple-500/20 rounded text-right text-white"
                />
              </div>
            )}
          </div>

          {/* Messages Channel */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              messageEnabled
                ? 'bg-[#070811] border-purple-500/30'
                : 'bg-[#070811]/50 border-purple-500/10 opacity-70'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-300 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Direct Messages</h4>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {messageAvailableCount === 0 ? 'No prospects reachable via message yet' : `${messageAvailableCount} prospects reachable`}
                  </span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={messageEnabled}
                disabled={messageAvailableCount === 0}
                onChange={(e) => setMessageEnabled(e.target.checked)}
                className="rounded border-purple-500/30 accent-purple-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>

            {messageEnabled && (
              <div className="mt-3 pt-3 border-t border-purple-500/10 flex items-center justify-between text-xs">
                <span className="text-slate-400">Daily message limit:</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={messageLimit}
                  onChange={(e) => setMessageLimit(Number(e.target.value))}
                  className="w-16 px-2 py-1 bg-[#0c0e1f] border border-purple-500/20 rounded text-right text-white"
                />
              </div>
            )}
          </div>

          {/* Call / Voice Channel */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              voiceEnabled
                ? 'bg-[#070811] border-purple-500/30'
                : 'bg-[#070811]/50 border-purple-500/10 opacity-70'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-300 flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Voice & Phone Calls</h4>
                  <span className={`text-[11px] font-medium ${voiceAvailableCount === 0 ? 'text-slate-500' : 'text-amber-400'}`}>
                    {voiceAvailableCount === 0 ? 'No prospects have a phone number yet' : `${voiceAvailableCount} prospects reachable`}
                  </span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={voiceEnabled}
                disabled={voiceAvailableCount === 0}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="rounded border-purple-500/30 accent-purple-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>

            {voiceEnabled && (
              <div className="mt-3 pt-3 border-t border-purple-500/10 flex items-center justify-between text-xs">
                <span className="text-slate-400">Daily call limit:</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={voiceLimit}
                  onChange={(e) => setVoiceLimit(Number(e.target.value))}
                  className="w-16 px-2 py-1 bg-[#0c0e1f] border border-purple-500/20 rounded text-right text-white"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: PROMPT CONFIGURATION */}
      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="border-b border-purple-500/10 pb-4">
          <h3 className="text-sm font-bold text-white">Agent Prompt Configuration & Harnesses</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Configure system directives and agent prompts for this campaign. Each prompt is versioned and auditable.
          </p>
        </div>

        {/* Campaign System Prompt */}
        <div className="space-y-2 bg-[#070811] border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-400" />
              <label className="text-xs font-bold text-white">Campaign System Prompt Directive</label>
              {activePromptsMap['SYSTEM'] && (
                <span className="text-[10px] font-semibold bg-purple-950/80 border border-purple-500/40 text-purple-300 px-2 py-0.5 rounded-full">
                  v{activePromptsMap['SYSTEM'].version} • ACTIVE
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSystemPrompt(DEFAULT_TEMPLATES.SYSTEM)}
              className="text-[11px] text-purple-300 hover:text-white flex items-center gap-1 font-medium"
            >
              <Sparkles className="w-3 h-3" /> Start from template
            </button>
          </div>

          <textarea
            rows={3}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full px-3 py-2 bg-[#0c0e1f] border border-purple-500/20 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono resize-none"
          />

          <div className="flex justify-end">
            <button
              type="button"
              disabled={savePromptMutation.isPending}
              onClick={() =>
                savePromptMutation.mutate({
                  agentType: 'SYSTEM',
                  promptText: systemPrompt,
                })
              }
              className="px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg transition-all"
            >
              Save & Activate Directive
            </button>
          </div>
        </div>

        {/* Specific Prompts for Enabled Agents */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-300">Enabled Agent Prompts</h4>

          {enabledExecutionAgents.length === 0 ? (
            <div className="p-4 bg-white/5 rounded-xl text-xs text-slate-400 text-center">
              No autonomous execution agents enabled. Return to Step 3 to enable agents.
            </div>
          ) : (
            enabledExecutionAgents.map((agentType) => {
              const currentPrompt = agentPrompts[agentType] || DEFAULT_TEMPLATES[agentType] || '';
              const activePrompt = activePromptsMap[agentType];

              return (
                <div
                  key={agentType}
                  className="space-y-2 bg-[#070811] border border-purple-500/20 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-purple-400" />
                      <label className="text-xs font-bold text-white">
                        {agentType.replace(/_/g, ' ')} Agent Prompt
                      </label>
                      {activePrompt && (
                        <span className="text-[10px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> v{activePrompt.version} • ACTIVE
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (DEFAULT_TEMPLATES[agentType]) {
                          setAgentPrompts((prev) => ({
                            ...prev,
                            [agentType]: DEFAULT_TEMPLATES[agentType],
                          }));
                        }
                      }}
                      className="text-[11px] text-purple-300 hover:text-white flex items-center gap-1 font-medium"
                    >
                      <Sparkles className="w-3 h-3" /> Start from template
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    value={currentPrompt}
                    onChange={(e) =>
                      setAgentPrompts((prev) => ({
                        ...prev,
                        [agentType]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-[#0c0e1f] border border-purple-500/20 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono resize-none"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={savePromptMutation.isPending}
                      onClick={() =>
                        savePromptMutation.mutate({
                          agentType,
                          promptText: currentPrompt,
                        })
                      }
                      className="px-3.5 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg transition-all"
                    >
                      Save & Activate Prompt
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Sourcing
        </button>

        <button
          type="button"
          disabled={!canProceed || saveChannelsMutation.isPending}
          onClick={handleSaveAllAndContinue}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            canProceed && !saveChannelsMutation.isPending
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {saveChannelsMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Channels...</span>
            </>
          ) : (
            <>
              <span>Save & Continue to Assign Reps</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
