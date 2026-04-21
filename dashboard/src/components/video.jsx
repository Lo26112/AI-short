import React from 'react';

/** 中間列：生成影片參數 */
export function VideoStepConfig({
  videoProvider,
  setVideoProvider,
  videoMode,
  setVideoMode,
  videoDuration,
  setVideoDuration,
  videoGenerateAudio,
  setVideoGenerateAudio,
  klingAspectRatio,
  setKlingAspectRatio,
  wanFps,
  setWanFps,
  wanAspectRatio,
  setWanAspectRatio,
  wanResolution,
  setWanResolution,
  imageAsset,
  onSkipToAudio,
}) {
  return (
    <div className="space-y-4 h-full min-h-0 flex flex-col">
      <div className="glass-panel p-6 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">生成影片</h2>
            <p className="text-xs text-zinc-500 mt-1">基於圖片素材或文字提示詞生成影片（High / Low）。</p>
            <div className="mt-3 text-xs text-zinc-400">
              圖片素材（image_asset）：<span className="text-zinc-200 font-mono">{String(imageAsset || 'none')}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onSkipToAudio}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
          >
            已有素材跳過此階段
          </button>
        </div>
      </div>

      <div className="space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-zinc-300 mb-2">影片模型</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'kling', label: 'High' },
                { id: 'wan', label: 'Low' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVideoProvider(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs border ${
                    videoProvider === opt.id
                      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-zinc-300 mb-2">模式</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'image', label: '圖生影片（使用 image_asset）' },
                { id: 'text', label: '文生影片（忽略 image_asset）' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVideoMode(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs border ${
                    videoMode === opt.id
                      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-zinc-600 mt-2">
              當前 image_asset：<span className="text-zinc-400 font-mono break-all">{String(imageAsset || 'none')}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">時長（秒）</label>
              <input
                type="number"
                min="3"
                max="15"
                value={videoDuration}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setVideoDuration('');
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  const clamped = Math.min(15, Math.max(3, n));
                  setVideoDuration(String(clamped));
                }}
                className="input-field text-sm"
              />
              <p className="mt-1 text-[11px] text-zinc-500">支援範圍：3-15 秒</p>
            </div>

            {videoProvider === 'kling' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">畫面比例（aspect_ratio）</label>
                  {videoMode === 'text' ? (
                    <select value={klingAspectRatio} onChange={(e) => setKlingAspectRatio(e.target.value)} className="input-field text-sm">
                      {['16:9', '9:16', '1:1'].map((ar) => (
                        <option key={ar} value={ar}>{ar}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="input-field text-sm text-zinc-500 flex items-center">圖生影片模式不需要設定</div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">音訊</label>
                  <label className="min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-white/5 flex items-start gap-2 cursor-pointer select-none hover:bg-white/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={videoGenerateAudio}
                      onChange={(e) => setVideoGenerateAudio(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 bg-white/5"
                    />
                    <span className="leading-tight">
                      <span className="block text-sm text-zinc-200">生成音訊</span>
                      <span className="block text-[11px] text-zinc-500">(generate_audio)</span>
                    </span>
                  </label>
                </div>
                {videoMode === 'text' ? (
                  <div className="md:col-span-3" />
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">每秒幀數（fps）</label>
                  <input
                    type="number"
                    min="4"
                    max="60"
                    value={wanFps}
                    onChange={(e) => setWanFps(e.target.value)}
                    className="input-field text-sm"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">支援範圍：4-60</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">解析度（resolution）</label>
                  <select value={wanResolution} onChange={(e) => setWanResolution(e.target.value)} className="input-field text-sm">
                    {['480p', '580p', '720p'].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">畫面比例（aspect_ratio）</label>
                  <select value={wanAspectRatio} onChange={(e) => setWanAspectRatio(e.target.value)} className="input-field text-sm">
                    {['auto', '16:9', '9:16', '1:1'].map((ar) => (
                      <option key={ar} value={ar}>{ar}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 右側列：影片結果預覽 */
export function VideoStepResult({ videoAsset, videoResultUrl, isGenerating = false }) {
  return (
    <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] h-full min-h-0 flex flex-col relative">
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-white">影片結果</h3>
      </div>
      {!videoResultUrl ? (
        <div className="flex-1 min-h-[160px] flex items-center justify-center text-zinc-500 text-sm">
          暫無生成結果，提交後會在這裡展示影片（URL + 預覽）。
        </div>
      ) : (
        <div className="space-y-3 min-h-0 flex-1 flex flex-col">
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 flex-1 min-h-0">
            <video src={videoResultUrl} className="w-full h-full object-cover" controls />
          </div>
        </div>
      )}
      {isGenerating ? (
        <div className="absolute inset-0 z-10 bg-black/35 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3 rounded-[inherit]">
          <span className="h-8 w-8 rounded-full border-2 border-white/25 border-t-violet-400 animate-spin" />
          <span className="text-sm text-zinc-200">生成中...</span>
        </div>
      ) : null}
    </div>
  );
}

export default function VideoStep(props) {
  return (
    <div className="mt-6 space-y-6">
      <VideoStepConfig
        videoProvider={props.videoProvider}
        setVideoProvider={props.setVideoProvider}
        videoMode={props.videoMode}
        setVideoMode={props.setVideoMode}
        videoDuration={props.videoDuration}
        setVideoDuration={props.setVideoDuration}
        videoGenerateAudio={props.videoGenerateAudio}
        setVideoGenerateAudio={props.setVideoGenerateAudio}
        klingAspectRatio={props.klingAspectRatio}
        setKlingAspectRatio={props.setKlingAspectRatio}
        wanFps={props.wanFps}
        setWanFps={props.setWanFps}
        wanAspectRatio={props.wanAspectRatio}
        setWanAspectRatio={props.setWanAspectRatio}
        wanResolution={props.wanResolution}
        setWanResolution={props.setWanResolution}
        imageAsset={props.imageAsset}
        onSkipToAudio={props.onSkipToAudio}
      />
      <VideoStepResult
        videoAsset={props.videoAsset}
        videoResultUrl={props.videoResultUrl}
        isGenerating={props.isGenerating}
      />
    </div>
  );
}
