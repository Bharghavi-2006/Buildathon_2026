import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import { campaignsApi } from '../../api/campaigns';
import { WizardStepHeader } from '../../components/campaign/wizard/WizardStepHeader';
import { Step1Identity } from '../../components/campaign/wizard/Step1Identity';
import { Step2Targeting } from '../../components/campaign/wizard/Step2Targeting';
import { Step3Agents } from '../../components/campaign/wizard/Step3Agents';
import { Step4Sourcing } from '../../components/campaign/wizard/Step4Sourcing';
import { Step5ChannelsPrompts } from '../../components/campaign/wizard/Step5ChannelsPrompts';
import { Step6Knowledge } from '../../components/campaign/wizard/Step6Knowledge';
import { Step6Representatives } from '../../components/campaign/wizard/Step6Representatives';
import { Step7PreLaunch } from '../../components/campaign/wizard/Step7PreLaunch';

export const NewCampaign: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const campaignId = searchParams.get('id');
  const stepParam = parseInt(searchParams.get('step') || '1', 10);
  const currentStep = isNaN(stepParam) || stepParam < 1 || stepParam > 8 ? 1 : stepParam;

  // A step's own "Save & Continue" mutation is the ground truth that the step just
  // completed — trust it immediately rather than waiting for the read-model queries
  // below to refetch and agree. Those queries are keyed by campaignId, and for the
  // very first step the campaign (and therefore any query for it) doesn't exist yet
  // until this exact transition, so there is no cache to invalidate-and-await: the
  // fetch necessarily starts cold, and the "snap back to max unlocked step" effect
  // fires on that first still-loading render and bounces the wizard back a step,
  // which is what made it look like every "Save & Continue" click needed pressing
  // twice. Tracking confirmed-just-unlocked steps locally sidesteps that race.
  const [manualUnlocks, setManualUnlocks] = useState<number[]>([]);

  // 1. Fetch identity to verify Step 1 completion
  const { data: identity } = useQuery({
    queryKey: ['campaign-identity', campaignId],
    queryFn: () => campaignsApi.getCampaignIdentity(campaignId!),
    enabled: !!campaignId,
  });

  // 2. Fetch ICP to verify Step 2 completion
  const { data: icp } = useQuery({
    queryKey: ['campaign-icp', campaignId],
    queryFn: () => campaignsApi.getCampaignIcp(campaignId!),
    enabled: !!campaignId,
  });

  // 3. Fetch Agents to verify Step 3 completion
  const { data: agents = [] } = useQuery({
    queryKey: ['campaign-agents', campaignId],
    queryFn: () => campaignsApi.getCampaignAgents(campaignId!),
    enabled: !!campaignId,
  });

  // 4. Fetch Prospects to verify Step 4 completion
  const { data: prospects = [] } = useQuery({
    queryKey: ['campaign-prospects', campaignId],
    queryFn: () => campaignsApi.getCampaignProspects(campaignId!),
    enabled: !!campaignId,
  });

  // 5. Fetch Channels & Prompts to verify Step 5 completion
  const { data: channels = [] } = useQuery({
    queryKey: ['campaign-channels', campaignId],
    queryFn: () => campaignsApi.getChannels(campaignId!),
    enabled: !!campaignId,
  });

  const { data: prompts = [] } = useQuery({
    queryKey: ['campaign-prompts', campaignId],
    queryFn: () => campaignsApi.getPrompts(campaignId!),
    enabled: !!campaignId,
  });

  // 7. Fetch Assigned Reps to verify Step 7 completion
  const { data: assignedReps = [] } = useQuery({
    queryKey: ['campaign-assigned-reps', campaignId],
    queryFn: () => campaignsApi.getAssignedRepresentatives(campaignId!),
    enabled: !!campaignId,
  });

  // Sequential evaluation of completed & unlocked steps
  const { completedSteps, unlockedSteps } = useMemo(() => {
    const completed: number[] = [];
    const unlocked: number[] = [1];

    if (!campaignId) {
      return { completedSteps: completed, unlockedSteps: unlocked };
    }

    // Step 1: Completed if name and owner_id exist
    const step1Done = !!identity?.name && !!identity?.owner_id;
    if (step1Done) {
      completed.push(1);
      unlocked.push(2);
    }

    // Step 2: Completed if ICP has roles or industries
    const step2Done =
      step1Done &&
      ((icp?.target_roles && icp.target_roles.length > 0) ||
        (icp?.industries && icp.industries.length > 0));
    if (step2Done) {
      completed.push(2);
      unlocked.push(3);
    }

    // Step 3: Completed if at least 1 agent is enabled
    const step3Done = step2Done && agents.some((a) => a.agent.enabled);
    if (step3Done) {
      completed.push(3);
      unlocked.push(4);
    }

    // Step 4: Completed if at least 1 prospect is enrolled
    const step4Done = step3Done && prospects.length > 0;
    if (step4Done) {
      completed.push(4);
      unlocked.push(5);
    }

    // Step 5: Completed if at least 1 channel enabled and 1 prompt active
    const hasChannel = channels.some((c) => c.enabled);
    const hasActivePrompt = prompts.some((p) => p.active);
    const step5Done = step4Done && hasChannel && hasActivePrompt;
    if (step5Done) {
      completed.push(5);
      unlocked.push(6);
    }

    // Step 6: Knowledge base upload is optional context, so it's unlocked (and treated
    // as complete) as soon as Channels & Prompts is done — nothing further to gate on.
    const step6Done = step5Done;
    if (step6Done) {
      completed.push(6);
      unlocked.push(7);
    }

    // Step 7: Completed if at least 1 rep assigned
    const step7Done = step6Done && assignedReps.length > 0;
    if (step7Done) {
      completed.push(7);
      unlocked.push(8);
    }

    return { completedSteps: completed, unlockedSteps: unlocked };
  }, [campaignId, identity, icp, agents, prospects, channels, prompts, assignedReps]);

  // The step header and the "snap back" guard both use this union, so a step we just
  // confirmed complete stays unlocked even on the render before its query has refetched.
  const effectiveUnlockedSteps = useMemo(
    () => Array.from(new Set([...unlockedSteps, ...manualUnlocks])),
    [unlockedSteps, manualUnlocks]
  );

  // Navigate to step helper
  const goToStep = (step: number) => {
    const params = new URLSearchParams(searchParams);
    if (campaignId) params.set('id', campaignId);
    params.set('step', String(step));
    setSearchParams(params);
  };

  // Called right after a step's own mutation confirms success. Refreshing the query
  // cache keeps other parts of the wizard (e.g. Step 7's checklist) accurate, but
  // navigation itself never waits on that refetch — see the comment on manualUnlocks.
  const advanceStep = (step: number, invalidateKeys: unknown[][]) => {
    setManualUnlocks((prev) => (prev.includes(step) ? prev : [...prev, step]));
    invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    goToStep(step);
  };

  // If URL step is ahead of unlocked steps, snap to maximum unlocked step
  useEffect(() => {
    const maxUnlocked = Math.max(...effectiveUnlockedSteps);
    if (currentStep > maxUnlocked) {
      goToStep(maxUnlocked);
    }
  }, [currentStep, effectiveUnlockedSteps]);

  const handleStep1Success = (createdCampaignId: string) => {
    setManualUnlocks((prev) => (prev.includes(2) ? prev : [...prev, 2]));
    queryClient.invalidateQueries({ queryKey: ['campaign-identity', createdCampaignId] });
    const params = new URLSearchParams();
    params.set('id', createdCampaignId);
    params.set('step', '2');
    setSearchParams(params);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </button>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-purple-400">New Campaign</span>
          </div>

          <h1 className="text-2xl font-serif italic font-medium text-white tracking-tight mt-1 flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-purple-400" />
            New Campaign Launch Wizard
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Configure targeting, agents, sourcing, channels, and representatives before launch. Each completed step unlocks subsequent operational checkpoints.
          </p>
        </div>
      </div>

      {/* Sequential Step Header */}
      <WizardStepHeader
        currentStep={currentStep}
        completedSteps={completedSteps}
        unlockedSteps={effectiveUnlockedSteps}
        onSelectStep={goToStep}
      />

      {/* Active Step Body */}
      <div className="mt-6">
        {currentStep === 1 && (
          <Step1Identity
            campaignId={campaignId}
            onSuccess={handleStep1Success}
          />
        )}

        {currentStep === 2 && campaignId && (
          <Step2Targeting
            campaignId={campaignId}
            onBack={() => goToStep(1)}
            onSuccess={() => advanceStep(3, [['campaign-icp', campaignId]])}
          />
        )}

        {currentStep === 3 && campaignId && (
          <Step3Agents
            campaignId={campaignId}
            onBack={() => goToStep(2)}
            onSuccess={() => advanceStep(4, [['campaign-agents', campaignId]])}
          />
        )}

        {currentStep === 4 && campaignId && (
          <Step4Sourcing
            campaignId={campaignId}
            onBack={() => goToStep(3)}
            onSuccess={() => advanceStep(5, [['campaign-prospects', campaignId]])}
          />
        )}

        {currentStep === 5 && campaignId && (
          <Step5ChannelsPrompts
            campaignId={campaignId}
            onBack={() => goToStep(4)}
            onSuccess={() => advanceStep(6, [['campaign-channels', campaignId], ['campaign-prompts', campaignId]])}
          />
        )}

        {currentStep === 6 && campaignId && (
          <Step6Knowledge
            campaignId={campaignId}
            onBack={() => goToStep(5)}
            onSuccess={() => goToStep(7)}
          />
        )}

        {currentStep === 7 && campaignId && (
          <Step6Representatives
            campaignId={campaignId}
            onBack={() => goToStep(6)}
            onSuccess={() => advanceStep(8, [['campaign-assigned-reps', campaignId]])}
          />
        )}

        {currentStep === 8 && campaignId && (
          <Step7PreLaunch
            campaignId={campaignId}
            onBack={() => goToStep(7)}
            onNavigateToStep={goToStep}
          />
        )}
      </div>
    </div>
  );
};
