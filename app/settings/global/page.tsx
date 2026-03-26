"use client";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

import { GlobalConfigClient } from "./global-config-client";

export default function GlobalConfigPage() {
  return (
    <RequireAuth>
      <AppShell
        title="全局配置"
        subtitle="全局分类与领域、系统默认提示词与报告模板；进入前需验证管理员密码。"
      >
        <GlobalConfigClient />
      </AppShell>
    </RequireAuth>
  );
}
