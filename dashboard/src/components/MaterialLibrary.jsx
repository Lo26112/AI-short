import React, { useCallback, useMemo, useState } from 'react';
import { Download, FolderOpen, Image as ImageIcon, Loader2, Music, RefreshCw, Trash2, Upload, Video } from 'lucide-react';
import { getApiUrl, getStaticAssetInlineUrl } from '../config';

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
];

const typeLabel = (t) => {
  if (t === 'image') return '图片';
  if (t === 'video') return '视频';
  return '音频';
};

export default function MaterialLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadPath, setUploadPath] = useState('');
  const [deletingPath, setDeletingPath] = useState('');

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/workbench/static-assets?kind=all&limit=500'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : '加载素材失败';
        throw new Error(detail);
      }
      setItems(Array.isArray(data.assets) ? data.assets : []);
    } catch (e) {
      setError(e.message || '加载素材失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  React.useEffect(() => {
    if (!uploadSuccess) return undefined;
    const t = window.setTimeout(() => setUploadSuccess(''), 3000);
    return () => window.clearTimeout(t);
  }, [uploadSuccess]);

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter((a) => a.type === tab);
  }, [items, tab]);

  const downloadAsset = (asset) => {
    const q = encodeURIComponent(asset.relative_path);
    const href = getApiUrl(`/api/workbench/static-assets/download?relative_path=${q}`);
    const a = document.createElement('a');
    a.href = href;
    a.download = asset.name || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const rp = uploadPath.trim().replace(/\\/g, '/');
      if (rp) fd.append('repo_path', rp);
      const res = await fetch(getApiUrl('/api/workbench/static-assets/upload'), {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          typeof data?.detail === 'string'
            ? data.detail
            : Array.isArray(data?.detail)
              ? data.detail[0]?.msg
              : data?.detail;
        throw new Error(detail || `上传失败 HTTP ${res.status}`);
      }
      await loadAssets();
      setUploadPath('');
      setUploadSuccess(`上传成功：${data?.relative_path || file.name}`);
    } catch (err) {
      setUploadError(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const onDeleteAsset = async (asset) => {
    if (!asset?.relative_path) return;
    const ok = window.confirm(`确认删除这个素材吗？\n${asset.relative_path}`);
    if (!ok) return;
    setDeletingPath(asset.relative_path);
    setUploadError('');
    setUploadSuccess('');
    try {
      const q = encodeURIComponent(asset.relative_path);
      const res = await fetch(getApiUrl(`/api/workbench/static-assets?relative_path=${q}`), {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          typeof data?.detail === 'string'
            ? data.detail
            : Array.isArray(data?.detail)
              ? data.detail[0]?.msg
              : data?.detail;
        throw new Error(detail || `删除失败 HTTP ${res.status}`);
      }
      setUploadSuccess(`删除成功：${asset.relative_path}`);
      await loadAssets();
    } catch (err) {
      setUploadError(err.message || '删除失败');
    } finally {
      setDeletingPath('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-background text-zinc-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 shrink-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="text-violet-400" size={22} />
            <h1 className="text-lg font-semibold tracking-tight">素材库</h1>
            <span className="text-xs text-zinc-500">（预览经后端代理，与工作台一致）</span>
          </div>
          <button
            type="button"
            onClick={() => loadAssets()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-zinc-200 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            刷新
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                tab === t.id
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-100'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium cursor-pointer border border-violet-500/40 shrink-0">
            {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            {uploading ? '上传中…' : '上传到 GitHub'}
            <input type="file" className="hidden" disabled={uploading} onChange={onUpload} />
          </label>
          <div className="flex-1 min-w-[200px] max-w-md">
            <label className="block text-[11px] text-zinc-500 mb-1">可选：仓库内路径（如 folder/clip.mp4），留空则用原文件名</label>
            <input
              type="text"
              value={uploadPath}
              onChange={(e) => setUploadPath(e.target.value)}
              placeholder="例如 myfolder/new_banner.png"
              className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          </div>
        </div>
        {uploadError ? <p className="text-sm text-rose-400">{uploadError}</p> : null}
        {uploadSuccess ? <p className="text-sm text-emerald-400">{uploadSuccess}</p> : null}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && !items.length ? (
          <div className="flex items-center justify-center gap-2 text-zinc-500 py-20">
            <Loader2 className="animate-spin" size={22} />
            加载中…
          </div>
        ) : error ? (
          <p className="text-rose-400 text-sm">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-zinc-500 text-sm">当前分类下没有素材。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((asset) => {
              const src = getStaticAssetInlineUrl(asset.relative_path);
              return (
                <div
                  key={asset.relative_path}
                  className="text-left rounded-xl border border-white/10 bg-white/5 overflow-hidden flex flex-col hover:border-violet-500/30 transition-colors"
                >
                  <div className="aspect-video bg-black/40 flex items-center justify-center min-h-[120px]">
                    {asset.type === 'image' ? (
                      <img
                        src={src}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : asset.type === 'video' ? (
                      <video
                        src={src}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 w-full px-3 py-2">
                        <Music size={24} className="text-emerald-400/90 shrink-0" />
                        <audio src={src} controls className="w-full max-w-full" preload="metadata" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 flex-1 flex flex-col gap-1 min-h-0">
                    <div className="text-xs text-zinc-300 truncate flex items-center justify-between gap-2">
                      <span className="truncate flex items-center gap-1.5 min-w-0" title={asset.name}>
                        {asset.type === 'image' ? (
                          <ImageIcon size={12} className="text-violet-400/90 shrink-0" />
                        ) : asset.type === 'video' ? (
                          <Video size={12} className="text-sky-400/90 shrink-0" />
                        ) : (
                          <Music size={12} className="text-emerald-400/90 shrink-0" />
                        )}
                        <span className="truncate">{asset.name}</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 shrink-0">{typeLabel(asset.type)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-600 truncate" title={asset.relative_path}>
                      {asset.relative_path}
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadAsset(asset)}
                      className="mt-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-violet-500/15 border border-white/10 text-xs text-zinc-200"
                    >
                      <Download size={14} />
                      下载
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAsset(asset)}
                      disabled={deletingPath === asset.relative_path}
                      className="mt-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/10 text-xs text-zinc-200 disabled:opacity-60"
                    >
                      {deletingPath === asset.relative_path ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
