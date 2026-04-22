import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, Plus, Trash2 } from 'lucide-react';

export default function Step5FaceEdit({
  onBack,
  prompt,
  promptEditorRef,
  onPromptInput,
  onPromptKeyDown,
  onPromptWheel,
  keepAudio,
  setKeepAudio,
  shotType,
  setShotType,
  elements,
  setElements,
  generating,
  resultUrl,
  onGenerate,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const addElement = () => {
    setElements((prev) => [...prev, { frontal_image_url: '', reference_image_urls_text: '' }]);
  };

  const updateElement = (index, key, value) => {
    setElements((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
  };

  const removeElement = (index) => {
    setElements((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row gap-4">
      <section className="lg:flex-[4] min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 overflow-y-auto custom-scrollbar">
        <div className="space-y-4">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            >
              <ChevronLeft size={14} />
              返回视频生成
            </button>
            <h2 className="text-lg font-semibold text-white">人脸替换</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">输入需求</label>
            <div
              ref={promptEditorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={onPromptInput}
              onKeyDown={onPromptKeyDown}
              onWheel={onPromptWheel}
              data-placeholder="例如：把@Video1中的男生替换成@Image1中的女生，保持场景与动作一致。"
              className="input-field min-h-[110px] max-h-[220px] overflow-y-auto text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              输入 <span className="font-mono text-zinc-300">@</span> 可从素材库插入占位符（如 <span className="font-mono text-zinc-300">@Video1</span>、<span className="font-mono text-zinc-300">@Image1</span>）。
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold text-zinc-300"
            >
              <span>高级</span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced ? (
              <div className="mt-3 space-y-3">
                <label className="min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-white/5 flex items-start gap-2 cursor-pointer select-none hover:bg-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={keepAudio}
                    onChange={(e) => setKeepAudio(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/5"
                  />
                  <span className="leading-tight">
                    <span className="block text-sm text-zinc-200">保留原视频音频</span>
                    <span className="block text-[11px] text-zinc-500">(keep_audio，默认 true)</span>
                  </span>
                </label>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">镜头类型（shot_type）</label>
                  <input
                    type="text"
                    value={shotType}
                    onChange={(e) => setShotType(e.target.value)}
                    placeholder="customize"
                    className="input-field text-sm"
                  />
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-300 font-semibold">Elements（可选）</div>
                    <button type="button" onClick={addElement} className="btn-secondary px-2 py-1 text-[11px] flex items-center gap-1">
                      <Plus size={12} />
                      添加
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {elements.length === 0 ? (
                      <div className="text-[11px] text-zinc-500">未配置 elements</div>
                    ) : (
                      elements.map((el, idx) => (
                        <div key={`el-${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-zinc-400">Element {idx + 1}</div>
                            <button type="button" onClick={() => removeElement(idx)} className="p-1 rounded text-zinc-500 hover:text-red-300 hover:bg-red-500/15">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={el.frontal_image_url}
                            onChange={(e) => updateElement(idx, 'frontal_image_url', e.target.value)}
                            placeholder="frontal_image_url（https:// 或 data:）"
                            className="input-field text-xs"
                          />
                          <input
                            type="text"
                            value={el.reference_image_urls_text}
                            onChange={(e) => updateElement(idx, 'reference_image_urls_text', e.target.value)}
                            placeholder="reference_image_urls，逗号分隔"
                            className="input-field text-xs"
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={generating || !prompt.trim()}
            onClick={onGenerate}
            className="btn-primary w-full py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {generating ? '处理中...' : '运行'}
          </button>
        </div>
      </section>

      <section className="lg:flex-[7] min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 overflow-y-auto custom-scrollbar">
        <div className="space-y-4 h-full min-h-0 flex flex-col">
          <div>
            <h3 className="text-sm font-semibold text-white">结果预览</h3>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 min-h-[420px] flex-1 overflow-hidden">
            {resultUrl ? (
              <div className="w-full h-full min-h-[420px] flex items-center justify-center bg-black">
                <video src={resultUrl} className="w-full h-full object-contain" controls />
              </div>
            ) : (
              <div className="h-full min-h-[420px] flex items-center justify-center text-sm text-zinc-500">暂无生成结果</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
