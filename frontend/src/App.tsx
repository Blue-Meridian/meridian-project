import { Header } from './components/Header';
import { ConversationPanel } from './components/ConversationPanel';
import { ContextPanel } from './components/ContextPanel';

function App() {
  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      <Header />
      <main className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        <section className="col-span-12 lg:col-span-7 overflow-hidden">
          <ConversationPanel />
        </section>
        <aside className="col-span-12 lg:col-span-5 overflow-hidden hidden lg:block">
          <ContextPanel />
        </aside>
      </main>
    </div>
  );
}

export default App;
