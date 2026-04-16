import React, { useEffect, useState } from 'react';
import { ChevronDown, Check, Globe, Sparkles, Youtube, Instagram } from 'lucide-react';
import SaaShortsTab from './components/SaaShortsTab';
import TestTab from './components/TestTab';
import { getApiUrl } from './config';

// Simple TikTok icon (Lucide variant may differ by version)
const TikTokIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z" />
  </svg>
);

const UserProfileSelector = ({ profiles, selectedUserId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!profiles || profiles.length === 0) return null;

  const selectedProfile = profiles.find(p => p.username === selectedUserId) || profiles[0];

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors min-w-[180px]"
      >
        <span className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
            {selectedProfile?.username?.substring(0, 1).toUpperCase() || 'U'}
          </div>
          <span className="font-medium text-white truncate max-w-[100px]">{selectedProfile?.username || 'Select User'}</span>
        </span>
        <ChevronDown size={14} className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {profiles.map((profile) => (
              <button
                key={profile.username}
                onClick={() => {
                  onSelect(profile.username);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left group border-b border-white/5 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center text-xs font-bold text-white border border-white/10 shrink-0">
                    {profile.username.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors truncate">
                      {profile.username}
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <div className={`flex items-center gap-1 text-[10px] ${profile.connected?.includes('tiktok') ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        <TikTokIcon size={10} />
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] ${profile.connected?.includes('instagram') ? 'text-pink-400' : 'text-zinc-600'}`}>
                        <Instagram size={10} />
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] ${profile.connected?.includes('youtube') ? 'text-red-400' : 'text-zinc-600'}`}>
                        <Youtube size={10} />
                      </div>
                    </div>
                  </div>
                </div>
                {selectedUserId === profile.username && <Check size={14} className="text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  // 清理旧版浏览器存储的密钥（现由服务端 config 提供）
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

  const [uploadUserId, setUploadUserId] = useState(() => localStorage.getItem('uploadUserId') || '');
  const [userProfiles, setUserProfiles] = useState([]);
  const [activeTab, setActiveTab] = useState('saasshorts');

  useEffect(() => {
    if (!uploadUserId) return;
    try {
      localStorage.setItem('uploadUserId', uploadUserId);
    } catch {
      // ignore
    }
  }, [uploadUserId]);

  const fetchUserProfiles = async () => {
    try {
      const res = await fetch(getApiUrl('/api/social/user'));
      if (!res.ok) throw new Error('Failed to fetch Upload-Post users');
      const data = await res.json();
      const profiles = data.profiles || [];
      setUserProfiles(profiles);

      const defaultUsername = data.default_username;
      if (!uploadUserId) {
        const pick = (defaultUsername && profiles.some(p => p.username === defaultUsername))
          ? defaultUsername
          : (profiles[0]?.username || '');
        if (pick) setUploadUserId(pick);
      }
    } catch (e) {
      console.error(e);
      setUserProfiles([]);
    }
  };

  useEffect(() => {
    fetchUserProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          onClick={() => setActiveTab('saasshorts')}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
            activeTab === 'saasshorts' ? 'bg-violet-500/10 text-violet-400' : 'text-zinc-400 hover:bg-white/5'
          }`}
        >
          <Sparkles size={20} />
          <span className="font-medium hidden lg:block">AI Shorts</span>
        </button>

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

          <div className="flex items-center gap-4">
            {activeTab === 'saasshorts' && userProfiles.length > 0 && (
              <UserProfileSelector
                profiles={userProfiles}
                selectedUserId={uploadUserId}
                onSelect={setUploadUserId}
              />
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'saasshorts' ? (
            <SaaShortsTab uploadUserId={uploadUserId} />
          ) : (
            <TestTab />
          )}
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

