import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Database,
  Layers,
  GitCompare,
  TrendingUp,
  PanelLeftClose,
  Workflow,
  Zap,
  MapPin,
  ListChecks,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../state/store';
import { streamChat, type ChatMessage } from '../api/chat';
import { cn } from '../lib/cn';
import { ContextBar } from './ContextBar';
import { AgentPipeline } from './AgentPipeline';

// Granite mode: direct analysis / portfolio questions answered by the model.
const GRANITE_STARTERS = [
  {
    icon: <Database size={14} />,
    text: 'Tell me about Nain',
    detail: 'Single community deep dive',
  },
  {
    icon: <Layers size={14} />,
    text: 'Rank under $30M with high CO₂ priority',
    detail: 'Portfolio with weight emphasis',
  },
  {
    icon: <GitCompare size={14} />,
    text: 'Compare Nain and Natuashish',
    detail: 'Two-community side by side',
  },
  {
    icon: <TrendingUp size={14} />,
    text: 'Which 5 give the best CO₂ per dollar?',
    detail: 'Ranked by efficiency',
  },
];

// Coordinator mode: prompts that kick off the 5-agent Orchestrate pipeline,
// which assembles a full pre-feasibility brief (not a one-shot answer).
const COORDINATOR_STARTERS = [
  {
    icon: <Workflow size={14} />,
    text: 'Build a clean energy plan for Nain',
    detail: 'Runs all 5 specialist agents',
  },
  {
    icon: <Zap size={14} />,
    text: 'Build a clean energy plan for Natuashish',
    detail: 'Full pre-feasibility brief',
  },
  {
    icon: <MapPin size={14} />,
    text: 'Plan the transition for Hopedale',
    detail: 'Resource → design → economics → funding',
  },
  {
    icon: <ListChecks size={14} />,
    text: 'What communities can you plan for?',
    detail: 'List the 20 in scope',
  },
];

export function ConversationPanel({
  onCollapse,
}: {
  onCollapse?: () => void;
}) {
  const chatMessages = useStore((s) => s.chatMessages);
  const appendMessage = useStore((s) => s.appendMessage);
  const updateLastAssistant = useStore((s) => s.updateLastAssistant);
  const clearChat = useStore((s) => s.clearChat);
  const budgetCad = useStore((s) => s.budgetCad);
  const weightDollar = useStore((s) => s.weightDollar);
  const weightCo2 = useStore((s) => s.weightCo2);
  const weightEquity = useStore((s) => s.weightEquity);
  const selectedId = useStore((s) => s.selectedId);
  const chatMode = useStore((s) => s.chatMode);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    appendMessage(userMsg);
    setInput('');
    setStreaming(true);
    // Tag the assistant turn with the engine that produced it so the message
    // can render the Coordinator pipeline (and stay tagged in history).
    appendMessage({ role: 'assistant', content: '', mode: chatMode });

    try {
      const stream = streamChat({
        messages: [...chatMessages, userMsg],
        mode: chatMode,
        // Coordinator agents have their own context; only Granite uses the
        // dashboard state as grounded context. (Saves payload + avoids 400s
        // if Orchestrate ever validates unknown fields.)
        current_state:
          chatMode === 'granite'
            ? {
                budget_m: budgetCad / 1e6,
                w_dollar: weightDollar,
                w_co2: weightCo2,
                w_equity: weightEquity,
                selected_community: selectedId,
              }
            : undefined,
      });
      for await (const chunk of stream) {
        updateLastAssistant(chunk);
      }
    } catch (err) {
      updateLastAssistant(`\n\n⚠️ ${(err as Error).message.slice(0, 300)}`);
    } finally {
      setStreaming(false);
      // Re-focus the input so the next question is one keystroke away
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const empty = chatMessages.length === 0;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      {/* Panel header — the chat's identity. Tints violet in Coordinator mode. */}
      <div
        className={cn(
          'border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between transition-colors',
          chatMode === 'coordinator' && 'bg-violet-50/50 dark:bg-violet-950/20',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <MeridianAvatar size="sm" variant={chatMode} />
          <div className="flex flex-col leading-tight gap-0.5 min-w-0">
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Meridian
            </span>
            <ModePills />
            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              {chatMode === 'coordinator'
                ? 'watsonx Orchestrate · 5-agent pipeline'
                : 'watsonx.ai · Granite 3-8B'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!empty && (
            <button
              onClick={clearChat}
              className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Plus size={12} />
              New conversation
            </button>
          )}
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse chat panel"
              aria-label="Collapse chat panel"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <WelcomeState onSend={send} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
            {chatMessages.map((m, i) => (
              <MessageRow
                key={i}
                message={m}
                streaming={streaming && i === chatMessages.length - 1}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Context bar + input */}
      <div className="border-t border-slate-200 dark:border-slate-800">
        <ContextBar />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="px-4 pb-4 pt-2 flex gap-2 items-end"
        >
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Meridian about NL's off-diesel communities…"
              disabled={streaming}
              rows={1}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm leading-snug resize-none focus:outline-none focus:ring-2 focus:ring-ibm-500 disabled:opacity-60"
              style={{ maxHeight: '160px' }}
            />
          </div>
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className={cn(
              'h-[46px] w-[46px] rounded-xl flex items-center justify-center transition-colors',
              streaming || !input.trim()
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-ibm-500 hover:bg-ibm-600 text-white',
            )}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </form>
        <p className="text-[10px] text-slate-400 text-center pb-3 px-4">
          Meridian uses watsonx.ai Granite over a verified knowledge base.
          Numbers come from Python tools applying NL Hydro Hatch 2020 benchmarks.
        </p>
      </div>
    </div>
  );
}

// ─── Welcome state ──────────────────────────────────────────────────────────

function WelcomeState({ onSend }: { onSend: (s: string) => void }) {
  const chatMode = useStore((s) => s.chatMode);
  const isCoordinator = chatMode === 'coordinator';

  // The welcome screen is the first thing you see, so it has to make the active
  // engine obvious: Coordinator frames itself as the multi-agent orchestrator
  // with plan-building prompts; Granite frames itself as the analysis co-pilot.
  const starters = isCoordinator ? COORDINATOR_STARTERS : GRANITE_STARTERS;
  const subtitle = isCoordinator
    ? 'Multi-agent orchestrator · 5 specialists'
    : 'Newfoundland & Labrador off-diesel co-pilot';
  const sectionLabel = isCoordinator ? 'Start a pipeline run' : 'Suggested questions';

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <div className="text-center space-y-4">
        <MeridianAvatar size="lg" variant={chatMode} className="mx-auto" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Meridian
          </h1>
          <p
            className={cn(
              'text-[11px] uppercase tracking-wide font-semibold mt-1',
              isCoordinator
                ? 'text-violet-600 dark:text-violet-300'
                : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {subtitle}
          </p>
        </div>
        {isCoordinator ? (
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg mx-auto">
            Name a community and my five specialists —{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              Resource Scout, System Designer, Number Cruncher, Grant Finder, and
              Brief Writer
            </strong>{' '}
            — run in sequence to produce a full off-diesel pre-feasibility brief.
            You will see each agent work as it goes.
          </p>
        ) : (
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg mx-auto">
            I know the engineering, costs, and federal funding for all{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              20 diesel-dependent communities
            </strong>{' '}
            in NL. Ask me to plan, compare, rank, or explain — every number traces
            to a public source.
          </p>
        )}
      </div>

      <div className="space-y-2.5">
        <p
          className={cn(
            'text-[11px] uppercase tracking-wide font-semibold',
            isCoordinator
              ? 'text-violet-600 dark:text-violet-300'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          {sectionLabel}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {starters.map((s) => (
            <button
              key={s.text}
              onClick={() => onSend(s.text)}
              className={cn(
                'group text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors',
                isCoordinator
                  ? 'hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-900/20'
                  : 'hover:border-ibm-400 dark:hover:border-ibm-500 hover:bg-ibm-50/50 dark:hover:bg-ibm-900/20',
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-2 mb-0.5',
                  isCoordinator
                    ? 'text-violet-600 dark:text-violet-300'
                    : 'text-ibm-600 dark:text-ibm-300',
                )}
              >
                {s.icon}
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {s.text}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 ml-6">
                {s.detail}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
        <p className="text-[11px] text-slate-500 text-center leading-relaxed">
          Data sources: Pembina Institute · Canada Energy Regulator · NL Hydro
          PUB filings · Global Wind Atlas · NASA POWER · NL Hydro 2020 Hatch
          study · 4 federal funding programs.{' '}
          <span className="font-mono text-emerald-600 dark:text-emerald-400">
            Every number computed by deterministic Python.
          </span>
        </p>
      </div>
    </div>
  );
}

// ─── Message rendering ──────────────────────────────────────────────────────

function MessageRow({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="rounded-2xl px-4 py-2.5 max-w-[85%] bg-ibm-500 text-white text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  // Coordinator turns get the live agent pipeline above the brief; Granite
  // turns render exactly as before.
  const isCoordinator = message.mode === 'coordinator';
  // The run can fail mid-pipeline (e.g. an Orchestrate graph recursion limit).
  // Those failures arrive as plain assistant text, not an exception, so detect
  // the known markers and flip the pipeline to its failed state instead of
  // letting the scripted timeline show a fake all-done.
  const errored =
    isCoordinator &&
    !streaming &&
    /recursion limit|encountered an error|⚠️|GRAPH_RECURSION/i.test(
      message.content,
    );
  return (
    <div className="flex gap-3">
      <MeridianAvatar
        size="sm"
        variant={message.mode}
        className="mt-0.5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        {isCoordinator && (
          <AgentPipeline streaming={streaming} errored={errored} />
        )}
        {message.content ? (
          <article className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1.5 prose-table:text-[12px] prose-td:px-2 prose-th:px-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </article>
        ) : streaming && !isCoordinator ? (
          <TypingDots />
        ) : null}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 pt-2">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
    </div>
  );
}

// ─── Mode pills (Granite ↔ Coordinator) ────────────────────────────────────

function ModePills() {
  const mode = useStore((s) => s.chatMode);
  const setMode = useStore((s) => s.setChatMode);

  const Pill = ({
    value,
    label,
    subtitle,
  }: {
    value: 'granite' | 'coordinator';
    label: string;
    subtitle: string;
  }) => {
    const active = mode === value;
    // Coordinator gets the violet accent so the mode switch reads at a glance.
    const activeClass =
      value === 'coordinator'
        ? 'bg-violet-500 text-white'
        : 'bg-ibm-500 text-white';
    return (
      <button
        type="button"
        onClick={() => setMode(value)}
        title={subtitle}
        className={cn(
          'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
          active
            ? activeClass
            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800',
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1 -ml-1">
      <Pill
        value="granite"
        label="Granite"
        subtitle="watsonx.ai Granite, grounded in briefs.json"
      />
      <Pill
        value="coordinator"
        label="Coordinator"
        subtitle="watsonx Orchestrate Coordinator agent (live 5-agent flow)"
      />
    </div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

function MeridianAvatar({
  size = 'sm',
  variant = 'granite',
  className,
}: {
  size?: 'sm' | 'lg';
  variant?: 'granite' | 'coordinator';
  className?: string;
}) {
  const dims = size === 'lg' ? 'w-14 h-14' : 'w-7 h-7';
  const iconSize = size === 'lg' ? 24 : 14;
  // IBM-blue for Granite, violet for the Orchestrate Coordinator.
  const gradient =
    variant === 'coordinator'
      ? 'from-violet-400 via-violet-500 to-violet-700'
      : 'from-ibm-400 via-ibm-500 to-ibm-700';
  return (
    <div
      className={cn(
        dims,
        'rounded-full bg-gradient-to-br flex items-center justify-center shadow-sm',
        gradient,
        className,
      )}
    >
      <Sparkles size={iconSize} className="text-white" />
    </div>
  );
}
