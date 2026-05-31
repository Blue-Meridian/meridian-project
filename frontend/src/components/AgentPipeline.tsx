import { useEffect, useState } from 'react';
import {
  Radar,
  Ruler,
  Calculator,
  Landmark,
  FileText,
  Check,
  Loader2,
  Workflow,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Coordinator-mode pipeline visual. The Orchestrate Coordinator always runs
 * the same five specialists in this fixed order (enforced by the agent's
 * profile), so we surface that sequence as a live checklist: each agent moves
 * pending → working → done as the run streams. This is what makes Coordinator
 * mode visibly different from a single Granite call — you see the team work.
 *
 * `errored` flips the whole card to a failed state. We deliberately do NOT
 * claim any specific agent succeeded on failure — the run can fail anywhere
 * (e.g. an Orchestrate graph recursion limit) and we have no per-step truth,
 * so showing five green checks on a failed run would be a lie. Honest > pretty.
 */
const AGENTS = [
  { name: 'Resource Scout', did: 'wind, solar & load data', icon: Radar },
  { name: 'System Designer', did: 'sized wind + battery + diesel', icon: Ruler },
  { name: 'Number Cruncher', did: 'capex, savings, CO₂, payback', icon: Calculator },
  { name: 'Grant Finder', did: 'matched federal funding', icon: Landmark },
  { name: 'Brief Writer', did: 'assembled the brief', icon: FileText },
] as const;

export function AgentPipeline({
  streaming,
  errored = false,
}: {
  streaming: boolean;
  errored?: boolean;
}) {
  // `stage` = number of agents finished; the agent at index `stage` is working.
  const [stage, setStage] = useState(streaming ? 0 : AGENTS.length);

  useEffect(() => {
    if (errored) return; // freeze — do not advance or mark anything done
    if (!streaming) {
      setStage(AGENTS.length); // run finished cleanly — mark every agent done
      return;
    }
    setStage(0);
    // Advance the first four specialists on a timer; hold Brief Writer (the
    // last) as "working" while the brief text streams in, then the !streaming
    // branch marks it done.
    const id = setInterval(() => {
      setStage((s) => (s < AGENTS.length - 1 ? s + 1 : s));
    }, 850);
    return () => clearInterval(id);
  }, [streaming, errored]);

  const allDone = !errored && stage >= AGENTS.length;

  return (
    <div
      className={cn(
        'mb-3 rounded-lg border overflow-hidden',
        errored
          ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20'
          : 'border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/20',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 border-b text-[11px] font-semibold',
          errored
            ? 'border-rose-200/70 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
            : 'border-violet-200/70 dark:border-violet-900/50 text-violet-700 dark:text-violet-300',
        )}
      >
        <Workflow size={12} />
        <span>Agent pipeline</span>
        <span
          className={cn(
            'font-normal',
            errored
              ? 'text-rose-500/80 dark:text-rose-400/70'
              : 'text-violet-500/80 dark:text-violet-400/70',
          )}
        >
          · watsonx Orchestrate
        </span>
        {errored ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-normal text-rose-600 dark:text-rose-300">
            <AlertTriangle size={10} /> Run didn’t complete — try again
          </span>
        ) : allDone ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-normal text-violet-500 dark:text-violet-400">
            <Check size={10} /> 5 agents
          </span>
        ) : null}
      </div>
      <ol className="px-3 py-2 space-y-1.5">
        {AGENTS.map((a, i) => {
          // On error every row goes neutral — we can't attribute success.
          const done = !errored && i < stage;
          const working = !errored && i === stage && !allDone;
          const Icon = a.icon;
          return (
            <li
              key={a.name}
              className={cn(
                'flex items-center gap-2.5 text-xs transition-opacity duration-300',
                !done && !working && 'opacity-40',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0',
                  done
                    ? 'bg-violet-500 text-white'
                    : working
                      ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400',
                )}
              >
                {done ? (
                  <Check size={12} />
                ) : working ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Icon size={12} />
                )}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {a.name}
              </span>
              <span className="text-slate-500 dark:text-slate-400 truncate">
                — {a.did}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
