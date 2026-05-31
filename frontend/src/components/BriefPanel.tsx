import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, ChevronDown } from 'lucide-react';
import { fetchBriefs } from '../api/briefs';
import { useStore } from '../state/store';
import { fmtMillions, fmtTonnes } from '../lib/format';
import { cn } from '../lib/cn';
import { BackendError } from './BackendError';

export function BriefPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const {
    data: briefs,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['briefs'],
    queryFn: fetchBriefs,
  });
  const [statsOpen, setStatsOpen] = useState(true);

  if (!briefs) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg h-full">
        {isError && !isLoading ? (
          <BackendError
            onRetry={() => refetch()}
            isRetrying={isFetching}
            label="brief"
          />
        ) : (
          <p className="text-xs text-slate-400 p-4">Loading…</p>
        )}
      </div>
    );
  }

  const community = selectedId
    ? briefs.communities.find((c) => c.id === selectedId)
    : briefs.communities[0];

  if (!community) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 h-full">
        <p className="text-xs text-slate-400">Unknown community.</p>
      </div>
    );
  }

  const showHint = !selectedId;
  const e = community.economics;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col min-h-0 h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-base text-slate-900 dark:text-slate-100">
            {community.name}
          </h2>
          <p className="text-xs text-slate-500">{community.region}</p>
        </div>
        {community.validation.real_project_exists && (
          <span className="text-[10px] font-medium uppercase bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded">
            Validation
          </span>
        )}
      </div>

      {showHint && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3">
          <Sparkles size={11} />
          <span>Click a map pin or ask Meridian to switch communities.</span>
        </div>
      )}

      <div className="mb-3">
        <button
          onClick={() => setStatsOpen((o) => !o)}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-1.5"
          aria-expanded={statsOpen}
        >
          <ChevronDown
            size={11}
            className={cn('transition-transform', !statsOpen && '-rotate-90')}
          />
          Key figures
        </button>
        {statsOpen && (
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Capex" value={fmtMillions(e.capital_cost_cad.point)} />
            <Tile
              label="$ saved / yr"
              value={fmtMillions(e.annual_cost_saved_cad)}
            />
            <Tile label="CO₂ / yr" value={fmtTonnes(e.annual_co2_avoided_tonnes)} />
            <Tile label="Payback" value={`${e.payback_years} y`} />
          </div>
        )}
      </div>

      <article className="prose prose-sm dark:prose-invert max-w-none flex-1 overflow-y-auto pr-1 prose-headings:font-semibold prose-h2:text-sm prose-h2:mt-4 prose-h2:mb-2 prose-table:text-[11px] prose-td:px-2 prose-th:px-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {community.brief_markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="font-mono font-semibold text-sm mt-0.5">{value}</div>
    </div>
  );
}
