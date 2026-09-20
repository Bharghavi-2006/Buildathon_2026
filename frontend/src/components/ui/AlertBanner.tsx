import React from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';

interface AlertBannerProps {
  message: string;
  onAction?: () => void;
  actionLabel?: string;
  type?: 'warning' | 'critical';
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  message,
  onAction,
  actionLabel,
  type = 'critical',
}) => {
  const isCritical = type === 'critical';
  const border = isCritical ? 'border-rose-500/40 bg-rose-950/20 text-rose-200' : 'border-amber-500/40 bg-amber-950/20 text-amber-200';
  const iconColor = isCritical ? 'text-rose-400' : 'text-amber-400';

  return (
    <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${border} transition-all mb-6 text-sm backdrop-blur-sm shadow-sm`}>
      <div className="flex items-center gap-2.5">
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
        <span className="font-medium tracking-tight">{message}</span>
      </div>
      {onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-rose-300 hover:text-rose-100 transition-colors ml-4"
        >
          {actionLabel || 'Review Now'}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
