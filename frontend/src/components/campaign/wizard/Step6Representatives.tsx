import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Users,
  ShieldAlert,
  Clock,
  Send,
  GitFork,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { campaignsApi } from '../../../api/campaigns';
import { RepresentativeItem, RepMatchItem } from '../../../types';

interface Step6RepresentativesProps {
  campaignId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const Step6Representatives: React.FC<Step6RepresentativesProps> = ({
  campaignId,
  onBack,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [routingStrategy, setRoutingStrategy] = useState<'round_robin' | 'stage_split'>('round_robin');
  const [repDailyLimits, setRepDailyLimits] = useState<Record<string, number>>({});
  const [repLeadLimits, setRepLeadLimits] = useState<Record<string, number>>({});
  const [repWorkingHours, setRepWorkingHours] = useState<Record<string, { start: number; end: number }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch campaign prospects count
  const { data: prospects = [] } = useQuery({
    queryKey: ['campaign-prospects', campaignId],
    queryFn: () => campaignsApi.getCampaignProspects(campaignId),
    enabled: !!campaignId,
  });

  // Fetch rep matches for campaign
  const { data: repMatches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['rep-matches', campaignId],
    queryFn: () => campaignsApi.getRepMatches(campaignId),
    enabled: !!campaignId,
  });

  // Fetch team representatives
  const { data: repsRoster = [] } = useQuery({
    queryKey: ['team-representatives'],
    queryFn: campaignsApi.getRepresentatives,
  });

  // Fetch already assigned representatives
  const { data: existingAssignments = [] } = useQuery({
    queryKey: ['campaign-assigned-reps', campaignId],
    queryFn: () => campaignsApi.getAssignedRepresentatives(campaignId),
    enabled: !!campaignId,
  });

  // Fetch rep config
  const { data: repConfig } = useQuery({
    queryKey: ['campaign-rep-config', campaignId],
    queryFn: () => campaignsApi.getRepConfig(campaignId),
    enabled: !!campaignId,
  });

  useEffect(() => {
    if (existingAssignments.length > 0 && selectedRepIds.length === 0) {
      const ids = existingAssignments.map((a) => a.user.id);
      setSelectedRepIds(ids);

      const daily: Record<string, number> = {};
      const leads: Record<string, number> = {};
      const hours: Record<string, { start: number; end: number }> = {};
      existingAssignments.forEach((a) => {
        if (a.assignment.daily_send_limit) daily[a.user.id] = a.assignment.daily_send_limit;
        if (a.assignment.assigned_lead_limit) leads[a.user.id] = a.assignment.assigned_lead_limit;
        if (a.assignment.working_hours?.start !== undefined) hours[a.user.id] = { start: a.assignment.working_hours.start, end: a.assignment.working_hours.end };
      });
      setRepDailyLimits((prev) => ({ ...prev, ...daily }));
      setRepLeadLimits((prev) => ({ ...prev, ...leads }));
      setRepWorkingHours((prev) => ({ ...prev, ...hours }));
    }
  }, [existingAssignments, selectedRepIds.length]);

  useEffect(() => {
    if (repConfig?.routing_strategy) {
      setRoutingStrategy(repConfig.routing_strategy);
    }
    if (repConfig?.rep_limits) {
      const daily: Record<string, number> = {};
      const leads: Record<string, number> = {};
      Object.entries(repConfig.rep_limits).forEach(([repId, limits]: [string, any]) => {
        if (limits.daily_send_limit) daily[repId] = limits.daily_send_limit;
        if (limits.assigned_lead_limit) leads[repId] = limits.assigned_lead_limit;
      });
      setRepDailyLimits((prev) => ({ ...prev, ...daily }));
      setRepLeadLimits((prev) => ({ ...prev, ...leads }));
    }
  }, [repConfig]);

  // Combine roster info with rep match scores
  const combinedReps = repsRoster.map((rep) => {
    const match = repMatches.find((m) => m.representative_id === rep.user.id);
    const score = match ? Math.round(match.score) : 0;
    const load = rep.active_leads;
    const capacity = rep.profile.max_active_leads || 0;
    const utilization = capacity ? Math.round((load / capacity) * 100) : 100;
    const isOverCapacity = utilization >= 85;

    return {
      user: rep.user,
      profile: rep.profile,
      score,
      load,
      capacity,
      utilization,
      isOverCapacity,
      matchBreakdown: match?.breakdown,
      matchReasons: match?.reasons || [],
      matchWarnings: match?.warnings || [],
    };
  });

  // Toggle representative assignment
  const toggleRep = (repId: string) => {
    setSelectedRepIds((prev) => {
      const next = prev.includes(repId) ? prev.filter((id) => id !== repId) : [...prev, repId];
      // Set default limits if newly selected
      if (!prev.includes(repId)) {
        setRepDailyLimits((d) => ({ ...d, [repId]: d[repId] || 25 }));
        setRepLeadLimits((l) => ({ ...l, [repId]: l[repId] || Math.max(10, Math.floor(prospects.length / (next.length || 1))) }));
        setRepWorkingHours((h) => {
          if (h[repId]) return h;
          const repProfile = repsRoster.find((r) => r.user.id === repId)?.profile.working_hours as any;
          return { ...h, [repId]: { start: repProfile?.start ?? 9, end: repProfile?.end ?? 18 } };
        });
      }
      return next;
    });
  };

  // Save assignments & config mutation
  const saveAssignmentsMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      setSuccessMessage(null);

      // 1. Assign selected reps and unassign deselected
      for (const rep of repsRoster) {
        const isSelected = selectedRepIds.includes(rep.user.id);
        const wasAssigned = existingAssignments.some((a) => a.user.id === rep.user.id);

        if (isSelected) {
          await campaignsApi.assignRepresentative(campaignId, {
            representative_id: rep.user.id,
            daily_send_limit: repDailyLimits[rep.user.id] || 25,
            assigned_lead_limit: repLeadLimits[rep.user.id] || 20,
            working_hours: repWorkingHours[rep.user.id] || rep.profile.working_hours || {},
            routing_rule: { strategy: routingStrategy },
          });
        } else if (wasAssigned) {
          await campaignsApi.removeRepresentative(campaignId, rep.user.id);
        }
      }

      // 2. Persist campaign-level rep config
      const repLimitsPayload: Record<string, any> = {};
      selectedRepIds.forEach((id) => {
        repLimitsPayload[id] = {
          daily_send_limit: repDailyLimits[id] || 25,
          assigned_lead_limit: repLeadLimits[id] || 20,
        };
      });

      await campaignsApi.saveRepConfig(campaignId, {
        routing_strategy: routingStrategy,
        rep_limits: repLimitsPayload,
      });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-assigned-reps', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-launch-check', campaignId] });
      setSuccessMessage('Representative assignments and routing configuration saved.');
      onSuccess();
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to persist representative assignments');
    },
  });

  const canProceed = selectedRepIds.length > 0;

  if (loadingMatches && repsRoster.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <span>Evaluating representative capacity and ICP matches...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-serif italic font-medium text-white tracking-tight">Assign Representatives & Capacity</h2>
          <p className="text-xs text-slate-400 mt-1">
            Review SDR matching scores, active capacity loads, and configure campaign routing rules.
          </p>
        </div>
        <Link
          to={`/manager/sdrs?campaign=${campaignId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#070811] hover:bg-[#12152d] border border-purple-500/20 text-purple-300 rounded-xl text-xs font-semibold transition-all"
        >
          <Users className="w-3.5 h-3.5" />
          <span>View Team SDR Roster</span>
          <ExternalLink className="w-3 h-3 text-slate-500" />
        </Link>
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

      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl space-y-6">
        {/* Routing Strategy Header */}
        <div className="flex items-center justify-between border-b border-purple-500/10 pb-4 flex-wrap gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">Lead Routing & Distribution Strategy</h3>
            <p className="text-[11px] text-slate-400">
              Determines how newly qualified prospects and outbound tasks are distributed among assigned reps.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#070811] p-1.5 rounded-xl border border-purple-500/20">
            <button
              type="button"
              onClick={() => setRoutingStrategy('round_robin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                routingStrategy === 'round_robin'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" /> Round-Robin
            </button>
            <button
              type="button"
              onClick={() => setRoutingStrategy('stage_split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                routingStrategy === 'stage_split'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Funnel-Stage Split
            </button>
          </div>
        </div>

        {/* Representatives Table */}
        <div className="overflow-x-auto rounded-xl border border-purple-500/10 bg-[#070811]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-purple-500/10 text-slate-400 font-semibold bg-white/5">
                <th className="py-3 px-3 w-10 text-center">Select</th>
                <th className="py-3 px-4">Representative</th>
                <th className="py-3 px-3 text-center">ICP Match</th>
                <th className="py-3 px-4">Geography & Channels</th>
                <th className="py-3 px-4">Current Load & Capacity</th>
                <th className="py-3 px-4 text-center">Working Hours</th>
                <th className="py-3 px-4 text-center">Daily Limit</th>
                <th className="py-3 px-4 text-center">Max Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10">
              {combinedReps.map((rep) => {
                const isSelected = selectedRepIds.includes(rep.user.id);
                const daily = repDailyLimits[rep.user.id] ?? 25;
                const leads = repLeadLimits[rep.user.id] ?? 20;

                return (
                  <tr
                    key={rep.user.id}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      isSelected ? 'bg-purple-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRep(rep.user.id)}
                        className="rounded border-purple-500/30 accent-purple-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white flex items-center gap-2">
                        {rep.user.name}
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-600/30 text-purple-300 font-medium">
                            Assigned
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{rep.user.email}</div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          rep.score >= 85
                            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                            : rep.score >= 70
                            ? 'bg-purple-950/60 border-purple-500/40 text-purple-300'
                            : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                        }`}
                      >
                        {rep.score}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-300 max-w-[220px]">
                      <div>
                        {rep.profile.regions?.join(', ') || 'Geography not configured'} • {rep.profile.timezone || 'Timezone not configured'}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {rep.profile.supported_channels?.join(', ') || 'Channels not configured'}
                      </div>
                      {rep.matchReasons.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {rep.matchReasons.slice(0, 2).map((r, i) => (
                            <li key={i} className="flex items-start gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" /> <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {rep.matchWarnings.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {rep.matchWarnings.map((w, i) => (
                            <li key={i} className="flex items-start gap-1 text-amber-400">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-300 font-medium">
                          {rep.load} / {rep.capacity} leads
                        </span>
                        <span
                          className={`font-bold ${
                            rep.utilization >= 90
                              ? 'text-red-400'
                              : rep.utilization >= 75
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {rep.utilization}%
                        </span>
                      </div>
                      <div className="w-36 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            rep.utilization >= 90
                              ? 'bg-red-500'
                              : rep.utilization >= 75
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, rep.utilization)}%` }}
                        />
                      </div>
                      {rep.isOverCapacity && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-300 mt-1 font-medium">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-400" />
                          <span>Capacity threshold exceeded. Manager override allowed.</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={23}
                          disabled={!isSelected}
                          value={repWorkingHours[rep.user.id]?.start ?? (rep.profile.working_hours as any)?.start ?? 9}
                          onChange={(e) =>
                            setRepWorkingHours((prev) => ({
                              ...prev,
                              [rep.user.id]: { start: Number(e.target.value), end: prev[rep.user.id]?.end ?? (rep.profile.working_hours as any)?.end ?? 18 },
                            }))
                          }
                          className={`w-11 px-1.5 py-1 bg-[#0c0e1f] border rounded text-right text-xs ${isSelected ? 'border-purple-500/30 text-white' : 'border-transparent text-slate-600 bg-transparent'}`}
                        />
                        <span className="text-slate-500">–</span>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          disabled={!isSelected}
                          value={repWorkingHours[rep.user.id]?.end ?? (rep.profile.working_hours as any)?.end ?? 18}
                          onChange={(e) =>
                            setRepWorkingHours((prev) => ({
                              ...prev,
                              [rep.user.id]: { start: prev[rep.user.id]?.start ?? (rep.profile.working_hours as any)?.start ?? 9, end: Number(e.target.value) },
                            }))
                          }
                          className={`w-11 px-1.5 py-1 bg-[#0c0e1f] border rounded text-right text-xs ${isSelected ? 'border-purple-500/30 text-white' : 'border-transparent text-slate-600 bg-transparent'}`}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        disabled={!isSelected}
                        value={daily}
                        onChange={(e) =>
                          setRepDailyLimits((prev) => ({
                            ...prev,
                            [rep.user.id]: Number(e.target.value),
                          }))
                        }
                        className={`w-16 px-2 py-1 bg-[#0c0e1f] border rounded text-right text-xs ${
                          isSelected
                            ? 'border-purple-500/30 text-white'
                            : 'border-transparent text-slate-600 bg-transparent'
                        }`}
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        disabled={!isSelected}
                        value={leads}
                        onChange={(e) =>
                          setRepLeadLimits((prev) => ({
                            ...prev,
                            [rep.user.id]: Number(e.target.value),
                          }))
                        }
                        className={`w-16 px-2 py-1 bg-[#0c0e1f] border rounded text-right text-xs ${
                          isSelected
                            ? 'border-purple-500/30 text-white'
                            : 'border-transparent text-slate-600 bg-transparent'
                        }`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rep Selection Summary */}
        <div className="flex items-center justify-between text-xs text-slate-400 bg-white/5 border border-purple-500/10 rounded-xl px-4 py-3">
          <span>
            Selected Representatives: <strong className="text-white">{selectedRepIds.length} assigned</strong>
          </span>
          {selectedRepIds.length === 0 ? (
            <span className="text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Please assign at least one representative to this campaign.
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Ready for allocation
            </span>
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
          <ArrowLeft className="w-4 h-4" /> Back to Channels
        </button>

        <button
          type="button"
          disabled={!canProceed || saveAssignmentsMutation.isPending}
          onClick={() => saveAssignmentsMutation.mutate()}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            canProceed && !saveAssignmentsMutation.isPending
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {saveAssignmentsMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Representative Assignments...</span>
            </>
          ) : (
            <>
              <span>Save & Continue to Pre-Launch Checklist</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
