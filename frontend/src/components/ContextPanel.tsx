import { NLMap } from './NLMap';
import { BriefPanel } from './BriefPanel';

/**
 * Right column — the data context that accompanies the conversation. The map
 * always shows the 20 communities; the brief panel below shows whichever
 * community the user has selected (via the map or the chat).
 */
export function ContextPanel() {
  return (
    <div className="h-full grid grid-rows-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
      <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <NLMap />
      </div>
      <div className="overflow-hidden">
        <BriefPanel />
      </div>
    </div>
  );
}
