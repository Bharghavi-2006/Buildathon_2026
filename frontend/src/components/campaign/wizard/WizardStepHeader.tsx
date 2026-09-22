import React from 'react';
import { Check, Lock } from 'lucide-react';

export interface StepItem {
  id: number;
  name: string;
  shortName: string;
  description: string;
}

export const WIZARD_STEPS: StepItem[] = [
  { id: 1, name: 'Identity', shortName: 'Identity', description: 'Name, owner & details' },
  { id: 2, name: 'Targeting / ICP', shortName: 'Targeting', description: 'Structured criteria' },
  { id: 3, name: 'Agents', shortName: 'Agents', description: 'Enable autonomous agents' },
  { id: 4, name: 'Prospect Sourcing', shortName: 'Sourcing', description: 'Discover & seed list' },
  { id: 5, name: 'Channels & Prompts', shortName: 'Channels', description: 'Outreach & prompts' },
  { id: 6, name: 'Knowledge Base', shortName: 'Knowledge', description: 'Upload files for RAG & context' },
  { id: 7, name: 'Representatives', shortName: 'Team', description: 'Matching & capacity' },
  { id: 8, name: 'Pre-Launch & Activate', shortName: 'Launch', description: 'Validation & launch' },
];

interface WizardStepHeaderProps {
  currentStep: number;
  completedSteps: number[];
  unlockedSteps: number[];
  onSelectStep: (step: number) => void;
}

export const WizardStepHeader: React.FC<WizardStepHeaderProps> = ({
  currentStep,
  completedSteps,
  unlockedSteps,
  onSelectStep,
}) => {
  return (
    <div className="w-full bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-4 sm:p-5 shadow-xl">
      <div className="flex items-center justify-between overflow-x-auto no-scrollbar gap-2 sm:gap-3 py-1">
        {WIZARD_STEPS.map((step, idx) => {
          const isCurrent = step.id === currentStep;
          const isCompleted = completedSteps.includes(step.id);
          const isUnlocked = unlockedSteps.includes(step.id) || isCompleted;
          const isLocked = !isUnlocked && !isCurrent;

          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => isUnlocked && onSelectStep(step.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left flex-shrink-0 group ${
                  isCurrent
                    ? 'bg-purple-600/20 border border-purple-500/40 text-white shadow-lg shadow-purple-900/20'
                    : isCompleted
                    ? 'bg-purple-950/20 border border-purple-500/20 text-slate-200 hover:bg-purple-900/30'
                    : isLocked
                    ? 'opacity-40 cursor-not-allowed text-slate-500 border border-transparent'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                {/* Step Icon / Number Indicator */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent
                      ? 'bg-purple-600 text-white ring-2 ring-purple-400/30'
                      : isCompleted
                      ? 'bg-purple-900/80 text-purple-200 border border-purple-400/40'
                      : isLocked
                      ? 'bg-slate-800 text-slate-500'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : isLocked ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    step.id
                  )}
                </div>

                {/* Step Labels */}
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-xs font-semibold truncate ${
                      isCurrent ? 'text-purple-300' : isCompleted ? 'text-slate-200' : 'text-slate-400'
                    }`}
                  >
                    {step.shortName}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate hidden md:block">
                    {step.description}
                  </span>
                </div>
              </button>

              {/* Connecting line */}
              {idx < WIZARD_STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-3 sm:w-6 flex-shrink-0 transition-colors ${
                    isCompleted ? 'bg-purple-600/50' : 'bg-slate-800'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
