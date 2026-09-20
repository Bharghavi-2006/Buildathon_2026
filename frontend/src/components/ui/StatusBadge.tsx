import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  showDot = true,
}) => {
  const norm = status?.toUpperCase() || '';

  let bg = 'bg-slate-800/80 text-slate-300 border-slate-700/60';
  let dotColor = 'bg-slate-400';

  if (['LIVE', 'ACTIVE', 'STRONG_FIT', 'MATCHED', 'QUALIFIED', 'OUTREACH_ELIGIBLE', 'COMPLETED', 'VERIFIED'].includes(norm)) {
    bg = 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30';
    dotColor = 'bg-emerald-400';
  } else if (['PAUSED', 'WARNING', 'PARTIAL_FIT', 'UNVERIFIED', 'NEEDS_RESEARCH', 'NEEDS_HUMAN_REVIEW', 'CONTACTED'].includes(norm)) {
    bg = 'bg-amber-950/50 text-amber-300 border-amber-500/30';
    dotColor = 'bg-amber-400';
  } else if (['AT RISK', 'CRITICAL', 'FAILED', 'DISQUALIFIED', 'UNMATCHED', 'NOT_A_FIT', 'BLOCKED'].includes(norm)) {
    bg = 'bg-rose-950/50 text-rose-300 border-rose-500/30';
    dotColor = 'bg-rose-400';
  } else if (['DRAFT', 'PENDING', 'OPEN', 'DISCOVERED', 'RESEARCHED'].includes(norm)) {
    bg = 'bg-purple-950/40 text-purple-300 border-purple-500/30';
    dotColor = 'bg-purple-400';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${bg} ${padding} transition-colors tracking-wide`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0 animate-pulse`} />}
      {status}
    </span>
  );
};
