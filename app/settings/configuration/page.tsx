"use client";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

import { ConfigurationClient } from "./configuration-client";

export default function ConfigurationPage() {
  return (
    <RequireAuth>
      <AppShell
        title="设置"
        subtitle="分类与领域 · 全局项只读；个人项可在此管理。"
      >
        <ConfigurationClient />
      </AppShell>
    </RequireAuth>
  );
}
