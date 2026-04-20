import React from 'react';
import { getApiUrl } from '../config';

export const NANO_BANANA2_ASPECT_RATIOS = [
  'auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8',
];

export const NANO_BANANA2_DEFAULTS = {
  num_images: 1,
  aspect_ratio: 'auto',
  output_format: 'png',
  resolution: '0.5K',
  enable_web_search: false,
  thinking_level: '',
};

function getPictureGridTileClass(count, idx) {
  if (count === 3 && idx === 0) return 'col-span-2';
  return '';
}

/** 左侧：生图参数配置 */
export function PictureStepConfig({
  nanoBanana2,
  setNanoBanana2,
  onSkipToVideo,
}) {
  return (
    <div className="glass-panel p-6 h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white">生成图片</h2>
          <p className="text-xs text-zinc-500 mt-1">输入提示词，配置生图参数。</p>
        </div>
        <button
          type="button"
          onClick={onSkipToVideo}
          className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
        >
          已有素材跳过此阶段
        </button>
      </div>
      <div className="mt-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-[140px]">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">num_images</label>
                <select
                  value={nanoBanana2.num_images}
                  onChange={(e) => setNanoBanana2((p) => ({ ...p, num_images: Number(e.target.value) }))}
                  className="input-field text-sm"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">aspect_ratio</label>
                <select
                  value={nanoBanana2.aspect_ratio}
                  onChange={(e) => setNanoBanana2((p) => ({ ...p, aspect_ratio: e.target.value }))}
                  className="input-field text-sm"
                >
                  {NANO_BANANA2_ASPECT_RATIOS.map((ar) => (
                    <option key={ar} value={ar}>{ar}</option>
                  ))}
                </select>
              </div>
              <div className="w-[160px]">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">output_format</label>
                <select
                  value={nanoBanana2.output_format}
                  onChange={(e) => setNanoBanana2((p) => ({ ...p, output_format: e.target.value }))}
                  className="input-field text-sm"
                >
                  <option value="png">png</option>
                  <option value="jpeg">jpeg</option>
                  <option value="webp">webp</option>
                </select>
              </div>
              <div className="w-[140px]">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">resolution</label>
                <select
                  value={nanoBanana2.resolution}
                  onChange={(e) => setNanoBanana2((p) => ({ ...p, resolution: e.target.value }))}
                  className="input-field text-sm"
                >
                  <option value="0.5K">0.5K</option>
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={nanoBanana2.enable_web_search}
                  onChange={(e) => setNanoBanana2((p) => ({ ...p, enable_web_search: e.target.checked }))}
                  className="rounded border-white/20 bg-white/5"
                />
                enable_web_search
              </label>
              <div className="w-[220px]">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">thinking_level</label>
                <select
                  value={nanoBanana2.thinking_level}
                  onChange={(e) => setNanoBanana2((p) => ({ ...p, thinking_level: e.target.value }))}
                  className="input-field text-sm w-full"
                >
                  <option value="">null</option>
                  <option value="minimal">minimal</option>
                  <option value="high">high</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 右侧：结果预览 */
export function PictureStepResult({ step0GeneratedImageUrls, onPreviewOutput }) {
  const count = step0GeneratedImageUrls.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
  return (
    <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-white">结果预览</h3>
        <span className="text-xs text-zinc-500">输出 {step0GeneratedImageUrls.length} 张</span>
      </div>
      {step0GeneratedImageUrls.length === 0 ? (
        <div className="flex-1 min-h-[160px] flex items-center justify-center text-zinc-500 text-sm">
          暂无生成结果，提交后会在这里展示图片。
        </div>
      ) : count === 1 ? (
        <button
          type="button"
          onClick={() => {
            const url = step0GeneratedImageUrls[0];
            onPreviewOutput({ name: 'output_1', relative_path: url, url });
          }}
          className="flex-1 min-h-0 rounded-lg overflow-hidden border border-white/10 bg-black/30 hover:border-violet-400/50 transition-colors flex items-center justify-center"
          title="预览第 1 张"
        >
          <img src={getApiUrl(step0GeneratedImageUrls[0])} alt="output_1" className="w-full h-full object-contain" />
        </button>
      ) : (
        <div
          className="grid gap-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: 'minmax(120px, 1fr)',
          }}
        >
          {step0GeneratedImageUrls.map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              type="button"
              onClick={() => onPreviewOutput({ name: `output_${idx + 1}`, relative_path: url, url })}
              className={`h-full min-h-[120px] rounded-lg overflow-hidden border border-white/10 bg-black/30 hover:border-violet-400/50 transition-colors flex items-center justify-center ${getPictureGridTileClass(count, idx)}`}
              title={`预览第 ${idx + 1} 张`}
            >
              <img src={getApiUrl(url)} alt={`output_${idx + 1}`} className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 兼容：单列堆叠（未使用时可删） */
export default function PictureStep(props) {
  return (
    <div className="mt-6 space-y-6">
      <PictureStepConfig
        nanoBanana2={props.nanoBanana2}
        setNanoBanana2={props.setNanoBanana2}
        onSkipToVideo={props.onSkipToVideo}
      />
      <PictureStepResult
        step0GeneratedImageUrls={props.step0GeneratedImageUrls}
        onPreviewOutput={props.onPreviewOutput}
      />
    </div>
  );
}
