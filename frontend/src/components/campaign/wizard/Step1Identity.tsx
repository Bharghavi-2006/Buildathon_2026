import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react';
import { campaignsApi } from '../../../api/campaigns';

interface Step1IdentityProps {
  campaignId: string | null;
  onSuccess: (campaignId: string) => void;
}

export const Step1Identity: React.FC<Step1IdentityProps> = ({ campaignId, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch managers from backend (GET /team/managers)
  const { data: managers = [], isLoading: loadingManagers } = useQuery({
    queryKey: ['team-managers'],
    queryFn: campaignsApi.getManagers,
  });

  // If editing existing draft, fetch identity
  const { data: identityData, isLoading: loadingIdentity } = useQuery({
    queryKey: ['campaign-identity', campaignId],
    queryFn: () => campaignsApi.getCampaignIdentity(campaignId!),
    enabled: !!campaignId,
  });

  useEffect(() => {
    if (identityData) {
      setName(identityData.name || '');
      setDescription(identityData.description || '');
      if (identityData.owner_id) {
        setOwnerId(identityData.owner_id);
      }
    }
  }, [identityData]);

  // Validation
  const trimmedName = name.trim();
  const isNameValid = trimmedName.length > 0 && trimmedName.length <= 100;
  const isOwnerValid = !!ownerId;
  const canProceed = isNameValid && isOwnerValid;

  const saveMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      if (!campaignId) {
        // 1. Create draft campaign
        const created = await campaignsApi.createDraftCampaign({
          name: trimmedName,
          description: description.trim(),
        });
        // 2. Set owner
        await campaignsApi.updateCampaignIdentity(created.id, {
          name: trimmedName,
          description: description.trim(),
          owner_id: ownerId,
        });
        return created.id;
      } else {
        // Update existing draft
        await campaignsApi.updateCampaignIdentity(campaignId, {
          name: trimmedName,
          description: description.trim(),
          owner_id: ownerId,
        });
        return campaignId;
      }
    },
    onSuccess: (savedId) => {
      onSuccess(savedId);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to save campaign identity');
    },
  });

  if (loadingIdentity) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <span>Loading campaign identity...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Step Header */}
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">Campaign Identity</h2>
        <p className="text-xs text-slate-400 mt-1">
          Establish the core operational parameters and ownership for this outbound campaign.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-3 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {campaignId && (
        <div className="flex items-center gap-2 p-3 bg-purple-950/20 border border-purple-500/20 rounded-xl text-purple-300 text-xs">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-purple-400" />
          <span>Draft Campaign Active: <strong className="text-white">{campaignId}</strong></span>
        </div>
      )}

      <div className="space-y-5 bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl">
        {/* Campaign Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-200 mb-1.5">
            Campaign Name <span className="text-purple-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            maxLength={100}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="e.g. US SaaS Enterprise CTOs"
            className={`w-full px-3.5 py-2.5 bg-[#070811] border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 transition-all ${
              nameTouched && !isNameValid
                ? 'border-red-500/60 focus:ring-red-500'
                : 'border-purple-500/20 focus:border-purple-500 focus:ring-purple-500/50'
            }`}
          />
          <div className="flex items-center justify-between mt-1 text-[11px]">
            {nameTouched && !isNameValid ? (
              <span className="text-red-400">Campaign name is required (max 100 characters).</span>
            ) : (
              <span className="text-slate-500">A clear, descriptive name for reporting and audit logs.</span>
            )}
            <span className="text-slate-500">{name.length}/100</span>
          </div>
        </div>

        {/* Campaign Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-200 mb-1.5">
            Campaign Description & Strategic Objective
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the campaign thesis, value hypothesis, target positioning, and desired conversion outcomes..."
            className="w-full px-3.5 py-2.5 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none"
          />
          <span className="text-[11px] text-slate-500 mt-1 block">
            Used by strategy and personalization agents to align messaging with campaign intent.
          </span>
        </div>

        {/* Campaign Owner */}
        <div>
          <label className="block text-xs font-semibold text-slate-200 mb-1.5">
            Campaign Owner / Manager <span className="text-purple-400">*</span>
          </label>
          {loadingManagers ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
              <span>Loading managers from platform...</span>
            </div>
          ) : (
            <div className="relative">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 appearance-none cursor-pointer"
              >
                <option value="" disabled className="bg-[#0c0e1f] text-slate-400">
                  Select the accountable manager
                </option>
                {managers.map((m) => (
                  <option key={m.user.id} value={m.user.id} className="bg-[#0c0e1f] text-white">
                    {m.user.name} ({m.user.email}) — Manager
                  </option>
                ))}
              </select>
              <UserCheck className="w-4 h-4 text-purple-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
          )}
          <span className="text-[11px] text-slate-500 mt-1 block">
            The manager accountable for campaign policies, safety thresholds, and agent overrides.
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          disabled={!canProceed || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            canProceed && !saveMutation.isPending
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Draft...</span>
            </>
          ) : (
            <>
              <span>Save & Continue to Targeting</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
