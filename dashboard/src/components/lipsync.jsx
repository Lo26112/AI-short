import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { getApiUrl } from '../config';

const SYNC_MODE_OPTIONS = ['cut_off', 'loop', 'bounce', 'silence', 'remap'];

export default function LipsyncStep({
  videoAsset,
  audioAsset,
  lipsyncVideoUrl,
  setLipsyncVideoUrl,
  lipsyncAudioUrl,
  setLipsyncAudioUrl,
  lipsyncSyncMode,
  setLipsyncSyncMode,
  lipsyncResultUrl,
  lipsyncGenerating,
  onGenerate,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [pickerItems, setPickerItems] = useState([]);
  const [pickerKind, setPickerKind] = useState('all');
  const [pickerTarget, setPickerTarget] = useState('video');

  const filteredItems = useMemo(() => (
    pickerItems.filter((asset) => {
      if (pickerTarget === 'video') return asset.type === 'video';
      if (pickerTarget === 'audio') return asset.type === 'audio' || asset.type === 'video';
      return true;
    }).filter((asset) => (pickerKind === 'all' ? true : asset.type === pickerKind))
  ), [pickerItems, pickerKind, pickerTarget]);

  const openPicker = async (target) => {
    setPickerTarget(target);
    setPickerKind(target === 'video' ? 'video' : 'all');
    setPickerOpen(true);
    setPickerLoading(true);
    setPickerError('');
    setPickerItems([]);
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets?kind=all&limit=300'));
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '載入素材失敗';
        throw new Error(detail);
      }
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const normalized = assets.map((asset) => {
        const name = String(asset?.name || '');
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const isAudio = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'].includes(ext);
        return isAudio ? { ...asset, type: 'audio' } : asset;
      });
      setPickerItems(normalized);
    } catch (err) {
      setPickerError(err.message || '載入素材失敗');
    } finally {
      setPickerLoading(false);
    }
  };

  const onUrlKeyDown = (e, target) => {
    if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openPicker(target);
    }
  };

  const pickAsset = (asset) => {
    const nextUrl = String(asset?.url || '').trim();
    if (!nextUrl) return;
    if (pickerTarget === 'video') setLipsyncVideoUrl(nextUrl);
    else setLipsyncAudioUrl(nextUrl);
    setPickerOpen(false);
  };

  return (
    <div className="h-full min-h-0">
      <div className="h-full min-h-0 flex flex-col lg:flex-row gap-4">
        <section className="lg:flex-[3] min-w-0 h-full min-h-0 flex flex-col overflow-hidden">
          <div className="glass-panel p-6 h-full min-h-0 flex flex-col">
            <div>
              <h2 className="text-lg font-semibold text-white">對口型</h2>
              <p className="text-xs text-zinc-500 mt-1">調用 sync-lipsync/v3，支援外部 URL 或素材庫 `@` 選擇。</p>
            </div>

            <div className="mt-4 space-y-4 overflow-y-auto custom-scrollbar pr-1">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-400">video_url</label>
                <input
                  value={lipsyncVideoUrl}
                  onChange={(e) => setLipsyncVideoUrl(e.target.value)}
                  onKeyDown={(e) => onUrlKeyDown(e, 'video')}
                  className="input-field text-sm"
                  placeholder="輸入視頻 URL，或鍵入 @ 從素材庫選擇"
                />
                <p className="text-[11px] text-zinc-600">當前上一步影片：{String(videoAsset || 'none')}</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-400">audio_url</label>
                <input
                  value={lipsyncAudioUrl}
                  onChange={(e) => setLipsyncAudioUrl(e.target.value)}
                  onKeyDown={(e) => onUrlKeyDown(e, 'audio')}
                  className="input-field text-sm"
                  placeholder="輸入音訊 URL，或鍵入 @ 從素材庫選擇"
                />
                <p className="text-[11px] text-zinc-600">當前上一步音訊：{String(audioAsset || 'none')}</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-400">sync_mode</label>
                <select
                  value={lipsyncSyncMode}
                  onChange={(e) => setLipsyncSyncMode(e.target.value)}
                  className="input-field text-sm"
                >
                  {SYNC_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={lipsyncGenerating || !lipsyncVideoUrl.trim() || !lipsyncAudioUrl.trim()}
              onClick={onGenerate}
              className="btn-primary mt-4 w-full py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {lipsyncGenerating ? '生成中...' : '開始對口型'}
            </button>
          </div>
        </section>

        <section className="lg:flex-[6] min-w-0 h-full min-h-0 flex flex-col overflow-hidden">
          <div className="glass-panel p-6 border border-dashed border-white/15 h-full min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">結果展示</h3>
              <span className="text-xs text-zinc-500">{lipsyncResultUrl ? '已生成 1 個結果' : '暫無結果'}</span>
            </div>

            {!lipsyncResultUrl ? (
              <div className="flex-1 min-h-[220px] flex items-center justify-center text-zinc-500 text-sm">
                提交後會在此處展示輸出視頻。
              </div>
            ) : (
              <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-white/10 bg-black/30">
                <video src={getApiUrl(lipsyncResultUrl)} controls className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        </section>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-[#18181b] border border-white/10 rounded-2xl p-5 w-full max-w-5xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white">選擇素材（填充 URL）</h3>
              <button type="button" onClick={() => setPickerOpen(false)} className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10">
                <X size={16} />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              {['all', 'image', 'video', 'audio'].map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setPickerKind(kind)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    pickerKind === kind
                      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>

            {pickerLoading ? (
              <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">載入素材中...</div>
            ) : pickerError ? (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{pickerError}</div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {filteredItems.length === 0 ? (
                  <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-4">未找到可用素材</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredItems.map((asset) => (
                      <button
                        key={asset.relative_path}
                        type="button"
                        onClick={() => pickAsset(asset)}
                        className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors overflow-hidden"
                      >
                        <div className="aspect-video bg-black/40 flex items-center justify-center">
                          {asset.type === 'image' ? (
                            <img src={getApiUrl(asset.url)} alt={asset.name} className="w-full h-full object-cover" />
                          ) : (
                            <video src={getApiUrl(asset.url)} className="w-full h-full object-cover" muted />
                          )}
                        </div>
                        <div className="p-2">
                          <div className="text-xs text-zinc-300 truncate">{asset.name}</div>
                          <div className="text-[10px] text-zinc-600 truncate">{asset.relative_path}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
