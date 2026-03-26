"use client";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

import { ReportsClient } from "./reports-client";

export default function ReportsPage() {
  return (
    <RequireAuth>
      <AppShell title="报告生成" subtitle="按项目与时间范围，一键生成工作汇报或服务报告。">
        <ReportsClient />
      </AppShell>
    </RequireAuth>
  );
}
