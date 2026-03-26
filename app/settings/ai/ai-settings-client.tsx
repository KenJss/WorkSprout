"use client";

import { useCallback, useEffect, useState } from "react";

/** 按厂商分组；同组共用 OpenAI 兼容的 chat/completions 根路径 */
const PRESET_GROUPS: {
  label: string;
  apiBaseUrl: string;
  models: { value: string; label: string }[];
}[] = [
  {
    label: "OpenAI",
    apiBaseUrl: "https://api.openai.com/v1",
    models: [
      { value: "gpt-4o-mini", label: "gpt-4o-mini" },
      { value: "gpt-4o", label: "gpt-4o" },
      { value: "gpt-4-turbo", label: "gpt-4-turbo" },
      { value: "chatgpt-4o-latest", label: "chatgpt-4o-latest" },
      { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
      { value: "o1-mini", label: "o1-mini" },
      { value: "o1", label: "o1" },
      { value: "o3-mini", label: "o3-mini" },
    ],
  },
  {
    label: "DeepSeek",
    apiBaseUrl: "https://api.deepseek.com/v1",
    models: [
      { value: "deepseek-chat", label: "deepseek-chat" },
      { value: "deepseek-reasoner", label: "deepseek-reasoner (R1)" },
    ],
  },
  {
    label: "Moonshot 月之暗面（Kimi）",
    apiBaseUrl: "https://api.moonshot.cn/v1",
    models: [
      { value: "moonshot-v1-8k", label: "moonshot-v1-8k" },
      { value: "moonshot-v1-32k", label: "moonshot-v1-32k" },
      { value: "moonshot-v1-128k", label: "moonshot-v1-128k" },
      { value: "kimi-k2-0711-preview", label: "kimi-k2-0711-preview" },
    ],
  },
  {
    label: "智谱 GLM（bigmodel）",
    apiBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      { value: "glm-4-plus", label: "glm-4-plus" },
      { value: "glm-4-air", label: "glm-4-air" },
      { value: "glm-4-flash", label: "glm-4-flash" },
      { value: "glm-4-long", label: "glm-4-long" },
    ],
  },
  {
    label: "阿里通义 DashScope（OpenAI 兼容）",
    apiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { value: "qwen-turbo", label: "qwen-turbo" },
      { value: "qwen-plus", label: "qwen-plus" },
      { value: "qwen-max", label: "qwen-max" },
      { value: "qwen2.5-72b-instruct", label: "qwen2.5-72b-instruct" },
    ],
  },
  {
    label: "SiliconFlow 硅基流动",
    apiBaseUrl: "https://api.siliconflow.cn/v1",
    models: [
      { value: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen/Qwen2.5-72B-Instruct" },
      { value: "deepseek-ai/DeepSeek-V3", label: "deepseek-ai/DeepSeek-V3" },
      { value: "deepseek-ai/DeepSeek-R1", label: "deepseek-ai/DeepSeek-R1" },
      { value: "meta-llama/Llama-3.3-70B-Instruct", label: "meta-llama/Llama-3.3-70B-Instruct" },
    ],
  },
  {
    label: "Groq",
    apiBaseUrl: "https://api.groq.com/openai/v1",
    models: [
      { value: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile" },
      { value: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant" },
      { value: "mixtral-8x7b-32768", label: "mixtral-8x7b-32768" },
    ],
  },
  {
    label: "Together AI",
    apiBaseUrl: "https://api.together.xyz/v1",
    models: [
      { value: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama-3.3-70B-Instruct-Turbo" },
      { value: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free", label: "DeepSeek-R1-Distill-Llama-70B-free" },
    ],
  },
  {
    label: "Mistral",
    apiBaseUrl: "https://api.mistral.ai/v1",
    models: [
      { value: "mistral-small-latest", label: "mistral-small-latest" },
      { value: "mistral-large-latest", label: "mistral-large-latest" },
      { value: "open-mistral-nemo", label: "open-mistral-nemo" },
    ],
  },
  {
    label: "OpenRouter",
    apiBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      { value: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini" },
      { value: "openai/gpt-4o", label: "openai/gpt-4o" },
      { value: "anthropic/claude-3.5-sonnet", label: "anthropic/claude-3.5-sonnet" },
      { value: "google/gemini-pro-1.5", label: "google/gemini-pro-1.5" },
    ],
  },
  {
    label: "xAI Grok",
    apiBaseUrl: "https://api.x.ai/v1",
    models: [
      { value: "grok-2-latest", label: "grok-2-latest" },
      { value: "grok-2-vision-latest", label: "grok-2-vision-latest" },
    ],
  },
  {
    label: "Fireworks",
    apiBaseUrl: "https://api.fireworks.ai/inference/v1",
    models: [
      { value: "accounts/fireworks/models/llama-v3p3-70b-instruct", label: "Llama 3.3 70B Instruct" },
      { value: "accounts/fireworks/models/deepseek-r1-0528", label: "DeepSeek R1" },
    ],
  },
  {
    label: "Perplexity（OpenAI 兼容）",
    apiBaseUrl: "https://api.perplexity.ai",
    models: [
      { value: "sonar", label: "sonar" },
      { value: "sonar-pro", label: "sonar-pro" },
    ],
  },
];

const PRESET_MODELS = PRESET_GROUPS.flatMap((g) =>
  g.models.map((m) => ({ value: m.value, label: m.label, apiBaseUrl: g.apiBaseUrl }))
);

function presetEntryByValue(value: string) {
  return PRESET_MODELS.find((p) => p.value === value);
}

type SettingsPayload = {
  api_base_url: string;
  model: string;
  global_prompt: string;
  enabled: boolean;
  api_key_set: boolean;
  updated_at: string | null;
};
type DefaultsPayload = {
  global_prompt: string;
};

export function AiSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<string | null>(null);

  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [modelCustom, setModelCustom] = useState("");
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [defaultGlobalPrompt, setDefaultGlobalPrompt] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setTestOk(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/settings", { credentials: "include" });
      const data = (await res.json()) as {
        settings?: SettingsPayload | null;
        defaults?: DefaultsPayload;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      if (data.defaults) {
        setDefaultGlobalPrompt(data.defaults.global_prompt ?? "");
      }
      const s = data.settings;
      if (s) {
        setApiBaseUrl(s.api_base_url || "https://api.openai.com/v1");
        const m = s.model || "gpt-4o-mini";
        const presetHit = presetEntryByValue(m);
        if (presetHit) {
          setModel(m);
          setUseCustomModel(false);
          setModelCustom("");
        } else {
          setModel("gpt-4o-mini");
          setUseCustomModel(true);
          setModelCustom(m);
        }
        setGlobalPrompt(s.global_prompt ?? "");
        setEnabled(s.enabled !== false);
        setHasStoredKey(!!s.api_key_set);
      } else {
        setGlobalPrompt("");
        setHasStoredKey(false);
      }
      setApiKeyInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setTestOk(null);
    try {
      const resolvedModel = useCustomModel ? modelCustom.trim() || model : model;
      const body: Record<string, unknown> = {
        api_base_url: apiBaseUrl.trim(),
        model: resolvedModel,
        global_prompt: globalPrompt,
        enabled,
      };
      if (apiKeyInput.trim()) {
        body.api_key = apiKeyInput.trim();
      }
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setApiKeyInput("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onClearKey() {
    if (!window.confirm("确定清除已保存的 API Key？")) return;
    setSaving(true);
    setError(null);
    setTestOk(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_base_url: apiBaseUrl.trim(),
          model: useCustomModel ? modelCustom.trim() || model : model,
          global_prompt: globalPrompt,
          enabled,
          clear_api_key: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "清除失败");
      setApiKeyInput("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "清除失败");
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setError(null);
    setTestOk(null);
    try {
      const body: Record<string, string> = {
        api_base_url: apiBaseUrl.trim(),
        model: (useCustomModel ? modelCustom.trim() : "") || model,
      };
      if (apiKeyInput.trim()) {
        body.api_key = apiKeyInput.trim();
      }
      const res = await fetch("/api/ai/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "测试失败");
      setTestOk(data.message ?? "连接成功");
    } catch (e) {
      setError(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-zinc-600">加载中...</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-cyan-50 px-4 py-3.5 shadow-sm shadow-emerald-900/5">
        <p className="text-sm text-zinc-700">
          使用与 OpenAI 兼容的 <code className="rounded bg-white/80 px-1 text-xs">/v1/chat/completions</code>{" "}
          接口。密钥仅保存在你的账户下，请求经本站服务端转发，不会把 Key 返回给浏览器。
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <form onSubmit={onSave} className="space-y-5">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-900">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 rounded border-zinc-300"
          />
          启用大模型能力（关闭后任务表单不再显示 AI 识别）
        </label>

        <div className="space-y-2">
          <span className="text-sm font-medium text-zinc-900">模型</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                checked={!useCustomModel}
                onChange={() => {
                  const fromCustom = modelCustom.trim();
                  const match =
                    presetEntryByValue(fromCustom) ??
                    presetEntryByValue(model) ??
                    PRESET_MODELS[0];
                  setUseCustomModel(false);
                  setModel(match.value);
                  setApiBaseUrl(match.apiBaseUrl);
                  setModelCustom("");
                }}
                name="model-mode"
              />
              预设（自动填 API 地址）
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                checked={useCustomModel}
                onChange={() => setUseCustomModel(true)}
                name="model-mode"
              />
              自定义模型 ID
            </label>
          </div>
          {!useCustomModel ? (
            <>
              <select
                value={model}
                onChange={(e) => {
                  const v = e.target.value;
                  setModel(v);
                  const p = presetEntryByValue(v);
                  if (p) setApiBaseUrl(p.apiBaseUrl);
                }}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25"
              >
                {PRESET_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.models.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-zinc-500">
                切换预设模型时会自动写入该厂商的默认 API 根路径；若使用代理或自建网关，可在下方手动改地址。
              </p>
            </>
          ) : (
            <input
              value={modelCustom}
              onChange={(e) => setModelCustom(e.target.value)}
              placeholder="例如自建 vLLM 的模型名"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25"
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900" htmlFor="ai-base">
            API 地址（根路径，勿带 /chat/completions）
          </label>
          <input
            id="ai-base"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900" htmlFor="ai-key">
            API Key
          </label>
          <input
            id="ai-key"
            type="password"
            autoComplete="off"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={hasStoredKey ? "已保存密钥，留空不修改；填写则覆盖" : "sk-..."}
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25"
          />
          {hasStoredKey ? (
            <p className="text-xs text-zinc-500">当前已保存密钥。可填写新 Key 覆盖，或使用下方按钮清除。</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900" htmlFor="ai-prompt">
            全局提示词（系统指令，会附加在任务拆分提示前）
          </label>
          <p className="text-xs text-zinc-500">
            任务类型与领域名称由系统在识别时从「分类与领域」配置自动拉取并注入模型，无需、也不应在本框中重复列举。
          </p>
          <textarea
            id="ai-prompt"
            value={globalPrompt}
            onChange={(e) => setGlobalPrompt(e.target.value)}
            rows={10}
            placeholder="默认值由数据库 ai_prompt_defaults.global_prompt 提供"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setGlobalPrompt(defaultGlobalPrompt)}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              恢复系统默认
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={testing || saving}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            {testing ? "测试中..." : "测试连接"}
          </button>
          {hasStoredKey ? (
            <button
              type="button"
              onClick={() => void onClearKey()}
              disabled={saving || testing}
              className="h-10 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              清除已存 Key
            </button>
          ) : null}
        </div>
        {testOk ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {testOk}
          </div>
        ) : null}

        <div className="border-t border-zinc-100 pt-4">
          <button
            type="submit"
            disabled={saving || testing}
            className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </form>
    </div>
  );
}
