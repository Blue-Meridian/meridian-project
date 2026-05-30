import { Moon, Sun, ShieldCheck, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchGovernanceReport } from '../api/briefs';
import { useStore } from '../state/store';
import { cn } from '../lib/cn';

export function Header() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const { data } = useQuery({
    queryKey: ['governance'],
    queryFn: fetchGovernanceReport,
    refetchInterval: 60_000,
  });

  const passRate = data?.overall_match_rate
    ? `${(data.overall_match_rate * 100).toFixed(1)}%`
    : '—';
  const verdict = data?.verdict || 'NOT_RUN';
  const isPass = verdict === 'PASS';

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 flex items-center gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
          Project Meridian
        </h1>
        <span className="text-xs text-slate-500 hidden md:inline">
          NL off-diesel portfolio · Team Blue Meridian
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs border',
            isPass
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400',
          )}
          title="watsonx.governance drift evaluation"
        >
          {isPass ? <ShieldCheck size={13} /> : <AlertCircle size={13} />}
          <span className="font-mono">
            Governance: {verdict} · {passRate}
          </span>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  );
}
