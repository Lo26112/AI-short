import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, CheckSquare, ChevronLeft, ChevronRight, FolderPlus, Loader2, Sparkles, X } from 'lucide-react';
import { getApiUrl } from '../config';

export default function TestTab() {
  const [project, setProject] = useState(null);
  // { slug, displayName, relativeDir, videosBaseUrl }

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [projectList, setProjectList] = useState([]);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [projectListError, setProjectListError] = useState('');

  // Wizard (like SaaShortsTab but simplified to 4 steps)
  const [step, setStep] = useState(0);

  const [model, setModel] = useState('low'); // 'low' | 'high'
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const [imageAsset, setImageAsset] = useState(null);
  const [videoAsset, setVideoAsset] = useState(null);
  const [audioAsset, setAudioAsset] = useState(null);
  const [selectedStaticAssets, setSelectedStaticAssets] = useState({
    0: { image: null, video: null },
    1: { image: null, video: null },
    2: { image: null, video: null },
    3: { image: null, video: null },
  });

  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetPickerTab, setAssetPickerTab] = useState('image'); // image | video
  const [assetPickerStep, setAssetPickerStep] = useState(0);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerError, setAssetPickerError] = useState('');
  const [assetPickerItems, setAssetPickerItems] = useState([]);
  const [assetPickerDraft, setAssetPickerDraft] = useState({ image: null, video: null });

  const fetchProjectList = useCallback(async () => {
    setProjectListLoading(true);
    setProjectListError('');
    try {
      const res = await fetch(getApiUrl('/api/workbench/projects?limit=300'));
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '加载项目列表失败';
        throw new Error(detail);
      }
      setProjectList(data.projects || []);
    } catch (err) {
      setProjectListError(err.message || '加载项目列表失败');
    } finally {
      setProjectListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!project) fetchProjectList();
  }, [project, fetchProjectList]);

  const modelCopy = useMemo(() => {
    if (model === 'low') {
      return {
        title: 'Low',
        badge: 'fast / cheaper',
        badgeClasses: 'text-green-400 bg-green-500/10',
        desc: 'Lower cost / faster generation. Good for quick iterations.',
      };
    }
    return {
      title: 'High',
      badge: 'best quality',
      badgeClasses: 'text-violet-400 bg-violet-500/10',
      desc: 'Higher quality / higher cost. Best results for final outputs.',
    };
  }, [model]);

  const steps = [
    { id: 0, title: '生成图片' },
    { id: 1, title: '生成视频' },
    { id: 2, title: '生成音频' },
    { id: 3, title: '对口型' },
  ];

  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const goNext = () => setStep((s) => Math.min(3, s + 1));

  const resetWizardState = () => {
    setStep(0);
    setPrompt('');
    setImageAsset(null);
    setVideoAsset(null);
    setAudioAsset(null);
    setSelectedStaticAssets({
      0: { image: null, video: null },
      1: { image: null, video: null },
      2: { image: null, video: null },
      3: { image: null, video: null },
    });
  };

  const leaveProject = () => {
    setProject(null);
    resetWizardState();
  };

  const openCreateModal = () => {
    setCreateError('');
    setCreateName('');
    setShowCreateModal(true);
  };

  const submitCreateProject = async (e) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) {
      setCreateError('请输入项目名称');
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    try {
      const res = await fetch(getApiUrl('/api/workbench/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const msg = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setProject({
        slug: data.slug,
        displayName: data.display_name || name,
        relativeDir: data.relative_dir,
        videosBaseUrl: data.videos_base_url,
      });
      resetWizardState();
      setShowCreateModal(false);
    } catch (err) {
      setCreateError(err.message || '创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const openAssetPicker = async (targetStep) => {
    setAssetPickerStep(targetStep);
    setAssetPickerTab('image');
    setAssetPickerDraft(selectedStaticAssets[targetStep] || { image: null, video: null });
    setShowAssetPicker(true);
    setAssetPickerLoading(true);
    setAssetPickerError('');
    setAssetPickerItems([]);
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets?kind=all&limit=300'));
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '加载素材失败';
        throw new Error(detail);
      }
      setAssetPickerItems(data.assets || []);
    } catch (err) {
      setAssetPickerError(err.message || '加载素材失败');
    } finally {
      setAssetPickerLoading(false);
    }
  };

  const closeAssetPicker = () => {
    setShowAssetPicker(false);
    setAssetPickerError('');
  };

  const toggleDraftAsset = (asset) => {
    setAssetPickerDraft((prev) => {
      const current = prev[assetPickerTab];
      if (current?.relative_path === asset.relative_path) {
        return { ...prev, [assetPickerTab]: null };
      }
      return { ...prev, [assetPickerTab]: asset };
    });
  };

  const confirmAssetPicker = () => {
    const nextSelected = {
      ...(selectedStaticAssets[assetPickerStep] || { image: null, video: null }),
      ...assetPickerDraft,
    };
    setSelectedStaticAssets((prev) => ({
      ...prev,
      [assetPickerStep]: nextSelected,
    }));

    // 与原有占位资产字段保持同步，便于后续流程沿用
    if (nextSelected.image) setImageAsset(nextSelected.image.url);
    if (nextSelected.video) setVideoAsset(nextSelected.video.url);

    const pathForContext = nextSelected.video?.relative_path || nextSelected.image?.relative_path;
    if (pathForContext) {
      const contextLine = `{${pathForContext}}`;
      setPrompt((prev) => {
        if (!prev?.trim()) return contextLine;
        if (prev.includes(contextLine)) return prev;
        return `${prev}${contextLine}`;
      });
    }

    closeAssetPicker();
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;

    setGenerating(true);
    try {
      if (step === 0) {
        console.log('[TestTab] generate image', { project: project?.slug, model, prompt });
        setImageAsset('image_ready');
        setStep(1);
      } else if (step === 1) {
        console.log('[TestTab] generate video', { project: project?.slug, model, prompt, imageAsset });
        setVideoAsset('video_ready');
        setStep(2);
      } else if (step === 2) {
        console.log('[TestTab] generate audio', { project: project?.slug, model, prompt });
        setAudioAsset('audio_ready');
        setStep(3);
      } else {
        console.log('[TestTab] lipsync', { project: project?.slug, model, prompt, videoAsset, audioAsset });
      }
      await new Promise((r) => setTimeout(r, 400));
    } finally {
      setGenerating(false);
    }
  };

  const renderAssetSelector = (targetStep) => {
    const picked = selectedStaticAssets[targetStep] || { image: null, video: null };
    return (
      <div className="mb-2">
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="block text-sm font-medium text-zinc-300">User prompt</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAssetPicker(targetStep)}
              className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 text-xs flex items-center gap-1"
              title="选择素材"
            >
              <CheckSquare size={13} />
              选择素材
            </button>
          </div>
        </div>
        {(picked.image || picked.video) && (
          <div className="mb-2 text-[11px] text-zinc-500 space-y-1">
            {picked.image && <div>图片素材：<span className="text-zinc-300">{picked.image.name}</span></div>}
            {picked.video && <div>视频素材：<span className="text-zinc-300">{picked.video.name}</span></div>}
          </div>
        )}
      </div>
    );
  };

  const renderBottomComposer = (targetStep, placeholder, buttonText, requirePrompt = true) => (
    <div className="border border-white/10 bg-[#141418]/90 backdrop-blur-md rounded-xl p-3">
      {renderAssetSelector(targetStep)}
      <div className="flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="input-field resize-none text-sm"
          placeholder={placeholder}
        />
        <button
          type="submit"
          disabled={generating || (requirePrompt && !prompt.trim())}
          className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              {buttonText}
            </>
          )}
        </button>
      </div>
    </div>
  );

  const composerConfigByStep = {
    0: { placeholder: 'Describe what you want the model to generate...', buttonText: 'Generate Image', requirePrompt: true },
    1: { placeholder: 'Describe what video you want...', buttonText: 'Generate Video', requirePrompt: true },
    2: { placeholder: 'Describe what audio/voiceover you want...', buttonText: 'Generate Audio', requirePrompt: true },
    3: { placeholder: 'Optional extra instructions for lipsync...', buttonText: 'Run Lipsync', requirePrompt: false },
  };

  /* ── 主页：未进入项目 ───────────────────────────────── */
  if (!project) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 w-full animate-[fadeIn_0.3s_ease-out]">
        <div className="glass-panel p-8 max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">工作台</h1>
              <p className="text-zinc-400 mt-2 text-sm">
                默认进入项目创建页。你可以新建项目，或点击下方书签进入历史项目。
              </p>
              <p className="text-[11px] text-zinc-600 mt-1">
                项目目录根路径：<span className="text-zinc-400 font-mono">output/projects</span>
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="btn-primary px-4 py-2 text-sm shrink-0 flex items-center gap-2"
            >
              <FolderPlus size={16} />
              创建项目
            </button>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Bookmark size={14} className="text-violet-400" />
                历史项目书签
              </h2>
              <button type="button" onClick={fetchProjectList} className="text-xs text-zinc-500 hover:text-zinc-300">
                刷新
              </button>
            </div>

            {projectListLoading ? (
              <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-4">加载项目中...</div>
            ) : projectListError ? (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">{projectListError}</div>
            ) : projectList.length === 0 ? (
              <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-6 text-center">
                暂无历史项目，点击右上角“创建项目”开始。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {projectList.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => {
                      setProject({
                        slug: item.slug,
                        displayName: item.display_name || item.slug,
                        relativeDir: item.relative_dir,
                        videosBaseUrl: item.videos_base_url,
                      });
                      resetWizardState();
                    }}
                    className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-200 truncate">{item.display_name || item.slug}</div>
                        <div className="text-[11px] text-zinc-500 font-mono truncate mt-1">{item.relative_dir}</div>
                      </div>
                      <ChevronRight size={15} className="text-zinc-600 shrink-0 mt-0.5" />
                    </div>
                    <div className="text-[11px] text-zinc-600 mt-2">
                      更新时间：{item.mtime ? new Date(item.mtime * 1000).toLocaleString() : '-'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showCreateModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => !createLoading && setShowCreateModal(false)}
          >
            <div
              className="bg-[#18181b] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">新建项目</h2>
                <button
                  type="button"
                  disabled={createLoading}
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={submitCreateProject} className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">项目名称</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="input-field"
                    placeholder="例如：春季促销短片"
                    autoFocus
                  />
                  <p className="text-[11px] text-zinc-600 mt-2">
                    服务器路径：<span className="font-mono text-zinc-500">output/projects/&lt;名称&gt;</span>（可通过环境变量 WORKBENCH_PROJECTS_ROOT 配置根目录）
                  </p>
                </div>
                {createError && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{createError}</div>
                )}
                <button
                  type="submit"
                  disabled={createLoading || !createName.trim()}
                  className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {createLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      创建中…
                    </>
                  ) : (
                    <>
                      <FolderPlus size={16} />
                      创建并进入
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── 已进入项目：四步向导 ───────────────────────────── */
  return (
    <div className="h-full overflow-hidden p-4 md:p-6 w-full animate-[fadeIn_0.3s_ease-out]">
      <div className="glass-panel h-full p-4 md:p-6">
        <div className="h-full flex flex-col lg:flex-row gap-4">
          {/* Left: vertical step navigation */}
          <aside className="lg:w-56 xl:w-64 shrink-0 border border-white/10 bg-white/5 rounded-2xl p-4 flex flex-col">
            <div>
              <h1 className="text-2xl font-bold text-white">工作台</h1>
              <p className="text-zinc-400 mt-1 text-sm">
                当前项目：<span className="text-zinc-200 font-semibold">{project.displayName}</span>
              </p>
              <p className="text-[11px] text-zinc-600 mt-1 font-mono break-all">
                {project.relativeDir}
              </p>
            </div>

            <div className="mt-5 space-y-2">
              {steps.map((s, idx) => {
                const active = s.id === step;
                const done = s.id < step;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                        : done
                          ? 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                          : 'border-white/10 bg-white/5 text-zinc-500 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border shrink-0 ${
                        active ? 'border-violet-500/40 bg-violet-500/10' : 'border-white/10 bg-black/20'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-sm font-semibold">{s.title}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 0}
                className="btn-secondary flex-1 px-3 py-2 text-xs flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={step === 3}
                className="btn-secondary flex-1 px-3 py-2 text-xs flex items-center justify-center gap-1 disabled:opacity-50"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
            <button type="button" onClick={leaveProject} className="btn-secondary mt-2 w-full px-4 py-2 text-sm">
              返回项目列表
            </button>
          </aside>

          {/* Right: step content */}
          <section className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">

        {/* ── Step 0: 生成图片 ────────────────────────────────── */}
        {step === 0 && (
          <div className="mt-6 space-y-6">
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">生成图片</h2>
                  <p className="text-xs text-zinc-500 mt-1">输入提示词，生成图片素材（占位）。</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImageAsset('provided');
                    setStep(1);
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
                >
                  已有素材跳过此阶段
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Model</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setModel('low')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    model === 'low'
                      ? 'border-green-500/50 bg-green-500/10 ring-1 ring-green-500/30'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-semibold ${model === 'low' ? 'text-green-300' : 'text-zinc-300'}`}>Low</span>
                    <span className="text-xs font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">fast</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">Lower cost / faster generation.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setModel('high')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    model === 'high'
                      ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-semibold ${model === 'high' ? 'text-violet-300' : 'text-zinc-300'}`}>High</span>
                    <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">quality</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">Best quality / higher cost.</p>
                </button>
              </div>

              <div className="mt-3 text-xs text-zinc-500">
                Selected: <span className="text-zinc-300 font-semibold">{modelCopy.title}</span>{' '}
                <span className={`ml-2 px-2 py-0.5 rounded-full border border-white/10 ${modelCopy.badgeClasses}`}>{modelCopy.badge}</span>
                <div className="mt-1 text-[11px] text-zinc-600">{modelCopy.desc}</div>
              </div>
            </div>

            <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] flex items-center justify-center text-zinc-500 text-sm">
              参数配置组件占位区（后续可在此添加参数表单）
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-6">
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">生成视频</h2>
                  <p className="text-xs text-zinc-500 mt-1">基于图片素材生成视频（占位）。</p>
                  <div className="mt-3 text-xs text-zinc-400">
                    Image asset: <span className="text-zinc-200 font-mono">{String(imageAsset || 'none')}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVideoAsset('provided');
                    setStep(2);
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
                >
                  已有素材跳过此阶段
                </button>
              </div>
            </div>

            <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] flex items-center justify-center text-zinc-500 text-sm">
              参数配置组件占位区（后续可在此添加参数表单）
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-6">
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">生成音频</h2>
                  <p className="text-xs text-zinc-500 mt-1">生成配音/音频素材（占位）。</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAudioAsset('provided');
                    setStep(3);
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
                >
                  已有素材跳过此阶段
                </button>
              </div>
            </div>

            <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px] flex items-center justify-center text-zinc-500 text-sm">
              参数配置组件占位区（后续可在此添加参数表单）
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 space-y-6">
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold text-white">对口型</h2>
              <p className="text-xs text-zinc-500 mt-1">将视频与音频做 lipsync 合成（占位）。</p>
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
              参数配置组件占位区（后续可在此添加参数表单）
            </div>
          </div>
        )}
          </div>

          <form onSubmit={handleGenerate} className="pt-3">
            {renderBottomComposer(
              step,
              composerConfigByStep[step].placeholder,
              composerConfigByStep[step].buttonText,
              composerConfigByStep[step].requirePrompt
            )}
          </form>

        {showAssetPicker && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={closeAssetPicker}
          >
            <div
              className="bg-[#18181b] border border-white/10 rounded-2xl p-5 w-full max-w-5xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-white">
                    选择素材
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    本地静态资源目录：通过服务端配置的 WORKBENCH_ASSETS_ROOT
                  </p>
                </div>
                <button type="button" onClick={closeAssetPicker} className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>

              <div className="mb-3 flex items-center gap-2">
                {['image', 'video'].map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setAssetPickerTab(kind)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      assetPickerTab === kind
                        ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    {kind === 'image' ? '图片' : '视频'}
                  </button>
                ))}
                <div className="ml-auto text-[11px] text-zinc-500">
                  已选：
                  {assetPickerDraft.image ? <span className="text-zinc-300 ml-1">图片</span> : null}
                  {assetPickerDraft.video ? <span className="text-zinc-300 ml-1">视频</span> : null}
                </div>
              </div>

              {assetPickerLoading ? (
                <div className="flex-1 flex items-center justify-center text-zinc-400">
                  <Loader2 className="animate-spin mr-2" size={16} />
                  加载素材中...
                </div>
              ) : assetPickerError ? (
                <div className="flex-1 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{assetPickerError}</div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                  {assetPickerItems.filter((a) => a.type === assetPickerTab).length === 0 ? (
                    <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-4">
                      未找到可用{assetPickerTab === 'image' ? '图片' : '视频'}素材，请先将文件放到静态素材文件夹。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {assetPickerItems
                        .filter((asset) => asset.type === assetPickerTab)
                        .map((asset) => {
                          const checked = assetPickerDraft[assetPickerTab]?.relative_path === asset.relative_path;
                          return (
                        <button
                          key={asset.relative_path}
                          type="button"
                          onClick={() => toggleDraftAsset(asset)}
                          className={`text-left rounded-xl border transition-colors overflow-hidden ${
                            checked
                              ? 'border-violet-500/40 bg-violet-500/10'
                              : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <div className="aspect-video bg-black/40 flex items-center justify-center">
                            {asset.type === 'image' ? (
                              <img src={getApiUrl(asset.url)} alt={asset.name} className="w-full h-full object-cover" />
                            ) : (
                              <video src={getApiUrl(asset.url)} className="w-full h-full object-cover" muted />
                            )}
                          </div>
                          <div className="p-2">
                            <div className="text-xs text-zinc-300 truncate flex items-center justify-between gap-2">
                              <span className="truncate">{asset.name}</span>
                              <span className={`w-4 h-4 rounded border text-[10px] flex items-center justify-center shrink-0 ${
                                checked ? 'border-violet-400 text-violet-300 bg-violet-500/10' : 'border-zinc-600 text-transparent'
                              }`}>✓</span>
                            </div>
                            <div className="text-[10px] text-zinc-600 truncate">{asset.relative_path}</div>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAssetPicker}
                  className="btn-secondary px-4 py-2 text-xs"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmAssetPicker}
                  className="btn-primary px-4 py-2 text-xs"
                >
                  确定并插入上下文
                </button>
              </div>
            </div>
          </div>
        )}
          </section>
        </div>
      </div>
    </div>
  );
}
