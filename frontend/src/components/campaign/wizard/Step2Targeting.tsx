import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, Plus, X, Globe, Briefcase, Building, Layers, Ban, Cpu, UserCheck } from 'lucide-react';
import { campaignsApi } from '../../../api/campaigns';
import { IcpConfig } from '../../../types';

interface Step2TargetingProps {
  campaignId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const Step2Targeting: React.FC<Step2TargetingProps> = ({
  campaignId,
  onBack,
  onSuccess,
}) => {
  const [geography, setGeography] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [roleInput, setRoleInput] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [industryInput, setIndustryInput] = useState('');
  const [minSize, setMinSize] = useState<number>(50);
  const [maxSize, setMaxSize] = useState<number>(1000);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [techInput, setTechInput] = useState('');
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [exclusionInput, setExclusionInput] = useState('');
  const [fundingStages, setFundingStages] = useState<string[]>([]);
  const [minRevenue, setMinRevenue] = useState('10M');
  const [maxRevenue, setMaxRevenue] = useState('100M');
  const [referenceProfiles, setReferenceProfiles] = useState<{ name: string; url: string }[]>([]);
  const [refNameInput, setRefNameInput] = useState('');
  const [refUrlInput, setRefUrlInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Suggested tags
  const SUGGESTED_ROLES = ['CTO', 'VP Engineering', 'Head of AI', 'Chief Architect', 'Director of Infrastructure', 'VP Product'];
  const SUGGESTED_INDUSTRIES = ['Enterprise SaaS', 'Cloud Infrastructure', 'Financial Services & FinTech', 'AI & Machine Learning', 'Cybersecurity', 'DevOps & Developer Tools'];
  const SUGGESTED_TECHS = ['Kubernetes', 'AWS', 'Python', 'Go', 'Snowflake', 'Databricks', 'Docker', 'PostgreSQL'];
  const SUGGESTED_EXCLUSIONS = ['Staffing Agencies', 'Consulting / SI', 'Early Stage < 10 Emp', 'Non-profit'];
  const FUNDING_OPTIONS = ['Seed', 'Series A', 'Series B', 'Series C+', 'Growth / PE', 'Public'];

  // Load existing ICP from backend
  const { data: icpData, isLoading: loadingIcp } = useQuery({
    queryKey: ['campaign-icp', campaignId],
    queryFn: () => campaignsApi.getCampaignIcp(campaignId),
    enabled: !!campaignId,
  });

  useEffect(() => {
    if (icpData) {
      if (icpData.geography) setGeography(icpData.geography);
      if (Array.isArray(icpData.target_roles)) setRoles(icpData.target_roles);
      if (Array.isArray(icpData.industries)) setIndustries(icpData.industries);
      if (icpData.company_size) {
        if (icpData.company_size.min !== undefined) setMinSize(icpData.company_size.min);
        if (icpData.company_size.max !== undefined) setMaxSize(icpData.company_size.max);
      }
      if (Array.isArray(icpData.technologies)) setTechnologies(icpData.technologies);
      if (Array.isArray(icpData.exclusion_criteria)) setExclusions(icpData.exclusion_criteria);
      if (Array.isArray(icpData.funding_stage)) setFundingStages(icpData.funding_stage);
      if (icpData.revenue_range) {
        if (icpData.revenue_range.min) setMinRevenue(icpData.revenue_range.min);
        if (icpData.revenue_range.max) setMaxRevenue(icpData.revenue_range.max);
      }
      if (Array.isArray(icpData.reference_profiles)) setReferenceProfiles(icpData.reference_profiles as any);
    }
  }, [icpData]);

  // Chip addition helper
  const addChip = (item: string, current: string[], setter: (val: string[]) => void, clearInput?: () => void) => {
    const trimmed = item.trim();
    if (trimmed && !current.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
      setter([...current, trimmed]);
    }
    if (clearInput) clearInput();
  };

  const removeChip = (item: string, current: string[], setter: (val: string[]) => void) => {
    setter(current.filter((x) => x !== item));
  };

  // Validation
  const hasGeography = geography.trim().length > 0;
  const hasRoles = roles.length > 0;
  const hasIndustries = industries.length > 0;
  const canProceed = hasGeography && (hasRoles || hasIndustries);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      const payload: IcpConfig = {
        geography: geography.trim(),
        target_roles: roles,
        industries: industries,
        company_size: { min: Number(minSize), max: Number(maxSize) },
        revenue_range: { min: minRevenue, max: maxRevenue },
        funding_stage: fundingStages,
        technologies: technologies,
        exclusion_criteria: exclusions,
        reference_profiles: referenceProfiles,
        custom_criteria: {},
      };
      return await campaignsApi.updateCampaignIcp(campaignId, payload);
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to save targeting parameters');
    },
  });

  if (loadingIcp) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        <span>Loading structured ICP targeting configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-serif italic font-medium text-white tracking-tight">Structured Targeting & ICP</h2>
        <p className="text-xs text-slate-400 mt-1">
          This structured definition is the source of truth for the Apollo Discovery Agent and deterministic ICP Fitment Engine.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-3 p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-6 bg-[#0c0e1f] border border-[#7C3AED] rounded-2xl p-6 shadow-xl">
        {/* Target Geography */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Globe className="w-4 h-4 text-purple-400" />
            <label className="text-xs font-semibold text-slate-200">
              Target Geography <span className="text-purple-400">*</span>
            </label>
          </div>
          <input
            type="text"
            value={geography}
            onChange={(e) => setGeography(e.target.value)}
            placeholder="e.g. US & North America, Western Europe, India"
            className="w-full px-3.5 py-2.5 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
          />
          <span className="text-[11px] text-slate-500 mt-1 block">
            Used for territory matching, timezone overlap with representatives, and regional privacy rules.
          </span>
        </div>

        {/* Target Roles & Titles */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Briefcase className="w-4 h-4 text-purple-400" />
            <label className="text-xs font-semibold text-slate-200">
              Target Roles & Buyer Personas <span className="text-purple-400">*</span>
            </label>
          </div>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addChip(roleInput, roles, setRoles, () => setRoleInput(''));
                }
              }}
              placeholder="Type title and press Enter (e.g. CTO, VP Engineering)..."
              className="flex-1 px-3.5 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => addChip(roleInput, roles, setRoles, () => setRoleInput(''))}
              className="px-3.5 py-2 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {/* Active chips */}
          <div className="flex flex-wrap gap-2 mb-2">
            {roles.map((role) => (
              <span
                key={role}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-600/20 border border-purple-500/30 text-purple-200 rounded-lg text-xs font-medium"
              >
                {role}
                <button
                  type="button"
                  onClick={() => removeChip(role, roles, setRoles)}
                  className="text-purple-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Suggestions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500">Suggestions:</span>
            {SUGGESTED_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => addChip(role, roles, setRoles)}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-purple-950/40 text-slate-400 hover:text-purple-300 border border-[#7C3AED] transition-colors"
              >
                + {role}
              </button>
            ))}
          </div>
        </div>

        {/* Target Industries */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Building className="w-4 h-4 text-purple-400" />
            <label className="text-xs font-semibold text-slate-200">
              Target Industries & Sectors <span className="text-purple-400">*</span>
            </label>
          </div>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={industryInput}
              onChange={(e) => setIndustryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addChip(industryInput, industries, setIndustries, () => setIndustryInput(''));
                }
              }}
              placeholder="Type industry and press Enter (e.g. Enterprise SaaS)..."
              className="flex-1 px-3.5 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => addChip(industryInput, industries, setIndustries, () => setIndustryInput(''))}
              className="px-3.5 py-2 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            {industries.map((ind) => (
              <span
                key={ind}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-600/20 border border-purple-500/30 text-purple-200 rounded-lg text-xs font-medium"
              >
                {ind}
                <button
                  type="button"
                  onClick={() => removeChip(ind, industries, setIndustries)}
                  className="text-purple-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500">Suggestions:</span>
            {SUGGESTED_INDUSTRIES.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => addChip(ind, industries, setIndustries)}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-purple-950/40 text-slate-400 hover:text-purple-300 border border-[#7C3AED] transition-colors"
              >
                + {ind}
              </button>
            ))}
          </div>
        </div>

        {/* Company Size Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Layers className="w-4 h-4 text-purple-400" />
              <label className="text-xs font-semibold text-slate-200">Min Employee Count</label>
            </div>
            <input
              type="number"
              min={1}
              value={minSize}
              onChange={(e) => setMinSize(Math.max(1, Number(e.target.value)))}
              className="w-full px-3.5 py-2.5 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Layers className="w-4 h-4 text-purple-400" />
              <label className="text-xs font-semibold text-slate-200">Max Employee Count</label>
            </div>
            <input
              type="number"
              min={minSize}
              value={maxSize}
              onChange={(e) => setMaxSize(Math.max(minSize, Number(e.target.value)))}
              className="w-full px-3.5 py-2.5 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Technologies & Tech Stack */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Cpu className="w-4 h-4 text-purple-400" />
            <label className="text-xs font-semibold text-slate-200">Required Technologies & Signals</label>
          </div>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addChip(techInput, technologies, setTechnologies, () => setTechInput(''));
                }
              }}
              placeholder="e.g. Kubernetes, AWS, Python, Snowflake..."
              className="flex-1 px-3.5 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => addChip(techInput, technologies, setTechnologies, () => setTechInput(''))}
              className="px-3.5 py-2 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            {technologies.map((tech) => (
              <span
                key={tech}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-600/20 border border-purple-500/30 text-purple-200 rounded-lg text-xs font-medium"
              >
                {tech}
                <button
                  type="button"
                  onClick={() => removeChip(tech, technologies, setTechnologies)}
                  className="text-purple-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500">Suggestions:</span>
            {SUGGESTED_TECHS.map((tech) => (
              <button
                key={tech}
                type="button"
                onClick={() => addChip(tech, technologies, setTechnologies)}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-purple-950/40 text-slate-400 hover:text-purple-300 border border-[#7C3AED] transition-colors"
              >
                + {tech}
              </button>
            ))}
          </div>
        </div>

        {/* Exclusion Criteria */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Ban className="w-4 h-4 text-red-400" />
            <label className="text-xs font-semibold text-slate-200">Exclusion Criteria (Hard Filters)</label>
          </div>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={exclusionInput}
              onChange={(e) => setExclusionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addChip(exclusionInput, exclusions, setExclusions, () => setExclusionInput(''));
                }
              }}
              placeholder="e.g. Staffing Agencies, Consulting, Non-profit..."
              className="flex-1 px-3.5 py-2 bg-[#070811] border border-red-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/60"
            />
            <button
              type="button"
              onClick={() => addChip(exclusionInput, exclusions, setExclusions, () => setExclusionInput(''))}
              className="px-3.5 py-2 bg-red-950/30 hover:bg-red-900/50 border border-red-500/30 text-red-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            {exclusions.map((ex) => (
              <span
                key={ex}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-500/30 text-red-200 rounded-lg text-xs font-medium"
              >
                {ex}
                <button
                  type="button"
                  onClick={() => removeChip(ex, exclusions, setExclusions)}
                  className="text-red-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500">Suggestions:</span>
            {SUGGESTED_EXCLUSIONS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => addChip(ex, exclusions, setExclusions)}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-red-500/10 transition-colors"
              >
                + {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Sample / Reference Profiles */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <UserCheck className="w-4 h-4 text-purple-400" />
            <label className="text-xs font-semibold text-slate-200">Sample / Reference Profiles</label>
          </div>
          <span className="text-[11px] text-slate-500 mb-2 block">
            Point to a few real accounts or contacts that represent an ideal fit — the discovery agent uses these as a "find more like this" anchor.
          </span>
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <input
              type="text"
              value={refNameInput}
              onChange={(e) => setRefNameInput(e.target.value)}
              placeholder="Name or company (e.g. Ava Reed, CloudScale Systems)"
              className="flex-1 px-3.5 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <input
              type="text"
              value={refUrlInput}
              onChange={(e) => setRefUrlInput(e.target.value)}
              placeholder="LinkedIn or company URL (optional)"
              className="flex-1 px-3.5 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => {
                if (!refNameInput.trim()) return;
                setReferenceProfiles([...referenceProfiles, { name: refNameInput.trim(), url: refUrlInput.trim() }]);
                setRefNameInput(''); setRefUrlInput('');
              }}
              className="px-3.5 py-2 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 justify-center"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          {referenceProfiles.length > 0 && (
            <div className="space-y-1.5">
              {referenceProfiles.map((ref, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-purple-600/10 border border-purple-500/20 rounded-lg text-xs">
                  <div className="text-purple-200">
                    <span className="font-medium">{ref.name}</span>
                    {ref.url && <span className="text-slate-400 ml-2">{ref.url}</span>}
                  </div>
                  <button type="button" onClick={() => setReferenceProfiles(referenceProfiles.filter((_, idx) => idx !== i))} className="text-purple-400 hover:text-white flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Funding Stage */}
        <div>
          <label className="block text-xs font-semibold text-slate-200 mb-2">Target Funding Stages</label>
          <div className="flex flex-wrap gap-2">
            {FUNDING_OPTIONS.map((st) => {
              const selected = fundingStages.includes(st);
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    if (selected) {
                      setFundingStages(fundingStages.filter((x) => x !== st));
                    } else {
                      setFundingStages([...fundingStages, st]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    selected
                      ? 'bg-purple-600/30 border-purple-500/50 text-purple-200'
                      : 'bg-[#070811] border-purple-500/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Identity
        </button>

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
              <span>Saving Targeting...</span>
            </>
          ) : (
            <>
              <span>Save & Continue to Agents</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
