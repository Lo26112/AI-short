import React from 'react';

export default function LipsyncStep({ videoAsset, audioAsset }) {
  return (
    <div className="mt-6 space-y-6">
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-white">對口型</h2>
        <p className="text-xs text-zinc-500 mt-1">將影片與音訊做 lipsync 合成（佔位）。</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-400">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            Video asset: <span className="text-zinc-200 font-mono">{String(videoAsset || 'none')}</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            Audio asset: <span className="text-zinc-200 font-mono">{String(audioAsset || 'none')}</span>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] flex items-center justify-center text-zinc-500 text-sm">
        參數配置元件佔位區（後續可在此新增參數表單）
      </div>
    </div>
  );
}
