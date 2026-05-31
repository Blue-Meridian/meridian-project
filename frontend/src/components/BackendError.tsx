import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Shown when a data fetch fails (most often the backend VM cold-starting).
 * The point is to never leave a panel stuck on "Loading…" forever: state the
 * problem plainly and give a Retry button so a demo can recover on the spot.
 */
export function BackendError({
  onRetry,
  isRetrying = false,
  label = 'data',
}: {
  onRetry: () => void;
  isRetrying?: boolean;
  label?: string;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
      <AlertTriangle size={22} className="text-amber-500" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Couldn’t reach the backend
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[15rem]">
          The API may be waking up. Retry in a moment to load the {label}.
        </p>
      </div>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-ibm-500 hover:bg-ibm-600 text-white disabled:opacity-60"
      >
        <RefreshCw size={13} className={isRetrying ? 'animate-spin' : ''} />
        {isRetrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
