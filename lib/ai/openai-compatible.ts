export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function postChatCompletions(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  /** 部分模型不支持 json_object，失败时会自动重试不带该字段 */
  preferJsonObject?: boolean;
}): Promise<{ content: string }> {
  const endpoint = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const tryOnce = async (jsonMode: boolean) => {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: 0.25,
    };
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`接口返回非 JSON（HTTP ${res.status}）`);
    }
    if (!res.ok) {
      const errMsg =
        typeof data === "object" && data && "error" in data
          ? JSON.stringify((data as { error: unknown }).error)
          : text.slice(0, 400);
      throw new Error(`大模型请求失败（${res.status}）：${errMsg}`);
    }
    const obj = data as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = obj.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("大模型响应格式异常：缺少 choices[0].message.content");
    }
    return { content };
  };

  if (params.preferJsonObject) {
    try {
      return await tryOnce(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("response_format") || msg.includes("json_object") || msg.includes("400")) {
        return tryOnce(false);
      }
      throw e;
    }
  }

  return tryOnce(false);
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1]!.trim() : t;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型输出中未找到 JSON 对象");
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("解析结果不是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

export function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}
