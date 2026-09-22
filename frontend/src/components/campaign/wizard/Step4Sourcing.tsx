import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertCircle,
  Upload,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Trash2,
  Users,
  Building,
  CheckSquare,
  Square,
  ShieldAlert,
} from 'lucide-react';
import { campaignsApi } from '../../../api/campaigns';
import { DiscoveryCandidate } from '../../../types';

interface Step4SourcingProps {
  campaignId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const Step4Sourcing: React.FC<Step4SourcingProps> = ({
  campaignId,
  onBack,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'discover' | 'csv'>('discover');
  const [requestedCount, setRequestedCount] = useState<number>(25);
  const [threshold, setThreshold] = useState<number>(60);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // CSV State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Existing enrolled prospects for this campaign
  const { data: enrolled = [], isLoading: loadingEnrolled } = useQuery({
    queryKey: ['campaign-prospects', campaignId],
    queryFn: () => campaignsApi.getCampaignProspects(campaignId),
    enabled: !!campaignId,
  });

  // If preview batch exists on backend, load preview
  const { data: previewData } = useQuery({
    queryKey: ['prospects-preview', campaignId],
    queryFn: () => campaignsApi.getProspectsPreview(campaignId),
    enabled: !!campaignId,
  });

  useEffect(() => {
    if (previewData && previewData.length > 0 && candidates.length === 0) {
      setCandidates(previewData);
      // Auto-select those meeting threshold and not conflicting/suppressed
      const eligible = previewData
        .filter((c) => (c.fit_score || 0) >= threshold && !c.conflict && !(c.conflicts?.length) && !c.suppressed)
        .map((c) => c.prospect_id || '')
        .filter(Boolean);
      setSelectedIds(eligible);
    }
  }, [previewData, threshold]);

  // Discover Mutation
  const discoverMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      setActionSuccess(null);
      const res = await campaignsApi.discoverProspects(campaignId, requestedCount);
      return res;
    },
    onSuccess: (data) => {
      setCandidates(data.prospects || []);
      const eligible = (data.prospects || [])
        .filter((c) => (c.fit_score || 0) >= threshold && !c.conflict && !(c.conflicts?.length) && !c.suppressed)
        .map((c) => c.prospect_id || '')
        .filter(Boolean);
      setSelectedIds(eligible);
      setActionSuccess(`Discovered ${data.total_found} candidates matching ICP criteria.`);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Auto-discovery query failed');
    },
  });

  // CSV Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setCsvError('CSV must have a header row and at least one prospect row.');
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
        const nameIdx = headers.findIndex((h) => h.includes('name') && !h.includes('company'));
        const firstIdx = headers.findIndex((h) => h.includes('first'));
        const lastIdx = headers.findIndex((h) => h.includes('last'));
        const emailIdx = headers.findIndex((h) => h.includes('email') || h.includes('mail'));
        const titleIdx = headers.findIndex((h) => h.includes('title') || h.includes('role'));
        const compIdx = headers.findIndex((h) => h.includes('company') || h.includes('org'));
        const locIdx = headers.findIndex((h) => h.includes('location') || h.includes('geo') || h.includes('city'));
        const indIdx = headers.findIndex((h) => h.includes('industry'));
        const empIdx = headers.findIndex((h) => h.includes('size') || h.includes('employee'));
        const webIdx = headers.findIndex((h) => h.includes('web') || h.includes('domain'));
        const liIdx = headers.findIndex((h) => h.includes('linkedin'));

        if (emailIdx === -1 && nameIdx === -1 && firstIdx === -1) {
          setCsvError('CSV must include an "email" or "name" column.');
          return;
        }

        const parsed: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^['"]|['"]$/g, ''));
          if (!cols[emailIdx] && !cols[nameIdx] && !cols[firstIdx]) continue;

          let firstName = firstIdx !== -1 ? cols[firstIdx] : '';
          let lastName = lastIdx !== -1 ? cols[lastIdx] : '';
          if (!firstName && nameIdx !== -1 && cols[nameIdx]) {
            const parts = cols[nameIdx].split(' ');
            firstName = parts[0] || 'Unknown';
            lastName = parts.slice(1).join(' ') || '';
          }

          parsed.push({
            first_name: firstName || 'Executive',
            last_name: lastName || '',
            email: emailIdx !== -1 ? cols[emailIdx] : `prospect_${i}@apollo.invalid`,
            title: titleIdx !== -1 ? cols[titleIdx] : 'Director',
            location: locIdx !== -1 ? cols[locIdx] : 'US',
            industry: indIdx !== -1 ? cols[indIdx] : 'Technology',
            employee_count: empIdx !== -1 ? parseInt(cols[empIdx], 10) || 100 : 100,
            website: webIdx !== -1 ? cols[webIdx] : '',
            linkedin_url: liIdx !== -1 ? cols[liIdx] : '',
          });
        }

        setCsvParsedCount(parsed.length);
        setCsvRows(parsed);
      } catch (err: any) {
        setCsvError('Failed to parse CSV file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // CSV Import Mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      setActionSuccess(null);
      const res = await campaignsApi.importProspects(campaignId, csvRows);
      // After importing seed list, fetch preview
      const preview = await campaignsApi.getProspectsPreview(campaignId);
      return { importRes: res, preview };
    },
    onSuccess: ({ importRes, preview }) => {
      setCandidates(preview);
      const eligible = preview
        .filter((c) => (c.fit_score || 0) >= threshold && !c.conflict && !(c.conflicts?.length) && !c.suppressed)
        .map((c) => c.prospect_id || '')
        .filter(Boolean);
      setSelectedIds(eligible);
      setActionSuccess(`Imported ${importRes.count} prospects from seed list. Fitment & conflict preview loaded.`);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Seed list import failed');
    },
  });

  // Approve & Select Mutation
  const approveAndEnrollMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      setActionSuccess(null);
      // 1. Approve preview batches
      await campaignsApi.approveProspectBatch(campaignId);
      // 2. Select chosen prospect IDs — pass the manager's chosen threshold through so
      // the backend's own qualification bar (not a separate hardcoded one) is what decides.
      const result = await campaignsApi.selectProspects(campaignId, selectedIds, threshold);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-prospects', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['prospects-preview', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-launch-check', campaignId] });
      setActionSuccess(
        `Successfully approved and enrolled ${result.selected.length} prospects into this campaign!`
      );
      if (result.rejected && result.rejected.length > 0) {
        setErrorMessage(
          `${result.rejected.length} prospects could not be enrolled due to fit/conflict rules.`
        );
      }
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to approve and enroll prospects');
    },
  });

  const toggleSelect = (pid: string) => {
    setSelectedIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  };

  const selectAllEligible = () => {
    const eligible = candidates
      .filter((c) => (c.fit_score || 0) >= threshold && !c.conflict && !(c.conflicts?.length) && !c.suppressed)
      .map((c) => c.prospect_id || '')
      .filter(Boolean);
    setSelectedIds(eligible);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const totalEnrolled = enrolled.length;
  // Choosing candidates only changes a local review selection. A batch must
  // be approved and enrolled before this step can be completed.
  const canProceed = totalEnrolled > 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-serif italic font-medium text-white tracking-tight">Prospect Sourcing & Batch Review</h2>
        <p className="text-xs text-slate-400 mt-1">
          Source targeted prospects via Apollo auto-discovery or upload a CSV seed list. Inspect deterministic fit scores and conflict tags.
        </p>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-3 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-3 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Already Enrolled Banner */}
      {totalEnrolled > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-purple-950/30 border border-purple-500/30 rounded-xl text-purple-200 text-xs">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <span>
              Currently Enrolled in Campaign Funnel: <strong className="text-white">{totalEnrolled} prospects</strong>
            </span>
          </div>
          <span className="text-[11px] text-purple-300 bg-purple-900/60 px-2 py-0.5 rounded-md">
            Ready for outreach
          </span>
        </div>
      )}

      {/* Sourcing Mode Tabs */}
      <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center gap-2 border-b border-purple-500/10 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'discover'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            A. Auto-Discover (Apollo & DronaHQ)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('csv')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'csv'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            B. Upload CSV Seed List
          </button>
        </div>

        {/* Tab A: Auto-discover */}
        {activeTab === 'discover' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Auto-discover queries the Apollo directory using the structured ICP defined in Step 2. Candidates are evaluated for deterministic fit and cross-campaign conflict status.
            </p>

            <div className="flex items-center gap-4 flex-wrap bg-[#070811] border border-purple-500/20 rounded-xl p-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Requested Batch Size (Candidates)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={requestedCount}
                    onChange={(e) => setRequestedCount(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="text-xs font-bold text-purple-300 bg-purple-950/60 border border-purple-500/30 px-2.5 py-1 rounded-lg">
                    {requestedCount} leads
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={discoverMutation.isPending}
                onClick={() => discoverMutation.mutate()}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-purple-900/30 transition-all flex-shrink-0"
              >
                {discoverMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Running Discovery...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Run Apollo Discovery</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab B: Upload Seed List */}
        {activeTab === 'csv' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Upload an existing contact list (.csv). Expected headers: <code className="text-purple-300">Name, Title, Company, Email, Location, Industry, Size, LinkedIn</code>.
            </p>

            <div className="border-2 border-dashed border-purple-500/20 hover:border-purple-500/40 rounded-xl p-6 text-center bg-[#070811] transition-all">
              <input
                type="file"
                accept=".csv"
                id="csv-upload"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <FileSpreadsheet className="w-8 h-8 text-purple-400" />
                <span className="text-xs font-semibold text-slate-200">
                  {csvFile ? csvFile.name : 'Click to select or drag & drop CSV file'}
                </span>
                <span className="text-[11px] text-slate-500">
                  {csvParsedCount > 0 ? `${csvParsedCount} rows parsed successfully` : 'Standard UTF-8 CSV up to 10MB'}
                </span>
              </label>
            </div>

            {csvError && (
              <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{csvError}</span>
              </div>
            )}

            {csvParsedCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Ready to ingest: <strong className="text-white">{csvParsedCount} rows</strong>
                </span>
                <button
                  type="button"
                  disabled={importMutation.isPending}
                  onClick={() => importMutation.mutate()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-purple-900/30 transition-all"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Ingesting CSV...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Import Seed List & Evaluate ICP</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Batch Preview & Selection Review */}
        {candidates.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-purple-500/10">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Batch Candidate Review</h3>
                <p className="text-[11px] text-slate-400">
                  Review fit scores and conflict signals before approving into campaign.
                </p>
              </div>

              {/* Threshold Slider */}
              <div className="flex items-center gap-3 bg-[#070811] px-3.5 py-1.5 rounded-xl border border-purple-500/20">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs text-slate-300">Min Fit Threshold:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-24 accent-purple-500"
                />
                <span className="text-xs font-bold text-purple-300 min-w-[32px] text-right">{threshold}%</span>
              </div>
            </div>

            {/* Selection Controls */}
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs py-2 px-3 bg-white/5 rounded-xl border border-purple-500/10">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={selectAllEligible}
                  className="text-purple-300 hover:text-white font-medium flex items-center gap-1"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> Select Eligible (Fit ≥ {threshold}%)
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-slate-400 hover:text-white font-medium flex items-center gap-1"
                >
                  <Square className="w-3.5 h-3.5" /> Clear All
                </button>
              </div>

              <div className="text-slate-300">
                Selected for Enrollment:{' '}
                <strong className="text-purple-300 font-bold">{selectedIds.length}</strong> of{' '}
                {candidates.length}
              </div>
            </div>

            {/* Candidates Table */}
            <div className="overflow-x-auto rounded-xl border border-purple-500/10 bg-[#070811]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-purple-500/10 text-slate-400 font-semibold bg-white/5">
                    <th className="py-3 px-3 w-10 text-center">Select</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Organization & Domain</th>
                    <th className="py-3 px-3 text-center">Fit Score</th>
                    <th className="py-3 px-4">Evaluation & Signals</th>
                    <th className="py-3 px-4">Conflict Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {candidates.map((c, idx) => {
                    const pid = c.prospect_id || `idx_${idx}`;
                    const isSelected = selectedIds.includes(pid);
                    const meetsThreshold = (c.fit_score || 0) >= threshold;
                    const hasConflict = c.conflict || (c.conflicts && c.conflicts.length > 0);
                    const isSuppressed = c.suppressed;

                    return (
                      <tr
                        key={pid}
                        className={`hover:bg-white/[0.02] transition-colors ${
                          isSelected ? 'bg-purple-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!c.prospect_id || isSuppressed}
                            onChange={() => toggleSelect(pid)}
                            className="rounded border-purple-500/30 accent-purple-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{c.name}</div>
                          <div className="text-[11px] text-slate-400">{c.title}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-200">{c.company || 'Enterprise'}</div>
                          <div className="text-[11px] text-slate-500">{c.source || 'Apollo'}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${
                              (c.fit_score || 0) >= 80
                                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                : (c.fit_score || 0) >= 60
                                ? 'bg-purple-950/60 border-purple-500/40 text-purple-300'
                                : 'bg-red-950/60 border-red-500/40 text-red-300'
                            }`}
                          >
                            {c.fit_score || 0}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-300 max-w-xs">
                          {c.fit_reasons && c.fit_reasons.length > 0 ? (
                            <span>{c.fit_reasons.join(' • ')}</span>
                          ) : (
                            <span className="text-slate-500">Criteria evaluated by engine</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {hasConflict ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950/50 border border-amber-500/30 rounded-md text-[10px] text-amber-300 font-medium">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              <span>
                                CONFLICT: Active in{' '}
                                {c.conflicts?.[0]?.campaign_name || 'Another Campaign'}
                              </span>
                            </div>
                          ) : isSuppressed ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-950/50 border border-red-500/30 rounded-md text-[10px] text-red-300 font-medium">
                              <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                              <span>SUPPRESSED</span>
                            </div>
                          ) : (
                            <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Clear
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Batch Enrollment Action */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                {selectedIds.length} prospects selected for enrollment
              </span>

              <button
                type="button"
                disabled={selectedIds.length === 0 || approveAndEnrollMutation.isPending}
                onClick={() => approveAndEnrollMutation.mutate()}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedIds.length > 0 && !approveAndEnrollMutation.isPending
                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {approveAndEnrollMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enrolling Prospects...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Batch & Enroll ({selectedIds.length}) Prospects</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Agents
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
          <span>Save & Continue to Channels & Prompts</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
