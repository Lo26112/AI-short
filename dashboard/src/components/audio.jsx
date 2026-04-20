import React from 'react';

export default function AudioStep({ onSkipToLipsync }) {
  return (
    <div className="mt-6 space-y-6">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">生成音訊</h2>
            <p className="text-xs text-zinc-500 mt-1">生成配音/音訊素材（佔位）。</p>
          </div>
          <button
            type="button"
            onClick={onSkipToLipsync}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
          >
            已有素材跳過此階段
          </button>
        </div>
      </div>

      <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] flex items-center justify-center text-zinc-500 text-sm">
        參數配置元件佔位區（後續可在此新增參數表單）
      </div>
    </div>
  );
}
