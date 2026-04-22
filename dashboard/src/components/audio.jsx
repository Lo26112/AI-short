import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { getApiUrl } from '../config';

const LANGUAGE_BOOSTS = [
  'auto', 'Chinese', 'Chinese,Yue', 'English', 'Japanese', 'Korean', 'Spanish', 'French', 'German',
];

export default function AudioStep({ onSkipToLipsync, onAudioReady }) {
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [speed, setSpeed] = useState('1');
  const [vol, setVol] = useState('1');
  const [pitch, setPitch] = useState('0');
  const [emotion, setEmotion] = useState('');
  const [englishNormalization, setEnglishNormalization] = useState(false);
  const [sampleRate, setSampleRate] = useState('');
  const [bitrate, setBitrate] = useState('');
  const [audioFormat, setAudioFormat] = useState('');
  const [channel, setChannel] = useState('');
  const [languageBoost, setLanguageBoost] = useState('auto');
  const [outputFormat, setOutputFormat] = useState('url');
  const [toneList, setToneList] = useState(['']);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [durationMs, setDurationMs] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (loading) return;
    const payload = {
      text: text.trim(),
      output_format: outputFormat,
      language_boost: languageBoost || undefined,
      voice_id: voiceId.trim() || undefined,
      speed: speed === '' ? undefined : Number(speed),
      vol: vol === '' ? undefined : Number(vol),
      pitch: pitch === '' ? undefined : Number(pitch),
      emotion: emotion.trim() || undefined,
      english_normalization: englishNormalization,
      sample_rate: sampleRate === '' ? undefined : Number(sampleRate),
      bitrate: bitrate === '' ? undefined : Number(bitrate),
      audio_format: audioFormat || undefined,
      channel: channel === '' ? undefined : Number(channel),
      tone_list: toneList.map((item) => item.trim()).filter(Boolean),
    };
    if (!payload.text) {
      window.alert('請輸入文案內容');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/workbench/rudio/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      const url = String(data?.audio_url || '').trim();
      if (!url && outputFormat === 'url') {
        throw new Error('後端未返回 audio_url');
      }
      setAudioUrl(url);
      setDurationMs(Number.isFinite(Number(data?.duration_ms)) ? Number(data.duration_ms) : null);
      if (url) onAudioReady?.(url);
    } catch (err) {
      window.alert(err.message || '生成音訊失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">生成音訊</h2>
          </div>
          <button
            type="button"
            onClick={onSkipToLipsync}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors shrink-0"
          >
            已有素材跳過此階段
          </button>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="glass-panel p-6 space-y-4">
        <div>
          <label className="block text-sm text-zinc-300 mb-2">文案輸入</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input-field min-h-[140px]"
            placeholder="輸入需要轉語音的文案（最多 5000 字元）"
          />
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
            <div className="mt-3 space-y-4">
              <div className="text-sm font-semibold text-zinc-200">語音設定</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">語音 ID</label>
                  <input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="input-field" placeholder="例如：Wise_Woman" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">情緒</label>
                  <input value={emotion} onChange={(e) => setEmotion(e.target.value)} className="input-field" placeholder="例如：neutral / happy" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">語速</label>
                  <input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(e) => setSpeed(e.target.value)} className="w-full" />
                  <div className="text-xs text-zinc-500 mt-1">{speed}</div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">音量</label>
                  <input type="range" min="0" max="10" step="0.1" value={vol} onChange={(e) => setVol(e.target.value)} className="w-full" />
                  <div className="text-xs text-zinc-500 mt-1">{vol}</div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">音高</label>
                  <input type="range" min="-12" max="12" step="1" value={pitch} onChange={(e) => setPitch(e.target.value)} className="w-full" />
                  <div className="text-xs text-zinc-500 mt-1">{pitch}</div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-xs text-zinc-300">英文正規化</span>
                  <button
                    type="button"
                    onClick={() => setEnglishNormalization((v) => !v)}
                    className={`w-10 h-6 rounded-full transition-colors ${englishNormalization ? 'bg-violet-500/70' : 'bg-zinc-700'}`}
                  >
                    <span
                      className={`block w-4 h-4 mt-1 rounded-full bg-white transition-transform ${
                        englishNormalization ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="text-sm font-semibold text-zinc-200">音訊設定</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">採樣率</label>
                  <input type="number" value={sampleRate} onChange={(e) => setSampleRate(e.target.value)} className="input-field" placeholder="例如：32000" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">位元率</label>
                  <input type="number" value={bitrate} onChange={(e) => setBitrate(e.target.value)} className="input-field" placeholder="例如：128000" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">格式</label>
                  <input value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)} className="input-field" placeholder="例如：mp3 / wav" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">聲道</label>
                  <input type="number" value={channel} onChange={(e) => setChannel(e.target.value)} className="input-field" placeholder="例如：1 / 2" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">語言增強</label>
                  <select value={languageBoost} onChange={(e) => setLanguageBoost(e.target.value)} className="input-field">
                    {LANGUAGE_BOOSTS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">輸出格式</label>
                  <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="input-field">
                    <option value="url">url</option>
                    <option value="hex">hex</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-200 mb-2">發音字典（Tone List）</div>
                <div className="space-y-2">
                  {toneList.map((item, idx) => (
                    <div key={`tone-${idx}`} className="flex gap-2">
                      <input
                        value={item}
                        onChange={(e) => {
                          const next = [...toneList];
                          next[idx] = e.target.value;
                          setToneList(next);
                        }}
                        className="input-field"
                        placeholder="輸入 tone 條目"
                      />
                      <button
                        type="button"
                        onClick={() => setToneList((prev) => prev.filter((_, i) => i !== idx))}
                        className="btn-secondary px-3 py-2 text-xs"
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setToneList((prev) => [...prev, ''])} className="btn-secondary px-3 py-2 text-xs">
                    + 新增條目
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <button type="submit" disabled={loading || !text.trim()} className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              生成音訊
            </>
          )}
        </button>
      </form>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">生成結果</h3>
        {audioUrl ? (
          <div className="space-y-3">
            <audio controls src={audioUrl} className="w-full" />
            <div className="text-xs text-zinc-400 break-all">音訊連結：{audioUrl}</div>
            <div className="text-xs text-zinc-500">
              時長：{durationMs ? `${(durationMs / 1000).toFixed(2)} 秒` : '未知'}
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">暫無生成音訊</div>
        )}
      </div>
    </div>
  );
}
