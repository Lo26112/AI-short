import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, FolderPlus, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { getApiUrl } from '../config';
import { NANO_BANANA2_DEFAULTS, PictureStepConfig, PictureStepResult } from './picture';
import { VideoStepConfig, VideoStepResult } from './video';
import AudioStep from './audio';
import LipsyncStep from './lipsync';
import Step5FaceEdit from './step5_face_edit';

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

/** Bottom prompt editor: default height, auto-grow up to max, then scroll inside. */
const PROMPT_EDITOR_MIN_PX = 72;
const PROMPT_EDITOR_MAX_PX = 220;

const ELEMENT_BADGE_COLORS = [
  { bg: 'rgba(139, 92, 246, 0.24)', border: 'rgba(139, 92, 246, 0.6)', text: '#ddd6fe' }, // violet
  { bg: 'rgba(217, 70, 239, 0.2)', border: 'rgba(217, 70, 239, 0.55)', text: '#f5d0fe' }, // fuchsia
  { bg: 'rgba(59, 130, 246, 0.22)', border: 'rgba(59, 130, 246, 0.55)', text: '#bfdbfe' }, // blue
  { bg: 'rgba(16, 185, 129, 0.2)', border: 'rgba(16, 185, 129, 0.55)', text: '#a7f3d0' }, // emerald
  { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgba(245, 158, 11, 0.55)', text: '#fde68a' }, // amber
  { bg: 'rgba(244, 63, 94, 0.2)', border: 'rgba(244, 63, 94, 0.55)', text: '#fecdd3' }, // rose
];

const WORKBENCH_STEPS = [
  { id: 0, title: '生成圖片' },
  { id: 1, title: '生成影片' },
  { id: 2, title: '生成音訊' },
  { id: 3, title: '對口型' },
];

export default function Workbench() {
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
  const [stepGenerating, setStepGenerating] = useState({ 0: false, 1: false });

  const [imageAsset, setImageAsset] = useState(null);
  const [videoAsset, setVideoAsset] = useState(null);
  const [audioAsset, setAudioAsset] = useState(null);
  const [videoResultUrl, setVideoResultUrl] = useState('');
  const [step5Prompt, setStep5Prompt] = useState('');
  const [step5KeepAudio, setStep5KeepAudio] = useState(true);
  const [step5ShotType, setStep5ShotType] = useState('customize');
  const [step5Elements, setStep5Elements] = useState([]);
  const [step5PromptElements, setStep5PromptElements] = useState([]);
  const [step5Generating, setStep5Generating] = useState(false);
  const [step5ResultUrl, setStep5ResultUrl] = useState('');
  const [step5Logs, setStep5Logs] = useState([]);
  const [lipsyncVideoUrl, setLipsyncVideoUrl] = useState('');
  const [lipsyncAudioUrl, setLipsyncAudioUrl] = useState('');
  const [lipsyncSyncMode, setLipsyncSyncMode] = useState('cut_off');
  const [lipsyncResultUrl, setLipsyncResultUrl] = useState('');
  const [lipsyncGenerating, setLipsyncGenerating] = useState(false);

  // Step 1 (生成影片) parameters
  const [videoProvider, setVideoProvider] = useState('kling'); // kling | wan
  const [videoMode, setVideoMode] = useState('image'); // image | text
  const [videoDuration, setVideoDuration] = useState('3');
  const [videoGenerateAudio, setVideoGenerateAudio] = useState(false); // kling only
  const [klingAspectRatio, setKlingAspectRatio] = useState('16:9');
  const [wanFps, setWanFps] = useState(16);
  const [wanAspectRatio, setWanAspectRatio] = useState('auto');
  const [wanResolution, setWanResolution] = useState('720p');
  const [selectedStaticAssets, setSelectedStaticAssets] = useState({
    0: { images: [], video: null },
    1: { images: [], video: null },
    2: { images: [], video: null },
    3: { images: [], video: null },
    4: { images: [], video: null },
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
  const [mentionTargetStep, setMentionTargetStep] = useState(0);
  const [previewAsset, setPreviewAsset] = useState(null);
  const promptEditorRef = useRef(null);
  const step5PromptEditorRef = useRef(null);
  const prevStepRef = useRef(0);

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
        const detail = typeof data?.detail === 'string' ? data.detail : '載入專案列表失敗';
        throw new Error(detail);
      }
      setProjectList(data.projects || []);
    } catch (err) {
      setProjectListError(err.message || '載入專案列表失敗');
    } finally {
      setProjectListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!project) fetchProjectList();
  }, [project, fetchProjectList]);

  const updateStep = useCallback((next) => {
    setStep((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      const clamped = Math.max(0, Math.min(4, resolved));
      return clamped === current ? current : clamped;
    });
  }, []);
  const goBack = useCallback(() => updateStep((s) => s - 1), [updateStep]);
  const goNext = useCallback(() => updateStep((s) => s + 1), [updateStep]);

  useEffect(() => {
    const prev = prevStepRef.current;
    // Enforce isolation between Step 0(生成圖片) and Step 1(生成影片):
    // no shared @ image references or image asset carry-over.
    const switchedBetweenImageAndVideo =
      (prev === 0 && step === 1) || (prev === 1 && step === 0);
    if (switchedBetweenImageAndVideo) {
      setPrompt((p) => p.replace(/Elements\[\d+\]/g, '').trim());
      setPromptElements([]);
      setImageAsset(null);
    }
    prevStepRef.current = step;
  }, [step]);

  const resetWizardState = () => {
    setStep(0);
    setStepGenerating({ 0: false, 1: false });
    setPrompt('');
    setImageAsset(null);
    setVideoAsset(null);
    setAudioAsset(null);
    setVideoResultUrl('');
    setSelectedStaticAssets({
      0: { images: [], video: null },
      1: { images: [], video: null },
      2: { images: [], video: null },
      3: { images: [], video: null },
      4: { images: [], video: null },
    });
    setNanoBanana2({ ...NANO_BANANA2_DEFAULTS });
    setStep0GeneratedImageUrls([]);
    setPromptElements([]);
    setStep5Prompt('');
    setStep5KeepAudio(true);
    setStep5ShotType('customize');
    setStep5Elements([]);
    setStep5PromptElements([]);
    setStep5Generating(false);
    setStep5ResultUrl('');
    setStep5Logs([]);
    setLipsyncVideoUrl('');
    setLipsyncAudioUrl('');
    setLipsyncSyncMode('cut_off');
    setLipsyncResultUrl('');
    setLipsyncGenerating(false);
  };

  const leaveProject = () => {
    setProject(null);
    resetWizardState();
  };

  const deleteProject = async (item) => {
    if (!item?.slug) return;
    const confirmed = window.confirm(`確定刪除專案「${item.display_name || item.slug}」嗎？此操作不可恢復。`);
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
        const detail = typeof data?.detail === 'string' ? data.detail : '刪除專案失敗';
        throw new Error(detail);
      }

      if (project?.slug === item.slug) {
        leaveProject();
      }
      await fetchProjectList();
    } catch (err) {
      window.alert(err.message || '刪除專案失敗');
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
      setCreateError('請輸入專案名稱');
      return;
    }
    const folderName = sanitizeWorkbenchProjectFolderName(name);
    if (!folderName) {
      window.alert('專案名稱不合法，請換一個名稱重試。');
      setCreateError('專案名稱不合法，請換一個名稱重試。');
      return;
    }
    if (Array.isArray(projectList) && projectList.some((p) => (p?.slug || '').trim() === folderName)) {
      window.alert('已存在該名稱的專案，請換一個名稱重試。');
      setCreateError('已存在該名稱的專案，請換一個名稱重試。');
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
      setCreateError(err.message || '建立失敗');
    } finally {
      setCreateLoading(false);
    }
  };

  const openAssetPicker = async (targetStep) => {
    setAssetPickerStep(targetStep);
    setAssetPickerTab(targetStep === 5 ? 'video' : 'all');
    setAssetPickerDraft(selectedStaticAssets[targetStep] || { images: [], video: null });
    setShowAssetPicker(true);
    setAssetPickerLoading(true);
    setAssetPickerError('');
    setAssetPickerItems([]);
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets?kind=all&limit=300'));
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '載入素材失敗';
        throw new Error(detail);
      }
      setAssetPickerItems(data.assets || []);
    } catch (err) {
      setAssetPickerError(err.message || '載入素材失敗');
    } finally {
      setAssetPickerLoading(false);
    }
  };

  const openMentionAssetPicker = async (insertPos, targetStep = step) => {
    setIsMentionPicker(true);
    setMentionInsertPos(insertPos);
    setMentionTargetStep(targetStep);
    const mentionKind = targetStep === 4 ? 'all' : 'image';
    setAssetPickerTab(mentionKind);
    setShowAssetPicker(true);
    setAssetPickerLoading(true);
    setAssetPickerError('');
    setAssetPickerItems([]);
    try {
      const res = await fetch(getApiUrl(`/api/workbench/static-assets?kind=${mentionKind}&limit=300`));
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '載入圖片素材失敗';
        throw new Error(detail);
      }
      setAssetPickerItems(data.assets || []);
    } catch (err) {
      setAssetPickerError(err.message || '載入圖片素材失敗');
    } finally {
      setAssetPickerLoading(false);
    }
  };

  const closeAssetPicker = () => {
    setShowAssetPicker(false);
    setAssetPickerError('');
    setIsMentionPicker(false);
    setMentionInsertPos(null);
    setMentionTargetStep(0);
  };

  const openPreviewAsset = (asset) => {
    setPreviewAsset(asset || null);
  };

  const closePreviewAsset = () => {
    setPreviewAsset(null);
  };

  const filteredAssetPickerItems = useMemo(() => {
    return assetPickerItems.filter((asset) => (
      isMentionPicker
        ? (mentionTargetStep === 4 ? (asset.type === 'image' || asset.type === 'video') : asset.type === 'image')
        : (assetPickerTab === 'all' || asset.type === assetPickerTab)
    ));
  }, [assetPickerItems, isMentionPicker, assetPickerTab, mentionTargetStep]);

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

  const getCaretTextOffset = (root, fallbackText = '') => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return String(fallbackText || '').length;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.endContainer)) return String(fallbackText || '').length;
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

  const buildStep5PromptEditorHTML = (text) => {
    const tokenRegex = /@(?:Image|Video)\d+/g;
    let html = '';
    let lastIndex = 0;
    let match = tokenRegex.exec(text);
    while (match) {
      const full = match[0];
      const element = step5PromptElements.find((item) => item.token === full);
      html += escapeHtml(text.slice(lastIndex, match.index));
      if (element?.url) {
        const color = element.color || ELEMENT_BADGE_COLORS[(element.index || 0) % ELEMENT_BADGE_COLORS.length];
        const previewNode = element.type === 'video'
          ? `<video src="${escapeHtml(getApiUrl(element.url))}" class="w-8 h-8 rounded object-cover" muted loop playsinline></video>`
          : `<img src="${escapeHtml(getApiUrl(element.url))}" alt="${escapeHtml(element.name || full)}" class="w-8 h-8 rounded object-cover" />`;
        html += `<span contenteditable="false" data-token="${full}" class="inline-flex items-center gap-1 mx-0.5 px-1 py-0.5 rounded bg-white/10 border border-white/15 align-middle">
  ${previewNode}
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

  const resizePromptEditor = useCallback(() => {
    const el = promptEditorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const sh = el.scrollHeight;
    const nextH = Math.min(Math.max(sh, PROMPT_EDITOR_MIN_PX), PROMPT_EDITOR_MAX_PX);
    el.style.height = `${nextH}px`;
    el.style.overflowY = sh > PROMPT_EDITOR_MAX_PX ? 'auto' : 'hidden';
  }, []);

  const resizeStep5PromptEditor = useCallback(() => {
    const el = step5PromptEditorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const sh = el.scrollHeight;
    const nextH = Math.min(Math.max(sh, PROMPT_EDITOR_MIN_PX), PROMPT_EDITOR_MAX_PX);
    el.style.height = `${nextH}px`;
    el.style.overflowY = sh > PROMPT_EDITOR_MAX_PX ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    if (!project || step > 1) return;
    requestAnimationFrame(() => resizePromptEditor());
  }, [project, step, resizePromptEditor]);

  useLayoutEffect(() => {
    if (!project || step !== 4) return;
    requestAnimationFrame(() => resizeStep5PromptEditor());
  }, [project, step, resizeStep5PromptEditor]);

  useEffect(() => {
    const editor = promptEditorRef.current;
    if (!editor) return;
    const current = serializePromptFromEditor(editor);
    if (current === (prompt || '')) return;
    editor.innerHTML = buildPromptEditorHTML(prompt || '');
    requestAnimationFrame(() => resizePromptEditor());
  }, [prompt, promptElements, resizePromptEditor]);

  useEffect(() => {
    const editor = step5PromptEditorRef.current;
    if (!editor) return;
    const current = serializePromptFromEditor(editor);
    if (current === (step5Prompt || '')) return;
    editor.innerHTML = buildStep5PromptEditorHTML(step5Prompt || '');
    requestAnimationFrame(() => resizeStep5PromptEditor());
  }, [step5Prompt, step5PromptElements, resizeStep5PromptEditor]);

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
  };

  const handleMentionAssetSelect = async (asset) => {
    if (mentionTargetStep === 4) {
      const insertPos = mentionInsertPos ?? step5Prompt.length;
      const kind = asset?.type === 'video' ? 'video' : 'image';
      const typeCount = step5PromptElements.filter((item) => item.type === kind).length;
      const token = kind === 'video' ? `@Video${typeCount + 1}` : `@Image${typeCount + 1}`;
      setStep5Prompt((prev) => `${prev.slice(0, insertPos)}${token}${prev.slice(insertPos)}`);
      setStep5PromptElements((prev) => ([
        ...prev,
        {
          index: prev.length,
          token,
          type: kind,
          name: asset.name,
          relative_path: asset.relative_path,
          url: asset.url,
          color: ELEMENT_BADGE_COLORS[Math.floor(Math.random() * ELEMENT_BADGE_COLORS.length)],
        },
      ]));
      closeAssetPicker();
      return;
    }

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

    // 與原有佔位資產欄位保持同步，便於後續流程沿用
    // 仅同步 Step0/Step1 的占位资产，避免影响 Step5 独立流程。
    if (assetPickerStep <= 1) {
      if (nextSelected.images.length > 0) setImageAsset(nextSelected.images[0].url);
      if (nextSelected.video) setVideoAsset(nextSelected.video.url);
    }

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

  };

  const clearSelectedVideo = (targetStep) => {
    setSelectedStaticAssets((prev) => ({
      ...prev,
      [targetStep]: {
        ...(prev[targetStep] || { images: [], video: null }),
        video: null,
      },
    }));
    if (targetStep <= 1) {
      setVideoAsset(null);
    }
  };

  const runSeedGeneration = async (targetStep) => {
    const basePayload = {
      step: targetStep,
      prompt,
      project_slug: project?.slug || null,
      model,
      image_asset: null,
      video_asset: videoAsset,
      audio_asset: audioAsset,
      prompt_element_urls: promptElements.map((item) => item.url).filter(Boolean),
    };
    if (targetStep === 0) {
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
      basePayload.nano_banana_2 = nb;
    }

    const response = await fetch(getApiUrl('/api/generalprompt/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(basePayload),
    });
    let responseData = {};
    try {
      responseData = await response.json();
    } catch {
      /* ignore */
    }
    if (!response.ok) {
      const detail = typeof responseData?.detail === 'string' ? responseData.detail : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    return responseData;
  };

  const handleImageGenerationFlow = async () => {
    const responseData = await runSeedGeneration(0);
    const outputUrls = Array.isArray(responseData.nano_banana_image_urls)
      ? responseData.nano_banana_image_urls.filter(Boolean)
      : [];
    setStep0GeneratedImageUrls(outputUrls);
    setImageAsset(outputUrls[0] || null);
  };

  const buildVideoModelRequest = (seedData) => {
    const seedPrompt = String(seedData?.generated_prompt || '').trim();
    if (!seedPrompt) throw new Error('Seed 改寫結果為空');

    const promptElementUrls = Array.isArray(seedData?.prompt_element_urls)
      ? seedData.prompt_element_urls.filter(Boolean)
      : [];
    const firstElementImage = promptElementUrls[0] || null;
    const provider = videoProvider;
    const mode = videoMode;
    const commonBody = {
      prompt: seedPrompt,
      prompt_element_urls: promptElementUrls,
    };

    if (provider === 'kling') {
      if (mode === 'image') {
        const startImage = String(firstElementImage || '').trim();
        if (!startImage) throw new Error('請先在輸入框使用 @ 選擇至少一張圖片素材');
        return {
          endpoint: '/api/workbench/kling/image-to-video',
          body: {
            ...commonBody,
            start_image_url: startImage,
            duration: String(videoDuration || '3'),
            generate_audio: Boolean(videoGenerateAudio),
          },
        };
      }
      return {
        endpoint: '/api/workbench/kling/text-to-video',
        body: {
          ...commonBody,
          duration: String(videoDuration || '3'),
          generate_audio: Boolean(videoGenerateAudio),
          aspect_ratio: String(klingAspectRatio || '16:9'),
        },
      };
    }

    const fps = Number.isFinite(Number(wanFps)) ? Number(wanFps) : 16;
    if (mode === 'image') {
      const img = String(firstElementImage || '').trim();
      if (!img) throw new Error('請先在輸入框使用 @ 選擇至少一張圖片素材');
      return {
        endpoint: '/api/workbench/wan/image-to-video',
        body: {
          ...commonBody,
          image_url: img,
          duration: String(videoDuration || '3'),
          frames_per_second: fps,
          aspect_ratio: String(wanAspectRatio || 'auto'),
          resolution: String(wanResolution || '720p'),
        },
      };
    }
    return {
      endpoint: '/api/workbench/wan/text-to-video',
      body: {
        ...commonBody,
        duration: String(videoDuration || '3'),
        frames_per_second: fps,
        aspect_ratio: String(wanAspectRatio || '16:9'),
        resolution: String(wanResolution || '720p'),
      },
    };
  };

  const handleVideoGenerationFlow = async () => {
    const seedData = await runSeedGeneration(1);
    const { endpoint, body } = buildVideoModelRequest(seedData);
    const res2 = await fetch(getApiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data2 = {};
    try {
      data2 = await res2.json();
    } catch {
      /* ignore */
    }
    if (!res2.ok) {
      const detail = typeof data2?.detail === 'string' ? data2.detail : `HTTP ${res2.status}`;
      throw new Error(detail);
    }
    const url = String(data2.video_url || '').trim();
    if (!url) throw new Error('後端未返回 video_url');
    setVideoResultUrl(url);
    setVideoAsset(url);
  };

  const handleStep5Generate = async () => {
    const promptText = String(step5Prompt || '').trim();
    const videoUrl = String((step5PromptElements.find((item) => item.type === 'video') || {}).url || '').trim();
    const imageUrls = step5PromptElements
      .filter((item) => item.type === 'image')
      .map((item) => String(item?.url || '').trim())
      .filter(Boolean);

    if (!promptText) throw new Error('请输入 Step5 需求');
    if (!videoUrl) throw new Error('请先在输入框中用 @ 插入至少一个视频素材（@Video1）');

    const elementsPayload = (step5Elements || [])
      .map((item) => {
        const frontal = String(item?.frontal_image_url || '').trim();
        const refs = String(item?.reference_image_urls_text || '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        return { frontal_image_url: frontal, reference_image_urls: refs };
      })
      .filter((item) => item.frontal_image_url);

    setStep5Generating(true);
    setStep5Logs(['开始提交 Step5 请求...']);
    try {
      const response = await fetch(getApiUrl('/api/workbench/kling/o3/video-edit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          video_url: videoUrl,
          image_urls: imageUrls,
          keep_audio: Boolean(step5KeepAudio),
          shot_type: String(step5ShotType || 'customize').trim() || 'customize',
          elements: elementsPayload,
        }),
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        /* ignore */
      }
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      const url = String(data?.video_url || '').trim();
      if (!url) throw new Error('后端未返回 video_url');
      setStep5ResultUrl(url);
      const logs = Array.isArray(data?.logs) ? data.logs.filter(Boolean) : [];
      setStep5Logs(logs.length ? logs : ['请求完成，未返回队列日志']);
    } finally {
      setStep5Generating(false);
    }
  };

  const handleLipsyncGenerate = async () => {
    const videoUrl = String(lipsyncVideoUrl || '').trim();
    const audioUrl = String(lipsyncAudioUrl || '').trim();
    if (!videoUrl) throw new Error('请输入 video_url');
    if (!audioUrl) throw new Error('请输入 audio_url');

    setLipsyncGenerating(true);
    try {
      const response = await fetch(getApiUrl('/api/workbench/lipsync/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: videoUrl,
          audio_url: audioUrl,
          sync_mode: String(lipsyncSyncMode || 'cut_off'),
        }),
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        /* ignore */
      }
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      const out = String(data?.video_url || '').trim();
      if (!out) throw new Error('后端未返回 video_url');
      setLipsyncResultUrl(out);
    } finally {
      setLipsyncGenerating(false);
    }
  };

  useEffect(() => {
    if (!lipsyncVideoUrl && videoAsset) setLipsyncVideoUrl(String(videoAsset));
  }, [videoAsset, lipsyncVideoUrl]);

  useEffect(() => {
    if (!lipsyncAudioUrl && audioAsset) setLipsyncAudioUrl(String(audioAsset));
  }, [audioAsset, lipsyncAudioUrl]);
  const handleGenerate = async (event) => {
    event.preventDefault();
    if (step > 1) return;
    if (!prompt.trim()) return;
    const targetStep = step;
    if (stepGenerating[targetStep]) return;

    setStepGenerating((prev) => ({ ...prev, [targetStep]: true }));
    try {
      if (targetStep === 0) await handleImageGenerationFlow();
      if (targetStep === 1) await handleVideoGenerationFlow();
      // Each run should start from a clean composer so @ references do not leak.
      setPrompt('');
      setPromptElements([]);
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      window.alert(err.message || '發送失敗');
    } finally {
      setStepGenerating((prev) => ({ ...prev, [targetStep]: false }));
    }
  };

  const handlePromptKeyDown = (event) => {
    if (event.key === '@' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const pos = getCaretTextOffset(promptEditorRef.current, prompt);
      openMentionAssetPicker(pos, step);
      return;
    }

    if (event.key !== 'Enter' || event.isComposing) return;

    // Ctrl+Enter: force newline at caret position
    if (event.ctrlKey) {
      event.preventDefault();
      document.execCommand('insertLineBreak');
      const editor = promptEditorRef.current;
      setPrompt(serializePromptFromEditor(editor));
      requestAnimationFrame(() => resizePromptEditor());
      return;
    }

    event.preventDefault();
    const form = event.currentTarget.closest('form');
    form?.requestSubmit();
  };

  /** Keep mouse wheel scrolling the prompt editor vertically; do not bubble to the main step scroll area. */
  const handlePromptWheel = useCallback((e) => {
    const el = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const dy = e.deltaY;
    if (scrollHeight <= clientHeight + 1) {
      e.stopPropagation();
      return;
    }
    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
    const canScrollY = scrollHeight > clientHeight + 1;
    if (!canScrollY) {
      e.stopPropagation();
      return;
    }
    if (dy < 0 && !atTop) e.stopPropagation();
    else if (dy > 0 && !atBottom) e.stopPropagation();
  }, []);

  const handleStep5PromptInput = () => {
    const el = step5PromptEditorRef.current;
    const nextPrompt = serializePromptFromEditor(el);
    setStep5Prompt(nextPrompt);
    if (!nextPrompt.trim()) {
      setStep5PromptElements([]);
    }
    requestAnimationFrame(() => resizeStep5PromptEditor());
  };

  const handleStep5PromptKeyDown = (event) => {
    if (event.key === '@' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const pos = getCaretTextOffset(step5PromptEditorRef.current, step5Prompt);
      openMentionAssetPicker(pos, 4);
      return;
    }

    if (event.key !== 'Enter' || event.isComposing) return;
    if (event.ctrlKey) {
      event.preventDefault();
      document.execCommand('insertLineBreak');
      const editor = step5PromptEditorRef.current;
      setStep5Prompt(serializePromptFromEditor(editor));
      requestAnimationFrame(() => resizeStep5PromptEditor());
    }
  };

  const renderBottomComposer = (targetStep, placeholder, buttonText, requirePrompt = true, showPromptTextarea = true) => (
    <div className="border border-white/10 bg-[#141418]/90 backdrop-blur-md rounded-xl p-3 min-w-0">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="text-[11px] text-zinc-500">
          提示：輸入 <span className="font-mono text-zinc-400">@</span> 可引用素材庫圖片（會插入 <span className="font-mono text-zinc-400">圖片素材</span>）。
        </div>
        {showPromptTextarea ? (
          <div
            ref={promptEditorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              const el = promptEditorRef.current;
              const nextPrompt = serializePromptFromEditor(el);
              setPrompt(nextPrompt);
              if (!nextPrompt.trim()) {
                // Input box fully cleared: reset referenced @ assets as well.
                setPromptElements([]);
              }
              requestAnimationFrame(() => resizePromptEditor());
            }}
            onKeyDown={handlePromptKeyDown}
            onWheel={handlePromptWheel}
            data-placeholder={placeholder}
            style={{ minHeight: PROMPT_EDITOR_MIN_PX, maxHeight: PROMPT_EDITOR_MAX_PX }}
            className="input-field min-w-0 overflow-x-hidden overscroll-y-contain text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          />
        ) : null}
        <button
          type="submit"
          disabled={stepGenerating[targetStep] || (requirePrompt && !prompt.trim())}
          className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {stepGenerating[targetStep] ? (
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
      placeholder: '描述需求（先由 Seed 改寫，改寫結果將作為 Nano Banana 2 的 prompt）…',
      buttonText: 'Seed改寫並生成圖片',
      requirePrompt: true,
    },
    1: { placeholder: 'Describe what video you want（僅 Seed 改寫為影片提示詞）…', buttonText: 'Generate Video Prompt', requirePrompt: true },
  };

  /* ── 主頁：未進入專案 ───────────────────────────────── */
  if (!project) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 w-full animate-[fadeIn_0.3s_ease-out]">
        <div className="glass-panel p-8 max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">工作臺</h1>
              <p className="text-zinc-400 mt-2 text-sm">
                預設進入專案建立頁。你可以新建專案，或點擊下方書籤進入歷史專案。
              </p>
              <p className="text-[11px] text-zinc-600 mt-1">
                專案目錄根路徑：<span className="text-zinc-400 font-mono">output/projects</span>
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="btn-primary px-4 py-2 text-sm shrink-0 flex items-center gap-2"
            >
              <FolderPlus size={16} />
              建立專案
            </button>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Bookmark size={14} className="text-violet-400" />
                歷史專案書籤
              </h2>
              <button type="button" onClick={fetchProjectList} className="text-xs text-zinc-500 hover:text-zinc-300">
                重新整理
              </button>
            </div>

            {projectListLoading ? (
              <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-4">載入專案中...</div>
            ) : projectListError ? (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">{projectListError}</div>
            ) : projectList.length === 0 ? (
              <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-6 text-center">
                暫無歷史專案，點擊右上角「建立專案」開始。
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
                          title="刪除專案"
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
                      更新時間：{item.mtime ? new Date(item.mtime * 1000).toLocaleString() : '-'}
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
                <h2 className="text-lg font-bold text-white">新建專案</h2>
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
                  <label className="block text-sm text-zinc-400 mb-2">專案名稱</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="input-field"
                    placeholder="例如：春季促銷短片"
                    autoFocus
                  />
                  <p className="text-[11px] text-zinc-600 mt-2">
                    伺服器路徑：<span className="font-mono text-zinc-500">output/projects/&lt;名稱&gt;</span>（可透過環境變數 WORKBENCH_PROJECTS_ROOT 配置根目錄）
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
                      建立中…
                    </>
                  ) : (
                    <>
                      <FolderPlus size={16} />
                      建立並進入
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

  /* ── 已進入專案：四步嚮導 ───────────────────────────── */
  return (
    <div className="h-full overflow-hidden p-4 md:p-6 w-full animate-[fadeIn_0.3s_ease-out]">
      <div className="glass-panel h-full p-4 md:p-6 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
          {/* Left: steps — 與中間配置、右側預覽比例 1 : 3 : 6 */}
          <aside className="lg:flex-[1] min-w-0 shrink-0 border border-white/10 bg-white/5 rounded-2xl p-4 flex flex-col lg:max-h-full lg:overflow-y-auto custom-scrollbar">
            <div>
              <h1 className="text-2xl font-bold text-white">工作臺</h1>
              <p className="text-zinc-400 mt-1 text-sm">
                當前專案：<span className="text-zinc-200 font-semibold">{project.displayName}</span>
              </p>
              <p className="text-[11px] text-zinc-600 mt-1 font-mono break-all">
                {project.relativeDir}
              </p>
            </div>

            <div className="mt-5 space-y-2">
              {WORKBENCH_STEPS.map((s, idx) => {
                const active = s.id === step;
                const done = s.id < step;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => updateStep(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left ${
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
                disabled={step === 4}
                className="btn-secondary flex-1 px-3 py-2 text-xs flex items-center justify-center gap-1 disabled:opacity-50"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
            <button type="button" onClick={leaveProject} className="btn-secondary mt-2 w-full px-4 py-2 text-sm">
              返回專案列表
            </button>
          </aside>

          {step <= 1 ? (
            <>
              <section className="lg:flex-[3] min-w-0 h-full min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                  {step === 0 && (
                    <PictureStepConfig
                      nanoBanana2={nanoBanana2}
                      setNanoBanana2={setNanoBanana2}
                      onSkipToVideo={() => {
                        setImageAsset('provided');
                        updateStep(1);
                      }}
                    />
                  )}
                  {step === 1 && (
                    <VideoStepConfig
                      videoProvider={videoProvider}
                      setVideoProvider={setVideoProvider}
                      onGoToFaceEdit={() => updateStep(4)}
                      videoMode={videoMode}
                      setVideoMode={setVideoMode}
                      videoDuration={videoDuration}
                      setVideoDuration={setVideoDuration}
                      videoGenerateAudio={videoGenerateAudio}
                      setVideoGenerateAudio={setVideoGenerateAudio}
                      klingAspectRatio={klingAspectRatio}
                      setKlingAspectRatio={setKlingAspectRatio}
                      wanFps={wanFps}
                      setWanFps={setWanFps}
                      wanAspectRatio={wanAspectRatio}
                      setWanAspectRatio={setWanAspectRatio}
                      wanResolution={wanResolution}
                      setWanResolution={setWanResolution}
                      imageAsset={imageAsset}
                      onSkipToAudio={() => {
                        setVideoAsset('provided');
                        updateStep(2);
                      }}
                    />
                  )}
                </div>
              </section>

              <section className="lg:flex-[6] min-w-0 h-full min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                  {step === 0 && (
                    <PictureStepResult
                      step0GeneratedImageUrls={step0GeneratedImageUrls}
                      onPreviewOutput={openPreviewAsset}
                      isGenerating={stepGenerating[0]}
                    />
                  )}
                  {step === 1 && (
                    <VideoStepResult
                      videoAsset={videoAsset}
                      videoResultUrl={videoResultUrl}
                      isGenerating={stepGenerating[1]}
                    />
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className="lg:flex-[9] min-w-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                {step === 2 && (
                  <AudioStep
                    onAudioReady={(url) => {
                      if (url) setAudioAsset(url);
                    }}
                    onSkipToLipsync={() => {
                      setAudioAsset('provided');
                      setStep(3);
                    }}
                  />
                )}
                {step === 3 && (
                  <LipsyncStep
                    videoAsset={videoAsset}
                    audioAsset={audioAsset}
                    lipsyncVideoUrl={lipsyncVideoUrl}
                    setLipsyncVideoUrl={setLipsyncVideoUrl}
                    lipsyncAudioUrl={lipsyncAudioUrl}
                    setLipsyncAudioUrl={setLipsyncAudioUrl}
                    lipsyncSyncMode={lipsyncSyncMode}
                    setLipsyncSyncMode={setLipsyncSyncMode}
                    lipsyncResultUrl={lipsyncResultUrl}
                    lipsyncGenerating={lipsyncGenerating}
                    onGenerate={async () => {
                      try {
                        await handleLipsyncGenerate();
                      } catch (err) {
                        window.alert(err.message || '對口型失敗');
                      }
                    }}
                  />
                )}
                {step === 4 && (
                  <Step5FaceEdit
                    onBack={() => updateStep(1)}
                    prompt={step5Prompt}
                    promptEditorRef={step5PromptEditorRef}
                    onPromptInput={handleStep5PromptInput}
                    onPromptKeyDown={handleStep5PromptKeyDown}
                    onPromptWheel={handlePromptWheel}
                    keepAudio={step5KeepAudio}
                    setKeepAudio={setStep5KeepAudio}
                    shotType={step5ShotType}
                    setShotType={setStep5ShotType}
                    elements={step5Elements}
                    setElements={setStep5Elements}
                    generating={step5Generating}
                    resultUrl={step5ResultUrl}
                    logs={step5Logs}
                    onGenerate={handleStep5Generate}
                  />
                )}
              </div>
            </section>
          )}
        </div>

          {step <= 1 && (
            <form onSubmit={handleGenerate} className="pt-3 min-w-0 w-full shrink-0 border-t border-white/5">
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
                    {isMentionPicker
                      ? (mentionTargetStep === 4 ? '選擇素材（插入 @Image / @Video）' : '選擇圖片素材（插入 Elements）')
                      : '選擇素材'}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    本地靜態資源目錄：透過服務端配置的 WORKBENCH_ASSETS_ROOT
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
                    {kind === 'all' ? '全部' : kind === 'image' ? '圖片' : '影片'}
                  </button>
                ))}
                <div className="ml-auto text-[11px] text-zinc-500">
                  已選：
                  {assetPickerDraft.images?.length ? <span className="text-zinc-300 ml-1">圖片 {assetPickerDraft.images.length}</span> : null}
                  {assetPickerDraft.video ? <span className="text-zinc-300 ml-1">影片</span> : null}
                </div>
              </div>
              )}

              {assetPickerLoading ? (
                <div className="flex-1 flex items-center justify-center text-zinc-400">
                  <Loader2 className="animate-spin mr-2" size={16} />
                  載入素材中...
                </div>
              ) : assetPickerError ? (
                <div className="flex-1 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{assetPickerError}</div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                  {filteredAssetPickerItems.length === 0 ? (
                    <div className="text-sm text-zinc-500 border border-white/10 bg-white/5 rounded-xl p-4">
                      未找到可用{isMentionPicker ? (mentionTargetStep === 4 ? '素材' : '圖片') : (assetPickerTab === 'all' ? '素材' : assetPickerTab === 'image' ? '圖片' : '影片')}，請先將檔案放到靜態素材目錄或 GitHub 倉庫。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredAssetPickerItems.map((asset) => {
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
                  確定
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
      </div>
    </div>
  );
}
