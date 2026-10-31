import { Check } from 'lucide-react';

const STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
];

export default function StatusStepper({ currentStatus = 'draft' }) {
  const currentIdx = Math.max(
    0,
    STEPS.findIndex((s) => s.key === currentStatus)
  );

  return (
    <div className="flex items-center justify-between gap-2 py-3 px-4 bg-zinc-50 border border-zinc-200 rounded-xl overflow-x-auto">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.key} className="flex items-center gap-2 min-w-fit flex-1 last:flex-initial">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  isCurrent
                    ? 'bg-zinc-900 text-white ring-4 ring-zinc-900/10'
                    : isCompleted
                    ? 'bg-zinc-800 text-white'
                    : 'bg-white text-zinc-400 border border-zinc-300'
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  isCurrent
                    ? 'text-zinc-900 font-semibold'
                    : isCompleted
                    ? 'text-zinc-700'
                    : 'text-zinc-400'
                }`}
              >
                {step.label}
              </span>
            </div>

            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px min-w-4 ${
                  idx < currentIdx ? 'bg-zinc-800' : 'bg-zinc-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
