import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Image, Loader2, Upload, Video, X } from 'lucide-react';
import { getApiUrl } from '../config';

function MediaThumb({ item }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (item.type === 'image') {
    if (imgFailed) {
      return (
        <div className="w-full h-32 flex items-center justify-center bg-black/30 text-xs text-zinc-500 px-2 text-center">
          无法预览
        </div>
      );
    }
    return (
      <img
        src={item.url}
        alt={item.name}
        loading="lazy"
        className="w-full h-32 object-cover bg-black/20 pointer-events-none"
        onError={() => setImgFailed(true)}
      />
    );
  }

  if (item.type === 'video') {
    return (
      <video
        src={item.url}
        muted
        playsInline
        preload="metadata"
        className="w-full h-32 object-cover bg-black pointer-events-none"
      />
    );
  }

  return (
    <div className="w-full h-32 flex flex-col items-center justify-center gap-2 bg-black/25 px-3">
      <Headphones className="text-zinc-500 shrink-0" size={28} />
      <audio src={item.url} controls className="w-full max-h-8" />
    </div>
  );
}

function PreviewModal({ item, onClose }) {
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-[min(96vw,1200px)] max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
          <p className="text-sm text-zinc-200 truncate min-w-0 flex-1" title={item.name}>
            {item.name}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="关闭预览"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center bg-black/40">
          {item.type === 'image' && (
            <img
              src={item.url}
              alt={item.name}
              className="max-w-full max-h-[min(75vh,800px)] object-contain"
            />
          )}
          {item.type === 'video' && (
            <video
              src={item.url}
              controls
              playsInline
              autoPlay
              className="max-w-full max-h-[min(75vh,800px)]"
            />
          )}
          {item.type === 'audio' && (
            <div className="w-full max-w-lg px-4 py-8">
              <audio src={item.url} controls className="w-full" autoPlay />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetSection({ title, icon: Icon, items, onPreview }) {
  if (!items.length) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-zinc-300">
          <Icon size={18} className="text-violet-300 shrink-0" />
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <span className="text-xs text-zinc-500">（0）</span>
        </div>
        <p className="text-xs text-zinc-600">暂无素材</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-zinc-300">
        <Icon size={18} className="text-violet-300 shrink-0" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <span className="text-xs text-zinc-500">（{items.length}）</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <div
            key={`${item.type}-${item.relative_path || item.name}`}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if (e.target.closest('audio')) return;
              onPreview(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPreview(item);
              }
            }}
            className="rounded-xl border border-white/10 bg-white/5 overflow-hidden flex flex-col cursor-pointer transition-colors hover:border-violet-500/30 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            <div className="relative group shrink-0">
              <MediaThumb item={item} />
              {(item.type === 'image' || item.type === 'video') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition-colors pointer-events-none">
                  <span className="text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 drop-shadow-md px-2 py-1 rounded-md bg-black/50">
                    点击预览
                  </span>
                </div>
              )}
            </div>
            <div className="px-2 py-2 border-t border-white/5 min-h-0">
              <p className="text-[11px] text-zinc-400 truncate" title={item.name}>
                {item.name}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MaterialLibraryPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState('image');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const fileInputRef = useRef(null);

  const loadAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets?kind=all&limit=500'));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const list = Array.isArray(data.assets) ? data.assets : [];
      setAssets(list);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAssets();
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        // loadAssets already toggles loading; keep for safety in cancelled case
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const image = [];
    const video = [];
    const audio = [];
    for (const item of assets) {
      const t = item.type;
      if (t === 'image') image.push(item);
      else if (t === 'video') video.push(item);
      else if (t === 'audio') audio.push(item);
    }
    return { image, video, audio };
  }, [assets]);

  const categoryOptions = useMemo(
    () => [
      { key: 'image', label: '图片', icon: Image, count: grouped.image.length },
      { key: 'video', label: '视频', icon: Video, count: grouped.video.length },
      { key: 'audio', label: '音频', icon: Headphones, count: grouped.audio.length },
    ],
    [grouped],
  );

  const activeCategoryConfig = categoryOptions.find((item) => item.key === activeCategory) || categoryOptions[0];
  const activeItems = grouped[activeCategoryConfig.key] || [];

  const onPickUpload = () => {
    setUploadMessage(null);
    fileInputRef.current?.click();
  };

  const onUploadFile = async (pickedFile) => {
    if (!pickedFile) return;
    setUploadMessage(null);

    const maxBytes = 20 * 1024 * 1024;
    if (pickedFile.size > maxBytes) {
      setUploadMessage({ type: 'error', text: '文件过大：单文件最大 20MB' });
      return;
    }

    if (!/^image\/|^video\/|^audio\//.test(pickedFile.type || '')) {
      setUploadMessage({ type: 'error', text: '不支持的文件类型，请选择图片/视频/音频' });
      return;
    }

    const form = new FormData();
    form.append('file', pickedFile);

    setUploading(true);
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets/upload'), {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 409) throw new Error('同名文件已存在，请更换文件名再上传');
        if (res.status === 413) throw new Error('文件过大：单文件最大 20MB');
        throw new Error(text || `HTTP ${res.status}`);
      }

      setUploadMessage({ type: 'success', text: '上传成功，正在刷新素材库…' });
      await loadAssets();
      setUploadMessage({ type: 'success', text: '上传成功' });
    } catch (e) {
      setUploadMessage({ type: 'error', text: e.message || String(e) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-4 border-b border-white/10 bg-background/80">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white">素材库</h1>
            <p className="text-xs text-zinc-500 mt-1">来自 GitHub 静态资源仓库，按类型浏览与预览。</p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={(e) => onUploadFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={onPickUpload}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>上传素材</span>
            </button>
          </div>
        </div>

        {uploadMessage && (
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
              uploadMessage.type === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/20 bg-red-500/10 text-red-200'
            }`}
          >
            {uploadMessage.text}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {categoryOptions.map((option) => {
            const Icon = option.icon;
            const isActive = activeCategory === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveCategory(option.key)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
                  isActive
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                <Icon size={14} />
                <span>{option.label}</span>
                <span className="text-[10px] opacity-80">({option.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-10">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-zinc-400 py-16">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm">加载中…</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            加载失败：{error}
          </div>
        )}

        {!loading && !error && (
          <AssetSection
            title={activeCategoryConfig.label}
            icon={activeCategoryConfig.icon}
            items={activeItems}
            onPreview={setPreviewItem}
          />
        )}
      </div>

      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </div>
  );
}

export default MaterialLibraryPage;
