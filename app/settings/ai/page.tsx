"use client";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

import { AiSettingsClient } from "./ai-settings-client";

export default function AiSettingsPage() {
  return (
    <RequireAuth>
      <AppShell
        title="设置"
        subtitle="大模型 API — 用于任务创建/编辑时的智能拆分（OpenAI 兼容接口）。"
      >
        <AiSettingsClient />
      </AppShell>
    </RequireAuth>
  );
}
