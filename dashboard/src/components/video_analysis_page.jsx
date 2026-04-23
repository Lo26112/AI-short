import React, { useMemo, useState } from 'react';
import { Clapperboard, Loader2, Sparkles, X } from 'lucide-react';
import { getApiUrl, getStaticAssetInlineUrl } from '../config';

function VideoAnalysisStep({
  urlInput,
  setUrlInput,
  prompt,
  setPrompt,
  detailedAnalysis,
  setDetailedAnalysis,
  selectedVideo,
  onRemoveSelectedVideo,
  onOpenAssetPicker,
  onRun,
  generating,
  result,
}) {
  const hasSelectedVideo = Boolean(selectedVideo?.url);
  const activeVideoUrl = String(urlInput || '').trim() || String(selectedVideo?.url || '').trim();
  const activeVideoSourceLabel = String(urlInput || '').trim() ? '手动输入 URL' : (selectedVideo ? '素材库视频' : '');

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row gap-4">
      <section className="lg:flex-[4] min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 overflow-y-auto custom-scrollbar">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">视频分析</h2>
            <p className="text-xs text-zinc-500 mt-1">输入问题并提交到 fal-ai/video-understanding，直接返回分析结果。</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
            <div className="text-xs font-semibold text-zinc-300">视频输入</div>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={hasSelectedVideo ? '已选择视频，请先删除' : 'https://...（可直接输入外部视频 URL）'}
              disabled={hasSelectedVideo}
              className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenAssetPicker}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-500/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 transition-colors shadow-[0_0_0_1px_rgba(139,92,246,0.2)]"
              >
                <Clapperboard size={13} />
                从素材库选择视频
              </button>
              <span className="text-[11px] text-zinc-500">优先使用手动输入 URL；为空时使用素材库视频。</span>
            </div>
            {hasSelectedVideo ? (
              <div className="text-[11px] text-amber-300">已选择视频，请先删除后再输入 URL。</div>
            ) : null}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Prompt</label>
            {activeVideoUrl ? (
              <div className="mb-2 rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="inline-flex items-center gap-1 mx-0.5 px-1 py-0.5 rounded bg-white/10 border border-white/15 align-middle">
                  <video src={activeVideoUrl} className="w-8 h-8 rounded object-cover" muted loop playsInline />
                  <span
                    style={{ background: 'rgba(139, 92, 246, 0.24)', border: '1px solid rgba(139, 92, 246, 0.6)', color: '#ddd6fe' }}
                    className="text-[10px] px-1 py-0.5 rounded"
                  >
                    @Video1
                  </span>
                  {hasSelectedVideo ? (
                    <button
                      type="button"
                      onClick={onRemoveSelectedVideo}
                      className="text-[10px] px-1 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                      title="删除已选择视频"
                    >
                      删除
                    </button>
                  ) : null}
                </div>
                <div className="mt-1 text-[11px] text-zinc-500 break-all">
                  {activeVideoSourceLabel}：{activeVideoUrl}
                </div>
              </div>
            ) : null}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="您可以输入您的需求，如：输出视频剧本和文案等。"
              className="input-field text-sm min-h-[120px]"
            />
          </div>

          <label className="min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-white/5 flex items-start gap-2 cursor-pointer select-none hover:bg-white/10 transition-colors">
            <input
              type="checkbox"
              checked={detailedAnalysis}
              onChange={(e) => setDetailedAnalysis(e.target.checked)}
              className="mt-0.5 rounded border-white/20 bg-white/5"
            />
            <span className="leading-tight">
              <span className="block text-sm text-zinc-200">详细分析</span>
              <span className="block text-[11px] text-zinc-500">(detailed_analysis)</span>
            </span>
          </label>

          <button
            type="button"
            disabled={generating || !prompt.trim() || (!urlInput.trim() && !selectedVideo?.url)}
            onClick={onRun}
            className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                开始分析
              </>
            )}
          </button>
        </div>
      </section>

      <section className="lg:flex-[7] min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 overflow-y-auto custom-scrollbar">
        <div className="space-y-3 h-full min-h-0 flex flex-col">
          <h3 className="text-sm font-semibold text-white">分析结果</h3>
          <div className="rounded-xl border border-white/10 bg-black/30 min-h-[420px] p-4 text-sm text-zinc-200 whitespace-pre-wrap break-words">
            {result || '暂无分析结果'}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function VideoAnalysisPage() {
  const [urlInput, setUrlInput] = useState('');
  const [prompt, setPrompt] = useState('');
  const [detailedAnalysis, setDetailedAnalysis] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');

  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerError, setAssetPickerError] = useState('');
  const [assetPickerItems, setAssetPickerItems] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);

  const openAssetPicker = async () => {
    setShowAssetPicker(true);
    setAssetPickerLoading(true);
    setAssetPickerError('');
    setAssetPickerItems([]);
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets?kind=video&limit=300'));
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '加载视频素材失败';
        throw new Error(detail);
      }
      setAssetPickerItems(Array.isArray(data.assets) ? data.assets : []);
    } catch (err) {
      setAssetPickerError(err.message || '加载视频素材失败');
    } finally {
      setAssetPickerLoading(false);
    }
  };

  const closeAssetPicker = () => {
    setShowAssetPicker(false);
    setAssetPickerError('');
  };

  const sortedVideos = useMemo(
    () => [...assetPickerItems].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    [assetPickerItems]
  );

  const handleRun = async () => {
    const promptText = String(prompt || '').trim();
    const manualUrl = String(urlInput || '').trim();
    const pickedUrl = String(selectedVideo?.url || '').trim();
    const finalVideoUrl = manualUrl || pickedUrl;
    if (!finalVideoUrl) throw new Error('请先输入视频 URL，或从素材库选择一个视频');
    if (!promptText) throw new Error('请输入视频分析问题');

    setGenerating(true);
    try {
      const response = await fetch(getApiUrl('/api/workbench/video-understanding'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: finalVideoUrl,
          prompt: promptText,
          detailed_analysis: Boolean(detailedAnalysis),
        }),
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        // ignore
      }
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      const output = String(data?.output || '').trim();
      if (!output) throw new Error('后端未返回 output');
      setResult(output);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full overflow-hidden p-4 md:p-6 w-full animate-[fadeIn_0.3s_ease-out]">
      <div className="glass-panel h-full p-4 md:p-6 flex flex-col min-h-0">
        <VideoAnalysisStep
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          prompt={prompt}
          setPrompt={setPrompt}
          detailedAnalysis={detailedAnalysis}
          setDetailedAnalysis={setDetailedAnalysis}
          selectedVideo={selectedVideo}
          onRemoveSelectedVideo={() => setSelectedVideo(null)}
          onOpenAssetPicker={openAssetPicker}
          onRun={async () => {
            try {
              await handleRun();
            } catch (err) {
              window.alert(err.message || '视频分析失败');
            }
          }}
          generating={generating}
          result={result}
        />
      </div>

      {showAssetPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={closeAssetPicker}>
          <div
            className="bg-[#18181b] border border-white/10 rounded-2xl p-5 w-full max-w-5xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-white">选择视频素材</h3>
                <p className="text-xs text-zinc-500 mt-1">仅显示视频资源</p>
              </div>
              <button type="button" onClick={closeAssetPicker} className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10">
                <X size={16} />
              </button>
            </div>

            {assetPickerLoading ? (
              <div className="flex-1 flex items-center justify-center text-zinc-400">
                <Loader2 className="animate-spin mr-2" size={16} />
                加载素材中...
              </div>
            ) : assetPickerError ? (
              <div className="flex-1 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{assetPickerError}</div>
            ) : sortedVideos.length === 0 ? (
              <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-4">未找到可用视频素材。</div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {sortedVideos.map((asset) => (
                  <button
                    key={asset.relative_path}
                    type="button"
                    onClick={() => {
                      setSelectedVideo(asset);
                      closeAssetPicker();
                    }}
                    className={`text-left rounded-xl border p-2 transition-colors ${
                      selectedVideo?.relative_path === asset.relative_path
                        ? 'border-violet-500/40 bg-violet-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-video">
                      <video
                        src={getStaticAssetInlineUrl(asset.relative_path)}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    </div>
                    <div className="mt-2 text-xs text-zinc-300 truncate">{asset.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{asset.relative_path}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
