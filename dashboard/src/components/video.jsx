import React from 'react';

/** 中间列：生成视频参数 */
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
  klingNegativePrompt,
  setKlingNegativePrompt,
  klingCfgScale,
  setKlingCfgScale,
  wanFps,
  setWanFps,
  wanAspectRatio,
  setWanAspectRatio,
  wanNegativePrompt,
  setWanNegativePrompt,
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
            <h2 className="text-lg font-semibold text-white">生成视频</h2>
            <p className="text-xs text-zinc-500 mt-1">基于图片素材或文本提示词生成视频（Kling / WAN）。</p>
            <div className="mt-3 text-xs text-zinc-400">
              Image asset: <span className="text-zinc-200 font-mono">{String(imageAsset || 'none')}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onSkipToAudio}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
          >
            已有素材跳过此阶段
          </button>
        </div>
      </div>

      <div className="space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-zinc-300 mb-2">视频模型</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'kling', label: 'Kling v3' },
                { id: 'wan', label: 'WAN v2.2' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVideoProvider(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    videoProvider === opt.id
                      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-zinc-600 mt-2">
              说明：点击底部按钮会先走 Seed 改写提示词，再调用对应的视频生成接口。
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold text-zinc-300 mb-2">模式</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'image', label: '图生视频（使用 image_asset）' },
                { id: 'text', label: '文生视频（忽略 image_asset）' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVideoMode(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
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
              当前 image_asset：<span className="text-zinc-400 font-mono break-all">{String(imageAsset || 'none')}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">duration（秒）</label>
              <input
                type="number"
                min="1"
                max="10"
                value={videoDuration}
                onChange={(e) => setVideoDuration(e.target.value)}
                className="input-field text-sm"
              />
            </div>

            {videoProvider === 'kling' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">aspect_ratio（仅文生视频）</label>
                  <select value={klingAspectRatio} onChange={(e) => setKlingAspectRatio(e.target.value)} className="input-field text-sm">
                    {['16:9', '9:16', '1:1'].map((ar) => (
                      <option key={ar} value={ar}>{ar}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={videoGenerateAudio}
                      onChange={(e) => setVideoGenerateAudio(e.target.checked)}
                      className="rounded border-white/20 bg-white/5"
                    />
                    generate_audio
                  </label>
                </div>
                {videoMode === 'text' ? (
                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">negative_prompt</label>
                      <input
                        type="text"
                        value={klingNegativePrompt}
                        onChange={(e) => setKlingNegativePrompt(e.target.value)}
                        className="input-field text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">cfg_scale</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={klingCfgScale}
                        onChange={(e) => setKlingCfgScale(e.target.value)}
                        className="input-field text-sm"
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">frames_per_second</label>
                  <input
                    type="number"
                    min="4"
                    max="60"
                    value={wanFps}
                    onChange={(e) => setWanFps(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">resolution</label>
                  <select value={wanResolution} onChange={(e) => setWanResolution(e.target.value)} className="input-field text-sm">
                    {['480p', '580p', '720p'].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">aspect_ratio</label>
                  <select value={wanAspectRatio} onChange={(e) => setWanAspectRatio(e.target.value)} className="input-field text-sm">
                    {['auto', '16:9', '9:16', '1:1'].map((ar) => (
                      <option key={ar} value={ar}>{ar}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">negative_prompt</label>
                  <input
                    type="text"
                    value={wanNegativePrompt}
                    onChange={(e) => setWanNegativePrompt(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 右侧列：视频结果预览 */
export function VideoStepResult({ videoAsset, videoResultUrl }) {
  return (
    <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-white">视频结果</h3>
        <div className="text-[11px] text-zinc-500">
          video_asset：<span className="text-zinc-300 font-mono break-all">{String(videoAsset || 'none')}</span>
        </div>
      </div>
      {!videoResultUrl ? (
        <div className="flex-1 min-h-[160px] flex items-center justify-center text-zinc-500 text-sm">
          暂无生成结果，提交后会在这里展示视频（URL + 预览）。
        </div>
      ) : (
        <div className="space-y-3 min-h-0 flex-1 flex flex-col">
          <div className="text-xs text-zinc-300 break-all">
            URL：<a className="text-violet-300 hover:text-violet-200 underline" href={videoResultUrl} target="_blank" rel="noreferrer">{videoResultUrl}</a>
          </div>
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 flex-1 min-h-0">
            <video src={videoResultUrl} className="w-full h-full object-cover" controls />
          </div>
        </div>
      )}
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
        klingNegativePrompt={props.klingNegativePrompt}
        setKlingNegativePrompt={props.setKlingNegativePrompt}
        klingCfgScale={props.klingCfgScale}
        setKlingCfgScale={props.setKlingCfgScale}
        wanFps={props.wanFps}
        setWanFps={props.setWanFps}
        wanAspectRatio={props.wanAspectRatio}
        setWanAspectRatio={props.setWanAspectRatio}
        wanNegativePrompt={props.wanNegativePrompt}
        setWanNegativePrompt={props.setWanNegativePrompt}
        wanResolution={props.wanResolution}
        setWanResolution={props.setWanResolution}
        imageAsset={props.imageAsset}
        onSkipToAudio={props.onSkipToAudio}
      />
      <VideoStepResult videoAsset={props.videoAsset} videoResultUrl={props.videoResultUrl} />
    </div>
  );
}
