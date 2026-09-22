import React from 'react';

interface MetricCardProps {
  value: string | number;
  label: string;
  subtext?: string;
  color?: 'purple' | 'emerald' | 'amber' | 'rose' | 'default';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  value,
  label,
  subtext,
  color = 'default',
  onClick,
}) => {
  let valueColor = 'text-white';
  if (color === 'purple') valueColor = 'text-purple-400';
  if (color === 'emerald') valueColor = 'text-emerald-400';
  if (color === 'amber') valueColor = 'text-amber-400';
  if (color === 'rose') valueColor = 'text-rose-400';

  return (
    <div
      onClick={onClick}
      className={`bg-[#0d0f22] border border-[#7C3AED] hover:border-purple-500/30 rounded-xl p-5 transition-all shadow-sm ${
        onClick ? 'cursor-pointer hover:bg-[#12152d]' : ''
      }`}
    >
      <div className={`text-3xl font-bold tracking-tight mb-1.5 ${valueColor}`}>
        {value}
      </div>
      <div className="text-sm font-medium text-slate-200">{label}</div>
      {subtext && (
        <div className="text-xs text-slate-400 mt-1 font-normal flex items-center gap-1">
          {subtext}
        </div>
      )}
    </div>
  );
};
