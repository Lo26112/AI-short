import React, { useEffect, useState } from 'react';
import { Clapperboard, Globe, Sparkles } from 'lucide-react';
import Workbench from './components/Workbench';
import VideoAnalysisPage from './components/video_analysis_page';

function App() {
  // 清理舊版瀏覽器儲存的密鑰（現由服務端 config 提供）
  useEffect(() => {
    try {
      localStorage.removeItem('gemini_key');
      localStorage.removeItem('uploadPostKey_v3');
      localStorage.removeItem('elevenLabsKey_v1');
      localStorage.removeItem('falKey_v1');
    } catch {
      // ignore
    }
  }, []);

  const [activeTab, setActiveTab] = useState('workbench');

  const Sidebar = () => (
    <div className="w-20 bg-surface border-r border-white/5 flex flex-col h-full shrink-0">
      <div className="p-4 flex items-center justify-center">
        <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-white/5">
          <img src="/logo-kolforge.png" alt="Logo" className="w-full h-full object-cover" />
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-2">
        <button
          onClick={() => setActiveTab('workbench')}
          className={`w-full flex flex-col items-center justify-center px-2 py-3 rounded-2xl transition-colors ${
            activeTab === 'workbench' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-colors ${
              activeTab === 'workbench'
                ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                : 'bg-white/5 border-white/10 text-zinc-300'
            }`}
          >
            <Sparkles size={18} />
          </div>
          <span className="mt-2 text-[11px] font-medium leading-none">工作臺</span>
        </button>
        <button
          onClick={() => setActiveTab('video-analysis')}
          className={`w-full flex flex-col items-center justify-center px-2 py-3 rounded-2xl transition-colors ${
            activeTab === 'video-analysis' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-colors ${
              activeTab === 'video-analysis'
                ? 'bg-violet-500/15 border-violet-500/25 text-violet-300'
                : 'bg-white/5 border-white/10 text-zinc-300'
            }`}
          >
            <Clapperboard size={18} />
          </div>
          <span className="mt-2 text-[11px] font-medium leading-none">分析</span>
        </button>
      </nav>

      <div className="p-3 border-t border-white/5 space-y-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            localStorage.removeItem('kolforge_skip_landing');
            window.location.hash = '';
            window.location.reload();
          }}
          className="w-full flex flex-col items-center justify-center px-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors group text-zinc-300"
        >
          <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary border border-primary/20 flex items-center justify-center shrink-0">
            <Globe size={18} />
          </div>
          <span className="mt-2 text-[11px] font-medium leading-none text-zinc-300">官網</span>
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
          {activeTab === 'video-analysis' ? <VideoAnalysisPage /> : <Workbench />}
        </div>

        <div className="h-8 border-t border-white/5 flex items-center justify-center shrink-0">
          <span className="text-[10px] text-zinc-600">
            Made with ❤️ by{' '}
            <a href="https://www.upload-post.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
              Upload-Post
            </a>
          </span>
        </div>
      </main>
    </div>
  );
}

export default App;

