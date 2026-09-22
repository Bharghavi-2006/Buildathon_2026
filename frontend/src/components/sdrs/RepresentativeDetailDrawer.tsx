import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  X,
  Loader2,
  AlertTriangle,
  Mail,
  Linkedin,
  Phone,
  Clock,
  Layers,
  Globe,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Edit2,
  Save,
  Sparkles,
  Award,
  AlertCircle,
  UserPlus,
  Smartphone,
  ArrowRightLeft,
} from 'lucide-react';
import { representativesApi } from '../../api/representatives';
import { campaignsApi } from '../../api/campaigns';
import { StatusBadge } from '../ui/StatusBadge';
import { RepMatchItem } from '../../types';

interface RepresentativeDetailDrawerProps {
  representativeId: string | null;
  onClose: () => void;
  campaignContextId?: string | null;
  matchData?: RepMatchItem | null;
}

export const RepresentativeDetailDrawer: React.FC<RepresentativeDetailDrawerProps> = ({
  representativeId,
  onClose,
  campaignContextId,
  matchData,
}) => {
  const queryClient = useQueryClient();
  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [capacityInput, setCapacityInput] = useState<number>(50);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [campaignToAssign, setCampaignToAssign] = useState('');
  const [reassigningCampaignId, setReassigningCampaignId] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState('');

  // Fetch full representative profile, workload, assignments, approvals
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['representative-detail', representativeId],
    queryFn: () => representativesApi.getRepresentativeDetail(representativeId!),
    enabled: !!representativeId,
  });

  // Fetch rep matches for campaignContextId if matchData wasn't provided directly
  const { data: campaignMatches = [] } = useQuery({
    queryKey: ['rep-matches', campaignContextId],
    queryFn: () => campaignsApi.getRepMatches(campaignContextId!),
    enabled: !!campaignContextId && !matchData,
  });

  // All campaigns, for the "Assign to Campaign" picker — same assignment record Step 6 of the wizard writes to
  const { data: dashboardData } = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: campaignsApi.getDashboard,
    enabled: showAssignPicker,
  });

  // Other reps, for reassigning an inactive rep's campaign assignments to someone active
  const { data: allReps = [] } = useQuery({
    queryKey: ['team-representatives'],
    queryFn: representativesApi.getRepresentatives,
    enabled: !!reassigningCampaignId,
  });

  const assignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      if (!representativeId) return;
      return await campaignsApi.assignRepresentative(campaignId, { representative_id: representativeId });
    },
    onSuccess: () => {
      setShowAssignPicker(false);
      setCampaignToAssign('');
      queryClient.invalidateQueries({ queryKey: ['representative-detail', representativeId] });
      queryClient.invalidateQueries({ queryKey: ['team-representatives'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-representatives'] });
    },
    onError: (err: any) => alert(err.message || 'Failed to assign representative to campaign'),
  });

  // Hands an inactive rep's campaign assignment to another active rep: add the new
  // rep to the campaign, then drop the inactive rep from it.
  const reassignMutation = useMutation({
    mutationFn: async ({ campaignId, newRepId }: { campaignId: string; newRepId: string }) => {
      await campaignsApi.assignRepresentative(campaignId, { representative_id: newRepId });
      await campaignsApi.removeRepresentative(campaignId, representativeId!);
    },
    onSuccess: () => {
      setReassigningCampaignId(null);
      setReassignTargetId('');
      queryClient.invalidateQueries({ queryKey: ['representative-detail', representativeId] });
      queryClient.invalidateQueries({ queryKey: ['team-representatives'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-representatives'] });
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['rep-matches'] });
    },
    onError: (err: any) => alert(err.message || 'Failed to reassign campaign to another representative'),
  });

  const activeMatch: RepMatchItem | undefined =
    matchData ||
    (campaignContextId && representativeId
      ? campaignMatches.find((m) => m.representative_id === representativeId)
      : undefined);

  const toggleActiveMutation = useMutation({
    mutationFn: async (newActive: boolean) => {
      if (!representativeId) return;
      return await representativesApi.updateRepresentative(representativeId, {
        active: newActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representative-detail', representativeId] });
      queryClient.invalidateQueries({ queryKey: ['team-representatives'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-representatives'] });
    },
  });

  const updateCapacityMutation = useMutation({
    mutationFn: async (maxLeads: number) => {
      if (!representativeId) return;
      return await representativesApi.updateRepresentative(representativeId, {
        max_active_leads: maxLeads,
      });
    },
    onSuccess: () => {
      setIsEditingCapacity(false);
      queryClient.invalidateQueries({ queryKey: ['representative-detail', representativeId] });
      queryClient.invalidateQueries({ queryKey: ['team-representatives'] });
    },
  });

  if (!representativeId) return null;

  const user = detail?.user;
  const profile = detail?.profile;
  const activeLeads = detail?.active_leads || 0;
  const capacity = profile?.max_active_leads || 50;
  const utilization = Math.round((activeLeads / capacity) * 100);
  const isInactive = profile?.active === false;
  // The backend keeps a removed campaign assignment as a soft-deleted row (active: false)
  // rather than deleting it, so it must be filtered out here to reflect real assignments.
  const assignments = (detail?.campaign_assignments || []).filter((a) => a.assignment.active !== false);
  const hasAssignments = assignments.length > 0;
  const isInactiveWithAssignments = isInactive && hasAssignments;

  let capacityStatus: 'AVAILABLE' | 'NEAR_CAPACITY' | 'AT_CAPACITY' | 'OVER_CAPACITY' = 'AVAILABLE';
  let capacityBadgeColor = 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30';
  if (utilization >= 100) {
    capacityStatus = 'OVER_CAPACITY';
    capacityBadgeColor = 'bg-rose-950/50 text-rose-300 border-rose-500/30';
  } else if (utilization >= 95) {
    capacityStatus = 'AT_CAPACITY';
    capacityBadgeColor = 'bg-orange-950/50 text-orange-300 border-orange-500/30';
  } else if (utilization >= 85) {
    capacityStatus = 'NEAR_CAPACITY';
    capacityBadgeColor = 'bg-amber-950/50 text-amber-300 border-amber-500/30';
  }

  const workingHours = profile?.working_hours || { start: 9, end: 18 };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-[#0c0e1f] border-l border-purple-500/20 h-full shadow-2xl flex flex-col">
        {/* Drawer Header */}
        <div className="p-6 border-b border-purple-500/10 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white tracking-tight">{user?.name || 'Representative Detail'}</h2>
              <StatusBadge status={isInactive ? 'INACTIVE' : 'ACTIVE'} size="sm" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{user?.email}</p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12 text-slate-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <span className="text-xs">Loading SDR profile & workload...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-xs text-red-400">Unable to load representative details. Please try again.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {/* Offboarding / Inactive Warning if assignments exist */}
            {isInactiveWithAssignments && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Representative is inactive and has active campaign assignments</span>
                </div>
                <p className="text-[11px] text-amber-200/80">
                  This representative has {assignments.length} assigned campaign(s) and {activeLeads} active leads, but their profile status is currently inactive. Outbound actions may be halted or require manager intervention.
                </p>
                <div className="text-[11px] text-amber-300/90 font-medium">
                  Affected Campaigns: {assignments.map((a) => a.campaign.name).join(', ')} ({activeLeads} total prospects assigned)
                </div>
                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActiveMutation.mutate(true)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-black text-[11px] font-bold rounded-lg transition-all"
                  >
                    Reactivate Representative
                  </button>
                </div>
              </div>
            )}

            {/* Rep Matching Integration Details (Section 11) */}
            {activeMatch && (
              <div className="p-4 bg-purple-950/30 border border-purple-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-white text-xs">Rep Matching Analysis</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      activeMatch.score >= 80
                        ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30'
                        : activeMatch.score >= 60
                        ? 'bg-purple-950/50 text-purple-300 border-purple-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {activeMatch.score}% Match Score
                  </span>
                </div>

                {/* Match Dimension Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-[#070811] p-2.5 rounded-lg border border-[#7C3AED]">
                    <span className="text-slate-500 block text-[10px]">ICP / Domain Fit</span>
                    <span className="font-semibold text-slate-200">{activeMatch.breakdown?.icp_fit ?? 0}%</span>
                  </div>
                  <div className="bg-[#070811] p-2.5 rounded-lg border border-[#7C3AED]">
                    <span className="text-slate-500 block text-[10px]">Geography / Timezone</span>
                    <span className="font-semibold text-slate-200">{activeMatch.breakdown?.geography_fit ?? 0}%</span>
                  </div>
                  <div className="bg-[#070811] p-2.5 rounded-lg border border-[#7C3AED]">
                    <span className="text-slate-500 block text-[10px]">Channel Fit</span>
                    <span className="font-semibold text-slate-200">{activeMatch.breakdown?.channel_fit ?? 0}%</span>
                  </div>
                  <div className="bg-[#070811] p-2.5 rounded-lg border border-[#7C3AED]">
                    <span className="text-slate-500 block text-[10px]">Capacity</span>
                    <span className="font-semibold text-slate-200">{activeMatch.breakdown?.capacity ?? 0}%</span>
                  </div>
                  <div className="bg-[#070811] p-2.5 rounded-lg border border-[#7C3AED]">
                    <span className="text-slate-500 block text-[10px]">Specialization</span>
                    <span className="font-semibold text-slate-200">{activeMatch.breakdown?.specialization ?? 0}%</span>
                  </div>
                  <div className="bg-[#070811] p-2.5 rounded-lg border border-[#7C3AED]">
                    <span className="text-slate-500 block text-[10px]">Working Hours Overlap</span>
                    <span className="font-semibold text-slate-200">{activeMatch.breakdown?.working_hours ?? 0}%</span>
                  </div>
                </div>

                {/* Match Reasons */}
                {activeMatch.reasons && activeMatch.reasons.length > 0 && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                      Match Reasons
                    </span>
                    <ul className="space-y-1">
                      {activeMatch.reasons.map((r, i) => (
                        <li key={i} className="text-slate-300 text-[11px] flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Match Warnings */}
                {activeMatch.warnings && activeMatch.warnings.length > 0 && (
                  <div className="pt-2 border-t border-purple-500/10">
                    <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider block mb-1">
                      Match Warnings
                    </span>
                    <ul className="space-y-1">
                      {activeMatch.warnings.map((w, i) => (
                        <li key={i} className="text-amber-300 text-[11px] flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Top Workload Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#070811] p-3 rounded-xl border border-[#7C3AED]">
                <span className="text-slate-400 text-[11px] block">Active Leads</span>
                <span className="text-base font-bold text-white mt-0.5 block">{activeLeads}</span>
              </div>

              <div className="bg-[#070811] p-3 rounded-xl border border-[#7C3AED]">
                <span className="text-slate-400 text-[11px] block">Capacity</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-base font-bold text-white">{capacity}</span>
                  <button
                    onClick={() => {
                      setCapacityInput(capacity);
                      setIsEditingCapacity(!isEditingCapacity);
                    }}
                    className="text-purple-400 hover:text-white"
                    title="Edit capacity"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-[#070811] p-3 rounded-xl border border-[#7C3AED]">
                <span className="text-slate-400 text-[11px] block">Pending Approvals</span>
                <span className="text-base font-bold text-white mt-0.5 block">
                  {detail?.approvals?.pending_count || 0}
                </span>
              </div>

              <div className="bg-[#070811] p-3 rounded-xl border border-[#7C3AED]">
                <span className="text-slate-400 text-[11px] block">Outreach Sent</span>
                <span className="text-base font-bold text-white mt-0.5 block">
                  {detail?.outreach_sent || 0}
                </span>
              </div>
            </div>

            {/* Quick Capacity Editor */}
            {isEditingCapacity && (
              <div className="flex items-center gap-2 p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl">
                <span className="text-slate-300">Set Max Active Leads:</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={capacityInput}
                  onChange={(e) => setCapacityInput(Number(e.target.value))}
                  className="w-20 px-2 py-1 bg-[#070811] border border-purple-500/30 rounded text-white text-right"
                />
                <button
                  onClick={() => updateCapacityMutation.mutate(capacityInput)}
                  disabled={updateCapacityMutation.isPending}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold flex items-center gap-1"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
              </div>
            )}

            {/* Capacity Status & Warnings (Section 5 & 8) */}
            <div className="bg-[#070811] p-4 rounded-xl border border-[#7C3AED] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Capacity Utilization</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${capacityBadgeColor}`}>
                  {capacityStatus.replace('_', ' ')} ({activeLeads} / {capacity} • {utilization}%)
                </span>
              </div>

              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    utilization >= 100
                      ? 'bg-rose-500'
                      : utilization >= 95
                      ? 'bg-orange-500'
                      : utilization >= 85
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, utilization)}%` }}
                />
              </div>

              {utilization >= 100 ? (
                <p className="text-[11px] text-rose-300 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Rep is currently over assigned capacity.
                </p>
              ) : utilization >= 95 ? (
                <p className="text-[11px] text-orange-300 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Rep has reached assigned capacity.
                </p>
              ) : utilization >= 85 ? (
                <p className="text-[11px] text-amber-300 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Rep is approaching assigned capacity.
                </p>
              ) : (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Rep has available capacity for new campaign assignments.
                </p>
              )}
            </div>

            {/* Availability & Working Hours */}
            <div className="bg-[#070811] p-4 rounded-xl border border-[#7C3AED] space-y-3">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                Availability & Schedule
              </h3>
              <div className="grid grid-cols-2 gap-3 text-slate-300">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-[11px] text-slate-500 block">Working Hours</span>
                    <span>{workingHours.start || 9}:00 - {workingHours.end || 18}:00</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-[11px] text-slate-500 block">Timezone</span>
                    <span>{profile?.timezone || 'UTC'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-purple-500/10">
                <span className="text-[11px] text-slate-500 block mb-1.5">Supported Outreach Channels</span>
                <div className="flex flex-wrap gap-2">
                  {(profile?.supported_channels || ['email', 'linkedin']).map((ch) => (
                    <span
                      key={ch}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-purple-500/20 text-slate-200 text-xs capitalize"
                    >
                      {ch === 'email' ? <Mail className="w-3 h-3 text-purple-300" /> : null}
                      {ch === 'linkedin' ? <Linkedin className="w-3 h-3 text-blue-300" /> : null}
                      {ch === 'call' || ch === 'voice' ? <Phone className="w-3 h-3 text-amber-300" /> : null}
                      {ch === 'sms' || ch === 'message' || ch === 'messages' ? <Smartphone className="w-3 h-3 text-emerald-300" /> : null}
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Skillset & Specialization */}
            <div className="bg-[#070811] p-4 rounded-xl border border-[#7C3AED] space-y-3">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                Skillset & Territory Alignment
              </h3>
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">ICP & Domain Specialization</span>
                <div className="flex flex-wrap gap-1.5">
                  {(profile?.specialties || []).map((spec) => (
                    <span
                      key={spec}
                      className="px-2.5 py-0.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-200 text-[11px]"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Assigned Geographic Regions</span>
                <div className="flex flex-wrap gap-1.5">
                  {(profile?.regions || []).map((reg) => (
                    <span
                      key={reg}
                      className="px-2.5 py-0.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-200 text-[11px]"
                    >
                      {reg}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Campaign Assignments (Section 7) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                  Campaign Assignments ({assignments.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAssignPicker((v) => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white text-[11px] font-semibold transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Assign to Campaign
                </button>
              </div>

              {showAssignPicker && (
                <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl flex items-center gap-2">
                  <select
                    value={campaignToAssign}
                    onChange={(e) => setCampaignToAssign(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-[#070811] border border-purple-500/30 rounded-lg text-white text-xs"
                  >
                    <option value="">Select a campaign...</option>
                    {(dashboardData?.campaigns || [])
                      .filter((c) => !assignments.some((a) => a.campaign.id === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                      ))}
                  </select>
                  <button
                    disabled={!campaignToAssign || assignMutation.isPending}
                    onClick={() => assignMutation.mutate(campaignToAssign)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold"
                  >
                    {assignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Assign'}
                  </button>
                </div>
              )}

              {assignments.length === 0 ? (
                <div className="p-4 bg-[#070811] rounded-xl border border-[#7C3AED] text-slate-500 text-center">
                  No active campaign assignments.
                </div>
              ) : (
                <div className="space-y-2">
                  {assignments.map(({ campaign, assignment, assigned_lead_count }) => (
                    <div
                      key={campaign.id}
                      className="p-3.5 bg-[#070811] rounded-xl border border-purple-500/15 space-y-2.5 hover:border-purple-500/40 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">Campaign</div>
                          <Link
                            to={`/campaigns/${campaign.id}`}
                            className="font-semibold text-white hover:text-purple-300 flex items-center gap-1 text-xs mt-0.5"
                          >
                            {campaign.name}
                            <ExternalLink className="w-3 h-3 text-slate-500" />
                          </Link>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">Status</div>
                          <StatusBadge status={campaign.status} size="sm" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 pt-2 border-t border-purple-500/10">
                        <div>
                          <span className="block text-slate-500 text-[10px]">Assigned Prospects</span>
                          <span className="font-bold text-slate-200">{assigned_lead_count}</span>
                        </div>
                        <div>
                          <span className="block text-slate-500 text-[10px]">Daily Limit</span>
                          <span className="font-bold text-slate-200">{assignment.daily_send_limit || 25}</span>
                        </div>
                        <div>
                          <span className="block text-slate-500 text-[10px]">Channels</span>
                          <span className="font-medium text-slate-200 truncate block">
                            {campaign.active_channels?.join(', ') || 'Email, LinkedIn'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-slate-500 text-[10px]">Load</span>
                          <span className="font-bold text-purple-300">
                            {assigned_lead_count} / {assignment.daily_send_limit || 25}
                          </span>
                        </div>
                      </div>

                      {isInactive && (
                        <div className="pt-2.5 border-t border-amber-500/10">
                          {reassigningCampaignId === campaign.id ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={reassignTargetId}
                                onChange={(e) => setReassignTargetId(e.target.value)}
                                className="flex-1 px-2.5 py-1.5 bg-[#0c0e1f] border border-amber-500/30 rounded-lg text-white text-xs"
                              >
                                <option value="">Reassign to...</option>
                                {allReps
                                  .filter((r) => r.user.id !== representativeId && r.profile.active !== false)
                                  .map((r) => (
                                    <option key={r.user.id} value={r.user.id}>{r.user.name}</option>
                                  ))}
                              </select>
                              <button
                                disabled={!reassignTargetId || reassignMutation.isPending}
                                onClick={() => reassignMutation.mutate({ campaignId: campaign.id, newRepId: reassignTargetId })}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black rounded-lg text-xs font-semibold whitespace-nowrap"
                              >
                                {reassignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
                              </button>
                              <button
                                onClick={() => { setReassigningCampaignId(null); setReassignTargetId(''); }}
                                className="text-slate-400 hover:text-white text-xs px-1"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setReassigningCampaignId(campaign.id); setReassignTargetId(''); }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[11px] font-semibold transition-all"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              Reassign to another representative
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Approval Workload & Monitoring Connection (Section 12) */}
            <div className="bg-[#070811] p-4 rounded-xl border border-[#7C3AED] space-y-2.5">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                Approval Workload & SLAs
              </h3>
              <div className="flex items-center justify-between text-slate-300">
                <span>Pending drafts awaiting rep decision:</span>
                <span className="font-bold text-white">{detail?.approvals?.pending_count || 0}</span>
              </div>
              {detail?.approvals?.aging_count ? (
                <div className="flex items-center justify-between text-amber-400 font-semibold pt-1 border-t border-purple-500/10">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Aging past turnaround SLA:
                  </span>
                  <span>{detail.approvals.aging_count} drafts</span>
                </div>
              ) : null}
            </div>

            {/* Status Toggle Action */}
            <div className="pt-4 border-t border-purple-500/10 flex items-center justify-between">
              <span className="text-slate-400">Representative Active Status:</span>
              <button
                type="button"
                onClick={() => toggleActiveMutation.mutate(!profile?.active)}
                disabled={toggleActiveMutation.isPending}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  profile?.active
                    ? 'bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/60'
                    : 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                }`}
              >
                {toggleActiveMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : profile?.active ? (
                  'Mark as Inactive'
                ) : (
                  'Mark as Active'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
