import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, Check, Clock } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { StatusBadge } from '../../components/ui/StatusBadge';

const CATEGORY_LABEL: Record<string, string> = {
  SUPPRESSION_DNC: 'Suppression / DNC issue',
  DUPLICATE_CONFLICT: 'Duplicate / conflict prospect',
  CHANNEL_UNAVAILABLE: 'Channel unavailable',
  POLICY_VIOLATION: 'Policy violation',
  APPROVAL_BOTTLENECK: 'Approval bottleneck',
  MISSING_KNOWLEDGE: 'Missing knowledge',
  UNSUPPORTED_CLAIM: 'Unsupported product claim',
  CONFLICTING_INSTRUCTIONS: 'Conflicting campaign instructions',
  ICP_AMBIGUITY: 'ICP ambiguity',
  VOICE_ESCALATION: 'Voice escalation',
};
const CHANNEL_LABEL: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn', message: 'SMS', voice: 'Voice' };

function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Today, ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export const RepresentativeMonitoring: React.FC = () => {
  const { data, isLoading, error } = useQuery({ queryKey: ['rep-monitoring'], queryFn: representativeApi.monitoring, refetchInterval: 20000 });

  if (isLoading) return <div className="text-slate-400">Loading your monitoring…</div>;
  if (error || !data) return <div className="text-rose-300">Unable to load your monitoring data.</div>;

  const { summary, approvals_cleared_last_7_days: cleared, daily_capacity: capacity, performance_by_campaign: perf, channel_performance: channels, attention_required: attention, escalation_history: history } = data;
  const maxCleared = Math.max(1, ...cleared.map((d: any) => d.count));
  const totalCleared = cleared.reduce((s: number, d: any) => s + d.count, 0);
  const gaugeDeg = Math.min(360, Math.round((capacity.pct || 0) * 3.6));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif italic font-semibold text-white tracking-tight">Your Monitoring</h1>
        <p className="text-sm text-slate-400 mt-1">Your performance across your assigned campaigns this week.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Avg approval turnaround</div>
          <div className="text-2xl font-bold text-white">{summary.avg_approval_turnaround_hours}h</div>
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Response rate</div>
          <div className="text-2xl font-bold text-white">{summary.response_rate_pct}%</div>
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Meetings booked</div>
          <div className="text-2xl font-bold text-white">{summary.meetings_booked}</div>
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Escalations resolved</div>
          <div className="text-2xl font-bold text-white">{summary.escalations.resolved} / {summary.escalations.total}</div>
          {summary.escalations.pending > 0 && <div className="text-[11px] text-amber-300 mt-1">{summary.escalations.pending} pending</div>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Approvals cleared, last 7 days</h3>
            <span className="text-xs text-slate-500">{totalCleared} total</span>
          </div>
          <div className="flex items-end justify-between gap-2 h-32">
            {cleared.map((d: any) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full max-w-[28px] rounded-t bg-purple-500/70" style={{ height: `${Math.max(4, (d.count / maxCleared) * 100)}%` }} title={`${d.count} on ${d.date}`} />
                <span className="text-[10px] text-slate-500">{d.day}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4 flex flex-col items-center justify-center">
          <h3 className="text-sm font-semibold text-white self-start mb-3">Daily capacity</h3>
          <div className="relative w-28 h-28 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(#a855f7 ${gaugeDeg}deg, #1e1b3a 0deg)` }}>
            <div className="w-20 h-20 rounded-full bg-[#0d0f22] flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white">{capacity.pct}%</span>
            </div>
          </div>
          <div className="text-xs text-slate-300 mt-3">{capacity.used} of {capacity.limit} daily send</div>
          <div className="text-[11px] text-slate-500">capacity used today</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-2">Performance by campaign</h3>
        <div className="rounded-xl border border-purple-500/10 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#0d0f22] text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Campaign</th>
                <th className="text-left font-medium px-4 py-2.5">Approvals</th>
                <th className="text-left font-medium px-4 py-2.5">Response rate</th>
                <th className="text-left font-medium px-4 py-2.5">Meetings</th>
                <th className="text-left font-medium px-4 py-2.5">Escalations</th>
                <th className="text-left font-medium px-4 py-2.5">Avg response</th>
              </tr>
            </thead>
            <tbody>
              {perf.map((p: any) => (
                <tr key={p.campaign_id} className="border-t border-purple-500/5">
                  <td className="px-4 py-3 text-slate-100 font-medium">{p.campaign_name}</td>
                  <td className="px-4 py-3 text-slate-300">{p.approvals}</td>
                  <td className="px-4 py-3 text-emerald-300">{p.response_rate_pct}%</td>
                  <td className="px-4 py-3 text-slate-300">{p.meetings}</td>
                  <td className="px-4 py-3 text-slate-300">{p.escalations}</td>
                  <td className="px-4 py-3 text-slate-300">{p.avg_response_hours}h</td>
                </tr>
              ))}
              {!perf.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No campaign activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Channel performance</h3>
          <div className="space-y-2.5">
            {channels.map((c: any) => (
              <div key={c.channel} className="flex items-center justify-between text-xs">
                <span className="text-slate-200 font-medium">{CHANNEL_LABEL[c.channel] || c.channel}</span>
                <span className="text-slate-400">{c.sent} sent</span>
                <span className="text-emerald-300">{c.response_rate_pct}% response</span>
              </div>
            ))}
            {!channels.length && <p className="text-xs text-slate-500">No outbound messages recorded yet.</p>}
          </div>
        </div>
        <div className="bg-[#0d0f22] border border-purple-500/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Attention required</h3>
          <div className="space-y-2.5">
            {attention.map((a: any) => (
              <div key={a.hurdle_id} className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300">{a.status === 'ESCALATED' ? 'Escalated' : 'Pending'}</span>
                </div>
                <div className="text-xs font-semibold text-slate-100">{CATEGORY_LABEL[a.category] || a.category}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{a.campaign_name}{a.prospect_name ? ` · ${a.prospect_name}` : ''}</div>
                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{a.age_hours}h old</div>
              </div>
            ))}
            {!attention.length && <p className="text-xs text-emerald-300 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Nothing needs attention right now.</p>}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-2">Escalation history</h3>
        <div className="rounded-xl border border-purple-500/10 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#0d0f22] text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Issue</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Owner</th>
                <th className="text-left font-medium px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.hurdle_id} className="border-t border-purple-500/5">
                  <td className="px-4 py-3">
                    <div className="text-slate-100 font-medium flex items-center gap-1.5">{h.status !== 'RESOLVED' && <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />}{CATEGORY_LABEL[h.category] || h.category}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{h.campaign_name}{h.prospect_name ? ` · ${h.prospect_name}` : ''}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                  <td className="px-4 py-3 text-slate-300">{h.owner}</td>
                  <td className="px-4 py-3 text-slate-500">{formatTimestamp(h.timestamp)}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No escalations recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
