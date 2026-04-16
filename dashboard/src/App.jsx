import React, { useState } from 'react';
import { Globe, Sparkles } from 'lucide-react';
import TestTab from './components/TestTab';

function App() {
  const [activeTab, setActiveTab] = useState('test');

  const Sidebar = () => (
    <div className="w-20 lg:w-64 bg-surface border-r border-white/5 flex flex-col h-full shrink-0 transition-all duration-300">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-white/5">
          <img src="/logo-kolforge.png" alt="Logo" className="w-full h-full object-cover" />
        </div>
        <span className="font-bold text-lg text-white hidden lg:block tracking-tight">KOLForge</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2">
        <button
          onClick={() => setActiveTab('test')}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
            activeTab === 'test' ? 'bg-violet-500/10 text-violet-400' : 'text-zinc-400 hover:bg-white/5'
          }`}
        >
          <Sparkles size={20} />
          <span className="font-medium hidden lg:block">Workbench</span>
        </button>
      </nav>

      <div className="p-4 border-t border-white/5 space-y-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            localStorage.removeItem('kolforge_skip_landing');
            window.location.hash = '';
            window.location.reload();
          }}
          className="flex items-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <Globe size={16} />
          </div>
          <div className="hidden lg:block overflow-hidden">
            <p className="text-sm font-bold text-white leading-none mb-0.5">Landing Page</p>
            <p className="text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors truncate">View website</p>
          </div>
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/30">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 border-b border-white/5 bg-background/50 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-4" />
          <div className="flex items-center gap-4" />
        </header>

        <div className="flex-1 overflow-hidden relative">
          <TestTab />
        </div>

        <div className="h-8 border-t border-white/5 flex items-center justify-center shrink-0">
          <span className="text-[10px] text-zinc-600">
            Made with ❤️ by{' '}
            <a href="https://www.kolforge.ai" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
              KOLForge
            </a>
          </span>
        </div>
      </main>
    </div>
  );
}

export default App;

