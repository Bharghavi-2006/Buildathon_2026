import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  Filter,
  Plus,
  AlertTriangle,
  Mail,
  Linkedin,
  Phone,
  MessageSquare,
  Globe,
  Loader2,
  AlertCircle,
  Briefcase,
  Layers,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { representativesApi } from '../../api/representatives';
import { campaignsApi } from '../../api/campaigns';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AddRepresentativeModal } from '../../components/sdrs/AddRepresentativeModal';
import { RepresentativeDetailDrawer } from '../../components/sdrs/RepresentativeDetailDrawer';
import { RepMatchItem } from '../../types';

export const SdrsRoster: React.FC = () => {
  const { role, switchUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven campaign selection
  const initialCampaignId = searchParams.get('campaign') || searchParams.get('campaign_id') || 'all';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>(initialCampaignId);
  const [capacityFilter, setCapacityFilter] = useState<string>('all');
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Sync state if URL search params change
  useEffect(() => {
    const cid = searchParams.get('campaign') || searchParams.get('campaign_id');
    if (cid && cid !== campaignFilter) {
      setCampaignFilter(cid);
    }
  }, [searchParams]);

  // Update URL params when campaign filter changes
  const handleCampaignFilterChange = (newCampId: string) => {
    setCampaignFilter(newCampId);
    const newParams = new URLSearchParams(searchParams);
    if (newCampId === 'all') {
      newParams.delete('campaign');
      newParams.delete('campaign_id');
    } else {
      newParams.set('campaign', newCampId);
    }
    setSearchParams(newParams);
  };

  // Fetch representatives roster
  const {
    data: reps = [],
    isLoading: loadingReps,
    error: errorReps,
    refetch,
  } = useQuery({
    queryKey: ['team-representatives'],
    queryFn: representativesApi.getRepresentatives,
  });

  // Fetch monitoring metrics (gives outreach_sent, pending_approvals, aging_approvals)
  const { data: monitoringReps = [] } = useQuery({
    queryKey: ['monitoring-representatives'],
    queryFn: representativesApi.getMonitoringRepresentatives,
  });

  // Fetch all campaigns to populate campaign filter and compute metrics
  const { data: dashboardData } = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: campaignsApi.getDashboard,
  });

  // Fetch Rep Matching data if a specific campaign is selected
  const { data: repMatches = [] } = useQuery({
    queryKey: ['rep-matches', campaignFilter],
    queryFn: () => campaignsApi.getRepMatches(campaignFilter),
    enabled: campaignFilter !== 'all',
  });

  // Map of repId -> RepMatchItem
  const repMatchesMap = useMemo(() => {
    const map = new Map<string, RepMatchItem>();
    repMatches.forEach((m) => {
      map.set(m.representative_id, m);
    });
    return map;
  }, [repMatches]);

  // Combine reps with monitoring & matching data
  const augmentedReps = useMemo(() => {
    return reps.map((rep) => {
      const mon = monitoringReps.find((m) => m.user.id === rep.user.id);
      const activeLeads = rep.active_leads;
      const capacity = rep.profile.max_active_leads || 50;
      const utilization = Math.round((activeLeads / capacity) * 100);

      // Thresholds: matching backend RepMatchEngine (85% near capacity, 95% at capacity, 100%+ over capacity)
      let capacityState: 'AVAILABLE' | 'NEAR_CAPACITY' | 'AT_CAPACITY' | 'OVER_CAPACITY' = 'AVAILABLE';
      if (utilization >= 100) capacityState = 'OVER_CAPACITY';
      else if (utilization >= 95) capacityState = 'AT_CAPACITY';
      else if (utilization >= 85) capacityState = 'NEAR_CAPACITY';

      const matchItem = repMatchesMap.get(rep.user.id);

      return {
        ...rep,
        outreach_sent: mon?.outreach_sent ?? rep.outreach_sent ?? 0,
        pending_approvals: mon?.pending_approvals ?? 0,
        aging_approvals: mon?.aging_approvals ?? 0,
        active_campaigns_count: rep.active_campaigns_count ?? 0,
        capacity,
        utilization,
        capacityState,
        matchItem,
      };
    });
  }, [reps, monitoringReps, repMatchesMap]);

  // Compute KPI summary metrics
  const activeSDRs = augmentedReps.filter((r) => r.profile.active !== false).length;
  const totalActiveAssignments = augmentedReps.reduce((sum, r) => sum + (r.active_campaigns_count || 0), 0);
  const totalAvailableCapacity = augmentedReps.reduce((sum, r) => sum + r.available_capacity, 0);
  const capacityWarningsCount = augmentedReps.filter(
    (r) => r.capacityState === 'NEAR_CAPACITY' || r.capacityState === 'AT_CAPACITY' || r.capacityState === 'OVER_CAPACITY'
  ).length;

  // Inactive reps with active leads/assignments
  const inactiveWithAssignments = useMemo(() => {
    return augmentedReps.filter((r) => r.profile.active === false && (r.active_leads > 0 || r.active_campaigns_count > 0));
  }, [augmentedReps]);

  // Filtered reps
  const filteredReps = useMemo(() => {
    return augmentedReps.filter((r) => {
      // Search
      const searchMatch =
        !searchQuery ||
        r.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.user.email.toLowerCase().includes(searchQuery.toLowerCase());

      // Status
      const statusMatch =
        statusFilter === 'all' ||
        (statusFilter === 'active' && r.profile.active !== false) ||
        (statusFilter === 'inactive' && r.profile.active === false);

      // Channel
      const channels = r.profile.supported_channels || ['email', 'linkedin'];
      const channelMatch =
        channelFilter === 'all' || channels.map((c) => c.toLowerCase()).includes(channelFilter.toLowerCase());

      // Capacity State
      const capacityMatch = capacityFilter === 'all' || r.capacityState === capacityFilter;

      return searchMatch && statusMatch && channelMatch && capacityMatch;
    });
  }, [augmentedReps, searchQuery, statusFilter, channelFilter, capacityFilter]);

  // Selected rep for drawer
  const selectedRep = augmentedReps.find((r) => r.user.id === selectedRepId);

  // Manager Access Guard
  if (role && role !== 'MANAGER') {
    return (
      <div className="bg-[#0c0e1f] border border-purple-500/20 rounded-2xl p-8 text-center space-y-4 max-w-xl mx-auto my-12 shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Manager Access Required</h2>
          <p className="text-xs text-slate-400">
            The SDR Roster and Team Management view is restricted to managers. Switch to the demo manager identity to access this view.
          </p>
        </div>
        <button
          onClick={() => switchUser('manager@demo.local')}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all cursor-pointer"
        >
          Switch to manager@demo.local
        </button>
      </div>
    );
  }

  const selectedCampaignName = dashboardData?.campaigns?.find((c) => c.id === campaignFilter)?.name;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" />
            SDRs
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage representatives, campaign assignments, capacity, channels, and availability.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Representative
        </button>
      </div>

      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active SDRs</span>
            <div className="w-7 h-7 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">{activeSDRs}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {augmentedReps.length} total registered representatives
            </div>
          </div>
        </div>

        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Campaign Assignments</span>
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">{totalActiveAssignments}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Assigned across active campaigns</div>
          </div>
        </div>

        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Available Capacity</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-400 tracking-tight">
              {totalAvailableCapacity} <span className="text-xs font-normal text-slate-400">units</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Open quota for new campaign assignments</div>
          </div>
        </div>

        <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Capacity Warnings</span>
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                capacityWarningsCount > 0
                  ? 'bg-amber-600/20 text-amber-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div
              className={`text-2xl font-bold tracking-tight ${
                capacityWarningsCount > 0 ? 'text-amber-400' : 'text-white'
              }`}
            >
              {capacityWarningsCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Reps near, at, or exceeding capacity</div>
          </div>
        </div>
      </div>

      {/* Campaign Context Banner (Rep Matching Integration) */}
      {campaignFilter !== 'all' && (
        <div className="p-4 bg-purple-950/40 border border-purple-500/30 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white text-xs flex items-center gap-2">
                <span>Rep Matching Active:</span>
                <span className="text-purple-300">{selectedCampaignName || campaignFilter}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Displaying deterministic match scores, channel fit, ICP alignment, and capacity for this campaign.
              </div>
            </div>
          </div>

          <button
            onClick={() => handleCampaignFilterChange('all')}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium rounded-xl transition-all"
          >
            Clear Campaign Filter
          </button>
        </div>
      )}

      {/* Offboarding / Inactive SDRs with Assignments Warning */}
      {inactiveWithAssignments.length > 0 && (
        <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl shadow-lg flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-amber-300 text-xs">
                Representative is inactive and has active campaign assignments.
              </div>
              <div className="text-[11px] text-amber-200/80 mt-0.5">
                {inactiveWithAssignments.map((r) => r.user.name).join(', ')} currently have active assignments but are marked inactive in the system. Outbound sequences may be paused.
              </div>
            </div>
          </div>

          <button
            onClick={() => setSelectedRepId(inactiveWithAssignments[0].user.id)}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-xl transition-all"
          >
            Review Assignments
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-4 shadow-xl flex items-center justify-between flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by representative name or email..."
            className="w-full pl-9 pr-3.5 py-1.5 bg-[#070811] border border-purple-500/20 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-[#070811] border border-purple-500/20 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Channel Filter */}
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#070811] border border-purple-500/20 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
          >
            <option value="all">Channel: All</option>
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="message">Message</option>
            <option value="call">Call</option>
          </select>

          {/* Campaign Filter */}
          <select
            value={campaignFilter}
            onChange={(e) => handleCampaignFilterChange(e.target.value)}
            className="px-3 py-1.5 bg-[#070811] border border-purple-500/20 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 max-w-[200px] truncate"
          >
            <option value="all">Campaign: All</option>
            {(dashboardData?.campaigns || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Capacity State Filter */}
          <select
            value={capacityFilter}
            onChange={(e) => setCapacityFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#070811] border border-purple-500/20 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
          >
            <option value="all">Capacity: All</option>
            <option value="AVAILABLE">Available</option>
            <option value="NEAR_CAPACITY">Near Capacity</option>
            <option value="AT_CAPACITY">At Capacity</option>
            <option value="OVER_CAPACITY">Over Capacity</option>
          </select>
        </div>
      </div>

      {/* SDRs Table */}
      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl shadow-xl overflow-hidden">
        {loadingReps ? (
          <div className="flex flex-col items-center justify-center p-16 text-slate-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <span className="text-xs">Loading representatives roster...</span>
          </div>
        ) : errorReps ? (
          <div className="p-12 text-center text-xs text-red-400 space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-red-400" />
            <div>Unable to load representatives. Please try again.</div>
            <button
              onClick={() => refetch()}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs"
            >
              Retry
            </button>
          </div>
        ) : filteredReps.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-xs">
            No representatives found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-purple-500/10 text-slate-400 font-semibold bg-white/5">
                  <th className="py-3 px-4">SDR</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4">Channels</th>
                  <th className="py-3 px-3">Timezone</th>
                  <th className="py-3 px-3">Active Campaigns</th>
                  <th className="py-3 px-4">Current Load</th>
                  <th className="py-3 px-4">Specialization</th>
                  <th className="py-3 px-4">Capacity Status</th>
                  {campaignFilter !== 'all' && <th className="py-3 px-3">Match Fit</th>}
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {filteredReps.map((rep) => {
                  const isInactive = rep.profile.active === false;
                  const channels = rep.profile.supported_channels || ['email', 'linkedin'];
                  const capacityState = rep.capacityState;

                  let capacityBadge = 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30';
                  if (capacityState === 'OVER_CAPACITY') {
                    capacityBadge = 'bg-rose-950/50 text-rose-300 border-rose-500/30';
                  } else if (capacityState === 'AT_CAPACITY') {
                    capacityBadge = 'bg-orange-950/50 text-orange-300 border-orange-500/30';
                  } else if (capacityState === 'NEAR_CAPACITY') {
                    capacityBadge = 'bg-amber-950/50 text-amber-300 border-amber-500/30';
                  }

                  return (
                    <tr
                      key={rep.user.id}
                      onClick={() => setSelectedRepId(rep.user.id)}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                    >
                      {/* SDR Name & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/30 to-indigo-600/30 border border-purple-500/20 flex items-center justify-center font-bold text-purple-200">
                            {rep.user.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-white group-hover:text-purple-300 transition-colors">
                              {rep.user.name}
                            </div>
                            <div className="text-[11px] text-slate-500">{rep.user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <StatusBadge status={isInactive ? 'INACTIVE' : 'ACTIVE'} size="sm" />
                      </td>

                      {/* Channels */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {channels.map((ch) => (
                            <span
                              key={ch}
                              title={ch}
                              className="w-6 h-6 rounded-md bg-[#070811] border border-purple-500/10 flex items-center justify-center text-slate-400"
                            >
                              {ch === 'email' ? <Mail className="w-3 h-3 text-purple-400" /> : null}
                              {ch === 'linkedin' ? <Linkedin className="w-3 h-3 text-blue-400" /> : null}
                              {ch === 'call' || ch === 'voice' ? <Phone className="w-3 h-3 text-amber-400" /> : null}
                              {ch === 'message' || ch === 'messages' ? <MessageSquare className="w-3 h-3 text-emerald-400" /> : null}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Timezone */}
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {rep.profile.timezone || 'UTC'}
                      </td>

                      {/* Active Campaigns */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-300">
                          {rep.active_campaigns_count || 0} {rep.active_campaigns_count === 1 ? 'campaign' : 'campaigns'}
                        </span>
                      </td>

                      {/* Current Load & Capacity Meter */}
                      <td className="py-3 px-4">
                        <div className="w-32 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-300 font-semibold">
                              {rep.active_leads} / {rep.capacity}
                            </span>
                            <span
                              className={`font-bold ${
                                rep.utilization >= 95
                                  ? 'text-rose-400'
                                  : rep.utilization >= 85
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {rep.utilization}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                rep.utilization >= 95
                                  ? 'bg-rose-500'
                                  : rep.utilization >= 85
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, rep.utilization)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Specialization */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {(rep.profile.specialties || []).slice(0, 2).map((spec) => (
                            <span
                              key={spec}
                              className="px-2 py-0.5 rounded bg-white/5 border border-purple-500/10 text-slate-300 text-[10px]"
                            >
                              {spec}
                            </span>
                          ))}
                          {(rep.profile.specialties || []).length > 2 && (
                            <span className="text-[10px] text-slate-500 self-center">
                              +{(rep.profile.specialties || []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Capacity Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${capacityBadge}`}
                        >
                          {capacityState.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Rep Match Score (when campaign filter is active) */}
                      {campaignFilter !== 'all' && (
                        <td className="py-3 px-3">
                          {rep.matchItem ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  rep.matchItem.score >= 80
                                    ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30'
                                    : rep.matchItem.score >= 60
                                    ? 'bg-purple-950/50 text-purple-300 border-purple-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {rep.matchItem.score}% Match
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[10px]">—</span>
                          )}
                        </td>
                      )}

                      {/* Action */}
                      <td className="py-3 px-3 text-right">
                        <span className="inline-flex items-center text-purple-400 group-hover:text-purple-300 group-hover:translate-x-0.5 transition-all text-xs font-semibold">
                          Detail <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Representative Detail Drawer */}
      <RepresentativeDetailDrawer
        representativeId={selectedRepId}
        campaignContextId={campaignFilter !== 'all' ? campaignFilter : undefined}
        matchData={selectedRep?.matchItem}
        onClose={() => setSelectedRepId(null)}
      />

      {/* Add Representative Modal */}
      <AddRepresentativeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
};
