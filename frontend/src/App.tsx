import { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PanelLeftOpen } from 'lucide-react';
import { Header } from './components/Header';
import { ConversationPanel } from './components/ConversationPanel';
import { ContextPanel } from './components/ContextPanel';

function App() {
  const [chatCollapsed, setChatCollapsed] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden p-3">
        {chatCollapsed ? (
          /* Chat collapsed — the right side takes the full width */
          <div className="relative h-full">
            <button
              onClick={() => setChatCollapsed(false)}
              title="Show chat"
              aria-label="Show chat"
              className="absolute left-2 top-2 z-[600] flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur hover:bg-white dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <PanelLeftOpen size={14} />
              Chat
            </button>
            <ContextPanel />
          </div>
        ) : (
          /* Both panels — draggable divider, sizes persisted via autoSaveId */
          <PanelGroup
            direction="horizontal"
            autoSaveId="meridian-panels"
            className="h-full"
          >
            <Panel id="chat" order={1} minSize={26} defaultSize={56}>
              <ConversationPanel onCollapse={() => setChatCollapsed(true)} />
            </Panel>

            <PanelResizeHandle className="group relative flex w-3 items-center justify-center outline-none">
              <div className="h-10 w-1 rounded-full bg-slate-300 transition-all dark:bg-slate-700 group-hover:h-16 group-hover:bg-ibm-400 dark:group-hover:bg-ibm-500" />
            </PanelResizeHandle>

            <Panel id="context" order={2} minSize={30} defaultSize={44}>
              <ContextPanel />
            </Panel>
          </PanelGroup>
        )}
      </main>
    </div>
  );
}

export default App;
