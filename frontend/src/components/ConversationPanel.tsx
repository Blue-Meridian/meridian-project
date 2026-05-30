import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Plus, Database, Layers, GitCompare, TrendingUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../state/store';
import { streamChat } from '../api/chat';
import { cn } from '../lib/cn';
import { ContextBar } from './ContextBar';

const STARTERS = [
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

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function ConversationPanel() {
  const chatMessages = useStore((s) => s.chatMessages);
  const appendMessage = useStore((s) => s.appendMessage);
  const updateLastAssistant = useStore((s) => s.updateLastAssistant);
  const clearChat = useStore((s) => s.clearChat);
  const budgetCad = useStore((s) => s.budgetCad);
  const weightDollar = useStore((s) => s.weightDollar);
  const weightCo2 = useStore((s) => s.weightCo2);
  const weightEquity = useStore((s) => s.weightEquity);
  const selectedId = useStore((s) => s.selectedId);

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
    appendMessage({ role: 'assistant', content: '' });

    const chatMode = useStore.getState().chatMode;

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
      updateLastAssistant(
        `\n\n⚠️ ${(err as Error).message.slice(0, 300)}`,
      );
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
      {/* Panel header — the chat's identity */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <MeridianAvatar size="sm" />
          <div className="flex flex-col leading-tight gap-0.5">
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Meridian
            </span>
            <ModePills />
          </div>
        </div>
        {!empty && (
          <button
            onClick={clearChat}
            className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Plus size={12} />
            New conversation
          </button>
        )}
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
  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <div className="text-center space-y-4">
        <MeridianAvatar size="lg" className="mx-auto" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Meridian
          </h1>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold mt-1">
            Newfoundland & Labrador off-diesel co-pilot
          </p>
        </div>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg mx-auto">
          I know the engineering, costs, and federal funding for all{' '}
          <strong className="text-slate-900 dark:text-slate-100">
            20 diesel-dependent communities
          </strong>{' '}
          in NL. Ask me to plan, compare, rank, or explain — every number traces
          to a public source.
        </p>
      </div>

      <div className="space-y-2.5">
        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
          Suggested questions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STARTERS.map((s) => (
            <button
              key={s.text}
              onClick={() => onSend(s.text)}
              className="group text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-ibm-400 dark:hover:border-ibm-500 hover:bg-ibm-50/50 dark:hover:bg-ibm-900/20 transition-colors"
            >
              <div className="flex items-center gap-2 text-ibm-600 dark:text-ibm-300 mb-0.5">
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
            258/258 numbers governance-verified.
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
  return (
    <div className="flex gap-3">
      <MeridianAvatar size="sm" className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {message.content ? (
          <article className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1.5 prose-table:text-[12px] prose-td:px-2 prose-th:px-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </article>
        ) : streaming ? (
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
    return (
      <button
        type="button"
        onClick={() => setMode(value)}
        title={subtitle}
        className={cn(
          'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
          active
            ? 'bg-ibm-500 text-white'
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
  className,
}: {
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const dims = size === 'lg' ? 'w-14 h-14' : 'w-7 h-7';
  const iconSize = size === 'lg' ? 24 : 14;
  return (
    <div
      className={cn(
        dims,
        'rounded-full bg-gradient-to-br from-ibm-400 via-ibm-500 to-ibm-700 flex items-center justify-center shadow-sm',
        className,
      )}
    >
      <Sparkles size={iconSize} className="text-white" />
    </div>
  );
}
