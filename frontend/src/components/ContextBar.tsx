import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useStore } from '../state/store';
import { cn } from '../lib/cn';

/**
 * Compact context strip that sits above the chat input. Shows the current
 * portfolio budget and weight blend at a glance; click to expand and edit.
 *
 * The point is to keep the controls one click away from the conversation,
 * without dominating the page. When you change a value here, the system
 * prompt of the next chat message picks up the new state automatically.
 */
export function ContextBar() {
  const [open, setOpen] = useState(false);

  const budgetCad = useStore((s) => s.budgetCad);
  const wDollar = useStore((s) => s.weightDollar);
  const wCo2 = useStore((s) => s.weightCo2);
  const wEq = useStore((s) => s.weightEquity);
  const selectedId = useStore((s) => s.selectedId);
  const setBudget = useStore((s) => s.setBudget);
  const setWDollar = useStore((s) => s.setWeightDollar);
  const setWCo2 = useStore((s) => s.setWeightCo2);
  const setWEq = useStore((s) => s.setWeightEquity);

  return (
    <div className="px-4 pt-2.5 pb-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
      >
        <span className="uppercase tracking-wide font-semibold text-slate-500">
          Context
        </span>
        <Chip>${(budgetCad / 1e6).toFixed(0)}M budget</Chip>
        <Chip>
          ${(wDollar * 100).toFixed(0)} · CO₂ {(wCo2 * 100).toFixed(0)} · Eq{' '}
          {(wEq * 100).toFixed(0)}
        </Chip>
        {selectedId && (
          <Chip emphasis>📍 {selectedId.replace(/_/g, ' ')}</Chip>
        )}
        <ChevronDown
          size={12}
          className={cn('ml-auto transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-4 gap-3 pb-2">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold block">
              Budget ($M)
            </label>
            <input
              type="number"
              min={0}
              step={5}
              value={budgetCad / 1e6}
              onChange={(e) => setBudget(Number(e.target.value) * 1e6)}
              className="w-full mt-1 px-2 py-1.5 text-sm rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-ibm-500"
            />
          </div>
          <SliderRow label="$ savings" value={wDollar} onChange={setWDollar} />
          <SliderRow label="CO₂ avoided" value={wCo2} onChange={setWCo2} />
          <SliderRow label="Equity (Indigenous)" value={wEq} onChange={setWEq} />
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-[10.5px] font-mono',
        emphasis
          ? 'bg-ibm-50 dark:bg-ibm-900/40 text-ibm-700 dark:text-ibm-200'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
      )}
    >
      {children}
    </span>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
        <span>{label}</span>
        <span className="font-mono text-slate-700 dark:text-slate-300">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1"
      />
    </div>
  );
}
