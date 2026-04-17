import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, CheckSquare, ChevronLeft, ChevronRight, FolderPlus, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { getApiUrl } from '../config';

function sanitizeWorkbenchProjectFolderName(name) {
  const raw = (name || '').trim();
  if (!raw) return null;
  if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) return null;
  let safe = raw.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  safe = safe.replace(/\s+/g, ' ').trim();
  if (safe.length > 120) safe = safe.slice(0, 120).trimEnd();
  safe = safe.replace(/^[ .]+|[ .]+$/g, '');
  if (!safe) return null;
  return safe;
}

const NANO_BANANA2_ASPECT_RATIOS = [
  'auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8',
];

const NANO_BANANA2_DEFAULTS = {
  num_images: 1,
  aspect_ratio: 'auto',
  output_format: 'png',
  resolution: '1K',
  enable_web_search: false,
  thinking_level: '',
};

const ELEMENT_BADGE_COLORS = [
  { bg: 'rgba(139, 92, 246, 0.24)', border: 'rgba(139, 92, 246, 0.6)', text: '#ddd6fe' }, // violet
  { bg: 'rgba(217, 70, 239, 0.2)', border: 'rgba(217, 70, 239, 0.55)', text: '#f5d0fe' }, // fuchsia
  { bg: 'rgba(59, 130, 246, 0.22)', border: 'rgba(59, 130, 246, 0.55)', text: '#bfdbfe' }, // blue
  { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgba(16, 185, 129, 0.55)', text: '#a7f3d0' }, // emerald
  { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgba(245, 158, 11, 0.55)', text: '#fde68a' }, // amber
  { bg: 'rgba(244, 63, 94, 0.2)', border: 'rgba(244, 63, 94, 0.55)', text: '#fecdd3' }, // rose
];

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
  const [deletingProjectSlug, setDeletingProjectSlug] = useState(null);

  // Workbench wizard state
  const [step, setStep] = useState(0);

  const [model] = useState('low'); // 'low' | 'high'
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const [imageAsset, setImageAsset] = useState(null);
  const [videoAsset, setVideoAsset] = useState(null);
  const [audioAsset, setAudioAsset] = useState(null);
  const [selectedStaticAssets, setSelectedStaticAssets] = useState({
    0: { images: [], video: null },
    1: { images: [], video: null },
    2: { images: [], video: null },
    3: { images: [], video: null },
  });

  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetPickerTab, setAssetPickerTab] = useState('all'); // all | image | video
  const [assetPickerStep, setAssetPickerStep] = useState(0);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerError, setAssetPickerError] = useState('');
  const [assetPickerItems, setAssetPickerItems] = useState([]);
  const [assetPickerDraft, setAssetPickerDraft] = useState({ images: [], video: null });
  const [isMentionPicker, setIsMentionPicker] = useState(false);
  const [mentionInsertPos, setMentionInsertPos] = useState(null);
  const [previewAsset, setPreviewAsset] = useState(null);
  const promptEditorRef = useRef(null);

  /** fal-ai/nano-banana-2 (step 0) — user-facing fields; server merges the rest. */
  const [nanoBanana2, setNanoBanana2] = useState({ ...NANO_BANANA2_DEFAULTS });
  const [step0GeneratedImageUrls, setStep0GeneratedImageUrls] = useState([]);
  const [promptElements, setPromptElements] = useState([]);
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
      0: { images: [], video: null },
      1: { images: [], video: null },
      2: { images: [], video: null },
      3: { images: [], video: null },
    });
    setNanoBanana2({ ...NANO_BANANA2_DEFAULTS });
    setStep0GeneratedImageUrls([]);
    setPromptElements([]);
  };

  const leaveProject = () => {
    setProject(null);
    resetWizardState();
  };

  const deleteProject = async (item) => {
    if (!item?.slug) return;
    const confirmed = window.confirm(`确定删除项目「${item.display_name || item.slug}」吗？此操作不可恢复。`);
    if (!confirmed) return;

    setDeletingProjectSlug(item.slug);
    try {
      const res = await fetch(getApiUrl(`/api/workbench/projects/${encodeURIComponent(item.slug)}`), {
        method: 'DELETE',
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '删除项目失败';
        throw new Error(detail);
      }

      if (project?.slug === item.slug) {
        leaveProject();
      }
      await fetchProjectList();
    } catch (err) {
      window.alert(err.message || '删除项目失败');
    } finally {
      setDeletingProjectSlug(null);
    }
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
    const folderName = sanitizeWorkbenchProjectFolderName(name);
    if (!folderName) {
      window.alert('项目名称不合法，请换一个名称重试。');
      setCreateError('项目名称不合法，请换一个名称重试。');
      return;
    }
    if (Array.isArray(projectList) && projectList.some((p) => (p?.slug || '').trim() === folderName)) {
      window.alert('已存在该名称的项目，请换一个名称重试。');
      setCreateError('已存在该名称的项目，请换一个名称重试。');
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
    setAssetPickerTab('all');
    setAssetPickerDraft(selectedStaticAssets[targetStep] || { images: [], video: null });
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

  const openMentionAssetPicker = async (insertPos) => {
    setIsMentionPicker(true);
    setMentionInsertPos(insertPos);
    setAssetPickerTab('image');
    setShowAssetPicker(true);
    setAssetPickerLoading(true);
    setAssetPickerError('');
    setAssetPickerItems([]);
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets?kind=image&limit=300'));
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '加载图片素材失败';
        throw new Error(detail);
      }
      setAssetPickerItems(data.assets || []);
    } catch (err) {
      setAssetPickerError(err.message || '加载图片素材失败');
    } finally {
      setAssetPickerLoading(false);
    }
  };

  const closeAssetPicker = () => {
    setShowAssetPicker(false);
    setAssetPickerError('');
    setIsMentionPicker(false);
    setMentionInsertPos(null);
  };

  const syncContextSelectionToBackend = async (targetStep, urls) => {
    try {
      const response = await fetch(getApiUrl('/api/generalprompt/context-selection'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: targetStep,
          project_slug: project?.slug || null,
          context_image_urls: urls,
        }),
      });
      if (!response.ok) {
        let responseData = {};
        try {
          responseData = await response.json();
        } catch {
          /* ignore json parse errors */
        }
        const detail = typeof responseData?.detail === 'string' ? responseData.detail : `HTTP ${response.status}`;
        throw new Error(detail);
      }
    } catch (err) {
      console.error('[TestTab] syncContextSelectionToBackend failed', err);
    }
  };

  const openPreviewAsset = (asset) => {
    setPreviewAsset(asset || null);
  };

  const closePreviewAsset = () => {
    setPreviewAsset(null);
  };

  const serializePromptFromEditor = (root) => {
    if (!root) return '';
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const token = node.getAttribute('data-token');
      if (token) return token;
      let out = '';
      node.childNodes.forEach((child) => {
        out += walk(child);
      });
      return out;
    };
    return walk(root);
  };

  const getCaretTextOffset = (root) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return (prompt || '').length;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.endContainer)) return (prompt || '').length;
    const preRange = range.cloneRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  };

  const escapeHtml = (text) => String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const buildPromptEditorHTML = (text) => {
    const tokenRegex = /Elements\[(\d+)\]/g;
    let html = '';
    let lastIndex = 0;
    let match = tokenRegex.exec(text);
    while (match) {
      const full = match[0];
      const idx = Number(match[1]);
      const element = promptElements[idx];
      html += escapeHtml(text.slice(lastIndex, match.index));
      if (element?.url) {
        const color = element.color || ELEMENT_BADGE_COLORS[idx % ELEMENT_BADGE_COLORS.length];
        html += `<span contenteditable="false" data-token="${full}" class="inline-flex items-center gap-1 mx-0.5 px-1 py-0.5 rounded bg-white/10 border border-white/15 align-middle">
  <img src="${escapeHtml(getApiUrl(element.url))}" alt="${escapeHtml(element.name || full)}" class="w-8 h-8 rounded object-cover" />
  <span style="background:${color.bg};border:1px solid ${color.border};color:${color.text}" class="text-[10px] px-1 py-0.5 rounded">${escapeHtml(full)}</span>
</span>`;
      } else {
        html += `<span contenteditable="false" data-token="${full}" class="inline-flex items-center mx-0.5 px-1 py-0.5 rounded bg-white/10 border border-white/15 text-[10px] text-zinc-300">${escapeHtml(full)}</span>`;
      }
      lastIndex = match.index + full.length;
      match = tokenRegex.exec(text);
    }
    html += escapeHtml(text.slice(lastIndex));
    return html.replaceAll('\n', '<br>');
  };

  useEffect(() => {
    const editor = promptEditorRef.current;
    if (!editor) return;
    const current = serializePromptFromEditor(editor);
    if (current === (prompt || '')) return;
    editor.innerHTML = buildPromptEditorHTML(prompt || '');
  }, [prompt, promptElements]);

  const removePromptElement = async (removeIndex) => {
    setPrompt((prev) => {
      let next = prev.replaceAll(`Elements[${removeIndex}]`, '');
      for (let i = removeIndex + 1; i <= promptElements.length - 1; i += 1) {
        next = next.replaceAll(`Elements[${i}]`, `Elements[${i - 1}]`);
      }
      return next;
    });
    const nextElements = promptElements
      .filter((item) => item.index !== removeIndex)
      .map((item, idx) => ({ ...item, index: idx }));
    setPromptElements(nextElements);
    await syncContextSelectionToBackend(step, nextElements.map((item) => item.url));
  };

  const handleMentionAssetSelect = async (asset) => {
    const insertPos = mentionInsertPos ?? prompt.length;
    const nextIndex = promptElements.length;
    const token = `Elements[${nextIndex}]`;
    setPrompt((prev) => `${prev.slice(0, insertPos)}${token}${prev.slice(insertPos)}`);
    const nextElements = [
      ...promptElements,
      {
        index: nextIndex,
        name: asset.name,
        relative_path: asset.relative_path,
        url: asset.url,
        color: ELEMENT_BADGE_COLORS[Math.floor(Math.random() * ELEMENT_BADGE_COLORS.length)],
      },
    ];
    setPromptElements(nextElements);
    await syncContextSelectionToBackend(step, nextElements.map((item) => item.url));
    closeAssetPicker();
  };

  const toggleDraftAsset = (asset) => {
    const targetKey = assetPickerTab === 'all' ? asset.type : assetPickerTab;
    setAssetPickerDraft((prev) => {
      if (targetKey === 'image') {
        const currentImages = Array.isArray(prev.images) ? prev.images : [];
        const exists = currentImages.some((item) => item.relative_path === asset.relative_path);
        return {
          ...prev,
          images: exists
            ? currentImages.filter((item) => item.relative_path !== asset.relative_path)
            : [...currentImages, asset],
        };
      }

      const currentVideo = prev.video;
      if (currentVideo?.relative_path === asset.relative_path) {
        return { ...prev, video: null };
      }
      return { ...prev, video: asset };
    });
  };

  const confirmAssetPicker = async () => {
    const nextSelected = {
      ...(selectedStaticAssets[assetPickerStep] || { images: [], video: null }),
      ...assetPickerDraft,
      images: Array.isArray(assetPickerDraft.images) ? assetPickerDraft.images : [],
    };
    setSelectedStaticAssets((prev) => ({
      ...prev,
      [assetPickerStep]: nextSelected,
    }));

    // 与原有占位资产字段保持同步，便于后续流程沿用
    if (nextSelected.images.length > 0) setImageAsset(nextSelected.images[0].url);
    if (nextSelected.video) setVideoAsset(nextSelected.video.url);

    await syncContextSelectionToBackend(
      assetPickerStep,
      nextSelected.images.map((asset) => asset.url).filter(Boolean),
    );

    closeAssetPicker();
  };

  const removeSelectedImage = async (targetStep, relativePath) => {
    const current = selectedStaticAssets[targetStep] || { images: [], video: null };
    const nextImages = (current.images || []).filter((img) => img.relative_path !== relativePath);
    const nextUrls = nextImages.map((img) => img.url).filter(Boolean);

    setSelectedStaticAssets((prev) => ({
      ...prev,
      [targetStep]: {
        ...(prev[targetStep] || { images: [], video: null }),
        images: nextImages,
      },
    }));

    if (nextUrls.length > 0) setImageAsset(nextUrls[0]);
    else if (targetStep === 0 || targetStep === 1) setImageAsset(null);

    // If the preview is currently showing the removed asset, close it.
    if (previewAsset?.relative_path === relativePath) closePreviewAsset();

    await syncContextSelectionToBackend(targetStep, nextUrls);
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (step > 1) return;
    if (!prompt.trim()) return;

    setGenerating(true);
    try {
      const requestPayload = {
        step,
        prompt,
        project_slug: project?.slug || null,
        model,
        image_asset: imageAsset,
        video_asset: videoAsset,
        audio_asset: audioAsset,
        context_image_urls: promptElements.map((item) => item.url).filter(Boolean),
        prompt_element_urls: promptElements.map((item) => item.url).filter(Boolean),
      };

      if (step === 0) {
        const nb = {
          num_images: nanoBanana2.num_images,
          aspect_ratio: nanoBanana2.aspect_ratio,
          output_format: nanoBanana2.output_format,
          resolution: nanoBanana2.resolution,
          enable_web_search: nanoBanana2.enable_web_search,
        };
        if (nanoBanana2.thinking_level === 'minimal' || nanoBanana2.thinking_level === 'high') {
          nb.thinking_level = nanoBanana2.thinking_level;
        }
        requestPayload.nano_banana_2 = nb;
      }

      const response = await fetch(getApiUrl('/api/generalprompt/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      let responseData = {};
      try {
        responseData = await response.json();
      } catch {
        /* ignore json parse errors */
      }

      if (!response.ok) {
        const detail = typeof responseData?.detail === 'string' ? responseData.detail : `HTTP ${response.status}`;
        throw new Error(detail);
      }

      console.log('[TestTab] prompt generated', responseData);

      if (step === 0) {
        console.log('[TestTab] nano-banana-2 (step 生成图片)', {
          project: project?.slug,
          model,
          seedPromptForNano: responseData.generated_prompt,
          userPromptForSeed: prompt,
          imageAsset,
          nano_banana_image_urls: responseData.nano_banana_image_urls,
          nano_banana_description: responseData.nano_banana_description,
        });
        const outputUrls = Array.isArray(responseData.nano_banana_image_urls)
          ? responseData.nano_banana_image_urls.filter(Boolean)
          : [];
        setStep0GeneratedImageUrls(outputUrls);
        setImageAsset(outputUrls[0] || 'image_ready');
      } else if (step === 1) {
        console.log('[TestTab] generate video (seed only)', { project: project?.slug, model, prompt: responseData.generated_prompt || prompt });
        setVideoAsset('video_ready');
      } else if (step === 2) {
        console.log('[TestTab] generate audio', { project: project?.slug, model, prompt: responseData.generated_prompt || prompt });
        setAudioAsset('audio_ready');
      } else {
        console.log('[TestTab] lipsync', { project: project?.slug, model, prompt: responseData.generated_prompt || prompt, videoAsset, audioAsset });
      }
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      window.alert(err.message || '发送失败');
    } finally {
      setGenerating(false);
    }
  };

  const handlePromptKeyDown = (event) => {
    if (event.key === '@' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const pos = getCaretTextOffset(promptEditorRef.current);
      openMentionAssetPicker(pos);
      return;
    }

    if (event.key !== 'Enter' || event.isComposing) return;

    // Ctrl+Enter: force newline at caret position
    if (event.ctrlKey) {
      event.preventDefault();
      document.execCommand('insertLineBreak');
      const editor = promptEditorRef.current;
      setPrompt(serializePromptFromEditor(editor));
      return;
    }

    event.preventDefault();
    const form = event.currentTarget.closest('form');
    form?.requestSubmit();
  };

  const renderBottomComposer = (targetStep, placeholder, buttonText, requirePrompt = true, showPromptTextarea = true) => (
    <div className="border border-white/10 bg-[#141418]/90 backdrop-blur-md rounded-xl p-3">
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-zinc-500">
          提示：输入 <span className="font-mono text-zinc-400">@</span> 可引用素材库图片（会插入 <span className="font-mono text-zinc-400">图片素材</span>）。
        </div>
        {showPromptTextarea ? (
          <div
            ref={promptEditorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => setPrompt(serializePromptFromEditor(promptEditorRef.current))}
            onKeyDown={handlePromptKeyDown}
            data-placeholder={placeholder}
            className="input-field min-h-[72px] max-h-[180px] overflow-y-auto text-sm whitespace-pre-wrap break-words"
          />
        ) : null}
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
    0: {
      placeholder: '描述需求（先由 Seed 改写，改写结果将作为 Nano Banana 2 的 prompt）…',
      buttonText: 'Seed改写并生成图片',
      requirePrompt: true,
    },
    1: { placeholder: 'Describe what video you want（仅 Seed 改写为视频提示词）…', buttonText: 'Generate Video Prompt', requirePrompt: true },
  };

  const renderNanoBanana2ParameterPanel = () => (
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
  );

  const renderStep0ResultPreview = () => (
    <div className="glass-panel p-6 border border-dashed border-white/15 min-h-[220px]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-white">结果预览</h3>
        <span className="text-xs text-zinc-500">输出 {step0GeneratedImageUrls.length} 张</span>
      </div>
      {step0GeneratedImageUrls.length === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-zinc-500 text-sm">
          暂无生成结果，提交后会在这里展示图片。
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {step0GeneratedImageUrls.map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              type="button"
              onClick={() => openPreviewAsset({ name: `output_${idx + 1}`, relative_path: url, url })}
              className="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/30 hover:border-violet-400/50 transition-colors"
              title={`预览第 ${idx + 1} 张`}
            >
              <img src={getApiUrl(url)} alt={`output_${idx + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

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
                  <div
                    key={item.slug}
                    className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
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
                        className="min-w-0 text-left flex-1"
                      >
                        <div className="text-sm font-semibold text-zinc-200 truncate">{item.display_name || item.slug}</div>
                        <div className="text-[11px] text-zinc-500 font-mono truncate mt-1">{item.relative_dir}</div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={deletingProjectSlug === item.slug}
                          onClick={() => deleteProject(item)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                          title="删除项目"
                        >
                          {deletingProjectSlug === item.slug ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                        <ChevronRight size={15} className="text-zinc-600 mt-0.5" />
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-600 mt-2">
                      更新时间：{item.mtime ? new Date(item.mtime * 1000).toLocaleString() : '-'}
                    </div>
                  </div>
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
                  <p className="text-xs text-zinc-500 mt-1">输入提示词，配置生图参数。</p>
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
              <div className="mt-4">
                {renderNanoBanana2ParameterPanel()}
              </div>
            </div>

            {renderStep0ResultPreview()}
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

          {step <= 1 && (
            <form onSubmit={handleGenerate} className="pt-3">
              {renderBottomComposer(
                step,
                composerConfigByStep[step].placeholder,
                composerConfigByStep[step].buttonText,
                composerConfigByStep[step].requirePrompt,
                true
              )}
            </form>
          )}

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
                    {isMentionPicker ? '选择图片素材（插入 Elements）' : '选择素材'}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    本地静态资源目录：通过服务端配置的 WORKBENCH_ASSETS_ROOT
                  </p>
                </div>
                <button type="button" onClick={closeAssetPicker} className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>

              {!isMentionPicker && (
              <div className="mb-3 flex items-center gap-2">
                {['all', 'image', 'video'].map((kind) => (
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
                    {kind === 'all' ? '全部' : kind === 'image' ? '图片' : '视频'}
                  </button>
                ))}
                <div className="ml-auto text-[11px] text-zinc-500">
                  已选：
                  {assetPickerDraft.images?.length ? <span className="text-zinc-300 ml-1">图片 {assetPickerDraft.images.length}</span> : null}
                  {assetPickerDraft.video ? <span className="text-zinc-300 ml-1">视频</span> : null}
                </div>
              </div>
              )}

              {assetPickerLoading ? (
                <div className="flex-1 flex items-center justify-center text-zinc-400">
                  <Loader2 className="animate-spin mr-2" size={16} />
                  加载素材中...
                </div>
              ) : assetPickerError ? (
                <div className="flex-1 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{assetPickerError}</div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                  {assetPickerItems.filter((a) => isMentionPicker ? a.type === 'image' : (assetPickerTab === 'all' || a.type === assetPickerTab)).length === 0 ? (
                    <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-4">
                      未找到可用{isMentionPicker ? '图片' : (assetPickerTab === 'all' ? '素材' : assetPickerTab === 'image' ? '图片' : '视频')}，请先将文件放到静态素材目录或 GitHub 仓库。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {assetPickerItems
                        .filter((asset) => isMentionPicker ? asset.type === 'image' : (assetPickerTab === 'all' || asset.type === assetPickerTab))
                        .map((asset) => {
                          const checked = asset.type === 'image'
                            ? (assetPickerDraft.images || []).some((item) => item.relative_path === asset.relative_path)
                            : assetPickerDraft.video?.relative_path === asset.relative_path;
                          return (
                        <button
                          key={asset.relative_path}
                          type="button"
                          onClick={() => (isMentionPicker ? handleMentionAssetSelect(asset) : toggleDraftAsset(asset))}
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

              {!isMentionPicker && (
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
                  确定
                </button>
              </div>
              )}
            </div>
          </div>
        )}

        {previewAsset && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={closePreviewAsset}
          >
            <div
              className="bg-[#18181b] border border-white/10 rounded-2xl p-4 w-full max-w-4xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">{previewAsset.name}</h3>
                  <p className="text-[11px] text-zinc-500 truncate">{previewAsset.relative_path}</p>
                </div>
                <button type="button" onClick={closePreviewAsset} className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 max-h-[70vh] flex items-center justify-center">
                <img src={getApiUrl(previewAsset.url)} alt={previewAsset.name} className="max-w-full max-h-[70vh] object-contain" />
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
