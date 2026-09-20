import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Lock, ShieldAlert } from 'lucide-react';
import { guardrailsApi } from '../../api/hurdles';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AlertBanner } from '../../components/ui/AlertBanner';
import type { GuardrailChannel } from '../../types';

const AVAILABILITY_LABEL: Record<string, string> = {
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
  OUTSIDE_WORKING_HOURS: 'OUTSIDE HOURS',
  LIMIT_REACHED: 'LIMIT REACHED',
  BLOCKED_KILL_SWITCH: 'KILL SWITCH',
  BLOCKED_CAMPAIGN_PAUSED: 'CAMPAIGN PAUSED',
};

const availabilityColor = (a: string) => a === 'LIVE' ? 'text-emerald-400' : a === 'PAUSED' ? 'text-amber-400' : 'text-rose-400';

export const RepresentativeGuardrails: React.FC = () => {
  const { data, isLoading, error } = useQuery({ queryKey: ['rep-guardrails'], queryFn: guardrailsApi.get, refetchInterval: 15000 });

  if (isLoading) return <div className="text-slate-400">Loading your guardrails…</div>;
  if (error || !data) return <div className="text-rose-300">Unable to load guardrails.</div>;

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-white">Guardrails</h1>
      <p className="text-sm text-slate-400">A read-only view of what you can and cannot do right now. Backend policy is always authoritative.</p>
    </div>

    {data.kill_switch.active && <AlertBanner type="critical" message={data.kill_switch.message || 'All outbound activity has been stopped platform-wide by an administrator.'} />}

    <div className="grid md:grid-cols-2 gap-3">
      <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Daily sending capacity</div>
        <div className={`text-2xl font-bold ${data.daily_capacity.exhausted ? 'text-rose-400' : data.daily_capacity.warning ? 'text-amber-400' : 'text-white'}`}>{data.daily_capacity.used} / {data.daily_capacity.limit}</div>
        {data.daily_capacity.exhausted && <p className="text-xs text-rose-300 mt-1">Daily sending limit reached.</p>}
        {!data.daily_capacity.exhausted && data.daily_capacity.warning && <p className="text-xs text-amber-300 mt-1">Approaching your daily capacity.</p>}
      </div>
      <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Your working profile</div>
        <div className="text-sm text-slate-200">{data.representative_profile.timezone || 'Timezone not configured'}</div>
        <div className="text-xs text-slate-400 mt-1">Supported channels: {(data.representative_profile.supported_channels || []).join(', ') || 'Not configured'}</div>
      </div>
    </div>

    <div className="space-y-4">
      {(data.campaigns || []).map((card: any) => (
        <div key={card.campaign.id} className="rounded-xl border border-purple-500/15 bg-[#0d0f22] p-4 space-y-3">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <div className="flex items-center gap-2"><strong className="text-white">{card.campaign.name}</strong><StatusBadge status={card.campaign.status} /></div>
              <p className="text-xs text-slate-400 mt-1">{card.campaign.icp_summary}</p>
            </div>
            <div className="text-xs text-slate-400 text-right">
              <div>Daily limit: {card.campaign.daily_outreach_limit}</div>
              <div>{card.campaign.approval_required ? 'Approval required' : 'No approval required'}</div>
            </div>
          </div>

          {card.paused_message && (
            <div className="text-xs rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-200 p-2 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {card.paused_message} You can finish any already-open conversation, but no new prospects will enter this campaign until it resumes.
            </div>
          )}

          {card.conflicts.map((c: any) => (
            <div key={`${c.prospect_id}-${c.other_campaign_id}`} className="text-xs rounded-lg border border-rose-500/30 bg-rose-950/20 text-rose-200 p-2 flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
              {c.message} ({c.prospect_name} is also active in "{c.other_campaign_name}")
            </div>
          ))}

          <div className="rounded-lg border border-purple-500/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[#070811] text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Channel</th>
                  <th className="text-left font-medium px-3 py-2">State</th>
                  <th className="text-left font-medium px-3 py-2">Daily usage</th>
                  <th className="text-left font-medium px-3 py-2">Working hours</th>
                </tr>
              </thead>
              <tbody>
                {card.channels.map((ch: GuardrailChannel) => (
                  <tr key={ch.channel} className="border-t border-purple-500/5">
                    <td className="px-3 py-2 text-slate-200 capitalize">{ch.channel}</td>
                    <td className={`px-3 py-2 font-semibold ${availabilityColor(ch.availability)}`}>{AVAILABILITY_LABEL[ch.availability] || ch.availability}</td>
                    <td className="px-3 py-2 text-slate-300">{ch.daily_used} / {ch.daily_limit}</td>
                    <td className="px-3 py-2 text-slate-400">{ch.working_hours?.start !== undefined ? `${ch.working_hours.start}:00–${ch.working_hours.end}:00 UTC` : 'Not restricted'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {card.channels.some((c: GuardrailChannel) => c.availability === 'OUTSIDE_WORKING_HOURS') && (
            <p className="text-xs text-amber-300 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Outbound activity is paused outside your configured working hours.</p>
          )}

          <div className="text-xs text-slate-400"><span className="text-slate-500">Enabled agents:</span> {card.agents_enabled.join(', ') || 'None enabled'}</div>

          <div className="text-xs rounded-lg border border-purple-500/10 bg-[#070811] p-2 text-slate-500 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Campaign configuration is managed by your manager. {card.restrictions[0]}</span>
          </div>
        </div>
      ))}
      {!(data.campaigns || []).length && <p className="text-slate-400">No active campaign assignments.</p>}
    </div>
  </div>;
};
