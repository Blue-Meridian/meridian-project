import { create } from 'zustand';
import type { ChatMessage } from '../api/chat';

type Theme = 'light' | 'dark';
type ChatMode = 'granite' | 'coordinator';

interface MeridianState {
  // Portfolio inputs
  budgetCad: number;
  weightDollar: number;
  weightCo2: number;
  weightEquity: number;

  // Selection
  selectedId: string | null;

  // Chat
  chatOpen: boolean;
  chatMode: ChatMode;
  chatMessages: ChatMessage[];

  // Theme
  theme: Theme;

  // Actions
  setBudget: (n: number) => void;
  setWeightDollar: (n: number) => void;
  setWeightCo2: (n: number) => void;
  setWeightEquity: (n: number) => void;
  setSelectedId: (id: string | null) => void;
  toggleChat: () => void;
  setChatMode: (m: ChatMode) => void;
  appendMessage: (m: ChatMessage) => void;
  updateLastAssistant: (chunk: string) => void;
  clearChat: () => void;
  toggleTheme: () => void;
}

const applyTheme = (theme: Theme) => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
};

const initialTheme: Theme = (() => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('meridian-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();

applyTheme(initialTheme);

export const useStore = create<MeridianState>((set) => ({
  budgetCad: 50_000_000,
  weightDollar: 0.4,
  weightCo2: 0.4,
  weightEquity: 0.2,

  selectedId: null,

  chatOpen: false,
  chatMode: 'granite',
  chatMessages: [],

  theme: initialTheme,

  setBudget: (n) => set({ budgetCad: Math.max(0, n) }),
  setWeightDollar: (n) => set({ weightDollar: clamp01(n) }),
  setWeightCo2: (n) => set({ weightCo2: clamp01(n) }),
  setWeightEquity: (n) => set({ weightEquity: clamp01(n) }),

  setSelectedId: (id) => set({ selectedId: id }),

  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatMode: (m) => set({ chatMode: m }),
  appendMessage: (m) => set((s) => ({ chatMessages: [...s.chatMessages, m] })),
  updateLastAssistant: (chunk) =>
    set((s) => {
      const last = s.chatMessages[s.chatMessages.length - 1];
      if (!last || last.role !== 'assistant') return s;
      return {
        chatMessages: [
          ...s.chatMessages.slice(0, -1),
          { ...last, content: last.content + chunk },
        ],
      };
    }),
  clearChat: () => set({ chatMessages: [] }),
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      if (typeof window !== 'undefined') localStorage.setItem('meridian-theme', next);
      return { theme: next };
    }),
}));

function clamp01(n: number) {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
