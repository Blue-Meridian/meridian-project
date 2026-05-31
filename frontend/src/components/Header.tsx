import { Moon, Sun } from 'lucide-react';
import { useStore } from '../state/store';

export function Header() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

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
