import { useState } from "react";
import { getApiUrl } from "../config";

export default function InspireUI() {
  const [step, setStep] = useState(0);
  const [platforms, setPlatforms] = useState([]);
  const [region, setRegion] = useState("");
  const [types, setTypes] = useState([]);
  const [customType, setCustomType] = useState("");
  const [audiences, setAudiences] = useState([]);
  const [customAudience, setCustomAudience] = useState("");
  const [buildingPrompt, setBuildingPrompt] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [builtPrompt, setBuiltPrompt] = useState("");

  const platformList = [
    "YouTube",
    "TikTok",
    "Instagram",
    "Bilibili",
    "小红书",
    "Facebook",
  ];
  const regionList = [
    "全球",
    "中国大陆",
    "台湾",
    "香港",
    "东南亚",
    "北美",
    "欧洲",
    "日本",
    "韩国",
  ];
  const typeList = [
    "短视频",
    "Vlog",
    "生活方式",
    "游戏解说",
    "科技评测",
    "美食",
    "时尚",
    "美妆",
    "励志",
    "教育",
    "AI生成内容",
  ];
  const audienceList = [
    "Z世代（18-24）",
    "千禧一代（25-34）",
    "中年群体",
    "学生",
    "职场白领",
    "宝妈",
    "健身爱好者",
    "科技爱好者",
  ];

  const toggleSelect = (item, list, setList) => {
    setList(
      list.includes(item)
        ? list.filter((i) => i !== item)
        : [...list, item]
    );
  };

  const addCustomType = () => {
    const value = customType.trim();
    if (!value || types.includes(value)) return;
    setTypes([...types, value]);
    setCustomType("");
  };

  const addCustomAudience = () => {
    const value = customAudience.trim();
    if (!value || audiences.includes(value)) return;
    setAudiences([...audiences, value]);
    setCustomAudience("");
  };

  const handleBuildPrompt = async () => {
    setBuildingPrompt(true);
    setBuildError("");
    try {
      const resp = await fetch(getApiUrl("/api/workbench/inspiration/build-prompt"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platforms,
          region,
          video_types: types,
          audiences,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.detail || "构造灵感失败");
      }
      setBuiltPrompt(String(data?.prompt || ""));
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "构造灵感失败");
    } finally {
      setBuildingPrompt(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-black via-[#0a0a1f] to-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-white/5 backdrop-blur-xl rounded-2xl p-10 shadow-[0_0_60px_rgba(138,92,255,0.2)]">
        {step === 0 && (
          <div className="text-center space-y-8">
            <h1 className="text-4xl font-bold">
              No inspiration?
              <br />
              <span className="text-purple-400">Let's explore together.</span>
            </h1>

            <button
              onClick={() => setStep(1)}
              className="px-8 py-3 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 hover:scale-105 transition shadow-lg shadow-purple-500/30"
            >
              开始探索 →
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-center">Step 1：发布平台</h2>

            <div className="grid grid-cols-3 gap-4">
              {platformList.map((p) => (
                <div
                  key={p}
                  onClick={() => toggleSelect(p, platforms, setPlatforms)}
                  className={`p-4 text-center rounded-xl cursor-pointer transition ${
                    platforms.includes(p)
                      ? "bg-purple-600 shadow-lg shadow-purple-500/40"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {p}
                </div>
              ))}
            </div>

            <div className="text-center">
              <button
                disabled={platforms.length === 0}
                onClick={() => setStep(2)}
                className={`px-6 py-2 rounded-full transition ${
                  platforms.length
                    ? "bg-purple-500 hover:bg-purple-600 shadow-lg"
                    : "bg-gray-600 cursor-not-allowed"
                }`}
              >
                下一步 →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-center">Step 2：发布地区</h2>

            <div className="grid grid-cols-3 gap-4">
              {regionList.map((r) => (
                <div
                  key={r}
                  onClick={() => setRegion(r)}
                  className={`p-4 text-center rounded-xl cursor-pointer transition ${
                    region === r
                      ? "bg-purple-600 shadow-lg shadow-purple-500/40"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {r}
                </div>
              ))}
            </div>

            <div className="text-center">
              <button
                disabled={!region}
                onClick={() => setStep(3)}
                className={`px-6 py-2 rounded-full transition ${
                  region
                    ? "bg-purple-500 hover:bg-purple-600 shadow-lg"
                    : "bg-gray-600 cursor-not-allowed"
                }`}
              >
                下一步 →
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setStep(1)}
                className="text-sm text-gray-400 hover:text-white"
              >
                ← 返回
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-2xl text-center font-semibold">Step 3：视频类型</h2>

            <div className="grid grid-cols-3 gap-4">
              {typeList.map((t) => (
                <div
                  key={t}
                  onClick={() => toggleSelect(t, types, setTypes)}
                  className={`p-4 text-center rounded-xl cursor-pointer transition ${
                    types.includes(t)
                      ? "bg-indigo-600 shadow-lg shadow-indigo-500/40"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {t}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="自定义类型..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomType();
                  }
                }}
                className="flex-1 px-4 py-2 bg-black/40 rounded-lg border border-white/10"
              />
              <button
                onClick={addCustomType}
                className="px-4 py-2 bg-purple-500 rounded-lg"
              >
                添加
              </button>
            </div>

            <div className="text-center pt-4">
              <button
                disabled={types.length === 0}
                onClick={() => setStep(4)}
                className={`px-10 py-3 rounded-full text-lg transition ${
                  types.length
                    ? "bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_30px_rgba(138,92,255,0.6)] hover:scale-105"
                    : "bg-gray-600 cursor-not-allowed"
                }`}
              >
                ✨ 构造灵感
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-gray-400 hover:text-white"
              >
                ← 返回
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-2xl text-center font-semibold">Step 4：受众群体</h2>

            <div className="grid grid-cols-3 gap-4">
              {audienceList.map((a) => (
                <div
                  key={a}
                  onClick={() => toggleSelect(a, audiences, setAudiences)}
                  className={`p-4 text-center rounded-xl cursor-pointer transition ${
                    audiences.includes(a)
                      ? "bg-indigo-600 shadow-lg shadow-indigo-500/40"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {a}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={customAudience}
                onChange={(e) => setCustomAudience(e.target.value)}
                placeholder="自定义受众..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomAudience();
                  }
                }}
                className="flex-1 px-4 py-2 bg-black/40 rounded-lg border border-white/10"
              />
              <button
                onClick={addCustomAudience}
                className="px-4 py-2 bg-purple-500 rounded-lg"
              >
                添加
              </button>
            </div>

            <div className="text-center pt-4">
              <button
                disabled={audiences.length === 0}
                onClick={handleBuildPrompt}
                className={`px-10 py-3 rounded-full text-lg transition ${
                  audiences.length && !buildingPrompt
                    ? "bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_30px_rgba(138,92,255,0.6)] hover:scale-105"
                    : "bg-gray-600 cursor-not-allowed"
                }`}
              >
                {buildingPrompt ? "构造中..." : "✨ 构造灵感"}
              </button>
            </div>

            {buildError && (
              <p className="text-sm text-red-300 text-center">{buildError}</p>
            )}

            {builtPrompt && (
              <div className="space-y-2">
                <p className="text-sm text-zinc-300">已生成提示词：</p>
                <pre className="whitespace-pre-wrap text-sm leading-6 bg-black/30 border border-white/10 rounded-xl p-4 text-zinc-100 max-h-64 overflow-y-auto">
                  {builtPrompt}
                </pre>
              </div>
            )}

            <div className="text-center">
              <button
                onClick={() => setStep(3)}
                className="text-sm text-gray-400 hover:text-white"
              >
                ← 返回
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
