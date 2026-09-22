import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Rocket,
  Wrench,
  Users,
  Target,
  Bot,
  Mail,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { campaignsApi } from '../../../api/campaigns';

interface Step7PreLaunchProps {
  campaignId: string;
  onBack: () => void;
  onNavigateToStep: (step: number) => void;
}

const STEP_FIX_MAP: Record<string, number> = {
  identity: 1,
  icp: 2,
  agents: 3,
  prospects: 4,
  channels: 5,
  prompts: 5,
  representative: 7,
  conflicts: 4,
  draft: 1,
};

const STEP_REASON_MAP: Record<string, string> = {
  identity: 'Campaign name and an active campaign owner must be configured.',
  icp: 'At least target roles or industries and a valid geography must be defined.',
  agents: 'At least one autonomous agent or qualification engine must be enabled.',
  prospects: 'At least one prospect must be sourced, approved, and enrolled into the campaign funnel.',
  channels: 'At least one active outreach channel (Email, LinkedIn, Message, Call) must be enabled.',
  prompts: 'At least one agent prompt version must be reviewed and activated for this campaign.',
  representative: 'At least one representative must be assigned to execute and review outreach.',
  conflicts: 'All blocking prospect conflicts and suppression list violations must be resolved.',
  draft: 'Campaign must be in DRAFT lifecycle state to activate.',
};

export const Step7PreLaunch: React.FC<Step7PreLaunchProps> = ({
  campaignId,
  onBack,
  onNavigateToStep,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activatedCampaignName, setActivatedCampaignName] = useState<string | null>(null);

  // Fetch live launch checks from backend
  const { data: launchCheck, isLoading, refetch } = useQuery({
    queryKey: ['campaign-launch-check', campaignId],
    queryFn: () => campaignsApi.getLaunchCheck(campaignId),
    enabled: !!campaignId,
    refetchInterval: 5000,
  });

  // Fetch campaign overview details
  const { data: campaign } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.getCampaign(campaignId),
    enabled: !!campaignId,
  });

  const { data: prospects = [] } = useQuery({
    queryKey: ['campaign-prospects', campaignId],
    queryFn: () => campaignsApi.getCampaignProspects(campaignId),
    enabled: !!campaignId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['campaign-agents', campaignId],
    queryFn: () => campaignsApi.getCampaignAgents(campaignId),
    enabled: !!campaignId,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['campaign-channels', campaignId],
    queryFn: () => campaignsApi.getChannels(campaignId),
    enabled: !!campaignId,
  });

  const { data: assignedReps = [] } = useQuery({
    queryKey: ['campaign-assigned-reps', campaignId],
    queryFn: () => campaignsApi.getAssignedRepresentatives(campaignId),
    enabled: !!campaignId,
  });

  // Activate Mutation
  const activateMutation = useMutation({
    mutationFn: async () => {
      setActivationError(null);
      return await campaignsApi.activateCampaign(campaignId);
    },
    onSuccess: (updated) => {
      setActivatedCampaignName(updated.name);
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });

      // After brief confirmation, navigate to campaign detail
      setTimeout(() => {
        navigate(`/campaigns/${campaignId}`);
      }, 1500);
    },
    onError: (err: any) => {
      setActivationError(err.message || 'Campaign activation rejected by backend validation.');
      refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <span>Evaluating authoritative pre-launch validation rules...</span>
      </div>
    );
  }

  const isReady = !!launchCheck?.ready;
  const checks = launchCheck?.checks || [];
  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  const enabledChannelLabels = channels
    .filter((channel) => channel.enabled)
    .map((channel) => channel.channel === 'voice' ? 'Call' : channel.channel[0].toUpperCase() + channel.channel.slice(1));

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-serif italic font-medium text-white tracking-tight">Pre-Launch Checklist & Activation</h2>
        <p className="text-xs text-slate-400 mt-1">
          The backend authoritative engine verifies all campaign invariants before permitting transition from DRAFT to LIVE.
        </p>
      </div>

      {activatedCampaignName && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl text-emerald-200 text-xs flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <div className="font-bold text-white text-sm">Campaign Successfully Activated!</div>
              <div>{activatedCampaignName} is now LIVE and orchestrating autonomous outreach. Redirecting...</div>
            </div>
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
        </div>
      )}

      {activationError && (
        <div className="flex items-center gap-3 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{activationError}</span>
        </div>
      )}

      {/* Overview Snapshot Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Sourced Prospects</div>
            <div className="text-sm font-bold text-white">{prospects.length} leads</div>
          </div>
        </div>

        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Enabled Agents</div>
            <div className="text-sm font-bold text-white">{agents.filter((a) => a.agent.enabled).length} active</div>
          </div>
        </div>

        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Channels</div>
            <div className="text-sm font-bold text-white">{enabledChannelLabels.join(' + ') || 'None enabled'}</div>
          </div>
        </div>

        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Assigned SDRs</div>
            <div className="text-sm font-bold text-white">{assignedReps.length} reps</div>
          </div>
        </div>
      </div>

      {/* Checklist Card */}
      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
          <h3 className="text-sm font-bold text-white">Launch Verification Checklist</h3>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              isReady
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
            }`}
          >
            {passedCount} of {totalCount} Passed
          </span>
        </div>

        <div className="divide-y divide-purple-500/10">
          {checks.map((check) => {
            const stepNum = STEP_FIX_MAP[check.key] || 1;
            const explanation = STEP_REASON_MAP[check.key] || 'Must satisfy configuration requirement.';

            return (
              <div
                key={check.key}
                className="py-3.5 flex items-center justify-between gap-4 first:pt-1 last:pb-1"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {check.passed ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-red-950/80 border border-red-500/50 text-red-400 flex items-center justify-center">
                        <XCircle className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      {check.label}
                      {!check.passed && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-950/50 px-2 py-0.2 rounded-md">
                          Required
                        </span>
                      )}
                    </div>
                    {!check.passed && (
                      <div className="text-[11px] text-slate-400 mt-0.5">{explanation}</div>
                    )}
                  </div>
                </div>

                {!check.passed && (
                  <button
                    type="button"
                    onClick={() => onNavigateToStep(stepNum)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-purple-950/50 hover:bg-purple-900/70 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                  >
                    <Wrench className="w-3 h-3" />
                    <span>Fix in Step {stepNum}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Activation Action */}
      <div className="flex items-center justify-between pt-4 border-t border-purple-500/10">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Representatives
        </button>

        <div className="flex items-center gap-3">
          {!isReady && (
            <span className="text-xs text-amber-400 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              All checklist rules must pass to activate.
            </span>
          )}

          <button
            type="button"
            disabled={!isReady || activateMutation.isPending}
            onClick={() => activateMutation.mutate()}
            className={`flex items-center gap-2.5 px-8 py-3 rounded-xl text-sm font-bold tracking-wide transition-all ${
              isReady && !activateMutation.isPending
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-xl shadow-purple-900/50 hover:shadow-purple-700/60 ring-1 ring-purple-400/40 cursor-pointer'
                : 'bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-700/30'
            }`}
          >
            {activateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authorizing Activation...</span>
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 text-purple-200" />
                <span>ACTIVATE CAMPAIGN</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
